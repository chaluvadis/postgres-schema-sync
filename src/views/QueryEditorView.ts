import * as vscode from 'vscode';
import { ConnectionManager } from '@/managers/ConnectionManager';
import { QueryExecutionService } from '@/services/QueryExecutionService';
import { Logger } from '@/utils/Logger';
import { ErrorHandler } from '@/utils/ErrorHandler';

export interface QueryTab {
    id: string;
    name: string;
    connectionId?: string;
    query: string;
    isDirty: boolean;
    createdAt: Date;
    lastExecuted?: Date;
    executionResults?: QueryResult[];
}

export interface QueryResult {
    id: string;
    query: string;
    executionTime: number;
    rowCount: number;
    columns: QueryColumn[];
    rows: any[][];
    error?: string;
    executionPlan?: string;
    timestamp: Date;
}

export interface QueryColumn {
    name: string;
    type: string;
    nullable: boolean;
}

export class QueryEditorView {
    private context?: vscode.ExtensionContext;
    private connectionManager: ConnectionManager;
    private queryExecutionService: QueryExecutionService;
    private tabs: Map<string, QueryTab> = new Map();
    private activeTabId?: string;
    private webviewPanel?: vscode.WebviewPanel;
    private queryHistory: string[] = [];
    private favorites: string[] = [];

    constructor(
        connectionManager: ConnectionManager,
        queryExecutionService: QueryExecutionService,
        context?: vscode.ExtensionContext
    ) {
        this.connectionManager = connectionManager;
        this.queryExecutionService = queryExecutionService;
        if (context) {
            this.context = context;
            this.loadQueryHistory();
            this.loadFavorites();
        }
    }

    async showQueryEditor(connectionId?: string): Promise<void> {
        try {
            Logger.info('Opening query editor', 'showQueryEditor', { connectionId });

            // Create or focus existing webview panel
            if (!this.webviewPanel) {
                this.webviewPanel = vscode.window.createWebviewPanel(
                    'queryEditor',
                    'PostgreSQL Query Editor',
                    vscode.ViewColumn.One,
                    {
                        enableScripts: true,
                        retainContextWhenHidden: true,
                        localResourceRoots: this.context ? [
                            vscode.Uri.file(this.context.extensionPath)
                        ] : []
                    }
                );

                this.webviewPanel.onDidDispose(() => {
                    this.webviewPanel = undefined;
                });

                this.setupMessageHandler();
            }

            // Create new tab or switch to existing connection tab
            const tabId = this.createOrGetTab(connectionId);
            this.activeTabId = tabId;

            // Update webview content
            await this.updateWebviewContent();

            this.webviewPanel.reveal();

        } catch (error) {
            Logger.error('Failed to show query editor', error as Error);
            ErrorHandler.handleError(error, ErrorHandler.createContext('ShowQueryEditor'));
        }
    }

    private createOrGetTab(connectionId?: string): string {
        // If no connection specified, create a new tab
        if (!connectionId) {
            const tabId = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const tab: QueryTab = {
                id: tabId,
                name: `Query ${this.tabs.size + 1}`,
                query: '',
                isDirty: false,
                createdAt: new Date()
            };
            this.tabs.set(tabId, tab);
            return tabId;
        }

        // Check if tab already exists for this connection
        for (const [id, tab] of this.tabs) {
            if (tab.connectionId === connectionId) {
                return id;
            }
        }

        // Create new tab for connection
        const tabId = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const connection = this.connectionManager.getConnection(connectionId);
        const tab: QueryTab = {
            id: tabId,
            name: connection ? `${connection.name} - Query` : 'Query',
            connectionId,
            query: '',
            isDirty: false,
            createdAt: new Date()
        };
        this.tabs.set(tabId, tab);
        return tabId;
    }

    private setupMessageHandler(): void {
        if (!this.webviewPanel) return;

        this.webviewPanel.webview.onDidReceiveMessage(async (message) => {
            try {
                switch (message.command) {
                    case 'executeQuery':
                        await this.executeQuery(message.query, message.tabId);
                        break;

                    case 'updateQuery':
                        this.updateQuery(message.tabId, message.query);
                        break;

                    case 'switchTab':
                        this.switchTab(message.tabId);
                        await this.updateWebviewContent();
                        break;

                    case 'closeTab':
                        this.closeTab(message.tabId);
                        await this.updateWebviewContent();
                        break;

                    case 'newTab':
                        this.createOrGetTab();
                        await this.updateWebviewContent();
                        break;

                    case 'addToFavorites':
                        this.addToFavorites(message.query);
                        break;

                    case 'exportResults':
                        await this.exportResults(message.resultId, message.format);
                        break;

                    case 'clearHistory':
                        this.clearHistory();
                        break;

                    case 'formatQuery':
                        await this.formatQuery(message.tabId);
                        break;

                    case 'getIntelliSense':
                        await this.getIntelliSense(message.tabId, message.position);
                        break;
                }
            } catch (error) {
                Logger.error('Error handling query editor message', error as Error);
                ErrorHandler.handleError(error, ErrorHandler.createContext('QueryEditorMessage'));
            }
        });
    }

    private async executeQuery(query: string, tabId: string): Promise<void> {
        try {
            const tab = this.tabs.get(tabId);
            if (!tab) {
                throw new Error(`Tab ${tabId} not found`);
            }

            if (!tab.connectionId) {
                vscode.window.showErrorMessage('Please select a database connection for this query tab');
                return;
            }

            Logger.info('Executing query', 'executeQuery', {
                tabId,
                connectionId: tab.connectionId,
                queryLength: query.length
            });

            // Show progress
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Executing Query',
                cancellable: true
            }, async (progress, token) => {
                progress.report({ increment: 0, message: 'Executing query...' });

                try {
                    if (!tab.connectionId) {
                        vscode.window.showErrorMessage('Please select a database connection for this query tab');
                        return;
                    }

                    const result = await this.queryExecutionService.executeQuery(
                        tab.connectionId,
                        query,
                        { timeout: 30000, maxRows: 1000 },
                        token
                    );

                    progress.report({ increment: 100, message: 'Query executed successfully' });

                    // Update tab with execution info
                    tab.lastExecuted = new Date();
                    tab.executionResults = [result];
                    this.tabs.set(tabId, tab);

                    // Add to history
                    this.addToHistory(query);

                    // Update webview
                    await this.updateWebviewContent();

                    Logger.info('Query executed successfully', 'executeQuery', {
                        tabId,
                        rowCount: result.rowCount,
                        executionTime: result.executionTime
                    });

                } catch (error) {
                    progress.report({ increment: 100, message: 'Query execution failed' });

                    Logger.error('Query execution failed', error as Error);

                    // Create error result
                    const errorResult: QueryResult = {
                        id: `error_${Date.now()}`,
                        query,
                        executionTime: 0,
                        rowCount: 0,
                        columns: [],
                        rows: [],
                        error: (error as Error).message,
                        timestamp: new Date()
                    };

                    tab.executionResults = [errorResult];
                    this.tabs.set(tabId, tab);

                    await this.updateWebviewContent();

                    throw error;
                }
            });

        } catch (error) {
            Logger.error('Failed to execute query', error as Error);
            vscode.window.showErrorMessage(`Query execution failed: ${(error as Error).message}`);
        }
    }

    private updateQuery(tabId: string, query: string): void {
        const tab = this.tabs.get(tabId);
        if (tab) {
            tab.query = query;
            tab.isDirty = true;
            this.tabs.set(tabId, tab);
        }
    }

    private switchTab(tabId: string): void {
        this.activeTabId = tabId;
    }

    private closeTab(tabId: string): void {
        this.tabs.delete(tabId);
        if (this.activeTabId === tabId) {
            this.activeTabId = this.tabs.size > 0 ? this.tabs.keys().next().value : undefined;
        }
    }

    private addToHistory(query: string): void {
        if (!this.queryHistory.includes(query)) {
            this.queryHistory.unshift(query);
            if (this.queryHistory.length > 100) {
                this.queryHistory = this.queryHistory.slice(0, 100);
            }
            this.saveQueryHistory();
        }
    }

    private addToFavorites(query: string): void {
        if (!this.favorites.includes(query)) {
            this.favorites.push(query);
            this.saveFavorites();
            vscode.window.showInformationMessage('Query added to favorites');
        }
    }

    private clearHistory(): void {
        this.queryHistory = [];
        this.saveQueryHistory();
        vscode.window.showInformationMessage('Query history cleared');
    }

    private async formatQuery(tabId: string): Promise<void> {
        const tab = this.tabs.get(tabId);
        if (!tab) return;

        try {
            // Basic SQL formatting (can be enhanced with a proper SQL formatter)
            const formatted = tab.query
                .replace(/\s+/g, ' ')
                .replace(/\s*,\s*/g, ',\n    ')
                .replace(/\s*FROM\s+/gi, '\nFROM ')
                .replace(/\s*WHERE\s+/gi, '\nWHERE ')
                .replace(/\s*ORDER BY\s+/gi, '\nORDER BY ')
                .replace(/\s*GROUP BY\s+/gi, '\nGROUP BY ')
                .replace(/\s*HAVING\s+/gi, '\nHAVING ')
                .trim();

            tab.query = formatted;
            tab.isDirty = true;
            this.tabs.set(tabId, tab);

            await this.updateWebviewContent();

            vscode.window.showInformationMessage('Query formatted');
        } catch (error) {
            Logger.error('Failed to format query', error as Error);
        }
    }

    private async getIntelliSense(tabId: string, position: { line: number; column: number }): Promise<void> {
        const tab = this.tabs.get(tabId);
        if (!tab || !tab.connectionId) return;

        try {
            const suggestions = await this.queryExecutionService.getIntelliSense(
                tab.connectionId,
                tab.query,
                position
            );

            this.webviewPanel?.webview.postMessage({
                command: 'intelliSenseResults',
                suggestions
            });
        } catch (error) {
            Logger.error('Failed to get IntelliSense', error as Error);
        }
    }

    private async exportResults(resultId: string, format: 'csv' | 'json' | 'excel'): Promise<void> {
        try {
            // Find result in any tab
            let targetResult: QueryResult | undefined;
            for (const tab of this.tabs.values()) {
                if (tab.executionResults) {
                    targetResult = tab.executionResults.find(r => r.id === resultId);
                    if (targetResult) break;
                }
            }

            if (!targetResult) {
                vscode.window.showErrorMessage('Query result not found');
                return;
            }

            const uri = await vscode.window.showSaveDialog({
                filters: {
                    'CSV': ['csv'],
                    'JSON': ['json'],
                    'Excel': ['xlsx']
                },
                defaultUri: vscode.Uri.file(`query_result_${Date.now()}.${format}`)
            });

            if (uri) {
                await this.queryExecutionService.exportResults(targetResult, format, uri.fsPath);
                vscode.window.showInformationMessage(`Results exported to ${uri.fsPath}`);
            }

        } catch (error) {
            Logger.error('Failed to export results', error as Error);
            vscode.window.showErrorMessage(`Export failed: ${(error as Error).message}`);
        }
    }

    private async updateWebviewContent(): Promise<void> {
        if (!this.webviewPanel) return;

        const tabs = Array.from(this.tabs.values());
        const activeTab = this.activeTabId ? this.tabs.get(this.activeTabId) : undefined;
        const connections = this.connectionManager.getConnections();

        const html = await this.generateQueryEditorHtml(tabs, activeTab, connections);
        this.webviewPanel.webview.html = html;
    }

    private async generateQueryEditorHtml(
        tabs: QueryTab[],
        activeTab?: QueryTab,
        connections?: any[]
    ): Promise<string> {
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
                        padding: 10px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        display: flex;
                        gap: 10px;
                        align-items: center;
                        background: var(--vscode-titleBar-activeBackground);
                    }

                    .tab-bar {
                        display: flex;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        background: var(--vscode-tab-inactiveBackground);
                    }

                    .tab {
                        padding: 8px 16px;
                        cursor: pointer;
                        border-right: 1px solid var(--vscode-panel-border);
                        display: flex;
                        align-items: center;
                        gap: 5px;
                        font-size: 12px;
                    }

                    .tab.active {
                        background: var(--vscode-tab-activeBackground);
                        color: var(--vscode-tab-activeForeground);
                    }

                    .tab:hover {
                        background: var(--vscode-tab-hoverBackground);
                    }

                    .tab-close {
                        width: 16px;
                        height: 16px;
                        cursor: pointer;
                        opacity: 0.7;
                    }

                    .editor-container {
                        flex: 1;
                        display: flex;
                        flex-direction: column;
                    }

                    .query-editor {
                        flex: 1;
                        padding: 10px;
                    }

                    .query-textarea {
                        width: 100%;
                        height: 100%;
                        min-height: 200px;
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border: 1px solid var(--vscode-input-border);
                        border-radius: 4px;
                        padding: 10px;
                        font-family: 'Courier New', monospace;
                        font-size: 13px;
                        resize: vertical;
                    }

                    .query-textarea:focus {
                        outline: none;
                        border-color: var(--vscode-focusBorder);
                    }

                    .results-container {
                        flex: 1;
                        display: ${activeTab?.executionResults?.length ? 'block' : 'none'};
                        border-top: 1px solid var(--vscode-panel-border);
                    }

                    .results-header {
                        padding: 10px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        background: var(--vscode-titleBar-activeBackground);
                    }

                    .results-table {
                        height: 100%;
                        overflow: auto;
                    }

                    table {
                        width: 100%;
                        border-collapse: collapse;
                    }

                    th, td {
                        padding: 8px;
                        text-align: left;
                        border-bottom: 1px solid var(--vscode-list-inactiveSelectionBackground);
                    }

                    th {
                        background: var(--vscode-breadcrumb-background);
                        position: sticky;
                        top: 0;
                    }

                    .btn {
                        padding: 6px 12px;
                        border: 1px solid var(--vscode-button-border);
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 12px;
                    }

                    .btn:hover {
                        background: var(--vscode-button-hoverBackground);
                    }

                    .btn-secondary {
                        background: var(--vscode-button-secondaryBackground);
                        color: var(--vscode-button-secondaryForeground);
                    }

                    .connection-selector {
                        padding: 4px 8px;
                        border: 1px solid var(--vscode-input-border);
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border-radius: 3px;
                    }

                    .status-bar {
                        padding: 5px 10px;
                        background: var(--vscode-statusBar-background);
                        color: var(--vscode-statusBar-foreground);
                        font-size: 11px;
                        border-top: 1px solid var(--vscode-panel-border);
                    }

                    .error {
                        color: var(--vscode-errorForeground);
                        background: var(--vscode-inputValidation-errorBackground);
                        padding: 10px;
                        margin: 10px;
                        border-radius: 4px;
                        border: 1px solid var(--vscode-inputValidation-errorBorder);
                    }
                </style>
            </head>
            <body>
                <div class="toolbar">
                    <select class="connection-selector" id="connectionSelect" onchange="changeConnection()">
                        <option value="">Select Connection...</option>
                        ${connections?.map(conn => `
                            <option value="${conn.id}" ${activeTab?.connectionId === conn.id ? 'selected' : ''}>
                                ${conn.name}
                            </option>
                        `).join('')}
                    </select>

                    <button class="btn" onclick="executeQuery()">Execute</button>
                    <button class="btn btn-secondary" onclick="formatQuery()">Format</button>
                    <button class="btn btn-secondary" onclick="addToFavorites()">Add to Favorites</button>

                    <div style="flex: 1;"></div>

                    <button class="btn btn-secondary" onclick="newTab()">New Tab</button>
                </div>

                <div class="tab-bar">
                    ${tabs.map(tab => `
                        <div class="tab ${activeTab?.id === tab.id ? 'active' : ''}" onclick="switchTab('${tab.id}')">
                            <span>${tab.name}${tab.isDirty ? ' *' : ''}</span>
                            <span class="tab-close" onclick="closeTab('${tab.id}')" title="Close tab">×</span>
                        </div>
                    `).join('')}
                </div>

                <div class="editor-container">
                    ${activeTab ? `
                        <div class="query-editor">
                            <textarea
                                class="query-textarea"
                                id="queryTextarea"
                                placeholder="Enter your SQL query here..."
                                oninput="updateQuery()"
                                onkeydown="handleKeyDown(event)">${activeTab.query}</textarea>
                        </div>

                        ${activeTab.executionResults?.length ? `
                            <div class="results-container">
                                <div class="results-header">
                                    <div>
                                        <strong>Results</strong>
                                        (${activeTab.executionResults[0].rowCount} rows, ${activeTab.executionResults[0].executionTime}ms)
                                    </div>
                                    <div>
                                        <button class="btn btn-secondary" onclick="exportResults('${activeTab.executionResults[0].id}', 'csv')">Export CSV</button>
                                        <button class="btn btn-secondary" onclick="exportResults('${activeTab.executionResults[0].id}', 'json')">Export JSON</button>
                                    </div>
                                </div>
                                <div class="results-table">
                                    ${this.generateResultsTable(activeTab.executionResults[0])}
                                </div>
                            </div>
                        ` : ''}
                    ` : `
                        <div style="padding: 20px; text-align: center; color: var(--vscode-descriptionForeground);">
                            Select a tab to start editing queries
                        </div>
                    `}
                </div>

                <div class="status-bar">
                    ${activeTab?.connectionId ? `Connected to: ${connections?.find(c => c.id === activeTab.connectionId)?.name}` : 'No connection selected'}
                    ${activeTab?.lastExecuted ? ` | Last executed: ${activeTab.lastExecuted.toLocaleTimeString()}` : ''}
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    let activeTabId = '${activeTab?.id || ''}';

                    function executeQuery() {
                        const query = document.getElementById('queryTextarea').value.trim();
                        if (!query) {
                            vscode.postMessage({ command: 'showError', message: 'Please enter a query to execute' });
                            return;
                        }

                        vscode.postMessage({
                            command: 'executeQuery',
                            query: query,
                            tabId: activeTabId
                        });
                    }

                    function updateQuery() {
                        const query = document.getElementById('queryTextarea').value;
                        vscode.postMessage({
                            command: 'updateQuery',
                            tabId: activeTabId,
                            query: query
                        });
                    }

                    function handleKeyDown(event) {
                        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                            event.preventDefault();
                            executeQuery();
                        }
                    }

                    function switchTab(tabId) {
                        activeTabId = tabId;
                        vscode.postMessage({
                            command: 'switchTab',
                            tabId: tabId
                        });
                    }

                    function closeTab(tabId) {
                        event.stopPropagation();
                        vscode.postMessage({
                            command: 'closeTab',
                            tabId: tabId
                        });
                    }

                    function newTab() {
                        vscode.postMessage({ command: 'newTab' });
                    }

                    function changeConnection() {
                        const select = document.getElementById('connectionSelect');
                        const connectionId = select.value;
                        vscode.postMessage({
                            command: 'changeConnection',
                            tabId: activeTabId,
                            connectionId: connectionId
                        });
                    }

                    function formatQuery() {
                        vscode.postMessage({
                            command: 'formatQuery',
                            tabId: activeTabId
                        });
                    }

                    function addToFavorites() {
                        const query = document.getElementById('queryTextarea').value.trim();
                        if (query) {
                            vscode.postMessage({
                                command: 'addToFavorites',
                                query: query
                            });
                        }
                    }

                    function exportResults(resultId, format) {
                        vscode.postMessage({
                            command: 'exportResults',
                            resultId: resultId,
                            format: format
                        });
                    }

                    // Handle messages from extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.command) {
                            case 'queryExecuted':
                                // Update results display
                                location.reload();
                                break;
                            case 'error':
                                alert(message.message);
                                break;
                        }
                    });
                </script>
            </body>
            </html>
        `;
    }

    private generateResultsTable(result: QueryResult): string {
        if (result.error) {
            return `<div class="error">${result.error}</div>`;
        }

        if (!result.columns.length || !result.rows.length) {
            return '<div style="padding: 20px; text-align: center; color: var(--vscode-descriptionForeground);">No data returned</div>';
        }

        const headers = result.columns.map(col =>
            `<th>${col.name} <span style="color: var(--vscode-descriptionForeground);">(${col.type})</span></th>`
        ).join('');

        const rows = result.rows.slice(0, 100).map(row =>
            '<tr>' + row.map(cell =>
                `<td>${cell !== null ? String(cell) : '<em>null</em>'}</td>`
            ).join('') + '</tr>'
        ).join('');

        return `
            <table>
                <thead><tr>${headers}</tr></thead>
                <tbody>${rows}</tbody>
            </table>
            ${result.rows.length > 100 ? `<div style="padding: 10px; text-align: center; color: var(--vscode-descriptionForeground);">Showing first 100 rows of ${result.rowCount} total</div>` : ''}
        `;
    }

    private loadQueryHistory(): void {
        if (!this.context) return;

        try {
            const history = this.context.globalState.get<string[]>('postgresql.queryHistory', []);
            this.queryHistory = history;
        } catch (error) {
            Logger.error('Failed to load query history', error as Error);
        }
    }

    private saveQueryHistory(): void {
        if (!this.context) return;

        try {
            this.context.globalState.update('postgresql.queryHistory', this.queryHistory);
        } catch (error) {
            Logger.error('Failed to save query history', error as Error);
        }
    }

    private loadFavorites(): void {
        if (!this.context) return;

        try {
            const favorites = this.context.globalState.get<string[]>('postgresql.queryFavorites', []);
            this.favorites = favorites;
        } catch (error) {
            Logger.error('Failed to load favorites', error as Error);
        }
    }

    private saveFavorites(): void {
        if (!this.context) return;

        try {
            this.context.globalState.update('postgresql.queryFavorites', this.favorites);
        } catch (error) {
            Logger.error('Failed to save favorites', error as Error);
        }
    }

    getQueryHistory(): string[] {
        return [...this.queryHistory];
    }

    getFavorites(): string[] {
        return [...this.favorites];
    }

    dispose(): void {
        if (this.webviewPanel) {
            this.webviewPanel.dispose();
        }
    }
}