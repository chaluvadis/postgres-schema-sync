import { QueryExecutionService } from '../services/QueryExecutionService';
import { Logger } from '../utils/Logger';

/**
 * Handles the execution of migration scripts
 * Separated from orchestration logic for better maintainability
 */
export class MigrationExecutor {
    constructor(private queryService: QueryExecutionService) {}

    /**
     * Execute a migration script against a target database
     */
    async executeMigrationScript(
        script: any,
        targetConnectionId: string,
        options: { dryRun?: boolean; stopOnError?: boolean } = {}
    ): Promise<{
        completedSteps: number;
        executionLog: Array<{ level: 'info' | 'warning' | 'error'; message: string; timestamp: Date }>;
    }> {
        const executionLog: Array<{ level: 'info' | 'warning' | 'error'; message: string; timestamp: Date }> = [];
        let completedSteps = 0;

        Logger.info('Starting migration script execution', 'MigrationExecutor.executeMigrationScript', {
            scriptId: script.id,
            targetConnectionId,
            dryRun: options.dryRun,
            stepCount: script.migrationSteps?.length || 0
        });

        try {
            if (!script.migrationSteps || script.migrationSteps.length === 0) {
                throw new Error('No migration steps defined in script');
            }

            // Sort steps by order
            const sortedSteps = script.migrationSteps.sort((a: any, b: any) => a.order - b.order);

            for (const step of sortedSteps) {
                try {
                    executionLog.push({
                        level: 'info',
                        message: `Executing step ${step.order}: ${step.name}`,
                        timestamp: new Date()
                    });

                    if (!options.dryRun) {
                        // Execute the SQL script
                        const result = await this.queryService.executeQuery(
                            targetConnectionId,
                            step.sqlScript,
                            { timeout: step.estimatedDuration || 30000 }
                        );

                        if (!result.error) {
                            executionLog.push({
                                level: 'info',
                                message: `Step ${step.order} completed successfully`,
                                timestamp: new Date()
                            });
                        } else {
                            const errorMsg = `Step ${step.order} failed: ${result.error || 'Unknown error'}`;
                            executionLog.push({
                                level: 'error',
                                message: errorMsg,
                                timestamp: new Date()
                            });

                            if (options.stopOnError !== false) {
                                throw new Error(errorMsg);
                            }
                        }
                    } else {
                        // Dry run - just log what would be executed
                        executionLog.push({
                            level: 'info',
                            message: `DRY RUN: Would execute step ${step.order} (${step.sqlScript.length} characters)`,
                            timestamp: new Date()
                        });
                    }

                    completedSteps++;

                } catch (stepError) {
                    const errorMsg = `Step ${step.order} execution failed: ${(stepError as Error).message}`;
                    executionLog.push({
                        level: 'error',
                        message: errorMsg,
                        timestamp: new Date()
                    });

                    if (options.stopOnError !== false) {
                        throw stepError;
                    }
                }
            }

            executionLog.push({
                level: 'info',
                message: `Migration script execution completed. ${completedSteps}/${sortedSteps.length} steps executed.`,
                timestamp: new Date()
            });

            Logger.info('Migration script execution completed', 'MigrationExecutor.executeMigrationScript', {
                scriptId: script.id,
                completedSteps,
                totalSteps: sortedSteps.length,
                dryRun: options.dryRun
            });

            return {
                completedSteps,
                executionLog
            };

        } catch (error) {
            executionLog.push({
                level: 'error',
                message: `Migration script execution failed: ${(error as Error).message}`,
                timestamp: new Date()
            });

            Logger.error('Migration script execution failed', error as Error, 'MigrationExecutor.executeMigrationScript', {
                scriptId: script.id,
                completedSteps,
                targetConnectionId
            });

            throw error;
        }
    }

    /**
     * Validate a migration script without executing it
     */
    async validateMigrationScript(script: any): Promise<{
        isValid: boolean;
        errors: string[];
        warnings: string[];
    }> {
        const errors: string[] = [];
        const warnings: string[] = [];

        Logger.info('Validating migration script', 'MigrationExecutor.validateMigrationScript', {
            scriptId: script.id
        });

        try {
            // Basic validation
            if (!script.id) {
                errors.push('Script ID is required');
            }

            if (!script.migrationSteps || script.migrationSteps.length === 0) {
                errors.push('At least one migration step is required');
            }

            // Validate each step
            for (const step of script.migrationSteps || []) {
                if (!step.sqlScript || step.sqlScript.trim().length === 0) {
                    errors.push(`Step ${step.order}: SQL script is required`);
                }

                if (!step.order || step.order < 1) {
                    errors.push(`Step ${step.order}: Valid order number is required`);
                }

                // Check for potentially dangerous operations
                const sql = step.sqlScript.toUpperCase();
                if (sql.includes('DROP DATABASE') || sql.includes('DROP SCHEMA')) {
                    warnings.push(`Step ${step.order}: Contains potentially destructive DROP operations`);
                }

                if (sql.includes('DELETE FROM') && !sql.includes('WHERE')) {
                    warnings.push(`Step ${step.order}: DELETE without WHERE clause detected`);
                }
            }

            // Validate rollback script if present
            if (script.rollbackScript) {
                if (!script.rollbackScript.steps || script.rollbackScript.steps.length === 0) {
                    warnings.push('Rollback script defined but no rollback steps provided');
                }
            }

            const isValid = errors.length === 0;

            Logger.info('Migration script validation completed', 'MigrationExecutor.validateMigrationScript', {
                scriptId: script.id,
                isValid,
                errorCount: errors.length,
                warningCount: warnings.length
            });

            return {
                isValid,
                errors,
                warnings
            };

        } catch (error) {
            Logger.error('Migration script validation failed', error as Error, 'MigrationExecutor.validateMigrationScript', {
                scriptId: script.id
            });

            return {
                isValid: false,
                errors: [`Validation failed: ${(error as Error).message}`],
                warnings: []
            };
        }
    }
}