import { ConnectionService } from './ConnectionService';
import { ProgressTracker } from './ProgressTracker';
import { ValidationFramework } from './ValidationFramework';
import { PostgreSqlSchemaBrowser } from './PostgreSqlSchemaBrowser';
import { PostgreSqlConnectionManager } from './PostgreSqlConnectionManager';
import { MigrationStorage } from './MigrationStorage';
import { SchemaDiffer, SchemaObject, SchemaDifference } from './SchemaDiffer';
import { BackupManager } from './BackupManager';
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
    private locks: Map<string, MigrationLock> = new Map();
    private readonly lockTimeoutMs = 3600000; // 1 hour

    acquireLock(targetConnectionId: string, migrationId: string): boolean {
        const existingLock = this.locks.get(targetConnectionId);
        if (existingLock) {
            // Check if lock is expired
            if (existingLock.expiresAt < new Date()) {
                this.locks.delete(targetConnectionId);
            } else {
                return false; // Lock is still active
            }
        }

        const lock: MigrationLock = {
            migrationId,
            targetConnectionId,
            acquiredAt: new Date(),
            expiresAt: new Date(Date.now() + this.lockTimeoutMs)
        };

        this.locks.set(targetConnectionId, lock);
        return true;
    }

    releaseLock(targetConnectionId: string, migrationId: string): boolean {
        const lock = this.locks.get(targetConnectionId);
        if (lock && lock.migrationId === migrationId) {
            this.locks.delete(targetConnectionId);
            return true;
        }
        return false;
    }

    isLocked(targetConnectionId: string): boolean {
        const lock = this.locks.get(targetConnectionId);
        if (!lock) return false;

        if (lock.expiresAt < new Date()) {
            this.locks.delete(targetConnectionId);
            return false;
        }

        return true;
    }

    getActiveLocks(): MigrationLock[] {
        const now = new Date();
        // Clean up expired locks
        for (const [key, lock] of this.locks) {
            if (lock.expiresAt < now) {
                this.locks.delete(key);
            }
        }
        return Array.from(this.locks.values());
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
        this.concurrencyManager = new MigrationConcurrencyManager();
    }

    async executeMigration(request: MigrationRequest): Promise<MigrationResult> {
        const migrationId = request.id || this.generateId();
        const startTime = Date.now();

        Logger.info('Starting migration workflow', 'MigrationOrchestrator.executeMigration', {
            migrationId,
            sourceConnectionId: request.sourceConnectionId,
            targetConnectionId: request.targetConnectionId
        });

        try {
            // Check for concurrent migrations on the same target
            if (this.concurrencyManager.isLocked(request.targetConnectionId)) {
                throw new Error(`Migration already in progress on target connection ${request.targetConnectionId}`);
            }

            // Acquire lock for target connection
            if (!this.concurrencyManager.acquireLock(request.targetConnectionId, migrationId)) {
                throw new Error(`Failed to acquire lock for target connection ${request.targetConnectionId}`);
            }

            // Initialize progress tracking
            this.progressTracker.startMigrationOperation(
                migrationId,
                migrationId,
                request.sourceConnectionId,
                request.targetConnectionId,
                request.options?.progressCallback
            );

            // Store active migration
            await this.migrationStorage.addActiveMigration(migrationId, request);

            // Phase 1: Validation
            this.progressTracker.updateMigrationProgress(migrationId, 'validation', 'Running pre-migration validation');

            // Perform comprehensive validation before migration
            const validationReport = await this.performPreMigrationValidation(migrationId, request);

            if (!validationReport.canProceed) {
                this.progressTracker.updateMigrationProgress(migrationId, 'validation', `Validation failed: ${validationReport.overallStatus}`);
                throw new Error(`Pre-migration validation failed: ${validationReport.recommendations.join(', ')}`);
            }

            this.progressTracker.updateMigrationProgress(migrationId, 'validation', `Validation completed: ${validationReport.passedRules}/${validationReport.totalRules} rules passed`);

            // Phase 2: Backup (if requested)
            if (request.options?.createBackupBeforeExecution) {
                this.progressTracker.updateMigrationProgress(migrationId, 'backup', 'Creating pre-migration backup');
                await this.createPreMigrationBackup(request);
            }

            // Phase 3: Execution
            this.progressTracker.updateMigrationProgress(migrationId, 'execution', 'Executing migration script');
            const executionResult = await this.executeMigrationScript(migrationId, request);

            // Phase 4: Verification
            this.progressTracker.updateMigrationProgress(migrationId, 'verification', 'Verifying migration completion');
            await this.verifyMigration(migrationId, request);

            // Phase 5: Cleanup
            this.progressTracker.updateMigrationProgress(migrationId, 'cleanup', 'Finalizing migration');
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
            // Get target connection
            const targetConnection = await this.connectionService.getConnection(request.targetConnectionId);
            if (!targetConnection) {
                throw new Error('Target connection not found');
            }

            // Generate migration script first
            const migrationScript = await this.generateMigration(request);

            // Execute the script using the connection manager
            const targetPassword = await this.connectionService.getConnectionPassword(request.targetConnectionId);
            if (!targetPassword) {
                throw new Error('Failed to retrieve target connection password');
            }

            const targetConnectionWithPassword = { ...targetConnection, password: targetPassword };
            const handle = await this.connectionManager.createConnection(targetConnectionWithPassword);
            const client = handle.connection;
            try {
                await client.query('BEGIN');

                // Split script into statements and execute
                const statements = migrationScript.sqlScript.split(';').filter(stmt => stmt.trim().length > 0);
                let operationsProcessed = 0;

                for (const statement of statements) {
                    if (statement.trim()) {
                        await client.query(statement.trim());
                        operationsProcessed++;
                    }
                }

                await client.query('COMMIT');

                return {
                    operationsProcessed,
                    errors: [],
                    warnings: migrationScript.warnings,
                    executionLog: [`Migration completed successfully with ${operationsProcessed} operations`]
                };

            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                handle.release();
            }

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
        const businessRules = request.options?.businessRules || [];
        const violations: string[] = [];

        for (const rule of businessRules) {
            // Simple rule validation - in a real implementation, this would parse and validate business rules
            if (rule.includes('no_drop_production') && request.options?.environment === 'production') {
                // Check if migration contains DROP operations
                try {
                    const migrationScript = await this.generateMigration(request);
                    if (migrationScript.sqlScript.toUpperCase().includes('DROP')) {
                        violations.push(`Business rule violation: ${rule} - migration contains DROP operations in production`);
                    }
                } catch (error) {
                    violations.push(`Cannot validate business rule ${rule}: ${(error as Error).message}`);
                }
            }
        }

        return {
            ruleId: 'business_rules',
            ruleName: 'Business Rules Validation',
            status: violations.length > 0 ? 'failed' : 'passed',
            message: violations.length > 0
                ? `Business rule violations: ${violations.join(', ')}`
                : 'All business rules validated successfully',
            details: { businessRules, violations }
        };
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

    private async checkSchemaPermissions(client: { query: (sql: string, params?: unknown[]) => Promise<unknown> }, username: string): Promise<boolean> {
        try {
            // Check if user can create/modify schema objects
            const result = await client.query(`
                SELECT
                    has_database_privilege($1, current_database(), 'CREATE') as can_create_db,
                    has_schema_privilege($1, 'public', 'CREATE') as can_create_schema,
                    has_schema_privilege($1, 'public', 'USAGE') as can_use_schema
            `, [username]) as { rows: Array<Record<string, boolean>> };

            const permissions = result.rows[0];
            return permissions.can_create_db && permissions.can_create_schema && permissions.can_use_schema;

        } catch (error) {
            Logger.warn('Permission check query failed', 'MigrationOrchestrator.checkSchemaPermissions', { error });
            return false;
        }
    }

    private async performRollback(migrationId: string, request: MigrationRequest): Promise<boolean> {
        Logger.info('Performing rollback', 'MigrationOrchestrator.performRollback', { migrationId });

        try {
            // Get the latest backup for this connection
            const backups = this.backupManager.listBackups();
            const targetConnectionId = request.targetConnectionId;
            const latestBackup = backups
                .filter(b => b.name.includes(targetConnectionId))
                .sort((a, b) => b.created.getTime() - a.created.getTime())[0];

            if (!latestBackup) {
                Logger.warn('No backup found for rollback', 'MigrationOrchestrator.performRollback', { migrationId, targetConnectionId });
                return false;
            }

            // Restore from backup
            const restoreResult = await this.backupManager.restoreBackup(targetConnectionId, latestBackup.path);

            if (restoreResult.success) {
                Logger.info('Rollback completed successfully', 'MigrationOrchestrator.performRollback', {
                    migrationId,
                    backupPath: latestBackup.path
                });
                return true;
            } else {
                Logger.error('Rollback failed', new Error(restoreResult.error || 'Unknown error'), 'MigrationOrchestrator.performRollback', {
                    migrationId,
                    backupPath: latestBackup.path
                });
                return false;
            }

        } catch (error) {
            Logger.error('Rollback operation failed', error as Error, 'MigrationOrchestrator.performRollback', { migrationId });
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
}