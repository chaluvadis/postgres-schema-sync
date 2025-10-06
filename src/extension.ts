import * as vscode from 'vscode';
import { PostgreSqlExtension } from './PostgreSqlExtension';
import { ExtensionInitializer, ExtensionComponents } from './utils/ExtensionInitializer';
import { Logger } from './utils/Logger';
import { ErrorHandler } from './utils/ErrorHandler';
import { DotNetIntegrationService } from './services/DotNetIntegrationService';
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
        components = ExtensionInitializer.initializeOptionalComponents(context, coreComponents);

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

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.compareSelectedSchemas', async () => {
            // Compare schemas from tree selection
            // Note: This would require getting selected items from the tree view
            // For now, show information message
            vscode.window.showInformationMessage('Select 2 schemas in the tree view and use the context menu to compare them');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.runQuickMigration', async () => {
            // Quick migration execution
            const confirm = await vscode.window.showQuickPick(['Yes', 'No'], {
                placeHolder: 'Run migration in dry-run mode?'
            });

            if (confirm === 'Yes') {
                vscode.commands.executeCommand('postgresql.executeMigration');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.manageConnections', async () => {
            // Show connection management options
            const action = await vscode.window.showQuickPick([
                'Add Connection',
                'View Connections',
                'Test All Connections',
                'Export Connections',
                'Import Connections'
            ], {
                placeHolder: 'Select connection management action'
            });

            switch (action) {
                case 'Add Connection':
                    vscode.commands.executeCommand('postgresql.addConnection');
                    break;
                case 'View Connections':
                    vscode.window.showInformationMessage('Connection management UI not yet implemented');
                    break;
                case 'Test All Connections':
                    vscode.window.showInformationMessage('Test all connections feature not yet implemented');
                    break;
                case 'Export Connections':
                    vscode.window.showInformationMessage('Export connections feature not yet implemented');
                    break;
                case 'Import Connections':
                    vscode.window.showInformationMessage('Import connections feature not yet implemented');
                    break;
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.showPerformanceReport', () => {
            // Performance monitoring integrated into dashboard
            vscode.window.showInformationMessage('Performance monitoring is available in the Dashboard view');
        })
    );


    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.compareObjects', (comparisonData) => {
            if (components.interactiveComparisonView) {
                components.interactiveComparisonView.showComparison(comparisonData);
            } else {
                vscode.window.showErrorMessage('Interactive comparison view not available');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.previewAdvancedMigration', (migrationData) => {
            if (components.advancedMigrationPreviewView) {
                components.advancedMigrationPreviewView.showAdvancedMigrationPreview(migrationData);
            } else {
                vscode.window.showErrorMessage('Advanced migration preview not available');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.refreshEnhancedTree', () => {
            if (components.enhancedTreeProvider) {
                components.enhancedTreeProvider.refresh();
            } else {
                vscode.window.showErrorMessage('Enhanced tree provider not available');
            }
        })
    );


    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.searchTree', (query) => {
            if (components.enhancedTreeProvider) {
                components.enhancedTreeProvider.setSearchFilter(query);
            } else {
                vscode.window.showErrorMessage('Enhanced tree provider not available');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.startOperation', (operationName, options) => {
            if (components.enhancedStatusBarProvider) {
                components.enhancedStatusBarProvider.startOperation(operationName, options);
            } else {
                vscode.window.showErrorMessage('Enhanced status bar not available');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.updateOperation', (operationId, status, options) => {
            if (components.enhancedStatusBarProvider) {
                components.enhancedStatusBarProvider.updateOperation(operationId, status, options);
            } else {
                vscode.window.showErrorMessage('Enhanced status bar not available');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.completeOperation', (operationId) => {
            if (components.enhancedStatusBarProvider) {
                components.enhancedStatusBarProvider.completeOperation(operationId);
            } else {
                vscode.window.showErrorMessage('Enhanced status bar not available');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.showNotification', (title, message, type, options) => {
            if (components.notificationManager) {
                switch (type) {
                    case 'error':
                        components.notificationManager.showError(title, message, options?.source, options);
                        break;
                    case 'warning':
                        components.notificationManager.showWarning(title, message, options?.source, options);
                        break;
                    case 'success':
                        components.notificationManager.showSuccess(title, message, options?.source, options);
                        break;
                    default:
                        components.notificationManager.showInformation(title, message, options?.source, options);
                        break;
                }
            } else {
                vscode.window.showErrorMessage('Notification manager not available');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.exportNotifications', () => {
            if (components.notificationManager) {
                components.notificationManager.exportNotifications();
            } else {
                vscode.window.showErrorMessage('Notification manager not available');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.refreshConnection', (connection) => {
            if (components.treeProvider) {
                components.treeProvider.refresh();
            }
            if (components.enhancedTreeProvider) {
                components.enhancedTreeProvider.refresh();
            }
            if (components.treeView) {
                // Refresh the tree view to show updated state
                components.treeView.title = `PostgreSQL Explorer (${new Date().toLocaleTimeString()})`;
            }
        })
    );

    // Tree view specific commands
    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.expandTree', () => {
            if (components.treeView) {
                vscode.commands.executeCommand('workbench.actions.treeView.postgresqlExplorer.expand');
            } else {
                vscode.window.showErrorMessage('PostgreSQL tree view not available');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.collapseTree', () => {
            if (components.treeView) {
                vscode.commands.executeCommand('workbench.actions.treeView.postgresqlExplorer.collapse');
            } else {
                vscode.window.showErrorMessage('PostgreSQL tree view not available');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.focusTree', () => {
            if (components.treeView) {
                vscode.commands.executeCommand('postgresqlExplorer.focus');
            } else {
                vscode.window.showErrorMessage('PostgreSQL tree view not available');
            }
        })
    );
}

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

        context.subscriptions.push(
            components.treeView.onDidChangeSelection((selection) => {
                Logger.debug('PostgreSQL tree view selection changed', 'registerEventHandlers', {
                    selectionCount: selection.selection.length
                });
                // Optional: Handle tree view selection changes
            })
        );
    }
}