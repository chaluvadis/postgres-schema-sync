import * as vscode from 'vscode';
import { Logger } from './Logger';

export interface ErrorContext {
    operation: string;
    timestamp: Date;
    contextData?: Record<string, any> | undefined;
    component?: string | undefined;
    version?: string | undefined;
    userId?: string | undefined;
    sessionId?: string | undefined;
    recoverable?: boolean | undefined;
    retryCount?: number | undefined;
}

export interface ErrorRecoveryAction {
    id: string;
    label: string;
    description: string;
    action: () => Promise<void>;
    primary?: boolean;
    requiresUserInput?: boolean;
}

export interface ErrorDetails {
    errorId: string;
    message: string;
    category: 'connection' | 'authentication' | 'migration' | 'schema' | 'data' | 'performance' | 'system' | 'unknown';
    severity: ErrorSeverity;
    context: ErrorContext;
    recoveryActions: ErrorRecoveryAction[];
    suggestions: string[];
    relatedErrors?: string[];
    stackTrace?: string;
    timestamp: Date;
}

export enum ErrorSeverity {
    LOW = 'LOW',
    MEDIUM = 'MEDIUM',
    HIGH = 'HIGH',
    CRITICAL = 'CRITICAL'
}

export class ErrorHandler {
    private static errorHistory: ErrorDetails[] = [];
    private static maxHistorySize = 1000;
    private static sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    private constructor() { }

    static createContext(operation: string, contextData?: Record<string, any>): ErrorContext {
        return {
            operation,
            timestamp: new Date(),
            contextData,
            sessionId: this.sessionId,
            recoverable: true,
            retryCount: 0
        };
    }

    static categorizeError(errorMessage: string): ErrorDetails['category'] {
        const message = errorMessage.toLowerCase();

        if (message.includes('connection') || message.includes('connect') || message.includes('network')) {
            return 'connection';
        } else if (message.includes('authentication') || message.includes('password') || message.includes('credential')) {
            return 'authentication';
        } else if (message.includes('migration') || message.includes('schema') || message.includes('alter') || message.includes('create') || message.includes('drop')) {
            return 'migration';
        } else if (message.includes('table') || message.includes('column') || message.includes('index') || message.includes('view')) {
            return 'schema';
        } else if (message.includes('data') || message.includes('row') || message.includes('insert') || message.includes('update') || message.includes('delete')) {
            return 'data';
        } else if (message.includes('performance') || message.includes('timeout') || message.includes('slow') || message.includes('lock')) {
            return 'performance';
        } else if (message.includes('memory') || message.includes('disk') || message.includes('resource') || message.includes('system')) {
            return 'system';
        }

        return 'unknown';
    }

    static generateRecoveryActions(error: unknown, context: ErrorContext): ErrorRecoveryAction[] {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const category = this.categorizeError(errorMessage);
        const actions: ErrorRecoveryAction[] = [];

        switch (category) {
            case 'connection':
                actions.push(
                    {
                        id: 'retry_connection',
                        label: 'Retry Connection',
                        description: 'Attempt to reconnect to the database',
                        action: async () => {
                            if (context.contextData?.connectionId) {
                                await vscode.commands.executeCommand('postgresql.testConnection', context.contextData.connectionId);
                            }
                        },
                        primary: true
                    },
                    {
                        id: 'edit_connection',
                        label: 'Edit Connection',
                        description: 'Modify connection settings',
                        action: async () => {
                            if (context.contextData?.connectionId) {
                                await vscode.commands.executeCommand('postgresql.editConnection', context.contextData.connectionId);
                            }
                        }
                    },
                    {
                        id: 'add_new_connection',
                        label: 'Add New Connection',
                        description: 'Create a new database connection',
                        action: async () => { await vscode.commands.executeCommand('postgresql.addConnection'); }
                    }
                );
                break;

            case 'authentication':
                actions.push(
                    {
                        id: 'edit_credentials',
                        label: 'Update Credentials',
                        description: 'Update username and password',
                        action: async () => {
                            if (context.contextData?.connectionId) {
                                await vscode.commands.executeCommand('postgresql.editConnection', context.contextData.connectionId);
                            }
                        },
                        primary: true,
                        requiresUserInput: true
                    },
                    {
                        id: 'test_credentials',
                        label: 'Test Credentials',
                        description: 'Test the current credentials',
                        action: async () => {
                            if (context.contextData?.connectionId) {
                                await vscode.commands.executeCommand('postgresql.testConnection', context.contextData.connectionId);
                            }
                        }
                    }
                );
                break;

            case 'migration':
                actions.push(
                    {
                        id: 'validate_migration',
                        label: 'Validate Migration',
                        description: 'Run migration validation',
                        action: async () => { await vscode.commands.executeCommand('postgresql.validateMigration'); },
                        primary: true
                    },
                    {
                        id: 'view_migration_history',
                        label: 'View History',
                        description: 'Check previous migration attempts',
                        action: async () => { await vscode.commands.executeCommand('postgresql.showLogs'); }
                    },
                    {
                        id: 'dry_run',
                        label: 'Dry Run',
                        description: 'Preview migration without executing',
                        action: async () => {
                            // Would need migration context
                            vscode.window.showInformationMessage('Dry run feature coming soon');
                        }
                    }
                );
                break;

            case 'schema':
                actions.push(
                    {
                        id: 'refresh_schema',
                        label: 'Refresh Schema',
                        description: 'Reload schema information',
                        action: async () => { await vscode.commands.executeCommand('postgresql.refreshExplorer'); },
                        primary: true
                    },
                    {
                        id: 'compare_schemas',
                        label: 'Compare Schemas',
                        description: 'Compare database schemas',
                        action: async () => { await vscode.commands.executeCommand('postgresql.compareSchemas'); }
                    }
                );
                break;

            case 'data':
                actions.push(
                    {
                        id: 'export_data',
                        label: 'Export Data',
                        description: 'Export data before retrying',
                        action: async () => { await vscode.commands.executeCommand('postgresql.exportData'); },
                        primary: true
                    },
                    {
                        id: 'validate_data',
                        label: 'Validate Data',
                        description: 'Check data integrity',
                        action: async () => { await vscode.commands.executeCommand('postgresql.validateData'); }
                    }
                );
                break;

            case 'performance':
                actions.push(
                    {
                        id: 'view_performance',
                        label: 'View Performance',
                        description: 'Check performance metrics',
                        action: async () => { await vscode.commands.executeCommand('postgresql.showQueryAnalytics'); },
                        primary: true
                    },
                    {
                        id: 'optimize_query',
                        label: 'Optimize',
                        description: 'Get optimization suggestions',
                        action: async () => { await vscode.window.showInformationMessage('Performance optimization suggestions coming soon'); }
                    }
                );
                break;

            default:
                actions.push(
                    {
                        id: 'view_logs',
                        label: 'View Logs',
                        description: 'Check detailed error logs',
                        action: async () => { Logger.showOutputChannel(); },
                        primary: true
                    },
                    {
                        id: 'get_help',
                        label: 'Get Help',
                        description: 'Open help documentation',
                        action: async () => { await vscode.commands.executeCommand('postgresql.showHelp'); }
                    }
                );
        }

        return actions;
    }

    static generateSuggestions(error: unknown, category: ErrorDetails['category']): string[] {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const suggestions: string[] = [];

        switch (category) {
            case 'connection':
                suggestions.push('Check network connectivity');
                suggestions.push('Verify database server is running');
                suggestions.push('Confirm host, port, and database name');
                if (errorMessage.includes('timeout')) {
                    suggestions.push('Check firewall settings');
                    suggestions.push('Verify connection timeout settings');
                }
                break;

            case 'authentication':
                suggestions.push('Verify username and password');
                suggestions.push('Check user permissions on the database');
                suggestions.push('Ensure the user account is not locked');
                break;

            case 'migration':
                suggestions.push('Run migration validation first');
                suggestions.push('Check for conflicting operations');
                suggestions.push('Ensure target database is accessible');
                suggestions.push('Consider breaking large migrations into smaller chunks');
                break;

            case 'schema':
                suggestions.push('Refresh schema information');
                suggestions.push('Check for schema locks');
                suggestions.push('Verify object permissions');
                break;

            case 'data':
                suggestions.push('Check data constraints');
                suggestions.push('Verify data types match');
                suggestions.push('Consider data validation');
                break;

            case 'performance':
                suggestions.push('Check query execution plan');
                suggestions.push('Consider adding appropriate indexes');
                suggestions.push('Review query complexity');
                break;

            default:
                suggestions.push('Check the logs for more details');
                suggestions.push('Restart the extension if issues persist');
                suggestions.push('Contact support if the problem continues');
        }

        return suggestions;
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
        const category = this.categorizeError(errorMessage);
        const recoveryActions = this.generateRecoveryActions(new Error(errorMessage), context);
        const suggestions = this.generateSuggestions(new Error(errorMessage), category);

        // Create error details for history
        const errorDetails: ErrorDetails = {
            errorId: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            message: errorMessage,
            category,
            severity: this.determineSeverity(errorMessage, category),
            context,
            recoveryActions,
            suggestions,
            timestamp: new Date()
        };

        // Add to history
        this.errorHistory.unshift(errorDetails);
        if (this.errorHistory.length > this.maxHistorySize) {
            this.errorHistory = this.errorHistory.slice(0, this.maxHistorySize);
        }

        // Show enhanced error notification with recovery actions
        const primaryActions = recoveryActions.filter(action => action.primary).map(action => action.label);
        const allActions = [...primaryActions, 'View Details', 'View Logs'];

        vscode.window.showErrorMessage(
            `PostgreSQL Schema Sync: ${errorMessage}`,
            ...(allActions as [string, ...string[]])
        ).then(async (selection) => {
            if (selection === 'View Logs') {
                Logger.showOutputChannel();
            } else if (selection === 'View Details') {
                this.showErrorDetails(errorDetails);
            } else {
                // Execute the selected recovery action
                const selectedAction = recoveryActions.find(action => action.label === selection);
                if (selectedAction) {
                    try {
                        await selectedAction.action();
                    } catch (actionError) {
                        Logger.error('Recovery action failed', actionError as Error);
                        vscode.window.showErrorMessage(`Recovery action failed: ${(actionError as Error).message}`);
                    }
                }
            }
        });
    }

    private static determineSeverity(errorMessage: string, category: ErrorDetails['category']): ErrorSeverity {
        const message = errorMessage.toLowerCase();

        // Critical errors
        if (message.includes('fatal') || message.includes('critical') || message.includes('irrecoverable')) {
            return ErrorSeverity.CRITICAL;
        }

        // High severity errors
        if (message.includes('access denied') || message.includes('authentication failed') ||
            message.includes('database not found') || message.includes('migration failed') ||
            category === 'authentication' || category === 'migration') {
            return ErrorSeverity.HIGH;
        }

        // Medium severity errors
        if (message.includes('timeout') || message.includes('connection failed') ||
            message.includes('performance') || category === 'performance') {
            return ErrorSeverity.MEDIUM;
        }

        // Low severity errors
        return ErrorSeverity.LOW;
    }

    private static showErrorDetails(errorDetails: ErrorDetails): void {
        const panel = vscode.window.createWebviewPanel(
            'errorDetails',
            'Error Details',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        panel.webview.html = this.generateErrorDetailsHtml(errorDetails);
    }

    private static generateErrorDetailsHtml(errorDetails: ErrorDetails): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Error Details</title>
                <style>
                    body { font-family: var(--vscode-font-family); padding: 20px; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); }
                    .error-header { background: var(--vscode-textBlockQuote-background); padding: 15px; border-radius: 4px; margin-bottom: 20px; }
                    .error-id { font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 10px; }
                    .error-message { font-size: 16px; font-weight: bold; margin-bottom: 10px; }
                    .error-meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 15px 0; }
                    .meta-item { background: var(--vscode-editor-background); padding: 10px; border-radius: 4px; border: 1px solid var(--vscode-panel-border); }
                    .meta-label { font-weight: bold; font-size: 12px; text-transform: uppercase; color: var(--vscode-descriptionForeground); }
                    .meta-value { margin-top: 5px; }
                    .recovery-actions { background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; margin: 20px 0; }
                    .section-header { background: var(--vscode-titleBar-activeBackground); padding: 12px 15px; border-bottom: 1px solid var(--vscode-panel-border); font-weight: bold; }
                    .recovery-action { padding: 10px 15px; border-bottom: 1px solid var(--vscode-panel-border); cursor: pointer; transition: background-color 0.2s; }
                    .recovery-action:hover { background: var(--vscode-list-hoverBackground); }
                    .recovery-action:last-child { border-bottom: none; }
                    .action-title { font-weight: bold; }
                    .action-description { font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 5px; }
                    .suggestions { background: var(--vscode-textBlockQuote-background); padding: 15px; border-radius: 4px; margin-top: 20px; }
                    .suggestion-item { margin-bottom: 10px; padding-left: 20px; position: relative; }
                    .suggestion-item:before { content: "💡"; position: absolute; left: 0; }
                </style>
            </head>
            <body>
                <div class="error-header">
                    <div class="error-id">Error ID: ${errorDetails.errorId}</div>
                    <div class="error-message">${errorDetails.message}</div>
                    <div class="error-meta">
                        <div class="meta-item">
                            <div class="meta-label">Category</div>
                            <div class="meta-value">${errorDetails.category}</div>
                        </div>
                        <div class="meta-item">
                            <div class="meta-label">Severity</div>
                            <div class="meta-value">${errorDetails.severity}</div>
                        </div>
                        <div class="meta-item">
                            <div class="meta-label">Timestamp</div>
                            <div class="meta-value">${errorDetails.timestamp.toLocaleString()}</div>
                        </div>
                        <div class="meta-item">
                            <div class="meta-label">Operation</div>
                            <div class="meta-value">${errorDetails.context.operation}</div>
                        </div>
                    </div>
                </div>

                ${errorDetails.recoveryActions.length > 0 ? `
                    <div class="recovery-actions">
                        <div class="section-header">Recovery Actions</div>
                        ${errorDetails.recoveryActions.map(action => `
                            <div class="recovery-action" onclick="executeAction('${action.id}')">
                                <div class="action-title">${action.label}</div>
                                <div class="action-description">${action.description}</div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}

                ${errorDetails.suggestions.length > 0 ? `
                    <div class="suggestions">
                        <h3>Suggestions</h3>
                        ${errorDetails.suggestions.map(suggestion => `
                            <div class="suggestion-item">${suggestion}</div>
                        `).join('')}
                    </div>
                ` : ''}

                <script>
                    const vscode = acquireVsCodeApi();

                    function executeAction(actionId) {
                        vscode.postMessage({
                            command: 'executeRecoveryAction',
                            actionId: actionId
                        });
                    }
                </script>
            </body>
            </html>
        `;
    }

    static getErrorHistory(limit?: number): ErrorDetails[] {
        return limit ? this.errorHistory.slice(0, limit) : [...this.errorHistory];
    }

    static clearErrorHistory(): void {
        this.errorHistory = [];
    }

    static getErrorStatistics(): {
        totalErrors: number;
        errorsByCategory: Record<string, number>;
        errorsBySeverity: Record<string, number>;
        recentErrors: number;
    } {
        const last24Hours = Date.now() - (24 * 60 * 60 * 1000);
        const recentErrors = this.errorHistory.filter(error => error.timestamp.getTime() > last24Hours).length;

        const errorsByCategory = this.errorHistory.reduce((acc, error) => {
            acc[error.category] = (acc[error.category] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const errorsBySeverity = this.errorHistory.reduce((acc, error) => {
            acc[error.severity] = (acc[error.severity] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        return {
            totalErrors: this.errorHistory.length,
            errorsByCategory,
            errorsBySeverity,
            recentErrors
        };
    }
};