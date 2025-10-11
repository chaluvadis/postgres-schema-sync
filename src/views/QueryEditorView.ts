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

            // Show progress with cancellation support
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Executing Query',
                cancellable: true
            }, async (progress, token) => {
                progress.report({ increment: 0, message: 'Executing query...' });

                try {
                    const result = await this.queryExecutionService.executeQuery(
                        tab.connectionId!,
                        query,
                        {
                            timeout: 30000,
                            maxRows: 1000,
                            includeExecutionPlan: true
                        },
                        token
                    );

                    progress.report({ increment: 50, message: 'Processing results...' });

                    // Update tab with execution info
                    tab.lastExecuted = new Date();
                    tab.executionResults = [result];
                    this.tabs.set(tabId, tab);

                    // Add to history
                    this.addToHistory(query);

                    progress.report({ increment: 100, message: `Query completed (${result.rowCount} rows)` });

                    // Update webview
                    await this.updateWebviewContent();

                    // Show success message with row count
                    vscode.window.showInformationMessage(
                        `Query executed successfully: ${result.rowCount} rows returned in ${result.executionTime}ms`,
                        'View Results', 'Export Results'
                    ).then(selection => {
                        if (selection === 'View Results') {
                            // Results are already shown in the webview
                        } else if (selection === 'Export Results') {
                            this.webviewPanel?.webview.postMessage({
                                command: 'exportResults',
                                resultId: result.id,
                                format: 'csv'
                            });
                        }
                    });

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

                    // Show error with recovery options
                    vscode.window.showErrorMessage(
                        `Query execution failed: ${(error as Error).message}`,
                        'Retry', 'View Logs', 'Edit Connection'
                    ).then(selection => {
                        if (selection === 'Retry') {
                            this.executeQuery(query, tabId);
                        } else if (selection === 'View Logs') {
                            Logger.showOutputChannel();
                        } else if (selection === 'Edit Connection') {
                            vscode.commands.executeCommand('postgresql.editConnection');
                        }
                    });

                    throw error;
                }
            });

        } catch (error) {
            Logger.error('Failed to execute query', error as Error);
            // Error message already shown above
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
            // Get the current query up to cursor position for better context
            const lines = tab.query.split('\n');
            const currentLine = lines[position.line] || '';
            const queryUpToCursor = currentLine.substring(0, position.column);

            const suggestions = await this.queryExecutionService.getIntelliSense(
                tab.connectionId,
                tab.query,
                position
            );

            // Filter suggestions based on current context
            const filteredSuggestions = this.filterSuggestionsByContext(suggestions, queryUpToCursor);

            this.webviewPanel?.webview.postMessage({
                command: 'intelliSenseResults',
                suggestions: filteredSuggestions,
                position: position
            });
        } catch (error) {
            Logger.error('Failed to get IntelliSense', error as Error);
        }
    }

    private filterSuggestionsByContext(suggestions: any[], currentQuery: string): any[] {
        const lastWord = currentQuery.split(/[\s,;()]+/).pop() || '';
        const upperLastWord = lastWord.toUpperCase();

        return suggestions.filter(suggestion => {
            const upperLabel = suggestion.label.toUpperCase();

            // If we're typing a word, filter suggestions that start with it
            if (lastWord.length > 0) {
                return upperLabel.startsWith(upperLastWord);
            }

            // Otherwise return all suggestions
            return true;
        });
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
                        overflow-x: auto;
                    }

                    .tab {
                        padding: 8px 16px;
                        cursor: pointer;
                        border-right: 1px solid var(--vscode-panel-border);
                        display: flex;
                        align-items: center;
                        gap: 5px;
                        font-size: 12px;
                        white-space: nowrap;
                        min-width: fit-content;
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
                        margin-left: 5px;
                    }

                    .editor-container {
                        flex: 1;
                        display: flex;
                        flex-direction: column;
                    }

                    .query-editor {
                        flex: 1;
                        padding: 10px;
                        position: relative;
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
                        font-family: 'Courier New', 'Consolas', monospace;
                        font-size: 13px;
                        resize: vertical;
                        line-height: 1.4;
                    }

                    .query-textarea:focus {
                        outline: none;
                        border-color: var(--vscode-focusBorder);
                    }

                    /* SQL Syntax Highlighting */
                    .sql-keyword { color: var(--vscode-symbolIcon-keywordForeground); font-weight: bold; }
                    .sql-function { color: var(--vscode-symbolIcon-functionForeground); }
                    .sql-string { color: var(--vscode-symbolIcon-stringForeground); }
                    .sql-number { color: var(--vscode-symbolIcon-numberForeground); }
                    .sql-comment { color: var(--vscode-symbolIcon-commentForeground); font-style: italic; }
                    .sql-operator { color: var(--vscode-symbolIcon-operatorForeground); }

                    .autocomplete-container {
                        position: absolute;
                        background: var(--vscode-quickInput-background);
                        border: 1px solid var(--vscode-quickInput-border);
                        border-radius: 4px;
                        max-height: 200px;
                        overflow-y: auto;
                        z-index: 1000;
                        display: none;
                    }

                    .autocomplete-item {
                        padding: 6px 12px;
                        cursor: pointer;
                        border-bottom: 1px solid var(--vscode-list-inactiveSelectionBackground);
                    }

                    .autocomplete-item:hover,
                    .autocomplete-item.selected {
                        background: var(--vscode-list-activeSelectionBackground);
                        color: var(--vscode-list-activeSelectionForeground);
                    }

                    .autocomplete-item:last-child {
                        border-bottom: none;
                    }

                    .autocomplete-label {
                        font-weight: bold;
                    }

                    .autocomplete-detail {
                        font-size: 11px;
                        color: var(--vscode-descriptionForeground);
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
                        font-size: 12px;
                    }

                    th, td {
                        padding: 6px 8px;
                        text-align: left;
                        border-bottom: 1px solid var(--vscode-list-inactiveSelectionBackground);
                        max-width: 200px;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                    }

                    th {
                        background: var(--vscode-breadcrumb-background);
                        position: sticky;
                        top: 0;
                        font-weight: bold;
                    }

                    tr:hover td {
                        background: var(--vscode-list-hoverBackground);
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

                    .btn-primary {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
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
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }

                    .error {
                        color: var(--vscode-errorForeground);
                        background: var(--vscode-inputValidation-errorBackground);
                        padding: 10px;
                        margin: 10px;
                        border-radius: 4px;
                        border: 1px solid var(--vscode-inputValidation-errorBorder);
                    }

                    .success {
                        color: var(--vscode-charts-green);
                        background: var(--vscode-charts-background);
                        padding: 10px;
                        margin: 10px;
                        border-radius: 4px;
                        border: 1px solid var(--vscode-charts-green);
                    }

                    .loading {
                        display: inline-block;
                        width: 12px;
                        height: 12px;
                        border: 2px solid var(--vscode-progressBar-background);
                        border-radius: 50%;
                        border-top-color: var(--vscode-progressBar-foreground);
                        animation: spin 1s ease-in-out infinite;
                    }

                    @keyframes spin {
                        to { transform: rotate(360deg); }
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
                                placeholder="Enter your SQL query here...&#10;&#10;Tips:&#10;- Use Ctrl+Enter (Cmd+Enter on Mac) to execute&#10;- Use Tab for autocomplete&#10;- Use Ctrl+Space for manual autocomplete"
                                oninput="updateQuery()"
                                onkeydown="handleKeyDown(event)"
                                spellcheck="false">${activeTab.query}</textarea>

                            <div id="autocompleteContainer" class="autocomplete-container"></div>
                        </div>

                        ${activeTab.executionResults?.length ? `
                            <div class="results-container">
                                <div class="results-header">
                                    <div>
                                        <strong>Query Results</strong>
                                        (${activeTab.executionResults[0].rowCount} rows, ${activeTab.executionResults[0].executionTime}ms)
                                        ${activeTab.executionResults[0].executionPlan ? '<span title="Execution plan available">📊</span>' : ''}
                                    </div>
                                    <div>
                                        <button class="btn btn-secondary" onclick="exportResults('${activeTab.executionResults[0].id}', 'csv')" title="Export as CSV">📄 CSV</button>
                                        <button class="btn btn-secondary" onclick="exportResults('${activeTab.executionResults[0].id}', 'json')" title="Export as JSON">📋 JSON</button>
                                        <button class="btn btn-secondary" onclick="exportResults('${activeTab.executionResults[0].id}', 'excel')" title="Export as Excel">📊 Excel</button>
                                    </div>
                                </div>
                                <div class="results-table">
                                    ${this.generateResultsTable(activeTab.executionResults[0])}
                                </div>
                            </div>
                        ` : ''}
                    ` : `
                        <div style="padding: 20px; text-align: center; color: var(--vscode-descriptionForeground);">
                            <div style="margin-bottom: 20px;">Select a tab to start editing queries</div>
                            <div style="font-size: 12px; opacity: 0.7;">
                                💡 Tip: Use the toolbar buttons to execute queries, format SQL, and manage tabs
                            </div>
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
                    let autocompleteVisible = false;
                    let selectedAutocompleteIndex = -1;
                    let autocompleteSuggestions = [];

                    function executeQuery() {
                        const query = document.getElementById('queryTextarea').value.trim();
                        if (!query) {
                            showNotification('Please enter a query to execute', 'warning');
                            return;
                        }

                        // Hide autocomplete if visible
                        hideAutocomplete();

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

                        // Trigger autocomplete after a short delay
                        setTimeout(() => {
                            triggerAutocomplete();
                        }, 300);
                    }

                    function handleKeyDown(event) {
                        const textarea = document.getElementById('queryTextarea');

                        if (autocompleteVisible) {
                            switch (event.key) {
                                case 'ArrowDown':
                                    event.preventDefault();
                                    selectNextAutocomplete();
                                    return;
                                case 'ArrowUp':
                                    event.preventDefault();
                                    selectPreviousAutocomplete();
                                    return;
                                case 'Enter':
                                    if (selectedAutocompleteIndex >= 0) {
                                        event.preventDefault();
                                        applyAutocomplete();
                                        return;
                                    }
                                    break;
                                case 'Escape':
                                    event.preventDefault();
                                    hideAutocomplete();
                                    return;
                            }
                        }

                        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                            event.preventDefault();
                            executeQuery();
                        }

                        if (event.key === 'Tab' && !event.shiftKey) {
                            event.preventDefault();
                            if (autocompleteVisible && selectedAutocompleteIndex >= 0) {
                                applyAutocomplete();
                            } else {
                                // Basic tab indentation
                                const start = textarea.selectionStart;
                                const end = textarea.selectionEnd;
                                const newQuery = query.substring(0, start) + '    ' + query.substring(end);
                                textarea.value = newQuery;
                                textarea.selectionStart = textarea.selectionEnd = start + 4;
                                updateQuery();
                            }
                        }
                    }

                    function triggerAutocomplete() {
                        const textarea = document.getElementById('queryTextarea');
                        const cursorPosition = getCursorPosition(textarea);

                        vscode.postMessage({
                            command: 'getIntelliSense',
                            tabId: activeTabId,
                            position: cursorPosition
                        });
                    }

                    function showAutocomplete(suggestions, position) {
                        autocompleteSuggestions = suggestions;
                        if (suggestions.length === 0) {
                            hideAutocomplete();
                            return;
                        }

                        const textarea = document.getElementById('queryTextarea');
                        const container = document.getElementById('autocompleteContainer');
                        const rect = textarea.getBoundingClientRect();

                        // Calculate position for autocomplete popup
                        const lineHeight = 20;
                        const charWidth = 8;
                        const x = position.column * charWidth;
                        const y = position.line * lineHeight;

                        container.innerHTML = suggestions.map((suggestion, index) =>
                            \`<div class="autocomplete-item \${index === 0 ? 'selected' : ''}" onclick="selectAutocomplete(\${index})">
                                <div class="autocomplete-label">\${suggestion.label}</div>
                                <div class="autocomplete-detail">\${suggestion.detail || ''}</div>
                            </div>\`
                        ).join('');

                        container.style.left = \`\${x}px\`;
                        container.style.top = \`\${y + lineHeight}px\`;
                        container.style.display = 'block';
                        autocompleteVisible = true;
                        selectedAutocompleteIndex = 0;
                    }

                    function hideAutocomplete() {
                        document.getElementById('autocompleteContainer').style.display = 'none';
                        autocompleteVisible = false;
                        selectedAutocompleteIndex = -1;
                    }

                    function selectNextAutocomplete() {
                        if (!autocompleteVisible) return;

                        const items = document.querySelectorAll('.autocomplete-item');
                        if (selectedAutocompleteIndex < items.length - 1) {
                            items[selectedAutocompleteIndex].classList.remove('selected');
                            selectedAutocompleteIndex++;
                            items[selectedAutocompleteIndex].classList.add('selected');
                        }
                    }

                    function selectPreviousAutocomplete() {
                        if (!autocompleteVisible) return;

                        const items = document.querySelectorAll('.autocomplete-item');
                        if (selectedAutocompleteIndex > 0) {
                            items[selectedAutocompleteIndex].classList.remove('selected');
                            selectedAutocompleteIndex--;
                            items[selectedAutocompleteIndex].classList.add('selected');
                        }
                    }

                    function selectAutocomplete(index) {
                        selectedAutocompleteIndex = index;
                        applyAutocomplete();
                    }

                    function applyAutocomplete() {
                        if (selectedAutocompleteIndex < 0 || !autocompleteSuggestions[selectedAutocompleteIndex]) return;

                        const suggestion = autocompleteSuggestions[selectedAutocompleteIndex];
                        const textarea = document.getElementById('queryTextarea');
                        const start = textarea.selectionStart;
                        const line = textarea.value.substring(0, start).split('\\n').pop();
                        const wordMatch = line.match(/\\w*$/);
                        const wordStart = wordMatch ? start - wordMatch[0].length : start;

                        const newQuery = textarea.value.substring(0, wordStart) + suggestion.label + textarea.value.substring(start);
                        textarea.value = newQuery;
                        textarea.selectionStart = textarea.selectionEnd = wordStart + suggestion.label.length;
                        updateQuery();
                        hideAutocomplete();
                    }

                    function getCursorPosition(textarea) {
                        const value = textarea.value;
                        const start = textarea.selectionStart;
                        const lines = value.substring(0, start).split('\\n');
                        const line = lines.length - 1;
                        const column = lines[lines.length - 1].length;

                        return { line, column };
                    }

                    function switchTab(tabId) {
                        activeTabId = tabId;
                        hideAutocomplete();
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
                        hideAutocomplete();
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

                    function showNotification(message, type = 'info') {
                        const notification = document.createElement('div');
                        notification.className = \`notification \${type}\`;
                        notification.textContent = message;
                        notification.style.cssText = \`
                            position: fixed;
                            top: 20px;
                            right: 20px;
                            padding: 12px 16px;
                            border-radius: 4px;
                            z-index: 1001;
                            font-size: 12px;
                            max-width: 300px;
                            word-wrap: break-word;
                        \`;

                        if (type === 'error') {
                            notification.style.backgroundColor = 'var(--vscode-inputValidation-errorBackground)';
                            notification.style.color = 'var(--vscode-errorForeground)';
                            notification.style.border = '1px solid var(--vscode-inputValidation-errorBorder)';
                        } else if (type === 'warning') {
                            notification.style.backgroundColor = 'var(--vscode-inputValidation-warningBackground)';
                            notification.style.color = 'var(--vscode-inputValidation-warningForeground)';
                            notification.style.border = '1px solid var(--vscode-inputValidation-warningBorder)';
                        } else {
                            notification.style.backgroundColor = 'var(--vscode-charts-green)';
                            notification.style.color = 'white';
                        }

                        document.body.appendChild(notification);

                        setTimeout(() => {
                            if (notification.parentNode) {
                                notification.parentNode.removeChild(notification);
                            }
                        }, 3000);
                    }

                    // Handle messages from extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.command) {
                            case 'intelliSenseResults':
                                showAutocomplete(message.suggestions, message.position);
                                break;
                            case 'queryExecuted':
                                location.reload();
                                break;
                            case 'error':
                                showNotification(message.message, 'error');
                                break;
                            case 'warning':
                                showNotification(message.message, 'warning');
                                break;
                            case 'info':
                                showNotification(message.message, 'info');
                                break;
                        }
                    });

                    // Auto-trigger autocomplete on typing
                    let autocompleteTimer;
                    document.getElementById('queryTextarea').addEventListener('input', () => {
                        clearTimeout(autocompleteTimer);
                        autocompleteTimer = setTimeout(triggerAutocomplete, 500);
                    });

                    // Hide autocomplete when clicking outside
                    document.addEventListener('click', (event) => {
                        if (!event.target.closest('.autocomplete-container') && !event.target.closest('.query-textarea')) {
                            hideAutocomplete();
                        }
                    });

                    // Table interaction functions
                    function selectRow(rowIndex) {
                        const rows = document.querySelectorAll('#resultsTable tbody tr');
                        rows.forEach((row, index) => {
                            if (index === rowIndex) {
                                row.style.backgroundColor = 'var(--vscode-list-activeSelectionBackground)';
                                row.style.color = 'var(--vscode-list-activeSelectionForeground)';
                            } else {
                                row.style.backgroundColor = '';
                                row.style.color = '';
                            }
                        });
                    }

                    function sortTable(columnIndex) {
                        // Basic sorting functionality - can be enhanced
                        showNotification('Column sorting not yet implemented', 'info');
                    }

                    // Keyboard shortcuts for better productivity
                    document.addEventListener('keydown', (event) => {
                        // Ctrl+Shift+F to format query
                        if (event.ctrlKey && event.shiftKey && event.key === 'F') {
                            event.preventDefault();
                            formatQuery();
                        }

                        // Ctrl+Shift+S to add to favorites
                        if (event.ctrlKey && event.shiftKey && event.key === 'S') {
                            event.preventDefault();
                            addToFavorites();
                        }

                        // Ctrl+Shift+N for new tab
                        if (event.ctrlKey && event.shiftKey && event.key === 'N') {
                            event.preventDefault();
                            newTab();
                        }
                    });

                    // Show keyboard shortcuts on first load
                    window.addEventListener('load', () => {
                        setTimeout(() => {
                            showNotification('💡 Tip: Use Ctrl+Enter to execute queries, Tab for autocomplete', 'info');
                        }, 1000);
                    });
                </script>
            </body>
            </html>
        `;
    }

    private generateResultsTable(result: QueryResult): string {
        if (result.error) {
            return `
                <div class="error">
                    <strong>Query Error:</strong><br>
                    ${result.error}
                </div>
            `;
        }

        if (!result.columns.length || !result.rows.length) {
            return `
                <div style="padding: 40px; text-align: center; color: var(--vscode-descriptionForeground);">
                    <div style="font-size: 48px; margin-bottom: 16px;">📭</div>
                    <div>No data returned</div>
                    <div style="font-size: 12px; margin-top: 8px; opacity: 0.7;">
                        The query executed successfully but didn't return any rows
                    </div>
                </div>
            `;
        }

        const headers = result.columns.map((col, index) =>
            `<th title="${col.type}" onclick="sortTable(${index})">
                ${col.name}
                <span style="color: var(--vscode-descriptionForeground); font-weight: normal;">(${col.type})</span>
            </th>`
        ).join('');

        const rows = result.rows.slice(0, 500).map((row, rowIndex) =>
            `<tr onclick="selectRow(${rowIndex})" style="cursor: pointer;">` +
            row.map((cell, cellIndex) => {
                const cellValue = cell !== null ? String(cell) : '<em style="opacity: 0.6;">null</em>';
                const title = cell !== null ? cellValue : 'NULL value';

                // Format different data types
                let formattedValue = cellValue;
                if (cell !== null) {
                    if (typeof cell === 'boolean') {
                        formattedValue = cell ? '✓' : '✗';
                    } else if (cell instanceof Date) {
                        formattedValue = cell.toLocaleString();
                    } else if (typeof cell === 'number') {
                        formattedValue = Number(cell).toLocaleString();
                    } else if (cellValue.length > 50) {
                        formattedValue = cellValue.substring(0, 50) + '...';
                    }
                }

                return `<td title="${title.replace(/"/g, '"')}">${formattedValue}</td>`;
            }).join('') + '</tr>'
        ).join('');

        const totalRows = result.rowCount;
        const displayedRows = Math.min(result.rows.length, 500);

        return `
            <table id="resultsTable">
                <thead><tr>${headers}</tr></thead>
                <tbody>${rows}</tbody>
            </table>
            <div style="padding: 10px; text-align: center; color: var(--vscode-descriptionForeground); font-size: 11px; border-top: 1px solid var(--vscode-panel-border);">
                Showing ${displayedRows.toLocaleString()} of ${totalRows.toLocaleString()} rows
                ${totalRows > 500 ? ' (first 500 rows displayed)' : ''}
                ${result.executionPlan ? `<span style="margin-left: 16px;">📊 Execution plan available</span>` : ''}
            </div>
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