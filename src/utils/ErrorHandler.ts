import * as vscode from 'vscode';
import { Logger } from './Logger';
import { ErrorDisplayView, ErrorDisplayData } from '../views/ErrorDisplayView';

export interface ErrorContext {
    operation: string;
    connectionId?: string;
    objectType?: string;
    objectName?: string;
    additionalInfo?: Record<string, any> | undefined;
}

export class ErrorHandler {
    private static errorView: ErrorDisplayView | undefined;

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
        vscode.window.showErrorMessage(userMessage, 'Show Details', 'View Logs').then(selection => {
            if (selection === 'Show Details') {
                this.showDetailedError(error, context);
            } else if (selection === 'View Logs') {
                Logger.showOutputChannel();
            }
        });
    }

    private static showDetailedError(error: unknown, context: ErrorContext): void {
        if (!this.errorView) {
            this.errorView = new ErrorDisplayView();
        }

        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;

        const errorData: ErrorDisplayData = {
            title: `${context.operation} Failed`,
            message: this.getUserFriendlyMessage(errorMessage, context),
            details: errorStack || errorMessage,
            suggestions: this.getErrorSuggestions(errorMessage, context),
            canRetry: this.canRetryOperation(context.operation),
            canReport: true,
            timestamp: new Date(),
            operation: context.operation,
            connectionId: context.connectionId || undefined
        };

        this.errorView.showError(errorData);
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
}