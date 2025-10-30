import * as vscode from 'vscode';
import { PostgreSqlExtension } from '../PostgreSqlExtension';
import { ExtensionComponents } from '@/utils/ExtensionInitializer';
import { Logger } from '@/utils/Logger';
import { SchemaComparisonOptions, DetailedSchemaComparisonResult } from '@/managers/schema/SchemaComparison';
import { DatabaseConnection } from '@/managers/ConnectionManager';
import { MigrationManagement } from '@/managers/schema/MigrationManagement';
import { MigrationScriptGenerator } from '@/managers/schema/MigrationScriptGenerator';
import { MigrationExecutor } from '@/managers/schema/MigrationExecutor';
import { MigrationValidator } from '@/managers/schema/MigrationValidator';
import { SchemaOperations } from '@/managers/schema/SchemaOperations';
import { ValidationFramework } from '@/core/ValidationFramework';
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
    private migrationManager: MigrationManagement;
    private schemaOperations: SchemaOperations;
    constructor(
        context: vscode.ExtensionContext,
        extension: PostgreSqlExtension,
        components: ExtensionComponents
    ) {
        this.context = context;
        this.extension = extension;
        this.components = components;

        // Initialize managers
        const scriptGenerator = new MigrationScriptGenerator(this.components.queryExecutionService!, new ValidationFramework());
        const executor = new MigrationExecutor(this.components.queryExecutionService!);
        const validator = new MigrationValidator(this.components.queryExecutionService!, new ValidationFramework());

        this.migrationManager = new MigrationManagement(
            this.components.queryExecutionService!,
            new ValidationFramework(),
            scriptGenerator,
            executor,
            validator
        );
        this.schemaOperations = new SchemaOperations(this.components.connectionManager);
    }
    registerCommands(): vscode.Disposable[] {
        try {
            Logger.info('Registering PostgreSQL extension commands', 'CommandManager');

            const disposables: vscode.Disposable[] = [];

            this.registerCoreCommands(disposables);
            this.registerQueryCommands(disposables);
            this.registerSQLFileCommands(disposables);

            // Start command health monitoring
            this.startCommandMonitoring();

            Logger.info('All PostgreSQL extension commands registered successfully', 'CommandManager', {
                registeredCommands: this.registeredCommands.size
            });

            return disposables;

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
    private registerCoreCommands(disposables: vscode.Disposable[]): void {
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
            // Skip postgresql.addConnection as it's registered separately in extension.ts
            if (command === 'postgresql.addConnection') {
                return;
            }

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

                disposables.push(disposable);
                Logger.debug('Command registered successfully', 'CommandManager', { command, description });
            } catch (error) {
                this.handleCommandError(command, error as Error, ['registration']);
            }
        });

        // Register UI-specific commands
        this.registerUICommands(disposables);

        // Register additional commands
        this.registerAdditionalCommands(disposables);

        // Register manage connections command
        this.registerManageConnectionsCommand(disposables);
    }

    private registerAdditionalCommands(disposables: vscode.Disposable[]): void {
        // Show Help command
        disposables.push(vscode.commands.registerCommand('postgresql.showHelp', async () => {
            try {
                const helpUrl = 'https://github.com/chaluvadis/postgresql-schema-sync#readme';
                const success = await vscode.env.openExternal(vscode.Uri.parse(helpUrl));
                if (success) {
                    Logger.info('Help documentation opened successfully', 'CommandManager');
                } else {
                    Logger.warn('Help documentation may not have opened', 'CommandManager');
                    vscode.window.showWarningMessage('Help documentation may not have opened. Please check your default browser.');
                }
            } catch (error) {
                Logger.error('Failed to open help', error as Error, 'CommandManager');
                vscode.window.showErrorMessage('Failed to open help documentation');
            }
        }));

        // Open Settings command
        disposables.push(vscode.commands.registerCommand('postgresql.openSettings', async () => {
            try {
                await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:nomad-in-code.postgresql-schema-sync');
                Logger.info('Extension settings opened successfully', 'CommandManager');
            } catch (error) {
                Logger.error('Failed to open settings', error as Error, 'CommandManager');
                vscode.window.showErrorMessage('Failed to open extension settings');
            }
        }));
    }

    private registerManageConnectionsCommand(disposables: vscode.Disposable[]): void {
        // Manage Connections command
        disposables.push(vscode.commands.registerCommand('postgresql.manageConnections', async () => {
            try {
                if (this.components.connectionManager) {
                    // Use connection management view for managing connections
                    const { ConnectionManagementView } = await import('../views/ConnectionManagementView');
                    const connectionView = new ConnectionManagementView(this.components.connectionManager);
                    await connectionView.showConnectionDialog();
                    Logger.info('Connection management opened successfully', 'CommandManager');
                } else {
                    Logger.warn('Connection manager not available', 'CommandManager');
                    vscode.window.showErrorMessage('Connection manager not available');
                }
            } catch (error) {
                Logger.error('Failed to open connection management', error as Error, 'CommandManager');
                vscode.window.showErrorMessage(`Failed to open connection management: ${(error as Error).message}`);
            }
        }));
    }
    private registerUICommands(disposables: vscode.Disposable[]): void {
        // Dashboard command
        disposables.push(vscode.commands.registerCommand('postgresql.showDashboard', () => {
            if (this.components.dashboardView) {
                this.components.dashboardView.showDashboard();
                Logger.info('Dashboard opened successfully', 'CommandManager');
            } else {
                Logger.warn('Dashboard view not available', 'CommandManager');
                vscode.window.showErrorMessage('Dashboard view not available');
            }
        }));

        // Notification center command
        disposables.push(vscode.commands.registerCommand('postgresql.showNotifications', () => {
            if (this.components.notificationManager) {
                this.components.notificationManager.showNotificationCenter();
                Logger.info('Notification center opened successfully', 'CommandManager');
            } else {
                Logger.warn('Notification manager not available', 'CommandManager');
                vscode.window.showErrorMessage('Notification manager not available');
            }
        }));

        // Active operations command
        disposables.push(vscode.commands.registerCommand('postgresql.showActiveOperations', () => {
            if (this.components.enhancedStatusBarProvider) {
                this.components.enhancedStatusBarProvider.showOperationDetails();
                Logger.info('Active operations view opened successfully', 'CommandManager');
            } else {
                Logger.warn('Enhanced status bar not available', 'CommandManager');
                vscode.window.showErrorMessage('Enhanced status bar not available');
            }
        }));

        // Schema drift reporting command
        disposables.push(vscode.commands.registerCommand('postgresql.showSchemaDriftReport', async (comparisonId?: string) => {
            if (this.components.driftReportView && this.components.reportingService) {
                if (!comparisonId) {
                    Logger.warn('No comparisonId provided for schema drift report', 'CommandManager');
                    vscode.window.showErrorMessage('Comparison ID is required to show schema drift report');
                    return;
                }
                await this.components.driftReportView.showReport(comparisonId);
                Logger.info('Schema drift report opened successfully', 'CommandManager', { comparisonId });
            } else {
                Logger.warn('Schema drift report view or reporting service not available', 'CommandManager');
                vscode.window.showErrorMessage('Schema drift report view not available');
            }
        }));

        // Query analytics command
        disposables.push(vscode.commands.registerCommand('postgresql.showQueryAnalytics', async () => {
            if (this.components.queryAnalyticsView) {
                await this.components.queryAnalyticsView.showAnalytics();
                Logger.info('Query analytics opened successfully', 'CommandManager');
            } else {
                Logger.warn('Query analytics view not available', 'CommandManager');
                vscode.window.showErrorMessage('Query analytics view not available');
            }
        }));

        // Quick connect command
        disposables.push(vscode.commands.registerCommand('postgresql.quickConnect', async () => {
            const connectionName = await vscode.window.showInputBox({
                prompt: 'Enter connection name',
                placeHolder: 'My Database Connection'
            });

            if (connectionName) {
                await vscode.commands.executeCommand('postgresql.addConnection');
                Logger.info('Quick connect initiated with name', 'CommandManager', { connectionName });
            } else {
                Logger.info('Quick connect cancelled - no name provided', 'CommandManager');
            }
        }));
    }
    private registerQueryCommands(disposables: vscode.Disposable[]): void {
        // Open query editor command
        disposables.push(vscode.commands.registerCommand('postgresql.openQueryEditor', async (connection) => {
            if (this.components.queryEditorView) {
                await this.components.queryEditorView.showQueryEditor(connection?.id);
                Logger.info('Query editor opened successfully', 'CommandManager', { connectionId: connection?.id });
            } else {
                Logger.warn('Query editor view not available', 'CommandManager');
                vscode.window.showErrorMessage('Query editor not available');
            }
        }));

        // Execute query command
        disposables.push(vscode.commands.registerCommand('postgresql.executeQuery', async () => {
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
        }));
    }
    private registerSQLFileCommands(disposables: vscode.Disposable[]): void {
        // Execute current file command
        disposables.push(vscode.commands.registerCommand('postgresql.executeCurrentFile', async () => {
            try {
                await this.executeCurrentSQLFile();
            } catch (error) {
                this.handleCommandError('postgresql.executeCurrentFile', error as Error);
            }
        }));

        // Format current file command
        disposables.push(vscode.commands.registerCommand('postgresql.formatCurrentFile', async () => {
            try {
                await this.formatCurrentSQLFile();
            } catch (error) {
                this.handleCommandError('postgresql.formatCurrentFile', error as Error);
            }
        }));
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
    private async handleRemoveConnection(connection?: any): Promise<void> {
        try {
            if (!connection) {
                Logger.warn('No connection provided for removal', 'CommandManager');
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
                        Logger.info('Tree view refreshed after connection removal', 'CommandManager');
                    } else {
                        Logger.warn('Tree provider not available for refresh after connection removal', 'CommandManager');
                    }

                    Logger.info('Connection removed successfully', 'CommandManager', { connectionId: connection.id });
                    vscode.window.showInformationMessage(`Connection "${connection.name}" removed successfully`);
                }
            } else {
                Logger.warn('Connection manager not available', 'CommandManager');
                vscode.window.showErrorMessage('Connection manager not available');
            }
        } catch (error) {
            Logger.error('Failed to remove connection', error as Error, 'CommandManager');
            vscode.window.showErrorMessage(`Failed to remove connection: ${(error as Error).message}`);
        }
    }
    private async handleRefreshExplorer(): Promise<void> {
        try {
            if (this.components.treeProvider) {
                this.components.treeProvider.refresh();
                vscode.window.showInformationMessage('Database explorer refreshed');
                Logger.info('Database explorer refreshed successfully', 'CommandManager');
            } else {
                Logger.warn('Tree provider not available for refresh', 'CommandManager');
                vscode.window.showErrorMessage('Tree provider not available');
            }
        } catch (error) {
            Logger.error('Failed to refresh explorer', error as Error, 'CommandManager');
            vscode.window.showErrorMessage(`Failed to refresh explorer: ${(error as Error).message}`);
        }
    }
    private async handleBrowseSchema(connectionId?: string, schemaName?: string): Promise<void> {
        try {
            if (!connectionId) {
                Logger.warn('Connection ID is required to browse schema', 'CommandManager');
                vscode.window.showErrorMessage('Connection ID is required to browse schema');
                return;
            }

            if (this.components.schemaBrowserView) {
                await this.components.schemaBrowserView.showSchemaBrowser(connectionId, schemaName);
                Logger.info('Schema browser opened successfully', 'CommandManager', { connectionId, schemaName });
            } else {
                Logger.warn('Schema browser view not available', 'CommandManager');
                vscode.window.showErrorMessage('Schema browser not available');
            }
        } catch (error) {
            Logger.error('Failed to browse schema', error as Error, 'CommandManager');
            vscode.window.showErrorMessage(`Failed to browse schema: ${(error as Error).message}`);
        }
    }
    private async handleCompareSchemas(source?: any, target?: any): Promise<void> {
        let operationId: string | undefined;
        const statusProvider = this.components.enhancedStatusBarProvider;
        try {
            const connectionManager = this.components.connectionManager;
            const schemaManager = this.components.schemaManager;
            if (!connectionManager || !schemaManager) {
                vscode.window.showErrorMessage('Schema comparison services unavailable');
                return;
            }

            const availableConnections = connectionManager.getConnections();
            if (availableConnections.length < 2) {
                vscode.window.showErrorMessage('You need at least two connections to perform a schema comparison');
                return;
            }

            const resolveConnection = async (
                provided: any,
                placeholder: string,
                excludeId?: string
            ): Promise<DatabaseConnection | undefined> => {
                if (provided?.id) {
                    return connectionManager.getConnection(provided.id);
                }

                const pickItems = availableConnections
                    .filter(conn => conn.id !== excludeId)
                    .map(conn => ({
                        label: conn.name,
                        description: `${conn.host}:${conn.port}/${conn.database}`,
                        connection: conn
                    }));

                if (pickItems.length === 0) {
                    return undefined;
                }

                const selection = await vscode.window.showQuickPick(pickItems, { placeHolder: placeholder });
                return selection?.connection;
            };

            const sourceConnection = await resolveConnection(source, 'Select source environment for schema comparison');
            if (!sourceConnection) {
                vscode.window.showWarningMessage('Schema comparison cancelled: source environment not selected');
                return;
            }

            const targetConnection = await resolveConnection(target, 'Select target environment for schema comparison', sourceConnection.id);
            if (!targetConnection) {
                vscode.window.showWarningMessage('Schema comparison cancelled: target environment not selected');
                return;
            }

            if (sourceConnection.id === targetConnection.id) {
                vscode.window.showErrorMessage('Select two different connections to run a schema comparison');
                return;
            }

            const notificationManager = this.components.notificationManager;
            const reportingService = this.components.reportingService;
            const driftReportView = this.components.driftReportView;

            operationId = `schema-compare-${Date.now()}`;
            statusProvider?.startOperation(operationId, `Schema drift: ${sourceConnection.name} → ${targetConnection.name}`, {
                message: 'Collecting metadata',
                progress: 0
            });

            const comparisonOptions: SchemaComparisonOptions = {
                mode: 'strict',
                includeSystemObjects: false,
                ignoreSchemas: ['pg_catalog', 'information_schema']
            };

            let comparisonResult: DetailedSchemaComparisonResult | undefined;

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Comparing ${sourceConnection.name} to ${targetConnection.name}`,
                cancellable: false
            }, async progress => {
                progress.report({ increment: 10, message: 'Collecting metadata...' });
                if (operationId) {
                    statusProvider?.updateOperation(operationId, 'running', {
                        progress: 10,
                        message: 'Collecting metadata'
                    });
                }

                const start = Date.now();
                comparisonResult = await schemaManager.compareSchemasDetailed(
                    sourceConnection.id,
                    targetConnection.id,
                    comparisonOptions
                );
                const execTime = Date.now() - start;

                progress.report({ increment: 70, message: 'Analyzing differences...' });
                if (operationId) {
                    statusProvider?.updateOperation(operationId, 'running', {
                        progress: 80,
                        message: 'Analyzing differences'
                    });
                }

                // Persist the execution time on the result for reporting consumers
                if (comparisonResult) {
                    comparisonResult.executionTime = comparisonResult.executionTime || execTime;
                    comparisonResult.createdAt = comparisonResult.createdAt || new Date();
                }

                progress.report({ increment: 20, message: 'Preparing report...' });
                if (operationId) {
                    statusProvider?.updateOperation(operationId, 'running', {
                        progress: 95,
                        message: 'Preparing report'
                    });
                }
            });

            if (!comparisonResult) {
                throw new Error('Comparison did not return any result');
            }

            if (operationId) {
                statusProvider?.updateOperation(operationId, 'completed', {
                    progress: 100,
                    message: 'Schema comparison completed'
                });
            }

            let recordedEntryId: string | undefined;
            if (reportingService) {
                const recordedEntry = await reportingService.recordComparison(comparisonResult, {
                    sourceConnectionId: sourceConnection.id,
                    targetConnectionId: targetConnection.id,
                    sourceName: sourceConnection.name,
                    targetName: targetConnection.name
                });
                recordedEntryId = recordedEntry.id;
            }

            const differenceCount = comparisonResult.differences?.length || 0;
            const detailMessage = differenceCount === 0
                ? 'No drift detected between the selected environments.'
                : `${differenceCount} difference${differenceCount === 1 ? ' was' : 's were'} detected.`;

            notificationManager?.showInformation(
                'Schema comparison completed',
                detailMessage,
                'schema-comparison',
                {
                    actions: recordedEntryId ? [
                        {
                            id: 'view-report',
                            label: 'View Drift Report',
                            primary: true,
                            action: () => {
                                void vscode.commands.executeCommand('postgresql.showSchemaDriftReport', recordedEntryId);
                            }
                        }
                    ] : undefined,
                    category: 'Schema Drift'
                }
            );

            const openReport = 'View drift report';
            const userChoice = await vscode.window.showInformationMessage(
                `Schema comparison finished. ${detailMessage}`,
                openReport
            );

            if (userChoice === openReport && driftReportView) {
                await driftReportView.showReport(recordedEntryId);
            }
        } catch (error) {
            Logger.error('Failed to compare schemas', error as Error);
            vscode.window.showErrorMessage(`Failed to compare schemas: ${(error as Error).message}`);
        } finally {
            if (statusProvider && operationId) {
                statusProvider.completeOperation(operationId);
            }
        }
    }
    private async handleGenerateMigration(comparison?: any): Promise<void> {
        try {
            if (!comparison) {
                vscode.window.showErrorMessage('Schema comparison data is required for migration generation');
                return;
            }

            if (this.components.migrationPreviewView) {
                // Generate migration script from comparison data with real-time validation
                const enhancedScript = await this.migrationManager.generateEnhancedMigrationScript(
                    comparison.sourceConnectionId,
                    comparison.targetConnectionId,
                    comparison.differences || []
                );

                // Convert EnhancedMigrationScript to DotNetMigrationScript for compatibility
                const migrationScript = {
                    id: enhancedScript.id,
                    sqlScript: enhancedScript.migrationSteps.map(step => step.sqlScript).join(';\n'),
                    rollbackScript: enhancedScript.rollbackScript.steps.map(step => step.description).join(';\n') || undefined,
                    description: enhancedScript.description,
                    createdAt: enhancedScript.generatedAt.toISOString()
                };

                await this.components.migrationPreviewView.showPreview(migrationScript);
                Logger.info('Migration script generated and preview shown with real-time validation', 'CommandManager');
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
                // Show migration preview with real-time validation
                await this.components.migrationPreviewView.showPreview(migration);
                Logger.info('Migration preview displayed with real-time validation', 'CommandManager');
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
                // Show detailed object information with real-time metadata
                const objectDetails = await this.schemaOperations.getObjectDetails(
                    databaseObject.connectionId,
                    databaseObject.type,
                    databaseObject.schema,
                    databaseObject.name
                );
                await this.components.schemaBrowserView.showSchemaBrowser(databaseObject.connectionId, databaseObject.schema);
                Logger.info('Object details displayed with real-time metadata', 'CommandManager', { object: databaseObject.name });
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

        Logger.info('Command Statistics Report displayed', 'CommandManager', {
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
            Logger.warn('No active SQL file to execute', 'CommandManager');
            vscode.window.showErrorMessage('No active SQL file to execute');
            return;
        }

        const document = activeEditor.document;
        if (document.languageId !== 'sql' && document.languageId !== 'postgresql') {
            Logger.warn('Current file is not a SQL file', 'CommandManager', { languageId: document.languageId });
            vscode.window.showErrorMessage('Current file is not a SQL file');
            return;
        }

        const sqlContent = document.getText().trim();
        if (!sqlContent) {
            Logger.warn('SQL file is empty', 'CommandManager');
            vscode.window.showErrorMessage('SQL file is empty');
            return;
        }

        if (!this.components.connectionManager) {
            Logger.warn('Connection manager not available', 'CommandManager');
            vscode.window.showErrorMessage('Connection manager not available');
            return;
        }

        const connections = this.components.connectionManager.getConnections();
        if (connections.length === 0) {
            Logger.warn('No database connections available', 'CommandManager');
            vscode.window.showErrorMessage('No database connections available. Please add a connection first.');
            return;
        }

        let targetConnection = connections[0];
        const detectedConnectionId = vscode.workspace.getConfiguration().get<string>('postgresql.detectedConnection');

        if (detectedConnectionId) {
            const detectedConnection = connections.find(c => c.id === detectedConnectionId);
            if (detectedConnection) {
                targetConnection = detectedConnection;
                Logger.info('Using detected connection for file execution', 'CommandManager', { connectionId: detectedConnectionId });
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

            if (!selected) {
                Logger.info('File execution cancelled - no connection selected', 'CommandManager');
                return;
            }
            targetConnection = selected.connection;
        }

        try {
            // Import and use SQL execution logic
            const { executeSQLContent } = await import('./SQLExecutionManager');
            await executeSQLContent(sqlContent, targetConnection.id, this.components);
            Logger.info('SQL file executed successfully', 'CommandManager', {
                fileName: document.fileName,
                connectionId: targetConnection.id,
                sqlLength: sqlContent.length
            });
        } catch (error) {
            Logger.error('Failed to execute SQL file', error as Error, 'CommandManager');
            vscode.window.showErrorMessage(`Failed to execute SQL file: ${(error as Error).message}`);
        }
    }
    private async formatCurrentSQLFile(): Promise<void> {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            Logger.warn('No active SQL file to format', 'CommandManager');
            vscode.window.showErrorMessage('No active SQL file to format');
            return;
        }

        const document = activeEditor.document;
        if (document.languageId !== 'sql' && document.languageId !== 'postgresql') {
            Logger.warn('Current file is not a SQL file', 'CommandManager', { languageId: document.languageId });
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

            const success = await vscode.workspace.applyEdit(edit);
            if (success) {
                Logger.info('SQL file formatted successfully', 'CommandManager', { fileName: document.fileName });
                vscode.window.showInformationMessage('SQL file formatted successfully');
            } else {
                Logger.warn('Failed to apply formatting edit', 'CommandManager');
                vscode.window.showWarningMessage('SQL formatting completed but changes could not be applied');
            }

        } catch (error) {
            Logger.error('Failed to format SQL file', error as Error, 'CommandManager');
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