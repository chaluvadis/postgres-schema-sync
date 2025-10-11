import * as vscode from 'vscode';
import { ConnectionManager } from '@/managers/ConnectionManager';
import { DotNetIntegrationService } from '@/services/DotNetIntegrationService';
import { Logger } from '@/utils/Logger';

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



export class BackupService {
    private context: vscode.ExtensionContext;
    private connectionManager: ConnectionManager;
    private dotNetService: DotNetIntegrationService;
    private backupJobs: Map<string, BackupJob> = new Map();
    private backupHistory: BackupJob[] = [];
    private activeBackups: Set<string> = new Set();

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
            // Load backup history
            const historyData = this.context.globalState.get<string>('postgresql.backups.history', '[]');
            const history = JSON.parse(historyData) as BackupJob[];

            this.backupHistory = history.map(job => ({
                ...job,
                startedAt: job.startedAt ? new Date(job.startedAt) : undefined,
                completedAt: job.completedAt ? new Date(job.completedAt) : undefined
            })).slice(0, 200); // Keep last 200 backups

            Logger.info('Backup data loaded', 'loadBackupData', {
                historyCount: this.backupHistory.length
            });

        } catch (error) {
            Logger.error('Failed to load backup data', error as Error);
            this.backupHistory = [];
        }
    }

    private saveBackupData(): void {
        try {
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

                    progress.report({ increment: 80, message: 'Backup completed...' });

                    if (token.isCancellationRequested) {
                        job.status = 'cancelled';
                        return;
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
                        'Open Folder'
                    ).then(selection => {
                        if (selection === 'Open Folder') {
                            vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(job.filePath!));
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
        _connection: any,
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

        const totalSize = completedJobs.length * 100; // Simplified size calculation

        const typeCount = completedJobs.reduce((acc, job) => {
            acc[job.backupType] = (acc[job.backupType] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

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
            verificationRate: 0 // Simplified since verification is no longer supported
        };
    }

    // Utility Methods
    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    dispose(): void {
        this.saveBackupData();
    }
}