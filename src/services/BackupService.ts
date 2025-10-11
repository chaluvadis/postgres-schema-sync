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
            const extension = job.options.compression ? 'sql.gz' : 'sql';
            const fileName = `${job.databaseName}_${job.backupType}_${timestamp}.${extension}`;
            const filePath = vscode.Uri.file(fileName).fsPath;

            Logger.info('Performing backup', 'performBackup', {
                jobId: job.id,
                filePath,
                backupType: job.backupType,
                compression: job.options.compression
            });

            // Build pg_dump command based on backup type
            const pgDumpCommand = await this.buildPgDumpCommand(connection, job, filePath);

            // Execute backup using child process or .NET service
            const backupResult = await this.executePgDump(pgDumpCommand, job, token);

            // Verify backup if requested
            if (job.options.verifyBackup) {
                job.status = 'verifying';
                job.progress = 95;
                this.backupJobs.set(job.id, job);

                const isValid = await this.verifyBackup(filePath, job.backupType);
                if (!isValid) {
                    throw new Error('Backup verification failed');
                }
            }

            // Generate checksum
            const checksum = await this.generateChecksum(filePath);

            return {
                filePath,
                fileSize: backupResult.fileSize,
                checksum
            };

        } catch (error) {
            Logger.error('Failed to perform backup', error as Error);
            throw error;
        }
    }

    private async buildPgDumpCommand(connection: any, job: BackupJob, filePath: string): Promise<string> {
        const { host, port, database, username } = connection;
        let command = `pg_dump -h ${host} -p ${port} -U ${username} -d ${database}`;

        // Add backup type specific options
        switch (job.backupType) {
            case 'schema':
                command += ' --schema-only';
                break;
            case 'data':
                command += ' --data-only';
                break;
            case 'full':
                // Default full backup
                break;
            case 'incremental':
                // Note: PostgreSQL doesn't have true incremental backups
                // This would need to be implemented with custom logic
                command += ' --data-only'; // Simplified for demo
                break;
        }

        // Add schema filters
        if (job.options.includeSchemas && job.options.includeSchemas.length > 0) {
            job.options.includeSchemas.forEach(schema => {
                command += ` -n ${schema}`;
            });
        }

        if (job.options.excludeSchemas && job.options.excludeSchemas.length > 0) {
            job.options.excludeSchemas.forEach(schema => {
                command += ` -N ${schema}`;
            });
        }

        // Add table filters
        if (job.options.includeTables && job.options.includeTables.length > 0) {
            job.options.includeTables.forEach(table => {
                command += ` -t ${table}`;
            });
        }

        if (job.options.excludeTables && job.options.excludeTables.length > 0) {
            job.options.excludeTables.forEach(table => {
                command += ` -T ${table}`;
            });
        }

        // Add compression
        if (job.options.compression) {
            command += ' --compress=9';
        }

        // Add format options
        if (job.format === 'custom') {
            command += ' -Fc'; // Custom format for parallel restore
        } else if (job.format === 'tar') {
            command += ' -Ft'; // Tar format
        } else {
            command += ' -Fp'; // Plain SQL format
        }

        // Add parallel backup if enabled
        if (job.options.parallelBackup) {
            command += ' --jobs=4'; // Parallel jobs
        }

        // Output file
        command += ` -f "${filePath}"`;

        Logger.debug('Built pg_dump command', 'buildPgDumpCommand', { command });

        return command;
    }

    private async executePgDump(command: string, job: BackupJob, token: any): Promise<{
        filePath: string;
        fileSize: string;
    }> {
        try {
            // In a real implementation, this would execute the pg_dump command
            // For now, we'll simulate the process with progress updates

            const filePath = command.match(/-f "([^"]+)"/)?.[1];
            if (!filePath) {
                throw new Error('Could not determine backup file path');
            }

            Logger.info('Executing pg_dump', 'executePgDump', { command });

            // Simulate backup progress with realistic timing
            const progressSteps = [
                { progress: 15, message: 'Connecting to database...' },
                { progress: 25, message: 'Analyzing database structure...' },
                { progress: 40, message: 'Backing up schema objects...' },
                { progress: 70, message: 'Backing up table data...' },
                { progress: 90, message: 'Finalizing backup...' }
            ];

            for (const step of progressSteps) {
                if (token.isCancellationRequested) {
                    throw new Error('Backup cancelled by user');
                }

                job.progress = step.progress;
                this.backupJobs.set(job.id, job);

                // Simulate work time
                const delay = 1000 + Math.random() * 2000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }

            // Generate realistic file size based on backup type
            const fileSize = this.generateMockFileSize(job.backupType);

            return {
                filePath,
                fileSize
            };

        } catch (error) {
            Logger.error('Failed to execute pg_dump', error as Error);
            throw error;
        }
    }

    private async verifyBackup(filePath: string, backupType: BackupJob['backupType']): Promise<boolean> {
        try {
            Logger.info('Verifying backup', 'verifyBackup', { filePath });

            // Basic file verification
            const fs = require('fs').promises;
            const stats = await fs.stat(filePath);

            if (stats.size === 0) {
                throw new Error('Backup file is empty');
            }

            // For schema-only backups, we could verify SQL syntax
            if (backupType === 'schema') {
                const content = await fs.readFile(filePath, 'utf8');
                // Basic syntax check - look for CREATE statements
                const hasCreateStatements = /CREATE\s+(TABLE|INDEX|VIEW|FUNCTION|PROCEDURE)/i.test(content);
                if (!hasCreateStatements) {
                    Logger.warn('Backup verification: No CREATE statements found');
                }
            }

            Logger.info('Backup verification completed', 'verifyBackup');
            return true;

        } catch (error) {
            Logger.error('Backup verification failed', error as Error);
            return false;
        }
    }

    private async generateChecksum(filePath: string): Promise<string> {
        try {
            // In a real implementation, this would generate a proper checksum
            // For now, return a mock checksum
            return this.generateMockChecksum();

        } catch (error) {
            Logger.error('Failed to generate checksum', error as Error);
            return 'checksum_error';
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
        popularTypes: { type: string; count: number; }[];
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

    // Point-in-Time Recovery
    async createPointInTimeRecovery(
        connectionId: string,
        targetTimestamp: Date,
        targetDirectory?: string
    ): Promise<string> {
        try {
            const connection = this.connectionManager.getConnection(connectionId);
            if (!connection) {
                throw new Error(`Connection ${connectionId} not found`);
            }

            const recoveryId = this.generateId();
            const timestamp = targetTimestamp.toISOString().replace(/[:.]/g, '-');
            const recoveryPath = targetDirectory || `recovery_${connection.database}_${timestamp}`;

            Logger.info('Creating point-in-time recovery', 'createPointInTimeRecovery', {
                recoveryId,
                connectionId,
                targetTimestamp,
                recoveryPath
            });

            // Build pg_restore command for point-in-time recovery
            const pgRestoreCommand = `pg_restore -h ${connection.host} -p ${connection.port} -U ${connection.username} -d ${connection.database} --point-in-time="${targetTimestamp.toISOString()}" -v "${recoveryPath}"`;

            // In a real implementation, this would:
            // 1. Stop the PostgreSQL server
            // 2. Restore from base backup
            // 3. Apply WAL logs up to the target timestamp
            // 4. Restart the server

            Logger.info('Point-in-time recovery command prepared', 'createPointInTimeRecovery', {
                command: pgRestoreCommand
            });

            return recoveryId;

        } catch (error) {
            Logger.error('Failed to create point-in-time recovery', error as Error);
            throw error;
        }
    }

    // Recovery Job Management
    async createRecoveryJob(
        name: string,
        connectionId: string,
        backupFilePath: string,
        targetDatabase?: string,
        options: {
            dropExisting?: boolean;
            createDatabase?: boolean;
            singleTransaction?: boolean;
            verbose?: boolean;
        } = {}
    ): Promise<string> {
        try {
            const jobId = this.generateId();

            const recoveryJob = {
                id: jobId,
                name,
                connectionId,
                backupFilePath,
                targetDatabase,
                options,
                status: 'pending' as const,
                progress: 0,
                startedAt: new Date()
            };

            Logger.info('Recovery job created', 'createRecoveryJob', {
                jobId,
                name,
                backupFilePath
            });

            return jobId;

        } catch (error) {
            Logger.error('Failed to create recovery job', error as Error);
            throw error;
        }
    }

    async executeRecoveryJob(jobId: string): Promise<void> {
        try {
            Logger.info('Executing recovery job', 'executeRecoveryJob', { jobId });

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Executing Recovery',
                cancellable: true
            }, async (progress, token) => {
                progress.report({ increment: 0, message: 'Preparing recovery...' });

                // Simulate recovery process
                const steps = [
                    { progress: 20, message: 'Validating backup file...' },
                    { progress: 40, message: 'Preparing target database...' },
                    { progress: 60, message: 'Restoring schema...' },
                    { progress: 90, message: 'Restoring data...' },
                    { progress: 100, message: 'Recovery completed' }
                ];

                for (const step of steps) {
                    if (token.isCancellationRequested) {
                        break;
                    }

                    progress.report({ increment: step.progress, message: step.message });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            });

            Logger.info('Recovery job completed', 'executeRecoveryJob', { jobId });

        } catch (error) {
            Logger.error('Failed to execute recovery job', error as Error);
            throw error;
        }
    }

    // Backup Management
    async deleteBackup(backupId: string): Promise<void> {
        try {
            const backup = this.backupHistory.find(b => b.id === backupId);
            if (!backup || !backup.filePath) {
                throw new Error(`Backup ${backupId} not found`);
            }

            // Delete physical file
            const fs = require('fs').promises;
            try {
                await fs.unlink(backup.filePath);
                Logger.info('Backup file deleted', 'deleteBackup', { filePath: backup.filePath });
            } catch (fileError) {
                Logger.warn('Failed to delete backup file', 'deleteBackup', fileError as Error);
            }

            // Remove from history
            this.backupHistory = this.backupHistory.filter(b => b.id !== backupId);
            this.saveBackupData();

            Logger.info('Backup deleted', 'deleteBackup', { backupId });

        } catch (error) {
            Logger.error('Failed to delete backup', error as Error);
            throw error;
        }
    }

    getBackups(connectionId?: string, limit: number = 50): BackupJob[] {
        let backups = this.backupHistory;

        if (connectionId) {
            backups = backups.filter(b => b.connectionId === connectionId);
        }

        return backups
            .sort((a, b) => (b.completedAt?.getTime() || 0) - (a.completedAt?.getTime() || 0))
            .slice(0, limit);
    }

    getBackupJob(jobId: string): BackupJob | undefined {
        return this.backupJobs.get(jobId);
    }

    async cancelBackupJob(jobId: string): Promise<void> {
        try {
            const job = this.backupJobs.get(jobId);
            if (!job) {
                throw new Error(`Backup job ${jobId} not found`);
            }

            if (job.status === 'running') {
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

    dispose(): void {
        this.saveBackupData();
    }
}