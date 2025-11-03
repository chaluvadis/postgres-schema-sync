import * as vscode from 'vscode';
import { PostgreSqlTreeProvider } from '@/providers/PostgreSqlTreeProvider';
import { ConnectionManager } from '@/managers/ConnectionManager';
import { ConnectionManagementView } from '@/views/ConnectionManagementView';
import { Logger } from '@/utils/Logger';
import { ErrorHandler, ErrorSeverity } from '@/utils/ErrorHandler';

export class PostgreSqlExtension {
    private context: vscode.ExtensionContext;
    private connectionManager: ConnectionManager;
    private connectionView: ConnectionManagementView;
    private treeProvider: PostgreSqlTreeProvider;

    constructor(
        context: vscode.ExtensionContext,
        connectionManager: ConnectionManager,
        treeProvider: PostgreSqlTreeProvider
    ) {
        this.context = context;
        this.connectionManager = connectionManager;
        this.connectionView = new ConnectionManagementView(connectionManager);
        this.treeProvider = treeProvider;
    }
    async editConnection(connection: any): Promise<void> {
        try {
            Logger.info('Editing database connection', connection);

            if (!connection || !connection.id) {
                vscode.window.showErrorMessage('No connection selected for editing');
                return;
            }

            const updatedConnection = await this.connectionView.showConnectionDialog(connection);
            if (!updatedConnection) {
                return;
            }

            this.treeProvider.refresh();
        } catch (error) {
            ErrorHandler.handleError(error, ErrorHandler.createContext('EditConnection'));
        }
    }
    async testConnection(connection: any): Promise<void> {
        const context = ErrorHandler.createEnhancedContext(
            'TestConnection',
            {
                connectionId: connection?.id,
                connectionName: connection?.name
            }
        );

        try {
            Logger.info('Testing database connection', connection);

            if (!connection || !connection.id) {
                const error = new Error('Connection ID is required for testing');
                ErrorHandler.handleError(error, context);
                vscode.window.showErrorMessage('No connection selected for testing');
                return;
            }

            try {
                if (!this.connectionManager) {
                    throw new Error('Connection manager not available');
                }
            } catch (error) {
                ErrorHandler.handleError(error, ErrorHandler.createContext('ConnectionTestingServiceCheck'));
                return;
            }

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Testing Connection',
                cancellable: true
            }, async (progress, token) => {
                progress.report({ increment: 0, message: 'Establishing connection...' });

                try {
                    let success: boolean;
                    try {
                        const result = await this.connectionManager.testConnection(connection.id);

                        if (!result) {
                            throw new Error('Connection test returned false');
                        }

                        success = result;
                    } catch (error) {
                        Logger.error('Connection test failed after retries', error as Error);
                        ErrorHandler.handleError(error, ErrorHandler.createContext('ConnectionTestExecution', {
                            connectionId: connection.id,
                            connectionName: connection.name
                        }));
                        throw new Error(`Connection test failed: ${(error as Error).message}`);
                    }

                    progress.report({ increment: 50, message: 'Running connectivity tests...' });

                    if (token.isCancellationRequested) {
                        Logger.info('Connection test cancelled by user');
                        return;
                    }

                    progress.report({ increment: 100, message: 'Connection test completed' });

                    if (success) {
                        vscode.window.showInformationMessage(
                            `Connection "${connection.name}" is working correctly`,
                            'Test Again', 'Configure'
                        ).then(selection => {
                            if (selection === 'Test Again') {
                                this.testConnection(connection);
                            } else if (selection === 'Configure') {
                                this.editConnection(connection);
                            }
                        });

                        Logger.info('Connection test successful', 'testConnection', { connectionId: connection.id, connectionName: connection.name });
                    } else {
                        const errorMsg = `Connection "${connection.name}" failed. Please check your host, port, database name, username, and password.`;
                        vscode.window.showErrorMessage(
                            errorMsg,
                            'Edit Connection', 'View Logs', 'Get Help'
                        ).then(selection => {
                            if (selection === 'Edit Connection') {
                                this.editConnection(connection);
                            } else if (selection === 'View Logs') {
                                Logger.showOutputChannel();
                            } else if (selection === 'Get Help') {
                                vscode.commands.executeCommand('postgresql.showHelp');
                            }
                        });
                    }
                } catch (testError) {
                    if (token.isCancellationRequested) {
                        Logger.info('Connection test cancelled by user');
                        return;
                    }

                    const error = testError as Error;

                    ErrorHandler.handleErrorWithSeverity(
                        error,
                        ErrorHandler.createContext('ConnectionTestFailure', {
                            connectionId: connection.id,
                            connectionName: connection.name,
                            error: error.message
                        }),
                        error.message.includes('authentication') || error.message.includes('password')
                            ? ErrorSeverity.HIGH
                            : ErrorSeverity.MEDIUM
                    );

                    throw error;
                }
            });
        } catch (error) {
            ErrorHandler.handleError(error, context);
        }
    }
    async executeMigration(migration: any): Promise<void> {
        try {
            Logger.info('Executing migration', migration);

            // Validate migration data
            if (!migration?.id) {
                vscode.window.showErrorMessage('Invalid migration data for execution');
                return;
            }

            if (!migration?.targetConnection) {
                vscode.window.showErrorMessage('No target connection specified for migration');
                return;
            }

            // Confirm execution
            const confirm = await vscode.window.showWarningMessage(
                `Execute migration "${migration.name}" on ${migration.targetConnection}?`,
                'Execute', 'Cancel'
            );

            if (confirm !== 'Execute') {
                return;
            }

            // Show migration execution in progress
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Executing Migration',
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: 'Starting migration...' });

                try {
                    // TODO: Implement actual migration execution using ModularSchemaManager
                    // For now, show that migration functionality needs to be implemented
                    progress.report({ increment: 50, message: 'Migration execution not yet implemented' });

                    // Simulate some processing time
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    progress.report({ increment: 100, message: 'Migration completed (placeholder)' });

                    vscode.window.showInformationMessage(
                        `Migration "${migration.name}" execution placeholder completed`,
                        'View Logs'
                    ).then(selection => {
                        if (selection === 'View Logs') {
                            Logger.showOutputChannel();
                        }
                    });

                    // Clear migration state
                    this.context.globalState.update('postgresql.currentMigration', undefined);

                } catch (error) {
                    Logger.error('Migration execution failed', error as Error);
                    vscode.window.showErrorMessage(
                        `Migration "${migration.name}" failed: ${(error as Error).message}`,
                        'View Logs'
                    ).then(selection => {
                        if (selection === 'View Logs') {
                            Logger.showOutputChannel();
                        }
                    });
                }
            });

        } catch (error) {
            Logger.error('Migration execution error', error as Error);
            vscode.window.showErrorMessage('Failed to execute migration');
        }
    }
    async dispose(): Promise<void> {
        const disposeContext = ErrorHandler.createEnhancedContext(
            'ExtensionDisposal',
            {
                graceful: true,
                timestamp: new Date().toISOString()
            }
        );

        try {
            Logger.info('Disposing PostgreSQL extension');

            try {
                await this.connectionManager.dispose();
            } catch (error) {
                Logger.error('Error disposing connection manager, continuing with other disposals', error as Error);
                ErrorHandler.handleError(error, ErrorHandler.createContext('ConnectionManagerDisposal'));
                // Don't fail disposal for connection manager errors
            }

            Logger.info('PostgreSQL extension disposed successfully');
        } catch (error) {
            Logger.error('Error during extension disposal', error as Error);

            ErrorHandler.handleErrorWithSeverity(
                error as Error,
                disposeContext,
                ErrorSeverity.HIGH
            );

            // Even on disposal errors, we should not throw to avoid VS Code issues
        }
    }
}