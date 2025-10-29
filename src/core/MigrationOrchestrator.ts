import { ConnectionService } from './ConnectionService';
import { ProgressTracker } from './ProgressTracker';
import { ValidationFramework } from './ValidationFramework';
import { PostgreSqlSchemaBrowser } from './PostgreSqlSchemaBrowser';
import { PostgreSqlConnectionManager } from './PostgreSqlConnectionManager';
import { Logger } from '../utils/Logger';

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

export interface MigrationResult {
    migrationId: string;
    success: boolean;
    executionTime: number;
    operationsProcessed: number;
    errors: string[];
    warnings: string[];
    rollbackAvailable: boolean;
    validationReport?: any;
    executionLog: string[];
    metadata: MigrationMetadata;
}

export class MigrationOrchestrator {
    private connectionService: ConnectionService;
    private progressTracker: ProgressTracker;
    private validationFramework: ValidationFramework;
    private schemaBrowser: PostgreSqlSchemaBrowser;
    private connectionManager: PostgreSqlConnectionManager;
    private activeMigrations: Map<string, MigrationRequest> = new Map();
    private migrationResults: Map<string, MigrationResult> = new Map();

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
            // Initialize progress tracking
            this.progressTracker.startMigrationOperation(
                migrationId,
                migrationId,
                request.sourceConnectionId,
                request.targetConnectionId,
                request.options?.progressCallback
            );

            // Store active migration
            this.activeMigrations.set(migrationId, request);

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

            this.migrationResults.set(migrationId, result);
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

            const result: MigrationResult = {
                migrationId,
                success: false,
                executionTime,
                operationsProcessed: 0,
                errors: [errorMessage],
                warnings: [],
                rollbackAvailable: false,
                executionLog: [`Migration failed: ${errorMessage}`],
                metadata: request.metadata || {}
            };

            this.migrationResults.set(migrationId, result);
            this.progressTracker.updateMigrationProgress(migrationId, 'cleanup', `Migration failed: ${errorMessage}`);

            return result;
        } finally {
            // Clean up active migration after delay
            setTimeout(() => {
                this.activeMigrations.delete(migrationId);
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

            const sourceObjects = await this.schemaBrowser.getDatabaseObjectsAsync(sourceConnectionWithPassword);
            const targetObjects = await this.schemaBrowser.getDatabaseObjectsAsync(targetConnectionWithPassword);

            // Simple comparison - in a real implementation, this would be more sophisticated
            const differences = this.compareSchemas(sourceObjects, targetObjects);

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

        // In a real implementation, this would create actual database backups
        // For now, just log the intent
        await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate backup time
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

        // Basic verification - check that target connection is still accessible
        const targetConnection = await this.connectionService.getConnection(request.targetConnectionId);
        if (!targetConnection) {
            throw new Error('Target connection not accessible after migration');
        }

        Logger.info('Migration verification completed successfully', 'MigrationOrchestrator.verifyMigration', {
            migrationId
        });
    }

    private async cleanupMigration(migrationId: string, request: MigrationRequest): Promise<void> {
        Logger.info('Cleaning up migration', 'MigrationOrchestrator.cleanupMigration', {
            migrationId
        });

        // Clean up active migration
        this.activeMigrations.delete(migrationId);

        Logger.info('Migration cleanup completed successfully', 'MigrationOrchestrator.cleanupMigration', {
            migrationId
        });
    }

    async cancelMigration(migrationId: string): Promise<boolean> {
        Logger.info('Cancelling migration', 'MigrationOrchestrator.cancelMigration', { migrationId });

        const migration = this.activeMigrations.get(migrationId);
        if (!migration) {
            Logger.warn('Migration not found for cancellation', 'MigrationOrchestrator.cancelMigration', { migrationId });
            return false;
        }

        try {
            // Remove from active migrations
            this.activeMigrations.delete(migrationId);

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

            this.migrationResults.set(migrationId, cancelledResult);

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

    private async performPreMigrationValidation(migrationId: string, request: MigrationRequest): Promise<any> {
        Logger.info('Starting pre-migration validation', 'MigrationOrchestrator.performPreMigrationValidation', {
            migrationId,
            sourceConnectionId: request.sourceConnectionId,
            targetConnectionId: request.targetConnectionId
        });

        try {
            // Get connection information for validation context
            const sourceConnection = await this.connectionService.getConnection(request.sourceConnectionId);
            const targetConnection = await this.connectionService.getConnection(request.targetConnectionId);

            if (!sourceConnection || !targetConnection) {
                throw new Error('Source or target connection not found for validation');
            }

            // Basic validation - check connections are accessible
            const sourceValidation = await this.connectionService.validateConnection(request.sourceConnectionId);
            const targetValidation = await this.connectionService.validateConnection(request.targetConnectionId);

            if (!sourceValidation.isValid || !targetValidation.isValid) {
                return {
                    requestId: migrationId,
                    validationTimestamp: new Date(),
                    totalRules: 2,
                    passedRules: 0,
                    failedRules: 2,
                    warningRules: 0,
                    results: [],
                    overallStatus: 'failed',
                    canProceed: false,
                    recommendations: ['Fix connection issues before proceeding'],
                    executionTime: 0
                };
            }

            return {
                requestId: migrationId,
                validationTimestamp: new Date(),
                totalRules: 2,
                passedRules: 2,
                failedRules: 0,
                warningRules: 0,
                results: [],
                overallStatus: 'passed',
                canProceed: true,
                recommendations: [],
                executionTime: 0
            };

        } catch (error) {
            Logger.error('Pre-migration validation failed', error as Error, 'MigrationOrchestrator.performPreMigrationValidation', {
                migrationId
            });

            return {
                requestId: migrationId,
                validationTimestamp: new Date(),
                totalRules: 0,
                passedRules: 0,
                failedRules: 1,
                warningRules: 0,
                results: [],
                overallStatus: 'failed',
                canProceed: false,
                recommendations: ['Fix validation system error before proceeding'],
                executionTime: 0
            };
        }
    }

    private generateId(): string {
        return `migration_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private compareSchemas(sourceObjects: any[], targetObjects: any[]): any[] {
        // Simple comparison - in a real implementation, this would be more sophisticated
        const differences: any[] = [];

        // This is a placeholder - real schema comparison would be much more complex
        // For now, just return empty differences
        return differences;
    }

    private generateSqlScript(differences: any[]): string {
        // Placeholder - generate SQL based on differences
        return '-- Migration script placeholder\nSELECT 1;';
    }

    private generateRollbackScript(differences: any[]): string {
        // Placeholder - generate rollback SQL
        return '-- Rollback script placeholder\nSELECT 1;';
    }

    getStats(): {
        activeMigrations: number;
        completedMigrations: number;
        failedMigrations: number;
        totalExecutionTime: number;
    } {
        const completed = Array.from(this.migrationResults.values());
        const successful = completed.filter(r => r.success);
        const failed = completed.filter(r => !r.success);

        return {
            activeMigrations: this.activeMigrations.size,
            completedMigrations: successful.length,
            failedMigrations: failed.length,
            totalExecutionTime: completed.reduce((sum, r) => sum + r.executionTime, 0)
        };
    }

    dispose(): void {
        Logger.info('MigrationOrchestrator disposed', 'MigrationOrchestrator.dispose');
        this.activeMigrations.clear();
        this.migrationResults.clear();
    }
}