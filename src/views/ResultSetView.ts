import * as vscode from 'vscode';
import { QueryResult, QueryColumn } from '@/services/QueryExecutionService';
import { Logger } from '@/utils/Logger';
import { ErrorHandler } from '@/utils/ErrorHandler';

export interface ResultSetTab {
    id: string;
    name: string;
    result: QueryResult;
    createdAt: Date;
}

export class ResultSetView {
    private context: vscode.ExtensionContext;
    private tabs: Map<string, ResultSetTab> = new Map();
    private activeTabId?: string;
    private webviewPanel?: vscode.WebviewPanel;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    async showResultSet(result: QueryResult, title?: string): Promise<void> {
        try {
            Logger.info('Opening result set view', 'showResultSet', {
                rowCount: result.rowCount,
                columnCount: result.columns.length
            });

            // Create or focus existing webview panel
            if (!this.webviewPanel) {
                this.webviewPanel = vscode.window.createWebviewPanel(
                    'resultSetView',
                    title || 'Query Results',
                    vscode.ViewColumn.Beside,
                    {
                        enableScripts: true,
                        retainContextWhenHidden: true,
                        localResourceRoots: [
                            vscode.Uri.file(this.context.extensionPath)
                        ]
                    }
                );

                this.webviewPanel.onDidDispose(() => {
                    this.webviewPanel = undefined;
                }, null, this.context.subscriptions);

                this.setupMessageHandler();
            }

            // Create new tab for this result
            const tabId = this.createTab(result, title);

            // Update webview content
            await this.updateWebviewContent();

            this.webviewPanel.reveal();

        } catch (error) {
            Logger.error('Failed to show result set', error as Error);
            ErrorHandler.handleError(error, ErrorHandler.createContext('ShowResultSet'));
        }
    }

    private createTab(result: QueryResult, title?: string): string {
        const tabId = `result_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const tab: ResultSetTab = {
            id: tabId,
            name: title || `Results (${result.rowCount} rows)`,
            result,
            createdAt: new Date()
        };

        this.tabs.set(tabId, tab);
        this.activeTabId = tabId;

        return tabId;
    }

    private setupMessageHandler(): void {
        if (!this.webviewPanel) return;

        this.webviewPanel.webview.onDidReceiveMessage(async (message) => {
            try {
                switch (message.command) {
                    case 'exportResults':
                        await this.exportResults(message.tabId, message.format);
                        break;

                    case 'copyToClipboard':
                        await this.copyToClipboard(message.tabId);
                        break;

                    case 'showCellDetails':
                        this.showCellDetails(message.tabId, message.rowIndex, message.columnIndex);
                        break;

                    case 'filterResults':
                        this.filterResults(message.tabId, message.filter);
                        break;

                    case 'sortResults':
                        this.sortResults(message.tabId, message.columnIndex, message.direction);
                        break;
                }
            } catch (error) {
                Logger.error('Error handling result set message', error as Error);
                ErrorHandler.handleError(error, ErrorHandler.createContext('ResultSetMessage'));
            }
        });
    }

    private async exportResults(tabId: string, format: 'csv' | 'json' | 'excel'): Promise<void> {
        try {
            const tab = this.tabs.get(tabId);
            if (!tab) {
                vscode.window.showErrorMessage('Result set not found');
                return;
            }

            const uri = await vscode.window.showSaveDialog({
                filters: {
                    'CSV': ['csv'],
                    'JSON': ['json'],
                    'Excel': ['xlsx']
                },
                defaultUri: vscode.Uri.file(`query_results_${Date.now()}.${format}`)
            });

            if (uri) {
                await this.performExport(tab.result, format, uri.fsPath);
                vscode.window.showInformationMessage(`Results exported to ${uri.fsPath}`);
            }

        } catch (error) {
            Logger.error('Failed to export results', error as Error);
            vscode.window.showErrorMessage(`Export failed: ${(error as Error).message}`);
        }
    }

    private async performExport(result: QueryResult, format: string, filePath: string): Promise<void> {
        let content: string;

        switch (format) {
            case 'csv':
                content = this.generateCSV(result);
                break;
            case 'json':
                content = this.generateJSON(result);
                break;
            case 'excel':
                // For now, export as CSV with Excel-friendly formatting
                content = this.generateCSV(result, '\t');
                break;
            default:
                throw new Error(`Unsupported export format: ${format}`);
        }

        const fs = require('fs').promises;
        await fs.writeFile(filePath, content, 'utf8');
    }

    private generateCSV(result: QueryResult, delimiter: string = ','): string {
        const lines: string[] = [];

        // Add headers
        const headers = result.columns.map(col => `"${col.name}"`).join(delimiter);
        lines.push(headers);

        // Add data rows (limit to prevent memory issues)
        const maxRows = Math.min(result.rows.length, 10000);
        for (let i = 0; i < maxRows; i++) {
            const row = result.rows[i];
            const values = row.map(cell => {
                const cellStr = cell !== null ? String(cell) : '';
                // Escape quotes and wrap in quotes if contains delimiter or quotes
                return cellStr.includes(delimiter) || cellStr.includes('"')
                    ? `"${cellStr.replace(/"/g, '""')}"`
                    : cellStr;
            });
            lines.push(values.join(delimiter));
        }

        if (result.rows.length > maxRows) {
            lines.push(`"... and ${result.rows.length - maxRows} more rows"`);
        }

        return lines.join('\n');
    }

    private generateJSON(result: QueryResult): string {
        const data = result.rows.slice(0, 10000).map(row => {
            const obj: any = {};
            result.columns.forEach((col, index) => {
                obj[col.name] = row[index];
            });
            return obj;
        });

        if (result.rows.length > 10000) {
            data.push({ _note: `... and ${result.rows.length - 10000} more rows` });
        }

        return JSON.stringify(data, null, 2);
    }

    private async copyToClipboard(tabId: string): Promise<void> {
        try {
            const tab = this.tabs.get(tabId);
            if (!tab) {
                vscode.window.showErrorMessage('Result set not found');
                return;
            }

            const csvContent = this.generateCSV(tab.result);
            await vscode.env.clipboard.writeText(csvContent);
            vscode.window.showInformationMessage('Results copied to clipboard');

        } catch (error) {
            Logger.error('Failed to copy to clipboard', error as Error);
            vscode.window.showErrorMessage(`Copy failed: ${(error as Error).message}`);
        }
    }

    private showCellDetails(tabId: string, rowIndex: number, columnIndex: number): void {
        const tab = this.tabs.get(tabId);
        if (!tab) {
            vscode.window.showErrorMessage('Result set not found');
            return;
        }

        const result = tab.result;
        if (rowIndex >= result.rows.length || columnIndex >= result.columns.length) {
            vscode.window.showErrorMessage('Invalid cell coordinates');
            return;
        }

        const cellValue = result.rows[rowIndex][columnIndex];
        const column = result.columns[columnIndex];

        const details = `
Cell Details:
- Value: ${cellValue}
- Type: ${typeof cellValue}
- Column: ${column.name}
- SQL Type: ${column.type}
- Nullable: ${column.nullable}
- Row: ${rowIndex + 1}
        `.trim();

        vscode.window.showInformationMessage(details);
    }

    private filterResults(tabId: string, filter: { column: string; operator: string; value: string }): void {
        // Implementation for filtering results
        vscode.window.showInformationMessage('Filtering not yet implemented');
    }

    private sortResults(tabId: string, columnIndex: number, direction: 'asc' | 'desc'): void {
        // Implementation for sorting results
        vscode.window.showInformationMessage('Sorting not yet implemented');
    }

    private async updateWebviewContent(): Promise<void> {
        if (!this.webviewPanel) return;

        const tabs = Array.from(this.tabs.values());
        const activeTab = this.activeTabId ? this.tabs.get(this.activeTabId) : undefined;

        const html = await this.generateResultSetHtml(tabs, activeTab);
        this.webviewPanel.webview.html = html;
    }

    private async generateResultSetHtml(tabs: ResultSetTab[], activeTab?: ResultSetTab): Promise<string> {
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

                    .results-info {
                        padding: 10px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        background: var(--vscode-titleBar-activeBackground);
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                    }

                    .results-container {
                        flex: 1;
                        overflow: auto;
                    }

                    .results-summary {
                        padding: 15px;
                        background: var(--vscode-textBlockQuote-background);
                        border: 1px solid var(--vscode-textBlockQuote-border);
                        margin: 15px;
                        border-radius: 6px;
                    }

                    .error-message {
                        padding: 15px;
                        background: var(--vscode-inputValidation-errorBackground);
                        color: var(--vscode-inputValidation-errorForeground);
                        border: 1px solid var(--vscode-inputValidation-errorBorder);
                        margin: 15px;
                        border-radius: 6px;
                    }

                    .results-table-container {
                        padding: 15px;
                    }

                    table {
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 12px;
                    }

                    th {
                        background: var(--vscode-breadcrumb-background);
                        padding: 10px 8px;
                        text-align: left;
                        font-weight: bold;
                        border-bottom: 2px solid var(--vscode-panel-border);
                        position: sticky;
                        top: 0;
                    }

                    td {
                        padding: 8px;
                        border-bottom: 1px solid var(--vscode-list-inactiveSelectionBackground);
                        max-width: 200px;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                    }

                    tr:hover {
                        background: var(--vscode-list-hoverBackground);
                    }

                    tr:nth-child(even) {
                        background: var(--vscode-list-inactiveSelectionBackground);
                    }

                    tr:nth-child(even):hover {
                        background: var(--vscode-list-hoverBackground);
                    }

                    .null-value {
                        color: var(--vscode-descriptionForeground);
                        font-style: italic;
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

                    .btn-secondary:hover {
                        background: var(--vscode-button-secondaryHoverBackground);
                    }

                    .execution-plan {
                        background: var(--vscode-textCodeBlock-background);
                        border: 1px solid var(--vscode-textBlockQuote-border);
                        border-radius: 6px;
                        padding: 15px;
                        margin: 15px;
                        font-family: 'Courier New', monospace;
                        font-size: 11px;
                        white-space: pre-wrap;
                        max-height: 200px;
                        overflow-y: auto;
                    }

                    .statistics {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                        gap: 10px;
                        margin: 15px;
                    }

                    .stat-card {
                        background: var(--vscode-textBlockQuote-background);
                        padding: 10px;
                        border-radius: 6px;
                        border: 1px solid var(--vscode-textBlockQuote-border);
                        text-align: center;
                    }

                    .stat-value {
                        font-size: 18px;
                        font-weight: bold;
                        color: var(--vscode-textLink-foreground);
                    }

                    .stat-label {
                        font-size: 11px;
                        color: var(--vscode-descriptionForeground);
                        margin-top: 5px;
                    }
                </style>
            </head>
            <body>
                <div class="toolbar">
                    <button class="btn" onclick="exportResults('csv')">Export CSV</button>
                    <button class="btn" onclick="exportResults('json')">Export JSON</button>
                    <button class="btn btn-secondary" onclick="copyToClipboard()">Copy to Clipboard</button>
                    <div style="flex: 1;"></div>
                    <button class="btn btn-secondary" onclick="refreshView()">Refresh</button>
                </div>

                ${activeTab ? `
                    <div class="results-info">
                        <strong>${activeTab.name}</strong>
                        • ${activeTab.result.rowCount} rows
                        • ${activeTab.result.columns.length} columns
                        • Execution time: ${activeTab.result.executionTime}ms
                        • ${activeTab.result.timestamp.toLocaleString()}
                    </div>

                    ${activeTab.result.error ? `
                        <div class="error-message">
                            <strong>Error:</strong> ${activeTab.result.error}
                        </div>
                    ` : `
                        <div class="statistics">
                            <div class="stat-card">
                                <div class="stat-value">${activeTab.result.rowCount}</div>
                                <div class="stat-label">Rows</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value">${activeTab.result.columns.length}</div>
                                <div class="stat-label">Columns</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value">${activeTab.result.executionTime}ms</div>
                                <div class="stat-label">Execution Time</div>
                            </div>
                        </div>

                        ${activeTab.result.executionPlan ? `
                            <div class="execution-plan">
                                <strong>Execution Plan:</strong>
                                ${activeTab.result.executionPlan}
                            </div>
                        ` : ''}

                        <div class="results-container">
                            <div class="results-table-container">
                                ${this.generateResultsTable(activeTab.result)}
                            </div>
                        </div>
                    `}
                ` : `
                    <div style="padding: 50px; text-align: center; color: var(--vscode-descriptionForeground);">
                        No results to display
                    </div>
                `}
            </body>

            <script>
                const vscode = acquireVsCodeApi();

                function exportResults(format) {
                    vscode.postMessage({
                        command: 'exportResults',
                        tabId: '${activeTab?.id || ''}',
                        format: format
                    });
                }

                function copyToClipboard() {
                    vscode.postMessage({
                        command: 'copyToClipboard',
                        tabId: '${activeTab?.id || ''}'
                    });
                }

                function refreshView() {
                    location.reload();
                }

                function showCellDetails(rowIndex, columnIndex) {
                    vscode.postMessage({
                        command: 'showCellDetails',
                        tabId: '${activeTab?.id || ''}',
                        rowIndex: rowIndex,
                        columnIndex: columnIndex
                    });
                }

                // Add click handlers to table cells
                document.addEventListener('DOMContentLoaded', function() {
                    const cells = document.querySelectorAll('td');
                    cells.forEach((cell, index) => {
                        cell.style.cursor = 'pointer';
                        cell.title = 'Click to view details';
                        cell.onclick = function() {
                            const rowIndex = Math.floor(index / ${activeTab?.result.columns.length || 1});
                            const columnIndex = index % ${activeTab?.result.columns.length || 1};
                            showCellDetails(rowIndex, columnIndex);
                        };
                    });
                });
            </script>
            </html>
        `;
    }

    private generateResultsTable(result: QueryResult): string {
        if (result.error) {
            return `<div class="error-message">${result.error}</div>`;
        }

        if (!result.columns.length || !result.rows.length) {
            return '<div style="padding: 20px; text-align: center; color: var(--vscode-descriptionForeground);">No data returned</div>';
        }

        const headers = result.columns.map((col, index) =>
            `<th style="cursor: pointer;" onclick="sortByColumn(${index})" title="Click to sort by ${col.name}">
                ${col.name}
                <span style="color: var(--vscode-descriptionForeground); font-weight: normal;">(${col.type})</span>
            </th>`
        ).join('');

        const rows = result.rows.slice(0, 1000).map((row, rowIndex) =>
            '<tr>' + result.columns.map((col, colIndex) => {
                const cellValue = row[colIndex];
                const displayValue = cellValue === null || cellValue === undefined ? '<em class="null-value">null</em>' : String(cellValue);
                return `<td title="${displayValue}">${displayValue}</td>`;
            }).join('') + '</tr>'
        ).join('');

        return `
            <table>
                <thead><tr>${headers}</tr></thead>
                <tbody>${rows}</tbody>
            </table>
            ${result.rows.length > 1000 ? `<div style="padding: 10px; text-align: center; color: var(--vscode-descriptionForeground);">Showing first 1000 rows of ${result.rowCount} total</div>` : ''}
        `;
    }

    dispose(): void {
        if (this.webviewPanel) {
            this.webviewPanel.dispose();
        }
    }
}