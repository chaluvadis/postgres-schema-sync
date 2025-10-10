import * as vscode from 'vscode';
import { PostgreSqlExtension } from './PostgreSqlExtension';
import { ExtensionInitializer, ExtensionComponents } from '@/utils/ExtensionInitializer';
import { Logger } from '@/utils/Logger';
import { ErrorHandler } from '@/utils/ErrorHandler';
import { DotNetIntegrationService } from '@/services/DotNetIntegrationService';
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
        vscode.commands.registerCommand('postgresql.refreshConnection', (_connection) => {
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

    // New query-related commands
    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.newQuery', async () => {
            if (components.queryEditorView) {
                await components.queryEditorView.showQueryEditor();
            } else {
                vscode.window.showErrorMessage('Query editor not available');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.showQueryHistory', async () => {
            if (components.queryEditorView) {
                const history = components.queryEditorView.getQueryHistory();
                if (history.length === 0) {
                    vscode.window.showInformationMessage('No query history available');
                    return;
                }

                const selected = await vscode.window.showQuickPick(
                    history.map((query, index) => ({
                        label: `Query ${index + 1}`,
                        detail: query.length > 50 ? query.substring(0, 50) + '...' : query,
                        query: query
                    })),
                    { placeHolder: 'Select a query from history' }
                );

                if (selected) {
                    await components.queryEditorView.showQueryEditor();
                    // The query would be set in the editor via webview message
                    vscode.window.showInformationMessage('Query loaded from history');
                }
            } else {
                vscode.window.showErrorMessage('Query editor not available');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.showQueryFavorites', async () => {
            if (components.queryEditorView) {
                const favorites = components.queryEditorView.getFavorites();
                if (favorites.length === 0) {
                    vscode.window.showInformationMessage('No favorite queries available');
                    return;
                }

                const selected = await vscode.window.showQuickPick(
                    favorites.map((query, index) => ({
                        label: `Favorite ${index + 1}`,
                        detail: query.length > 50 ? query.substring(0, 50) + '...' : query,
                        query: query
                    })),
                    { placeHolder: 'Select a favorite query' }
                );

                if (selected) {
                    await components.queryEditorView.showQueryEditor();
                    vscode.window.showInformationMessage('Favorite query loaded');
                }
            } else {
                vscode.window.showErrorMessage('Query editor not available');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.formatQuery', async () => {
            if (components.queryEditorView) {
                // This would need to be implemented to format the current query in the active editor
                vscode.window.showInformationMessage('Format query command not yet implemented');
            } else {
                vscode.window.showErrorMessage('Query editor not available');
            }
        })
    );

    // Team Collaboration Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.showTeamLibrary', async () => {
            if (components.teamQueryLibraryView) {
                await components.teamQueryLibraryView.showLibrary();
            } else {
                vscode.window.showErrorMessage('Team query library not available');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.showQueryAnalytics', async (connection) => {
            if (components.queryAnalyticsView) {
                await components.queryAnalyticsView.showAnalytics(connection?.id);
            } else {
                vscode.window.showErrorMessage('Query analytics not available');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.showPerformanceAlerts', async () => {
            if (components.performanceAlertSystem) {
                // Show performance alerts view
                vscode.window.showInformationMessage('Performance alerts view not yet implemented');
            } else {
                vscode.window.showErrorMessage('Performance alert system not available');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.resolveAlert', async (alertId) => {
            if (components.performanceAlertSystem) {
                components.performanceAlertSystem.resolveAlert(alertId);
                vscode.window.showInformationMessage('Alert resolved');
            } else {
                vscode.window.showErrorMessage('Performance alert system not available');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.showSchemaDocumentation', async (databaseObject) => {
            if (components.schemaDocumentationService) {
                // Show documentation for the selected object
                vscode.window.showInformationMessage('Schema documentation view not yet implemented');
            } else {
                vscode.window.showErrorMessage('Schema documentation not available');
            }
        })
    );

    // Enhanced Dashboard Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.showEnhancedDashboard', async () => {
            if (components.dashboardView) {
                components.dashboardView.showDashboard();
            } else {
                vscode.window.showErrorMessage('Enhanced dashboard not available');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.showCollaborationStats', async () => {
            if (components.teamCollaborationService) {
                const stats = components.teamCollaborationService.getCollaborationStats();
                const panel = vscode.window.createWebviewPanel(
                    'collaborationStats',
                    'Collaboration Statistics',
                    vscode.ViewColumn.One,
                    { enableScripts: true }
                );

                panel.webview.html = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Collaboration Statistics</title>
                        <style>
                            body { font-family: var(--vscode-font-family); padding: 20px; }
                            .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
                            .stat-card { background: var(--vscode-textBlockQuote-background); padding: 20px; border-radius: 8px; text-align: center; }
                            .stat-value { font-size: 2em; font-weight: bold; color: var(--vscode-textLink-foreground); }
                            .stat-label { color: var(--vscode-descriptionForeground); margin-top: 8px; }
                        </style>
                    </head>
                    <body>
                        <h1>Collaboration Statistics</h1>
                        <div class="stat-grid">
                            <div class="stat-card">
                                <div class="stat-value">${stats.totalSnippets}</div>
                                <div class="stat-label">Total Snippets</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value">${stats.totalLibraries}</div>
                                <div class="stat-label">Libraries</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value">${stats.totalComments}</div>
                                <div class="stat-label">Comments</div>
                            </div>
                        </div>
                        <h2>Popular Categories</h2>
                        <ul>
                            ${stats.popularCategories.map(cat => `<li>${cat.category}: ${cat.count}</li>`).join('')}
                        </ul>
                        <h2>Top Authors</h2>
                        <ul>
                            ${stats.topAuthors.map(author => `<li>${author.author}: ${author.count}</li>`).join('')}
                        </ul>
                    </body>
                    </html>
                `;
            } else {
                vscode.window.showErrorMessage('Team collaboration service not available');
            }
        })
    );

    // Data Management Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.exportData', async () => {
            if (components.dataExportService) {
                vscode.window.showInformationMessage('Data export interface not yet implemented');
            } else {
                vscode.window.showErrorMessage('Data export service not available');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.importData', async () => {
            if (components.dataImportService) {
                vscode.window.showInformationMessage('Data import interface not yet implemented');
            } else {
                vscode.window.showErrorMessage('Data import service not available');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.createBackup', async () => {
            if (components.backupService) {
                vscode.window.showInformationMessage('Backup interface not yet implemented');
            } else {
                vscode.window.showErrorMessage('Backup service not available');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.showBackups', async () => {
            if (components.backupService) {
                const stats = components.backupService.getBackupStatistics();
                const panel = vscode.window.createWebviewPanel(
                    'backupStats',
                    'Backup Statistics',
                    vscode.ViewColumn.One,
                    { enableScripts: true }
                );

                panel.webview.html = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Backup Statistics</title>
                        <style>
                            body { font-family: var(--vscode-font-family); padding: 20px; }
                            .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
                            .stat-card { background: var(--vscode-textBlockQuote-background); padding: 20px; border-radius: 8px; text-align: center; }
                            .stat-value { font-size: 2em; font-weight: bold; color: var(--vscode-textLink-foreground); }
                            .stat-label { color: var(--vscode-descriptionForeground); margin-top: 8px; }
                        </style>
                    </head>
                    <body>
                        <h1>Backup Statistics</h1>
                        <div class="stat-grid">
                            <div class="stat-card">
                                <div class="stat-value">${stats.totalBackups}</div>
                                <div class="stat-label">Total Backups</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value">${stats.completedBackups}</div>
                                <div class="stat-label">Completed</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value">${stats.failedBackups}</div>
                                <div class="stat-label">Failed</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value">${stats.totalSizeBackedUp}</div>
                                <div class="stat-label">Total Size</div>
                            </div>
                        </div>
                        <h2>Popular Backup Types</h2>
                        <ul>
                            ${stats.popularTypes.map(type => `<li>${type.type}: ${type.count}</li>`).join('')}
                        </ul>
                        <p><strong>Verification Rate:</strong> ${stats.verificationRate.toFixed(1)}%</p>
                    </body>
                    </html>
                `;
            } else {
                vscode.window.showErrorMessage('Backup service not available');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.showScheduledBackups', async () => {
            if (components.backupScheduler) {
                const stats = components.backupScheduler.getSchedulerStatistics();
                const panel = vscode.window.createWebviewPanel(
                    'schedulerStats',
                    'Scheduled Backups',
                    vscode.ViewColumn.One,
                    { enableScripts: true }
                );

                panel.webview.html = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Scheduled Backups</title>
                        <style>
                            body { font-family: var(--vscode-font-family); padding: 20px; }
                            .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
                            .stat-card { background: var(--vscode-textBlockQuote-background); padding: 20px; border-radius: 8px; text-align: center; }
                            .stat-value { font-size: 2em; font-weight: bold; color: var(--vscode-textLink-foreground); }
                            .stat-label { color: var(--vscode-descriptionForeground); margin-top: 8px; }
                        </style>
                    </head>
                    <body>
                        <h1>Scheduled Backup Statistics</h1>
                        <div class="stat-grid">
                            <div class="stat-card">
                                <div class="stat-value">${stats.totalScheduledBackups}</div>
                                <div class="stat-label">Total Scheduled</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value">${stats.enabledBackups}</div>
                                <div class="stat-label">Enabled</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value">${stats.totalExecutions}</div>
                                <div class="stat-label">Total Executions</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value">${stats.successfulExecutions}</div>
                                <div class="stat-label">Successful</div>
                            </div>
                        </div>
                        <h2>Schedules by Frequency</h2>
                        <ul>
                            ${Object.entries(stats.schedulesByFrequency).map(([freq, count]) => `<li>${freq}: ${count}</li>`).join('')}
                        </ul>
                        <p><strong>Average Execution Time:</strong> ${stats.averageExecutionTime.toFixed(0)}ms</p>
                    </body>
                    </html>
                `;
            } else {
                vscode.window.showErrorMessage('Backup scheduler not available');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.validateData', async () => {
            if (components.dataValidationService) {
                vscode.window.showInformationMessage('Data validation interface not yet implemented');
            } else {
                vscode.window.showErrorMessage('Data validation service not available');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.showDataQuality', async (tableInfo) => {
            if (components.dataValidationService) {
                vscode.window.showInformationMessage('Data quality analysis not yet implemented');
            } else {
                vscode.window.showErrorMessage('Data validation service not available');
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