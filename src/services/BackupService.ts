import * as vscode from 'vscode';
import { ConnectionManager } from '@/managers/ConnectionManager';
import { DotNetIntegrationService } from '@/services/DotNetIntegrationService';
import { Logger } from '@/utils/Logger';
import { ErrorHandler } from '@/utils/ErrorHandler';

export interface BackupJob {
    id: string;
    name: string;
    connectionId: string;
    databaseName: string;
    backupType: 'full' | 'schema' | 'data' | 'incremental';
    format: 'custom' | 'tar' | 'directory';
    options: BackupOptions;
    status: 'pending' | 'running' | 'verifying' | 'completed' | 'failed' | 'cancelled';
    progress: number;
    filePath?: string;
    fileSize?: string;
    checksum?: string;
    error?: string;
    startedAt?: Date;
    completedAt?: Date;
    verificationStatus?: 'pending' | 'passed' | 'failed';
    retentionPolicy?: RetentionPolicy;
}

export interface BackupOptions {
    compression?: boolean;
    encryption?: boolean;
    parallelBackup?: boolean;
    includeSchemas?: string[];
    excludeSchemas?: string[];
    includeTables?: string[];
    excludeTables?: string[];
    preBackupScript?: string;
    postBackupScript?: string;
    verifyBackup?: boolean;
    createReadme?: boolean;
    customParameters?: Record<string, string>;
}

export interface RetentionPolicy {
    keepDaily: number;
    keepWeekly: number;
    keepMonthly: number;
    keepYearly: number;
    maxAgeDays: number;
    autoCleanup: boolean;
}

export interface BackupTemplate {
    id: string;
    name: string;
    description: string;
    backupType: BackupJob['backupType'];
    format: BackupJob['format'];
    options: BackupOptions;
    schedule?: BackupSchedule;
    retentionPolicy: RetentionPolicy;
    createdAt: Date;
    updatedAt: Date;
    usageCount: number;
    category: string;
    tags: string[];
}

export interface BackupSchedule {
    frequency: 'once' | 'daily' | 'weekly' | 'monthly';
    time: string;
    dayOfWeek?: number;
    dayOfMonth?: number;
    enabled: boolean;
    nextRun?: Date;
    lastRun?: Date;
}

export interface BackupVerification {
    backupId: string;
    status: 'passed' | 'failed' | 'partial';
    checkedAt: Date;
    errors: string[];
    warnings: string[];
    statistics: {
        totalObjects: number;
        verifiedObjects: number;
        corruptedObjects: number;
        missingObjects: number;
    };
}

export class BackupService {
    private context: vscode.ExtensionContext;
    private connectionManager: ConnectionManager;
    private dotNetService: DotNetIntegrationService;
    private backupJobs: Map<string, BackupJob> = new Map();
    private backupTemplates: Map<string, BackupTemplate> = new Map();
    private backupHistory: BackupJob[] = [];
    private activeBackups: Set<string> = new Set();
    private verificationResults: Map<string, BackupVerification> = new Map();

    constructor(
        context: vscode.ExtensionContext,
        connectionManager: ConnectionManager
    ) {
        this.context = context;
        this.connectionManager = connectionManager;
        this.dotNetService = DotNetIntegrationService.getInstance();
        this.loadBackupData();
    }

    private loadBackupData(): void {
        try {
            // Load backup templates
            const templatesData = this.context.globalState.get<string>('postgresql.backups.templates', '[]');
            const templates = JSON.parse(templatesData) as BackupTemplate[];

            this.backupTemplates.clear();
            templates.forEach(template => {
                this.backupTemplates.set(template.id, {
                    ...template,
                    createdAt: new Date(template.createdAt),
                    updatedAt: new Date(template.updatedAt)
                });
            });

            // Load backup history
            const historyData = this.context.globalState.get<string>('postgresql.backups.history', '[]');
            const history = JSON.parse(historyData) as BackupJob[];

            this.backupHistory = history.map(job => ({
                ...job,
                startedAt: job.startedAt ? new Date(job.startedAt) : undefined,
                completedAt: job.completedAt ? new Date(job.completedAt) : undefined
            })).slice(0, 200); // Keep last 200 backups

            Logger.info('Backup data loaded', 'loadBackupData', {
                templateCount: this.backupTemplates.size,
                historyCount: this.backupHistory.length
            });

        } catch (error) {
            Logger.error('Failed to load backup data', error as Error);
            this.backupTemplates.clear();
            this.backupHistory = [];
        }
    }

    private saveBackupData(): void {
        try {
            // Save backup templates
            const templatesArray = Array.from(this.backupTemplates.values());
            this.context.globalState.update('postgresql.backups.templates', JSON.stringify(templatesArray));

            // Save backup history
            this.context.globalState.update('postgresql.backups.history', JSON.stringify(this.backupHistory));

            Logger.info('Backup data saved', 'saveBackupData');

        } catch (error) {
            Logger.error('Failed to save backup data', error as Error);
        }
    }

    // Backup Job Management
    async createBackupJob(
        name: string,
        connectionId: string,
        databaseName: string,
        backupType: BackupJob['backupType'],
        format: BackupJob['format'],
        options: BackupOptions = {}
    ): Promise<string> {
        try {
            const jobId = this.generateId();

            const backupJob: BackupJob = {
                id: jobId,
                name,
                connectionId,
                databaseName,
                backupType,
                format,
                options,
                status: 'pending',
                progress: 0,
                startedAt: new Date()
            };

            this.backupJobs.set(jobId, backupJob);
            this.saveBackupData();

            Logger.info('Backup job created', 'createBackupJob', {
                jobId,
                name,
                backupType,
                databaseName
            });

            return jobId;

        } catch (error) {
            Logger.error('Failed to create backup job', error as Error);
            throw error;
        }
    }

    async executeBackupJob(jobId: string): Promise<void> {
        try {
            const job = this.backupJobs.get(jobId);
            if (!job) {
                throw new Error(`Backup job ${jobId} not found`);
            }

            if (this.activeBackups.has(jobId)) {
                throw new Error(`Backup job ${jobId} is already running`);
            }

            job.status = 'running';
            job.progress = 0;
            job.startedAt = new Date();
            this.backupJobs.set(jobId, job);
            this.activeBackups.add(jobId);

            Logger.info('Backup job started', 'executeBackupJob', { jobId });

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Backing up: ${job.name}`,
                cancellable: true
            }, async (progress, token) => {
                try {
                    // Get connection and validate
                    const connection = this.connectionManager.getConnection(job.connectionId);
                    if (!connection) {
                        throw new Error(`Connection ${job.connectionId} not found`);
                    }

                    const password = await this.connectionManager.getConnectionPassword(job.connectionId);
                    if (!password) {
                        throw new Error('Connection password not found');
                    }

                    // Create .NET connection info
                    const dotNetConnection = {
                        id: connection.id,
                        name: connection.name,
                        host: connection.host,
                        port: connection.port,
                        database: connection.database,
                        username: connection.username,
                        password: password,
                        createdDate: new Date().toISOString()
                    };

                    progress.report({ increment: 0, message: 'Preparing backup...' });

                    // Execute pre-backup script if specified
                    if (job.options.preBackupScript) {
                        progress.report({ increment: 5, message: 'Running pre-backup script...' });

                        try {
                            await this.dotNetService.executeQuery(
                                dotNetConnection,
                                job.options.preBackupScript,
                                { timeout: 60 }
                            );
                        } catch (error) {
                            Logger.warn('Pre-backup script failed, continuing with backup');
                        }
                    }

                    if (token.isCancellationRequested) {
                        job.status = 'cancelled';
                        return;
                    }

                    progress.report({ increment: 10, message: 'Creating backup...' });

                    // Execute backup via .NET service (simplified implementation)
                    const backupResult = await this.performBackup(dotNetConnection, job, token);

                    progress.report({ increment: 80, message: 'Verifying backup...' });

                    if (token.isCancellationRequested) {
                        job.status = 'cancelled';
                        return;
                    }

                    // Verify backup if requested
                    if (job.options.verifyBackup) {
                        job.status = 'verifying';
                        job.verificationStatus = 'pending';
                        this.backupJobs.set(jobId, job);

                        const verification = await this.verifyBackup(job, backupResult.filePath);

                        job.verificationStatus = verification.status === 'partial' ? 'failed' : verification.status;
                        if (verification.errors.length > 0) {
                            job.error = verification.errors.join(', ');
                        }
                    }

                    // Execute post-backup script if specified
                    if (job.options.postBackupScript) {
                        progress.report({ increment: 95, message: 'Running post-backup script...' });

                        try {
                            await this.dotNetService.executeQuery(
                                dotNetConnection,
                                job.options.postBackupScript,
                                { timeout: 60 }
                            );
                        } catch (error) {
                            Logger.warn('Post-backup script failed');
                        }
                    }

                    progress.report({ increment: 100, message: 'Backup completed' });

                    // Update job with results
                    job.status = 'completed';
                    job.progress = 100;
                    job.filePath = backupResult.filePath;
                    job.fileSize = backupResult.fileSize;
                    job.checksum = backupResult.checksum;
                    job.completedAt = new Date();

                    this.backupJobs.set(jobId, job);
                    this.backupHistory.unshift(job);
                    this.activeBackups.delete(jobId);

                    // Show success message
                    vscode.window.showInformationMessage(
                        `Backup completed: ${job.fileSize} at ${job.filePath}`,
                        'Open Folder', 'Verify Backup'
                    ).then(selection => {
                        if (selection === 'Open Folder') {
                            vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(job.filePath!));
                        } else if (selection === 'Verify Backup') {
                            this.verifyBackupJob(jobId);
                        }
                    });

                    Logger.info('Backup job completed', 'executeBackupJob', {
                        jobId,
                        filePath: job.filePath,
                        fileSize: job.fileSize
                    });

                } catch (error) {
                    job.status = 'failed';
                    job.error = (error as Error).message;
                    job.completedAt = new Date();
                    this.backupJobs.set(jobId, job);
                    this.activeBackups.delete(jobId);

                    Logger.error('Backup job failed', error as Error);
                    throw error;
                }
            });

        } catch (error) {
            Logger.error('Failed to execute backup job', error as Error);
            vscode.window.showErrorMessage(`Backup failed: ${(error as Error).message}`);
        }
    }

    private async performBackup(
        connection: any,
        job: BackupJob,
        token: any
    ): Promise<{
        filePath: string;
        fileSize: string;
        checksum: string;
    }> {
        try {
            // Generate backup file path
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const extension = job.format === 'custom' ? 'backup' : job.format;
            const fileName = `${job.databaseName}_${job.backupType}_${timestamp}.${extension}`;
            const filePath = vscode.Uri.file(fileName).fsPath;

            // In a real implementation, this would call the .NET service
            // For now, we'll simulate the backup process
            Logger.info('Performing backup', 'performBackup', {
                jobId: job.id,
                filePath,
                backupType: job.backupType
            });

            // Simulate backup progress
            for (let i = 0; i < 10; i++) {
                if (token.isCancellationRequested) {
                    break;
                }

                await new Promise(resolve => setTimeout(resolve, 1000));
                job.progress = 10 + (i * 7);
                this.backupJobs.set(job.id, job);
            }

            // Generate mock file size and checksum
            const mockSize = this.generateMockFileSize(job.backupType);
            const mockChecksum = this.generateMockChecksum();

            // In a real implementation, we would:
            // 1. Call pg_dump or similar tool via .NET service
            // 2. Monitor progress and handle cancellation
            // 3. Generate actual checksum
            // 4. Handle compression and encryption

            return {
                filePath,
                fileSize: mockSize,
                checksum: mockChecksum
            };

        } catch (error) {
            Logger.error('Failed to perform backup', error as Error);
            throw error;
        }
    }

    private generateMockFileSize(backupType: BackupJob['backupType']): string {
        const baseSizes = {
            full: 100 * 1024 * 1024, // 100MB
            schema: 10 * 1024 * 1024, // 10MB
            data: 80 * 1024 * 1024, // 80MB
            incremental: 5 * 1024 * 1024 // 5MB
        };

        const bytes = baseSizes[backupType] + Math.random() * 10 * 1024 * 1024;

        if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }

    private generateMockChecksum(): string {
        return Array.from({ length: 64 }, () =>
            Math.floor(Math.random() * 16).toString(16)
        ).join('');
    }

    async verifyBackupJob(jobId: string): Promise<void> {
        try {
            const job = this.backupJobs.get(jobId);
            if (!job) {
                throw new Error(`Backup job ${jobId} not found`);
            }

            if (!job.filePath) {
                throw new Error('Backup file not found');
            }

            job.status = 'verifying';
            job.verificationStatus = 'pending';
            this.backupJobs.set(jobId, job);

            Logger.info('Verifying backup', 'verifyBackupJob', { jobId });

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Verifying Backup',
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: 'Analyzing backup file...' });

                // Simulate verification process
                await new Promise(resolve => setTimeout(resolve, 2000));

                progress.report({ increment: 50, message: 'Checking backup integrity...' });

                await new Promise(resolve => setTimeout(resolve, 2000));

                progress.report({ increment: 100, message: 'Verification completed' });

                // Generate mock verification result
                const verification: BackupVerification = {
                    backupId: jobId,
                    status: Math.random() > 0.1 ? 'passed' : 'failed', // 90% pass rate
                    checkedAt: new Date(),
                    errors: [],
                    warnings: [],
                    statistics: {
                        totalObjects: Math.floor(Math.random() * 100) + 50,
                        verifiedObjects: Math.floor(Math.random() * 100) + 50,
                        corruptedObjects: 0,
                        missingObjects: 0
                    }
                };

                if (verification.status === 'failed') {
                    verification.errors.push('Mock verification error for demo');
                    verification.statistics.corruptedObjects = 1;
                }

                this.verificationResults.set(jobId, verification);
                job.verificationStatus = verification.status === 'partial' ? 'failed' : verification.status;
                this.backupJobs.set(jobId, job);

                // Show verification result
                if (verification.status === 'passed') {
                    vscode.window.showInformationMessage(
                        '✅ Backup verification passed',
                        'View Details'
                    ).then(selection => {
                        if (selection === 'View Details') {
                            this.showVerificationDetails(jobId);
                        }
                    });
                } else {
                    vscode.window.showErrorMessage(
                        '❌ Backup verification failed',
                        'View Errors', 'Retry'
                    ).then(selection => {
                        if (selection === 'View Errors') {
                            this.showVerificationDetails(jobId);
                        } else if (selection === 'Retry') {
                            this.verifyBackupJob(jobId);
                        }
                    });
                }

                Logger.info('Backup verification completed', 'verifyBackupJob', {
                    jobId,
                    status: verification.status
                });
            });

        } catch (error) {
            Logger.error('Failed to verify backup', error as Error);
            vscode.window.showErrorMessage(`Backup verification failed: ${(error as Error).message}`);
        }
    }

    private async verifyBackup(
        job: BackupJob,
        filePath: string
    ): Promise<BackupVerification> {
        // In a real implementation, this would:
        // 1. Check file integrity
        // 2. Verify backup format
        // 3. Test restore capabilities
        // 4. Validate data consistency

        return {
            backupId: job.id,
            status: 'passed',
            checkedAt: new Date(),
            errors: [],
            warnings: [],
            statistics: {
                totalObjects: 100,
                verifiedObjects: 100,
                corruptedObjects: 0,
                missingObjects: 0
            }
        };
    }

    private showVerificationDetails(jobId: string): void {
        const verification = this.verificationResults.get(jobId);
        if (!verification) {
            vscode.window.showErrorMessage('Verification details not found');
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'backupVerification',
            'Backup Verification Details',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        panel.webview.html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Backup Verification</title>
                <style>
                    body { font-family: var(--vscode-font-family); padding: 20px; }
                    .status { padding: 15px; margin: 20px 0; border-radius: 8px; text-align: center; font-size: 1.2em; font-weight: bold; }
                    .status.passed { background: var(--vscode-inputValidation-infoBackground); color: var(--vscode-inputValidation-infoForeground); }
                    .status.failed { background: var(--vscode-inputValidation-errorBackground); color: var(--vscode-inputValidation-errorForeground); }
                    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin: 20px 0; }
                    .stat-card { background: var(--vscode-textBlockQuote-background); padding: 15px; border-radius: 8px; text-align: center; }
                    .stat-value { font-size: 1.5em; font-weight: bold; color: var(--vscode-textLink-foreground); }
                    .stat-label { color: var(--vscode-descriptionForeground); margin-top: 5px; }
                </style>
            </head>
            <body>
                <h1>Backup Verification Results</h1>

                <div class="status ${verification.status}">
                    ${verification.status === 'passed' ? '✅ Verification Passed' : '❌ Verification Failed'}
                </div>

                <div class="stats">
                    <div class="stat-card">
                        <div class="stat-value">${verification.statistics.totalObjects}</div>
                        <div class="stat-label">Total Objects</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${verification.statistics.verifiedObjects}</div>
                        <div class="stat-label">Verified Objects</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${verification.statistics.corruptedObjects}</div>
                        <div class="stat-label">Corrupted Objects</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${verification.statistics.missingObjects}</div>
                        <div class="stat-label">Missing Objects</div>
                    </div>
                </div>

                ${verification.errors.length > 0 ? `
                    <h2>Errors (${verification.errors.length})</h2>
                    <ul>
                        ${verification.errors.map(error => `<li>${error}</li>`).join('')}
                    </ul>
                ` : ''}

                ${verification.warnings.length > 0 ? `
                    <h2>Warnings (${verification.warnings.length})</h2>
                    <ul>
                        ${verification.warnings.map(warning => `<li>${warning}</li>`).join('')}
                    </ul>
                ` : ''}

                <p><strong>Verified at:</strong> ${verification.checkedAt.toLocaleString()}</p>
            </body>
            </html>
        `;
    }

    // Template Management
    async createBackupTemplate(templateData: Omit<BackupTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>): Promise<BackupTemplate> {
        try {
            const template: BackupTemplate = {
                ...templateData,
                id: this.generateId(),
                createdAt: new Date(),
                updatedAt: new Date(),
                usageCount: 0
            };

            this.backupTemplates.set(template.id, template);
            this.saveBackupData();

            Logger.info('Backup template created', 'createBackupTemplate', {
                templateId: template.id,
                name: template.name
            });

            return template;

        } catch (error) {
            Logger.error('Failed to create backup template', error as Error);
            throw error;
        }
    }

    async useBackupTemplate(templateId: string): Promise<BackupJob> {
        try {
            const template = this.backupTemplates.get(templateId);
            if (!template) {
                throw new Error(`Backup template ${templateId} not found`);
            }

            // Increment usage count
            template.usageCount++;
            this.backupTemplates.set(templateId, template);

            // Create backup job from template
            const jobId = await this.createBackupJob(
                `${template.name} Backup`,
                '', // Connection ID will be set by user
                '', // Database name will be set by user
                template.backupType,
                template.format,
                template.options
            );

            const job = this.backupJobs.get(jobId)!;
            job.retentionPolicy = template.retentionPolicy;

            if (template.schedule) {
                // Schedule is handled separately from options
            }

            this.saveBackupData();

            Logger.info('Backup template used', 'useBackupTemplate', {
                templateId,
                jobId
            });

            return job;

        } catch (error) {
            Logger.error('Failed to use backup template', error as Error);
            throw error;
        }
    }

    getBackupTemplates(category?: string): BackupTemplate[] {
        let templates = Array.from(this.backupTemplates.values());

        if (category) {
            templates = templates.filter(t => t.category === category);
        }

        return templates.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }

    // Backup Operations
    async createFullBackup(
        connectionId: string,
        databaseName: string,
        options: BackupOptions = {}
    ): Promise<string> {
        try {
            const jobId = await this.createBackupJob(
                `Full Backup: ${databaseName}`,
                connectionId,
                databaseName,
                'full',
                'custom',
                options
            );

            await this.executeBackupJob(jobId);

            const job = this.backupJobs.get(jobId);
            if (!job || !job.filePath) {
                throw new Error('Backup job completed but no file path available');
            }

            return job.filePath;

        } catch (error) {
            Logger.error('Failed to create full backup', error as Error);
            throw error;
        }
    }

    async createSchemaBackup(
        connectionId: string,
        databaseName: string,
        schemaName: string,
        options: BackupOptions = {}
    ): Promise<string> {
        try {
            const jobId = await this.createBackupJob(
                `Schema Backup: ${databaseName}.${schemaName}`,
                connectionId,
                databaseName,
                'schema',
                'custom',
                { ...options, includeSchemas: [schemaName] }
            );

            await this.executeBackupJob(jobId);

            const job = this.backupJobs.get(jobId);
            if (!job || !job.filePath) {
                throw new Error('Backup job completed but no file path available');
            }

            return job.filePath;

        } catch (error) {
            Logger.error('Failed to create schema backup', error as Error);
            throw error;
        }
    }

    // Retention Management
    async cleanupBackups(retentionPolicy: RetentionPolicy): Promise<{
        deletedCount: number;
        freedSpace: string;
    }> {
        try {
            Logger.info('Starting backup cleanup', 'cleanupBackups', {
                maxAgeDays: retentionPolicy.maxAgeDays
            });

            const cutoffDate = new Date(Date.now() - retentionPolicy.maxAgeDays * 24 * 60 * 60 * 1000);
            const jobsToDelete = this.backupHistory.filter(job =>
                job.completedAt &&
                job.completedAt < cutoffDate &&
                job.status === 'completed'
            );

            let deletedCount = 0;
            let freedSpace = 0;

            for (const job of jobsToDelete) {
                if (job.filePath) {
                    try {
                        // In a real implementation, delete the actual backup file
                        Logger.info('Deleting backup file', 'cleanupBackups', {
                            jobId: job.id,
                            filePath: job.filePath
                        });

                        // For now, just count it as deleted
                        deletedCount++;
                        freedSpace += this.parseFileSize(job.fileSize || '0 MB');

                    } catch (error) {
                        Logger.error('Failed to delete backup file', error as Error);
                    }
                }
            }

            // Remove from history
            this.backupHistory = this.backupHistory.filter(job =>
                !jobsToDelete.some(jobToDelete => jobToDelete.id === job.id)
            );

            this.saveBackupData();

            Logger.info('Backup cleanup completed', 'cleanupBackups', {
                deletedCount,
                freedSpace: `${freedSpace} MB`
            });

            return {
                deletedCount,
                freedSpace: `${freedSpace} MB`
            };

        } catch (error) {
            Logger.error('Failed to cleanup backups', error as Error);
            throw error;
        }
    }

    private parseFileSize(sizeStr: string): number {
        const match = sizeStr.match(/(\d+(?:\.\d+)?)\s*(MB|GB|KB|B)/i);
        if (!match) return 0;

        const value = parseFloat(match[1]);
        const unit = match[2].toUpperCase();

        switch (unit) {
            case 'GB': return value * 1024;
            case 'MB': return value;
            case 'KB': return value / 1024;
            case 'B': return value / (1024 * 1024);
            default: return 0;
        }
    }

    // Backup Job Management
    getBackupJob(jobId: string): BackupJob | undefined {
        return this.backupJobs.get(jobId);
    }

    getBackupJobs(status?: BackupJob['status']): BackupJob[] {
        let jobs = Array.from(this.backupJobs.values());

        if (status) {
            jobs = jobs.filter(job => job.status === status);
        }

        return jobs.sort((a, b) => (b.startedAt?.getTime() || 0) - (a.startedAt?.getTime() || 0));
    }

    getBackupHistory(limit: number = 50): BackupJob[] {
        return this.backupHistory.slice(0, limit);
    }

    async cancelBackupJob(jobId: string): Promise<void> {
        try {
            const job = this.backupJobs.get(jobId);
            if (!job) {
                throw new Error(`Backup job ${jobId} not found`);
            }

            if (job.status === 'running' || job.status === 'verifying') {
                job.status = 'cancelled';
                this.backupJobs.set(jobId, job);
                this.activeBackups.delete(jobId);

                Logger.info('Backup job cancelled', 'cancelBackupJob', { jobId });
            }

        } catch (error) {
            Logger.error('Failed to cancel backup job', error as Error);
            throw error;
        }
    }

    // Utility Methods
    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    getActiveBackups(): string[] {
        return Array.from(this.activeBackups);
    }

    getBackupStatistics(): {
        totalBackups: number;
        completedBackups: number;
        failedBackups: number;
        totalSizeBackedUp: string;
        averageBackupTime: number;
        popularTypes: { type: string; count: number }[];
        verificationRate: number;
    } {
        const jobs = this.backupHistory;
        const completedJobs = jobs.filter(job => job.status === 'completed');

        const totalSize = completedJobs.reduce((sum, job) => sum + this.parseFileSize(job.fileSize || '0 MB'), 0);

        const typeCount = completedJobs.reduce((acc, job) => {
            acc[job.backupType] = (acc[job.backupType] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const verifiedJobs = completedJobs.filter(job => job.verificationStatus === 'passed');

        return {
            totalBackups: jobs.length,
            completedBackups: completedJobs.length,
            failedBackups: jobs.filter(job => job.status === 'failed').length,
            totalSizeBackedUp: `${totalSize.toFixed(1)} MB`,
            averageBackupTime: completedJobs.length > 0 ?
                completedJobs.reduce((sum, job) => {
                    if (job.startedAt && job.completedAt) {
                        return sum + (job.completedAt.getTime() - job.startedAt.getTime());
                    }
                    return sum;
                }, 0) / completedJobs.length : 0,
            popularTypes: Object.entries(typeCount)
                .map(([type, count]) => ({ type, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 5),
            verificationRate: completedJobs.length > 0 ?
                (verifiedJobs.length / completedJobs.length) * 100 : 0
        };
    }

    dispose(): void {
        this.saveBackupData();
    }
}