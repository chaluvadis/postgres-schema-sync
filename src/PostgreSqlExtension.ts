import * as vscode from 'vscode';
import { PostgreSqlTreeProvider } from '@/providers/PostgreSqlTreeProvider';
import { ConnectionManager } from '@/managers/ConnectionManager';
import { StreamlinedServices } from './services/StreamlinedServices';
import { ConnectionManagementView } from '@/views/ConnectionManagementView';
import { Logger } from '@/utils/Logger';
import { ErrorHandler, ErrorSeverity } from '@/utils/ErrorHandler';

export class PostgreSqlExtension {
    private context: vscode.ExtensionContext;
    private connectionManager: ConnectionManager;
    private streamlinedServices: StreamlinedServices;
    private connectionView: ConnectionManagementView;
    private treeProvider: PostgreSqlTreeProvider;

    constructor(
        context: vscode.ExtensionContext,
        connectionManager: ConnectionManager,
        streamlinedServices: StreamlinedServices,
        treeProvider: PostgreSqlTreeProvider
    ) {
        this.context = context;
        this.connectionManager = connectionManager;
        this.streamlinedServices = streamlinedServices;
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
        const context = ErrorHandler.createEnhancedContext(
            'ExecuteMigration',
            {
                migrationId: migration?.id,
                targetConnection: migration?.targetConnection,
                operationCount: migration?.sqlScript?.split('\n').length || 0
            }
        );

        try {
            Logger.info('Executing migration', migration);

            if (!migration?.id) {
                const error = new Error('Migration ID is required for execution');
                ErrorHandler.handleError(error, context);
                vscode.window.showErrorMessage('Invalid migration data for execution');
                return;
            }

            // Get target connection for the migration
            const targetConnectionId = migration.targetConnection;
            if (!targetConnectionId) {
                const error = new Error('Target connection is required for migration execution');
                ErrorHandler.handleError(error, context);
                vscode.window.showErrorMessage('No target connection specified for migration');
                return;
            }

            try {
                if (!this.streamlinedServices.migrationManager) {
                    throw new Error('Migration manager not available');
                }
            } catch (error) {
                ErrorHandler.handleError(error, ErrorHandler.createContext('MigrationExecutionServiceCheck'));
                return;
            }

            const confirm = await vscode.window.showWarningMessage(
                `Are you sure you want to execute this migration?\n\nMigration: ${migration.name}\nOperations: ${migration.sqlScript.split('\n').length}\nTarget: ${targetConnectionId}`,
                'Execute', 'Cancel'
            );

            if (confirm !== 'Execute') {
                return;
            }

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Executing Migration',
                cancellable: true
            }, async (progress): Promise<void> => {
                progress.report({ increment: 0, message: 'Preparing migration execution...' });

                let migrationSuccess = false;
                let rollbackAttempted = false;

                try {
                    try {
                        const success = await this.streamlinedServices.migrationManager.executeMigration(
                            migration.sourceConnection,
                            migration.targetConnection
                        ).then(result => result.success);

                        if (!success) {
                            throw new Error('Migration execution returned false');
                        }

                        migrationSuccess = success;
                    } catch (error) {
                        Logger.error('Migration execution failed, attempting rollback', error as Error);

                        if (migration.rollbackScript && !rollbackAttempted) {
                            rollbackAttempted = true;

                            const rollbackContext = ErrorHandler.createContext('MigrationRollback', {
                                migrationId: migration.id,
                                reason: 'Automatic rollback after execution failure'
                            });

                            try {
                                Logger.info('Attempting automatic rollback after migration failure');

                                try {
                                    // Use the dedicated rollback method in MigrationManager
                                    const rollbackSuccess = await this.streamlinedServices.migrationManager.cancelMigration(migration.id);

                                    if (rollbackSuccess) {
                                        Logger.info('Automatic rollback completed successfully');
                                        vscode.window.showWarningMessage(
                                            'Migration failed but was rolled back automatically',
                                            'View Details'
                                        ).then(selection => {
                                            if (selection === 'View Details') {
                                                Logger.showOutputChannel();
                                            }
                                        });
                                    } else {
                                        Logger.error('Automatic rollback also failed');
                                        vscode.window.showErrorMessage(
                                            'Migration failed and rollback also failed. Manual intervention may be required.',
                                            'View Logs', 'Get Help'
                                        ).then(selection => {
                                            if (selection === 'View Logs') {
                                                Logger.showOutputChannel();
                                            } else if (selection === 'Get Help') {
                                                vscode.commands.executeCommand('postgresql.showHelp');
                                            }
                                        });
                                    }

                                    return; // Don't return success for failed migration
                                } catch (rollbackError) {
                                    Logger.error('Automatic rollback failed', rollbackError as Error);
                                    ErrorHandler.handleError(rollbackError, rollbackContext);
                                    return;
                                }
                            } catch (rollbackError) {
                                Logger.error('Automatic rollback failed', rollbackError as Error);
                                ErrorHandler.handleError(rollbackError, rollbackContext);
                            }
                        }

                        throw error;
                    }

                    progress.report({ increment: 100, message: 'Migration execution completed' });

                    if (migrationSuccess) {
                        vscode.window.showInformationMessage(
                            `Migration "${migration.name}" executed successfully`,
                            'View Details', 'Clear Migration'
                        ).then(selection => {
                            if (selection === 'View Details') {
                                Logger.showOutputChannel();
                            } else if (selection === 'Clear Migration') {
                                this.context.globalState.update('postgresql.currentMigration', undefined);
                            }
                        });

                        await this.context.globalState.update('postgresql.currentMigration', undefined);
                    } else {
                        vscode.window.showErrorMessage(
                            `Migration "${migration.name}" failed during execution`,
                            'View Logs', 'Retry', 'Get Help'
                        ).then(selection => {
                            if (selection === 'View Logs') {
                                Logger.showOutputChannel();
                            } else if (selection === 'Retry') {
                                this.executeMigration(migration);
                            } else if (selection === 'Get Help') {
                                vscode.commands.executeCommand('postgresql.showHelp');
                            }
                        });
                    }
                } catch (executionError) {
                    const error = executionError as Error;

                    ErrorHandler.handleErrorWithSeverity(
                        error,
                        ErrorHandler.createContext('MigrationExecutionFailure', {
                            migrationId: migration.id,
                            targetConnection: targetConnectionId,
                            rollbackAttempted,
                            error: error.message
                        }),
                        error.message.includes('rollback') || rollbackAttempted
                            ? ErrorSeverity.HIGH
                            : ErrorSeverity.CRITICAL
                    );

                    throw error;
                }
            });
        } catch (error) {
            ErrorHandler.handleError(error, ErrorHandler.createContext('ExecuteMigration'));
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