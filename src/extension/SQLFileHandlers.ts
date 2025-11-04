import * as vscode from 'vscode';
import { ExtensionComponents } from '@/utils/ExtensionInitializer';
import { Logger } from '@/utils/Logger';
import { DatabaseConnection } from '@/managers/ConnectionManager';
import { CommandErrorHandler } from './CommandErrorHandler';

interface ConnectionItem {
    label: string;
    detail: string;
    connection: DatabaseConnection;
}

/**
 * Handles SQL file-related commands for the PostgreSQL extension.
 * Manages execution and formatting of SQL files with proper validation and error handling.
 */
export class SQLFileHandlers {
    private components: ExtensionComponents;
    private errorHandler: CommandErrorHandler;

    constructor(components: ExtensionComponents, errorHandler: CommandErrorHandler) {
        this.components = components;
        this.errorHandler = errorHandler;
    }

    /**
     * Executes the currently active SQL file.
     */
    async executeCurrentSQLFile(): Promise<void> {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            Logger.warn('No active SQL file to execute', 'SQLFileHandlers');
            vscode.window.showErrorMessage('No active SQL file to execute');
            return;
        }

        const document = activeEditor.document;
        if (document.languageId !== 'sql' && document.languageId !== 'postgresql') {
            Logger.warn('Current file is not a SQL file', 'SQLFileHandlers', { languageId: document.languageId });
            vscode.window.showErrorMessage('Current file is not a SQL file');
            return;
        }

        const sqlContent = document.getText().trim();
        if (!sqlContent) {
            Logger.warn('SQL file is empty', 'SQLFileHandlers');
            vscode.window.showErrorMessage('SQL file is empty');
            return;
        }

        // Basic input validation: limit SQL content length to prevent abuse
        const maxSqlLength = 1024 * 1024; // 1MB limit
        if (sqlContent.length > maxSqlLength) {
            Logger.warn('SQL file too large', 'SQLFileHandlers', { length: sqlContent.length });
            vscode.window.showErrorMessage('SQL file is too large (maximum 1MB allowed)');
            return;
        }

        // Basic SQL injection prevention: reject potentially dangerous patterns
        const dangerousPatterns = [
            /\bDROP\s+DATABASE\b/i,
            /\bTRUNCATE\s+TABLE\b/i,
            /\bDELETE\s+FROM\b.*\bWHERE\b.*=.*\*/i, // DELETE without WHERE or with dangerous WHERE
        ];

        for (const pattern of dangerousPatterns) {
            if (pattern.test(sqlContent)) {
                Logger.warn('Potentially dangerous SQL detected', 'SQLFileHandlers', { pattern: pattern.source });
                const proceed = await vscode.window.showWarningMessage(
                    'The SQL contains potentially dangerous operations. Proceed anyway?',
                    'Proceed', 'Cancel'
                );
                if (proceed !== 'Proceed') {
                    return;
                }
                break;
            }
        }

        if (!this.components.connectionManager) {
            Logger.warn('Connection manager not available', 'SQLFileHandlers');
            vscode.window.showErrorMessage('Connection manager not available');
            return;
        }

        const targetConnection = await this.selectConnection();
        if (!targetConnection) {return;}

        try {
            // Import and use SQL execution logic
            const { executeSQLContent } = await import('./SQLExecutionManager');
            await executeSQLContent(sqlContent, targetConnection.id, this.components);
            Logger.info('SQL file executed successfully', 'SQLFileHandlers', {
                fileName: document.fileName,
                connectionId: targetConnection.id,
                sqlLength: sqlContent.length
            });
        } catch (error) {
            Logger.error('Failed to execute SQL file', error as Error, 'SQLFileHandlers');
            vscode.window.showErrorMessage(`Failed to execute SQL file: ${(error as Error).message}`);
        }
    }

    /**
     * Formats the currently active SQL file.
     */
    async formatCurrentSQLFile(): Promise<void> {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            Logger.warn('No active SQL file to format', 'SQLFileHandlers');
            vscode.window.showErrorMessage('No active SQL file to format');
            return;
        }

        const document = activeEditor.document;
        if (document.languageId !== 'sql' && document.languageId !== 'postgresql') {
            Logger.warn('Current file is not a SQL file', 'SQLFileHandlers', { languageId: document.languageId });
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
                Logger.info('SQL file formatted successfully', 'SQLFileHandlers', { fileName: document.fileName });
                vscode.window.showInformationMessage('SQL file formatted successfully');
            } else {
                Logger.warn('Failed to apply formatting edit', 'SQLFileHandlers');
                vscode.window.showWarningMessage('SQL formatting completed but changes could not be applied');
            }

        } catch (error) {
            Logger.error('Failed to format SQL file', error as Error, 'SQLFileHandlers');
            vscode.window.showErrorMessage(`Failed to format SQL: ${(error as Error).message}`);
        }
    }

    /**
     * Selects a database connection from available connections.
     * @returns The selected connection or undefined if cancelled.
     */
    private async selectConnection(): Promise<DatabaseConnection | undefined> {
        const connections = this.components.connectionManager.getConnections();
        if (connections.length === 0) {
            vscode.window.showErrorMessage('No database connections available. Please add a connection first.');
            return undefined;
        }

        let selectedConnection = connections[0];
        const detectedConnectionId = vscode.workspace.getConfiguration().get<string>('postgresql.detectedConnection');

        if (detectedConnectionId) {
            const detectedConnection = connections.find(c => c.id === detectedConnectionId);
            if (detectedConnection) {
                selectedConnection = detectedConnection;
                Logger.info('Using detected connection', 'SQLFileHandlers', { connectionId: detectedConnectionId });
                return selectedConnection;
            }
        }

        if (connections.length > 1) {
            const connectionItems: ConnectionItem[] = connections.map((conn) => ({
                label: conn.name,
                detail: `${conn.host}:${conn.port}/${conn.database}`,
                connection: conn
            }));

            const selected = await vscode.window.showQuickPick(connectionItems, {
                placeHolder: 'Select a database connection'
            });

            if (!selected) {
                Logger.info('Connection selection cancelled', 'SQLFileHandlers');
                return undefined;
            }
            selectedConnection = selected.connection;
        }

        return selectedConnection;
    }
}