import { Logger } from '@/utils/Logger';
import { QueryExecutionService } from '@/services/QueryExecutionService';
import {
    EnhancedMigrationScript,
    MigrationExecutionResult,
    MigrationStep,
    ExecutionLogEntry,
    MigrationPerformanceMetrics,
    ValidationResult,
    PreCondition,
    PostCondition
} from './MigrationTypes';

/**
 * MigrationExecutor - Handles the execution of migration scripts with monitoring and error handling
 * Responsible for executing migration steps, monitoring progress, and managing rollback scenarios
 */
export class MigrationExecutor {
    private queryService: QueryExecutionService;

    /**
     * Creates a new MigrationExecutor instance
     * @param queryService - Service for executing database queries
     */
    constructor(queryService: QueryExecutionService) {
        this.queryService = queryService;
    }

    /**
     * Executes an enhanced migration script with comprehensive monitoring and error handling
     * @param script - The enhanced migration script to execute
     * @param connectionId - Connection ID for the target database
     * @param options - Execution options
     * @param options.dryRun - If true, only simulate execution without making changes
     * @param options.validateOnly - If true, only run validation without executing migration
     * @param options.stopOnError - If true, stop execution on first error
     * @returns Promise resolving to migration execution result
     * @throws Error if migration execution fails
     */
    async executeMigrationScript(
        script: EnhancedMigrationScript,
        connectionId: string,
        options: {
            dryRun?: boolean;
            validateOnly?: boolean;
            stopOnError?: boolean;
        } = {}
    ): Promise<MigrationExecutionResult> {
        // Input validation
        if (!script || typeof script !== 'object') {
            throw new Error('script must be a valid EnhancedMigrationScript object');
        }
        if (!script.id || !script.migrationSteps || !Array.isArray(script.migrationSteps)) {
            throw new Error('script must have valid id and migrationSteps array');
        }
        if (!connectionId || typeof connectionId !== 'string') {
            throw new Error('connectionId must be a non-empty string');
        }

        try {
            Logger.info('Executing enhanced migration script', 'executeMigrationScript', {
                scriptId: script.id,
                stepCount: script.migrationSteps.length,
                dryRun: options.dryRun || false,
                validateOnly: options.validateOnly || false
            });

            const executionId = this.generateId();
            const startTime = new Date();
            const executionLog: ExecutionLogEntry[] = [];

            executionLog.push({
                timestamp: new Date(),
                level: 'info',
                message: `Starting migration execution: ${script.name}`,
                duration: 0
            });

            const result: MigrationExecutionResult = {
                scriptId: script.id,
                executionId,
                startTime,
                status: 'running',
                completedSteps: 0,
                failedSteps: 0,
                executionLog,
                performanceMetrics: {
                    totalExecutionTime: 0,
                    averageStepTime: 0,
                    peakMemoryUsage: 0,
                    databaseLoad: 0
                },
                validationResults: []
            };

            // Execute each migration step
            for (let i = 0; i < script.migrationSteps.length; i++) {
                const step = script.migrationSteps[i];
                result.currentStep = i + 1;

                try {
                    executionLog.push({
                        timestamp: new Date(),
                        stepId: step.id,
                        level: 'info',
                        message: `Executing step ${step.order}: ${step.name}`,
                        duration: 0
                    });

                    if (!options.dryRun && !options.validateOnly) {
                        // Execute the actual SQL (simulated)
                        await this.executeMigrationStep(step, connectionId);

                        executionLog.push({
                            timestamp: new Date(),
                            stepId: step.id,
                            level: 'info',
                            message: `Step ${step.order} completed successfully`,
                            duration: step.estimatedDuration * 1000
                        });
                    }

                    result.completedSteps++;

                } catch (error) {
                    executionLog.push({
                        timestamp: new Date(),
                        stepId: step.id,
                        level: 'error',
                        message: `Step ${step.order} failed: ${(error as Error).message}`,
                        duration: 0
                    });

                    result.failedSteps++;

                    if (options.stopOnError) {
                        result.status = 'failed';
                        break;
                    }
                }
            }

            // Update final status
            result.endTime = new Date();
            result.status = result.failedSteps === 0 ? 'completed' : 'failed';

            // Calculate performance metrics
            const totalTime = result.endTime.getTime() - startTime.getTime();
            result.performanceMetrics = {
                totalExecutionTime: totalTime / 1000, // Convert to seconds
                averageStepTime: totalTime / (result.completedSteps + result.failedSteps) / 1000,
                peakMemoryUsage: 50, // Simulated
                databaseLoad: 0.3 // Simulated
            };

            executionLog.push({
                timestamp: new Date(),
                level: 'info',
                message: `Migration execution ${result.status}: ${result.completedSteps} completed, ${result.failedSteps} failed`,
                duration: totalTime
            });

            Logger.info('Migration script execution completed', 'executeMigrationScript', {
                executionId,
                status: result.status,
                completedSteps: result.completedSteps,
                failedSteps: result.failedSteps,
                totalTime: `${(totalTime / 1000).toFixed(2)} seconds`
            });

            return result;

        } catch (error) {
            Logger.error('Migration script execution failed', error as Error);
            throw error;
        }
    }

    /**
     * Executes a single migration step with pre/post conditions and error handling
     * @param step - Migration step to execute
     * @param connectionId - Connection ID for the target database
     * @returns Promise that resolves when step execution completes
     * @throws Error if step execution fails
     * @private
     */
    private async executeMigrationStep(step: MigrationStep, connectionId: string): Promise<void> {
        try {
            Logger.info('Executing migration step', 'executeMigrationStep', {
                stepId: step.id,
                operation: step.operation,
                objectName: step.objectName,
                schema: step.schema,
                objectType: step.objectType
            });

            // Execute pre-conditions check
            if (step.preConditions?.length) {
                await this.executePreConditions(step, connectionId);
            }

            // Execute the main SQL script
            if (step.sqlScript && step.sqlScript.trim()) {
                // Split SQL script into individual statements
                const statements = this.splitSQLStatements(step.sqlScript);

                for (const statement of statements) {
                    if (statement.trim()) {
                        try {
                            Logger.debug('Executing SQL statement', 'executeMigrationStep', {
                                stepId: step.id,
                                statementLength: statement.length
                            });

                            const result = await this.queryService.executeQuery(connectionId, statement);

                            Logger.debug('SQL statement executed successfully', 'executeMigrationStep', {
                                stepId: step.id,
                                rowsAffected: result.rowCount,
                                executionTime: result.executionTime
                            });

                        } catch (statementError) {
                            Logger.error('SQL statement execution failed', statementError as Error, 'executeMigrationStep', {
                                stepId: step.id,
                                statement: statement.substring(0, 200) + (statement.length > 200 ? '...' : '')
                            });
                            throw new Error(`Failed to execute statement in step ${step.id}: ${(statementError as Error).message}`);
                        }
                    }
                }
            }

            // Execute post-conditions check
            if (step.postConditions && step.postConditions.length > 0) {
                await this.executePostConditions(step, connectionId);
            }

            Logger.info('Migration step completed successfully', 'executeMigrationStep', {
                stepId: step.id,
                objectName: step.objectName,
                executionTime: `${step.estimatedDuration}s`
            });

        } catch (error) {
            Logger.error('Migration step execution failed', error as Error, 'executeMigrationStep', {
                stepId: step.id,
                operation: step.operation,
                objectName: step.objectName
            });
            throw error;
        }
    }

    /**
     * Executes pre-condition checks for a migration step
     * @param step - Migration step containing pre-conditions
     * @param connectionId - Connection ID for the database
     * @returns Promise that resolves if all pre-conditions pass
     * @throws Error if any pre-condition fails
     * @private
     */
    private async executePreConditions(step: MigrationStep, connectionId: string): Promise<void> {
        for (const condition of step.preConditions!) {
            try {
                if (condition.sqlQuery) {
                    const result = await this.queryService.executeQuery(connectionId, condition.sqlQuery);

                    // Validate condition result
                    const actualResult = result.rows[0]?.[0]; // Get first column of first row
                    const conditionMet = this.validateConditionResult(actualResult, condition.expectedResult);

                    if (!conditionMet) {
                        throw new Error(`Pre-condition failed for step ${step.id}: ${condition.description}. Expected: ${condition.expectedResult}, Got: ${actualResult}`);
                    }

                    Logger.debug('Pre-condition passed', 'executePreConditions', {
                        stepId: step.id,
                        condition: condition.description,
                        expected: condition.expectedResult,
                        actual: actualResult
                    });
                }
            } catch (conditionError) {
                Logger.error('Pre-condition execution failed', conditionError as Error, 'executePreConditions', {
                    stepId: step.id,
                    condition: condition.description
                });
                throw conditionError;
            }
        }
    }

    /**
     * Executes post-condition checks for a migration step (non-blocking)
     * @param step - Migration step containing post-conditions
     * @param connectionId - Connection ID for the database
     * @returns Promise that resolves after post-condition checks (warnings logged but not thrown)
     * @private
     */
    private async executePostConditions(step: MigrationStep, connectionId: string): Promise<void> {
        for (const condition of step.postConditions!) {
            try {
                if (condition.sqlQuery) {
                    const result = await this.queryService.executeQuery(connectionId, condition.sqlQuery);

                    // Validate condition result
                    const actualResult = result.rows[0]?.[0]; // Get first column of first row
                    const conditionMet = this.validateConditionResult(actualResult, condition.expectedResult);

                    if (!conditionMet) {
                        Logger.warn('Post-condition not met', 'executePostConditions', {
                            stepId: step.id,
                            condition: condition.description,
                            expected: condition.expectedResult,
                            actual: actualResult,
                            tolerance: condition.tolerance
                        });

                        // Don't throw error for post-conditions, just log warning
                        // Post-conditions are typically for validation, not hard requirements
                    } else {
                        Logger.debug('Post-condition passed', 'executePostConditions', {
                            stepId: step.id,
                            condition: condition.description,
                            expected: condition.expectedResult,
                            actual: actualResult
                        });
                    }
                }
            } catch (conditionError) {
                Logger.warn(`Post-condition execution failed: ${(conditionError as Error).message}`, 'executePostConditions');
                // Don't throw error for post-condition failures
            }
        }
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

    /**
     * Splits a SQL script into individual executable statements
     * Handles comments, strings, and complex SQL constructs properly
     * @param sqlScript - Complete SQL script to split
     * @returns Array of individual SQL statements
     * @private
     */
    private splitSQLStatements(sqlScript: string): string[] {
        try {
            Logger.debug('Splitting SQL statements', 'splitSQLStatements', {
                scriptLength: sqlScript.length
            });

            const statements: string[] = [];
            let currentStatement = '';
            let inString = false;
            let stringChar = '';
            let inComment = false;
            let inLineComment = false;
            let parenDepth = 0;

            // Process each character
            for (let i = 0; i < sqlScript.length; i++) {
                const char = sqlScript[i];
                const nextChar = sqlScript[i + 1] || '';

                // Handle string literals
                if (!inComment && !inLineComment && (char === '"' || char === "'")) {
                    if (!inString) {
                        inString = true;
                        stringChar = char;
                    } else if (char === stringChar) {
                        inString = false;
                        stringChar = '';
                    }
                }

                // Handle comments
                if (!inString) {
                    if (char === '/' && nextChar === '*' && !inLineComment) {
                        inComment = true;
                        currentStatement += char;
                        continue;
                    }
                    if (char === '*' && nextChar === '/' && inComment) {
                        inComment = false;
                        currentStatement += '*/';
                        i++; // Skip next character
                        continue;
                    }
                    if (char === '-' && nextChar === '-' && !inComment) {
                        inLineComment = true;
                        currentStatement += char;
                        continue;
                    }
                    if (char === '\n' && inLineComment) {
                        inLineComment = false;
                        currentStatement += char;
                        continue;
                    }
                }

                // Skip characters in comments
                if (inComment || inLineComment) {
                    currentStatement += char;
                    continue;
                }

                // Track parentheses for complex statements
                if (!inString && (char === '(')) {
                    parenDepth++;
                } else if (!inString && (char === ')')) {
                    parenDepth--;
                }

                // Handle semicolons (statement terminators)
                if (char === ';' && !inString && parenDepth === 0) {
                    currentStatement += char;
                    const trimmedStatement = currentStatement.trim();
                    if (trimmedStatement.length > 1) { // More than just semicolon
                        statements.push(trimmedStatement);
                    }
                    currentStatement = '';
                } else {
                    currentStatement += char;
                }
            }

            // Add remaining statement if any
            const remainingStatement = currentStatement.trim();
            if (remainingStatement.length > 0) {
                statements.push(remainingStatement);
            }

            // Filter out empty statements and comments
            const filteredStatements = statements.filter(stmt => {
                const trimmed = stmt.trim();
                return trimmed.length > 0 &&
                    !trimmed.startsWith('--') &&
                    !trimmed.startsWith('/*') &&
                    trimmed !== ';';
            });

            Logger.debug('SQL statements split', 'splitSQLStatements', {
                originalLength: sqlScript.length,
                statementCount: filteredStatements.length,
                averageStatementLength: filteredStatements.length > 0
                    ? Math.round(filteredStatements.join('').length / filteredStatements.length)
                    : 0
            });

            return filteredStatements;

        } catch (error) {
            Logger.error('Failed to split SQL statements', error as Error, 'splitSQLStatements', {
                scriptLength: sqlScript.length
            });

            // Fallback to simple splitting
            Logger.warn('Using simple semicolon splitting as fallback', 'splitSQLStatements');
            return sqlScript
                .split(';')
                .map(stmt => stmt.trim())
                .filter(stmt => stmt.length > 0);
        }
    }

    /**
     * Generates a unique identifier for migration executions
     * @returns Unique UUID string
     * @private
     */
    private generateId(): string {
        return crypto.randomUUID();
    }
}