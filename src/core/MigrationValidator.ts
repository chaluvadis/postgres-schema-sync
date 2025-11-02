import { ValidationFramework } from './ValidationFramework';
import { Logger } from '../utils/Logger';

/**
 * Handles migration validation logic
 * Separated from orchestration for better maintainability
 */
export class MigrationValidator {
    constructor(private validationFramework: ValidationFramework) {}

    /**
     * Perform comprehensive pre-migration validation
     */
    async performPreMigrationValidation(
        migrationId: string,
        sourceConnectionId: string,
        targetConnectionId: string,
        options?: any,
        metadata?: any
    ): Promise<{
        canProceed: boolean;
        passedRules: number;
        failedRules: number;
        warningRules: number;
        recommendations: string[];
        executionTime: number;
    }> {
        const startTime = Date.now();

        Logger.info('Starting pre-migration validation', 'MigrationValidator.performPreMigrationValidation', {
            migrationId,
            sourceConnectionId,
            targetConnectionId
        });

        try {
            // Execute validation using ValidationFramework with predefined rules
            const validationRequest = {
                connectionId: targetConnectionId,
                rules: ['data_integrity_check', 'performance_impact_check', 'security_validation'],
                context: {
                    sourceConnectionId,
                    targetConnectionId,
                    migrationOptions: options,
                    migrationMetadata: metadata
                }
            };

            const validationReport = await this.validationFramework.executeValidation(validationRequest);

            Logger.info('Pre-migration validation completed', 'MigrationValidator.performPreMigrationValidation', {
                migrationId,
                totalRules: validationReport.totalRules,
                passedRules: validationReport.passedRules,
                failedRules: validationReport.failedRules,
                warningRules: validationReport.warningRules,
                overallStatus: validationReport.overallStatus,
                canProceed: validationReport.canProceed
            });

            return {
                canProceed: validationReport.canProceed,
                passedRules: validationReport.passedRules,
                failedRules: validationReport.failedRules,
                warningRules: validationReport.warningRules,
                recommendations: validationReport.recommendations,
                executionTime: Date.now() - startTime
            };

        } catch (error) {
            Logger.error('Pre-migration validation failed', error as Error, 'MigrationValidator.performPreMigrationValidation', {
                migrationId
            });

            return {
                canProceed: false,
                passedRules: 0,
                failedRules: 1,
                warningRules: 0,
                recommendations: ['Fix validation system error before proceeding'],
                executionTime: Date.now() - startTime
            };
        }
    }

    /**
     * Validate migration script structure and safety
     */
    validateMigrationScript(script: any): {
        isValid: boolean;
        errors: string[];
        warnings: string[];
    } {
        const errors: string[] = [];
        const warnings: string[] = [];

        Logger.info('Validating migration script structure', 'MigrationValidator.validateMigrationScript', {
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

            Logger.info('Migration script validation completed', 'MigrationValidator.validateMigrationScript', {
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
            Logger.error('Migration script validation failed', error as Error, 'MigrationValidator.validateMigrationScript', {
                scriptId: script.id
            });

            return {
                isValid: false,
                errors: [`Validation failed: ${(error as Error).message}`],
                warnings: []
            };
        }
    }

    /**
     * Assess migration risk level
     */
    assessMigrationRisk(sqlScript: string): 'Low' | 'Medium' | 'High' {
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

    /**
     * Analyze migration warnings
     */
    analyzeMigrationWarnings(sqlScript: string): string[] {
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
}