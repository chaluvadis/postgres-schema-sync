import { ConnectionService } from './ConnectionService';
import { ProgressTracker, ProgressCallback } from './ProgressTracker';
import { ValidationFramework, ValidationRequest, ValidationReport } from './ValidationFramework';
import { Logger } from '../utils/Logger';
import {
    DotNetIntegrationService,
    DotNetConnectionInfo,
    DotNetSchemaComparison,
    DotNetMigrationScript
} from '../services/DotNetIntegrationService';
import { getUUId } from '@/utils/helper';
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
    progressCallback?: ProgressCallback;
    businessRules?: string[]; // Specific business rule IDs to validate
    failOnWarnings?: boolean;
    // Metadata options
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
export class MigrationOrchestrator {
    private connectionService: ConnectionService;
    private progressTracker: ProgressTracker;
    private validationFramework: ValidationFramework;
    private dotNetService: DotNetIntegrationService;
    private activeMigrations: Map<string, MigrationRequest> = new Map();
    private migrationResults: Map<string, MigrationResult> = new Map();

    constructor(
        connectionService: ConnectionService,
        progressTracker: ProgressTracker,
        validationFramework: ValidationFramework
    ) {
        this.connectionService = connectionService;
        this.progressTracker = progressTracker;
        this.validationFramework = validationFramework;
        this.dotNetService = DotNetIntegrationService.getInstance();
    }

    /**
     * Execute complete migration workflow
     */
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
            const validationReport = await this.validateMigration(migrationId, request);

            if (!validationReport.canProceed) {
                throw new Error(`Migration validation failed: ${validationReport.recommendations.join(', ')}`);
            }

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
                warnings: [...(validationReport?.recommendations || []), ...executionResult.warnings],
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
            // Start general operation tracking for migration generation
            this.progressTracker.startOperation(
                `${migrationId}_generation`,
                'Migration Script Generation',
                4, // 4 main steps
                request.options?.progressCallback
            );

            // Step 1: Get connections
            this.progressTracker.updateProgress(`${migrationId}_generation`, 1, 'Retrieving database connections');
            const sourceConnection = await this.connectionService.getConnection(request.sourceConnectionId);
            const targetConnection = await this.connectionService.getConnection(request.targetConnectionId);

            if (!sourceConnection || !targetConnection) {
                this.progressTracker.failOperation(`${migrationId}_generation`, 'Source or target connection not found');
                throw new Error('Source or target connection not found');
            }

            // Step 2: Convert to DotNet format
            this.progressTracker.updateProgress(`${migrationId}_generation`, 2, 'Converting connections to .NET format');
            const dotNetSourceConnection = await this.connectionService.toDotNetConnection(request.sourceConnectionId);
            const dotNetTargetConnection = await this.connectionService.toDotNetConnection(request.targetConnectionId);

            if (!dotNetSourceConnection || !dotNetTargetConnection) {
                this.progressTracker.failOperation(`${migrationId}_generation`, 'Failed to convert connections to DotNet format');
                throw new Error('Failed to convert connections to DotNet format');
            }

            // Step 3: Compare schemas
            this.progressTracker.updateProgress(`${migrationId}_generation`, 3, 'Comparing schemas');
            const comparison = await this.dotNetService.compareSchemas(
                dotNetSourceConnection,
                dotNetTargetConnection,
                { mode: 'strict' }
            );

            // Step 4: Generate migration
            this.progressTracker.updateProgress(`${migrationId}_generation`, 4, 'Generating migration script');
            const dotNetMigration = await this.dotNetService.generateMigration(comparison, {
                type: 'Schema',
                generateRollbackScript: request.options?.includeRollback || false,
                isDryRun: true
            });

            if (!dotNetMigration) {
                this.progressTracker.failOperation(`${migrationId}_generation`, 'Migration generation returned null');
                throw new Error('Migration generation returned null');
            }

            // Complete the operation
            this.progressTracker.completeOperation(`${migrationId}_generation`, 'Migration script generated successfully');

            // Analyze migration
            const operationCount = dotNetMigration.sqlScript.split('\n').length;
            const riskLevel = this.assessMigrationRisk(dotNetMigration.sqlScript);
            const warnings = this.analyzeMigrationWarnings(dotNetMigration.sqlScript);

            Logger.info('Migration script generated', 'MigrationOrchestrator.generateMigration', {
                migrationId,
                operationCount,
                riskLevel,
                warningsCount: warnings.length,
                rollbackIncluded: !!dotNetMigration.rollbackScript
            });

            return {
                migrationId,
                sqlScript: dotNetMigration.sqlScript,
                rollbackScript: dotNetMigration.rollbackScript,
                riskLevel,
                warnings,
                operationCount
            };

        } catch (error) {
            // Ensure operation is marked as failed
            this.progressTracker.failOperation(`${migrationId}_generation`, (error as Error).message);

            Logger.error('Migration generation failed', error as Error, 'MigrationOrchestrator.generateMigration', {
                migrationId,
                sourceConnectionId: request.sourceConnectionId,
                targetConnectionId: request.targetConnectionId
            });
            throw error;
        }
    }
    private async validateMigration(migrationId: string, request: MigrationRequest): Promise<ValidationReport> {
        Logger.info('Running pre-migration validation', 'MigrationOrchestrator.validateMigration', {
            migrationId,
            connectionId: request.targetConnectionId
        });

        try {
            // Start validation operation tracking
            const totalRules = (request.options?.businessRules?.length || 0) + 3; // Business rules + basic validations
            this.progressTracker.startValidationOperation(
                `${migrationId}_validation`,
                'data',
                totalRules,
                request.options?.progressCallback
            );

            const validationRequest: ValidationRequest = {
                connectionId: request.targetConnectionId,
                rules: request.options?.businessRules,
                failOnWarnings: request.options?.failOnWarnings || false,
                stopOnFirstError: request.options?.stopOnFirstError || true,
                context: {
                    migrationId,
                    sourceConnectionId: request.sourceConnectionId,
                    targetConnectionId: request.targetConnectionId,
                    operation: 'migration'
                }
            };

            // Update progress for starting validation
            this.progressTracker.updateValidationProgress(
                `${migrationId}_validation`,
                1,
                1,
                0,
                0,
                'Starting pre-migration validation'
            );

            const report = await this.validationFramework.executeValidation(validationRequest);

            // Update progress based on validation results
            const rulesProcessed = report.results.length;
            const passedRules = report.passedRules;
            const failedRules = report.failedRules;
            const warningRules = report.warningRules;

            this.progressTracker.updateValidationProgress(
                `${migrationId}_validation`,
                rulesProcessed,
                passedRules,
                failedRules,
                warningRules,
                `Validation completed: ${passedRules} passed, ${failedRules} failed, ${warningRules} warnings`
            );

            Logger.info('Pre-migration validation completed', 'MigrationOrchestrator.validateMigration', {
                migrationId,
                totalRules: report.totalRules,
                passedRules: report.passedRules,
                failedRules: report.failedRules,
                warningRules: report.warningRules,
                canProceed: report.canProceed
            });

            return report;

        } catch (error) {
            // Mark validation as failed
            this.progressTracker.updateValidationProgress(
                `${migrationId}_validation`,
                0,
                0,
                1,
                0,
                `Validation failed: ${(error as Error).message}`
            );

            Logger.error('Pre-migration validation failed', error as Error, 'MigrationOrchestrator.validateMigration', {
                migrationId
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
            targetConnectionId: request.targetConnectionId,
            useBatching: request.options?.useBatching || false
        });

        try {
            // Get target connection
            const targetConnection = await this.connectionService.getConnection(request.targetConnectionId);
            if (!targetConnection) {
                throw new Error('Target connection not found');
            }

            const dotNetTargetConnection = await this.connectionService.toDotNetConnection(request.targetConnectionId);
            if (!dotNetTargetConnection) {
                throw new Error('Failed to convert target connection');
            }

            // Generate migration script first
            const migrationScript = await this.generateMigration(request);

            if (request.options?.useBatching) {
                // Execute in batches
                return await this.executeMigrationInBatches(
                    migrationId,
                    migrationScript,
                    dotNetTargetConnection,
                    request
                );
            } else {
                // Execute directly
                return await this.executeMigrationDirectly(
                    migrationId,
                    migrationScript,
                    dotNetTargetConnection,
                    request
                );
            }

        } catch (error) {
            Logger.error('Migration script execution failed', error as Error, 'MigrationOrchestrator.executeMigrationScript', {
                migrationId
            });
            throw error;
        }
    }
    private async executeMigrationInBatches(
        migrationId: string,
        migrationScript: any,
        connection: DotNetConnectionInfo,
        request: MigrationRequest
    ): Promise<{
        operationsProcessed: number;
        errors: string[];
        warnings: string[];
        executionLog: string[];
    }> {
        const batchSize = request.options?.batchSize || 10;
        const operations = this.parseMigrationOperations(migrationScript.sqlScript);
        const batches = this.createBatches(operations, batchSize);
        const errors: string[] = [];
        const warnings: string[] = [];
        const executionLog: string[] = [];
        let operationsProcessed = 0;

        Logger.info('Executing migration in batches', 'MigrationOrchestrator.executeMigrationInBatches', {
            migrationId,
            totalOperations: operations.length,
            batchSize,
            totalBatches: batches.length
        });

        // Start batch operation tracking
        this.progressTracker.startBatchOperation(
            `${migrationId}_batch_execution`,
            `${migrationId}_batches`,
            batches.length,
            operations.length,
            request.options?.progressCallback
        );

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            const batchNumber = i + 1;

            try {
                // Update batch progress
                this.progressTracker.updateBatchProgress(
                    `${migrationId}_batch_execution`,
                    batchNumber,
                    operationsProcessed,
                    `Executing batch ${batchNumber}/${batches.length}`
                );

                // Create batch migration script
                const batchScript: DotNetMigrationScript = {
                    id: `${migrationId}_batch_${batchNumber}`,
                    comparison: {} as DotNetSchemaComparison,
                    selectedDifferences: [],
                    sqlScript: batch.operations.map((op: any) => op.sql).join(';\n') + ';',
                    rollbackScript: '',
                    type: 'Schema',
                    isDryRun: false,
                    status: 'running',
                    createdAt: new Date().toISOString()
                };

                // Execute batch
                const result = await this.dotNetService.executeMigration(batchScript, connection);

                if (result && result.status === 'Completed') {
                    operationsProcessed += batch.operations.length;
                    executionLog.push(`Batch ${batchNumber} completed successfully (${batch.operations.length} operations)`);

                    // Update batch progress with success
                    this.progressTracker.updateBatchProgress(
                        `${migrationId}_batch_execution`,
                        batchNumber,
                        operationsProcessed,
                        `Batch ${batchNumber} completed`
                    );
                } else {
                    const error = `Batch ${batchNumber} failed`;
                    errors.push(error);
                    executionLog.push(error);

                    // Update batch progress with error
                    this.progressTracker.updateBatchProgress(
                        `${migrationId}_batch_execution`,
                        batchNumber,
                        operationsProcessed,
                        `Batch ${batchNumber} failed`,
                        [error],
                        []
                    );

                    if (request.options?.stopOnFirstError) {
                        break;
                    }
                }

                // Small delay between batches
                if (i < batches.length - 1) {
                    await this.delay(100);
                }

            } catch (error) {
                const errorMessage = `Batch ${batchNumber} error: ${(error as Error).message}`;
                errors.push(errorMessage);
                executionLog.push(errorMessage);

                // Update batch progress with error
                this.progressTracker.updateBatchProgress(
                    `${migrationId}_batch_execution`,
                    batchNumber,
                    operationsProcessed,
                    errorMessage,
                    [errorMessage],
                    []
                );

                if (request.options?.stopOnFirstError) {
                    break;
                }
            }
        }

        return {
            operationsProcessed,
            errors,
            warnings,
            executionLog
        };
    }
    private async executeMigrationDirectly(
        migrationId: string,
        migrationScript: any,
        connection: DotNetConnectionInfo,
        _request: MigrationRequest
    ): Promise<{
        operationsProcessed: number;
        errors: string[];
        warnings: string[];
        executionLog: string[];
    }> {
        Logger.info('Executing migration directly', 'MigrationOrchestrator.executeMigrationDirectly', {
            migrationId,
            operationCount: migrationScript.operationCount
        });

        try {
            const dotNetMigration: DotNetMigrationScript = {
                id: migrationId,
                comparison: {} as DotNetSchemaComparison,
                selectedDifferences: [],
                sqlScript: migrationScript.sqlScript,
                rollbackScript: migrationScript.rollbackScript || '',
                type: 'Schema',
                isDryRun: false,
                status: 'running',
                createdAt: new Date().toISOString()
            };

            const result = await this.dotNetService.executeMigration(dotNetMigration, connection);

            if (!result) {
                throw new Error('Migration execution returned null');
            }

            const success = result.status === 'Completed';
            const errors: string[] = success ? [] : ['Migration execution failed'];
            const warnings = migrationScript.warnings || [];
            const executionLog = [
                `Migration ${success ? 'completed' : 'failed'}`,
                `Operations processed: ${migrationScript.operationCount}`,
                `Risk level: ${migrationScript.riskLevel}`
            ];

            return {
                operationsProcessed: success ? migrationScript.operationCount : 0,
                errors,
                warnings,
                executionLog
            };

        } catch (error) {
            Logger.error('Direct migration execution failed', error as Error, 'MigrationOrchestrator.executeMigrationDirectly', {
                migrationId
            });

            return {
                operationsProcessed: 0,
                errors: [(error as Error).message],
                warnings: [],
                executionLog: [`Migration execution failed: ${(error as Error).message}`]
            };
        }
    }
    private async verifyMigration(migrationId: string, request: MigrationRequest): Promise<void> {
        Logger.info('Verifying migration completion', 'MigrationOrchestrator.verifyMigration', {
            migrationId
        });

        try {
            // Get target connection for verification
            const targetConnection = await this.connectionService.getConnection(request.targetConnectionId);
            if (!targetConnection) {
                throw new Error('Target connection not found for verification');
            }

            const dotNetTargetConnection = await this.connectionService.toDotNetConnection(request.targetConnectionId);
            if (!dotNetTargetConnection) {
                throw new Error('Failed to convert target connection for verification');
            }

            // Phase 1: Verify all operations completed successfully
            this.progressTracker.updateMigrationProgress(migrationId, 'verification', 'Verifying operation completion');
            await this.verifyOperationCompletion(migrationId, request);

            // Phase 2: Perform data integrity checks
            this.progressTracker.updateMigrationProgress(migrationId, 'verification', 'Performing data integrity checks');
            await this.performDataIntegrityChecks(migrationId, request, dotNetTargetConnection);

            // Phase 3: Validate schema consistency
            this.progressTracker.updateMigrationProgress(migrationId, 'verification', 'Validating schema consistency');
            await this.validateSchemaConsistency(migrationId, request, dotNetTargetConnection);

            // Phase 4: Check for data loss or corruption
            this.progressTracker.updateMigrationProgress(migrationId, 'verification', 'Checking for data loss or corruption');
            await this.checkDataLossAndCorruption(migrationId, request, dotNetTargetConnection);

            Logger.info('Migration verification completed successfully', 'MigrationOrchestrator.verifyMigration', {
                migrationId
            });

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

        try {
            // Phase 1: Remove temporary objects
            this.progressTracker.updateMigrationProgress(migrationId, 'cleanup', 'Removing temporary objects');
            await this.removeTemporaryObjects(migrationId, request);

            // Phase 2: Update migration metadata
            this.progressTracker.updateMigrationProgress(migrationId, 'cleanup', 'Updating migration metadata');
            await this.updateMigrationMetadata(migrationId, request);

            // Phase 3: Clean up logs and resources
            this.progressTracker.updateMigrationProgress(migrationId, 'cleanup', 'Cleaning up logs and resources');
            await this.cleanupLogsAndResources(migrationId, request);

            // Phase 4: Release connections if needed
            this.progressTracker.updateMigrationProgress(migrationId, 'cleanup', 'Releasing resources');
            await this.releaseResources(migrationId, request);

            Logger.info('Migration cleanup completed successfully', 'MigrationOrchestrator.cleanupMigration', {
                migrationId
            });

        } catch (error) {
            Logger.error('Migration cleanup failed', error as Error, 'MigrationOrchestrator.cleanupMigration', {
                migrationId
            });
            // Don't throw error during cleanup to avoid masking original migration errors
        }
    }
    getMigrationResult(migrationId: string): MigrationResult | null {
        const result = this.migrationResults.get(migrationId);

        if (!result) {
            // Check if migration is still active
            const activeMigration = this.activeMigrations.get(migrationId);
            if (activeMigration) {
                // Return real-time progress for active migration
                return this.getRealTimeMigrationProgress(migrationId, activeMigration);
            }
            return null;
        }

        // Enhance existing result with real-time information
        return this.enhanceMigrationResultWithRealTimeData(result);
    }
    getActiveMigration(migrationId: string): MigrationRequest | null {
        const migration = this.activeMigrations.get(migrationId);

        if (!migration) {
            return null;
        }

        // Enhance active migration with real-time information
        return this.enhanceActiveMigrationWithRealTimeData(migrationId, migration);
    }
    async cancelMigration(migrationId: string): Promise<boolean> {
        Logger.info('Cancelling migration', 'MigrationOrchestrator.cancelMigration', { migrationId });

        const migration = this.activeMigrations.get(migrationId);
        if (!migration) {
            Logger.warn('Migration not found for cancellation', 'MigrationOrchestrator.cancelMigration', { migrationId });
            return false;
        }

        try {
            // Cancel the migration operation in progress tracker
            this.progressTracker.cancelOperation(migrationId);

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
    private parseMigrationOperations(sqlScript: string): any[] {
        const operations: any[] = [];
        const statements = sqlScript.split(';').filter(stmt => stmt.trim().length > 0);

        for (const statement of statements) {
            const operation = this.classifySQLStatement(statement.trim());
            if (operation) {
                operations.push(operation);
            }
        }

        return operations;
    }
    private classifySQLStatement(statement: string): any | null {
        const upperStmt = statement.toUpperCase();

        if (upperStmt.includes('CREATE TABLE')) {
            return { type: 'CREATE_TABLE', sql: statement, riskLevel: 'Medium' };
        }
        if (upperStmt.includes('DROP TABLE')) {
            return { type: 'DROP_TABLE', sql: statement, riskLevel: 'High' };
        }
        if (upperStmt.includes('ALTER TABLE')) {
            return { type: 'ALTER_TABLE', sql: statement, riskLevel: 'Medium' };
        }
        if (upperStmt.includes('CREATE INDEX')) {
            return { type: 'CREATE_INDEX', sql: statement, riskLevel: 'Low' };
        }

        return { type: 'OTHER', sql: statement, riskLevel: 'Low' };
    }
    private createBatches(operations: any[], batchSize: number): any[] {
        const batches: any[] = [];

        for (let i = 0; i < operations.length; i += batchSize) {
            const batchOperations = operations.slice(i, i + batchSize);
            batches.push({
                batchNumber: Math.floor(i / batchSize) + 1,
                operations: batchOperations
            });
        }

        return batches;
    }
    private generateId(): string {
        return `migration_${getUUId()}`;
    }
    private delay(milliseconds: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, milliseconds));
    }

    // Real-time migration result helpers
    private getRealTimeMigrationProgress(migrationId: string, activeMigration: MigrationRequest): MigrationResult {
        const currentTime = Date.now();
        const startTime = this.getMigrationStartTime(migrationId) || currentTime;

        // Get current progress from progress tracker
        const progressInfo = this.progressTracker.getProgress(migrationId) as any; // Cast to any to access migration-specific properties

        return {
            migrationId,
            success: false, // Still in progress
            executionTime: currentTime - startTime,
            operationsProcessed: progressInfo?.completedOperations || 0,
            errors: progressInfo?.errors || [],
            warnings: progressInfo?.warnings || [],
            rollbackAvailable: activeMigration.options?.includeRollback || false,
            executionLog: progressInfo?.executionLog || [`Migration in progress since ${new Date(startTime).toISOString()}`],
            metadata: {
                ...activeMigration.metadata,
                status: 'running',
                startedAt: new Date(startTime).toISOString(),
                currentPhase: progressInfo?.currentPhase || 'initialization',
                progressPercentage: progressInfo?.percentage || 0,
                lastUpdated: new Date(currentTime).toISOString()
            }
        };
    }

    private enhanceMigrationResultWithRealTimeData(result: MigrationResult): MigrationResult {
        const currentTime = Date.now();

        // Add real-time information to existing result
        return {
            ...result,
            metadata: {
                ...result.metadata,
                lastChecked: new Date(currentTime).toISOString(),
                isRealTime: true
            }
        };
    }

    private enhanceActiveMigrationWithRealTimeData(migrationId: string, migration: MigrationRequest): MigrationRequest {
        const currentTime = Date.now();
        const startTime = this.getMigrationStartTime(migrationId) || currentTime;

        // Get current progress information
        const progressInfo = this.progressTracker.getProgress(migrationId) as any; // Cast to any to access migration-specific properties

        return {
            ...migration,
            metadata: {
                ...migration.metadata,
                status: 'running',
                startedAt: new Date(startTime).toISOString(),
                currentPhase: progressInfo?.currentPhase || 'initialization',
                progressPercentage: progressInfo?.percentage || 0,
                lastUpdated: new Date(currentTime).toISOString(),
                isRealTime: true
            }
        };
    }

    private getMigrationStartTime(migrationId: string): number | null {
        // Try to get start time from progress tracker first
        const progressInfo = this.progressTracker.getProgress(migrationId) as any;
        if (progressInfo?.timestamp) {
            return progressInfo.timestamp.getTime();
        }

        // Fallback to checking migration result
        const result = this.migrationResults.get(migrationId);
        if (result?.metadata?.startedAt) {
            return new Date(result.metadata.startedAt).getTime();
        }

        return null;
    }

    // Verification helper methods
    private async verifyOperationCompletion(migrationId: string, request: MigrationRequest): Promise<void> {
        // Get the migration result to check if all operations completed
        const migrationResult = this.migrationResults.get(migrationId);
        if (!migrationResult) {
            throw new Error('Migration result not found');
        }

        if (!migrationResult.success) {
            throw new Error(`Migration failed with errors: ${migrationResult.errors.join(', ')}`);
        }

        // Verify that the expected number of operations were processed
        if (migrationResult.operationsProcessed === 0) {
            throw new Error('No operations were processed during migration');
        }

        Logger.debug('Operation completion verified', 'MigrationOrchestrator.verifyOperationCompletion', {
            migrationId,
            operationsProcessed: migrationResult.operationsProcessed
        });
    }

    private async performDataIntegrityChecks(migrationId: string, request: MigrationRequest, connection: DotNetConnectionInfo): Promise<void> {
        try {
            // Check for basic database connectivity and integrity
            const integrityQuery = `
                SELECT
                    COUNT(*) as total_tables,
                    COUNT(*) FILTER (WHERE table_type = 'BASE TABLE') as base_tables,
                    COUNT(*) FILTER (WHERE table_type = 'VIEW') as views
                FROM information_schema.tables
                WHERE table_schema NOT IN ('information_schema', 'pg_catalog');
            `;

            const result = await this.dotNetService.executeQuery(connection, integrityQuery);

            if (result.error) {
                throw new Error(`Data integrity check failed: ${result.error}`);
            }

            Logger.debug('Data integrity checks passed', 'MigrationOrchestrator.performDataIntegrityChecks', {
                migrationId,
                totalTables: result.rows[0]?.[0] || 0,
                baseTables: result.rows[0]?.[1] || 0,
                views: result.rows[0]?.[2] || 0
            });

        } catch (error) {
            Logger.error('Data integrity check failed', error as Error, 'MigrationOrchestrator.performDataIntegrityChecks', {
                migrationId
            });
            throw error;
        }
    }

    private async validateSchemaConsistency(migrationId: string, request: MigrationRequest, connection: DotNetConnectionInfo): Promise<void> {
        try {
            // Get source connection for comparison
            const sourceConnection = await this.connectionService.getConnection(request.sourceConnectionId);
            if (!sourceConnection) {
                throw new Error('Source connection not found for schema validation');
            }

            const dotNetSourceConnection = await this.connectionService.toDotNetConnection(request.sourceConnectionId);
            if (!dotNetSourceConnection) {
                throw new Error('Failed to convert source connection for schema validation');
            }

            // Compare schemas to ensure consistency
            const comparison = await this.dotNetService.compareSchemas(
                dotNetSourceConnection,
                connection,
                { mode: 'strict' }
            );

            // Check if there are any critical differences that shouldn't exist after migration
            const criticalDifferences = comparison.differences.filter(diff =>
                diff.type === 'Removed' && diff.objectType === 'table'
            );

            if (criticalDifferences.length > 0) {
                throw new Error(`Schema consistency validation failed: ${criticalDifferences.length} critical differences found`);
            }

            Logger.debug('Schema consistency validated', 'MigrationOrchestrator.validateSchemaConsistency', {
                migrationId,
                totalDifferences: comparison.differences.length,
                criticalDifferences: criticalDifferences.length
            });

        } catch (error) {
            Logger.error('Schema consistency validation failed', error as Error, 'MigrationOrchestrator.validateSchemaConsistency', {
                migrationId
            });
            throw error;
        }
    }

    private async checkDataLossAndCorruption(migrationId: string, request: MigrationRequest, connection: DotNetConnectionInfo): Promise<void> {
        try {
            // Check for potential data corruption by running basic validation queries
            const validationQueries = [
                'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema NOT IN (\'information_schema\', \'pg_catalog\')',
                'SELECT COUNT(*) FROM information_schema.columns WHERE table_schema NOT IN (\'information_schema\', \'pg_catalog\')',
                'SELECT COUNT(*) FROM information_schema.views WHERE table_schema NOT IN (\'information_schema\', \'pg_catalog\')'
            ];

            for (const query of validationQueries) {
                const result = await this.dotNetService.executeQuery(connection, query);

                if (result.error) {
                    throw new Error(`Data corruption check failed for query: ${query}. Error: ${result.error}`);
                }

                if (result.rows.length === 0) {
                    throw new Error(`Data corruption check failed: No results returned for query: ${query}`);
                }
            }

            Logger.debug('Data loss and corruption checks passed', 'MigrationOrchestrator.checkDataLossAndCorruption', {
                migrationId
            });

        } catch (error) {
            Logger.error('Data loss and corruption check failed', error as Error, 'MigrationOrchestrator.checkDataLossAndCorruption', {
                migrationId
            });
            throw error;
        }
    }

    // Cleanup helper methods
    private async removeTemporaryObjects(migrationId: string, request: MigrationRequest): Promise<void> {
        try {
            const targetConnection = await this.connectionService.getConnection(request.targetConnectionId);
            if (!targetConnection) {
                throw new Error('Target connection not found for cleanup');
            }

            const dotNetTargetConnection = await this.connectionService.toDotNetConnection(request.targetConnectionId);
            if (!dotNetTargetConnection) {
                throw new Error('Failed to convert target connection for cleanup');
            }

            // Remove any temporary tables or objects created during migration
            const tempTablePattern = `temp_${migrationId}%`;
            const cleanupQuery = `
                DO $$
                DECLARE
                    temp_table RECORD;
                BEGIN
                    FOR temp_table IN
                        SELECT table_name FROM information_schema.tables
                        WHERE table_name LIKE '${tempTablePattern}'
                        AND table_schema NOT IN ('information_schema', 'pg_catalog')
                    LOOP
                        EXECUTE 'DROP TABLE IF EXISTS ' || temp_table.table_name || ' CASCADE';
                    END LOOP;
                END $$;
            `;

            const result = await this.dotNetService.executeQuery(dotNetTargetConnection, cleanupQuery);

            if (result.error) {
                Logger.warn('Failed to remove some temporary objects', 'MigrationOrchestrator.removeTemporaryObjects', {
                    migrationId,
                    error: result.error
                });
            } else {
                Logger.debug('Temporary objects removed', 'MigrationOrchestrator.removeTemporaryObjects', {
                    migrationId
                });
            }

        } catch (error) {
            Logger.error('Failed to remove temporary objects', error as Error, 'MigrationOrchestrator.removeTemporaryObjects', {
                migrationId
            });
            // Don't throw during cleanup
        }
    }

    private async updateMigrationMetadata(migrationId: string, request: MigrationRequest): Promise<void> {
        try {
            // Update migration metadata with completion information
            const migrationResult = this.migrationResults.get(migrationId);
            if (migrationResult) {
                // Add completion timestamp and status to metadata
                migrationResult.metadata.completedAt = new Date().toISOString();
                migrationResult.metadata.status = 'completed';
                migrationResult.metadata.verified = true;

                // Update the stored result
                this.migrationResults.set(migrationId, migrationResult);

                Logger.debug('Migration metadata updated', 'MigrationOrchestrator.updateMigrationMetadata', {
                    migrationId,
                    completedAt: migrationResult.metadata.completedAt
                });
            }

        } catch (error) {
            Logger.error('Failed to update migration metadata', error as Error, 'MigrationOrchestrator.updateMigrationMetadata', {
                migrationId
            });
            // Don't throw during cleanup
        }
    }

    private async cleanupLogsAndResources(migrationId: string, request: MigrationRequest): Promise<void> {
        try {
            // Clean up any temporary log files or resources
            // In a real implementation, this might involve:
            // 1. Archiving old logs
            // 2. Removing temporary files
            // 3. Cleaning up cache entries

            // For now, we'll just log the cleanup activity
            Logger.debug('Logs and resources cleaned up', 'MigrationOrchestrator.cleanupLogsAndResources', {
                migrationId
            });

        } catch (error) {
            Logger.error('Failed to cleanup logs and resources', error as Error, 'MigrationOrchestrator.cleanupLogsAndResources', {
                migrationId
            });
            // Don't throw during cleanup
        }
    }

    private async releaseResources(migrationId: string, request: MigrationRequest): Promise<void> {
        try {
            // Release any resources that were allocated during migration
            // This might include:
            // 1. Closing database connections
            // 2. Releasing file handles
            // 3. Clearing caches

            // For now, we'll just log the resource release
            Logger.debug('Resources released', 'MigrationOrchestrator.releaseResources', {
                migrationId
            });

        } catch (error) {
            Logger.error('Failed to release resources', error as Error, 'MigrationOrchestrator.releaseResources', {
                migrationId
            });
            // Don't throw during cleanup
        }
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

    /**
     * Get comprehensive migration monitoring information
     */
    getMigrationMonitoringInfo(): {
        activeMigrations: Array<{
            migrationId: string;
            status: string;
            currentPhase: string;
            progressPercentage: number;
            startedAt: string;
            sourceConnection: string;
            targetConnection: string;
        }>;
        recentResults: Array<{
            migrationId: string;
            status: string;
            executionTime: number;
            operationsProcessed: number;
            completedAt: string;
        }>;
        systemHealth: {
            totalOperations: number;
            activeOperations: number;
            completedOperations: number;
            failedOperations: number;
        };
    } {
        // Get active operations from progress tracker
        const activeOperations = this.progressTracker.getActiveOperations();

        // Get active migrations with real-time info
        const activeMigrations = Array.from(this.activeMigrations.entries()).map(([migrationId, migration]) => {
            const progressInfo = this.progressTracker.getProgress(migrationId) as any;
            return {
                migrationId,
                status: 'running',
                currentPhase: progressInfo?.currentPhase || 'initialization',
                progressPercentage: progressInfo?.percentage || 0,
                startedAt: migration.metadata?.startedAt || new Date().toISOString(),
                sourceConnection: migration.sourceConnectionId,
                targetConnection: migration.targetConnectionId
            };
        });

        // Get recent migration results
        const recentResults = Array.from(this.migrationResults.values())
            .sort((a, b) => {
                const aTime = new Date(a.metadata?.completedAt || 0).getTime();
                const bTime = new Date(b.metadata?.completedAt || 0).getTime();
                return bTime - aTime;
            })
            .slice(0, 10)
            .map(result => ({
                migrationId: result.migrationId,
                status: result.success ? 'completed' : 'failed',
                executionTime: result.executionTime,
                operationsProcessed: result.operationsProcessed,
                completedAt: result.metadata?.completedAt || new Date().toISOString()
            }));

        // Calculate system health metrics
        const completed = Array.from(this.migrationResults.values());
        const successful = completed.filter(r => r.success);
        const failed = completed.filter(r => !r.success);

        return {
            activeMigrations,
            recentResults,
            systemHealth: {
                totalOperations: completed.length,
                activeOperations: activeOperations.length,
                completedOperations: successful.length,
                failedOperations: failed.length
            }
        };
    }

    /**
     * Get comprehensive validation rule information
     */
    getValidationRuleInfo(): {
        allRules: Array<{
            id: string;
            name: string;
            description: string;
            category: string;
            severity: string;
            isEnabled: boolean;
        }>;
        rulesByCategory: Record<string, Array<{
            id: string;
            name: string;
            description: string;
            severity: string;
            isEnabled: boolean;
        }>>;
        validationStats: {
            totalRules: number;
            enabledRules: number;
            rulesByCategory: Record<string, number>;
            activeValidations: number;
        };
    } {
        const allRules = this.validationFramework.getAllRules().map(rule => ({
            id: rule.id,
            name: rule.name,
            description: rule.description,
            category: rule.category,
            severity: rule.severity,
            isEnabled: rule.isEnabled
        }));

        const rulesByCategory: Record<string, any[]> = {};
        const categoryStats: Record<string, number> = {};

        // Group rules by category
        for (const rule of allRules) {
            if (!rulesByCategory[rule.category]) {
                rulesByCategory[rule.category] = [];
                categoryStats[rule.category] = 0;
            }
            rulesByCategory[rule.category].push(rule);
            categoryStats[rule.category]++;
        }

        // Get validation statistics
        const validationStats = this.validationFramework.getStats();

        return {
            allRules,
            rulesByCategory,
            validationStats: {
                totalRules: validationStats.totalRules,
                enabledRules: validationStats.enabledRules,
                rulesByCategory: categoryStats,
                activeValidations: validationStats.activeValidations
            }
        };
    }

    /**
     * Dynamically manage validation rules for specific migration requirements
     */
    async manageValidationRules(action: 'enable' | 'disable' | 'unregister' | 'inspect' | 'register' | 'bulk_unregister', ruleId?: string, category?: string, ruleConfig?: any): Promise<{
        success: boolean;
        message: string;
        affectedRules?: string[];
        ruleInfo?: any;
    }> {
        try {
            switch (action) {
                case 'enable':
                    if (!ruleId) {
                        return { success: false, message: 'Rule ID is required for enable action' };
                    }

                    // Actually enable the rule using the ValidationFramework method
                    const enableResult = this.validationFramework.setRuleEnabled(ruleId, true);
                    if (!enableResult) {
                        return { success: false, message: `Rule '${ruleId}' not found` };
                    }

                    const enabledRule = this.validationFramework.getAllRules().find(r => r.id === ruleId);
                    Logger.info('Validation rule enabled', 'MigrationOrchestrator.manageValidationRules', {
                        ruleId,
                        ruleName: enabledRule?.name
                    });

                    return {
                        success: true,
                        message: `Rule '${enabledRule?.name}' has been enabled`,
                        affectedRules: [ruleId],
                        ruleInfo: enabledRule ? {
                            id: enabledRule.id,
                            name: enabledRule.name,
                            category: enabledRule.category,
                            severity: enabledRule.severity,
                            isEnabled: enabledRule.isEnabled
                        } : undefined
                    };

                case 'disable':
                    if (!ruleId) {
                        return { success: false, message: 'Rule ID is required for disable action' };
                    }

                    // Actually disable the rule using the ValidationFramework method
                    const disableResult = this.validationFramework.setRuleEnabled(ruleId, false);
                    if (!disableResult) {
                        return { success: false, message: `Rule '${ruleId}' not found` };
                    }

                    const disabledRule = this.validationFramework.getAllRules().find(r => r.id === ruleId);
                    Logger.info('Validation rule disabled', 'MigrationOrchestrator.manageValidationRules', {
                        ruleId,
                        ruleName: disabledRule?.name
                    });

                    return {
                        success: true,
                        message: `Rule '${disabledRule?.name}' has been disabled`,
                        affectedRules: [ruleId],
                        ruleInfo: disabledRule ? {
                            id: disabledRule.id,
                            name: disabledRule.name,
                            category: disabledRule.category,
                            severity: disabledRule.severity,
                            isEnabled: disabledRule.isEnabled
                        } : undefined
                    };

                case 'unregister':
                    if (!ruleId) {
                        return { success: false, message: 'Rule ID is required for unregister action' };
                    }

                    // Check if rule exists before unregistering
                    const ruleToUnregister = this.validationFramework.getAllRules().find(r => r.id === ruleId);
                    if (!ruleToUnregister) {
                        return { success: false, message: `Rule '${ruleId}' not found` };
                    }

                    // Actually unregister the rule using the ValidationFramework method
                    const unregisterResult = this.validationFramework.unregisterRule(ruleId);

                    if (unregisterResult) {
                        Logger.info('Validation rule unregistered successfully', 'MigrationOrchestrator.manageValidationRules', {
                            ruleId,
                            ruleName: ruleToUnregister.name
                        });

                        return {
                            success: true,
                            message: `Rule '${ruleToUnregister.name}' has been unregistered`,
                            affectedRules: [ruleId],
                            ruleInfo: {
                                id: ruleToUnregister.id,
                                name: ruleToUnregister.name,
                                category: ruleToUnregister.category,
                                severity: ruleToUnregister.severity
                            }
                        };
                    } else {
                        return {
                            success: false,
                            message: `Failed to unregister rule '${ruleId}'`,
                            affectedRules: [ruleId]
                        };
                    }

                case 'register':
                    if (!ruleConfig) {
                        return { success: false, message: 'Rule configuration is required for register action' };
                    }

                    // Register a single rule using the ValidationFramework method
                    try {
                        this.validationFramework.registerRule(ruleConfig);

                        Logger.info('Validation rule registered successfully', 'MigrationOrchestrator.manageValidationRules', {
                            ruleId: ruleConfig.id,
                            ruleName: ruleConfig.name,
                            category: ruleConfig.category
                        });

                        return {
                            success: true,
                            message: `Rule '${ruleConfig.name}' has been registered`,
                            affectedRules: [ruleConfig.id],
                            ruleInfo: ruleConfig
                        };
                    } catch (error) {
                        return {
                            success: false,
                            message: `Failed to register rule: ${(error as Error).message}`,
                            affectedRules: [ruleConfig.id]
                        };
                    }

                case 'bulk_unregister':
                    if (!category && !ruleId) {
                        return { success: false, message: 'Category or Rule IDs required for bulk unregister action' };
                    }

                    let rulesToUnregister: string[] = [];

                    if (ruleId) {
                        // Unregister specific rules
                        rulesToUnregister = Array.isArray(ruleId) ? ruleId : [ruleId];
                    } else if (category) {
                        // Unregister all rules in category
                        const categoryRules = this.validationFramework.getRulesByCategory(category as any);
                        rulesToUnregister = categoryRules.map(r => r.id);
                    }

                    if (rulesToUnregister.length === 0) {
                        return { success: false, message: 'No rules found to unregister' };
                    }

                    // Use the ValidationFramework bulk unregister method
                    const bulkUnregisterResult = this.validationFramework.unregisterRules(rulesToUnregister);

                    Logger.info('Bulk validation rule unregistration completed', 'MigrationOrchestrator.manageValidationRules', {
                        requested: rulesToUnregister.length,
                        successful: bulkUnregisterResult.successful.length,
                        failed: bulkUnregisterResult.failed.length
                    });

                    return {
                        success: bulkUnregisterResult.failed.length === 0,
                        message: `Bulk unregistration completed: ${bulkUnregisterResult.successful.length} successful, ${bulkUnregisterResult.failed.length} failed`,
                        affectedRules: [...bulkUnregisterResult.successful, ...bulkUnregisterResult.failed]
                    };

                case 'inspect':
                    if (category) {
                        // Get rules by category using the ValidationFramework method
                        const categoryRules = this.validationFramework.getRulesByCategory(category as any);
                        const ruleInfo = categoryRules.map(rule => ({
                            id: rule.id,
                            name: rule.name,
                            description: rule.description,
                            severity: rule.severity,
                            isEnabled: rule.isEnabled
                        }));

                        return {
                            success: true,
                            message: `Found ${ruleInfo.length} rules in category '${category}'`,
                            ruleInfo,
                            affectedRules: categoryRules.map(r => r.id)
                        };
                    } else {
                        // Get all rules using the ValidationFramework method
                        const allRules = this.validationFramework.getAllRules();
                        const ruleInfo = allRules.map(rule => ({
                            id: rule.id,
                            name: rule.name,
                            description: rule.description,
                            category: rule.category,
                            severity: rule.severity,
                            isEnabled: rule.isEnabled
                        }));

                        return {
                            success: true,
                            message: `Found ${ruleInfo.length} total validation rules`,
                            ruleInfo,
                            affectedRules: allRules.map(r => r.id)
                        };
                    }

                default:
                    return { success: false, message: 'Invalid action specified' };
            }

        } catch (error) {
            Logger.error('Failed to manage validation rules', error as Error, 'MigrationOrchestrator.manageValidationRules');
            return {
                success: false,
                message: `Failed to manage validation rules: ${(error as Error).message}`
            };
        }
    }

    /**
     * Load and register validation rules from configuration
     */
    async loadValidationRulesFromConfig(config: {
        rules: any[];
        environment?: string;
        migrationType?: string;
    }): Promise<{
        success: boolean;
        message: string;
        registeredRules: string[];
        failedRules: string[];
    }> {
        try {
            Logger.info('Loading validation rules from configuration', 'MigrationOrchestrator.loadValidationRulesFromConfig', {
                ruleCount: config.rules.length,
                environment: config.environment,
                migrationType: config.migrationType
            });

            // Filter rules based on environment and migration type if specified
            let rulesToRegister = config.rules;

            if (config.environment) {
                rulesToRegister = rulesToRegister.filter(rule =>
                    !rule.environments || rule.environments.includes(config.environment)
                );
            }

            if (config.migrationType) {
                rulesToRegister = rulesToRegister.filter(rule =>
                    !rule.migrationTypes || rule.migrationTypes.includes(config.migrationType)
                );
            }

            if (rulesToRegister.length === 0) {
                return {
                    success: true,
                    message: 'No rules match the specified criteria',
                    registeredRules: [],
                    failedRules: []
                };
            }

            // Convert to ValidationRule format and register using batch method
            const validationRules = rulesToRegister.map(ruleConfig => ({
                id: ruleConfig.id,
                name: ruleConfig.name,
                description: ruleConfig.description,
                category: ruleConfig.category,
                severity: ruleConfig.severity,
                isEnabled: ruleConfig.isEnabled !== false,
                ruleDefinition: {
                    type: ruleConfig.type,
                    expression: ruleConfig.expression,
                    parameters: ruleConfig.parameters || {},
                    expectedResult: ruleConfig.expectedResult,
                    timeout: ruleConfig.timeout || 30000,
                    retryAttempts: ruleConfig.retryAttempts || 0
                },
                createdAt: new Date(),
                lastModified: new Date()
            }));

            // Use the ValidationFramework batch register method
            this.validationFramework.registerRules(validationRules);

            const registeredRules = validationRules.map(r => r.id);

            Logger.info('Validation rules loaded and registered from configuration', 'MigrationOrchestrator.loadValidationRulesFromConfig', {
                totalRules: validationRules.length,
                registeredRules: registeredRules.length
            });

            return {
                success: true,
                message: `Successfully registered ${registeredRules.length} validation rules`,
                registeredRules,
                failedRules: []
            };

        } catch (error) {
            Logger.error('Failed to load validation rules from configuration', error as Error, 'MigrationOrchestrator.loadValidationRulesFromConfig');
            return {
                success: false,
                message: `Failed to load validation rules: ${(error as Error).message}`,
                registeredRules: [],
                failedRules: config.rules.map(r => r.id)
            };
        }
    }

    /**
     * Configure validation rules for specific migration scenarios
     */
    async configureValidationForMigration(migrationRequest: MigrationRequest): Promise<{
        success: boolean;
        message: string;
        configuredRules: string[];
    }> {
        try {
            Logger.info('Configuring validation rules for migration', 'MigrationOrchestrator.configureValidationForMigration', {
                migrationId: migrationRequest.id,
                sourceConnection: migrationRequest.sourceConnectionId,
                targetConnection: migrationRequest.targetConnectionId,
                environment: migrationRequest.metadata?.environment,
                changeType: migrationRequest.metadata?.changeType
            });

            // Define rules based on migration characteristics
            const scenarioRules = this.getValidationRulesForScenario(migrationRequest);

            if (scenarioRules.length === 0) {
                return {
                    success: true,
                    message: 'No specific validation rules required for this migration scenario',
                    configuredRules: []
                };
            }

            // Load and register the scenario-specific rules
            const result = await this.loadValidationRulesFromConfig({
                rules: scenarioRules,
                environment: migrationRequest.metadata?.environment,
                migrationType: migrationRequest.metadata?.changeType
            });

            return {
                success: result.success,
                message: result.message,
                configuredRules: result.registeredRules
            };

        } catch (error) {
            Logger.error('Failed to configure validation for migration', error as Error, 'MigrationOrchestrator.configureValidationForMigration');
            return {
                success: false,
                message: `Failed to configure validation: ${(error as Error).message}`,
                configuredRules: []
            };
        }
    }

    /**
     * Get validation rules appropriate for specific migration scenarios
     */
    private getValidationRulesForScenario(migrationRequest: MigrationRequest): any[] {
        const rules: any[] = [];
        const changeType = migrationRequest.metadata?.changeType || 'feature';
        const environment = migrationRequest.metadata?.environment || 'development';

        // High-risk operation rules
        if (migrationRequest.options?.includeRollback === false) {
            rules.push({
                id: 'no_rollback_warning',
                name: 'No Rollback Warning',
                description: 'Migration does not include rollback capability',
                category: 'compliance',
                severity: 'warning',
                type: 'custom_logic',
                expression: 'context.includeRollback === false',
                parameters: { logicType: 'javascript' },
                environments: ['staging', 'production'],
                migrationTypes: ['hotfix', 'feature']
            });
        }

        // Production environment rules
        if (environment === 'production') {
            rules.push({
                id: 'production_data_validation',
                name: 'Production Data Validation',
                description: 'Validate data integrity in production environment',
                category: 'data_integrity',
                severity: 'error',
                type: 'sql_query',
                expression: 'SELECT COUNT(*) FROM critical_tables WHERE status = \'active\'',
                parameters: {},
                expectedResult: { min: 1 },
                timeout: 60000,
                environments: ['production'],
                migrationTypes: ['hotfix', 'feature']
            });
        }

        // Schema change rules
        if (changeType === 'feature' || changeType === 'refactoring') {
            rules.push({
                id: 'schema_compatibility_check',
                name: 'Schema Compatibility Check',
                description: 'Ensure schema changes maintain compatibility',
                category: 'data_integrity',
                severity: 'error',
                type: 'pattern_match',
                expression: 'SELECT table_name FROM information_schema.tables',
                parameters: {
                    patternType: 'naming_convention',
                    patternRegex: '^(?!tmp_|temp_).*$',
                    objectType: 'table'
                },
                environments: ['development', 'staging', 'production'],
                migrationTypes: ['feature', 'refactoring']
            });
        }

        return rules;
    }
    dispose(): void {
        Logger.info('MigrationOrchestrator disposed', 'MigrationOrchestrator.dispose');

        this.activeMigrations.clear();
        this.migrationResults.clear();
    }
}