import { Logger } from '@/utils/Logger';
import { QueryExecutionService } from '@/services/QueryExecutionService';
import { ValidationFramework, ValidationRequest, ValidationReport } from '../../core/ValidationFramework';
import {
    EnhancedMigrationScript,
    ValidationResult,
    ValidationStep
} from './MigrationTypes';

/**
 * MigrationValidator - Handles validation of migration scripts and execution results
 * Responsible for running validation checks, framework integration, and result combination
 */
export class MigrationValidator {
    private queryService: QueryExecutionService;
    private validationFramework: ValidationFramework;

    /**
     * Creates a new MigrationValidator instance
     * @param queryService - Service for executing database queries
     * @param validationFramework - Framework for running validation checks
     */
    constructor(queryService: QueryExecutionService, validationFramework: ValidationFramework) {
        this.queryService = queryService;
        this.validationFramework = validationFramework;
    }

    /**
     * Validates a migration script using both framework validation and legacy validation steps
     * @param script - The enhanced migration script to validate
     * @param connectionId - Connection ID for the database to validate against
     * @returns Promise resolving to array of validation results
     * @throws Error if validation fails
     */
    async validateMigrationScript(script: EnhancedMigrationScript, connectionId: string): Promise<ValidationResult[]> {
        // Input validation
        if (!script || typeof script !== 'object') {
            throw new Error('script must be a valid EnhancedMigrationScript object');
        }
        if (!script.id || !script.validationSteps || !Array.isArray(script.validationSteps)) {
            throw new Error('script must have valid id and validationSteps array');
        }
        if (!connectionId || typeof connectionId !== 'string') {
            throw new Error('connectionId must be a non-empty string');
        }

        try {
            Logger.info('Validating migration script with ValidationFramework', 'validateMigrationScript', {
                scriptId: script.id,
                stepCount: script.validationSteps.length,
                connectionId
            });

            // First run the ValidationFramework validation
            const frameworkValidationReport = await this.performFrameworkValidation(script, connectionId);

            // Then run the existing validation steps for backward compatibility
            const legacyValidationResults: ValidationResult[] = [];

            // Run each validation step
            for (const validation of script.validationSteps) {
                const startTime = Date.now();

                try {
                    let passed = false;
                    let actualResult: unknown = null;
                    let errorMessage: string | undefined;

                    if (validation.automated && validation.sqlQuery) {
                        try {
                            // Execute actual validation query against the database
                            const result = await this.queryService.executeQuery(connectionId, validation.sqlQuery);

                            // Extract actual result from query
                            actualResult = result.rows.length > 0 ? result.rows[0][0] : null;

                            // Validate against expected result
                            passed = this.validateConditionResult(actualResult, validation.expectedResult);

                            Logger.debug('Validation query executed', 'validateMigrationScript', {
                                validationId: validation.id,
                                sqlQuery: validation.sqlQuery,
                                actualResult,
                                expectedResult: validation.expectedResult,
                                passed
                            });

                        } catch (queryError) {
                            passed = false;
                            errorMessage = `Query execution failed: ${(queryError as Error).message}`;
                            Logger.warn('Validation query failed', 'validateMigrationScript', {
                                validationId: validation.id,
                                error: (queryError as Error).message
                            });
                        }
                    } else {
                        // Manual validation required
                        passed = false;
                        errorMessage = 'Manual validation required';
                    }

                    legacyValidationResults.push({
                        stepId: validation.id.split('_')[1] || 'unknown', // Extract step ID
                        validationId: validation.id,
                        passed,
                        actualResult,
                        expectedResult: validation.expectedResult,
                        executionTime: Date.now() - startTime,
                        errorMessage
                    });

                } catch (error) {
                    legacyValidationResults.push({
                        stepId: validation.id.split('_')[1] || 'unknown',
                        validationId: validation.id,
                        passed: false,
                        executionTime: Date.now() - startTime,
                        errorMessage: (error as Error).message
                    });
                }
            }

            // Combine framework validation results with legacy results
            const combinedResults = this.combineValidationResults(frameworkValidationReport, legacyValidationResults);

            const passedValidations = combinedResults.filter(v => v.passed).length;
            const failedValidations = combinedResults.length - passedValidations;

            Logger.info('Migration script validation completed', 'validateMigrationScript', {
                totalValidations: combinedResults.length,
                passedValidations,
                failedValidations,
                successRate: `${((passedValidations / combinedResults.length) * 100).toFixed(1)}%`,
                frameworkValidationPassed: frameworkValidationReport.canProceed,
                legacyValidationPassed: legacyValidationResults.filter(v => v.passed).length
            });

            return combinedResults;

        } catch (error) {
            Logger.error('Migration script validation failed', error as Error, 'validateMigrationScript');
            throw error;
        }
    }

    /**
     * Performs validation using the ValidationFramework with migration-specific context
     * @param script - Enhanced migration script to validate
     * @param connectionId - Connection ID for the database to validate against
     * @returns Promise resolving to validation report from ValidationFramework
     * @throws Error if ValidationFramework validation fails
     * @private
     */
    private async performFrameworkValidation(script: EnhancedMigrationScript, connectionId: string): Promise<ValidationReport> {
        Logger.info('Performing ValidationFramework validation', 'performFrameworkValidation', {
            scriptId: script.id,
            connectionId
        });

        try {
            // Create validation context for the migration script
            const validationContext = {
                scriptId: script.id,
                scriptName: script.name,
                connectionId,
                migrationSteps: script.migrationSteps.length,
                riskLevel: script.riskLevel,
                estimatedExecutionTime: script.estimatedExecutionTime,
                rollbackAvailable: script.rollbackScript.isComplete,
                validationSteps: script.validationSteps.length
            };

            // Create validation request
            const validationRequest: ValidationRequest = {
                connectionId,
                rules: ['migration_script_validation', 'schema_consistency', 'data_integrity'], // Use specific validation rules
                failOnWarnings: false,
                stopOnFirstError: true,
                context: validationContext
            };

            // Execute validation using the ValidationFramework
            const validationReport = await this.validationFramework.executeValidation(validationRequest);

            Logger.info('ValidationFramework validation completed', 'performFrameworkValidation', {
                scriptId: script.id,
                totalRules: validationReport.totalRules,
                passedRules: validationReport.passedRules,
                failedRules: validationReport.failedRules,
                overallStatus: validationReport.overallStatus,
                canProceed: validationReport.canProceed
            });

            return validationReport;

        } catch (error) {
            Logger.error('ValidationFramework validation failed', error as Error, 'performFrameworkValidation', {
                scriptId: script.id
            });

            // Return a failed validation report
            return {
                requestId: script.id,
                validationTimestamp: new Date(),
                totalRules: 0,
                passedRules: 0,
                failedRules: 1,
                warningRules: 0,
                results: [{
                    ruleId: 'validation_framework',
                    ruleName: 'Validation Framework Check',
                    passed: false,
                    severity: 'error',
                    message: `ValidationFramework error: ${(error as Error).message}`,
                    executionTime: 0,
                    timestamp: new Date()
                }],
                overallStatus: 'failed',
                canProceed: false,
                recommendations: ['Fix ValidationFramework error before proceeding with migration'],
                executionTime: 0
            };
        }
    }

    /**
     * Combines ValidationFramework results with legacy validation results for compatibility
     * @param frameworkReport - Report from ValidationFramework
     * @param legacyResults - Legacy validation results array
     * @returns Combined array of validation results
     * @private
     */
    private combineValidationResults(frameworkReport: ValidationReport, legacyResults: ValidationResult[]): ValidationResult[] {
        Logger.info('Combining validation results', 'combineValidationResults', {
            frameworkResults: frameworkReport.results.length,
            legacyResults: legacyResults.length
        });

        // Convert framework validation results to legacy format for compatibility
        const frameworkResults: ValidationResult[] = frameworkReport.results.map(result => ({
            stepId: result.ruleId,
            validationId: result.ruleId,
            passed: result.passed,
            actualResult: result.details?.actualResult,
            expectedResult: result.details?.expectedResult,
            executionTime: result.executionTime,
            errorMessage: result.passed ? undefined : result.message
        }));

        // Combine both result sets
        const combinedResults = [...frameworkResults, ...legacyResults];

        Logger.info('Validation results combined', 'combineValidationResults', {
            totalResults: combinedResults.length,
            passedResults: combinedResults.filter(r => r.passed).length,
            failedResults: combinedResults.filter(r => !r.passed).length
        });

        return combinedResults;
    }

    /**
     * Validates if an actual result matches expected result with various comparison operators
     * @param actualResult - Actual result from database query
     * @param expectedResult - Expected result to compare against
     * @returns True if condition is met, false otherwise
     * @private
     */
    private validateConditionResult(actualResult: unknown, expectedResult: unknown): boolean {
        if (expectedResult === undefined || expectedResult === null) {
            return true; // No expectation to validate
        }

        // Handle different comparison types
        if (typeof expectedResult === 'string') {
            if (expectedResult.startsWith('>=')) {
                const expectedValue = parseFloat(expectedResult.substring(2));
                return parseFloat(actualResult as string) >= expectedValue;
            }
            if (expectedResult.startsWith('<=')) {
                const expectedValue = parseFloat(expectedResult.substring(2));
                return parseFloat(actualResult as string) <= expectedValue;
            }
            if (expectedResult.startsWith('>')) {
                const expectedValue = parseFloat(expectedResult.substring(1));
                return parseFloat(actualResult as string) > expectedValue;
            }
            if (expectedResult.startsWith('<')) {
                const expectedValue = parseFloat(expectedResult.substring(1));
                return parseFloat(actualResult as string) < expectedValue;
            }
            if (expectedResult.startsWith('!=')) {
                return actualResult != expectedResult.substring(2);
            }
        }

        // Default equality check
        return actualResult == expectedResult;
    }
}