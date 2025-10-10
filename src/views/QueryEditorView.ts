import * as vscode from 'vscode';
import { QueryExecutionService, QueryResult } from '@/services/QueryExecutionService';
import { ConnectionManager } from '@/managers/ConnectionManager';
import { Logger } from '@/utils/Logger';
import { ErrorHandler } from '@/utils/ErrorHandler';

export class QueryEditorView {
    private queryExecutionService: QueryExecutionService;
    private connectionManager: ConnectionManager;
    private currentPanel: vscode.WebviewPanel | undefined;
    private currentQuery: string = '';
    private currentConnectionId: string | undefined;

    constructor(queryExecutionService: QueryExecutionService, connectionManager: ConnectionManager) {
        this.queryExecutionService = queryExecutionService;
        this.connectionManager = connectionManager;
    }

    async showQueryEditor(connectionId?: string): Promise<void> {
        try {
            Logger.info('Opening query editor', 'showQueryEditor', { connectionId });

            // Create webview panel
            this.currentPanel = vscode.window.createWebviewPanel(
                'queryEditor',
                'PostgreSQL Query Editor',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [
                        vscode.Uri.file(vscode.workspace.workspaceFolders?.[0]?.uri.path || '')
                    ]
                }
            );

            // Set initial connection
            if (connectionId) {
                this.currentConnectionId = connectionId;
            }

            // Handle panel disposal
            this.currentPanel.onDidDispose(() => {
                this.currentPanel = undefined;
                this.currentConnectionId = undefined;
                Logger.info('Query editor panel disposed');
            });

            // Handle messages from webview
            this.currentPanel.webview.onDidReceiveMessage(async (message) => {
                await this.handleWebviewMessage(message);
            });

            // Set initial HTML content
            this.currentPanel.webview.html = this.getWebviewContent();

            Logger.info('Query editor opened successfully');
        } catch (error) {
            Logger.error('Failed to open query editor', error as Error);
            ErrorHandler.handleError(error, ErrorHandler.createContext('ShowQueryEditor'));
        }
    }

    private async handleWebviewMessage(message: any): Promise<void> {
        try {
            switch (message.command) {
                case 'executeQuery':
                    await this.executeQueryFromWebview(message.query);
                    break;
                case 'setConnection':
                    this.currentConnectionId = message.connectionId;
                    break;
                case 'getConnections':
                    this.sendConnectionsToWebview();
                    break;
                case 'getQueryHistory':
                    this.sendQueryHistoryToWebview();
                    break;
                case 'loadQuery':
                    this.loadQueryFromHistory(message.queryId);
                    break;
                default:
                    Logger.warn('Unknown webview message command', 'handleWebviewMessage', { command: message.command });
            }
        } catch (error) {
            Logger.error('Error handling webview message', error as Error);
            ErrorHandler.handleError(error, ErrorHandler.createContext('HandleWebviewMessage'));
        }
    }

    private async executeQueryFromWebview(query: string): Promise<void> {
        if (!this.currentConnectionId) {
            vscode.window.showErrorMessage('No connection selected. Please select a connection first.');
            return;
        }

        if (!query?.trim()) {
            vscode.window.showErrorMessage('Query cannot be empty.');
            return;
        }

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Executing Query',
                cancellable: true
            }, async (progress, token) => {
                progress.report({ increment: 0, message: 'Executing query...' });

                const result = await this.queryExecutionService.executeQuery(
                    query,
                    this.currentConnectionId!,
                    {
                        maxRows: 1000,
                        timeout: 30000,
                        includeExecutionPlan: true
                    }
                );

                progress.report({ increment: 100, message: 'Query executed successfully' });

                // Send results back to webview
                if (this.currentPanel) {
                    this.currentPanel.webview.postMessage({
                        command: 'queryResult',
                        result: result
                    });
                }

                // Show results in a separate panel if result set is large
                if (result.rowCount > 100) {
                    this.showQueryResults(result);
                }
            });
        } catch (error) {
            Logger.error('Query execution failed', error as Error);

            const errorMessage = (error as Error).message;
            vscode.window.showErrorMessage(`Query execution failed: ${errorMessage}`);

            // Send error to webview
            if (this.currentPanel) {
                this.currentPanel.webview.postMessage({
                    command: 'queryError',
                    error: errorMessage
                });
            }
        }
    }

    private showQueryResults(result: QueryResult): void {
        // Create a new webview panel for results
        const resultsPanel = vscode.window.createWebviewPanel(
            'queryResults',
            `Query Results (${result.rowCount} rows)`,
            vscode.ViewColumn.Beside,
            { enableScripts: true }
        );

        resultsPanel.webview.html = this.getResultsWebviewContent(result);
    }

    private sendConnectionsToWebview(): void {
        if (!this.currentPanel) return;

        const connections = this.connectionManager.getConnections();
        this.currentPanel.webview.postMessage({
            command: 'connectionsList',
            connections: connections.map(conn => ({
                id: conn.id,
                name: conn.name,
                database: conn.database,
                host: conn.host,
                port: conn.port
            }))
        });
    }

    private sendQueryHistoryToWebview(): void {
        if (!this.currentPanel) return;

        const history = this.queryExecutionService.getQueryHistory(50);
        this.currentPanel.webview.postMessage({
            command: 'queryHistory',
            history: history.map(h => ({
                id: h.id,
                query: h.query,
                timestamp: h.timestamp.toISOString(),
                executionTime: h.executionTime,
                rowCount: h.rowCount
            }))
        });
    }

    private loadQueryFromHistory(queryId: string): void {
        // This would need to be implemented to retrieve specific query from history
        Logger.info('Loading query from history', 'loadQueryFromHistory', { queryId });
    }

    private getWebviewContent(): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>PostgreSQL Query Editor</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        margin: 0;
                        padding: 0;
                        height: 100vh;
                        display: flex;
                        flex-direction: column;
                        background: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                    }
                    .toolbar {
                        display: flex;
                        align-items: center;
                        padding: 10px;
                        background: var(--vscode-titleBar-activeBackground);
                        border-bottom: 1px solid var(--vscode-panel-border);
                        gap: 10px;
                    }
                    .connection-selector {
                        min-width: 200px;
                    }
                    .execute-btn {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 8px 16px;
                        border-radius: 3px;
                        cursor: pointer;
                    }
                    .execute-btn:hover {
                        background: var(--vscode-button-hoverBackground);
                    }
                    .editor-container {
                        flex: 1;
                        display: flex;
                        flex-direction: column;
                    }
                    .query-editor {
                        flex: 1;
                        padding: 10px;
                        border: none;
                        resize: none;
                        font-family: 'Courier New', monospace;
                        font-size: 14px;
                        background: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                        outline: none;
                    }
                    .query-editor:focus {
                        outline: 1px solid var(--vscode-focusBorder);
                    }
                    .results-container {
                        border-top: 1px solid var(--vscode-panel-border);
                        background: var(--vscode-editorWidget-background);
                        max-height: 300px;
                        overflow: auto;
                    }
                    .results-header {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        padding: 10px;
                        background: var(--vscode-titleBar-activeBackground);
                        border-bottom: 1px solid var(--vscode-panel-border);
                    }
                    .results-table {
                        width: 100%;
                        border-collapse: collapse;
                    }
                    .results-table th,
                    .results-table td {
                        padding: 8px;
                        text-align: left;
                        border-bottom: 1px solid var(--vscode-list-inactiveSelectionBackground);
                    }
                    .results-table th {
                        background: var(--vscode-list-activeSelectionBackground);
                        font-weight: bold;
                        position: sticky;
                        top: 0;
                    }
                    .results-table tbody tr:hover {
                        background: var(--vscode-list-hoverBackground);
                    }
                    .status-bar {
                        padding: 5px 10px;
                        background: var(--vscode-statusBar-background);
                        color: var(--vscode-statusBar-foreground);
                        font-size: 12px;
                    }
                    .error-message {
                        color: var(--vscode-errorForeground);
                        background: var(--vscode-inputValidation-errorBackground);
                        padding: 10px;
                        margin: 10px;
                        border-radius: 3px;
                        border-left: 4px solid var(--vscode-errorForeground);
                    }
                </style>
            </head>
            <body>
                <div class="toolbar">
                    <select class="connection-selector" id="connectionSelect">
                        <option value="">Select Connection...</option>
                    </select>
                    <button class="execute-btn" onclick="executeQuery()">Execute Query (F5)</button>
                    <button class="execute-btn" onclick="getQueryHistory()">History</button>
                </div>

                <div class="editor-container">
                    <textarea
                        class="query-editor"
                        id="queryEditor"
                        placeholder="Enter your SQL query here...&#10;&#10;-- Examples:&#10;-- SELECT * FROM users LIMIT 100;&#10;-- SELECT COUNT(*) FROM orders WHERE created_at > '2024-01-01';&#10;-- SELECT * FROM users u JOIN orders o ON u.id = o.user_id;"
                        spellcheck="false"
                    ></textarea>

                    <div class="results-container" id="resultsContainer" style="display: none;">
                        <div class="results-header">
                            <span>Query Results</span>
                            <span id="resultsInfo"></span>
                        </div>
                        <div id="resultsContent">
                            <table class="results-table" id="resultsTable">
                                <thead id="resultsHeader"></thead>
                                <tbody id="resultsBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div class="status-bar" id="statusBar">
                    Ready
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    const queryEditor = document.getElementById('queryEditor');
                    const connectionSelect = document.getElementById('connectionSelect');
                    const resultsContainer = document.getElementById('resultsContainer');
                    const resultsTable = document.getElementById('resultsTable');
                    const resultsHeader = document.getElementById('resultsHeader');
                    const resultsBody = document.getElementById('resultsBody');
                    const resultsInfo = document.getElementById('resultsInfo');
                    const statusBar = document.getElementById('statusBar');

                    // Initialize
                    document.addEventListener('DOMContentLoaded', function() {
                        // Get connections
                        vscode.postMessage({ command: 'getConnections' });

                        // Get query history
                        vscode.postMessage({ command: 'getQueryHistory' });

                        // Focus on editor
                        queryEditor.focus();
                    });

                    // Handle keyboard shortcuts
                    queryEditor.addEventListener('keydown', function(e) {
                        if (e.key === 'F5') {
                            e.preventDefault();
                            executeQuery();
                        }
                    });

                    // Handle connection selection
                    connectionSelect.addEventListener('change', function() {
                        vscode.postMessage({
                            command: 'setConnection',
                            connectionId: this.value
                        });
                    });

                    function executeQuery() {
                        const query = queryEditor.value.trim();
                        if (!query) {
                            statusBar.textContent = 'Error: Query cannot be empty';
                            return;
                        }

                        const connectionId = connectionSelect.value;
                        if (!connectionId) {
                            statusBar.textContent = 'Error: Please select a connection';
                            return;
                        }

                        statusBar.textContent = 'Executing query...';
                        vscode.postMessage({
                            command: 'executeQuery',
                            query: query
                        });
                    }

                    function getQueryHistory() {
                        vscode.postMessage({ command: 'getQueryHistory' });
                    }

                    // Handle messages from extension
                    window.addEventListener('message', event => {
                        const message = event.data;

                        switch (message.command) {
                            case 'connectionsList':
                                populateConnections(message.connections);
                                break;
                            case 'queryHistory':
                                // Handle query history if needed
                                break;
                            case 'queryResult':
                                displayQueryResult(message.result);
                                break;
                            case 'queryError':
                                displayQueryError(message.error);
                                break;
                        }
                    });

                    function populateConnections(connections) {
                        connectionSelect.innerHTML = '<option value="">Select Connection...</option>';
                        connections.forEach(conn => {
                            const option = document.createElement('option');
                            option.value = conn.id;
                            option.textContent = \`\${conn.name} (\${conn.host}:\${conn.port}/\${conn.database})\`;
                            connectionSelect.appendChild(option);
                        });
                    }

                    function displayQueryResult(result) {
                        statusBar.textContent = \`Query executed in \${result.executionTime}ms, \${result.rowCount} rows returned\`;

                        if (result.rowCount === 0) {
                            resultsContainer.style.display = 'none';
                            return;
                        }

                        // Show results container
                        resultsContainer.style.display = 'block';

                        // Update results info
                        resultsInfo.textContent = \`\${result.rowCount} rows × \${result.columns.length} columns\`;

                        // Create table header
                        resultsHeader.innerHTML = '';
                        const headerRow = document.createElement('tr');
                        result.columns.forEach(col => {
                            const th = document.createElement('th');
                            th.textContent = \`\${col.name} (\${col.type})\`;
                            headerRow.appendChild(th);
                        });
                        resultsHeader.appendChild(headerRow);

                        // Create table body
                        resultsBody.innerHTML = '';
                        result.rows.slice(0, 100).forEach(row => { // Limit to 100 rows for performance
                            const tr = document.createElement('tr');
                            row.forEach(cell => {
                                const td = document.createElement('td');
                                td.textContent = cell === null ? 'NULL' : String(cell);
                                tr.appendChild(td);
                            });
                            resultsBody.appendChild(tr);
                        });

                        // Show message if results were truncated
                        if (result.rowCount > 100) {
                            const tr = document.createElement('tr');
                            const td = document.createElement('td');
                            td.colSpan = result.columns.length;
                            td.textContent = \`... and \${result.rowCount - 100} more rows\`;
                            td.style.fontStyle = 'italic';
                            td.style.textAlign = 'center';
                            tr.appendChild(td);
                            resultsBody.appendChild(tr);
                        }
                    }

                    function displayQueryError(error) {
                        statusBar.textContent = \`Error: \${error}\`;
                        resultsContainer.style.display = 'none';
                    }
                </script>
            </body>
            </html>
        `;
    }

    private getResultsWebviewContent(result: QueryResult): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Query Results</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        margin: 0;
                        padding: 20px;
                        background: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                    }
                    .results-info {
                        margin-bottom: 20px;
                        padding: 10px;
                        background: var(--vscode-textBlockQuote-background);
                        border-radius: 6px;
                    }
                    .results-table {
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 12px;
                    }
                    .results-table th,
                    .results-table td {
                        padding: 6px;
                        text-align: left;
                        border: 1px solid var(--vscode-panel-border);
                        max-width: 200px;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                    }
                    .results-table th {
                        background: var(--vscode-titleBar-activeBackground);
                        font-weight: bold;
                        position: sticky;
                        top: 0;
                    }
                    .results-table tbody tr:nth-child(even) {
                        background: var(--vscode-list-inactiveSelectionBackground);
                    }
                    .results-table tbody tr:hover {
                        background: var(--vscode-list-hoverBackground);
                    }
                </style>
            </head>
            <body>
                <div class="results-info">
                    <h3>Query Results</h3>
                    <p><strong>Execution Time:</strong> ${result.executionTime}ms</p>
                    <p><strong>Rows:</strong> ${result.rowCount}</p>
                    <p><strong>Columns:</strong> ${result.columns.length}</p>
                    ${result.executionPlan ? `<p><strong>Execution Plan:</strong> ${result.executionPlan}</p>` : ''}
                </div>

                <div style="overflow: auto; max-height: 500px;">
                    <table class="results-table">
                        <thead>
                            <tr>
                                ${result.columns.map(col => `<th>${col.name}<br><small>(${col.type})</small></th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${result.rows.map(row => `
                                <tr>
                                    ${row.map(cell => `<td>${cell === null ? 'NULL' : String(cell)}</td>`).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </body>
            </html>
        `;
    }
}