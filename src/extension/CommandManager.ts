import * as vscode from 'vscode';
import { PostgreSqlExtension } from '../PostgreSqlExtension';
import { ExtensionComponents } from '@/utils/ExtensionInitializer';
import { Logger } from '@/utils/Logger';
interface CommandDefinition {
    command: string;
    handler: (...args: any[]) => any;
    description?: string;
    category?: string;
}
interface ConnectionItem {
    label: string;
    detail: string;
    connection: any;
}
interface CommandError {
    command: string;
    error: string;
    timestamp: Date;
    context?: any;
}

export class CommandManager {
    private context: vscode.ExtensionContext;
    private extension: PostgreSqlExtension;
    private components: ExtensionComponents;
    private commandErrors: CommandError[] = [];
    private registeredCommands: Set<string> = new Set();
    constructor(
        context: vscode.ExtensionContext,
        extension: PostgreSqlExtension,
        components: ExtensionComponents
    ) {
        this.context = context;
        this.extension = extension;
        this.components = components;
    }
    registerCommands(): void {
        try {
            Logger.info('Registering PostgreSQL extension commands', 'CommandManager');

            this.registerCoreCommands();
            this.registerQueryCommands();
            this.registerSQLFileCommands();

            // Start command health monitoring
            this.startCommandMonitoring();

            Logger.info('All PostgreSQL extension commands registered successfully', 'CommandManager', {
                registeredCommands: this.registeredCommands.size
            });

        } catch (error) {
            Logger.error('Failed to register commands', error as Error, 'CommandManager');
            throw error;
        }
    }
    private startCommandMonitoring(): void {
        // Monitor command health every 5 minutes
        const monitoringInterval = setInterval(() => {
            this.monitorCommandHealth();
        }, 5 * 60 * 1000); // 5 minutes

        // Store interval for cleanup
        (this as any).monitoringInterval = monitoringInterval;

        Logger.info('Command health monitoring started', 'CommandManager');
    }
    stopCommandMonitoring(): void {
        if ((this as any).monitoringInterval) {
            clearInterval((this as any).monitoringInterval);
            (this as any).monitoringInterval = null;
            Logger.info('Command health monitoring stopped', 'CommandManager');
        }
    }
    private registerCoreCommands(): void {
        const coreCommands: CommandDefinition[] = [
            {
                command: 'postgresql.editConnection',
                handler: (connection?: any) => this.handleEditConnection(connection),
                description: 'Edit an existing database connection'
            },
            {
                command: 'postgresql.testConnection',
                handler: (connection?: any) => this.handleTestConnection(connection),
                description: 'Test database connection'
            },
            {
                command: 'postgresql.executeMigration',
                handler: (migration?: any) => this.handleExecuteMigration(migration),
                description: 'Execute database migration'
            },
            {
                command: 'postgresql.addConnection',
                handler: () => this.handleAddConnection(),
                description: 'Add new database connection'
            },
            {
                command: 'postgresql.removeConnection',
                handler: (connection?: any) => this.handleRemoveConnection(connection),
                description: 'Remove database connection'
            },
            {
                command: 'postgresql.refreshExplorer',
                handler: () => this.handleRefreshExplorer(),
                description: 'Refresh database explorer'
            },
            {
                command: 'postgresql.browseSchema',
                handler: (connectionId?: string, schemaName?: string) => this.handleBrowseSchema(connectionId, schemaName),
                description: 'Browse database schema'
            },
            {
                command: 'postgresql.compareSchemas',
                handler: (source?: any, target?: any) => this.handleCompareSchemas(source, target),
                description: 'Compare database schemas'
            },
            {
                command: 'postgresql.generateMigration',
                handler: (comparison?: any) => this.handleGenerateMigration(comparison),
                description: 'Generate migration script'
            },
            {
                command: 'postgresql.previewMigration',
                handler: (migration?: any) => this.handlePreviewMigration(migration),
                description: 'Preview migration script'
            },
            {
                command: 'postgresql.viewObjectDetails',
                handler: (databaseObject?: any) => this.handleViewObjectDetails(databaseObject),
                description: 'View database object details'
            },
            {
                command: 'postgresql.showCommandStats',
                handler: () => this.showCommandStats(),
                description: 'Show command execution statistics'
            },
            {
                command: 'postgresql.clearCommandErrors',
                handler: () => this.clearCommandErrors(),
                description: 'Clear command error history'
            }
        ];

        coreCommands.forEach(({ command, handler, description }) => {
            try {
                const disposable = vscode.commands.registerCommand(command, async (...args: any[]) => {
                    try {
                        Logger.debug('Executing command', 'CommandManager', { command, argCount: args.length });
                        await handler(...args);
                        this.registeredCommands.add(command);
                    } catch (error) {
                        this.handleCommandError(command, error as Error, args);
                    }
                });

                this.context.subscriptions.push(disposable);
                Logger.debug('Command registered successfully', 'CommandManager', { command, description });
            } catch (error) {
                this.handleCommandError(command, error as Error, ['registration']);
            }
        });

        // Register UI-specific commands
        this.registerUICommands();
    }
    private registerUICommands(): void {
        // Dashboard command
        this.context.subscriptions.push(
            vscode.commands.registerCommand('postgresql.showDashboard', () => {
                if (this.components.dashboardView) {
                    this.components.dashboardView.showDashboard();
                } else {
                    vscode.window.showErrorMessage('Dashboard view not available');
                }
            })
        );

        // Notification center command
        this.context.subscriptions.push(
            vscode.commands.registerCommand('postgresql.showNotifications', () => {
                if (this.components.notificationManager) {
                    this.components.notificationManager.showNotificationCenter();
                } else {
                    vscode.window.showErrorMessage('Notification manager not available');
                }
            })
        );

        // Active operations command
        this.context.subscriptions.push(
            vscode.commands.registerCommand('postgresql.showActiveOperations', () => {
                if (this.components.enhancedStatusBarProvider) {
                    this.components.enhancedStatusBarProvider.showOperationDetails();
                } else {
                    vscode.window.showErrorMessage('Enhanced status bar not available');
                }
            })
        );

        // Quick connect command
        this.context.subscriptions.push(
            vscode.commands.registerCommand('postgresql.quickConnect', async () => {
                const connectionName = await vscode.window.showInputBox({
                    prompt: 'Enter connection name',
                    placeHolder: 'My Database Connection'
                });

                if (connectionName) {
                    vscode.commands.executeCommand('postgresql.addConnection');
                }
            })
        );
    }
    private registerQueryCommands(): void {
        // Open query editor command
        this.context.subscriptions.push(
            vscode.commands.registerCommand('postgresql.openQueryEditor', async (connection) => {
                if (this.components.queryEditorView) {
                    await this.components.queryEditorView.showQueryEditor(connection?.id);
                } else {
                    vscode.window.showErrorMessage('Query editor not available');
                }
            })
        );

        // Execute query command
        this.context.subscriptions.push(
            vscode.commands.registerCommand('postgresql.executeQuery', async () => {
                if (this.components.queryEditorView) {
                    const connections = this.components.connectionManager.getConnections();
                    if (connections.length === 0) {
                        vscode.window.showErrorMessage('No database connections available. Please add a connection first.');
                        return;
                    }

                    let selectedConnection = connections[0];
                    if (connections.length > 1) {
                        const connectionItems: ConnectionItem[] = connections.map((conn: any) => ({
                            label: conn.name,
                            detail: `${conn.host}:${conn.port}/${conn.database}`,
                            connection: conn
                        }));

                        const selected = await vscode.window.showQuickPick(connectionItems, {
                            placeHolder: 'Select a database connection'
                        });

                        if (!selected) return;
                        selectedConnection = selected.connection;
                    }

                    await this.components.queryEditorView.showQueryEditor(selectedConnection.id);
                } else {
                    vscode.window.showErrorMessage('Query editor not available');
                }
            })
        );
    }
    private registerSQLFileCommands(): void {
        // Execute current file command
        this.context.subscriptions.push(
            vscode.commands.registerCommand('postgresql.executeCurrentFile', async () => {
                try {
                    await this.executeCurrentSQLFile();
                } catch (error) {
                    this.handleCommandError('postgresql.executeCurrentFile', error as Error);
                }
            })
        );

        // Format current file command
        this.context.subscriptions.push(
            vscode.commands.registerCommand('postgresql.formatCurrentFile', async () => {
                try {
                    await this.formatCurrentSQLFile();
                } catch (error) {
                    this.handleCommandError('postgresql.formatCurrentFile', error as Error);
                }
            })
        );
    }
    private async handleEditConnection(connection?: any): Promise<void> {
        if (!connection) {
            vscode.window.showErrorMessage('No connection provided for editing');
            return;
        }

        await this.extension.editConnection(connection);
    }
    private async handleTestConnection(connection?: any): Promise<void> {
        if (!connection) {
            vscode.window.showErrorMessage('No connection provided for testing');
            return;
        }

        await this.extension.testConnection(connection);
    }
    private async handleExecuteMigration(migration?: any): Promise<void> {
        if (!migration) {
            vscode.window.showErrorMessage('No migration provided for execution');
            return;
        }

        await this.extension.executeMigration(migration);
    }
    private async handleAddConnection(): Promise<void> {
        try {
            if (this.components.connectionManager) {
                // Use connection management view for adding connections
                const { ConnectionManagementView } = await import('../views/ConnectionManagementView');
                const connectionView = new ConnectionManagementView(this.components.connectionManager);
                await connectionView.showConnectionDialog();
            } else {
                vscode.window.showErrorMessage('Connection manager not available');
            }
        } catch (error) {
            Logger.error('Failed to add connection', error as Error);
            vscode.window.showErrorMessage(`Failed to add connection: ${(error as Error).message}`);
        }
    }
    private async handleRemoveConnection(connection?: any): Promise<void> {
        try {
            if (!connection) {
                vscode.window.showErrorMessage('No connection provided for removal');
                return;
            }

            if (this.components.connectionManager) {
                const confirm = await vscode.window.showWarningMessage(
                    `Are you sure you want to remove connection "${connection.name}"?`,
                    'Remove', 'Cancel'
                );

                if (confirm === 'Remove') {
                    // Actually remove the connection using the ConnectionManager
                    await this.components.connectionManager.removeConnection(connection.id);

                    // Refresh the tree view to update the UI
                    if (this.components.treeProvider) {
                        this.components.treeProvider.refresh();
                    }

                    Logger.info('Connection removed successfully', 'CommandManager', { connectionId: connection.id });
                    vscode.window.showInformationMessage(`Connection "${connection.name}" removed successfully`);
                }
            } else {
                vscode.window.showErrorMessage('Connection manager not available');
            }
        } catch (error) {
            Logger.error('Failed to remove connection', error as Error);
            vscode.window.showErrorMessage(`Failed to remove connection: ${(error as Error).message}`);
        }
    }
    private async handleRefreshExplorer(): Promise<void> {
        try {
            if (this.components.treeProvider) {
                this.components.treeProvider.refresh();
                vscode.window.showInformationMessage('Database explorer refreshed');
            } else {
                vscode.window.showErrorMessage('Tree provider not available');
            }
        } catch (error) {
            Logger.error('Failed to refresh explorer', error as Error);
            vscode.window.showErrorMessage(`Failed to refresh explorer: ${(error as Error).message}`);
        }
    }
    private async handleBrowseSchema(connectionId?: string, schemaName?: string): Promise<void> {
        try {
            if (!connectionId) {
                vscode.window.showErrorMessage('Connection ID is required to browse schema');
                return;
            }

            if (this.components.schemaBrowserView) {
                await this.components.schemaBrowserView.showSchemaBrowser(connectionId, schemaName);
            } else {
                vscode.window.showErrorMessage('Schema browser not available');
            }
        } catch (error) {
            Logger.error('Failed to browse schema', error as Error);
            vscode.window.showErrorMessage(`Failed to browse schema: ${(error as Error).message}`);
        }
    }
    private async handleCompareSchemas(source?: any, target?: any): Promise<void> {
        try {
            if (!source || !target) {
                vscode.window.showErrorMessage('Source and target connections are required for schema comparison');
                return;
            }

            if (this.components.schemaComparisonView) {
                // SchemaComparisonView methods need to be checked
                Logger.info('Schema comparison requested', 'CommandManager', { source: source.id, target: target.id });
                vscode.window.showInformationMessage('Schema comparison feature coming soon');
            } else {
                vscode.window.showErrorMessage('Schema comparison view not available');
            }
        } catch (error) {
            Logger.error('Failed to compare schemas', error as Error);
            vscode.window.showErrorMessage(`Failed to compare schemas: ${(error as Error).message}`);
        }
    }
    private async handleGenerateMigration(comparison?: any): Promise<void> {
        try {
            if (!comparison) {
                vscode.window.showErrorMessage('Schema comparison data is required for migration generation');
                return;
            }

            if (this.components.migrationPreviewView) {
                // MigrationPreviewView uses showPreview method
                Logger.info('Migration generation requested', 'CommandManager');
                vscode.window.showInformationMessage('Migration generation feature coming soon');
            } else {
                vscode.window.showErrorMessage('Migration preview view not available');
            }
        } catch (error) {
            Logger.error('Failed to generate migration', error as Error);
            vscode.window.showErrorMessage(`Failed to generate migration: ${(error as Error).message}`);
        }
    }
    private async handlePreviewMigration(migration?: any): Promise<void> {
        try {
            if (!migration) {
                vscode.window.showErrorMessage('Migration data is required for preview');
                return;
            }

            if (this.components.migrationPreviewView) {
                // MigrationPreviewView uses showPreview method
                Logger.info('Migration preview requested', 'CommandManager');
                vscode.window.showInformationMessage('Migration preview feature coming soon');
            } else {
                vscode.window.showErrorMessage('Migration preview view not available');
            }
        } catch (error) {
            Logger.error('Failed to preview migration', error as Error);
            vscode.window.showErrorMessage(`Failed to preview migration: ${(error as Error).message}`);
        }
    }
    private async handleViewObjectDetails(databaseObject?: any): Promise<void> {
        try {
            if (!databaseObject) {
                vscode.window.showErrorMessage('Database object is required for viewing details');
                return;
            }

            if (this.components.schemaBrowserView) {
                // SchemaBrowserView doesn't have showObjectDetails, show info message instead
                const objectInfo = `${databaseObject.type || 'Object'}: ${databaseObject.name}${databaseObject.schema ? ` (Schema: ${databaseObject.schema})` : ''}`;
                vscode.window.showInformationMessage(`Object Details: ${objectInfo}`);
                Logger.info('Object details requested', 'CommandManager', { object: databaseObject.name });
            } else {
                vscode.window.showErrorMessage('Schema browser not available');
            }
        } catch (error) {
            Logger.error('Failed to view object details', error as Error);
            vscode.window.showErrorMessage(`Failed to view object details: ${(error as Error).message}`);
        }
    }
    private handleCommandError(command: string, error: Error, context?: any[]): void {
        const commandError: CommandError = {
            command,
            error: error.message,
            timestamp: new Date(),
            context
        };

        this.commandErrors.push(commandError);

        Logger.error('Command execution failed', error, 'CommandManager', {
            command,
            context
        });

        // Show user-friendly error message
        vscode.window.showErrorMessage(`Command "${command}" failed: ${error.message}`);
    }
    getCommandStats(): {
        registeredCommands: number;
        totalErrors: number;
        recentErrors: CommandError[];
        errorRate: number;
        successRate: number;
    } {
        const totalExecutions = this.registeredCommands.size;
        const totalErrors = this.commandErrors.length;
        const errorRate = totalExecutions > 0 ? (totalErrors / totalExecutions) * 100 : 0;
        const successRate = 100 - errorRate;

        return {
            registeredCommands: this.registeredCommands.size,
            totalErrors: this.commandErrors.length,
            recentErrors: this.commandErrors.slice(-10), // Last 10 errors
            errorRate: Math.round(errorRate * 100) / 100,
            successRate: Math.round(successRate * 100) / 100
        };
    }
    showCommandStats(): void {
        const stats = this.getCommandStats();
        const recentErrorsText = stats.recentErrors.length > 0
            ? `\n\nRecent Errors:\n${stats.recentErrors.map((error, index) =>
                `${index + 1}. ${error.command}: ${error.error} (${error.timestamp.toLocaleTimeString()})`
            ).join('\n')}`
            : '\n\nNo recent errors';

        const statsMessage = `
PostgreSQL Extension - Command Statistics
=========================================

Registered Commands: ${stats.registeredCommands}
Total Errors: ${stats.totalErrors}
Success Rate: ${stats.successRate}%
Error Rate: ${stats.errorRate}%
${recentErrorsText}

Generated at: ${new Date().toLocaleString()}
        `.trim();

        Logger.info('Command Statistics Report', 'CommandManager', {
            registeredCommands: stats.registeredCommands,
            totalErrors: stats.totalErrors,
            successRate: stats.successRate,
            errorRate: stats.errorRate
        });

        // Show in output channel
        const channel = vscode.window.createOutputChannel('PostgreSQL Commands');
        channel.clear();
        channel.appendLine(statsMessage);
        channel.show();

        // Also show summary in info message
        vscode.window.showInformationMessage(
            `PostgreSQL Commands: ${stats.registeredCommands} registered, ${stats.successRate}% success rate`,
            'View Details'
        ).then(selection => {
            if (selection === 'View Details') {
                channel.show();
            }
        });
    }
    clearCommandErrors(): void {
        const clearedCount = this.commandErrors.length;
        this.commandErrors = [];

        Logger.info('Command error history cleared', 'CommandManager', { clearedCount });

        vscode.window.showInformationMessage(`Cleared ${clearedCount} command errors from history`);
    }
    private monitorCommandHealth(): void {
        const stats = this.getCommandStats();

        // Check for high error rates
        if (stats.errorRate > 50 && stats.totalErrors > 5) {
            Logger.warn('High command error rate detected', 'CommandManager', {
                errorRate: stats.errorRate,
                totalErrors: stats.totalErrors,
                registeredCommands: stats.registeredCommands
            });

            // Show warning to user
            vscode.window.showWarningMessage(
                `High command error rate detected (${stats.errorRate}%). Consider checking the logs.`,
                'View Logs', 'Clear Errors'
            ).then(selection => {
                if (selection === 'View Logs') {
                    this.showCommandStats();
                } else if (selection === 'Clear Errors') {
                    this.clearCommandErrors();
                }
            });
        }

        // Check for commands that have never been executed successfully
        const failedCommands = this.getFailedCommands();
        if (failedCommands.length > 0) {
            Logger.warn('Commands with execution issues detected', 'CommandManager', {
                failedCommands: failedCommands.length,
                commands: failedCommands
            });
        }
    }
    private getFailedCommands(): string[] {
        const commandErrorMap = new Map<string, number>();

        // Count errors per command
        this.commandErrors.forEach(error => {
            const count = commandErrorMap.get(error.command) || 0;
            commandErrorMap.set(error.command, count + 1);
        });

        // Return commands with multiple errors
        return Array.from(commandErrorMap.entries())
            .filter(([_, count]) => count > 2)
            .map(([command, _]) => command);
    }
    private async executeCurrentSQLFile(): Promise<void> {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showErrorMessage('No active SQL file to execute');
            return;
        }

        const document = activeEditor.document;
        if (document.languageId !== 'sql' && document.languageId !== 'postgresql') {
            vscode.window.showErrorMessage('Current file is not a SQL file');
            return;
        }

        const sqlContent = document.getText().trim();
        if (!sqlContent) {
            vscode.window.showErrorMessage('SQL file is empty');
            return;
        }

        const connections = this.components.connectionManager.getConnections();
        if (connections.length === 0) {
            vscode.window.showErrorMessage('No database connections available. Please add a connection first.');
            return;
        }

        let targetConnection = connections[0];
        const detectedConnectionId = vscode.workspace.getConfiguration().get<string>('postgresql.detectedConnection');

        if (detectedConnectionId) {
            const detectedConnection = connections.find(c => c.id === detectedConnectionId);
            if (detectedConnection) {
                targetConnection = detectedConnection;
            }
        } else if (connections.length > 1) {
            const connectionItems: ConnectionItem[] = connections.map((conn: any) => ({
                label: conn.name,
                detail: `${conn.host}:${conn.port}/${conn.database}`,
                connection: conn
            }));

            const selected = await vscode.window.showQuickPick(connectionItems, {
                placeHolder: 'Select a database connection'
            });

            if (!selected) return;
            targetConnection = selected.connection;
        }

        // Import and use SQL execution logic
        const { executeSQLContent } = await import('./SQLExecutionManager');
        await executeSQLContent(sqlContent, targetConnection.id, this.components);
    }
    private async formatCurrentSQLFile(): Promise<void> {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showErrorMessage('No active SQL file to format');
            return;
        }

        const document = activeEditor.document;
        if (document.languageId !== 'sql' && document.languageId !== 'postgresql') {
            vscode.window.showErrorMessage('Current file is not a SQL file');
            return;
        }

        try {
            const sqlContent = document.getText();
            const { formatSQL } = await import('./SQLExecutionManager');
            const formattedSQL = await formatSQL(sqlContent);

            const edit = new vscode.WorkspaceEdit();
            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(sqlContent.length)
            );
            edit.replace(document.uri, fullRange, formattedSQL);

            await vscode.workspace.applyEdit(edit);
            vscode.window.showInformationMessage('SQL file formatted successfully');

        } catch (error) {
            Logger.error('Failed to format SQL file', error as Error);
            vscode.window.showErrorMessage(`Failed to format SQL: ${(error as Error).message}`);
        }
    }
    dispose(): void {
        Logger.info('Disposing CommandManager', 'CommandManager');
        this.stopCommandMonitoring();
        this.commandErrors = [];
        this.registeredCommands.clear();
        Logger.info('CommandManager disposed successfully', 'CommandManager');
    }
}