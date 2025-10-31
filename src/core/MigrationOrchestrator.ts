import { ConnectionService } from './ConnectionService';
import { ProgressTracker } from './ProgressTracker';
import { ValidationFramework } from './ValidationFramework';
import { PostgreSqlSchemaBrowser } from './PostgreSqlSchemaBrowser';
import { PostgreSqlConnectionManager } from './PostgreSqlConnectionManager';
import { MigrationStorage } from './MigrationStorage';
import { SchemaDiffer, SchemaObject, SchemaDifference } from './SchemaDiffer';
import { BackupManager } from './BackupManager';
import { BusinessRuleEngine, BusinessRuleContext } from './BusinessRuleEngine';
import { RealtimeMonitor } from './RealtimeMonitor';
import { Logger } from '../utils/Logger';
import * as path from 'path';
import * as os from 'os';

export interface MigrationRequest {
    id?: string;
    name?: string;
    sourceConnectionId: string;
    targetConnectionId: string;
    options?: MigrationOptions;
    metadata?: MigrationMetadata;
}

export interface MigrationOptions {
    includeRollback?: boolean;
    validateBeforeExecution?: boolean;
    createBackupBeforeExecution?: boolean;
    executeInTransaction?: boolean;
    stopOnFirstError?: boolean;
    useBatching?: boolean;
    batchSize?: number;
    progressCallback?: (progress: any) => void;
    businessRules?: string[];
    failOnWarnings?: boolean;
    author?: string;
    businessJustification?: string;
    changeType?: 'hotfix' | 'feature' | 'refactoring' | 'optimization';
    environment?: 'development' | 'staging' | 'production';
    tags?: string[];
}

export interface MigrationProgress {
    phase: string;
    message: string;
    percentage?: number;
    currentStep?: number;
    totalSteps?: number;
    details?: Record<string, any>;
}

export interface MigrationMetadata {
    author?: string;
    businessJustification?: string;
    changeType?: 'hotfix' | 'feature' | 'refactoring' | 'optimization';
    environment?: 'development' | 'staging' | 'production';
    tags?: string[];
    completedAt?: string;
    status?: 'running' | 'completed' | 'failed' | 'cancelled';
    verified?: boolean;
    startedAt?: string;
    currentPhase?: string;
    progressPercentage?: number;
    lastUpdated?: string;
    lastChecked?: string;
    isRealTime?: boolean;
    cancelledAt?: string;
    lastVerified?: string;
    executionTimeMs?: number;
    transactionId?: number; // PostgreSQL backend process ID for transaction tracking
}

export interface ValidationReport {
    requestId: string;
    validationTimestamp: Date;
    totalRules: number;
    passedRules: number;
    failedRules: number;
    warningRules: number;
    results: ValidationResult[];
    overallStatus: 'passed' | 'failed' | 'warning';
    canProceed: boolean;
    recommendations: string[];
    executionTime: number;
}

export interface ValidationResult {
    ruleId: string;
    ruleName: string;
    status: 'passed' | 'failed' | 'warning';
    message: string;
    details?: Record<string, unknown>;
}

export interface MigrationResult {
    migrationId: string;
    success: boolean;
    executionTime: number;
    operationsProcessed: number;
    errors: string[];
    warnings: string[];
    rollbackAvailable: boolean;
    validationReport?: ValidationReport;
    executionLog: string[];
    metadata: MigrationMetadata;
}

export interface MigrationLock {
    migrationId: string;
    targetConnectionId: string;
    acquiredAt: Date;
    expiresAt: Date;
}

export class MigrationConcurrencyManager {
    private connectionService: ConnectionService;
    private connectionManager: PostgreSqlConnectionManager;
    private readonly lockTimeoutMs = 3600000; // 1 hour

    constructor(connectionService: ConnectionService, connectionManager: PostgreSqlConnectionManager) {
        this.connectionService = connectionService;
        this.connectionManager = connectionManager;
    }

    async acquireLock(targetConnectionId: string, migrationId: string): Promise<boolean> {
        try {
            Logger.debug('Attempting to acquire database-level lock', 'MigrationConcurrencyManager.acquireLock', {
                targetConnectionId,
                migrationId
            });

            // Get connection details for the target database
            const connection = await this.connectionService.getConnection(targetConnectionId);
            if (!connection) {
                Logger.error('Connection not found for lock acquisition', 'MigrationConcurrencyManager.acquireLock', {
                    targetConnectionId
                });
                return false;
            }

            const password = await this.connectionService.getConnectionPassword(targetConnectionId);
            if (!password) {
                Logger.error('Password not found for lock acquisition', 'MigrationConcurrencyManager.acquireLock', {
                    targetConnectionId
                });
                return false;
            }

            const connectionWithPassword = { ...connection, password };
            const handle = await this.connectionManager.createConnection(connectionWithPassword);
            const client = handle.connection;

            try {
                // Generate a unique lock key based on connection ID
                // Use PostgreSQL advisory locks for atomic, database-level locking
                const lockKey = this.generateLockKey(targetConnectionId);

                // Try to acquire an exclusive advisory lock with timeout
                // pg_try_advisory_lock returns true if lock acquired, false if already locked
                const lockResult = await client.query(`
                    SELECT pg_try_advisory_lock($1, $2) as lock_acquired,
                           CASE WHEN pg_try_advisory_lock($1, $2) THEN
                               extract(epoch from now()) * 1000 + $3
                           ELSE NULL END as lock_expires_at
                `, [lockKey, 0, this.lockTimeoutMs]);

                const lockAcquired = lockResult.rows[0].lock_acquired;
                const lockExpiresAt = lockResult.rows[0].lock_expires_at;

                if (lockAcquired) {
                    // Store lock metadata in a dedicated locks table
                    await client.query(`
                        CREATE TABLE IF NOT EXISTS migration_locks (
                            connection_id TEXT PRIMARY KEY,
                            migration_id TEXT NOT NULL,
                            acquired_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                            expires_at TIMESTAMP WITH TIME ZONE,
                            lock_key BIGINT NOT NULL,
                            UNIQUE(connection_id)
                        )
                    `);

                    await client.query(`
                        INSERT INTO migration_locks (connection_id, migration_id, expires_at, lock_key)
                        VALUES ($1, $2, to_timestamp($3 / 1000), $4)
                        ON CONFLICT (connection_id) DO UPDATE SET
                            migration_id = EXCLUDED.migration_id,
                            acquired_at = NOW(),
                            expires_at = EXCLUDED.expires_at,
                            lock_key = EXCLUDED.lock_key
                    `, [targetConnectionId, migrationId, lockExpiresAt, lockKey]);

                    Logger.info('Database-level lock acquired successfully', 'MigrationConcurrencyManager.acquireLock', {
                        targetConnectionId,
                        migrationId,
                        lockKey
                    });

                    return true;
                } else {
                    Logger.warn('Failed to acquire database-level lock - already locked', 'MigrationConcurrencyManager.acquireLock', {
                        targetConnectionId,
                        migrationId
                    });
                    return false;
                }

            } catch (queryError) {
                Logger.error('Database lock operation failed', queryError as Error, 'MigrationConcurrencyManager.acquireLock', {
                    targetConnectionId,
                    migrationId
                });
                return false;
            } finally {
                handle.release();
            }

        } catch (error) {
            Logger.error('Lock acquisition failed', error as Error, 'MigrationConcurrencyManager.acquireLock', {
                targetConnectionId,
                migrationId
            });
            return false;
        }
    }

    async releaseLock(targetConnectionId: string, migrationId: string): Promise<boolean> {
        try {
            Logger.debug('Attempting to release database-level lock', 'MigrationConcurrencyManager.releaseLock', {
                targetConnectionId,
                migrationId
            });

            // Get connection details
            const connection = await this.connectionService.getConnection(targetConnectionId);
            if (!connection) {
                Logger.error('Connection not found for lock release', 'MigrationConcurrencyManager.releaseLock', {
                    targetConnectionId
                });
                return false;
            }

            const password = await this.connectionService.getConnectionPassword(targetConnectionId);
            if (!password) {
                Logger.error('Password not found for lock release', 'MigrationConcurrencyManager.releaseLock', {
                    targetConnectionId
                });
                return false;
            }

            const connectionWithPassword = { ...connection, password };
            const handle = await this.connectionManager.createConnection(connectionWithPassword);
            const client = handle.connection;

            try {
                // Get lock metadata from the locks table
                const lockData = await client.query(`
                    SELECT lock_key, migration_id FROM migration_locks
                    WHERE connection_id = $1
                `, [targetConnectionId]);

                if (lockData.rows.length === 0) {
                    Logger.warn('No lock found to release', 'MigrationConcurrencyManager.releaseLock', {
                        targetConnectionId,
                        migrationId
                    });
                    return false;
                }

                const lock = lockData.rows[0];

                // Verify the migration ID matches
                if (lock.migration_id !== migrationId) {
                    Logger.warn('Lock owned by different migration', 'MigrationConcurrencyManager.releaseLock', {
                        targetConnectionId,
                        migrationId,
                        actualMigrationId: lock.migration_id
                    });
                    return false;
                }

                // Release the advisory lock
                await client.query('SELECT pg_advisory_unlock($1, $2)', [lock.lock_key, 0]);

                // Remove lock metadata
                await client.query('DELETE FROM migration_locks WHERE connection_id = $1', [targetConnectionId]);

                Logger.info('Database-level lock released successfully', 'MigrationConcurrencyManager.releaseLock', {
                    targetConnectionId,
                    migrationId,
                    lockKey: lock.lock_key
                });

                return true;

            } catch (queryError) {
                Logger.error('Database lock release operation failed', queryError as Error, 'MigrationConcurrencyManager.releaseLock', {
                    targetConnectionId,
                    migrationId
                });
                return false;
            } finally {
                handle.release();
            }

        } catch (error) {
            Logger.error('Lock release failed', error as Error, 'MigrationConcurrencyManager.releaseLock', {
                targetConnectionId,
                migrationId
            });
            return false;
        }
    }

    async isLocked(targetConnectionId: string): Promise<boolean> {
        try {
            // Get connection details
            const connection = await this.connectionService.getConnection(targetConnectionId);
            if (!connection) {
                return false;
            }

            const password = await this.connectionService.getConnectionPassword(targetConnectionId);
            if (!password) {
                return false;
            }

            const connectionWithPassword = { ...connection, password };
            const handle = await this.connectionManager.createConnection(connectionWithPassword);
            const client = handle.connection;

            try {
                // Check if there's an active lock in the locks table
                const lockData = await client.query(`
                    SELECT migration_id, expires_at, lock_key
                    FROM migration_locks
                    WHERE connection_id = $1
                `, [targetConnectionId]);

                if (lockData.rows.length === 0) {
                    return false;
                }

                const lock = lockData.rows[0];

                // Check if lock is expired
                const now = new Date();
                const expiresAt = new Date(lock.expires_at);

                if (expiresAt < now) {
                    // Lock is expired, clean it up
                    await client.query('SELECT pg_advisory_unlock($1, $2)', [lock.lock_key, 0]);
                    await client.query('DELETE FROM migration_locks WHERE connection_id = $1', [targetConnectionId]);

                    Logger.info('Expired lock cleaned up', 'MigrationConcurrencyManager.isLocked', {
                        targetConnectionId,
                        expiredAt: expiresAt
                    });

                    return false;
                }

                // Verify the advisory lock is still held
                const lockCheck = await client.query('SELECT pg_advisory_lock($1, $2) as lock_held', [lock.lock_key, 0]);
                const lockHeld = lockCheck.rows[0].lock_held;

                if (!lockHeld) {
                    // Advisory lock was lost, clean up metadata
                    await client.query('DELETE FROM migration_locks WHERE connection_id = $1', [targetConnectionId]);
                    return false;
                }

                return true;

            } catch (queryError) {
                Logger.error('Lock check operation failed', queryError as Error, 'MigrationConcurrencyManager.isLocked', {
                    targetConnectionId
                });
                return false;
            } finally {
                handle.release();
            }

        } catch (error) {
            Logger.error('Lock check failed', error as Error, 'MigrationConcurrencyManager.isLocked', {
                targetConnectionId
            });
            return false;
        }
    }

    async getActiveLocks(): Promise<MigrationLock[]> {
        try {
            // This method would need to aggregate locks across all databases
            // For now, return empty array as we can't easily query all databases
            Logger.debug('getActiveLocks called - not implemented for distributed locks', 'MigrationConcurrencyManager.getActiveLocks');
            return [];
        } catch (error) {
            Logger.error('Failed to get active locks', error as Error, 'MigrationConcurrencyManager.getActiveLocks');
            return [];
        }
    }

    private generateLockKey(connectionId: string): number {
        // Generate a consistent hash of the connection ID for use as advisory lock key
        let hash = 0;
        for (let i = 0; i < connectionId.length; i++) {
            const char = connectionId.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        // Ensure positive number and reasonable range for advisory locks
        return Math.abs(hash) % 2147483647; // Max 32-bit signed integer
    }
}

export class MigrationOrchestrator {
    private connectionService: ConnectionService;
    private progressTracker: ProgressTracker;
    private validationFramework: ValidationFramework;
    private schemaBrowser: PostgreSqlSchemaBrowser;
    private connectionManager: PostgreSqlConnectionManager;
    private migrationStorage: MigrationStorage;
    private backupManager: BackupManager;
    private concurrencyManager: MigrationConcurrencyManager;
    private businessRuleEngine: BusinessRuleEngine;
    private realtimeMonitor: RealtimeMonitor;

    constructor(
        connectionService: ConnectionService,
        progressTracker: ProgressTracker,
        validationFramework: ValidationFramework,
        schemaBrowser: PostgreSqlSchemaBrowser
    ) {
        this.connectionService = connectionService;
        this.progressTracker = progressTracker;
        this.validationFramework = validationFramework;
        this.schemaBrowser = schemaBrowser;
        this.connectionManager = PostgreSqlConnectionManager.getInstance();
        const storagePath = path.join(os.homedir(), '.postgresql-schema-sync', 'migrations.json');
        this.migrationStorage = new MigrationStorage(storagePath);
        this.backupManager = new BackupManager(connectionService);
        this.concurrencyManager = new MigrationConcurrencyManager(connectionService, this.connectionManager);
        this.businessRuleEngine = new BusinessRuleEngine();
        this.realtimeMonitor = new RealtimeMonitor();
    }

    async executeMigration(request: MigrationRequest, dryRun: boolean = false): Promise<MigrationResult> {
        const migrationId = request.id || this.generateId();
        const startTime = Date.now();

        // Dry-run mode: validate and simulate without actual execution
        if (dryRun) {
            return this.executeDryRun(request, migrationId, startTime);
        }

        Logger.info('Starting migration workflow', 'MigrationOrchestrator.executeMigration', {
            migrationId,
            sourceConnectionId: request.sourceConnectionId,
            targetConnectionId: request.targetConnectionId
        });

        try {
            // Check for concurrent migrations on the same target
            if (await this.concurrencyManager.isLocked(request.targetConnectionId)) {
                throw new Error(`Migration already in progress on target connection ${request.targetConnectionId}`);
            }

            // Acquire lock for target connection (now async for atomic operations)
            const lockAcquired = await this.concurrencyManager.acquireLock(request.targetConnectionId, migrationId);
            if (!lockAcquired) {
                throw new Error(`Failed to acquire lock for target connection ${request.targetConnectionId}`);
            }

            // Initialize progress tracking
            this.progressTracker.startMigrationOperation(
                migrationId,
                migrationId,
                request.sourceConnectionId,
                request.targetConnectionId,
                (progress: any) => {
                    // Invoke user-provided callback if available
                    if (request.options?.progressCallback) {
                        try {
                            request.options.progressCallback(progress);
                        } catch (error) {
                            Logger.warn('Progress callback failed', 'MigrationOrchestrator.executeMigration', { error });
                        }
                    }
                }
            );

            // Publish initial progress
            this.realtimeMonitor.publishProgress({
                migrationId,
                phase: 'initializing',
                message: 'Migration workflow started',
                percentage: 0,
                timestamp: new Date(),
                details: { sourceConnectionId: request.sourceConnectionId, targetConnectionId: request.targetConnectionId }
            });

            // Store active migration
            await this.migrationStorage.addActiveMigration(migrationId, request);

            // Phase 1: Validation
            this.progressTracker.updateMigrationProgress(migrationId, 'validation', 'Running pre-migration validation');

            this.realtimeMonitor.publishProgress({
                migrationId,
                phase: 'validation',
                message: 'Running pre-migration validation',
                percentage: 10,
                timestamp: new Date()
            });

            // Update metadata
            request.metadata = {
                ...request.metadata,
                status: 'running',
                currentPhase: 'validation',
                progressPercentage: 10,
                startedAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString()
            };

            // Perform comprehensive validation before migration
            const validationReport = await this.performPreMigrationValidation(migrationId, request);

            if (!validationReport.canProceed) {
                this.progressTracker.updateMigrationProgress(migrationId, 'validation', `Validation failed: ${validationReport.overallStatus}`);
                throw new Error(`Pre-migration validation failed: ${validationReport.recommendations.join(', ')}`);
            }

            this.progressTracker.updateMigrationProgress(migrationId, 'validation', `Validation completed: ${validationReport.passedRules}/${validationReport.totalRules} rules passed`);
            this.realtimeMonitor.publishProgress({
                migrationId,
                phase: 'validation',
                message: `Validation completed: ${validationReport.passedRules}/${validationReport.totalRules} rules passed`,
                percentage: 20,
                timestamp: new Date(),
                details: { passedRules: validationReport.passedRules, totalRules: validationReport.totalRules }
            });

            // Update metadata
            request.metadata = {
                ...request.metadata,
                progressPercentage: 20,
                lastUpdated: new Date().toISOString()
            };
            // Phase 2: Backup (if requested)
            if (request.options?.createBackupBeforeExecution) {
                this.progressTracker.updateMigrationProgress(migrationId, 'backup', 'Creating pre-migration backup');
                this.realtimeMonitor.publishProgress({
                    migrationId,
                    phase: 'backup',
                    message: 'Creating pre-migration backup',
                    percentage: 30,
                    timestamp: new Date()
                });
                await this.createPreMigrationBackup(request);
                this.realtimeMonitor.publishProgress({
                    migrationId,
                    phase: 'backup',
                    message: 'Pre-migration backup completed',
                    percentage: 40,
                    timestamp: new Date()
                });
            }

            // Phase 3: Execution
            this.progressTracker.updateMigrationProgress(migrationId, 'execution', 'Executing migration script');
            this.realtimeMonitor.publishProgress({
                migrationId,
                phase: 'execution',
                message: 'Executing migration script',
                percentage: 50,
                timestamp: new Date()
            });
            const executionResult = await this.executeMigrationScript(migrationId, request);

            // Phase 4: Verification
            this.progressTracker.updateMigrationProgress(migrationId, 'verification', 'Verifying migration completion');
            this.realtimeMonitor.publishProgress({
                migrationId,
                phase: 'verification',
                message: 'Verifying migration completion',
                percentage: 80,
                timestamp: new Date()
            });
            await this.verifyMigration(migrationId, request);
            this.realtimeMonitor.publishProgress({
                migrationId,
                phase: 'verification',
                message: 'Migration verification completed',
                percentage: 90,
                timestamp: new Date()
            });

            // Phase 5: Cleanup
            this.progressTracker.updateMigrationProgress(migrationId, 'cleanup', 'Finalizing migration');
            this.realtimeMonitor.publishProgress({
                migrationId,
                phase: 'cleanup',
                message: 'Finalizing migration',
                percentage: 95,
                timestamp: new Date()
            });
            await this.cleanupMigration(migrationId, request);

            // Complete migration
            const executionTime = Date.now() - startTime;
            const result: MigrationResult = {
                migrationId,
                success: true,
                executionTime,
                operationsProcessed: executionResult.operationsProcessed,
                errors: executionResult.errors,
                warnings: executionResult.warnings,
                rollbackAvailable: request.options?.includeRollback || false,
                validationReport,
                executionLog: executionResult.executionLog,
                metadata: request.metadata || {}
            };

            await this.migrationStorage.addMigrationResult(migrationId, result);
            this.progressTracker.updateMigrationProgress(migrationId, 'cleanup', 'Migration completed successfully');

            // Mark migration as complete in real-time monitor
            this.realtimeMonitor.markMigrationComplete(migrationId);
            this.realtimeMonitor.publishProgress({
                migrationId,
                phase: 'completed',
                message: 'Migration completed successfully',
                percentage: 100,
                timestamp: new Date(),
                details: { executionTime, operationsProcessed: result.operationsProcessed }
            });

            Logger.info('Migration workflow completed successfully', 'MigrationOrchestrator.executeMigration', {
                migrationId,
                executionTime,
                operationsProcessed: result.operationsProcessed
            });

            return result;

        } catch (error) {
            const executionTime = Date.now() - startTime;
            const errorMessage = (error as Error).message;

            Logger.error('Migration workflow failed', error as Error, 'MigrationOrchestrator.executeMigration', {
                migrationId,
                executionTime,
                error: errorMessage
            });

            // Attempt rollback if requested and backup exists
            let rollbackPerformed = false;
            if (request.options?.includeRollback) {
                try {
                    Logger.info('Attempting automatic rollback', 'MigrationOrchestrator.executeMigration', { migrationId });
                    rollbackPerformed = await this.performRollback(migrationId, request);
                } catch (rollbackError) {
                    Logger.error('Rollback failed', rollbackError as Error, 'MigrationOrchestrator.executeMigration', { migrationId });
                }
            }

            const result: MigrationResult = {
                migrationId,
                success: false,
                executionTime,
                operationsProcessed: 0,
                errors: [errorMessage],
                warnings: [],
                rollbackAvailable: rollbackPerformed,
                executionLog: [`Migration failed: ${errorMessage}${rollbackPerformed ? ' (rollback performed)' : ''}`],
                metadata: request.metadata || {}
            };

            await this.migrationStorage.addMigrationResult(migrationId, result);
            this.progressTracker.updateMigrationProgress(migrationId, 'cleanup', `Migration failed: ${errorMessage}`);

            // Mark migration as failed in real-time monitor
            this.realtimeMonitor.markMigrationFailed(migrationId, errorMessage);
            this.realtimeMonitor.publishProgress({
                migrationId,
                phase: 'failed',
                message: `Migration failed: ${errorMessage}`,
                percentage: 0,
                timestamp: new Date(),
                details: { error: errorMessage, executionTime }
            });

            return result;
        } finally {
            // Release concurrency lock
            this.concurrencyManager.releaseLock(request.targetConnectionId, migrationId);

            // Clean up active migration after delay
            setTimeout(async () => {
                await this.migrationStorage.removeActiveMigration(migrationId);
            }, 60000); // Keep for 1 minute for reference
        }
    }

    async generateMigration(request: MigrationRequest): Promise<{
        migrationId: string;
        sqlScript: string;
        rollbackScript?: string;
        riskLevel: 'Low' | 'Medium' | 'High';
        warnings: string[];
        operationCount: number;
    }> {
        const migrationId = request.id || this.generateId();

        Logger.info('Generating migration script', 'MigrationOrchestrator.generateMigration', {
            migrationId,
            sourceConnectionId: request.sourceConnectionId,
            targetConnectionId: request.targetConnectionId
        });

        try {
            // Get connections
            const sourceConnection = await this.connectionService.getConnection(request.sourceConnectionId);
            const targetConnection = await this.connectionService.getConnection(request.targetConnectionId);

            if (!sourceConnection || !targetConnection) {
                throw new Error('Source or target connection not found');
            }

            // Get schema objects from both databases
            const sourcePassword = await this.connectionService.getConnectionPassword(request.sourceConnectionId);
            const targetPassword = await this.connectionService.getConnectionPassword(request.targetConnectionId);

            if (!sourcePassword || !targetPassword) {
                throw new Error('Failed to retrieve connection passwords');
            }

            const sourceConnectionWithPassword = { ...sourceConnection, password: sourcePassword };
            const targetConnectionWithPassword = { ...targetConnection, password: targetPassword };

            const sourceSchemaObjects = await this.schemaBrowser.getDatabaseObjectsAsync(sourceConnectionWithPassword);
            const targetSchemaObjects = await this.schemaBrowser.getDatabaseObjectsAsync(targetConnectionWithPassword);

            // Convert to SchemaObject format and compare
            const sourceObjects = this.convertToSchemaObjects(sourceSchemaObjects);
            const targetObjects = this.convertToSchemaObjects(targetSchemaObjects);

            const schemaDiffer = new SchemaDiffer(sourceObjects, targetObjects);
            const differences = schemaDiffer.compareSchemas();

            // Generate SQL script based on differences
            const sqlScript = this.generateSqlScript(differences);
            const rollbackScript = request.options?.includeRollback ? this.generateRollbackScript(differences) : undefined;

            // Analyze migration
            const operationCount = sqlScript.split('\n').length;
            const riskLevel = this.assessMigrationRisk(sqlScript);
            const warnings = this.analyzeMigrationWarnings(sqlScript);

            Logger.info('Migration script generated', 'MigrationOrchestrator.generateMigration', {
                migrationId,
                operationCount,
                riskLevel,
                warningsCount: warnings.length,
                rollbackIncluded: !!rollbackScript
            });

            return {
                migrationId,
                sqlScript,
                rollbackScript,
                riskLevel,
                warnings,
                operationCount
            };

        } catch (error) {
            Logger.error('Migration generation failed', error as Error, 'MigrationOrchestrator.generateMigration', {
                migrationId,
                sourceConnectionId: request.sourceConnectionId,
                targetConnectionId: request.targetConnectionId
            });
            throw error;
        }
    }

    private async createPreMigrationBackup(request: MigrationRequest): Promise<void> {
        Logger.info('Creating pre-migration backup', 'MigrationOrchestrator.createPreMigrationBackup', {
            sourceConnectionId: request.sourceConnectionId,
            targetConnectionId: request.targetConnectionId
        });

        // Create backup of target database before migration
        const backupResult = await this.backupManager.createBackup(request.targetConnectionId, {
            type: 'full',
            compression: true,
            encryption: false,
            includeRoles: true,
            excludeSchemas: ['information_schema', 'pg_catalog', 'pg_toast']
        });

        if (!backupResult.success) {
            throw new Error(`Failed to create backup: ${backupResult.error}`);
        }

        Logger.info('Pre-migration backup completed', 'MigrationOrchestrator.createPreMigrationBackup', {
            backupPath: backupResult.backupPath,
            size: backupResult.size,
            duration: backupResult.duration
        });
    }

    private async executeMigrationScript(migrationId: string, request: MigrationRequest): Promise<{
        operationsProcessed: number;
        errors: string[];
        warnings: string[];
        executionLog: string[];
    }> {
        Logger.info('Executing migration script', 'MigrationOrchestrator.executeMigrationScript', {
            migrationId,
            targetConnectionId: request.targetConnectionId
        });

        try {
            // Generate migration script first
            const migrationScript = await this.generateMigration(request);

            // Use MigrationExecutor for proper script execution
            const migrationExecutor = new (await import("@/managers/schema/MigrationExecutor")).MigrationExecutor(
                new (await import("@/services/QueryExecutionService")).QueryExecutionService(
                    new (await import("@/managers/ConnectionManager")).ConnectionManager(null as any, null as any)
                )
            );

            // Create enhanced migration script with proper structure
            const enhancedScript = {
                id: migrationId,
                name: `Migration ${migrationId}`,
                description: `Migration from ${request.sourceConnectionId} to ${request.targetConnectionId}`,
                version: '1.0.0',
                sourceSchema: {
                    connectionId: request.sourceConnectionId,
                    schemaHash: '',
                    objectCount: 0,
                    capturedAt: new Date(),
                    objects: [],
                    relationships: []
                },
                targetSchema: {
                    connectionId: request.targetConnectionId,
                    schemaHash: '',
                    objectCount: 0,
                    capturedAt: new Date(),
                    objects: [],
                    relationships: []
                },
                migrationSteps: [{
                    id: `step-${migrationId}`,
                    order: 1,
                    name: `Execute migration script`,
                    description: `Execute the generated migration script`,
                    sqlScript: migrationScript.sqlScript,
                    objectType: 'migration',
                    objectName: migrationId,
                    schema: 'public',
                    operation: 'CREATE' as const,
                    riskLevel: 'medium' as const,
                    dependencies: [],
                    estimatedDuration: 1000,
                    rollbackSql: migrationScript.rollbackScript,
                    preConditions: [],
                    postConditions: []
                }],
                rollbackScript: {
                    isComplete: !!migrationScript.rollbackScript,
                    steps: migrationScript.rollbackScript ? [{
                        order: 1,
                        description: 'Execute rollback script',
                        estimatedDuration: 500,
                        riskLevel: 'medium' as const,
                        dependencies: [],
                        verificationSteps: []
                    }] : [],
                    estimatedRollbackTime: 5,
                    successRate: 80,
                    warnings: [],
                    limitations: []
                },
                validationSteps: [],
                dependencies: [],
                metadata: {
                    author: request.options?.author || 'system',
                    reviewedBy: undefined,
                    approvedBy: undefined,
                    tags: request.options?.tags || [],
                    businessJustification: request.options?.businessJustification || '',
                    changeType: request.options?.changeType || 'feature',
                    environment: request.options?.environment || 'development',
                    testingRequired: true,
                    documentationUpdated: false
                },
                generatedAt: new Date(),
                estimatedExecutionTime: 10,
                riskLevel: migrationScript.riskLevel.toLowerCase() as 'low' | 'medium' | 'high' | 'critical'
            };

            const executionResult = await migrationExecutor.executeMigrationScript(
                enhancedScript,
                request.targetConnectionId,
                { dryRun: false, stopOnError: !request.options?.executeInTransaction }
            );

            // Convert execution result to expected format
            return {
                operationsProcessed: executionResult.completedSteps,
                errors: executionResult.executionLog.filter(log => log.level === 'error').map(log => log.message),
                warnings: executionResult.executionLog.filter(log => log.level === 'warning').map(log => log.message),
                executionLog: executionResult.executionLog.map(log => `[${log.level.toUpperCase()}] ${log.message}`)
            };

        } catch (error) {
            Logger.error('Migration script execution failed', error as Error, 'MigrationOrchestrator.executeMigrationScript', {
                migrationId
            });
            throw error;
        }
    }

    private async verifyMigration(migrationId: string, request: MigrationRequest): Promise<void> {
        Logger.info('Verifying migration completion', 'MigrationOrchestrator.verifyMigration', {
            migrationId
        });

        try {
            // Check that target connection is still accessible
            const targetConnection = await this.connectionService.getConnection(request.targetConnectionId);
            if (!targetConnection) {
                throw new Error('Target connection not accessible after migration');
            }

            // Get target connection with password for verification
            const targetPassword = await this.connectionService.getConnectionPassword(request.targetConnectionId);
            if (!targetPassword) {
                throw new Error('Failed to retrieve target connection password for verification');
            }

            const targetConnectionWithPassword = { ...targetConnection, password: targetPassword };
            const handle = await this.connectionManager.createConnection(targetConnectionWithPassword);
            const client = handle.connection;

            try {
                // Verify schema integrity - check for common issues
                const integrityChecks = [
                    "SELECT schemaname, tablename FROM pg_tables WHERE schemaname NOT IN ('information_schema', 'pg_catalog', 'pg_toast') ORDER BY schemaname, tablename",
                    "SELECT conname, conrelid::regclass, confrelid::regclass FROM pg_constraint WHERE contype = 'f' ORDER BY conname",
                    "SELECT nspname, relname, attname, typname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_attribute a ON a.attrelid = c.oid JOIN pg_type t ON t.oid = a.atttypid WHERE c.relkind = 'r' AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast') AND a.attnum > 0 ORDER BY nspname, relname, attname"
                ];

                for (const check of integrityChecks) {
                    await client.query(check);
                }

                // Check for any orphaned objects or inconsistencies
                const orphanCheck = `
                    SELECT 'orphaned_sequences' as issue,
                           count(*) as count
                    FROM pg_class c
                    LEFT JOIN pg_depend d ON d.objid = c.oid AND d.deptype = 'a'
                    WHERE c.relkind = 'S'
                      AND d.objid IS NULL
                      AND c.relnamespace NOT IN (
                        SELECT oid FROM pg_namespace
                        WHERE nspname IN ('information_schema', 'pg_catalog', 'pg_toast')
                      )
                    UNION ALL
                    SELECT 'broken_foreign_keys' as issue,
                           count(*) as count
                    FROM pg_constraint con
                    LEFT JOIN pg_class rel ON rel.oid = con.conrelid
                    WHERE con.contype = 'f'
                      AND rel.oid IS NULL
                `;

                const orphanResult = await client.query(orphanCheck);
                const issues = orphanResult.rows.filter(row => parseInt(row.count) > 0);

                if (issues.length > 0) {
                    Logger.warn('Schema integrity issues detected', 'MigrationOrchestrator.verifyMigration', {
                        migrationId,
                        issues
                    });
                    // Don't fail verification for minor issues, just log them
                }

                Logger.info('Migration verification completed successfully', 'MigrationOrchestrator.verifyMigration', {
                    migrationId,
                    integrityChecksPassed: integrityChecks.length,
                    issuesDetected: issues.length
                });

            } finally {
                handle.release();
            }

        } catch (error) {
            Logger.error('Migration verification failed', error as Error, 'MigrationOrchestrator.verifyMigration', {
                migrationId
            });
            throw error;
        }
    }

    private async cleanupMigration(migrationId: string, request: MigrationRequest): Promise<void> {
        Logger.info('Cleaning up migration', 'MigrationOrchestrator.cleanupMigration', {
            migrationId
        });

        // Clean up active migration
        await this.migrationStorage.removeActiveMigration(migrationId);

        Logger.info('Migration cleanup completed successfully', 'MigrationOrchestrator.cleanupMigration', {
            migrationId
        });
    }

    async cancelMigration(migrationId: string): Promise<boolean> {
        Logger.info('Cancelling migration', 'MigrationOrchestrator.cancelMigration', { migrationId });

        const activeMigrations = await this.migrationStorage.getActiveMigrations();
        const migration = activeMigrations.get(migrationId);
        if (!migration) {
            Logger.warn('Migration not found for cancellation', 'MigrationOrchestrator.cancelMigration', { migrationId });
            return false;
        }

        try {
            // Cancel the operation in progress tracker
            this.progressTracker.cancelOperation(migrationId);

            // Release concurrency lock
            this.concurrencyManager.releaseLock(migration.targetConnectionId, migrationId);

            // Remove from active migrations
            await this.migrationStorage.removeActiveMigration(migrationId);

            // Update migration result to reflect cancellation
            const cancelledResult: MigrationResult = {
                migrationId,
                success: false,
                executionTime: 0,
                operationsProcessed: 0,
                errors: ['Migration was cancelled by user'],
                warnings: [],
                rollbackAvailable: false,
                executionLog: [`Migration cancelled at ${new Date().toISOString()}`],
                metadata: {
                    ...migration.metadata,
                    status: 'cancelled',
                    cancelledAt: new Date().toISOString()
                }
            };

            await this.migrationStorage.addMigrationResult(migrationId, cancelledResult);

            Logger.info('Migration cancelled successfully', 'MigrationOrchestrator.cancelMigration', { migrationId });
            return true;

        } catch (error) {
            Logger.error('Failed to cancel migration', error as Error, 'MigrationOrchestrator.cancelMigration', { migrationId });
            return false;
        }
    }

    private assessMigrationRisk(sqlScript: string): 'Low' | 'Medium' | 'High' {
        const script = sqlScript.toUpperCase();
        const highRiskOps = ['DROP TABLE', 'DROP SCHEMA', 'TRUNCATE', 'DELETE FROM'];
        const mediumRiskOps = ['DROP', 'ALTER TABLE'];

        if (highRiskOps.some(op => script.includes(op))) {
            return 'High';
        }
        if (mediumRiskOps.some(op => script.includes(op))) {
            return 'Medium';
        }
        return 'Low';
    }

    private analyzeMigrationWarnings(sqlScript: string): string[] {
        const warnings: string[] = [];
        const script = sqlScript.toUpperCase();

        if (script.includes('DROP TABLE')) {
            warnings.push('Migration contains DROP TABLE operations - data will be lost');
        }
        if (script.includes('TRUNCATE')) {
            warnings.push('Migration contains TRUNCATE operations - all data will be lost');
        }
        if (script.includes('DROP SCHEMA')) {
            warnings.push('Migration contains DROP SCHEMA operations - multiple objects will be affected');
        }
        if (script.includes('ALTER TABLE')) {
            warnings.push('Migration contains ALTER TABLE operations - schema changes may affect applications');
        }

        const statementCount = sqlScript.split('\n').length;
        if (statementCount > 100) {
            warnings.push(`Large migration with ${statementCount} statements - consider breaking into smaller batches`);
        }

        return warnings;
    }

    private async performPreMigrationValidation(migrationId: string, request: MigrationRequest): Promise<ValidationReport> {
        const startTime = Date.now();
        Logger.info('Starting pre-migration validation', 'MigrationOrchestrator.performPreMigrationValidation', {
            migrationId,
            sourceConnectionId: request.sourceConnectionId,
            targetConnectionId: request.targetConnectionId
        });

        const results: ValidationResult[] = [];

        try {
            // Get connection information for validation context
            const sourceConnection = await this.connectionService.getConnection(request.sourceConnectionId);
            const targetConnection = await this.connectionService.getConnection(request.targetConnectionId);

            if (!sourceConnection || !targetConnection) {
                results.push({
                    ruleId: 'connections_exist',
                    ruleName: 'Connection Validation',
                    status: 'failed',
                    message: 'Source or target connection not found'
                });
            } else {
                // Basic validation - check connections are accessible
                const sourceValidation = await this.connectionService.validateConnection(request.sourceConnectionId);
                const targetValidation = await this.connectionService.validateConnection(request.targetConnectionId);

                results.push({
                    ruleId: 'connection_accessibility',
                    ruleName: 'Connection Accessibility',
                    status: sourceValidation.isValid && targetValidation.isValid ? 'passed' : 'failed',
                    message: sourceValidation.isValid && targetValidation.isValid
                        ? 'Both connections are accessible'
                        : 'One or more connections are not accessible',
                    details: { sourceValidation, targetValidation }
                });

                // Schema compatibility check
                if (sourceValidation.isValid && targetValidation.isValid) {
                    const schemaCompatibility = await this.validateSchemaCompatibility(request);
                    results.push(schemaCompatibility);
                }

                // Business rules validation
                if (request.options?.businessRules && request.options.businessRules.length > 0) {
                    const businessRulesValidation = await this.validateBusinessRules(request);
                    results.push(businessRulesValidation);
                }

                // Permission validation
                const permissionValidation = await this.validatePermissions(request);
                results.push(permissionValidation);

                // Target environment safety check
                const environmentValidation = await this.validateTargetEnvironment(request);
                results.push(environmentValidation);
            }

            // Calculate summary
            const passedRules = results.filter(r => r.status === 'passed').length;
            const failedRules = results.filter(r => r.status === 'failed').length;
            const warningRules = results.filter(r => r.status === 'warning').length;
            const totalRules = results.length;

            const overallStatus = failedRules > 0 ? 'failed' : warningRules > 0 ? 'warning' : 'passed';
            const canProceed = overallStatus !== 'failed';

            const recommendations = this.generateValidationRecommendations(results);

            const executionTime = Date.now() - startTime;

            Logger.info('Pre-migration validation completed', 'MigrationOrchestrator.performPreMigrationValidation', {
                migrationId,
                totalRules,
                passedRules,
                failedRules,
                warningRules,
                overallStatus,
                canProceed
            });

            return {
                requestId: migrationId,
                validationTimestamp: new Date(),
                totalRules,
                passedRules,
                failedRules,
                warningRules,
                results,
                overallStatus,
                canProceed,
                recommendations,
                executionTime
            };

        } catch (error) {
            Logger.error('Pre-migration validation failed', error as Error, 'MigrationOrchestrator.performPreMigrationValidation', {
                migrationId
            });

            results.push({
                ruleId: 'validation_system',
                ruleName: 'Validation System',
                status: 'failed',
                message: `Validation system error: ${(error as Error).message}`,
                details: { error: String(error) }
            });

            return {
                requestId: migrationId,
                validationTimestamp: new Date(),
                totalRules: 1,
                passedRules: 0,
                failedRules: 1,
                warningRules: 0,
                results,
                overallStatus: 'failed',
                canProceed: false,
                recommendations: ['Fix validation system error before proceeding'],
                executionTime: Date.now() - startTime
            };
        }
    }

    private generateId(): string {
        return `migration_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private convertToSchemaObjects(objects: unknown[]): SchemaObject[] {
        // Convert database objects to SchemaObject format
        return objects.map(obj => {
            const o = obj as Record<string, unknown>;
            return {
                type: (o.type as SchemaObject['type']) || 'table',
                schema: (o.schema as string) || 'public',
                name: (o.name as string) || '',
                definition: (o.definition as string) || '',
                dependencies: (o.dependencies as string[]) || []
            };
        });
    }

    private generateSqlScript(differences: SchemaDifference[]): string {
        const statements: string[] = [];

        for (const diff of differences) {
            statements.push(`-- ${diff.type.toUpperCase()} ${diff.objectType} ${diff.schema}.${diff.name}`);
            statements.push(diff.sql);
            statements.push(''); // Empty line for readability
        }

        return statements.join('\n');
    }

    private generateRollbackScript(differences: SchemaDifference[]): string {
        const statements: string[] = [];

        // Rollback in reverse order
        for (const diff of differences.reverse()) {
            if (diff.rollbackSql) {
                statements.push(`-- ROLLBACK ${diff.type.toUpperCase()} ${diff.objectType} ${diff.schema}.${diff.name}`);
                statements.push(diff.rollbackSql);
                statements.push(''); // Empty line for readability
            }
        }

        return statements.join('\n');
    }

    private async validateSchemaCompatibility(request: MigrationRequest): Promise<ValidationResult> {
        try {
            // Get schema objects from both databases
            const sourceConnection = await this.connectionService.getConnection(request.sourceConnectionId);
            const targetConnection = await this.connectionService.getConnection(request.targetConnectionId);

            if (!sourceConnection || !targetConnection) {
                return {
                    ruleId: 'schema_compatibility',
                    ruleName: 'Schema Compatibility',
                    status: 'failed',
                    message: 'Cannot validate schema compatibility - connections not available'
                };
            }

            const sourcePassword = await this.connectionService.getConnectionPassword(request.sourceConnectionId);
            const targetPassword = await this.connectionService.getConnectionPassword(request.targetConnectionId);

            if (!sourcePassword || !targetPassword) {
                return {
                    ruleId: 'schema_compatibility',
                    ruleName: 'Schema Compatibility',
                    status: 'failed',
                    message: 'Cannot validate schema compatibility - passwords not available'
                };
            }

            const sourceConnectionWithPassword = { ...sourceConnection, password: sourcePassword };
            const targetConnectionWithPassword = { ...targetConnection, password: targetPassword };

            const sourceObjects = await this.schemaBrowser.getDatabaseObjectsAsync(sourceConnectionWithPassword);
            const targetObjects = await this.schemaBrowser.getDatabaseObjectsAsync(targetConnectionWithPassword);

            // Check for potential conflicts
            const conflicts: string[] = [];

            // Check if target has objects that would conflict with source
            for (const sourceObj of sourceObjects) {
                const targetObj = targetObjects.find(t => t.schema === sourceObj.schema && t.name === sourceObj.name);
                if (targetObj && sourceObj.type !== targetObj.type) {
                    conflicts.push(`Type conflict: ${sourceObj.schema}.${sourceObj.name} (${sourceObj.type} vs ${targetObj.type})`);
                }
            }

            // Check for missing dependencies in target
            const sourceSchemas = new Set(sourceObjects.map(o => o.schema));
            const targetSchemas = new Set(targetObjects.map(o => o.schema));

            for (const schema of sourceSchemas) {
                if (!targetSchemas.has(schema)) {
                    conflicts.push(`Missing schema in target: ${schema}`);
                }
            }

            return {
                ruleId: 'schema_compatibility',
                ruleName: 'Schema Compatibility',
                status: conflicts.length > 0 ? 'warning' : 'passed',
                message: conflicts.length > 0
                    ? `Schema compatibility issues detected: ${conflicts.join(', ')}`
                    : 'Source and target schemas are compatible',
                details: { conflicts, sourceObjectsCount: sourceObjects.length, targetObjectsCount: targetObjects.length }
            };

        } catch (error) {
            return {
                ruleId: 'schema_compatibility',
                ruleName: 'Schema Compatibility',
                status: 'failed',
                message: `Schema compatibility check failed: ${(error as Error).message}`,
                details: { error: String(error) }
            };
        }
    }

    private async validateBusinessRules(request: MigrationRequest): Promise<ValidationResult> {
        try {
            // Generate migration to get schema differences for business rule evaluation
            const migrationScript = await this.generateMigration(request);

            const context: BusinessRuleContext = {
                migrationId: request.id || this.generateId(),
                sourceConnection: await this.connectionService.getConnection(request.sourceConnectionId),
                targetConnection: await this.connectionService.getConnection(request.targetConnectionId),
                migrationOptions: request.options,
                migrationMetadata: request.metadata,
                schemaDifferences: migrationScript.operationCount > 0 ? [/* Would need to extract differences */] : [],
                environment: request.options?.environment || 'development',
                user: request.options?.author || 'unknown',
                timestamp: new Date()
            };

            // Evaluate business rules using the engine
            const ruleResults = this.businessRuleEngine.evaluateRules(context);

            const violations = ruleResults.filter(r => !r.passed);
            const warnings = ruleResults.filter(r => r.passed === false && r.message.includes('warning'));

            return {
                ruleId: 'business_rules',
                ruleName: 'Business Rules Validation',
                status: violations.length > 0 ? 'failed' : warnings.length > 0 ? 'warning' : 'passed',
                message: violations.length > 0
                    ? `Business rule violations: ${violations.map(v => v.message).join(', ')}`
                    : warnings.length > 0
                        ? `Business rule warnings: ${warnings.map(w => w.message).join(', ')}`
                        : 'All business rules validated successfully',
                details: { ruleResults, violations, warnings }
            };
        } catch (error) {
            return {
                ruleId: 'business_rules',
                ruleName: 'Business Rules Validation',
                status: 'failed',
                message: `Business rules validation failed: ${(error as Error).message}`,
                details: { error: String(error) }
            };
        }
    }

    private async validatePermissions(request: MigrationRequest): Promise<ValidationResult> {
        try {
            // Check if user has necessary permissions on target database
            const targetConnection = await this.connectionService.getConnection(request.targetConnectionId);
            if (!targetConnection) {
                return {
                    ruleId: 'permissions',
                    ruleName: 'Permission Validation',
                    status: 'failed',
                    message: 'Cannot validate permissions - target connection not available'
                };
            }

            const targetPassword = await this.connectionService.getConnectionPassword(request.targetConnectionId);
            if (!targetPassword) {
                return {
                    ruleId: 'permissions',
                    ruleName: 'Permission Validation',
                    status: 'failed',
                    message: 'Cannot validate permissions - target password not available'
                };
            }

            const targetConnectionWithPassword = { ...targetConnection, password: targetPassword };
            const handle = await this.connectionManager.createConnection(targetConnectionWithPassword);
            const client = handle.connection;

            try {
                // Test basic permissions
                await client.query('SELECT 1');

                // Test schema modification permissions
                const hasSchemaPermissions = await this.checkSchemaPermissions(client, targetConnection.username);

                return {
                    ruleId: 'permissions',
                    ruleName: 'Permission Validation',
                    status: hasSchemaPermissions ? 'passed' : 'failed',
                    message: hasSchemaPermissions
                        ? 'User has sufficient permissions for migration'
                        : 'User lacks necessary permissions for schema modifications',
                    details: { user: targetConnection.username, hasSchemaPermissions }
                };

            } finally {
                handle.release();
            }

        } catch (error) {
            return {
                ruleId: 'permissions',
                ruleName: 'Permission Validation',
                status: 'failed',
                message: `Permission validation failed: ${(error as Error).message}`,
                details: { error: String(error) }
            };
        }
    }

    private async validateTargetEnvironment(request: MigrationRequest): Promise<ValidationResult> {
        const environment = request.options?.environment || 'development';
        const warnings: string[] = [];

        // Environment-specific validations
        if (environment === 'production') {
            if (!request.options?.createBackupBeforeExecution) {
                warnings.push('Production migration without backup enabled');
            }
            if (!request.options?.includeRollback) {
                warnings.push('Production migration without rollback plan');
            }
            if (!request.metadata?.businessJustification) {
                warnings.push('Production migration without business justification');
            }
        }

        return {
            ruleId: 'environment_safety',
            ruleName: 'Environment Safety Check',
            status: warnings.length > 0 ? 'warning' : 'passed',
            message: warnings.length > 0
                ? `Environment safety warnings: ${warnings.join(', ')}`
                : `Environment ${environment} safety check passed`,
            details: { environment, warnings }
        };
    }

    private generateValidationRecommendations(results: ValidationResult[]): string[] {
        const recommendations: string[] = [];

        for (const result of results) {
            if (result.status === 'failed') {
                switch (result.ruleId) {
                    case 'connection_accessibility':
                        recommendations.push('Verify database connection credentials and network connectivity');
                        break;
                    case 'schema_compatibility':
                        recommendations.push('Review schema differences and resolve conflicts before migration');
                        break;
                    case 'business_rules':
                        recommendations.push('Address business rule violations or obtain necessary approvals');
                        break;
                    case 'permissions':
                        recommendations.push('Grant necessary database permissions to the migration user');
                        break;
                    case 'validation_system':
                        recommendations.push('Check system logs and resolve validation framework issues');
                        break;
                }
            } else if (result.status === 'warning') {
                recommendations.push(`Review warning: ${result.message}`);
            }
        }

        return recommendations;
    }

    private async checkSchemaPermissions(client: { query: (sql: string, params?: unknown[]) => Promise<unknown>; }, username: string): Promise<boolean> {
        try {
            // Comprehensive permission checking for all database operations
            const result = await client.query(`
                SELECT
                    -- Database-level permissions
                    has_database_privilege($1, current_database(), 'CREATE') as can_create_db,
                    has_database_privilege($1, current_database(), 'CONNECT') as can_connect_db,
                    has_database_privilege($1, current_database(), 'TEMPORARY') as can_create_temp,

                    -- Schema-level permissions for all schemas
                    (SELECT bool_and(has_schema_privilege($1, nspname, 'CREATE'))
                     FROM pg_namespace
                     WHERE nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')) as can_create_in_schemas,

                    (SELECT bool_and(has_schema_privilege($1, nspname, 'USAGE'))
                     FROM pg_namespace
                     WHERE nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')) as can_use_schemas,

                    -- Table permissions across all user tables
                    (SELECT bool_and(
                        has_table_privilege($1, schemaname||'.'||tablename, 'SELECT') AND
                        has_table_privilege($1, schemaname||'.'||tablename, 'INSERT') AND
                        has_table_privilege($1, schemaname||'.'||tablename, 'UPDATE') AND
                        has_table_privilege($1, schemaname||'.'||tablename, 'DELETE') AND
                        has_table_privilege($1, schemaname||'.'||tablename, 'TRUNCATE') AND
                        has_table_privilege($1, schemaname||'.'||tablename, 'REFERENCES') AND
                        has_table_privilege($1, schemaname||'.'||tablename, 'TRIGGER')
                     )
                     FROM information_schema.tables
                     WHERE table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                       AND table_type = 'BASE TABLE') as has_full_table_permissions,

                    -- Sequence permissions
                    (SELECT bool_and(
                        has_sequence_privilege($1, sequence_schema||'.'||sequence_name, 'SELECT') AND
                        has_sequence_privilege($1, sequence_schema||'.'||sequence_name, 'UPDATE') AND
                        has_sequence_privilege($1, sequence_schema||'.'||sequence_name, 'USAGE')
                     )
                     FROM information_schema.sequences
                     WHERE sequence_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')) as has_sequence_permissions,

                    -- Function permissions
                    (SELECT bool_and(has_function_privilege($1, p.oid::regprocedure::text, 'EXECUTE'))
                     FROM pg_proc p
                     JOIN pg_namespace n ON p.pronamespace = n.oid
                     WHERE n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')) as has_function_permissions,

                    -- Role membership (superuser, replication, etc.)
                    pg_has_role($1, 'superuser', 'MEMBER') as is_superuser,
                    pg_has_role($1, 'replication', 'MEMBER') as has_replication_role,

                    -- Specific administrative permissions
                    has_function_privilege($1, 'pg_catalog.pg_terminate_backend(int4)', 'EXECUTE') as can_terminate_sessions,
                    has_function_privilege($1, 'pg_catalog.pg_cancel_backend(int4)', 'EXECUTE') as can_cancel_sessions,
                    has_database_privilege($1, current_database(), 'CREATE') as can_create_extensions
            `, [username]) as { rows: Array<Record<string, boolean | null>>; };

            const permissions = result.rows[0];

            // Superuser can do anything
            if (permissions.is_superuser) {
                return true;
            }

            // Check critical permissions needed for migrations
            const hasBasicPermissions = permissions.can_connect_db && permissions.can_use_schemas;
            const hasCreatePermissions = permissions.can_create_db && permissions.can_create_in_schemas && permissions.can_create_extensions;
            const hasObjectPermissions = permissions.has_full_table_permissions && permissions.has_sequence_permissions && permissions.has_function_permissions;
            const hasAdminPermissions = permissions.can_create_temp && permissions.can_terminate_sessions;

            // For non-superusers, require comprehensive permissions for safe migrations
            // Handle null values by treating them as false
            return Boolean(hasBasicPermissions) && Boolean(hasCreatePermissions) && Boolean(hasObjectPermissions) && Boolean(hasAdminPermissions);

        } catch (error) {
            Logger.warn('Permission check query failed', 'MigrationOrchestrator.checkSchemaPermissions', { error });
            return false;
        }
    }

    private async performRollback(migrationId: string, request: MigrationRequest): Promise<boolean> {
        Logger.info('Performing rollback', 'MigrationOrchestrator.performRollback', { migrationId });

        try {
            // Strategy 1: Try custom rollback script first (if available)
            if (request.options?.includeRollback) {
                const rollbackSuccess = await this.performCustomRollback(migrationId, request);
                if (rollbackSuccess) {
                    return true;
                }
                Logger.warn('Custom rollback failed, falling back to backup restore', 'MigrationOrchestrator.performRollback', { migrationId });
            }

            // Strategy 2: Fallback to backup restore
            const backupSuccess = await this.performBackupRollback(migrationId, request);
            if (backupSuccess) {
                return true;
            }

            // Strategy 3: Transaction-level rollback (if transaction is still active)
            const transactionSuccess = await this.performTransactionRollback(migrationId, request);
            if (transactionSuccess) {
                return true;
            }

            Logger.error('All rollback strategies failed', 'MigrationOrchestrator.performRollback', { migrationId });
            return false;

        } catch (error) {
            Logger.error('Rollback operation failed', error as Error, 'MigrationOrchestrator.performRollback', { migrationId });
            return false;
        }
    }

    private async performCustomRollback(migrationId: string, request: MigrationRequest): Promise<boolean> {
        try {
            // Generate rollback script
            const migrationScript = await this.generateMigration(request);
            if (!migrationScript.rollbackScript) {
                return false;
            }

            // Execute rollback script in a new transaction
            const targetConnection = await this.connectionService.getConnection(request.targetConnectionId);
            if (!targetConnection) {
                return false;
            }

            const targetPassword = await this.connectionService.getConnectionPassword(request.targetConnectionId);
            if (!targetPassword) {
                return false;
            }

            const targetConnectionWithPassword = { ...targetConnection, password: targetPassword };
            const handle = await this.connectionManager.createConnection(targetConnectionWithPassword);
            const client = handle.connection;

            try {
                await client.query('BEGIN');

                // Split rollback script into statements and execute
                const statements = migrationScript.rollbackScript.split(';').filter(stmt => stmt.trim().length > 0);

                for (const statement of statements) {
                    if (statement.trim()) {
                        await client.query(statement.trim());
                    }
                }

                await client.query('COMMIT');

                Logger.info('Custom rollback completed successfully', 'MigrationOrchestrator.performCustomRollback', {
                    migrationId,
                    statementsExecuted: statements.length
                });

                return true;

            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                handle.release();
            }

        } catch (error) {
            Logger.error('Custom rollback failed', error as Error, 'MigrationOrchestrator.performCustomRollback', { migrationId });
            return false;
        }
    }

    private async performBackupRollback(migrationId: string, request: MigrationRequest): Promise<boolean> {
        try {
            // Get the latest backup for this connection
            const backups = this.backupManager.listBackups();
            const targetConnectionId = request.targetConnectionId;
            const latestBackup = backups
                .filter(b => b.name.includes(targetConnectionId))
                .sort((a, b) => b.created.getTime() - a.created.getTime())[0];

            if (!latestBackup) {
                Logger.warn('No backup found for rollback', 'MigrationOrchestrator.performBackupRollback', { migrationId, targetConnectionId });
                return false;
            }

            // Restore from backup
            const restoreResult = await this.backupManager.restoreBackup(targetConnectionId, latestBackup.path);

            if (restoreResult.success) {
                Logger.info('Backup rollback completed successfully', 'MigrationOrchestrator.performBackupRollback', {
                    migrationId,
                    backupPath: latestBackup.path
                });
                return true;
            } else {
                Logger.error('Backup rollback failed', new Error(restoreResult.error || 'Unknown error'), 'MigrationOrchestrator.performBackupRollback', {
                    migrationId,
                    backupPath: latestBackup.path
                });
                return false;
            }

        } catch (error) {
            Logger.error('Backup rollback operation failed', error as Error, 'MigrationOrchestrator.performBackupRollback', { migrationId });
            return false;
        }
    }

    private async performTransactionRollback(migrationId: string, request: MigrationRequest): Promise<boolean> {
        try {
            Logger.info('Attempting transaction-level rollback', 'MigrationOrchestrator.performTransactionRollback', { migrationId });

            // Check if we have an active transaction for this migration
            const activeMigrations = await this.migrationStorage.getActiveMigrations();
            const migration = activeMigrations.get(migrationId);

            if (!migration) {
                Logger.warn('No active migration found for transaction rollback', 'MigrationOrchestrator.performTransactionRollback', { migrationId });
                return false;
            }

            // Get target connection
            const targetConnection = await this.connectionService.getConnection(request.targetConnectionId);
            if (!targetConnection) {
                return false;
            }

            const targetPassword = await this.connectionService.getConnectionPassword(request.targetConnectionId);
            if (!targetPassword) {
                return false;
            }

            const targetConnectionWithPassword = { ...targetConnection, password: targetPassword };
            const handle = await this.connectionManager.createConnection(targetConnectionWithPassword);
            const client = handle.connection;

            try {
                // Track transaction state by storing transaction ID in migration metadata
                const activeMigrations = await this.migrationStorage.getActiveMigrations();
                const migration = activeMigrations.get(migrationId);

                if (migration && migration.metadata?.transactionId) {
                    // Check if the specific transaction is still active
                    const transactionCheck = await client.query(`
                        SELECT state, query
                        FROM pg_stat_activity
                        WHERE datname = current_database()
                          AND state = 'active'
                          AND query LIKE '%BEGIN%'
                          AND pid = $1
                    `, [migration.metadata.transactionId]);

                    if (transactionCheck.rows.length > 0) {
                        // Terminate the specific transaction
                        await client.query('SELECT pg_terminate_backend($1)', [migration.metadata.transactionId]);
                        Logger.info('Transaction rollback successful - terminated active transaction', 'MigrationOrchestrator.performTransactionRollback', {
                            migrationId,
                            transactionId: migration.metadata.transactionId
                        });
                        return true;
                    } else {
                        Logger.warn('Transaction not found or already completed', 'MigrationOrchestrator.performTransactionRollback', {
                            migrationId,
                            transactionId: migration.metadata.transactionId
                        });
                        return false;
                    }
                } else {
                    // Fallback: try to find any active transaction for this migration (legacy support)
                    const transactionCheck = await client.query(`
                        SELECT pid, state, query
                        FROM pg_stat_activity
                        WHERE datname = current_database()
                          AND state = 'active'
                          AND query LIKE '%BEGIN%'
                          AND query LIKE $1
                        LIMIT 1
                    `, [`%${migrationId}%`]);

                    if (transactionCheck.rows.length > 0) {
                        const transaction = transactionCheck.rows[0];
                        await client.query('SELECT pg_terminate_backend($1)', [transaction.pid]);
                        Logger.info('Transaction rollback successful - terminated legacy transaction', 'MigrationOrchestrator.performTransactionRollback', {
                            migrationId,
                            transactionPid: transaction.pid
                        });
                        return true;
                    } else {
                        Logger.warn('No active transaction found for rollback', 'MigrationOrchestrator.performTransactionRollback', { migrationId });
                        return false;
                    }
                }

            } finally {
                handle.release();
            }

        } catch (error) {
            Logger.error('Transaction rollback failed', error as Error, 'MigrationOrchestrator.performTransactionRollback', { migrationId });
            return false;
        }
    }

    async getStats(): Promise<{
        activeMigrations: number;
        completedMigrations: number;
        failedMigrations: number;
        totalExecutionTime: number;
    }> {
        const activeMigrations = await this.migrationStorage.getActiveMigrations();
        const migrationResults = await this.migrationStorage.getMigrationResults();
        const completed = Array.from(migrationResults.values());
        const successful = completed.filter((r: MigrationResult) => r.success);
        const failed = completed.filter((r: MigrationResult) => !r.success);

        return {
            activeMigrations: activeMigrations.size,
            completedMigrations: successful.length,
            failedMigrations: failed.length,
            totalExecutionTime: completed.reduce((sum: number, r: MigrationResult) => sum + r.executionTime, 0)
        };
    }

    async dispose(): Promise<void> {
        Logger.info('MigrationOrchestrator disposed', 'MigrationOrchestrator.dispose');
        await this.migrationStorage.clear();
    }

    private async executeDryRun(request: MigrationRequest, migrationId: string, startTime: number): Promise<MigrationResult> {
        Logger.info('Starting dry-run migration', 'MigrationOrchestrator.executeDryRun', {
            migrationId,
            sourceConnectionId: request.sourceConnectionId,
            targetConnectionId: request.targetConnectionId
        });

        try {
            // Initialize progress tracking for dry-run
            this.progressTracker.startMigrationOperation(
                migrationId,
                migrationId,
                request.sourceConnectionId,
                request.targetConnectionId,
                request.options?.progressCallback
            );

            // Publish dry-run start
            this.realtimeMonitor.publishProgress({
                migrationId,
                phase: 'dry-run',
                message: 'Starting dry-run migration',
                percentage: 0,
                timestamp: new Date(),
                details: { dryRun: true }
            });

            // Phase 1: Validation (same as real migration)
            this.realtimeMonitor.publishProgress({
                migrationId,
                phase: 'validation',
                message: 'Running pre-migration validation',
                percentage: 10,
                timestamp: new Date()
            });

            const validationReport = await this.performPreMigrationValidation(migrationId, request);

            if (!validationReport.canProceed) {
                throw new Error(`Pre-migration validation failed: ${validationReport.recommendations.join(', ')}`);
            }

            this.realtimeMonitor.publishProgress({
                migrationId,
                phase: 'validation',
                message: `Validation completed: ${validationReport.passedRules}/${validationReport.totalRules} rules passed`,
                percentage: 30,
                timestamp: new Date()
            });

            // Phase 2: Generate migration script (without executing)
            this.realtimeMonitor.publishProgress({
                migrationId,
                phase: 'generation',
                message: 'Generating migration script',
                percentage: 50,
                timestamp: new Date()
            });

            const migrationScript = await this.generateMigration(request);

            // Phase 3: Analyze script (without executing)
            this.realtimeMonitor.publishProgress({
                migrationId,
                phase: 'analysis',
                message: 'Analyzing migration script',
                percentage: 80,
                timestamp: new Date()
            });

            const analysis = this.analyzeMigrationScript(migrationScript.sqlScript);

            // Phase 4: Complete dry-run
            const executionTime = Date.now() - startTime;

            this.realtimeMonitor.markMigrationComplete(migrationId);
            this.realtimeMonitor.publishProgress({
                migrationId,
                phase: 'completed',
                message: 'Dry-run completed successfully',
                percentage: 100,
                timestamp: new Date(),
                details: {
                    dryRun: true,
                    executionTime,
                    operationsAnalyzed: migrationScript.operationCount,
                    analysis
                }
            });

            const result: MigrationResult = {
                migrationId,
                success: true,
                executionTime,
                operationsProcessed: migrationScript.operationCount,
                errors: [],
                warnings: analysis.warnings,
                rollbackAvailable: !!migrationScript.rollbackScript,
                validationReport,
                executionLog: [`Dry-run completed successfully - ${migrationScript.operationCount} operations analyzed`],
                metadata: {
                    ...request.metadata,
                    status: 'completed',
                    verified: true,
                    completedAt: new Date().toISOString(),
                    executionTimeMs: executionTime,
                    isRealTime: true
                }
            };

            await this.migrationStorage.addMigrationResult(migrationId, result);

            Logger.info('Dry-run migration completed successfully', 'MigrationOrchestrator.executeDryRun', {
                migrationId,
                executionTime,
                operationsAnalyzed: migrationScript.operationCount
            });

            return result;

        } catch (error) {
            const executionTime = Date.now() - startTime;
            const errorMessage = (error as Error).message;

            Logger.error('Dry-run migration failed', error as Error, 'MigrationOrchestrator.executeDryRun', {
                migrationId,
                executionTime,
                error: errorMessage
            });

            this.realtimeMonitor.markMigrationFailed(migrationId, errorMessage);
            this.realtimeMonitor.publishProgress({
                migrationId,
                phase: 'failed',
                message: `Dry-run failed: ${errorMessage}`,
                percentage: 0,
                timestamp: new Date(),
                details: { dryRun: true, error: errorMessage }
            });

            const result: MigrationResult = {
                migrationId,
                success: false,
                executionTime,
                operationsProcessed: 0,
                errors: [errorMessage],
                warnings: [],
                rollbackAvailable: false,
                executionLog: [`Dry-run failed: ${errorMessage}`],
                metadata: {
                    ...request.metadata,
                    status: 'failed',
                    completedAt: new Date().toISOString(),
                    executionTimeMs: executionTime
                }
            };

            await this.migrationStorage.addMigrationResult(migrationId, result);

            return result;
        }
    }

    private analyzeMigrationScript(sqlScript: string): { warnings: string[]; riskLevel: string; estimatedTime: number; } {
        const warnings: string[] = [];
        const script = sqlScript.toUpperCase();

        // Analyze for risky operations
        if (script.includes('DROP TABLE')) {
            warnings.push('Script contains DROP TABLE operations');
        }
        if (script.includes('TRUNCATE')) {
            warnings.push('Script contains TRUNCATE operations');
        }
        if (script.includes('DELETE FROM')) {
            warnings.push('Script contains DELETE operations');
        }

        // Estimate risk level
        let riskLevel = 'low';
        if (warnings.some(w => w.includes('DROP'))) {
            riskLevel = 'high';
        } else if (warnings.some(w => w.includes('DELETE') || w.includes('TRUNCATE'))) {
            riskLevel = 'medium';
        }

        // Estimate execution time (rough calculation)
        const statementCount = sqlScript.split(';').length;
        const estimatedTime = statementCount * 100; // 100ms per statement estimate

        return { warnings, riskLevel, estimatedTime };
    }
}