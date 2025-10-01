import * as vscode from 'vscode';
import { PostgreSqlExtension } from './PostgreSqlExtension';
import { PostgreSqlTreeProvider } from './providers/PostgreSqlTreeProvider';
import { StatusBarProvider } from './providers/StatusBarProvider';
import { ActivityBarProvider } from './providers/ActivityBarProvider';
import { ConnectionManager } from './managers/ConnectionManager';
import { SchemaManager } from './managers/SchemaManager';
import { MigrationManager } from './managers/MigrationManager';
import { DotNetIntegrationService } from './services/DotNetIntegrationService';
import { Logger } from './utils/Logger';

let extension: PostgreSqlExtension | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    try {
        Logger.info('Activating PostgreSQL Schema Compare & Sync extension');

        // Initialize .NET integration service first
        const dotNetService = DotNetIntegrationService.getInstance();
        const isDotNetAvailable = await dotNetService.initialize();

        if (isDotNetAvailable) {
            Logger.info('.NET library integration enabled');
        } else {
            Logger.warn('.NET library not available, running in compatibility mode');
            vscode.window.showWarningMessage(
                'PostgreSQL Schema Compare & Sync: .NET library not found. Some features may be limited.'
            );
        }

        // Initialize core services
        const connectionManager = new ConnectionManager(context);
        const schemaManager = new SchemaManager(connectionManager);
        const migrationManager = new MigrationManager(connectionManager, schemaManager);

        // Create tree data provider for the explorer view
        const treeProvider = new PostgreSqlTreeProvider(connectionManager, schemaManager);

        // Create status bar provider
        const statusBarProvider = new StatusBarProvider(connectionManager);

        // Create activity bar provider
        const activityBarProvider = new ActivityBarProvider(connectionManager);

        // Register the tree view
        const treeView = vscode.window.createTreeView('postgresqlExplorer', {
            treeDataProvider: treeProvider,
            showCollapseAll: true,
            canSelectMany: false
        });
        context.subscriptions.push(treeView);

        // Initialize the main extension
        extension = new PostgreSqlExtension(
            context,
            connectionManager,
            schemaManager,
            migrationManager,
            treeProvider
        );

        // Register all commands
        registerCommands(context, extension);

        // Register event handlers
        registerEventHandlers(context, treeProvider);

        Logger.info('PostgreSQL Schema Compare & Sync extension activated successfully');
    } catch (error) {
        Logger.error('Failed to activate PostgreSQL Schema Compare & Sync extension', error as Error);
        vscode.window.showErrorMessage(
            `Failed to activate PostgreSQL Schema Compare & Sync extension: ${(error as Error).message}`
        );
    }
}

export function deactivate(): Thenable<void> | undefined {
    const promises: Thenable<void>[] = [];

    // Dispose .NET service
    const dotNetService = DotNetIntegrationService.getInstance();
    promises.push(dotNetService.dispose());

    // Dispose extension
    if (extension) {
        promises.push(extension.dispose());
    }

    // Dispose logger
    promises.push(new Promise<void>((resolve) => {
        Logger.dispose();
        resolve();
    }));

    return Promise.all(promises).then(() => undefined);
}

function registerCommands(context: vscode.ExtensionContext, extension: PostgreSqlExtension): void {
    // Connection management commands
    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.addConnection', () =>
            extension.addConnection()
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.editConnection', (connection) =>
            extension.editConnection(connection)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.removeConnection', (connection) =>
            extension.removeConnection(connection)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.testConnection', (connection) =>
            extension.testConnection(connection)
        )
    );

    // Explorer commands
    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.refreshExplorer', () =>
            extension.refreshExplorer()
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.browseSchema', (connectionId, schemaName) =>
            extension.browseSchema(connectionId, schemaName)
        )
    );

    // Schema comparison commands
    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.compareSchemas', (source, target) =>
            extension.compareSchemas(source, target)
        )
    );

    // Migration commands
    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.generateMigration', (comparison) =>
            extension.generateMigration(comparison)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.executeMigration', (migration) =>
            extension.executeMigration(migration)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.previewMigration', (migration) =>
            extension.previewMigration(migration)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.rollbackMigration', (migration) =>
            extension.rollbackMigration(migration)
        )
    );

    // Object details command
    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.viewObjectDetails', (databaseObject) =>
            extension.viewObjectDetails(databaseObject)
        )
    );

    // Utility commands
    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.showHelp', () =>
            extension.showHelp()
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.showLogs', () =>
            extension.showLogs()
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.openSettings', () =>
            extension.openSettings()
        )
    );
}

function registerEventHandlers(context: vscode.ExtensionContext, treeProvider: PostgreSqlTreeProvider): void {
    // Handle tree selection changes
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(() => {
            // Update tree view based on active editor context
        })
    );

    // Handle configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('postgresql-schema-sync')) {
                Logger.info('Configuration changed, refreshing extension state');
                treeProvider.refresh();
            }
        })
    );

    // Handle workspace folder changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            Logger.info('Workspace folders changed, refreshing connections');
            treeProvider.refresh();
        })
    );
}