import { ConnectionService } from './ConnectionService';
import { PostgreSqlConnectionManager } from './PostgreSqlConnectionManager';
import { Logger } from '../utils/Logger';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface BackupOptions {
    type: 'full' | 'schema-only' | 'data-only';
    compression: boolean;
    encryption: boolean;
    includeRoles: boolean;
    excludeSchemas: string[];
    customArgs?: string[];
}

export interface BackupResult {
    success: boolean;
    backupPath: string;
    size: number;
    duration: number;
    checksum?: string;
    error?: string;
}

export class BackupManager {
    private connectionService: ConnectionService;
    private connectionManager: PostgreSqlConnectionManager;
    private backupDir: string;

    constructor(connectionService: ConnectionService) {
        this.connectionService = connectionService;
        this.connectionManager = PostgreSqlConnectionManager.getInstance();
        this.backupDir = path.join(os.homedir(), '.postgresql-schema-sync', 'backups');
        this.ensureBackupDir();
    }

    private ensureBackupDir(): void {
        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir, { recursive: true });
        }
    }

    async createBackup(connectionId: string, options: BackupOptions = {
        type: 'full',
        compression: true,
        encryption: false,
        includeRoles: true,
        excludeSchemas: ['information_schema', 'pg_catalog', 'pg_toast']
    }): Promise<BackupResult> {
        const startTime = Date.now();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFileName = `backup_${connectionId}_${timestamp}.sql`;
        const backupPath = path.join(this.backupDir, backupFileName);

        Logger.info('Starting database backup', 'BackupManager.createBackup', {
            connectionId,
            backupPath,
            options
        });

        try {
            const connection = await this.connectionService.getConnection(connectionId);
            if (!connection) {
                throw new Error(`Connection ${connectionId} not found`);
            }

            const password = await this.connectionService.getConnectionPassword(connectionId);
            if (!password) {
                throw new Error(`Password for connection ${connectionId} not found`);
            }

            // Build pg_dump command
            const args = this.buildPgDumpArgs(connection, password, options);
            const command = `pg_dump ${args.join(' ')} > "${backupPath}"`;

            Logger.info('Executing pg_dump command', 'BackupManager.createBackup', { command: 'pg_dump [args] > [file]' });

            await execAsync(command, {
                env: {
                    ...process.env,
                    PGPASSWORD: password
                }
            });

            // Get file stats
            const stats = fs.statSync(backupPath);
            const duration = Date.now() - startTime;

            // Compress if requested
            let finalPath = backupPath;
            if (options.compression) {
                finalPath = await this.compressBackup(backupPath);
                // Remove uncompressed file
                fs.unlinkSync(backupPath);
            }

            const result: BackupResult = {
                success: true,
                backupPath: finalPath,
                size: fs.statSync(finalPath).size,
                duration
            };

            Logger.info('Backup completed successfully', 'BackupManager.createBackup', {
                backupPath: finalPath,
                size: result.size,
                duration
            });

            return result;

        } catch (error) {
            const duration = Date.now() - startTime;

            // Clean up failed backup file
            if (fs.existsSync(backupPath)) {
                fs.unlinkSync(backupPath);
            }

            Logger.error('Backup failed', error as Error, 'BackupManager.createBackup', {
                connectionId,
                backupPath,
                duration
            });

            return {
                success: false,
                backupPath,
                size: 0,
                duration,
                error: (error as Error).message
            };
        }
    }

    async restoreBackup(connectionId: string, backupPath: string): Promise<{ success: boolean; error?: string }> {
        Logger.info('Starting database restore', 'BackupManager.restoreBackup', {
            connectionId,
            backupPath
        });

        try {
            const connection = await this.connectionService.getConnection(connectionId);
            if (!connection) {
                throw new Error(`Connection ${connectionId} not found`);
            }

            const password = await this.connectionService.getConnectionPassword(connectionId);
            if (!password) {
                throw new Error(`Password for connection ${connectionId} not found`);
            }

            // Decompress if needed
            let restorePath = backupPath;
            if (backupPath.endsWith('.gz')) {
                restorePath = await this.decompressBackup(backupPath);
            }

            // Build psql command
            const args = this.buildPsqlArgs(connection, password);
            const command = `psql ${args.join(' ')} < "${restorePath}"`;

            Logger.info('Executing psql restore command', 'BackupManager.restoreBackup', { command: 'psql [args] < [file]' });

            await execAsync(command, {
                env: {
                    ...process.env,
                    PGPASSWORD: password
                }
            });

            // Clean up decompressed file if it was temporary
            if (restorePath !== backupPath && fs.existsSync(restorePath)) {
                fs.unlinkSync(restorePath);
            }

            Logger.info('Restore completed successfully', 'BackupManager.restoreBackup', {
                connectionId,
                backupPath
            });

            return { success: true };

        } catch (error) {
            Logger.error('Restore failed', error as Error, 'BackupManager.restoreBackup', {
                connectionId,
                backupPath
            });

            return {
                success: false,
                error: (error as Error).message
            };
        }
    }

    private buildPgDumpArgs(connection: any, password: string, options: BackupOptions): string[] {
        const args = [
            `--host=${connection.host}`,
            `--port=${connection.port}`,
            `--username=${connection.user}`,
            `--dbname=${connection.database}`
        ];

        // Add format options
        if (options.type === 'schema-only') {
            args.push('--schema-only');
        } else if (options.type === 'data-only') {
            args.push('--data-only');
        }

        // Add compression
        if (options.compression) {
            args.push('--compress=9');
        }

        // Exclude schemas
        for (const schema of options.excludeSchemas) {
            args.push(`--exclude-schema=${schema}`);
        }

        // Include roles
        if (options.includeRoles) {
            args.push('--roles');
        }

        // Add custom args
        if (options.customArgs) {
            args.push(...options.customArgs);
        }

        return args;
    }

    private buildPsqlArgs(connection: any, password: string): string[] {
        return [
            `--host=${connection.host}`,
            `--port=${connection.port}`,
            `--username=${connection.user}`,
            `--dbname=${connection.database}`,
            '--single-transaction',
            '--echo-errors'
        ];
    }

    private async compressBackup(filePath: string): Promise<string> {
        const compressedPath = `${filePath}.gz`;
        const command = `gzip -9 "${filePath}"`;

        await execAsync(command);

        return compressedPath;
    }

    private async decompressBackup(filePath: string): Promise<string> {
        const decompressedPath = filePath.replace('.gz', '');
        const command = `gunzip -c "${filePath}" > "${decompressedPath}"`;

        await execAsync(command);

        return decompressedPath;
    }

    listBackups(): { name: string; path: string; size: number; created: Date }[] {
        if (!fs.existsSync(this.backupDir)) {
            return [];
        }

        return fs.readdirSync(this.backupDir)
            .filter(file => file.startsWith('backup_') && (file.endsWith('.sql') || file.endsWith('.sql.gz')))
            .map(file => {
                const filePath = path.join(this.backupDir, file);
                const stats = fs.statSync(filePath);
                return {
                    name: file,
                    path: filePath,
                    size: stats.size,
                    created: stats.birthtime
                };
            })
            .sort((a, b) => b.created.getTime() - a.created.getTime());
    }

    deleteBackup(backupPath: string): boolean {
        try {
            if (fs.existsSync(backupPath) && backupPath.startsWith(this.backupDir)) {
                fs.unlinkSync(backupPath);
                Logger.info('Backup deleted', 'BackupManager.deleteBackup', { backupPath });
                return true;
            }
            return false;
        } catch (error) {
            Logger.error('Failed to delete backup', error as Error, 'BackupManager.deleteBackup', { backupPath });
            return false;
        }
    }
}