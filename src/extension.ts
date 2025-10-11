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
            platform: process.platform,
            arch: process.arch
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

        if (components) {
            try {
                ExtensionInitializer.disposeImportManagementView(components);
                promises.push(Promise.resolve());
            } catch (error) {
                Logger.warn('Error disposing import management view', 'deactivate', error as Error);
                ErrorHandler.handleError(error, ErrorHandler.createContext('ImportManagementViewDisposal'));
                promises.push(Promise.resolve()); // Don't fail deactivation for view disposal errors
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

    // SQL File Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.executeCurrentFile', async () => {
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

            // Get connections
            const connections = components.connectionManager.getConnections();
            if (connections.length === 0) {
                vscode.window.showErrorMessage('No database connections available. Please add a connection first.');
                return;
            }

            // Try to use detected connection, otherwise prompt user
            let targetConnection = connections[0];
            const detectedConnectionId = vscode.workspace.getConfiguration().get<string>('postgresql.detectedConnection');

            if (detectedConnectionId) {
                const detectedConnection = connections.find(c => c.id === detectedConnectionId);
                if (detectedConnection) {
                    targetConnection = detectedConnection;
                }
            } else if (connections.length > 1) {
                const connectionItems = connections.map((conn: any) => ({
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

            // Execute SQL content
            await executeSQLContent(sqlContent, targetConnection.id);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('postgresql.formatCurrentFile', async () => {
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
                const formattedSQL = await formatSQL(sqlContent);

                // Replace document content
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
        })
    );
}

// Real-time monitoring state
interface RealtimeState {
    fileWatchers: Map<string, vscode.FileSystemWatcher>;
    connectionMonitors: Map<string, NodeJS.Timeout>;
    statusBarItem: vscode.StatusBarItem | null;
    schemaMonitors: Map<string, NodeJS.Timeout>;
    activeSQLFile: string | null;
    lastSchemaCheck: Map<string, number>;
}

let realtimeState: RealtimeState = {
    fileWatchers: new Map(),
    connectionMonitors: new Map(),
    statusBarItem: null,
    schemaMonitors: new Map(),
    activeSQLFile: null,
    lastSchemaCheck: new Map()
};

function registerEventHandlers(context: vscode.ExtensionContext, treeProvider: any, components?: ExtensionComponents): void {
    // Initialize persistent status bar for SQL files
    initializePersistentStatusBar();

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (!editor) return;

            const document = editor.document;
            const isSQLFile = document.languageId === 'sql' || document.languageId === 'postgresql';
            const fileName = document.fileName.toLowerCase();

            // Handle SQL file activation
            if (isSQLFile || fileName.endsWith('.sql') || fileName.endsWith('.psql')) {
                Logger.debug('SQL file activated', 'onDidChangeActiveTextEditor', {
                    fileName: document.fileName,
                    languageId: document.languageId
                });

                // Update context for SQL-specific commands
                vscode.commands.executeCommand('setContext', 'postgresql.sqlFileActive', true);
                vscode.commands.executeCommand('setContext', 'postgresql.sqlFilePath', document.fileName);

                // Set as active SQL file for real-time monitoring
                realtimeState.activeSQLFile = document.fileName;

                // Auto-detect connection based on file path or content
                detectConnectionForSQLFile(document);

                // Update persistent status bar with SQL file info
                updatePersistentStatusBar(document);

                // Setup file system watcher for real-time changes
                setupSQLFileWatcher(document, components);

                // Start real-time schema monitoring if connected
                startSchemaMonitoring(document, components);

                // Trigger IntelliSense refresh if query editor is available
                if (components?.queryEditorView) {
                    refreshIntelliSenseForFile(document, components);
                }
            } else {
                // Clear SQL-specific context when switching away from SQL files
                vscode.commands.executeCommand('setContext', 'postgresql.sqlFileActive', false);
                realtimeState.activeSQLFile = null;
                clearPersistentStatusBar();
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

                // Restart real-time monitoring with new settings
                restartRealtimeMonitoring(components);
            }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            Logger.info('Workspace folders changed, refreshing connections');
            treeProvider.refresh();

            // Restart file watchers for new workspace
            restartFileWatchers(components);
        })
    );

    // Tree view specific event handlers
    if (components?.treeView) {
        context.subscriptions.push(
            components.treeView.onDidChangeVisibility((visible) => {
                if (visible) {
                    Logger.debug('PostgreSQL tree view became visible');
                    // Refresh data when tree view becomes visible
                    treeProvider.refresh();

                    // Start real-time connection monitoring
                    startConnectionMonitoring(components);

                    // Update tree view title with real-time info
                    if (components.treeView) {
                        updateTreeViewTitle(components.treeView);
                    }
                } else {
                    // Stop connection monitoring when tree view is hidden
                    stopConnectionMonitoring();
                }
            })
        );

        // Tree view selection handling integrated into tree provider

        // Add real-time expansion/collapse tracking
        context.subscriptions.push(
            components.treeView.onDidExpandElement((event) => {
                Logger.debug('Tree view element expanded', 'onDidExpandElement', {
                    element: event.element
                });

                // Track expanded elements for real-time updates
                trackTreeViewExpansion(event.element, true);
            })
        );

        context.subscriptions.push(
            components.treeView.onDidCollapseElement((event) => {
                Logger.debug('Tree view element collapsed', 'onDidCollapseElement', {
                    element: event.element
                });

                // Track collapsed elements for real-time updates
                trackTreeViewExpansion(event.element, false);
            })
        );
    }

    // Setup workspace-wide SQL file watchers
    setupWorkspaceSQLWatchers(components);

    // Start global real-time monitoring
    startGlobalRealtimeMonitoring(components);

    // Cleanup on extension deactivation
    context.subscriptions.push({
        dispose: () => {
            cleanupRealtimeMonitoring();
        }
    });
}

// SQL File Handling Functions
function detectConnectionForSQLFile(document: vscode.TextDocument): void {
    try {
        const fileName = document.fileName;
        const content = document.getText();

        // Try to detect connection based on file name patterns
        const connections = components?.connectionManager.getConnections() || [];

        // Look for database name in file path
        const pathParts = fileName.split(/[/\\]/);
        for (const part of pathParts) {
            const matchingConnection = connections.find(conn =>
                part.includes(conn.database) || part.includes(conn.name)
            );
            if (matchingConnection) {
                vscode.commands.executeCommand('setContext', 'postgresql.detectedConnection', matchingConnection.id);
                Logger.debug('Auto-detected connection for SQL file', 'detectConnectionForSQLFile', {
                    fileName,
                    detectedConnection: matchingConnection.name
                });
                return;
            }
        }

        // Look for connection hints in file content
        for (const connection of connections) {
            if (content.includes(connection.host) || content.includes(connection.database)) {
                vscode.commands.executeCommand('setContext', 'postgresql.detectedConnection', connection.id);
                Logger.debug('Connection detected in SQL content', 'detectConnectionForSQLFile', {
                    fileName,
                    detectedConnection: connection.name
                });
                return;
            }
        }

        // No specific connection detected
        vscode.commands.executeCommand('setContext', 'postgresql.detectedConnection', null);

    } catch (error) {
        Logger.error('Error detecting connection for SQL file', error as Error);
    }
}

interface QueryExecutionState {
    isExecuting: boolean;
    currentStatement: number;
    totalStatements: number;
    startTime: number;
    progressItem: vscode.Progress<{ message?: string; increment?: number; }> | null;
    executionResults: Array<{ statement: string; success: boolean; duration: number; error?: string; }>;
}

let queryExecutionState: QueryExecutionState = {
    isExecuting: false,
    currentStatement: 0,
    totalStatements: 0,
    startTime: 0,
    progressItem: null,
    executionResults: []
};

// SQL Content Processing Functions
async function executeSQLContent(sqlContent: string, connectionId: string): Promise<void> {
    if (queryExecutionState.isExecuting) {
        vscode.window.showWarningMessage('A query execution is already in progress. Please wait for it to complete.');
        return;
    }

    try {
        Logger.info('Executing SQL content from file', 'executeSQLContent', {
            connectionId,
            contentLength: sqlContent.length
        });

        // Use the query execution service directly
        const queryExecutionService = components?.queryExecutionService;
        if (!queryExecutionService) {
            throw new Error('Query execution service not available');
        }

        // Split SQL content into individual statements
        const statements = sqlContent.split(';').filter(stmt => stmt.trim().length > 0);

        if (statements.length === 0) {
            vscode.window.showWarningMessage('No valid SQL statements found in file');
            return;
        }

        // Initialize execution state
        queryExecutionState.isExecuting = true;
        queryExecutionState.currentStatement = 0;
        queryExecutionState.totalStatements = statements.length;
        queryExecutionState.startTime = Date.now();
        queryExecutionState.executionResults = [];

        // Show progress notification
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Executing SQL',
            cancellable: true
        }, async (progress, token) => {
            queryExecutionState.progressItem = progress;

            // Handle cancellation
            token.onCancellationRequested(() => {
                Logger.info('SQL execution cancelled by user', 'executeSQLContent');
                queryExecutionState.isExecuting = false;
                vscode.window.showInformationMessage('SQL execution cancelled');
            });

            // Execute each statement with progress tracking
            let successCount = 0;
            let errorCount = 0;

            for (let i = 0; i < statements.length; i++) {
                if (!queryExecutionState.isExecuting) break;

                const statement = statements[i];
                const trimmedStatement = statement.trim();
                if (trimmedStatement.length === 0) continue;

                queryExecutionState.currentStatement = i + 1;

                // Update progress
                const progressPercent = ((i + 1) / statements.length) * 100;
                progress.report({
                    message: `Executing statement ${i + 1} of ${statements.length}...`,
                    increment: (1 / statements.length) * 100
                });

                // Update status bar with execution progress
                updateExecutionStatusBar(i + 1, statements.length);

                const statementStartTime = Date.now();

                try {
                    const result = await queryExecutionService.executeQuery(
                        connectionId,
                        trimmedStatement,
                        { timeout: 30000, maxRows: 1000 }
                    );

                    const duration = Date.now() - statementStartTime;

                    if (result.error) {
                        errorCount++;
                        queryExecutionState.executionResults.push({
                            statement: trimmedStatement,
                            success: false,
                            duration,
                            error: result.error
                        });

                        Logger.warn('SQL statement execution failed', 'executeSQLContent', {
                            statement: trimmedStatement.substring(0, 100) + '...',
                            error: result.error,
                            duration: `${duration}ms`
                        });
                    } else {
                        successCount++;
                        queryExecutionState.executionResults.push({
                            statement: trimmedStatement,
                            success: true,
                            duration
                        });

                        Logger.debug('SQL statement executed successfully', 'executeSQLContent', {
                            statement: trimmedStatement.substring(0, 100) + '...',
                            rowCount: result.rowCount,
                            duration: `${duration}ms`
                        });
                    }
                } catch (statementError) {
                    errorCount++;
                    const duration = Date.now() - statementStartTime;

                    queryExecutionState.executionResults.push({
                        statement: trimmedStatement,
                        success: false,
                        duration,
                        error: (statementError as Error).message
                    });

                    Logger.error('SQL statement execution error', statementError as Error);
                }

                // Small delay between statements to show progress
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Clear progress
            progress.report({ message: 'Execution completed', increment: 100 });

            // Show results summary with real-time details
            showExecutionResults(successCount, errorCount, statements.length);
        });

    } catch (error) {
        Logger.error('Failed to execute SQL content', error as Error);
        vscode.window.showErrorMessage(`SQL execution failed: ${(error as Error).message}`);
    } finally {
        // Reset execution state
        queryExecutionState.isExecuting = false;
        queryExecutionState.progressItem = null;
        queryExecutionState.executionResults = [];
        clearExecutionStatusBar();
    }
}

function updateExecutionStatusBar(current: number, total: number): void {
    if (!realtimeState.statusBarItem) return;

    const elapsed = Date.now() - queryExecutionState.startTime;
    realtimeState.statusBarItem.text = `$(sync~spin) SQL: ${current}/${total}`;
    realtimeState.statusBarItem.tooltip = `Executing SQL statements...\nProgress: ${current}/${total}\nElapsed: ${elapsed}ms`;
}

function clearExecutionStatusBar(): void {
    if (!realtimeState.statusBarItem && !realtimeState.activeSQLFile) return;
    // Restore the file status if we have an active SQL file
    if (realtimeState.activeSQLFile) {
        vscode.workspace.openTextDocument(realtimeState.activeSQLFile).then(document => {
            if (document) {
                updatePersistentStatusBar(document);
            }
        });
    }
}

function showExecutionResults(successCount: number, errorCount: number, totalCount: number): void {
    const totalDuration = Date.now() - queryExecutionState.startTime;
    const avgDuration = queryExecutionState.executionResults.length > 0
        ? queryExecutionState.executionResults.reduce((sum, result) => sum + result.duration, 0) / queryExecutionState.executionResults.length
        : 0;

    if (errorCount === 0) {
        vscode.window.showInformationMessage(
            `All SQL statements executed successfully!\n${successCount}/${totalCount} statements completed in ${totalDuration}ms (avg: ${Math.round(avgDuration)}ms)`,
            'View Details', 'View Performance'
        ).then(selection => {
            if (selection === 'View Details') {
                Logger.showOutputChannel();
            } else if (selection === 'View Performance') {
                showPerformanceDetails();
            }
        });
    } else {
        vscode.window.showWarningMessage(
            `SQL execution completed with issues:\n${successCount} succeeded, ${errorCount} failed\nTotal time: ${totalDuration}ms (avg: ${Math.round(avgDuration)}ms)`,
            'View Details', 'View Errors', 'View Performance'
        ).then(selection => {
            if (selection === 'View Details' || selection === 'View Errors') {
                Logger.showOutputChannel();
            } else if (selection === 'View Performance') {
                showPerformanceDetails();
            }
        });
    }
}

function showPerformanceDetails(): void {
    try {
        // Get current execution metrics
        const totalDuration = Date.now() - queryExecutionState.startTime;
        const successfulResults = queryExecutionState.executionResults.filter(r => r.success);
        const failedResults = queryExecutionState.executionResults.filter(r => !r.success);

        // Calculate comprehensive statistics
        const avgDuration = successfulResults.length > 0
            ? successfulResults.reduce((sum, r) => sum + r.duration, 0) / successfulResults.length
            : 0;

        const minDuration = successfulResults.length > 0
            ? Math.min(...successfulResults.map(r => r.duration))
            : 0;

        const maxDuration = successfulResults.length > 0
            ? Math.max(...successfulResults.map(r => r.duration))
            : 0;

        // Performance analysis
        const performanceRating = analyzePerformance(avgDuration, totalDuration);
        const recommendations = generatePerformanceRecommendations(successfulResults, failedResults, avgDuration);

        // Create comprehensive report
        const details = [
            `=== SQL Execution Performance Report ===`,
            `Generated: ${new Date().toISOString()}`,
            ``,
            `=== EXECUTION SUMMARY ===`,
            `Total Execution Time: ${totalDuration}ms`,
            `Total Statements: ${queryExecutionState.totalStatements}`,
            `Successful: ${successfulResults.length}`,
            `Failed: ${failedResults.length}`,
            `Success Rate: ${queryExecutionState.totalStatements > 0 ? Math.round((successfulResults.length / queryExecutionState.totalStatements) * 100) : 0}%`,
            ``,
            `=== PERFORMANCE METRICS ===`,
            `Average Execution Time: ${Math.round(avgDuration)}ms`,
            `Fastest Statement: ${minDuration}ms`,
            `Slowest Statement: ${maxDuration}ms`,
            `Performance Rating: ${performanceRating.rating} (${performanceRating.description})`,
            ``
        ];

        // Add successful statements with detailed timing
        if (successfulResults.length > 0) {
            details.push(`=== SUCCESSFUL STATEMENTS (${successfulResults.length}) ===`);
            successfulResults
                .sort((a, b) => b.duration - a.duration) // Sort by duration descending
                .forEach((result, index) => {
                    const performanceIndicator = getPerformanceIndicator(result.duration, avgDuration);
                    details.push(`${index + 1}. ${result.duration}ms ${performanceIndicator} - ${result.statement.substring(0, 60)}${result.statement.length > 60 ? '...' : ''}`);
                });
        }

        // Add failed statements with error details
        if (failedResults.length > 0) {
            details.push(``);
            details.push(`=== FAILED STATEMENTS (${failedResults.length}) ===`);
            failedResults.forEach((result, index) => {
                details.push(`${index + 1}. ${result.duration}ms - ERROR: ${result.error}`);
                details.push(`   Statement: ${result.statement.substring(0, 60)}${result.statement.length > 60 ? '...' : ''}`);
                details.push(``);
            });
        }

        // Add performance recommendations
        if (recommendations.length > 0) {
            details.push(`=== PERFORMANCE RECOMMENDATIONS ===`);
            recommendations.forEach(rec => {
                details.push(`• ${rec}`);
            });
            details.push(``);
        }

        // Add system performance metrics
        details.push(`=== SYSTEM METRICS ===`);
        details.push(`Global File Operations: ${performanceMetrics.fileOperations}`);
        details.push(`Global Connection Checks: ${performanceMetrics.connectionChecks}`);
        details.push(`Global Query Executions: ${performanceMetrics.queryExecutions}`);
        details.push(`Global Average Response Time: ${Math.round(performanceMetrics.averageResponseTime)}ms`);
        details.push(``);

        // Add real-time monitoring status
        details.push(`=== REAL-TIME MONITORING STATUS ===`);
        details.push(`Active File Watchers: ${realtimeState.fileWatchers.size}`);
        details.push(`Active Connection Monitors: ${realtimeState.connectionMonitors.size}`);
        details.push(`Active Schema Monitors: ${realtimeState.schemaMonitors.size}`);
        details.push(`Currently Monitored SQL File: ${realtimeState.activeSQLFile ? 'Yes' : 'No'}`);

        // Log to output channel for debugging
        Logger.info('SQL Execution Performance Report Generated', 'showPerformanceDetails', {
            totalDuration,
            totalStatements: queryExecutionState.totalStatements,
            successfulCount: successfulResults.length,
            failedCount: failedResults.length,
            averageDuration: Math.round(avgDuration),
            performanceRating: performanceRating.rating
        });

        // Show report options to user
        vscode.window.showInformationMessage(
            `Performance Report Generated: ${performanceRating.rating} performance (${Math.round(avgDuration)}ms avg)`,
            'View Report', 'Export Report', 'Copy to Clipboard'
        ).then(selection => {
            switch (selection) {
                case 'View Report':
                    showReportInDocument(details.join('\n'));
                    break;
                case 'Export Report':
                    exportReportToFile(details.join('\n'));
                    break;
                case 'Copy to Clipboard':
                    copyReportToClipboard(details.join('\n'));
                    break;
            }
        });

    } catch (error) {
        Logger.error('Error generating performance details', error as Error);
        vscode.window.showErrorMessage(`Failed to generate performance report: ${(error as Error).message}`);
    }
}

function analyzePerformance(avgDuration: number, totalDuration: number): { rating: string; description: string; } {
    // Analyze both average duration (individual query performance) and total duration (overall workload)
    const avgRating = getAverageDurationRating(avgDuration);
    const totalRating = getTotalDurationRating(totalDuration);

    // Combine ratings - use the more severe rating as the primary indicator
    if (avgRating.severity > totalRating.severity) {
        return {
            rating: avgRating.rating,
            description: `${avgRating.description} (based on ${Math.round(avgDuration)}ms average per query)`
        };
    } else {
        return {
            rating: totalRating.rating,
            description: `${totalRating.description} (total: ${totalDuration}ms for all queries)`
        };
    }
}

function getAverageDurationRating(avgDuration: number): { rating: string; description: string; severity: number; } {
    if (avgDuration < 50) {
        return { rating: 'Excellent', description: 'Very fast individual query performance', severity: 1 };
    } else if (avgDuration < 150) {
        return { rating: 'Good', description: 'Fast individual query performance', severity: 2 };
    } else if (avgDuration < 500) {
        return { rating: 'Moderate', description: 'Acceptable individual query performance', severity: 3 };
    } else if (avgDuration < 1000) {
        return { rating: 'Slow', description: 'Slow individual query performance', severity: 4 };
    } else {
        return { rating: 'Very Slow', description: 'Very slow individual query performance', severity: 5 };
    }
}

function getTotalDurationRating(totalDuration: number): { rating: string; description: string; severity: number; } {
    if (totalDuration < 100) {
        return { rating: 'Excellent', description: 'Very fast overall execution', severity: 1 };
    } else if (totalDuration < 500) {
        return { rating: 'Good', description: 'Fast overall execution', severity: 2 };
    } else if (totalDuration < 2000) {
        return { rating: 'Moderate', description: 'Acceptable overall execution time', severity: 3 };
    } else if (totalDuration < 5000) {
        return { rating: 'Slow', description: 'Slow overall execution, consider optimization', severity: 4 };
    } else {
        return { rating: 'Very Slow', description: 'Very slow overall execution, optimization required', severity: 5 };
    }
}

function getPerformanceIndicator(duration: number, avgDuration: number): string {
    const ratio = duration / avgDuration;
    if (ratio < 0.5) return '⚡'; // Very fast
    if (ratio < 0.8) return '🚀'; // Fast
    if (ratio < 1.2) return '✅'; // Normal
    if (ratio < 2.0) return '⚠️';  // Slow
    return '🐌'; // Very slow
}

function generatePerformanceRecommendations(
    successfulResults: Array<{ statement: string; success: boolean; duration: number; error?: string; }>,
    failedResults: Array<{ statement: string; success: boolean; duration: number; error?: string; }>,
    avgDuration: number
): string[] {
    const recommendations: string[] = [];

    // Analyze slow queries
    const slowQueries = successfulResults.filter(r => r.duration > avgDuration * 2);
    if (slowQueries.length > 0) {
        recommendations.push(`${slowQueries.length} queries are significantly slower than average - consider adding indexes`);
    }

    // Analyze failed queries
    if (failedResults.length > 0) {
        const syntaxErrors = failedResults.filter(r => r.error?.toLowerCase().includes('syntax')).length;
        if (syntaxErrors > 0) {
            recommendations.push(`${syntaxErrors} syntax errors found - check SQL syntax`);
        }

        const connectionErrors = failedResults.filter(r => r.error?.toLowerCase().includes('connection')).length;
        if (connectionErrors > 0) {
            recommendations.push(`${connectionErrors} connection errors - verify database connectivity`);
        }
    }

    // General recommendations based on average duration
    if (avgDuration > 500) {
        recommendations.push('Consider optimizing queries or adding database indexes');
    }

    if (successfulResults.length > 10) {
        recommendations.push('Large number of statements - consider batch optimization');
    }

    // Real-time monitoring recommendations
    if (realtimeState.fileWatchers.size > 20) {
        recommendations.push('Many file watchers active - consider workspace optimization');
    }

    return recommendations;
}

async function showReportInDocument(reportContent: string): Promise<void> {
    try {
        const document = await vscode.workspace.openTextDocument({
            content: reportContent,
            language: 'log'
        });

        await vscode.window.showTextDocument(document, {
            preview: true,
            preserveFocus: false,
            viewColumn: vscode.ViewColumn.Beside
        });

        vscode.window.showInformationMessage('Performance report opened in new tab');
    } catch (error) {
        Logger.error('Error showing report in document', error as Error);
        vscode.window.showErrorMessage(`Failed to open report: ${(error as Error).message}`);
    }
}

async function exportReportToFile(reportContent: string): Promise<void> {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`postgresql-performance-report-${timestamp}.txt`),
            filters: {
                'Text Files': ['txt'],
                'Log Files': ['log'],
                'All Files': ['*']
            },
            title: 'Export Performance Report'
        });

        if (uri) {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(reportContent, 'utf8'));
            vscode.window.showInformationMessage(`Performance report exported to ${uri.fsPath}`);
        }
    } catch (error) {
        Logger.error('Error exporting report to file', error as Error);
        vscode.window.showErrorMessage(`Failed to export report: ${(error as Error).message}`);
    }
}

async function copyReportToClipboard(reportContent: string): Promise<void> {
    try {
        await vscode.env.clipboard.writeText(reportContent);
        vscode.window.showInformationMessage('Performance report copied to clipboard');
    } catch (error) {
        Logger.error('Error copying report to clipboard', error as Error);
        vscode.window.showErrorMessage(`Failed to copy report: ${(error as Error).message}`);
    }
}

async function formatSQL(sqlContent: string): Promise<string> {
    try {
        Logger.info('Formatting SQL content', 'formatSQL', {
            contentLength: sqlContent.length
        });

        // Basic SQL formatting - can be enhanced with a proper SQL formatter library
        let formatted = sqlContent;

        // Normalize whitespace
        formatted = formatted.replace(/\s+/g, ' ');

        // Add newlines after keywords
        formatted = formatted.replace(/\s*(SELECT|FROM|WHERE|GROUP BY|ORDER BY|HAVING|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\s+/gi, '\n$1 ');
        formatted = formatted.replace(/\s*(INNER JOIN|LEFT JOIN|RIGHT JOIN|FULL JOIN|UNION|UNION ALL)\s+/gi, '\n$1 ');
        formatted = formatted.replace(/\s*(AND|OR)\s+/gi, '\n    $1 ');

        // Format column lists
        formatted = formatted.replace(/\s*,\s*/g, ',\n    ');

        // Clean up excessive newlines
        formatted = formatted.replace(/\n\s*\n/g, '\n');

        // Trim and return
        return formatted.trim();

    } catch (error) {
        Logger.error('Failed to format SQL', error as Error);
        throw error;
    }
}

// Real-time monitoring functions
function initializePersistentStatusBar(): void {
    if (!realtimeState.statusBarItem) {
        realtimeState.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        realtimeState.statusBarItem.command = 'postgresql.openQueryEditor';
    }
}

function updatePersistentStatusBar(document: vscode.TextDocument): void {
    if (!realtimeState.statusBarItem) return;

    const fileName = document.fileName.split(/[/\\]/).pop() || 'Unknown';
    const connectionInfo = getCurrentConnectionInfo();
    const lastModified = new Date(document.uri.fsPath).toLocaleTimeString();

    realtimeState.statusBarItem.text = `$(database) ${fileName}`;
    realtimeState.statusBarItem.tooltip = `SQL File: ${document.fileName}\nLanguage: ${document.languageId}\nLast Modified: ${lastModified}\nConnection: ${connectionInfo}\nSize: ${document.getText().length} characters`;
    realtimeState.statusBarItem.show();

    Logger.debug('Persistent status bar updated', 'updatePersistentStatusBar', {
        fileName,
        languageId: document.languageId
    });
}

function clearPersistentStatusBar(): void {
    if (realtimeState.statusBarItem) {
        realtimeState.statusBarItem.hide();
    }
}

function getCurrentConnectionInfo(): string {
    const detectedConnectionId = vscode.workspace.getConfiguration().get<string>('postgresql.detectedConnection');
    if (detectedConnectionId && components?.connectionManager) {
        const connections = components.connectionManager.getConnections();
        const connection = connections.find(c => c.id === detectedConnectionId);
        if (connection) {
            return `${connection.name} (${connection.host}:${connection.port})`;
        }
    }
    return 'None';
}

function setupSQLFileWatcher(document: vscode.TextDocument, components?: ExtensionComponents): void {
    const filePath = document.fileName;

    // Remove existing watcher if any
    if (realtimeState.fileWatchers.has(filePath)) {
        realtimeState.fileWatchers.get(filePath)?.dispose();
    }

    // Create new file watcher for real-time changes
    const watcher = vscode.workspace.createFileSystemWatcher(filePath);

    watcher.onDidChange((uri) => {
        Logger.debug('SQL file changed', 'setupSQLFileWatcher', { filePath: uri.fsPath });

        // Update status bar with modification time
        if (realtimeState.activeSQLFile === filePath) {
            updatePersistentStatusBar(document);
        }

        // Trigger IntelliSense refresh
        if (components?.queryEditorView) {
            refreshIntelliSenseForFile(document, components);
        }

        // Show notification for external changes
        vscode.window.showInformationMessage(
            `SQL file "${document.fileName.split(/[/\\]/).pop()}" was modified externally`,
            'Refresh', 'Ignore'
        ).then(selection => {
            if (selection === 'Refresh') {
                vscode.commands.executeCommand('postgresql.refreshExplorer');
            }
        });
    });

    watcher.onDidDelete((uri) => {
        Logger.info('SQL file deleted', 'setupSQLFileWatcher', { filePath: uri.fsPath });

        // Clean up watcher
        watcher.dispose();
        realtimeState.fileWatchers.delete(filePath);

        // Clear status if this was the active file
        if (realtimeState.activeSQLFile === filePath) {
            realtimeState.activeSQLFile = null;
            clearPersistentStatusBar();
        }
    });

    realtimeState.fileWatchers.set(filePath, watcher);
}

function refreshIntelliSenseForFile(document: vscode.TextDocument, components: ExtensionComponents): void {
    try {
        const content = document.getText();
        const connectionId = vscode.workspace.getConfiguration().get<string>('postgresql.detectedConnection');

        if (connectionId && components.queryEditorView) {
            // Trigger IntelliSense refresh for the current file
            Logger.debug('Refreshing IntelliSense for SQL file', 'refreshIntelliSenseForFile', {
                fileName: document.fileName,
                connectionId
            });

            // This could be enhanced to provide real-time suggestions based on file content
            vscode.commands.executeCommand('editor.action.triggerSuggest');
        }
    } catch (error) {
        Logger.error('Error refreshing IntelliSense', error as Error);
    }
}

function startSchemaMonitoring(document: vscode.TextDocument, components?: ExtensionComponents): void {
    const connectionId = vscode.workspace.getConfiguration().get<string>('postgresql.detectedConnection');
    if (!connectionId || !components?.schemaManager) return;

    // Clear existing monitor
    if (realtimeState.schemaMonitors.has(connectionId)) {
        clearTimeout(realtimeState.schemaMonitors.get(connectionId)!);
    }

    // Check schema changes every 30 seconds
    const monitor = setInterval(async () => {
        try {
            const lastCheck = realtimeState.lastSchemaCheck.get(connectionId) || 0;
            const now = Date.now();

            // Only check if enough time has passed (30 seconds)
            if (now - lastCheck > 30000) {
                await checkSchemaChanges(connectionId, components!);
                realtimeState.lastSchemaCheck.set(connectionId, now);
            }
        } catch (error) {
            Logger.error('Error in schema monitoring', error as Error);
        }
    }, 5000); // Check every 5 seconds but only act every 30 seconds

    realtimeState.schemaMonitors.set(connectionId, monitor);
}

async function checkSchemaChanges(connectionId: string, components: ExtensionComponents): Promise<void> {
    try {
        // This would check for schema changes in the database
        // For now, we'll just log that we're monitoring
        Logger.debug('Checking for schema changes', 'checkSchemaChanges', { connectionId });

        // In a real implementation, this would:
        // 1. Query the database for current schema state
        // 2. Compare with cached schema state
        // 3. Trigger refresh if changes detected
        // 4. Show notification to user

    } catch (error) {
        Logger.error('Error checking schema changes', error as Error);
    }
}

function startConnectionMonitoring(components?: ExtensionComponents): void {
    if (!components?.connectionManager) return;

    const connections = components.connectionManager.getConnections();

    connections.forEach(connection => {
        // Clear existing monitor
        if (realtimeState.connectionMonitors.has(connection.id)) {
            clearInterval(realtimeState.connectionMonitors.get(connection.id)!);
        }

        // Monitor connection status every 60 seconds
        const monitor = setInterval(async () => {
            await checkConnectionStatus(connection.id, components!);
        }, 60000);

        realtimeState.connectionMonitors.set(connection.id, monitor);
    });
}

function stopConnectionMonitoring(): void {
    realtimeState.connectionMonitors.forEach(monitor => {
        clearInterval(monitor);
    });
    realtimeState.connectionMonitors.clear();
}

async function checkConnectionStatus(connectionId: string, components: ExtensionComponents): Promise<void> {
    try {
        // Test connection status
        const isConnected = await testConnectionQuietly(connectionId, components);

        if (!isConnected) {
            Logger.warn('Connection lost', 'checkConnectionStatus', { connectionId });

            // Update status bar to show connection issue
            if (realtimeState.statusBarItem) {
                realtimeState.statusBarItem.text = '$(warning) Connection Lost';
                realtimeState.statusBarItem.tooltip += '\nConnection status: Disconnected';
            }

            // Show notification
            vscode.window.showWarningMessage(
                'Database connection lost. Attempting to reconnect...',
                'Retry Now', 'View Details'
            ).then(selection => {
                if (selection === 'Retry Now') {
                    vscode.commands.executeCommand('postgresql.testConnection');
                } else if (selection === 'View Details') {
                    Logger.showOutputChannel();
                }
            });
        } else {
            Logger.debug('Connection healthy', 'checkConnectionStatus', { connectionId });
        }
    } catch (error) {
        Logger.error('Error checking connection status', error as Error);
    }
}

async function testConnectionQuietly(connectionId: string, components: ExtensionComponents): Promise<boolean> {
    try {
        // This would be a lightweight connection test
        // For now, return true (implement actual connection testing as needed)
        return true;
    } catch (error) {
        return false;
    }
}

function setupWorkspaceSQLWatchers(components?: ExtensionComponents): void {
    // Watch for SQL files in the entire workspace
    const sqlPattern = '**/*.{sql,psql}';
    const watcher = vscode.workspace.createFileSystemWatcher(sqlPattern);

    watcher.onDidCreate((uri) => {
        Logger.info('New SQL file detected', 'setupWorkspaceSQLWatchers', { filePath: uri.fsPath });

        // Setup watcher for the new file
        vscode.workspace.openTextDocument(uri).then(document => {
            if (document) {
                setupSQLFileWatcher(document, components);
            }
        });
    });

    watcher.onDidDelete((uri) => {
        Logger.info('SQL file removed from workspace', 'setupWorkspaceSQLWatchers', { filePath: uri.fsPath });

        // Clean up watcher
        if (realtimeState.fileWatchers.has(uri.fsPath)) {
            realtimeState.fileWatchers.get(uri.fsPath)?.dispose();
            realtimeState.fileWatchers.delete(uri.fsPath);
        }
    });

    // Store the watcher reference for cleanup
    (realtimeState as any).workspaceWatcher = watcher;
}

function startGlobalRealtimeMonitoring(components?: ExtensionComponents): void {
    // Monitor VS Code state changes
    vscode.window.onDidChangeWindowState((state) => {
        if (state.focused && realtimeState.activeSQLFile) {
            // Refresh when window gains focus
            Logger.debug('Window focused, refreshing real-time state', 'startGlobalRealtimeMonitoring');

            // Refresh status bar
            vscode.workspace.openTextDocument(realtimeState.activeSQLFile).then(document => {
                if (document) {
                    updatePersistentStatusBar(document);
                }
            }, (error: any) => {
                Logger.error('Error refreshing on window focus', error);
            });
        }
    });

    // Monitor text document changes for real-time updates
    vscode.workspace.onDidChangeTextDocument((event) => {
        const document = event.document;
        const isSQLFile = document.languageId === 'sql' || document.languageId === 'postgresql';

        if (isSQLFile && realtimeState.activeSQLFile === document.fileName) {
            // Update status bar with character count changes
            updatePersistentStatusBar(document);

            // Trigger real-time validation if needed
            if (components?.queryEditorView) {
                // Could trigger real-time syntax checking
            }
        }
    });
}

function restartRealtimeMonitoring(components?: ExtensionComponents): void {
    Logger.info('Restarting real-time monitoring', 'restartRealtimeMonitoring');

    // Stop existing monitoring
    cleanupRealtimeMonitoring();

    // Restart monitoring
    startConnectionMonitoring(components);
    setupWorkspaceSQLWatchers(components);
    startGlobalRealtimeMonitoring(components);
}

function restartFileWatchers(components?: ExtensionComponents): void {
    Logger.info('Restarting file watchers', 'restartFileWatchers');

    // Clear existing watchers
    realtimeState.fileWatchers.forEach(watcher => watcher.dispose());
    realtimeState.fileWatchers.clear();

    // Setup new watchers for current workspace
    setupWorkspaceSQLWatchers(components);
}

function cleanupRealtimeMonitoring(): void {
    Logger.info('Cleaning up real-time monitoring', 'cleanupRealtimeMonitoring');

    // Dispose file watchers
    realtimeState.fileWatchers.forEach(watcher => watcher.dispose());
    realtimeState.fileWatchers.clear();

    // Clear connection monitors
    stopConnectionMonitoring();

    // Clear schema monitors
    realtimeState.schemaMonitors.forEach(monitor => clearInterval(monitor));
    realtimeState.schemaMonitors.clear();

    // Clear status bar
    clearPersistentStatusBar();

    // Dispose workspace watcher
    if ((realtimeState as any).workspaceWatcher) {
        (realtimeState as any).workspaceWatcher.dispose();
    }

    // Reset state
    realtimeState.activeSQLFile = null;
    realtimeState.lastSchemaCheck.clear();
}

// Enhanced tree view functions
function updateTreeViewTitle(treeView: vscode.TreeView<any>): void {
    try {
        const connectionCount = components?.connectionManager?.getConnections().length || 0;
        const activeConnections = getActiveConnectionCount();
        const timestamp = new Date().toLocaleTimeString();

        treeView.title = `PostgreSQL Explorer (${connectionCount} connections, ${activeConnections} active) - ${timestamp}`;

        Logger.debug('Tree view title updated', 'updateTreeViewTitle', {
            connectionCount,
            activeConnections,
            timestamp
        });
    } catch (error) {
        Logger.error('Error updating tree view title', error as Error);
    }
}

function getActiveConnectionCount(): number {
    // This would check actual connection status
    // For now, return a placeholder
    return components?.connectionManager?.getConnections().length || 0;
}

function trackTreeViewExpansion(element: any, expanded: boolean): void {
    try {
        // Track expanded/collapsed state for real-time updates
        const elementKey = getElementKey(element);

        if (expanded) {
            Logger.debug('Element expanded for real-time tracking', 'trackTreeViewExpansion', {
                elementKey,
                expanded
            });

            // Could trigger real-time data refresh for expanded elements
            // This would be useful for schema objects that need fresh data
        } else {
            Logger.debug('Element collapsed', 'trackTreeViewExpansion', {
                elementKey,
                expanded
            });
        }
    } catch (error) {
        Logger.error('Error tracking tree view expansion', error as Error);
    }
}

function getElementKey(element: any): string {
    // Extract a unique key from the tree element for tracking
    if (element && typeof element === 'object') {
        if (element.id) return element.id;
        if (element.name) return element.name;
        if (element.label) return element.label;
    }
    return 'unknown';
}

// Performance monitoring for real-time metrics
interface PerformanceMetrics {
    fileOperations: number;
    connectionChecks: number;
    schemaChecks: number;
    queryExecutions: number;
    averageResponseTime: number;
    lastResetTime: number;
}

let performanceMetrics: PerformanceMetrics = {
    fileOperations: 0,
    connectionChecks: 0,
    schemaChecks: 0,
    queryExecutions: 0,
    averageResponseTime: 0,
    lastResetTime: Date.now()
};

function initializePerformanceMonitoring(): void {
    // Reset metrics every hour
    setInterval(() => {
        resetPerformanceMetrics();
    }, 3600000);

    Logger.info('Performance monitoring initialized', 'initializePerformanceMonitoring');
}

function recordPerformanceMetric(type: keyof PerformanceMetrics, responseTime?: number): void {
    try {
        switch (type) {
            case 'fileOperations':
                performanceMetrics.fileOperations++;
                break;
            case 'connectionChecks':
                performanceMetrics.connectionChecks++;
                break;
            case 'schemaChecks':
                performanceMetrics.schemaChecks++;
                break;
            case 'queryExecutions':
                performanceMetrics.queryExecutions++;
                break;
            case 'averageResponseTime':
                if (responseTime) {
                    // Update running average
                    const current = performanceMetrics.averageResponseTime;
                    const count = performanceMetrics.queryExecutions;
                    performanceMetrics.averageResponseTime = (current * count + responseTime) / (count + 1);
                }
                break;
        }

        // Log periodic performance summaries
        if (performanceMetrics.fileOperations % 100 === 0) {
            logPerformanceSummary();
        }
    } catch (error) {
        Logger.error('Error recording performance metric', error as Error);
    }
}

function resetPerformanceMetrics(): void {
    Logger.info('Resetting performance metrics', 'resetPerformanceMetrics', {
        previousMetrics: { ...performanceMetrics }
    });

    performanceMetrics = {
        fileOperations: 0,
        connectionChecks: 0,
        schemaChecks: 0,
        queryExecutions: 0,
        averageResponseTime: 0,
        lastResetTime: Date.now()
    };
}

function logPerformanceSummary(): void {
    const uptime = Date.now() - performanceMetrics.lastResetTime;
    const avgResponseTime = performanceMetrics.averageResponseTime > 0 ? Math.round(performanceMetrics.averageResponseTime) : 0;

    Logger.info('Real-time Performance Summary', 'logPerformanceSummary', {
        uptime: `${Math.round(uptime / 1000)}s`,
        fileOperations: performanceMetrics.fileOperations,
        connectionChecks: performanceMetrics.connectionChecks,
        schemaChecks: performanceMetrics.schemaChecks,
        queryExecutions: performanceMetrics.queryExecutions,
        averageResponseTime: `${avgResponseTime}ms`
    });

    // Show performance info in status bar if there's an active SQL file
    if (realtimeState.statusBarItem && realtimeState.activeSQLFile) {
        realtimeState.statusBarItem.tooltip += `\nPerformance: ${performanceMetrics.queryExecutions} queries, ${avgResponseTime}ms avg`;
    }
}

function getPerformanceReport(): string {
    const uptime = Date.now() - performanceMetrics.lastResetTime;
    const avgResponseTime = performanceMetrics.averageResponseTime > 0 ? Math.round(performanceMetrics.averageResponseTime) : 0;

    return [
        `=== Real-time Performance Report ===`,
        `Uptime: ${Math.round(uptime / 1000)} seconds`,
        `File Operations: ${performanceMetrics.fileOperations}`,
        `Connection Checks: ${performanceMetrics.connectionChecks}`,
        `Schema Checks: ${performanceMetrics.schemaChecks}`,
        `Query Executions: ${performanceMetrics.queryExecutions}`,
        `Average Response Time: ${avgResponseTime}ms`,
        ``,
        `Active Monitors:`,
        `- File Watchers: ${realtimeState.fileWatchers.size}`,
        `- Connection Monitors: ${realtimeState.connectionMonitors.size}`,
        `- Schema Monitors: ${realtimeState.schemaMonitors.size}`,
        `- Active SQL File: ${realtimeState.activeSQLFile ? 'Yes' : 'No'}`
    ].join('\n');
}

// Enhanced monitoring startup
// Note: startGlobalRealtimeMonitoring function already exists above
// The duplicate implementation has been removed