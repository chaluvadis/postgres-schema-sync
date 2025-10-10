import * as vscode from 'vscode';
import { ConnectionManager } from '@/managers/ConnectionManager';
import { BackupService, BackupJob, BackupSchedule, RetentionPolicy } from '@/services/BackupService';
import { Logger } from '@/utils/Logger';
import { ErrorHandler } from '@/utils/ErrorHandler';

export interface ScheduledBackup {
    id: string;
    name: string;
    connectionId: string;
    databaseName: string;
    schedule: BackupSchedule;
    backupType: BackupJob['backupType'];
    format: BackupJob['format'];
    options: BackupJob['options'];
    retentionPolicy: RetentionPolicy;
    enabled: boolean;
    lastRun?: Date;
    nextRun: Date;
    runCount: number;
    successCount: number;
    failureCount: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface ScheduleExecution {
    id: string;
    scheduledBackupId: string;
    scheduledTime: Date;
    actualStartTime?: Date;
    actualEndTime?: Date;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    backupJobId?: string;
    error?: string;
    executionTime?: number;
}

export class BackupScheduler {
    private context: vscode.ExtensionContext;
    private connectionManager: ConnectionManager;
    private backupService: BackupService;
    private scheduledBackups: Map<string, ScheduledBackup> = new Map();
    private scheduleExecutions: Map<string, ScheduleExecution> = new Map();
    private schedulerTimer?: NodeJS.Timeout;
    private isRunning: boolean = false;

    constructor(
        context: vscode.ExtensionContext,
        connectionManager: ConnectionManager,
        backupService: BackupService
    ) {
        this.context = context;
        this.connectionManager = connectionManager;
        this.backupService = backupService;
        this.loadScheduledBackups();
        this.startScheduler();
    }

    private loadScheduledBackups(): void {
        try {
            // Load scheduled backups
            const backupsData = this.context.globalState.get<string>('postgresql.scheduler.backups', '[]');
            const backups = JSON.parse(backupsData) as ScheduledBackup[];

            this.scheduledBackups.clear();
            backups.forEach(backup => {
                this.scheduledBackups.set(backup.id, {
                    ...backup,
                    createdAt: new Date(backup.createdAt),
                    updatedAt: new Date(backup.updatedAt),
                    lastRun: backup.lastRun ? new Date(backup.lastRun) : undefined,
                    nextRun: new Date(backup.nextRun)
                });
            });

            // Load execution history
            const executionsData = this.context.globalState.get<string>('postgresql.scheduler.executions', '[]');
            const executions = JSON.parse(executionsData) as ScheduleExecution[];

            this.scheduleExecutions.clear();
            executions.forEach(execution => {
                this.scheduleExecutions.set(execution.id, {
                    ...execution,
                    scheduledTime: new Date(execution.scheduledTime),
                    actualStartTime: execution.actualStartTime ? new Date(execution.actualStartTime) : undefined,
                    actualEndTime: execution.actualEndTime ? new Date(execution.actualEndTime) : undefined
                });
            });

            Logger.info('Scheduled backups loaded', 'loadScheduledBackups', {
                backupCount: this.scheduledBackups.size,
                executionCount: this.scheduleExecutions.size
            });

        } catch (error) {
            Logger.error('Failed to load scheduled backups', error as Error);
            this.scheduledBackups.clear();
            this.scheduleExecutions.clear();
        }
    }

    private saveScheduledBackups(): void {
        try {
            // Save scheduled backups
            const backupsArray = Array.from(this.scheduledBackups.values());
            this.context.globalState.update('postgresql.scheduler.backups', JSON.stringify(backupsArray));

            // Save recent executions (last 1000)
            const executionsArray = Array.from(this.scheduleExecutions.values())
                .sort((a, b) => b.scheduledTime.getTime() - a.scheduledTime.getTime())
                .slice(0, 1000);
            this.context.globalState.update('postgresql.scheduler.executions', JSON.stringify(executionsArray));

            Logger.info('Scheduled backups saved', 'saveScheduledBackups');

        } catch (error) {
            Logger.error('Failed to save scheduled backups', error as Error);
        }
    }

    // Scheduled Backup Management
    async createScheduledBackup(
        name: string,
        connectionId: string,
        databaseName: string,
        schedule: BackupSchedule,
        backupType: BackupJob['backupType'],
        format: BackupJob['format'],
        options: BackupJob['options'] = {},
        retentionPolicy: RetentionPolicy
    ): Promise<ScheduledBackup> {
        try {
            const scheduledBackup: ScheduledBackup = {
                id: this.generateId(),
                name,
                connectionId,
                databaseName,
                schedule,
                backupType,
                format,
                options,
                retentionPolicy,
                enabled: true,
                runCount: 0,
                successCount: 0,
                failureCount: 0,
                nextRun: this.calculateNextRun(schedule),
                createdAt: new Date(),
                updatedAt: new Date()
            };

            this.scheduledBackups.set(scheduledBackup.id, scheduledBackup);
            this.saveScheduledBackups();

            Logger.info('Scheduled backup created', 'createScheduledBackup', {
                backupId: scheduledBackup.id,
                name,
                schedule: schedule.frequency
            });

            return scheduledBackup;

        } catch (error) {
            Logger.error('Failed to create scheduled backup', error as Error);
            throw error;
        }
    }

    async updateScheduledBackup(
        backupId: string,
        updates: Partial<ScheduledBackup>
    ): Promise<ScheduledBackup> {
        try {
            const backup = this.scheduledBackups.get(backupId);
            if (!backup) {
                throw new Error(`Scheduled backup ${backupId} not found`);
            }

            const updatedBackup: ScheduledBackup = {
                ...backup,
                ...updates,
                updatedAt: new Date()
            };

            // Recalculate next run if schedule changed
            if (updates.schedule) {
                updatedBackup.nextRun = this.calculateNextRun(updatedBackup.schedule);
            }

            this.scheduledBackups.set(backupId, updatedBackup);
            this.saveScheduledBackups();

            Logger.info('Scheduled backup updated', 'updateScheduledBackup', {
                backupId,
                name: updatedBackup.name
            });

            return updatedBackup;

        } catch (error) {
            Logger.error('Failed to update scheduled backup', error as Error);
            throw error;
        }
    }

    async deleteScheduledBackup(backupId: string): Promise<void> {
        try {
            const backup = this.scheduledBackups.get(backupId);
            if (!backup) {
                throw new Error(`Scheduled backup ${backupId} not found`);
            }

            this.scheduledBackups.delete(backupId);

            // Remove associated executions
            for (const [executionId, execution] of this.scheduleExecutions) {
                if (execution.scheduledBackupId === backupId) {
                    this.scheduleExecutions.delete(executionId);
                }
            }

            this.saveScheduledBackups();

            Logger.info('Scheduled backup deleted', 'deleteScheduledBackup', {
                backupId,
                name: backup.name
            });

        } catch (error) {
            Logger.error('Failed to delete scheduled backup', error as Error);
            throw error;
        }
    }

    getScheduledBackups(enabled?: boolean): ScheduledBackup[] {
        let backups = Array.from(this.scheduledBackups.values());

        if (enabled !== undefined) {
            backups = backups.filter(backup => backup.enabled === enabled);
        }

        return backups.sort((a, b) => a.nextRun.getTime() - b.nextRun.getTime());
    }

    // Scheduler Engine
    startScheduler(): void {
        if (this.isRunning) {
            this.stopScheduler();
        }

        this.isRunning = true;

        // Check every minute for scheduled backups
        this.schedulerTimer = setInterval(() => {
            this.checkScheduledBackups();
        }, 60000);

        Logger.info('Backup scheduler started', 'startScheduler');
    }

    stopScheduler(): void {
        if (this.schedulerTimer) {
            clearInterval(this.schedulerTimer);
            this.schedulerTimer = undefined;
        }

        this.isRunning = false;
        Logger.info('Backup scheduler stopped', 'stopScheduler');
    }

    private checkScheduledBackups(): void {
        try {
            const now = new Date();
            const enabledBackups = this.getScheduledBackups(true);

            for (const backup of enabledBackups) {
                if (backup.nextRun <= now && this.shouldExecuteBackup(backup)) {
                    this.executeScheduledBackup(backup.id);
                }
            }

        } catch (error) {
            Logger.error('Error checking scheduled backups', error as Error);
        }
    }

    private shouldExecuteBackup(backup: ScheduledBackup): boolean {
        // Check if we already executed this backup recently (within last hour)
        if (backup.lastRun) {
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            if (backup.lastRun > oneHourAgo) {
                return false;
            }
        }

        return true;
    }

    private async executeScheduledBackup(backupId: string): Promise<void> {
        try {
            const backup = this.scheduledBackups.get(backupId);
            if (!backup) {
                Logger.error('Scheduled backup not found', new Error(`Backup ${backupId} not found`), 'executeScheduledBackup');
                return;
            }

            Logger.info('Executing scheduled backup', 'executeScheduledBackup', {
                backupId,
                name: backup.name
            });

            // Create execution record
            const executionId = this.generateId();
            const execution: ScheduleExecution = {
                id: executionId,
                scheduledBackupId: backupId,
                scheduledTime: backup.nextRun,
                status: 'running',
                actualStartTime: new Date()
            };

            this.scheduleExecutions.set(executionId, execution);

            try {
                // Create backup job
                const jobId = await this.backupService.createBackupJob(
                    `Scheduled: ${backup.name}`,
                    backup.connectionId,
                    backup.databaseName,
                    backup.backupType,
                    backup.format,
                    backup.options
                );

                // Update execution with job ID
                execution.backupJobId = jobId;
                this.scheduleExecutions.set(executionId, execution);

                // Execute backup job
                await this.backupService.executeBackupJob(jobId);

                // Update execution as completed
                execution.status = 'completed';
                execution.actualEndTime = new Date();
                if (execution.actualStartTime) {
                    execution.executionTime = execution.actualEndTime.getTime() - execution.actualStartTime.getTime();
                }

                // Update scheduled backup
                backup.lastRun = new Date();
                backup.runCount++;
                backup.successCount++;
                backup.nextRun = this.calculateNextRun(backup.schedule);
                this.scheduledBackups.set(backupId, backup);

                Logger.info('Scheduled backup executed successfully', 'executeScheduledBackup', {
                    backupId,
                    executionId,
                    jobId
                });

            } catch (error) {
                // Update execution as failed
                execution.status = 'failed';
                execution.actualEndTime = new Date();
                execution.error = (error as Error).message;
                if (execution.actualStartTime) {
                    execution.executionTime = execution.actualEndTime.getTime() - execution.actualStartTime.getTime();
                }

                // Update scheduled backup
                backup.failureCount++;
                this.scheduledBackups.set(backupId, backup);

                Logger.error('Scheduled backup failed', error as Error);
            }

            this.scheduleExecutions.set(executionId, execution);
            this.saveScheduledBackups();

        } catch (error) {
            Logger.error('Failed to execute scheduled backup', error as Error);
        }
    }

    private calculateNextRun(schedule: BackupSchedule): Date {
        const now = new Date();
        const nextRun = new Date(now);

        switch (schedule.frequency) {
            case 'daily':
                nextRun.setDate(now.getDate() + 1);
                if (schedule.time) {
                    const [hours, minutes] = schedule.time.split(':').map(Number);
                    nextRun.setHours(hours, minutes, 0, 0);
                }
                break;

            case 'weekly':
                const daysUntilNextWeek = (7 - now.getDay() + (schedule.dayOfWeek || 0)) % 7;
                nextRun.setDate(now.getDate() + (daysUntilNextWeek === 0 ? 7 : daysUntilNextWeek));
                if (schedule.time) {
                    const [hours, minutes] = schedule.time.split(':').map(Number);
                    nextRun.setHours(hours, minutes, 0, 0);
                }
                break;

            case 'monthly':
                nextRun.setMonth(now.getMonth() + 1);
                const targetDay = schedule.dayOfMonth || 1;
                nextRun.setDate(Math.min(targetDay, new Date(nextRun.getFullYear(), nextRun.getMonth() + 1, 0).getDate()));
                if (schedule.time) {
                    const [hours, minutes] = schedule.time.split(':').map(Number);
                    nextRun.setHours(hours, minutes, 0, 0);
                }
                break;

            case 'once':
            default:
                // For one-time backups, set to far future
                nextRun.setFullYear(now.getFullYear() + 10);
                break;
        }

        return nextRun;
    }

    // Execution Management
    getScheduleExecutions(
        scheduledBackupId?: string,
        status?: ScheduleExecution['status'],
        limit: number = 100
    ): ScheduleExecution[] {
        let executions = Array.from(this.scheduleExecutions.values());

        if (scheduledBackupId) {
            executions = executions.filter(exec => exec.scheduledBackupId === scheduledBackupId);
        }

        if (status) {
            executions = executions.filter(exec => exec.status === status);
        }

        return executions
            .sort((a, b) => b.scheduledTime.getTime() - a.scheduledTime.getTime())
            .slice(0, limit);
    }

    getNextScheduledBackups(count: number = 10): ScheduledBackup[] {
        return this.getScheduledBackups(true)
            .filter(backup => backup.nextRun > new Date())
            .slice(0, count);
    }

    // Scheduler Control
    async enableScheduledBackup(backupId: string): Promise<void> {
        await this.updateScheduledBackup(backupId, {
            enabled: true,
            nextRun: this.calculateNextRun(this.scheduledBackups.get(backupId)!.schedule)
        });
    }

    async disableScheduledBackup(backupId: string): Promise<void> {
        await this.updateScheduledBackup(backupId, { enabled: false });
    }

    async runScheduledBackupNow(backupId: string): Promise<void> {
        try {
            const backup = this.scheduledBackups.get(backupId);
            if (!backup) {
                throw new Error(`Scheduled backup ${backupId} not found`);
            }

            Logger.info('Running scheduled backup immediately', 'runScheduledBackupNow', {
                backupId,
                name: backup.name
            });

            // Create execution record
            const executionId = this.generateId();
            const execution: ScheduleExecution = {
                id: executionId,
                scheduledBackupId: backupId,
                scheduledTime: new Date(),
                status: 'running',
                actualStartTime: new Date()
            };

            this.scheduleExecutions.set(executionId, execution);

            // Create and execute backup job
            const jobId = await this.backupService.createBackupJob(
                `Manual: ${backup.name}`,
                backup.connectionId,
                backup.databaseName,
                backup.backupType,
                backup.format,
                backup.options
            );

            execution.backupJobId = jobId;
            this.scheduleExecutions.set(executionId, execution);

            await this.backupService.executeBackupJob(jobId);

            // Update execution as completed
            execution.status = 'completed';
            execution.actualEndTime = new Date();
            if (execution.actualStartTime) {
                execution.executionTime = execution.actualEndTime.getTime() - execution.actualStartTime.getTime();
            }

            // Update scheduled backup
            backup.lastRun = new Date();
            backup.runCount++;
            backup.successCount++;
            this.scheduledBackups.set(backupId, backup);

            this.scheduleExecutions.set(executionId, execution);
            this.saveScheduledBackups();

            vscode.window.showInformationMessage(`Scheduled backup "${backup.name}" executed successfully`);

        } catch (error) {
            Logger.error('Failed to run scheduled backup', error as Error);
            vscode.window.showErrorMessage(`Failed to run scheduled backup: ${(error as Error).message}`);
        }
    }

    // Statistics and Monitoring
    getSchedulerStatistics(): {
        totalScheduledBackups: number;
        enabledBackups: number;
        totalExecutions: number;
        successfulExecutions: number;
        failedExecutions: number;
        averageExecutionTime: number;
        nextScheduledRuns: number;
        schedulesByFrequency: Record<string, number>;
    } {
        const backups = Array.from(this.scheduledBackups.values());
        const executions = Array.from(this.scheduleExecutions.values());

        const frequencyCount = backups.reduce((acc, backup) => {
            acc[backup.schedule.frequency] = (acc[backup.schedule.frequency] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const now = new Date();
        const nextRuns = backups.filter(backup => backup.enabled && backup.nextRun > now).length;

        return {
            totalScheduledBackups: backups.length,
            enabledBackups: backups.filter(b => b.enabled).length,
            totalExecutions: executions.length,
            successfulExecutions: executions.filter(e => e.status === 'completed').length,
            failedExecutions: executions.filter(e => e.status === 'failed').length,
            averageExecutionTime: executions.filter(e => e.executionTime).length > 0 ?
                executions.filter(e => e.executionTime).reduce((sum, e) => sum + (e.executionTime || 0), 0) /
                executions.filter(e => e.executionTime).length : 0,
            nextScheduledRuns: nextRuns,
            schedulesByFrequency: frequencyCount
        };
    }

    // Utility Methods
    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    dispose(): void {
        this.stopScheduler();
        this.saveScheduledBackups();
    }
}