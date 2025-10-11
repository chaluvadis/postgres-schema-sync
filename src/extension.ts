import * as vscode from 'vscode';
import { PostgreSqlExtension } from './PostgreSqlExtension';
import { ExtensionInitializer, ExtensionComponents } from '@/utils/ExtensionInitializer';
import { Logger } from '@/utils/Logger';
import { ErrorHandler } from '@/utils/ErrorHandler';
import { DotNetIntegrationService } from '@/services/DotNetIntegrationService';
import { TreeItem } from '@/providers/PostgreSqlTreeProvider';
export enum ErrorSeverity {
    LOW = 'LOW',
    MEDIUM = 'MEDIUM',
    HIGH = 'HIGH',
    CRITICAL = 'CRITICAL'
}


let extension: PostgreSqlExtension | undefined;
let components: ExtensionComponents | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const activationContext = ErrorHandler.createEnhancedContext(
        'ExtensionActivation',
        {
            vscodeVersion: vscode.version,
            nodeVersion: process.version,
            platform: process.platform
        }
    );

    try {
        Logger.info('Activating PostgreSQL Schema Compare & Sync extension');

        const isDotNetAvailable = await ExtensionInitializer.initializeDotNetService();

        if (!isDotNetAvailable) {
            vscode.window.showWarningMessage(
                'PostgreSQL Schema Compare & Sync: .NET library not found. Some features may be limited.',
                'View Setup Guide', 'Retry'
            ).then(selection => {
                if (selection === 'View Setup Guide') {
                    vscode.commands.executeCommand('postgresql.showHelp');
                } else if (selection === 'Retry') {
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
            });
        }

        // Initialize core components
        const coreComponents = ExtensionInitializer.initializeCoreComponents(context);

        // Initialize optional UI components
        components = ExtensionInitializer.initializeOptionalComponents(coreComponents, context);

        // Register tree view
        const treeView = ExtensionInitializer.registerTreeView(components.treeProvider, context);

        // Store tree view in components for later access
        components.treeView = treeView;

        // Initialize main extension
        extension = ExtensionInitializer.initializeComponent(
            'PostgreSqlExtension',
            () => new PostgreSqlExtension(
                context,
                components!.connectionManager,
                components!.schemaManager,
                components!.migrationManager,
                components!.treeProvider
            ),
            true
        ) as PostgreSqlExtension;

        // Register commands and event handlers
        registerCommands(context, extension, components!);
        registerEventHandlers(context, components!.treeProvider, components);

        Logger.info('PostgreSQL Schema Compare & Sync extension activated successfully');

        vscode.window.showInformationMessage(
            'PostgreSQL Schema Compare & Sync extension activated successfully!',
            'View Getting Started', 'Open Settings'
        ).then(selection => {
            if (selection === 'View Getting Started') {
                vscode.commands.executeCommand('postgresql.showHelp');
            } else if (selection === 'Open Settings') {
                vscode.commands.executeCommand('postgresql.openSettings');
            }
        });

    } catch (error) {
        Logger.error('Failed to activate PostgreSQL Schema Compare & Sync extension', error as Error);

        const errorMessage = error instanceof Error ? error.message : String(error);
        const severity = (errorMessage.toLowerCase().includes('critical') ||
            errorMessage.toLowerCase().includes('fatal') ||
            activationContext.operation.includes('Extension'))
            ? ErrorSeverity.CRITICAL
            : ErrorSeverity.HIGH;

        ErrorHandler.handleErrorWithSeverity(error, activationContext, severity);

        vscode.window.showErrorMessage(
            'PostgreSQL Schema Compare & Sync extension failed to activate. Please check the logs for details.',
            'View Logs', 'Reload Window', 'Get Help'
        ).then(selection => {
            if (selection === 'View Logs') {
                Logger.showOutputChannel();
            } else if (selection === 'Reload Window') {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            } else if (selection === 'Get Help') {
                vscode.commands.executeCommand('postgresql.showHelp');
            }
        });

        throw error;
    }
}

export function deactivate(): Thenable<void> | undefined {
    const deactivationContext = ErrorHandler.createEnhancedContext(
        'ExtensionDeactivation',
        {
            timestamp: new Date().toISOString(),
            graceful: true
        }
    );

    try {
        Logger.info('Deactivating PostgreSQL Schema Compare & Sync extension');

        const promises: Thenable<void>[] = [];

        try {
            const dotNetService = DotNetIntegrationService.getInstance();
            try {
                dotNetService.dispose();
                promises.push(Promise.resolve());
            } catch (error) {
                Logger.warn('Error disposing .NET service, continuing with other disposals', 'deactivate', error as Error);
                ErrorHandler.handleError(error, ErrorHandler.createContext('DotNetServiceDisposal'));
                promises.push(Promise.resolve()); // Don't fail deactivation for .NET disposal errors
            }
        } catch (error) {
            Logger.warn('Failed to get .NET service instance during deactivation', 'deactivate', error as Error);
        }

        if (extension) {
            try {
                extension!.dispose();
                promises.push(Promise.resolve());
            } catch (error) {
                Logger.error('Error disposing main extension', error as Error);
                ErrorHandler.handleError(error, ErrorHandler.createContext('PostgreSqlExtensionDisposal'));
                promises.push(Promise.resolve()); // Don't fail deactivation for extension disposal errors
            }
        }

        try {
            Logger.dispose();
            promises.push(Promise.resolve());
        } catch (error) {
            Logger.error('Error disposing logger', error as Error);
            ErrorHandler.handleError(error, ErrorHandler.createContext('LoggerDisposal'));
            promises.push(Promise.resolve()); // Don't fail deactivation for logger disposal errors
        }

        return Promise.race([
            Promise.all(promises).then(() => {
                Logger.info('PostgreSQL Schema Compare & Sync extension deactivated successfully');
                return undefined;
            }),
            new Promise<undefined>((_, reject) => {
                setTimeout(() => {
                    Logger.warn('Extension deactivation timed out, forcing completion');
                    reject(new Error('Deactivation timeout'));
                }, 10000); // 10 second timeout
            })
        ]).catch(error => {
            Logger.error('Error during extension deactivation', error as Error);

            ErrorHandler.handleError(error, deactivationContext);

            return undefined;
        });

    } catch (error) {
        Logger.error('Critical error during extension deactivation', error as Error);

        // Handle critical deactivation errors
        ErrorHandler.handleErrorWithSeverity(
            error,
            deactivationContext,
            ErrorSeverity.HIGH
        );

        // Return gracefully even on critical errors to avoid VS Code issues
        return undefined;
    }
}

function registerCommands(
    context: vscode.ExtensionContext,
    extension: PostgreSqlExtension,
    components: ExtensionComponents
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'postgresql.addConnection',
            () => extension.addConnection()
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'postgresql.editConnection',
            (connection) => extension.editConnection(connection)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'postgresql.removeConnection',
            (connection) => extension.removeConnection(connection)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'postgresql.testConnection',
            (connection) => extension.testConnection(connection)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'postgresql.refreshExplorer',
            () => extension.refreshExplorer()
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'postgresql.browseSchema',
            (connectionId, schemaName) => extension.browseSchema(connectionId, schemaName)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'postgresql.compareSchemas',
            (source, target) => extension.compareSchemas(source, target)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'postgresql.generateMigration',
            (comparison) => extension.generateMigration(comparison)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'postgresql.executeMigration',
            (migration) => extension.executeMigration(migration)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'postgresql.previewMigration',
            (migration) => extension.previewMigration(migration)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'postgresql.rollbackMigration',
            (migration) => extension.rollbackMigration(migration)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'postgresql.viewObjectDetails',
            (databaseObject) => extension.viewObjectDetails(databaseObject)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'postgresql.showHelp',
            () => extension.showHelp()
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'postgresql.showLogs',
            () => extension.showLogs()
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'postgresql.openSettings',
            () => extension.openSettings()
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.showDashboard', () => {
            if (components.dashboardView) {
                components.dashboardView.showDashboard();
            } else {
                vscode.window.showErrorMessage('Dashboard view not available');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.showNotifications', () => {
            if (components.notificationManager) {
                components.notificationManager.showNotificationCenter();
            } else {
                vscode.window.showErrorMessage('Notification manager not available');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.showActiveOperations', () => {
            if (components.enhancedStatusBarProvider) {
                components.enhancedStatusBarProvider.showOperationDetails();
            } else {
                vscode.window.showErrorMessage('Enhanced status bar not available');
            }
        })
    );

    // Enhanced keyboard shortcuts for better productivity
    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.quickConnect', async () => {
            // Quick connection dialog
            const connectionName = await vscode.window.showInputBox({
                prompt: 'Enter connection name',
                placeHolder: 'My Database Connection'
            });

            if (connectionName) {
                vscode.commands.executeCommand('postgresql.addConnection');
            }
        })
    );

    // Core functionality commands only - removed placeholder commands



    // Core functionality only - removed placeholder enhanced features

    // Query Editor Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.openQueryEditor', async (connection) => {
            if (components.queryEditorView) {
                await components.queryEditorView.showQueryEditor(connection?.id);
            } else {
                vscode.window.showErrorMessage('Query editor not available');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.executeQuery', async () => {
            if (components.queryEditorView) {
                // Show connection quick pick if no active connection
                const connections = components.connectionManager.getConnections();
                if (connections.length === 0) {
                    vscode.window.showErrorMessage('No database connections available. Please add a connection first.');
                    return;
                }

                let selectedConnection = connections[0]; // Default to first connection
                if (connections.length > 1) {
                    const connectionItems = connections.map((conn: any) => ({
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

                await components.queryEditorView.showQueryEditor(selectedConnection.id);
            } else {
                vscode.window.showErrorMessage('Query editor not available');
            }
        })
    );

    // Query editor commands integrated into QueryEditorView

    // Core functionality only - removed placeholder collaboration commands

    // Core functionality only - removed placeholder data management and collaboration commands

    // Tree view commands integrated into tree provider
}

// Tree view handling functions removed - functionality integrated into tree provider

function registerEventHandlers(context: vscode.ExtensionContext, treeProvider: any, components?: ExtensionComponents): void {
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(() => {
            // Optional: Refresh tree when switching to SQL files
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor && (activeEditor.document.languageId === 'sql' || activeEditor.document.languageId === 'postgresql')) {
                // Could refresh tree view when opening SQL files
            }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('postgresql-schema-sync')) {
                Logger.info('Configuration changed, refreshing extension state');
                treeProvider.refresh();

                // Update tree view title to reflect changes
                if (components?.treeView) {
                    components.treeView.title = `PostgreSQL Explorer (Updated: ${new Date().toLocaleTimeString()})`;
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            Logger.info('Workspace folders changed, refreshing connections');
            treeProvider.refresh();
        })
    );

    // Tree view specific event handlers
    if (components?.treeView) {
        context.subscriptions.push(
            components.treeView.onDidChangeVisibility((visible) => {
                if (visible) {
                    Logger.debug('PostgreSQL tree view became visible');
                    // Optional: Refresh data when tree view becomes visible
                    treeProvider.refresh();
                }
            })
        );

        // Tree view selection handling integrated into tree provider
    }
}