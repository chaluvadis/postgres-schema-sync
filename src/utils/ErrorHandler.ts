import * as vscode from 'vscode';
import { Logger } from './Logger';

export interface ErrorContext {
    operation: string;
    timestamp: Date;
    contextData?: Record<string, any> | undefined;
    component?: string | undefined;
    version?: string | undefined;
}

export enum ErrorSeverity {
    LOW = 'LOW',
    MEDIUM = 'MEDIUM',
    HIGH = 'HIGH',
    CRITICAL = 'CRITICAL'
}

export class ErrorHandler {
    private constructor() { }

    static createContext(operation: string, contextData?: Record<string, any>): ErrorContext {
        return {
            operation,
            timestamp: new Date(),
            contextData
        };
    }
    static createEnhancedContext(
        operation: string,
        contextData?: Record<string, any>,
        component?: string,
        version?: string
    ): ErrorContext {
        return {
            operation,
            timestamp: new Date(),
            contextData: {
                ...contextData,
                component,
                version,
                machineName: 'VSCode Extension',
                processId: process.pid
            }
        };
    }

    static handleError(error: unknown, context: ErrorContext): void {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;

        // Log the error
        if (error instanceof Error) {
            Logger.error(errorMessage, error, context.operation, {
                ...context.contextData,
                stack: errorStack
            });
        } else {
            Logger.error(errorMessage, context.operation, {
                ...context.contextData,
                originalError: String(error)
            });
        }

        // Show user-friendly error message for certain types of errors
        if (this.shouldShowUserNotification(errorMessage)) {
            this.showUserErrorNotification(errorMessage, context);
        }
    }
    static handleErrorWithSeverity(
        error: unknown,
        context: ErrorContext,
        severity: ErrorSeverity
    ): void {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Log with appropriate level based on severity
        switch (severity) {
            case ErrorSeverity.CRITICAL:
                if (error instanceof Error) {
                    Logger.critical(errorMessage, error, context.operation, context.contextData);
                } else {
                    Logger.critical(errorMessage, context.operation, { ...context.contextData, originalError: String(error) });
                }
                break;
            case ErrorSeverity.HIGH:
                if (error instanceof Error) {
                    Logger.error(errorMessage, error, context.operation, context.contextData);
                } else {
                    Logger.error(errorMessage, context.operation, { ...context.contextData, originalError: String(error) });
                }
                break;
            case ErrorSeverity.MEDIUM:
                Logger.warn(errorMessage, context.operation, context.contextData);
                break;
            case ErrorSeverity.LOW:
            default:
                Logger.info(errorMessage, context.operation, context.contextData);
                break;
        }

        // Show user notification for high severity errors
        if (severity === ErrorSeverity.HIGH || severity === ErrorSeverity.CRITICAL) {
            this.showUserErrorNotification(errorMessage, context);
        }
    }

    private static shouldShowUserNotification(errorMessage: string): boolean {
        const userNotificationKeywords = [
            'connection failed',
            'authentication failed',
            'access denied',
            'database not found',
            'migration failed',
            'schema error',
            'critical error',
            'fatal error'
        ];

        return userNotificationKeywords.some(keyword =>
            errorMessage.toLowerCase().includes(keyword)
        );
    }
    private static showUserErrorNotification(errorMessage: string, context: ErrorContext): void {
        const actions: string[] = [];

        // Add relevant actions based on error type
        if (errorMessage.toLowerCase().includes('connection')) {
            actions.push('Add Connection', 'View Logs');
        } else if (errorMessage.toLowerCase().includes('migration')) {
            actions.push('View Logs', 'Get Help');
        } else {
            actions.push('View Logs', 'Report Issue');
        }

        vscode.window.showErrorMessage(
            `PostgreSQL Schema Sync: ${errorMessage}`,
            ...(actions as [string, ...string[]])
        ).then(selection => {
            if (selection === 'View Logs') {
                Logger.showOutputChannel();
            } else if (selection === 'Add Connection') {
                vscode.commands.executeCommand('postgresql.addConnection');
            } else if (selection === 'Get Help') {
                vscode.commands.executeCommand('postgresql.showHelp');
            } else if (selection === 'Report Issue') {
                vscode.commands.executeCommand('postgresql.showHelp'); // Could link to issues page
            }
        });
    }
};