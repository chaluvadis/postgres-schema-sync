import * as vscode from 'vscode';
import { Logger } from './Logger';

// ErrorSeverity enum - moved from ErrorRecoveryService
export enum ErrorSeverity {
    LOW = 'LOW',
    MEDIUM = 'MEDIUM',
    HIGH = 'HIGH',
    CRITICAL = 'CRITICAL'
}

// ErrorCategory enum - moved from ErrorRecoveryService
export enum ErrorCategory {
    NETWORK = 'NETWORK',
    DATABASE = 'DATABASE',
    AUTHENTICATION = 'AUTHENTICATION',
    AUTHORIZATION = 'AUTHORIZATION',
    VALIDATION = 'VALIDATION',
    SYSTEM = 'SYSTEM',
    CONFIGURATION = 'CONFIGURATION',
    TIMEOUT = 'TIMEOUT'
}

export interface ErrorContext {
    operation: string;
    connectionId?: string;
    objectType?: string;
    objectName?: string;
    additionalInfo?: Record<string, any> | undefined;
}

export class ErrorHandler {
    static handleError(error: unknown, context: ErrorContext): void {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;

        Logger.error('Operation failed', error as Error, {
            operation: context.operation,
            connectionId: context.connectionId,
            objectType: context.objectType,
            objectName: context.objectName,
            additionalInfo: context.additionalInfo
        });

        // Show user-friendly error message
        const userMessage = this.getUserFriendlyMessage(errorMessage, context);

        // Show simple error message first
        vscode.window.showErrorMessage(userMessage, 'View Logs').then(selection => {
            if (selection === 'View Logs') {
                Logger.showOutputChannel();
            }
        });
    }


    static handleWarning(warning: string, context: ErrorContext): void {
        Logger.warn('Operation warning', {
            warning,
            operation: context.operation,
            connectionId: context.connectionId
        });

        vscode.window.showWarningMessage(warning);
    }

    static handleInfo(message: string, context: ErrorContext): void {
        Logger.info('Operation info', {
            message,
            operation: context.operation,
            connectionId: context.connectionId
        });

        vscode.window.showInformationMessage(message);
    }

    private static getErrorSuggestions(errorMessage: string, context: ErrorContext): string[] {
        const suggestions: string[] = [];

        // Connection-related suggestions
        if (context.operation.includes('Connection') || context.operation.includes('connection')) {
            if (errorMessage.toLowerCase().includes('authentication') || errorMessage.toLowerCase().includes('password')) {
                suggestions.push('Check your username and password');
                suggestions.push('Verify the user has access to the specified database');
            }
            if (errorMessage.toLowerCase().includes('host') || errorMessage.toLowerCase().includes('port')) {
                suggestions.push('Verify the database server host and port');
                suggestions.push('Check if the database server is running');
                suggestions.push('Ensure firewall settings allow the connection');
            }
            if (errorMessage.toLowerCase().includes('database')) {
                suggestions.push('Verify the database name exists on the server');
                suggestions.push('Check if the user has access to the database');
            }
        }

        // Schema-related suggestions
        if (context.operation.includes('Schema') || context.operation.includes('schema')) {
            suggestions.push('Check if the database connection is working');
            suggestions.push('Verify you have read permissions on the database');
            suggestions.push('Ensure the schema exists in the database');
        }

        // Migration-related suggestions
        if (context.operation.includes('Migration') || context.operation.includes('migration')) {
            suggestions.push('Review the migration script for syntax errors');
            suggestions.push('Check if target database is writable');
            suggestions.push('Verify all referenced objects exist');
            suggestions.push('Consider running in dry-run mode first');
        }

        // Generic suggestions
        if (suggestions.length === 0) {
            suggestions.push('Check the extension logs for more details');
            suggestions.push('Verify your database connection settings');
            suggestions.push('Try the operation again');
        }

        return suggestions;
    }

    private static canRetryOperation(operation: string): boolean {
        const retryableOperations = [
            'TestConnection',
            'BrowseSchema',
            'CompareSchemas',
            'GenerateMigration',
            'ViewObjectDetails'
        ];

        return retryableOperations.some(op => operation.includes(op));
    }

    private static getUserFriendlyMessage(errorMessage: string, context: ErrorContext): string {
        // Connection-related errors
        if (context.operation.includes('connection') || context.operation.includes('Connection')) {
            if (errorMessage.toLowerCase().includes('authentication failed') ||
                errorMessage.toLowerCase().includes('password') ||
                errorMessage.toLowerCase().includes('unauthorized')) {
                return 'Connection failed: Invalid username or password';
            }

            if (errorMessage.toLowerCase().includes('host') ||
                errorMessage.toLowerCase().includes('port') ||
                errorMessage.toLowerCase().includes('connection refused')) {
                return 'Connection failed: Cannot reach database server. Check host and port settings';
            }

            if (errorMessage.toLowerCase().includes('database')) {
                return 'Connection failed: Database not found or not accessible';
            }

            return 'Connection failed: Please check your connection settings';
        }

        // Schema-related errors
        if (context.operation.includes('schema') || context.operation.includes('Schema')) {
            if (errorMessage.toLowerCase().includes('permission') ||
                errorMessage.toLowerCase().includes('access denied')) {
                return 'Schema access failed: Insufficient permissions for database operations';
            }

            if (errorMessage.toLowerCase().includes('timeout')) {
                return 'Schema operation timed out: Database is not responding';
            }

            return 'Schema operation failed: Unable to access database schema';
        }

        // Migration-related errors
        if (context.operation.includes('migration') || context.operation.includes('Migration')) {
            if (errorMessage.toLowerCase().includes('transaction')) {
                return 'Migration failed: Database transaction error. Changes have been rolled back';
            }

            if (errorMessage.toLowerCase().includes('syntax')) {
                return 'Migration failed: SQL syntax error in generated script';
            }

            return 'Migration operation failed: Please check the migration script and try again';
        }

        // Generic fallback
        return `Operation failed: ${errorMessage}`;
    }

    static async withErrorHandling<T>(
        operation: () => Promise<T>,
        context: ErrorContext
    ): Promise<T | undefined> {
        try {
            return await operation();
        } catch (error) {
            this.handleError(error, context);
            return undefined;
        }
    }

    static createContext(operation: string, additionalInfo?: Record<string, any>): ErrorContext {
        return {
            operation,
            additionalInfo
        };
    }

    static addConnectionContext(context: ErrorContext, connectionId: string): ErrorContext {
        return {
            ...context,
            connectionId
        };
    }

    static addObjectContext(context: ErrorContext, objectType: string, objectName: string): ErrorContext {
        return {
            ...context,
            objectType,
            objectName
        };
    }


    /**
     * Enhanced error handling with severity classification
     */
    static handleErrorWithSeverity(error: unknown, context: ErrorContext, severity?: ErrorSeverity): void {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorSeverity = severity || this.classifyErrorSeverity(errorMessage, context);

        Logger.error(`[${errorSeverity}] Operation failed`, error as Error, {
            operation: context.operation,
            connectionId: context.connectionId,
            objectType: context.objectType,
            objectName: context.objectName,
            additionalInfo: context.additionalInfo,
            severity: errorSeverity
        });

        // For critical errors, show more prominent warning
        if (errorSeverity === ErrorSeverity.CRITICAL) {
            vscode.window.showErrorMessage(
                `Critical error in ${context.operation}: ${this.getUserFriendlyMessage(errorMessage, context)}`,
                'Show Details', 'View Logs', 'Reset Services'
            ).then(selection => {
                if (selection === 'View Logs') {
                    Logger.showOutputChannel();
                } else if (selection === 'Reset Services') {
                    this.resetAllCircuitBreakers();
                }
            });
        } else {
            this.handleError(error, context);
        }
    }

    /**
     * Classify error severity based on message and context
     */
    private static classifyErrorSeverity(errorMessage: string, context: ErrorContext): ErrorSeverity {
        const message = errorMessage.toLowerCase();

        // Critical errors
        if (message.includes('fatal') ||
            message.includes('critical') ||
            message.includes('system failure') ||
            context.operation.includes('Extension') ||
            context.operation.includes('Activation')) {
            return ErrorSeverity.CRITICAL;
        }

        // High severity errors
        if (message.includes('database connection lost') ||
            message.includes('authentication failed') ||
            message.includes('permission denied') ||
            context.operation.includes('Migration') && message.includes('rollback failed')) {
            return ErrorSeverity.HIGH;
        }

        // Medium severity errors
        if (message.includes('timeout') ||
            message.includes('network error') ||
            message.includes('temporary failure')) {
            return ErrorSeverity.MEDIUM;
        }

        return ErrorSeverity.LOW;
    }


    /**
     * Enhanced error context creation with timestamp and severity
     */
    static createEnhancedContext(
        operation: string,
        additionalInfo?: Record<string, any>,
        connectionId?: string,
        objectType?: string,
        objectName?: string
    ): ErrorContext {
        return {
            operation,
            ...(connectionId && { connectionId }),
            ...(objectType && { objectType }),
            ...(objectName && { objectName }),
            additionalInfo: {
                ...additionalInfo,
                timestamp: new Date().toISOString(),
                nodeVersion: process.version,
                platform: process.platform,
                vscodeVersion: vscode.version
            }
        };
    }

    /**
     * Generate actionable guidance based on error context
     */
    private static generateActionableGuidance(errorMessage: string, operation: string): any[] {
        const guidance: any[] = [];

        // Connection-related guidance
        if (operation.includes('connection') || operation.includes('Connection')) {
            guidance.push({
                id: 'check-connection',
                title: 'Test Database Connection',
                description: 'Verify that the database connection settings are correct and the server is accessible.',
                action: 'Test Connection',
                category: 'diagnostic',
                priority: 'high'
            });

            if (errorMessage.toLowerCase().includes('authentication') || errorMessage.toLowerCase().includes('password')) {
                guidance.push({
                    id: 'validate-configuration',
                    title: 'Review Connection Settings',
                    description: 'Check your username, password, and database credentials in the connection configuration.',
                    action: 'Open Settings',
                    category: 'configuration',
                    priority: 'high'
                });
            }
        }

        // Schema-related guidance
        if (operation.includes('schema') || operation.includes('Schema')) {
            guidance.push({
                id: 'check-connection',
                title: 'Verify Database Access',
                description: 'Ensure you have read permissions on the database and schema objects.',
                action: 'Test Connection',
                category: 'diagnostic',
                priority: 'high'
            });
        }

        // Migration-related guidance
        if (operation.includes('migration') || operation.includes('Migration')) {
            guidance.push({
                id: 'validate-configuration',
                title: 'Review Migration Script',
                description: 'Check the migration script for syntax errors and ensure all referenced objects exist.',
                action: 'Validate Script',
                category: 'diagnostic',
                priority: 'high'
            });
        }

        // Generic guidance
        guidance.push({
            id: 'view-logs',
            title: 'Check Extension Logs',
            description: 'View detailed logs for additional error information and troubleshooting steps.',
            action: 'Show Logs',
            category: 'diagnostic',
            priority: 'medium'
        });

        if (errorMessage.toLowerCase().includes('service unavailable')) {
            guidance.push({
                id: 'restart-extension',
                title: 'Restart Extension',
                description: 'Restart the extension if services are experiencing persistent issues.',
                action: 'Restart Extension',
                category: 'immediate',
                priority: 'high'
            });
        }

        return guidance;
    }

    /**
     * Reset all circuit breakers and services
     */
    static resetAllCircuitBreakers(): void {
        // Reset circuit breakers and clear any cached error states
        Logger.info('Resetting all circuit breakers and clearing error states');

        // This would typically reset circuit breakers, clear caches, etc.
        // For now, we'll just log the action
    }
}