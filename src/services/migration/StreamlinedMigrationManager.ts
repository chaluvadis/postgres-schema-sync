import { Logger } from '../../utils/Logger';
import { CoreServices } from '../../core';
import {
    MigrationRequest,
    MigrationResult,
    MigrationOptions,
    MigrationMetadata
} from '../../core/MigrationOrchestrator';

/**
 * StreamlinedMigrationManager - Modern migration manager using core services
 * This replaces the monolithic MigrationManager (3,060 lines) with a focused implementation (~200 lines)
 *
 * Key improvements:
 * - Uses dependency injection via CoreServices
 * - Single responsibility: coordinates migration workflow
 * - Delegates to focused core services
 * - Consistent error handling and logging
 * - Type-safe interfaces throughout
 */
export class StreamlinedMigrationManager {
    private coreServices: CoreServices;

    constructor(connectionManager: any) {
        this.coreServices = CoreServices.getInstance(connectionManager);
    }

    /**
     * Generate migration script using core services
     */
    async generateMigration(
        sourceConnectionId: string,
        targetConnectionId: string,
        options: Partial<MigrationOptions> = {}
    ): Promise<{
        id: string;
        sqlScript: string;
        rollbackScript?: string;
        riskLevel: 'Low' | 'Medium' | 'High';
        warnings: string[];
        operationCount: number;
    }> {
        try {
            Logger.info('Generating streamlined migration', 'StreamlinedMigrationManager.generateMigration', {
                sourceConnectionId,
                targetConnectionId
            });

            const request: MigrationRequest = {
                sourceConnectionId,
                targetConnectionId,
                options: {
                    includeRollback: options.includeRollback || false,
                    validateBeforeExecution: false, // Not needed for generation
                    ...options
                }
            };

            const result = await this.coreServices.migrationOrchestrator.generateMigration(request);

            Logger.info('Streamlined migration generated', 'StreamlinedMigrationManager.generateMigration', {
                migrationId: result.migrationId,
                operationCount: result.operationCount,
                riskLevel: result.riskLevel
            });

            return {
                id: result.migrationId,
                sqlScript: result.sqlScript,
                rollbackScript: result.rollbackScript,
                riskLevel: result.riskLevel,
                warnings: result.warnings,
                operationCount: result.operationCount
            };

        } catch (error) {
            Logger.error('Streamlined migration generation failed', error as Error, 'StreamlinedMigrationManager.generateMigration', {
                sourceConnectionId,
                targetConnectionId
            });
            throw error;
        }
    }

    /**
     * Execute migration using core services
     */
    async executeMigration(
        sourceConnectionId: string,
        targetConnectionId: string,
        options: MigrationOptions = {}
    ): Promise<MigrationResult> {
        try {
            Logger.info('Executing streamlined migration', 'StreamlinedMigrationManager.executeMigration', {
                sourceConnectionId,
                targetConnectionId,
                options: Object.keys(options)
            });

            const request: MigrationRequest = {
                sourceConnectionId,
                targetConnectionId,
                options,
                metadata: this.buildMetadata(options)
            };

            const result = await this.coreServices.migrationOrchestrator.executeMigration(request);

            Logger.info('Streamlined migration execution completed', 'StreamlinedMigrationManager.executeMigration', {
                migrationId: result.migrationId,
                success: result.success,
                executionTime: result.executionTime,
                operationsProcessed: result.operationsProcessed
            });

            return result;

        } catch (error) {
            Logger.error('Streamlined migration execution failed', error as Error, 'StreamlinedMigrationManager.executeMigration', {
                sourceConnectionId,
                targetConnectionId
            });
            throw error;
        }
    }

    /**
     * Validate migration before execution
     */
    async validateMigration(
        sourceConnectionId: string,
        targetConnectionId: string,
        options: {
            businessRules?: string[];
            failOnWarnings?: boolean;
            stopOnFirstError?: boolean;
        } = {}
    ): Promise<{
        canProceed: boolean;
        validationReport: any;
        recommendations: string[];
    }> {
        try {
            Logger.info('Validating streamlined migration', 'StreamlinedMigrationManager.validateMigration', {
                sourceConnectionId,
                targetConnectionId
            });

            const validationRequest = {
                connectionId: targetConnectionId,
                rules: options.businessRules,
                failOnWarnings: options.failOnWarnings || false,
                stopOnFirstError: options.stopOnFirstError || true,
                context: {
                    sourceConnectionId,
                    targetConnectionId,
                    operation: 'migration_validation'
                }
            };

            const validationReport = await this.coreServices.validationFramework.executeValidation(validationRequest);

            Logger.info('Streamlined migration validation completed', 'StreamlinedMigrationManager.validateMigration', {
                canProceed: validationReport.canProceed,
                totalRules: validationReport.totalRules,
                passedRules: validationReport.passedRules,
                failedRules: validationReport.failedRules
            });

            return {
                canProceed: validationReport.canProceed,
                validationReport,
                recommendations: validationReport.recommendations
            };

        } catch (error) {
            Logger.error('Streamlined migration validation failed', error as Error, 'StreamlinedMigrationManager.validateMigration', {
                sourceConnectionId,
                targetConnectionId
            });
            throw error;
        }
    }

    /**
     * Get migration progress
     */
    getMigrationProgress(migrationId: string): any {
        const progress = this.coreServices.progressTracker.getProgress(migrationId);

        if (!progress) {
            return null;
        }

        // Convert to legacy format for backward compatibility
        return {
            migrationId,
            currentStep: progress.currentStep,
            totalSteps: progress.totalSteps,
            percentage: progress.percentage,
            message: progress.message,
            status: progress.percentage === 100 ? 'completed' :
                   progress.percentage === -1 ? 'failed' : 'running'
        };
    }

    /**
     * Cancel migration
     */
    async cancelMigration(migrationId: string): Promise<boolean> {
        try {
            Logger.info('Cancelling streamlined migration', 'StreamlinedMigrationManager.cancelMigration', {
                migrationId
            });

            const result = await this.coreServices.migrationOrchestrator.cancelMigration(migrationId);

            Logger.info('Streamlined migration cancellation completed', 'StreamlinedMigrationManager.cancelMigration', {
                migrationId,
                success: result
            });

            return result;

        } catch (error) {
            Logger.error('Streamlined migration cancellation failed', error as Error, 'StreamlinedMigrationManager.cancelMigration', {
                migrationId
            });
            return false;
        }
    }

    /**
     * Get service statistics
     */
    getStats(): {
        coreServices: any;
        migrationOrchestrator: any;
        validationFramework: any;
        progressTracker: any;
    } {
        return {
            coreServices: {
                connectionService: this.coreServices.connectionService.getServiceStats(),
                validationFramework: this.coreServices.validationFramework.getStats(),
                progressTracker: this.coreServices.progressTracker.getStats(),
                migrationOrchestrator: this.coreServices.migrationOrchestrator.getStats()
            },
            migrationOrchestrator: this.coreServices.migrationOrchestrator.getStats(),
            validationFramework: this.coreServices.validationFramework.getStats(),
            progressTracker: this.coreServices.progressTracker.getStats()
        };
    }

    /**
     * Build metadata from options
     */
    private buildMetadata(options: MigrationOptions): MigrationMetadata {
        return {
            author: options.author || 'StreamlinedMigrationManager',
            businessJustification: options.businessJustification || 'Automated schema synchronization',
            changeType: options.changeType || 'feature',
            environment: options.environment || 'production',
            tags: options.tags || ['automated', 'streamlined']
        };
    }

    /**
     * Dispose of service resources
     */
    dispose(): void {
        Logger.info('StreamlinedMigrationManager disposed', 'StreamlinedMigrationManager.dispose');
        this.coreServices.dispose();
    }
}