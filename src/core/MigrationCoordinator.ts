import { ConnectionService } from './ConnectionService';
import { ProgressTracker } from './ProgressTracker';
import { ValidationFramework } from './ValidationFramework';
import { PostgreSqlSchemaBrowser } from './PostgreSqlSchemaBrowser';
import { PostgreSqlConnectionManager } from './PostgreSqlConnectionManager';
import { MigrationStorage } from './MigrationStorage';
import { BackupManager } from './BackupManager';
import { BusinessRuleEngine } from './BusinessRuleEngine';
import { RealtimeMonitor } from './RealtimeMonitor';
import { Logger } from '../utils/Logger';
import * as path from 'path';
import * as os from 'os';
import { MigrationRequest, MigrationResult, MigrationMetadata } from './MigrationOrchestrator';

/**
 * High-level coordinator for migration workflows
 * Handles orchestration without implementing business logic
 */
export class MigrationCoordinator {
    private connectionService: ConnectionService;
    private progressTracker: ProgressTracker;
    private validationFramework: ValidationFramework;
    private schemaBrowser: PostgreSqlSchemaBrowser;
    private connectionManager: PostgreSqlConnectionManager;
    private migrationStorage: MigrationStorage;
    private backupManager: BackupManager;
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
        this.businessRuleEngine = new BusinessRuleEngine();
        this.realtimeMonitor = new RealtimeMonitor();
    }

    /**
     * Execute a complete migration workflow
     */
    async executeMigration(request: MigrationRequest, dryRun: boolean = false): Promise<MigrationResult> {
        const migrationId = request.id || this.generateId();
        const startTime = Date.now();

        Logger.info('Starting migration workflow', 'MigrationCoordinator.executeMigration', {
            migrationId,
            sourceConnectionId: request.sourceConnectionId,
            targetConnectionId: request.targetConnectionId,
            dryRun
        });

        try {
            // Initialize progress tracking
            this.initializeProgressTracking(migrationId, request);

            // Phase 1: Validation
            await this.performValidationPhase(migrationId, request);

            // Phase 2: Backup (if requested)
            if (request.options?.createBackupBeforeExecution) {
                await this.performBackupPhase(migrationId, request);
            }

            // Phase 3: Execution
            const executionResult = await this.performExecutionPhase(migrationId, request, dryRun);

            // Phase 4: Verification
            await this.performVerificationPhase(migrationId, request);

            // Phase 5: Cleanup
            await this.performCleanupPhase(migrationId, request);

            // Create final result
            const result = this.createMigrationResult(migrationId, startTime, executionResult, request);

            Logger.info('Migration workflow completed successfully', 'MigrationCoordinator.executeMigration', {
                migrationId,
                executionTime: result.executionTime,
                operationsProcessed: result.operationsProcessed
            });

            return result;

        } catch (error) {
            return await this.handleMigrationError(migrationId, startTime, error as Error, request);
        } finally {
            // Cleanup resources
            await this.finalizeMigration(migrationId, request);
        }
    }

    private initializeProgressTracking(migrationId: string, request: MigrationRequest): void {
        this.progressTracker.startMigrationOperation(
            migrationId,
            migrationId,
            request.sourceConnectionId,
            request.targetConnectionId,
            request.options?.progressCallback
        );

        this.realtimeMonitor.publishProgress({
            migrationId,
            phase: 'initializing',
            message: 'Migration workflow started',
            percentage: 0,
            timestamp: new Date(),
            details: {
                sourceConnectionId: request.sourceConnectionId,
                targetConnectionId: request.targetConnectionId
            }
        });
    }

    private async performValidationPhase(migrationId: string, request: MigrationRequest): Promise<void> {
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

        // Perform validation using ValidationFramework
        const validationReport = await this.validationFramework.executeValidation({
            connectionId: request.targetConnectionId,
            rules: ['data_integrity_check', 'performance_impact_check', 'security_validation'],
            context: {
                sourceConnectionId: request.sourceConnectionId,
                targetConnectionId: request.targetConnectionId,
                migrationOptions: request.options,
                migrationMetadata: request.metadata
            }
        });

        if (!validationReport.canProceed) {
            throw new Error(`Pre-migration validation failed: ${validationReport.recommendations.join(', ')}`);
        }

        this.progressTracker.updateMigrationProgress(
            migrationId,
            'validation',
            `Validation completed: ${validationReport.passedRules}/${validationReport.totalRules} rules passed`
        );

        this.realtimeMonitor.publishProgress({
            migrationId,
            phase: 'validation',
            message: `Validation completed: ${validationReport.passedRules}/${validationReport.totalRules} rules passed`,
            percentage: 20,
            timestamp: new Date(),
            details: {
                passedRules: validationReport.passedRules,
                totalRules: validationReport.totalRules
            }
        });

        // Update metadata
        request.metadata = {
            ...request.metadata,
            progressPercentage: 20,
            lastUpdated: new Date().toISOString()
        };
    }

    private async performBackupPhase(migrationId: string, request: MigrationRequest): Promise<void> {
        this.progressTracker.updateMigrationProgress(migrationId, 'backup', 'Creating pre-migration backup');

        this.realtimeMonitor.publishProgress({
            migrationId,
            phase: 'backup',
            message: 'Creating pre-migration backup',
            percentage: 30,
            timestamp: new Date()
        });

        await this.backupManager.createBackup(request.targetConnectionId, {
            type: 'full',
            compression: true,
            encryption: false,
            includeRoles: true,
            excludeSchemas: ['information_schema', 'pg_catalog', 'pg_toast']
        });

        this.realtimeMonitor.publishProgress({
            migrationId,
            phase: 'backup',
            message: 'Pre-migration backup completed',
            percentage: 40,
            timestamp: new Date()
        });
    }

    private async performExecutionPhase(
        migrationId: string,
        request: MigrationRequest,
        dryRun: boolean
    ): Promise<{ operationsProcessed: number; errors: string[]; warnings: string[]; executionLog: string[] }> {
        this.progressTracker.updateMigrationProgress(migrationId, 'execution', 'Executing migration script');

        this.realtimeMonitor.publishProgress({
            migrationId,
            phase: 'execution',
            message: 'Executing migration script',
            percentage: 50,
            timestamp: new Date()
        });

        // Import and use MigrationExecutor
        const { MigrationExecutor } = await import('../managers/schema/MigrationExecutor');
        const { QueryExecutionService } = await import('../services/QueryExecutionService');
        const { ConnectionManager } = await import('../managers/ConnectionManager');

        const migrationExecutor = new MigrationExecutor(
            new QueryExecutionService(new ConnectionManager(null as any, null as any))
        );

        // Generate migration script
        const migrationScript = await this.generateMigrationScript(request);

        // Create enhanced script structure
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
            { dryRun, stopOnError: !request.options?.executeInTransaction }
        );

        return {
            operationsProcessed: executionResult.completedSteps,
            errors: executionResult.executionLog.filter(log => log.level === 'error').map(log => log.message),
            warnings: executionResult.executionLog.filter(log => log.level === 'warning').map(log => log.message),
            executionLog: executionResult.executionLog.map(log => `[${log.level.toUpperCase()}] ${log.message}`)
        };
    }

    private async performVerificationPhase(migrationId: string, request: MigrationRequest): Promise<void> {
        this.progressTracker.updateMigrationProgress(migrationId, 'verification', 'Verifying migration completion');

        this.realtimeMonitor.publishProgress({
            migrationId,
            phase: 'verification',
            message: 'Verifying migration completion',
            percentage: 80,
            timestamp: new Date()
        });

        // Basic verification - check connection is still accessible
        const targetConnection = await this.connectionService.getConnection(request.targetConnectionId);
        if (!targetConnection) {
            throw new Error('Target connection not accessible after migration');
        }

        this.realtimeMonitor.publishProgress({
            migrationId,
            phase: 'verification',
            message: 'Migration verification completed',
            percentage: 90,
            timestamp: new Date()
        });
    }

    private async performCleanupPhase(migrationId: string, request: MigrationRequest): Promise<void> {
        this.progressTracker.updateMigrationProgress(migrationId, 'cleanup', 'Finalizing migration');

        this.realtimeMonitor.publishProgress({
            migrationId,
            phase: 'cleanup',
            message: 'Finalizing migration',
            percentage: 95,
            timestamp: new Date()
        });

        // Cleanup active migration
        await this.migrationStorage.removeActiveMigration(migrationId);
    }

    private createMigrationResult(
        migrationId: string,
        startTime: number,
        executionResult: any,
        request: MigrationRequest
    ): MigrationResult {
        const executionTime = Date.now() - startTime;

        return {
            migrationId,
            success: true,
            executionTime,
            operationsProcessed: executionResult.operationsProcessed,
            errors: executionResult.errors,
            warnings: executionResult.warnings,
            rollbackAvailable: request.options?.includeRollback || false,
            validationReport: undefined, // Would be populated from validation phase
            executionLog: executionResult.executionLog,
            metadata: request.metadata || {}
        };
    }

    private async handleMigrationError(
        migrationId: string,
        startTime: number,
        error: Error,
        request: MigrationRequest
    ): Promise<MigrationResult> {
        const executionTime = Date.now() - startTime;

        Logger.error('Migration workflow failed', error, 'MigrationCoordinator.executeMigration', {
            migrationId,
            executionTime,
            error: error.message
        });

        // Attempt rollback if requested
        let rollbackPerformed = false;
        if (request.options?.includeRollback) {
            try {
                Logger.info('Attempting automatic rollback', 'MigrationCoordinator.executeMigration', { migrationId });
                rollbackPerformed = await this.performRollback(migrationId, request);
            } catch (rollbackError) {
                Logger.error('Rollback failed', rollbackError as Error, 'MigrationCoordinator.executeMigration', { migrationId });
            }
        }

        const result: MigrationResult = {
            migrationId,
            success: false,
            executionTime,
            operationsProcessed: 0,
            errors: [error.message],
            warnings: [],
            rollbackAvailable: rollbackPerformed,
            executionLog: [`Migration failed: ${error.message}${rollbackPerformed ? ' (rollback performed)' : ''}`],
            metadata: request.metadata || {}
        };

        await this.migrationStorage.addMigrationResult(migrationId, result);

        this.realtimeMonitor.markMigrationFailed(migrationId, error.message);
        this.realtimeMonitor.publishProgress({
            migrationId,
            phase: 'failed',
            message: `Migration failed: ${error.message}`,
            percentage: 0,
            timestamp: new Date(),
            details: { error: error.message, executionTime }
        });

        return result;
    }

    private async finalizeMigration(migrationId: string, request: MigrationRequest): Promise<void> {
        // Release concurrency lock
        const { MigrationConcurrencyManager } = await import('./MigrationOrchestrator');
        const concurrencyManager = new MigrationConcurrencyManager(this.connectionService, this.connectionManager);
        concurrencyManager.releaseLock(request.targetConnectionId, migrationId);

        // Clean up active migration after delay
        setTimeout(async () => {
            await this.migrationStorage.removeActiveMigration(migrationId);
        }, 60000);
    }

    private async performRollback(migrationId: string, request: MigrationRequest): Promise<boolean> {
        // Import rollback logic from MigrationOrchestrator
        const { MigrationOrchestrator } = await import('./MigrationOrchestrator');
        const tempOrchestrator = new MigrationOrchestrator(
            this.connectionService,
            this.progressTracker,
            this.validationFramework,
            this.schemaBrowser
        );

        // Use the rollback method (this is a temporary solution until we extract rollback logic)
        return await (tempOrchestrator as any).performRollback(migrationId, request);
    }

    private async generateMigrationScript(request: MigrationRequest): Promise<{
        migrationId: string;
        sqlScript: string;
        rollbackScript?: string;
        riskLevel: 'Low' | 'Medium' | 'High';
        warnings: string[];
        operationCount: number;
    }> {
        // Import migration generation logic
        const { MigrationOrchestrator } = await import('./MigrationOrchestrator');
        const tempOrchestrator = new MigrationOrchestrator(
            this.connectionService,
            this.progressTracker,
            this.validationFramework,
            this.schemaBrowser
        );

        return await tempOrchestrator.generateMigration(request);
    }

    private generateId(): string {
        return `migration_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
        Logger.info('MigrationCoordinator disposed', 'MigrationCoordinator.dispose');
        await this.migrationStorage.clear();
    }
}