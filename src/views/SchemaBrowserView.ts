import * as vscode from 'vscode';
import { ModularSchemaManager, DatabaseObject } from '@/managers/schema';
import { ConnectionManager } from '@/managers/ConnectionManager';
import { Logger } from '@/utils/Logger';

export class SchemaBrowserView {
    private schemaManager: ModularSchemaManager;
    private connectionManager: ConnectionManager;

    constructor(schemaManager: ModularSchemaManager, connectionManager: ConnectionManager) {
        this.schemaManager = schemaManager;
        this.connectionManager = connectionManager;
    }

    async showSchemaBrowser(connectionId: string, schemaName?: string): Promise<void> {
        try {
            if (!connectionId) {
                throw new Error('Connection ID is required');
            }

            Logger.info('Opening schema browser', 'showSchemaBrowser', { connectionId, schemaName });

            const panel = vscode.window.createWebviewPanel(
                'schemaBrowser',
                `Schema Browser${schemaName ? `: ${schemaName}` : ''}`,
                vscode.ViewColumn.One,
                { enableScripts: true, retainContextWhenHidden: true }
            );

            // Load schema data
            const schemaData = await this.loadSchemaData(connectionId, schemaName);
            const browserHtml = await this.generateSchemaBrowserHtml(schemaData);
            panel.webview.html = browserHtml;

            // Handle messages from webview
            panel.webview.onDidReceiveMessage(async (message) => {
                switch (message.command) {
                    case 'viewObjectDetails':
                        await this.handleViewObjectDetails(message.object);
                        break;
                    case 'refreshSchema':
                        await this.handleRefreshSchema(panel, connectionId, schemaName);
                        break;
                    default:
                        Logger.warn('Unknown schema browser command', 'handleWebviewMessage', { command: message.command });
                        break;
                }
            });
        } catch (error) {
            Logger.error('Failed to show schema browser', error as Error);
            vscode.window.showErrorMessage(
                `Failed to open schema browser: ${(error as Error).message}`
            );
        }
    }

    private async loadSchemaData(connectionId: string, schemaName?: string): Promise<SchemaBrowserData> {
        try {
            const objects = await this.schemaManager.getDatabaseObjects(connectionId);

            let filteredObjects = objects;
            if (schemaName) {
                filteredObjects = objects.filter(obj => obj.schema === schemaName);
            }

            // Group objects by type
            const objectsByType = filteredObjects.reduce((acc, obj) => {
                if (!acc[obj.type]) {
                    acc[obj.type] = [];
                }
                acc[obj.type].push(obj);
                return acc;
            }, {} as Record<string, DatabaseObject[]>);

            // Get connection info
            const connection = this.connectionManager.getConnection(connectionId);
            if (!connection) {
                throw new Error(`Connection not found: ${connectionId}`);
            }

            return {
                connectionId,
                connectionName: connection.name || 'Unknown',
                schemaName: schemaName || 'All Schemas',
                objectsByType,
                totalObjects: filteredObjects.length,
                lastUpdated: new Date()
            };
        } catch (error) {
            Logger.error('Failed to load schema data', error as Error);
            throw error;
        }
    }

    private async generateSchemaBrowserHtml(data: SchemaBrowserData): Promise<string> {
        const typeSummaries = Object.entries(data.objectsByType)
            .map(([type, objects]) => `<div class="type-summary">${type}: ${objects.length}</div>`)
            .join('');

        const typeSections = Object.entries(data.objectsByType)
            .map(([type, objects]) => this.generateTypeSection(type, objects))
            .join('');

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Schema Browser</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        padding: 20px;
                        background: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                    }
                    .header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 20px;
                        padding-bottom: 15px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                    }
                    .search-box {
                        margin-bottom: 20px;
                    }
                    .search-box input {
                        width: 100%;
                        padding: 8px;
                        border: 1px solid var(--vscode-input-border);
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border-radius: 4px;
                        box-sizing: border-box;
                    }
                    .stats {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                        gap: 15px;
                        margin-bottom: 25px;
                    }
                    .stat-card {
                        background: var(--vscode-textBlockQuote-background);
                        padding: 15px;
                        border-radius: 6px;
                        border: 1px solid var(--vscode-textBlockQuote-border);
                        text-align: center;
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
                    .type-section {
                        margin-bottom: 30px;
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 6px;
                        overflow: hidden;
                    }
                    .type-header {
                        background: var(--vscode-titleBar-activeBackground);
                        color: var(--vscode-titleBar-activeForeground);
                        padding: 12px 15px;
                        font-weight: bold;
                        cursor: pointer;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }
                    .type-content {
                        padding: 15px;
                    }
                    .object-item {
                        background: var(--vscode-list-inactiveSelectionBackground);
                        padding: 10px;
                        margin-bottom: 8px;
                        border-radius: 4px;
                        border: 1px solid var(--vscode-list-inactiveSelectionBackground);
                        cursor: pointer;
                        transition: all 0.1s ease;
                    }
                    .object-item:hover {
                        background: var(--vscode-list-hoverBackground);
                        border-color: var(--vscode-list-hoverBackground);
                    }
                    .object-name {
                        font-weight: bold;
                        color: var(--vscode-textLink-foreground);
                        margin-bottom: 5px;
                    }
                    .object-meta {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                        display: flex;
                        gap: 15px;
                    }
                    .object-size {
                        color: var(--vscode-textPreformat-foreground);
                    }
                    .actions {
                        margin-top: 20px;
                        display: flex;
                        gap: 10px;
                        justify-content: flex-end;
                    }
                    .btn {
                        padding: 8px 16px;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 13px;
                    }
                    .btn-primary {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                    }
                    .btn-primary:hover {
                        background: var(--vscode-button-hoverBackground);
                    }
                    .btn-secondary {
                        background: var(--vscode-button-secondaryBackground, #3c3c3c);
                        color: var(--vscode-button-secondaryForeground, #cccccc);
                    }
                    .btn-secondary:hover {
                        background: var(--vscode-button-secondaryHoverBackground, #2a2d2e);
                    }
                    .collapsed .type-content {
                        display: none;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div>
                        <h2>Schema Browser</h2>
                        <p>Connection: ${data.connectionName} | Schema: ${data.schemaName}</p>
                    </div>
                    <div>
                        <button class="btn btn-secondary" onclick="refreshSchema()">Refresh</button>
                    </div>
                </div>

                <div class="search-box">
                    <input type="text" id="searchInput" placeholder="Search objects..." onkeyup="filterObjects()">
                </div>

                <div class="stats">
                    <div class="stat-card">
                        <div class="stat-value">${data.totalObjects}</div>
                        <div class="stat-label">Total Objects</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${Object.keys(data.objectsByType).length}</div>
                        <div class="stat-label">Object Types</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${data.lastUpdated.toLocaleTimeString()}</div>
                        <div class="stat-label">Last Updated</div>
                    </div>
                </div>

                <div class="type-summaries">
                    ${typeSummaries}
                </div>

                <div class="schema-objects">
                    ${typeSections}
                </div>

                <script>
                    const vscode = acquireVsCodeApi();

                    function viewObjectDetails(object) {
                        vscode.postMessage({
                            command: 'viewObjectDetails',
                            object: object
                        });
                    }

                    function refreshSchema() {
                        vscode.postMessage({
                            command: 'refreshSchema'
                        });
                    }

                    function filterObjects() {
                        const searchTerm = document.getElementById('searchInput').value.toLowerCase();
                        const objectItems = document.querySelectorAll('.object-item');

                        objectItems.forEach(item => {
                            const objectName = item.querySelector('.object-name').textContent.toLowerCase();
                            const objectType = item.querySelector('.object-meta').textContent.toLowerCase();

                            if (objectName.includes(searchTerm) || objectType.includes(searchTerm)) {
                                item.style.display = 'block';
                            } else {
                                item.style.display = 'none';
                            }
                        });
                    }

                    // Toggle type sections
                    document.querySelectorAll('.type-header').forEach(header => {
                        header.addEventListener('click', () => {
                            header.parentElement.classList.toggle('collapsed');
                        });
                    });
                </script>
            </body>
            </html>
        `;
    }

    private generateTypeSection(type: string, objects: DatabaseObject[]): string {
        const objectItems = objects.map(obj => `
            <div class="object-item" onclick='viewObjectDetails(${JSON.stringify(obj)})'>
                <div class="object-name">${obj.name}</div>
                <div class="object-meta">
                    <span>Schema: ${obj.schema}</span>
                </div>
            </div>
        `).join('');

        return `
            <div class="type-section">
                <div class="type-header">
                    <span>${type} (${objects.length})</span>
                    <span>▼</span>
                </div>
                <div class="type-content">
                    ${objectItems}
                </div>
            </div>
        `;
    }

    private async handleViewObjectDetails(object: DatabaseObject): Promise<void> {
        if (!object || !object.name) {
            Logger.warn('Invalid object provided for details view', 'handleViewObjectDetails', { object });
            return;
        }

        try {
            // Implement object details view
            const panel = vscode.window.createWebviewPanel(
                'objectDetails',
                `Object Details: ${object.name}`,
                vscode.ViewColumn.One,
                { enableScripts: true }
            );

            const detailsHtml = this.generateObjectDetailsHtml(object);
            panel.webview.html = detailsHtml;

            Logger.info('Viewing object details', 'handleViewObjectDetails', { object: object.name, type: object.type });
        } catch (error) {
            Logger.error('Failed to view object details', error as Error, 'handleViewObjectDetails', { object });
            vscode.window.showErrorMessage(`Failed to view object details: ${(error as Error).message}`);
        }
    }

    private async handleRefreshSchema(panel: vscode.WebviewPanel, connectionId: string, schemaName?: string): Promise<void> {
        try {
            const schemaData = await this.loadSchemaData(connectionId, schemaName);
            const browserHtml = await this.generateSchemaBrowserHtml(schemaData);
            panel.webview.html = browserHtml;
        } catch (error) {
            Logger.error('Failed to refresh schema', error as Error);
            vscode.window.showErrorMessage('Failed to refresh schema data');
        }
    }
}

interface SchemaBrowserData {
    connectionId: string;
    connectionName: string;
    schemaName: string;
    objectsByType: Record<string, DatabaseObject[]>;
    totalObjects: number;
    lastUpdated: Date;
}