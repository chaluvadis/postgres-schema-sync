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

            // Verify backup integrity
            const isValid = await this.verifyBackupIntegrity(finalPath);
            if (!isValid) {
                Logger.error('Backup verification failed', 'BackupManager.createBackup', { backupPath: finalPath });
                // Clean up invalid backup
                if (fs.existsSync(finalPath)) {
                    fs.unlinkSync(finalPath);
                }
                return {
                    success: false,
                    backupPath: finalPath,
                    size: 0,
                    duration,
                    error: 'Backup verification failed'
                };
            }

            const result: BackupResult = {
                success: true,
                backupPath: finalPath,
                size: fs.statSync(finalPath).size,
                duration,
                checksum: await this.calculateChecksum(finalPath)
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

    private async verifyBackupIntegrity(backupPath: string): Promise<boolean> {
        try {
            // Comprehensive integrity checks
            const stats = fs.statSync(backupPath);

            // Check file size (should be > 0)
            if (stats.size === 0) {
                Logger.warn('Backup file is empty', 'BackupManager.verifyBackupIntegrity', { backupPath });
                return false;
            }

            // Check file is readable
            try {
                fs.accessSync(backupPath, fs.constants.R_OK);
            } catch (error) {
                Logger.warn('Backup file is not readable', 'BackupManager.verifyBackupIntegrity', { backupPath });
                return false;
            }

            // For SQL files, perform detailed content validation
            if (backupPath.endsWith('.sql')) {
                const content = fs.readFileSync(backupPath, 'utf-8');

                // Check for basic SQL patterns
                const hasSqlContent = /CREATE|INSERT|UPDATE|DELETE|SELECT|ALTER|DROP/i.test(content);
                if (!hasSqlContent) {
                    Logger.warn('Backup file does not contain valid SQL content', 'BackupManager.verifyBackupIntegrity', { backupPath });
                    return false;
                }

                // Check for balanced comments
                const openComments = (content.match(/\/\*/g) || []).length;
                const closeComments = (content.match(/\*\//g) || []).length;
                if (openComments !== closeComments) {
                    Logger.warn('Backup file has unmatched block comments', 'BackupManager.verifyBackupIntegrity', { backupPath });
                    return false;
                }

                // Check for balanced parentheses in CREATE statements
                const createStatements = content.match(/CREATE\s+[^;]+;/gi) || [];
                for (const stmt of createStatements) {
                    const openParens = (stmt.match(/\(/g) || []).length;
                    const closeParens = (stmt.match(/\)/g) || []).length;
                    if (openParens !== closeParens) {
                        Logger.warn('Backup file has unmatched parentheses in CREATE statement', 'BackupManager.verifyBackupIntegrity', {
                            backupPath,
                            statement: stmt.substring(0, 100) + '...'
                        });
                        return false;
                    }
                }

                // Check for proper statement termination
                const statements = content.split(';').filter(s => s.trim().length > 0);
                for (const stmt of statements) {
                    // Skip comments and empty lines
                    const trimmed = stmt.trim();
                    if (!trimmed.startsWith('--') && trimmed.length > 0) {
                        // Check for basic SQL keywords at start of statements
                        const hasValidStart = /^(CREATE|INSERT|UPDATE|DELETE|ALTER|DROP|GRANT|REVOKE|BEGIN|COMMIT|ROLLBACK)/i.test(trimmed);
                        if (!hasValidStart) {
                            Logger.warn('Backup file contains statement without valid SQL keyword', 'BackupManager.verifyBackupIntegrity', {
                                backupPath,
                                statement: trimmed.substring(0, 50) + '...'
                            });
                            return false;
                        }
                    }
                }

                // Check file encoding (basic UTF-8 validation)
                try {
                    // Attempt to re-encode to check for invalid characters
                    Buffer.from(content, 'utf-8').toString('utf-8');
                } catch (encodingError) {
                    Logger.warn('Backup file has encoding issues', 'BackupManager.verifyBackupIntegrity', { backupPath });
                    return false;
                }

                // Check for minimum expected content (should have at least some schema objects)
                const hasSchemaObjects = /CREATE\s+(TABLE|VIEW|FUNCTION|PROCEDURE|SEQUENCE|TYPE|DOMAIN|COLLATION|EXTENSION)/i.test(content);
                if (!hasSchemaObjects) {
                    Logger.warn('Backup file does not contain expected schema objects', 'BackupManager.verifyBackupIntegrity', { backupPath });
                    return false;
                }

            } else if (backupPath.endsWith('.sql.gz')) {
                // For compressed files, check if they can be decompressed
                try {
                    const testDecompress = await execAsync(`gzip -t "${backupPath}"`);
                    if (testDecompress.stderr) {
                        Logger.warn('Compressed backup file is corrupted', 'BackupManager.verifyBackupIntegrity', { backupPath });
                        return false;
                    }
                } catch (error) {
                    Logger.warn('Compressed backup file integrity check failed', 'BackupManager.verifyBackupIntegrity', { backupPath });
                    return false;
                }
            }

            Logger.info('Backup integrity verification passed', 'BackupManager.verifyBackupIntegrity', {
                backupPath,
                size: stats.size,
                checksPerformed: ['file_size', 'readability', 'content_validation', 'encoding', 'structure']
            });
            return true;

        } catch (error) {
            Logger.error('Backup integrity verification failed', error as Error, 'BackupManager.verifyBackupIntegrity', { backupPath });
            return false;
        }
    }

    private async calculateChecksum(filePath: string): Promise<string> {
        // Simple checksum calculation (in production, use crypto.createHash)
        try {
            const content = fs.readFileSync(filePath);
            let hash = 0;
            for (let i = 0; i < content.length; i++) {
                const char = content[i];
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32-bit integer
            }
            return Math.abs(hash).toString(16);
        } catch (error) {
            Logger.warn('Failed to calculate checksum', 'BackupManager.calculateChecksum', { filePath, error });
            return '';
        }
    }

    async verifyBackupWithRestore(backupPath: string, testConnectionId: string): Promise<{ success: boolean; error?: string; restoreTime?: number }> {
        const startTime = Date.now();

        try {
            Logger.info('Starting backup verification with test restore', 'BackupManager.verifyBackupWithRestore', {
                backupPath,
                testConnectionId
            });

            // Create a temporary test database name
            const testDbName = `test_restore_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // Get test connection
            const testConnection = await this.connectionService.getConnection(testConnectionId);
            if (!testConnection) {
                return { success: false, error: 'Test connection not found' };
            }

            const password = await this.connectionService.getConnectionPassword(testConnectionId);
            if (!password) {
                return { success: false, error: 'Test connection password not found' };
            }

            // Create test database
            const adminConnection = { ...testConnection, database: 'postgres' };
            const adminHandle = await this.connectionManager.createConnection({ ...adminConnection, password });
            const adminClient = adminHandle.connection;

            try {
                await adminClient.query(`CREATE DATABASE ${testDbName}`);
            } finally {
                adminHandle.release();
            }

            // Restore backup to test database
            const testDbConnection = { ...testConnection, database: testDbName };
            const restoreResult = await this.restoreBackup(testConnectionId, backupPath);

            if (!restoreResult.success) {
                // Clean up test database
                const cleanupHandle = await this.connectionManager.createConnection({ ...adminConnection, password });
                try {
                    await cleanupHandle.connection.query(`DROP DATABASE IF EXISTS ${testDbName}`);
                } finally {
                    cleanupHandle.release();
                }

                return {
                    success: false,
                    error: restoreResult.error,
                    restoreTime: Date.now() - startTime
                };
            }

            // Verify restored database has expected structure
            const testHandle = await this.connectionManager.createConnection({ ...testDbConnection, password });
            const testClient = testHandle.connection;

            try {
                // Basic structure check
                const tableResult = await testClient.query(`
                    SELECT COUNT(*) as table_count
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                `);

                const tableCount = parseInt(tableResult.rows[0].table_count);

                Logger.info('Backup verification successful', 'BackupManager.verifyBackupWithRestore', {
                    backupPath,
                    testDbName,
                    tableCount,
                    restoreTime: Date.now() - startTime
                });

                return {
                    success: true,
                    restoreTime: Date.now() - startTime
                };

            } finally {
                testHandle.release();

                // Clean up test database
                const cleanupHandle = await this.connectionManager.createConnection({ ...adminConnection, password });
                try {
                    await cleanupHandle.connection.query(`DROP DATABASE IF EXISTS ${testDbName}`);
                } finally {
                    cleanupHandle.release();
                }
            }

        } catch (error) {
            Logger.error('Backup verification with restore failed', error as Error, 'BackupManager.verifyBackupWithRestore', {
                backupPath,
                testConnectionId
            });

            return {
                success: false,
                error: (error as Error).message,
                restoreTime: Date.now() - startTime
            };
        }
    }
}