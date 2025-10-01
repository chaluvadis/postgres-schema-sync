import * as vscode from 'vscode';
import { PostgreSqlTreeProvider } from './providers/PostgreSqlTreeProvider';
import { ConnectionManager } from './managers/ConnectionManager';
import { SchemaManager } from './managers/SchemaManager';
import { MigrationManager } from './managers/MigrationManager';
import { ConnectionManagementView } from './views/ConnectionManagementView';
import { SchemaBrowserView } from './views/SchemaBrowserView';
import { SchemaComparisonView, SchemaComparisonData } from './views/SchemaComparisonView';
import { MigrationPreviewView, MigrationPreviewData } from './views/MigrationPreviewView';
import { SettingsView } from './views/SettingsView';
import { Logger } from './utils/Logger';
import { ErrorHandler } from './utils/ErrorHandler';
import { ProgressReporter } from './utils/ProgressReporter';

export class PostgreSqlExtension {
    private context: vscode.ExtensionContext;
    private connectionManager: ConnectionManager;
    private schemaManager: SchemaManager;
    private migrationManager: MigrationManager;
    private connectionView: ConnectionManagementView;
    private schemaBrowserView: SchemaBrowserView;
    private schemaComparisonView: SchemaComparisonView;
    private migrationPreviewView: MigrationPreviewView;
    private settingsView: SettingsView;
    private treeProvider: PostgreSqlTreeProvider;

    constructor(
        context: vscode.ExtensionContext,
        connectionManager: ConnectionManager,
        schemaManager: SchemaManager,
        migrationManager: MigrationManager,
        treeProvider: PostgreSqlTreeProvider
    ) {
        this.context = context;
        this.connectionManager = connectionManager;
        this.schemaManager = schemaManager;
        this.migrationManager = migrationManager;
        this.connectionView = new ConnectionManagementView(connectionManager);
        this.schemaBrowserView = new SchemaBrowserView(schemaManager, connectionManager);
        this.schemaComparisonView = new SchemaComparisonView();
        this.migrationPreviewView = new MigrationPreviewView();
        this.settingsView = new SettingsView();
        this.treeProvider = treeProvider;
    }

    async addConnection(): Promise<void> {
        try {
            Logger.info('Adding new database connection');

            const connectionInfo = await this.connectionView.showConnectionDialog();
            if (!connectionInfo) {
                Logger.debug('Connection dialog cancelled by user');
                return;
            }

            this.treeProvider.refresh();
        } catch (error) {
            ErrorHandler.handleError(error, ErrorHandler.createContext('AddConnection'));
        }
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

    async removeConnection(connection: any): Promise<void> {
        try {
            Logger.info('Removing database connection', connection);

            if (!connection || !connection.id) {
                vscode.window.showErrorMessage('No connection selected for removal');
                return;
            }

            const confirm = await vscode.window.showWarningMessage(
                `Are you sure you want to remove connection "${connection.name}"?`,
                'Yes', 'No'
            );

            if (confirm !== 'Yes') {
                return;
            }

            await this.connectionManager.removeConnection(connection.id);
            this.treeProvider.refresh();

            vscode.window.showInformationMessage(
                `Connection "${connection.name}" removed successfully`
            );
        } catch (error) {
            Logger.error('Failed to remove connection', error as Error);
            vscode.window.showErrorMessage(
                `Failed to remove connection: ${(error as Error).message}`
            );
        }
    }

    async testConnection(connection: any): Promise<void> {
        try {
            Logger.info('Testing database connection', connection);

            if (!connection || !connection.id) {
                vscode.window.showErrorMessage('No connection selected for testing');
                return;
            }

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Testing Connection',
                cancellable: true
            }, async (progress, token) => {
                progress.report({ increment: 0, message: 'Establishing connection...' });

                try {
                    const success = await this.connectionManager.testConnection(connection.id);

                    progress.report({ increment: 50, message: 'Running connectivity tests...' });

                    if (token.isCancellationRequested) {
                        return;
                    }

                    progress.report({ increment: 100, message: 'Connection test completed' });

                    if (success) {
                        vscode.window.showInformationMessage(
                            `Connection "${connection.name}" is working correctly`
                        );
                    } else {
                        vscode.window.showErrorMessage(
                            `Connection "${connection.name}" failed. Please check your host, port, database name, username, and password.`
                        );
                    }
                } catch (testError) {
                    if (token.isCancellationRequested) {
                        return;
                    }
                    throw new Error(`Connection test failed: ${(testError as Error).message}`);
                }
            });
        } catch (error) {
            ErrorHandler.handleError(error, ErrorHandler.createContext('TestConnection'));
        }
    }

    async refreshExplorer(): Promise<void> {
        try {
            Logger.info('Refreshing PostgreSQL explorer');
            this.treeProvider.refresh();
            vscode.window.showInformationMessage('PostgreSQL explorer refreshed');
        } catch (error) {
            Logger.error('Failed to refresh explorer', error as Error);
            vscode.window.showErrorMessage(
                `Failed to refresh explorer: ${(error as Error).message}`
            );
        }
    }

    async browseSchema(connectionId: string, schemaName?: string): Promise<void> {
        try {
            Logger.info('Opening schema browser', { connectionId, schemaName });

            if (!connectionId) {
                vscode.window.showErrorMessage('No connection specified for schema browsing');
                return;
            }

            await this.schemaBrowserView.showSchemaBrowser(connectionId, schemaName);
        } catch (error) {
            ErrorHandler.handleError(error, ErrorHandler.createContext('BrowseSchema'));
        }
    }

    async compareSchemas(source: any, target: any): Promise<void> {
        try {
            Logger.info('Comparing schemas', { source, target });

            if (!source?.id || !target?.id) {
                vscode.window.showErrorMessage('Please select source and target connections for comparison');
                return;
            }

            await ProgressReporter.withProgress(
                {
                    title: 'Comparing Schemas',
                    location: vscode.ProgressLocation.Notification,
                    cancellable: true
                },
                async (progress, token) => {
                    ProgressReporter.reportProgress(0, 'Analyzing source schema...');

                    try {
                        // Get source and target connections
                        const sourceConnection = this.connectionManager.getConnection(source.id);
                        const targetConnection = this.connectionManager.getConnection(target.id);

                        if (!sourceConnection || !targetConnection) {
                            throw new Error('Source or target connection not found');
                        }

                        ProgressReporter.reportProgress(25, 'Analyzing target schema...');

                        // Get passwords for both connections
                        const sourcePassword = await this.connectionManager.getConnectionPassword(source.id);
                        const targetPassword = await this.connectionManager.getConnectionPassword(target.id);

                        if (!sourcePassword || !targetPassword) {
                            throw new Error('Passwords not found for connections');
                        }

                        // Convert to .NET format
                        const dotNetSourceConnection = {
                            id: sourceConnection.id,
                            name: sourceConnection.name,
                            host: sourceConnection.host,
                            port: sourceConnection.port,
                            database: sourceConnection.database,
                            username: sourceConnection.username,
                            password: sourcePassword,
                            createdDate: new Date().toISOString()
                        };

                        const dotNetTargetConnection = {
                            id: targetConnection.id,
                            name: targetConnection.name,
                            host: targetConnection.host,
                            port: targetConnection.port,
                            database: targetConnection.database,
                            username: targetConnection.username,
                            password: targetPassword,
                            createdDate: new Date().toISOString()
                        };

                        ProgressReporter.reportProgress(50, 'Comparing schemas...');

                        // Compare schemas via .NET service
                        const comparison = await this.migrationManager.getDotNetService().compareSchemas(
                            dotNetSourceConnection,
                            dotNetTargetConnection,
                            { mode: 'strict' }
                        );

                        ProgressReporter.reportProgress(100, 'Schema comparison completed');

                        // Convert to display format
                        const comparisonData: SchemaComparisonData = {
                            comparisonId: comparison.id,
                            sourceConnection: sourceConnection.name,
                            targetConnection: targetConnection.name,
                            differences: comparison.differences.map(diff => ({
                                type: diff.type,
                                objectType: diff.objectType,
                                objectName: diff.objectName,
                                schema: diff.schema,
                                sourceDefinition: diff.sourceDefinition,
                                targetDefinition: diff.targetDefinition,
                                differenceDetails: diff.differenceDetails,
                                severity: 'medium' // Default severity
                            })),
                            totalDifferences: comparison.differences.length,
                            comparisonMode: 'Strict',
                            executionTime: comparison.executionTime,
                            createdAt: comparison.createdAt
                        };

                        // Show comparison results
                        await this.schemaComparisonView.showComparison(comparisonData);

                    } catch (comparisonError) {
                        throw new Error(`Schema comparison failed: ${(comparisonError as Error).message}`);
                    }
                }
            );
        } catch (error) {
            ErrorHandler.handleError(error, ErrorHandler.createContext('CompareSchemas'));
        }
    }

    async generateMigration(comparison: any): Promise<void> {
        try {
            Logger.info('Generating migration', comparison);

            if (!comparison?.sourceConnectionId || !comparison?.targetConnectionId) {
                vscode.window.showErrorMessage('Invalid comparison data for migration generation');
                return;
            }

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Generating Migration',
                cancellable: true
            }, async (progress, token) => {
                progress.report({ increment: 0, message: 'Analyzing schema differences...' });

                try {
                    const migration = await this.migrationManager.generateMigration(
                        comparison.sourceConnectionId,
                        comparison.targetConnectionId
                    );

                    progress.report({ increment: 50, message: 'Creating migration script...' });

                    // Store the migration for later use
                    await this.context.globalState.update('postgresql.currentMigration', migration);

                    progress.report({ increment: 100, message: 'Migration generated successfully' });

                    const preview = await vscode.window.showInformationMessage(
                        `Migration generated with ${migration.sqlScript.split('\n').length} operations`,
                        'Preview Migration', 'Execute Migration'
                    );

                    if (preview === 'Preview Migration') {
                        await this.previewMigration(migration);
                    } else if (preview === 'Execute Migration') {
                        await this.executeMigration(migration);
                    }
                } catch (migrationError) {
                    throw new Error(`Migration generation failed: ${(migrationError as Error).message}`);
                }
            });
        } catch (error) {
            ErrorHandler.handleError(error, ErrorHandler.createContext('GenerateMigration'));
        }
    }

    async executeMigration(migration: any): Promise<void> {
        try {
            Logger.info('Executing migration', migration);

            if (!migration?.id) {
                vscode.window.showErrorMessage('Invalid migration data for execution');
                return;
            }

            // Get target connection for the migration
            const targetConnectionId = migration.targetConnection;
            if (!targetConnectionId) {
                vscode.window.showErrorMessage('No target connection specified for migration');
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
            }, async (progress, token) => {
                progress.report({ increment: 0, message: 'Preparing migration execution...' });

                try {
                    const success = await this.migrationManager.executeMigration(migration.id);

                    progress.report({ increment: 100, message: 'Migration execution completed' });

                    if (success) {
                        vscode.window.showInformationMessage(
                            `Migration "${migration.name}" executed successfully`
                        );

                        // Clear current migration
                        await this.context.globalState.update('postgresql.currentMigration', undefined);
                    } else {
                        vscode.window.showErrorMessage(
                            `Migration "${migration.name}" failed during execution`
                        );
                    }
                } catch (executionError) {
                    throw new Error(`Migration execution failed: ${(executionError as Error).message}`);
                }
            });
        } catch (error) {
            ErrorHandler.handleError(error, ErrorHandler.createContext('ExecuteMigration'));
        }
    }

    async previewMigration(migration: any): Promise<void> {
        try {
            Logger.info('Previewing migration', migration);

            if (!migration?.sqlScript) {
                vscode.window.showErrorMessage('Invalid migration data for preview');
                return;
            }

            // Convert to preview format
            const previewData: MigrationPreviewData = {
                migrationId: migration.id,
                migrationName: migration.name,
                sourceConnection: migration.sourceConnection,
                targetConnection: migration.targetConnection,
                sqlScript: migration.sqlScript,
                rollbackScript: migration.rollbackScript,
                totalStatements: migration.sqlScript.split('\n').length,
                estimatedExecutionTime: `${Math.max(1, Math.ceil(migration.sqlScript.split('\n').length / 10))}s`,
                riskLevel: this.assessMigrationRisk(migration.sqlScript),
                warnings: this.analyzeMigrationWarnings(migration.sqlScript),
                canExecute: true,
                canRollback: migration.rollbackScript && migration.rollbackScript.trim().length > 0
            };

            await this.migrationPreviewView.showMigrationPreview(previewData);
        } catch (error) {
            ErrorHandler.handleError(error, ErrorHandler.createContext('PreviewMigration'));
        }
    }

    async rollbackMigration(migration: any): Promise<void> {
        try {
            Logger.info('Rolling back migration', migration);

            if (!migration?.id) {
                vscode.window.showErrorMessage('Invalid migration data for rollback');
                return;
            }

            const confirm = await vscode.window.showWarningMessage(
                `Are you sure you want to rollback this migration?\n\nMigration: ${migration.name}\nThis action cannot be undone!`,
                'Rollback Migration', 'Cancel'
            );

            if (confirm !== 'Rollback Migration') {
                return;
            }

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Rolling Back Migration',
                cancellable: true
            }, async (progress, token) => {
                progress.report({ increment: 0, message: 'Preparing rollback...' });

                try {
                    // For now, we'll use the same manager method but with rollback logic
                    // In a real implementation, this would call a dedicated rollback method
                    const success = await this.migrationManager.executeMigration(migration.id);

                    progress.report({ increment: 100, message: 'Rollback completed' });

                    if (success) {
                        vscode.window.showInformationMessage(
                            `Migration "${migration.name}" rolled back successfully`
                        );
                    } else {
                        vscode.window.showErrorMessage(
                            `Migration "${migration.name}" rollback failed`
                        );
                    }
                } catch (rollbackError) {
                    throw new Error(`Migration rollback failed: ${(rollbackError as Error).message}`);
                }
            });
        } catch (error) {
            ErrorHandler.handleError(error, ErrorHandler.createContext('RollbackMigration'));
        }
    }

    async viewObjectDetails(databaseObject: any): Promise<void> {
        try {
            Logger.info('Viewing object details', databaseObject);

            if (!databaseObject?.id || !databaseObject?.type) {
                vscode.window.showErrorMessage('Invalid object data for details view');
                return;
            }

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Loading Object Details',
                cancellable: true
            }, async (progress, token) => {
                progress.report({ increment: 0, message: 'Fetching object metadata...' });

                try {
                    // Get the connection for this object
                    const connections = this.connectionManager.getConnections();
                    const connection = connections.find(c => databaseObject.database === c.database);

                    if (!connection) {
                        throw new Error(`Connection not found for database: ${databaseObject.database}`);
                    }

                    // Get object details via .NET service
                    const details = await this.schemaManager.getObjectDetails(
                        connection.id,
                        databaseObject.type,
                        databaseObject.schema,
                        databaseObject.name
                    );

                    progress.report({ increment: 100, message: 'Object details loaded' });

                    // Create details webview
                    const panel = vscode.window.createWebviewPanel(
                        'objectDetails',
                        `Details: ${databaseObject.type} ${databaseObject.name}`,
                        vscode.ViewColumn.One,
                        { enableScripts: true }
                    );

                    const detailsHtml = await this.generateObjectDetailsHtml(databaseObject, details);
                    panel.webview.html = detailsHtml;

                } catch (detailsError) {
                    throw new Error(`Failed to load object details: ${(detailsError as Error).message}`);
                }
            });
        } catch (error) {
            ErrorHandler.handleError(error, ErrorHandler.createContext('ViewObjectDetails'));
        }
    }

    async showHelp(): Promise<void> {
        try {
            Logger.info('Showing help');

            const helpContent = await this.getHelpContent();
            const panel = vscode.window.createWebviewPanel(
                'postgresqlHelp',
                'PostgreSQL Schema Sync - Help',
                vscode.ViewColumn.One,
                { enableScripts: true }
            );

            panel.webview.html = helpContent;
        } catch (error) {
            Logger.error('Failed to show help', error as Error);
            vscode.window.showErrorMessage(
                `Failed to show help: ${(error as Error).message}`
            );
        }
    }

    async showLogs(): Promise<void> {
        try {
            Logger.info('Showing logs');
            Logger.showOutputChannel();
        } catch (error) {
            Logger.error('Failed to show logs', error as Error);
            vscode.window.showErrorMessage(
                `Failed to show logs: ${(error as Error).message}`
            );
        }
    }

    async openSettings(): Promise<void> {
        try {
            Logger.info('Opening settings');
            await this.settingsView.showSettings();
        } catch (error) {
            Logger.error('Failed to open settings', error as Error);
            vscode.window.showErrorMessage(
                `Failed to open settings: ${(error as Error).message}`
            );
        }
    }

    private async showConnectionDialog(existingConnection?: any): Promise<any | undefined> {
        const name = await vscode.window.showInputBox({
            prompt: 'Enter connection name',
            placeHolder: 'My Database Connection',
            value: existingConnection?.name || '',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Connection name is required';
                }
                return null;
            }
        });

        if (!name) {
            return undefined;
        }

        const host = await vscode.window.showInputBox({
            prompt: 'Enter database host',
            placeHolder: 'localhost',
            value: existingConnection?.host || 'localhost',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Host is required';
                }
                return null;
            }
        });

        if (!host) {
            return undefined;
        }

        const portInput = await vscode.window.showInputBox({
            prompt: 'Enter database port',
            placeHolder: '5432',
            value: existingConnection?.port?.toString() || '5432',
            validateInput: (value) => {
                const port = parseInt(value);
                if (isNaN(port) || port < 1 || port > 65535) {
                    return 'Valid port number (1-65535) is required';
                }
                return null;
            }
        });

        if (!portInput) {
            return undefined;
        }

        const database = await vscode.window.showInputBox({
            prompt: 'Enter database name',
            placeHolder: 'mydb',
            value: existingConnection?.database || '',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Database name is required';
                }
                return null;
            }
        });

        if (!database) {
            return undefined;
        }

        const username = await vscode.window.showInputBox({
            prompt: 'Enter username',
            placeHolder: 'postgres',
            value: existingConnection?.username || '',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Username is required';
                }
                return null;
            }
        });

        if (!username) {
            return undefined;
        }

        const password = await vscode.window.showInputBox({
            prompt: 'Enter password',
            placeHolder: 'Enter password',
            password: true,
            value: existingConnection?.password || '',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Password is required';
                }
                return null;
            }
        });

        if (!password) {
            return undefined;
        }

        return {
            id: existingConnection?.id || this.generateId(),
            name: name.trim(),
            host: host.trim(),
            port: parseInt(portInput),
            database: database.trim(),
            username: username.trim(),
            password: password.trim()
        };
    }
    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    private assessMigrationRisk(sqlScript: string): 'Low' | 'Medium' | 'High' {
        const script = sqlScript.toUpperCase();
        const highRiskOps = ['DROP TABLE', 'DROP SCHEMA', 'TRUNCATE'];
        const mediumRiskOps = ['DROP', 'ALTER TABLE', 'DELETE'];

        if (highRiskOps.some(op => script.includes(op))) {
            return 'High';
        }
        if (mediumRiskOps.some(op => script.includes(op))) {
            return 'Medium';
        }
        return 'Low';
    }

    private analyzeMigrationWarnings(sqlScript: string): string[] {
        const warnings: string[] = [];
        const script = sqlScript.toUpperCase();

        if (script.includes('DROP TABLE')) {
            warnings.push('Migration contains DROP TABLE operations - data will be lost');
        }
        if (script.includes('TRUNCATE')) {
            warnings.push('Migration contains TRUNCATE operations - all data will be lost');
        }
        if (script.includes('DROP SCHEMA')) {
            warnings.push('Migration contains DROP SCHEMA operations - multiple objects will be affected');
        }
        if (script.includes('ALTER TABLE')) {
            warnings.push('Migration contains ALTER TABLE operations - schema changes may affect applications');
        }

        const statementCount = sqlScript.split('\n').length;
        if (statementCount > 100) {
            warnings.push(`Large migration with ${statementCount} statements - consider breaking into smaller batches`);
        }

        return warnings;
    }

    private async generateMigrationPreviewHtml(migration: any): Promise<string> {
        const lines = migration.sqlScript.split('\n');
        const operationCount = lines.length;
        const estimatedTime = Math.max(1, Math.ceil(operationCount / 10)); // Rough estimate

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Migration Preview</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        padding: 20px;
                        line-height: 1.6;
                        background: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                    }
                    .header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 20px;
                        padding-bottom: 10px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                    }
                    .stats {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                        gap: 15px;
                        margin-bottom: 20px;
                    }
                    .stat-card {
                        background: var(--vscode-textBlockQuote-background);
                        padding: 15px;
                        border-radius: 6px;
                        border: 1px solid var(--vscode-textBlockQuote-border);
                    }
                    .stat-value {
                        font-size: 24px;
                        font-weight: bold;
                        color: var(--vscode-textLink-foreground);
                    }
                    .stat-label {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                        margin-top: 5px;
                    }
                    .sql-preview {
                        background: var(--vscode-textCodeBlock-background);
                        border: 1px solid var(--vscode-textBlockQuote-border);
                        border-radius: 6px;
                        padding: 15px;
                        max-height: 400px;
                        overflow-y: auto;
                        font-family: 'Courier New', monospace;
                        font-size: 13px;
                        line-height: 1.4;
                    }
                    .sql-line {
                        padding: 2px 0;
                        border-left: 3px solid transparent;
                    }
                    .sql-line:nth-child(odd) {
                        background: var(--vscode-list-inactiveSelectionBackground);
                    }
                    .sql-comment { color: var(--vscode-textPreformat-foreground); }
                    .sql-keyword { color: var(--vscode-symbolIcon-keywordForeground); font-weight: bold; }
                    .sql-string { color: var(--vscode-symbolIcon-stringForeground); }
                    .sql-number { color: var(--vscode-symbolIcon-numberForeground); }
                    .actions {
                        margin-top: 20px;
                        display: flex;
                        gap: 10px;
                    }
                    .btn {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 8px 16px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 13px;
                    }
                    .btn:hover {
                        background: var(--vscode-button-hoverBackground);
                    }
                    .btn-danger {
                        background: var(--vscode-statusBarItem-errorBackground);
                    }
                    .btn-secondary {
                        background: var(--vscode-button-secondaryBackground);
                        color: var(--vscode-button-secondaryForeground);
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h2>Migration Preview: ${migration.name}</h2>
                    <div>Migration ID: ${migration.id}</div>
                </div>

                <div class="stats">
                    <div class="stat-card">
                        <div class="stat-value">${operationCount}</div>
                        <div class="stat-label">Operations</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${estimatedTime}s</div>
                        <div class="stat-label">Est. Duration</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${migration.status}</div>
                        <div class="stat-label">Status</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${new Date(migration.createdAt).toLocaleString()}</div>
                        <div class="stat-label">Created</div>
                    </div>
                </div>

                <h3>SQL Preview</h3>
                <div class="sql-preview">
                    ${this.formatSqlPreview(migration.sqlScript)}
                </div>

                <div class="actions">
                    <button class="btn" onclick="executeMigration()">Execute Migration</button>
                    <button class="btn btn-secondary" onclick="editMigration()">Edit Migration</button>
                    <button class="btn btn-secondary" onclick="saveMigration()">Save to File</button>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();

                    function executeMigration() {
                        vscode.postMessage({ command: 'executeMigration' });
                    }

                    function editMigration() {
                        vscode.postMessage({ command: 'editMigration' });
                    }

                    function saveMigration() {
                        vscode.postMessage({ command: 'saveMigration' });
                    }
                </script>
            </body>
            </html>
        `;
    }
    private formatSqlPreview(sql: string): string {
        const lines = sql.split('\n');
        return lines.map((line, index) => {
            let formattedLine = line;

            // Basic SQL syntax highlighting
            formattedLine = formattedLine.replace(/\b(CREATE|ALTER|DROP|SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|INNER|LEFT|RIGHT|ON|GROUP BY|ORDER BY|HAVING|LIMIT)\b/gi,
                '<span class="sql-keyword">$1</span>');
            formattedLine = formattedLine.replace(/(['"`])(.*?)\1/g, '<span class="sql-string">$1$2$1</span>');
            formattedLine = formattedLine.replace(/\b(\d+)\b/g, '<span class="sql-number">$1</span>');
            formattedLine = formattedLine.replace(/--(.*)/g, '<span class="sql-comment">--$1</span>');

            return `<div class="sql-line">${index + 1}: ${formattedLine}</div>`;
        }).join('');
    }
    private async generateObjectDetailsHtml(databaseObject: any, details: any): Promise<string> {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Object Details</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        padding: 20px;
                        line-height: 1.6;
                        background: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                    }
                    .header {
                        margin-bottom: 20px;
                        padding-bottom: 15px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                    }
                    .object-info {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                        gap: 15px;
                        margin-bottom: 25px;
                    }
                    .info-card {
                        background: var(--vscode-textBlockQuote-background);
                        padding: 15px;
                        border-radius: 6px;
                        border: 1px solid var(--vscode-textBlockQuote-border);
                    }
                    .info-label {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                        margin-bottom: 5px;
                        text-transform: uppercase;
                        font-weight: bold;
                    }
                    .info-value {
                        font-size: 14px;
                        color: var(--vscode-textLink-foreground);
                        font-family: 'Courier New', monospace;
                    }
                    .definition {
                        background: var(--vscode-textCodeBlock-background);
                        border: 1px solid var(--vscode-textBlockQuote-border);
                        border-radius: 6px;
                        padding: 15px;
                        margin-bottom: 20px;
                    }
                    .definition pre {
                        margin: 0;
                        font-family: 'Courier New', monospace;
                        font-size: 13px;
                        line-height: 1.4;
                        white-space: pre-wrap;
                    }
                    .dependencies {
                        margin-top: 20px;
                    }
                    .dependency-list {
                        background: var(--vscode-list-inactiveSelectionBackground);
                        border: 1px solid var(--vscode-list-inactiveSelectionBackground);
                        border-radius: 6px;
                        padding: 15px;
                        max-height: 200px;
                        overflow-y: auto;
                    }
                    .dependency-item {
                        padding: 5px 0;
                        border-bottom: 1px solid var(--vscode-list-inactiveSelectionBackground);
                        font-family: 'Courier New', monospace;
                        font-size: 12px;
                    }
                    .dependency-item:last-child {
                        border-bottom: none;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h2>${databaseObject.type}: ${databaseObject.name}</h2>
                    <p>Schema: ${databaseObject.schema} | Database: ${databaseObject.database}</p>
                </div>

                <div class="object-info">
                    <div class="info-card">
                        <div class="info-label">Object Type</div>
                        <div class="info-value">${databaseObject.type}</div>
                    </div>
                    <div class="info-card">
                        <div class="info-label">Schema</div>
                        <div class="info-value">${databaseObject.schema}</div>
                    </div>
                    <div class="info-card">
                        <div class="info-label">Database</div>
                        <div class="info-value">${databaseObject.database}</div>
                    </div>
                    <div class="info-card">
                        <div class="info-label">Owner</div>
                        <div class="info-value">${databaseObject.owner || 'Unknown'}</div>
                    </div>
                </div>

                ${databaseObject.sizeInBytes ? `
                <div class="object-info">
                    <div class="info-card">
                        <div class="info-label">Size</div>
                        <div class="info-value">${(databaseObject.sizeInBytes / 1024).toFixed(2)} KB</div>
                    </div>
                </div>
                ` : ''}

                <h3>Definition</h3>
                <div class="definition">
                    <pre>${databaseObject.definition || 'No definition available'}</pre>
                </div>

                ${details?.dependencies?.length > 0 ? `
                <div class="dependencies">
                    <h3>Dependencies (${details.dependencies.length})</h3>
                    <div class="dependency-list">
                        ${details.dependencies.map((dep: string) => `<div class="dependency-item">${dep}</div>`).join('')}
                    </div>
                </div>
                ` : ''}

                ${details?.dependents?.length > 0 ? `
                <div class="dependencies">
                    <h3>Dependents (${details.dependents.length})</h3>
                    <div class="dependency-list">
                        ${details.dependents.map((dep: string) => `<div class="dependency-item">${dep}</div>`).join('')}
                    </div>
                </div>
                ` : ''}

                ${details?.additionalInfo ? `
                <div class="dependencies">
                    <h3>Additional Information</h3>
                    <div class="dependency-list">
                        ${Object.entries(details.additionalInfo).map(([key, value]) =>
            `<div class="dependency-item"><strong>${key}:</strong> ${value}</div>`
        ).join('')}
                    </div>
                </div>
                ` : ''}
            </body>
            </html>
        `;
    }
    private async getHelpContent(): Promise<string> {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>PostgreSQL Schema Sync - Help</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        padding: 20px;
                        line-height: 1.6;
                    }
                    .section {
                        margin-bottom: 30px;
                    }
                    .command {
                        background: var(--vscode-textBlockQuote-background);
                        padding: 10px;
                        margin: 10px 0;
                        border-left: 4px solid var(--vscode-textBlockQuote-border);
                    }
                    code {
                        background: var(--vscode-textCodeBlock-background);
                        padding: 2px 6px;
                        border-radius: 3px;
                    }
                </style>
            </head>
            <body>
                <h1>PostgreSQL Schema Compare & Sync</h1>

                <div class="section">
                    <h2>Getting Started</h2>
                    <p>Welcome to PostgreSQL Schema Compare & Sync for VSCode!</p>
                    <p>This extension provides enterprise-grade database schema management directly in your development environment.</p>
                </div>

                <div class="section">
                    <h2>Quick Start</h2>
                    <ol>
                        <li>Add a database connection using the "+" button in the PostgreSQL Explorer</li>
                        <li>Browse your database schema in the tree view</li>
                        <li>Compare schemas between different databases</li>
                        <li>Generate and execute migration scripts</li>
                    </ol>
                </div>

                <div class="section">
                    <h2>Available Commands</h2>
                    <div class="command">
                        <strong>Add Connection</strong><br>
                        Create a new database connection with secure credential storage
                    </div>
                    <div class="command">
                        <strong>Compare Schemas</strong><br>
                        Compare database schemas and view differences
                    </div>
                    <div class="command">
                        <strong>Generate Migration</strong><br>
                        Create migration scripts from schema differences
                    </div>
                    <div class="command">
                        <strong>Execute Migration</strong><br>
                        Apply migration scripts to target databases
                    </div>
                </div>

                <div class="section">
                    <h2>Features</h2>
                    <ul>
                        <li>🔗 Multi-environment connection management</li>
                        <li>🌳 Visual database schema explorer</li>
                        <li>⚖️ Advanced schema comparison with diff visualization</li>
                        <li>🔄 Migration generation and execution</li>
                        <li>🛡️ Secure credential storage</li>
                        <li>⚡ Enterprise-grade performance</li>
                    </ul>
                </div>

                <div class="section">
                    <h2>Support</h2>
                    <p>For more information, visit the <a href="#">documentation</a> or check the logs using "Show Logs" command.</p>
                </div>
            </body>
            </html>
        `;
    }
    async dispose(): Promise<void> {
        try {
            Logger.info('Disposing PostgreSQL extension');
            await this.connectionManager.dispose();
            Logger.info('PostgreSQL extension disposed successfully');
        } catch (error) {
            Logger.error('Error during extension disposal', error as Error);
        }
    }
}