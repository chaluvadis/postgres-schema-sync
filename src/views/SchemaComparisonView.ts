import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';
import { DotNetIntegrationService, DotNetSchemaComparison, DotNetConnectionInfo } from '../services/DotNetIntegrationService';

export interface SchemaComparisonData {
    id: string;
    sourceConnection: DotNetConnectionInfo;
    targetConnection: DotNetConnectionInfo;
    differences: SchemaDifference[];
    comparisonOptions: ComparisonOptions;
    createdAt: string;
    executionTime: string;
}

export interface SchemaDifference {
    id: string;
    type: 'Added' | 'Removed' | 'Modified' | 'Moved';
    objectType: string;
    objectName: string;
    schema: string;
    sourceDefinition?: string | undefined;
    targetDefinition?: string | undefined;
    differenceDetails: string[];
    severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface ComparisonOptions {
    mode: 'strict' | 'lenient';
    ignoreSchemas: string[];
    includeSystemObjects: boolean;
    caseSensitive: boolean;
}

export class SchemaComparisonView {
    private panel: vscode.WebviewPanel | undefined;
    private comparisonData: SchemaComparisonData | undefined;

    constructor(
        private dotNetService: DotNetIntegrationService
    ) {}

    async showComparison(comparisonData?: SchemaComparisonData): Promise<void> {
        try {
            Logger.info('Opening schema comparison view');

            if (comparisonData) {
                this.comparisonData = comparisonData;
            }

            this.panel = vscode.window.createWebviewPanel(
                'postgresqlSchemaComparison',
                'Schema Comparison',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [
                        vscode.Uri.joinPath(vscode.workspace.workspaceFolders?.[0]?.uri || vscode.Uri.parse(''), 'resources')
                    ]
                }
            );

            // Handle panel disposal
            this.panel.onDidDispose(() => {
                this.panel = undefined;
                this.comparisonData = undefined;
            });

            // Generate and set HTML content
            const htmlContent = await this.generateComparisonHtml(this.comparisonData);
            this.panel.webview.html = htmlContent;

            // Handle messages from webview
            this.panel.webview.onDidReceiveMessage(async (message) => {
                await this.handleWebviewMessage(message);
            });

        } catch (error) {
            Logger.error('Failed to show schema comparison', error as Error);
            vscode.window.showErrorMessage(
                `Failed to open schema comparison: ${(error as Error).message}`
            );
        }
    }

    async performComparison(
        sourceConnection: DotNetConnectionInfo,
        targetConnection: DotNetConnectionInfo,
        options: ComparisonOptions
    ): Promise<void> {
        try {
            Logger.info('Performing schema comparison', 'SchemaComparisonView', {
                source: sourceConnection.name,
                target: targetConnection.name
            });

            // Show progress indicator
            const progressOptions: vscode.ProgressOptions = {
                location: vscode.ProgressLocation.Notification,
                title: 'Comparing Schemas',
                cancellable: true
            };

            await vscode.window.withProgress(progressOptions, async (progress, token) => {
                progress.report({ increment: 0, message: 'Connecting to databases...' });

                if (token.isCancellationRequested) {
                    throw new Error('Comparison cancelled by user');
                }

                // Perform the actual comparison via .NET service
                const dotNetComparison = await this.dotNetService.compareSchemas(
                    sourceConnection,
                    targetConnection,
                    options
                );

                progress.report({ increment: 50, message: 'Analyzing differences...' });

                if (token.isCancellationRequested) {
                    throw new Error('Comparison cancelled by user');
                }

                // Convert .NET comparison to view format
                this.comparisonData = this.convertDotNetComparison(dotNetComparison, options);

                progress.report({ increment: 100, message: 'Comparison complete' });

                // Update the view with results
                if (this.panel) {
                    const htmlContent = await this.generateComparisonHtml(this.comparisonData);
                    this.panel.webview.html = htmlContent;
                }
            });

        } catch (error) {
            Logger.error('Schema comparison failed', error as Error);
            vscode.window.showErrorMessage(
                `Schema comparison failed: ${(error as Error).message}`
            );
            throw error;
        }
    }

    private convertDotNetComparison(
        dotNetComparison: DotNetSchemaComparison,
        options: ComparisonOptions
    ): SchemaComparisonData {
        return {
            id: dotNetComparison.id,
            sourceConnection: dotNetComparison.sourceConnection,
            targetConnection: dotNetComparison.targetConnection,
            differences: dotNetComparison.differences.map(diff => ({
                id: `${diff.type}-${diff.objectType}-${diff.objectName}-${diff.schema}`,
                type: diff.type,
                objectType: diff.objectType,
                objectName: diff.objectName,
                schema: diff.schema,
                sourceDefinition: diff.sourceDefinition,
                targetDefinition: diff.targetDefinition,
                differenceDetails: diff.differenceDetails,
                severity: this.calculateSeverity(diff)
            })),
            comparisonOptions: options,
            createdAt: dotNetComparison.createdAt,
            executionTime: dotNetComparison.executionTime
        };
    }

    private calculateSeverity(difference: any): 'low' | 'medium' | 'high' | 'critical' {
        // Calculate severity based on difference type and object type
        if (difference.type === 'Removed') {
            return 'critical';
        } else if (difference.type === 'Modified' && difference.objectType === 'table') {
            return 'high';
        } else if (difference.type === 'Added') {
            return 'medium';
        } else {
            return 'low';
        }
    }

    private async generateComparisonHtml(data?: SchemaComparisonData): Promise<string> {
        if (!data) {
            return this.generateEmptyStateHtml();
        }

        const differencesByType = this.groupDifferencesByType(data.differences);
        const differencesBySeverity = this.groupDifferencesBySeverity(data.differences);

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Schema Comparison Results</title>
                <style>
                    :root {
                        --vscode-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        --vscode-editor-background: #1e1e1e;
                        --vscode-editor-foreground: #cccccc;
                        --vscode-panel-border: #3c3c3c;
                        --vscode-textLink-foreground: #4da6ff;
                        --vscode-button-background: #0e639c;
                        --vscode-button-foreground: #ffffff;
                        --vscode-button-hoverBackground: #1177bb;
                        --vscode-input-background: #3c3c3c;
                        --vscode-input-foreground: #cccccc;
                        --vscode-list-hoverBackground: #2a2d2e;
                        --vscode-badge-background: #4d4d4d;
                        --vscode-badge-foreground: #ffffff;
                        --vscode-gitDecoration-addedResourceForeground: #4bb74a;
                        --vscode-gitDecoration-deletedResourceForeground: #f48771;
                        --vscode-gitDecoration-modifiedResourceForeground: #4da6ff;
                        --vscode-gitDecoration-renamedResourceForeground: #ffd33d;
                    }

                    body {
                        font-family: var(--vscode-font-family);
                        padding: 0;
                        margin: 0;
                        background: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                        height: 100vh;
                        display: flex;
                        flex-direction: column;
                    }

                    .header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 15px 20px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        background: var(--vscode-editor-background);
                    }

                    .comparison-info {
                        display: flex;
                        gap: 20px;
                        align-items: center;
                    }

                    .connection-badge {
                        padding: 4px 8px;
                        border-radius: 4px;
                        font-size: 11px;
                        font-weight: bold;
                    }

                    .source-badge {
                        background: var(--vscode-gitDecoration-addedResourceForeground);
                        color: var(--vscode-editor-background);
                    }

                    .target-badge {
                        background: var(--vscode-gitDecoration-deletedResourceForeground);
                        color: var(--vscode-editor-background);
                    }

                    .content-area {
                        flex: 1;
                        overflow: auto;
                        padding: 20px;
                    }

                    .summary-cards {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                        gap: 15px;
                        margin-bottom: 20px;
                    }

                    .summary-card {
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 6px;
                        padding: 15px;
                        text-align: center;
                    }

                    .summary-number {
                        font-size: 24px;
                        font-weight: bold;
                        margin-bottom: 5px;
                    }

                    .summary-label {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                        text-transform: uppercase;
                    }

                    .differences-section {
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 6px;
                        overflow: hidden;
                    }

                    .section-header {
                        background: var(--vscode-titleBar-activeBackground, #2f2f2f);
                        padding: 12px 15px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }

                    .section-title {
                        font-weight: bold;
                        font-size: 13px;
                    }

                    .filter-controls {
                        display: flex;
                        gap: 10px;
                        align-items: center;
                    }

                    .filter-btn {
                        padding: 4px 8px;
                        border: 1px solid var(--vscode-panel-border);
                        background: transparent;
                        color: var(--vscode-editor-foreground);
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 11px;
                    }

                    .filter-btn.active {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border-color: var(--vscode-button-background);
                    }

                    .differences-list {
                        max-height: 400px;
                        overflow-y: auto;
                    }

                    .difference-item {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 10px 15px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        cursor: pointer;
                        transition: background-color 0.2s;
                    }

                    .difference-item:hover {
                        background: var(--vscode-list-hoverBackground);
                    }

                    .difference-icon {
                        width: 12px;
                        height: 12px;
                        border-radius: 50%;
                        flex-shrink: 0;
                    }

                    .diff-added { background: var(--vscode-gitDecoration-addedResourceForeground); }
                    .diff-removed { background: var(--vscode-gitDecoration-deletedResourceForeground); }
                    .diff-modified { background: var(--vscode-gitDecoration-modifiedResourceForeground); }
                    .diff-moved { background: var(--vscode-gitDecoration-renamedResourceForeground); }

                    .difference-content {
                        flex: 1;
                    }

                    .difference-title {
                        font-weight: bold;
                        margin-bottom: 2px;
                    }

                    .difference-meta {
                        font-size: 11px;
                        color: var(--vscode-descriptionForeground);
                    }

                    .severity-badge {
                        padding: 2px 6px;
                        border-radius: 3px;
                        font-size: 10px;
                        font-weight: bold;
                        text-transform: uppercase;
                    }

                    .severity-critical { background: var(--vscode-gitDecoration-deletedResourceForeground); }
                    .severity-high { background: var(--vscode-gitDecoration-modifiedResourceForeground); }
                    .severity-medium { background: var(--vscode-gitDecoration-renamedResourceForeground); }
                    .severity-low { background: var(--vscode-panel-border); }

                    .diff-details {
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 4px;
                        padding: 15px;
                        margin-top: 10px;
                        font-family: 'Consolas', 'Courier New', monospace;
                        font-size: 12px;
                        white-space: pre-wrap;
                    }

                    .footer {
                        padding: 15px 20px;
                        border-top: 1px solid var(--vscode-panel-border);
                        background: var(--vscode-editor-background);
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }

                    .btn {
                        padding: 8px 16px;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 12px;
                        font-weight: bold;
                        transition: background-color 0.2s;
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
                        background: var(--vscode-list-hoverBackground);
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="comparison-info">
                        <h2>Schema Comparison Results</h2>
                        <span class="connection-badge source-badge">Source: ${data.sourceConnection.name}</span>
                        <span class="connection-badge target-badge">Target: ${data.targetConnection.name}</span>
                    </div>
                    <div class="comparison-meta">
                        <small>Completed in ${data.executionTime} • ${new Date(data.createdAt).toLocaleString()}</small>
                    </div>
                </div>

                <div class="content-area">
                    <div class="summary-cards">
                        <div class="summary-card">
                            <div class="summary-number" style="color: var(--vscode-gitDecoration-addedResourceForeground);">
                                ${differencesByType.Added || 0}
                            </div>
                            <div class="summary-label">Added</div>
                        </div>
                        <div class="summary-card">
                            <div class="summary-number" style="color: var(--vscode-gitDecoration-deletedResourceForeground);">
                                ${differencesByType.Removed || 0}
                            </div>
                            <div class="summary-label">Removed</div>
                        </div>
                        <div class="summary-card">
                            <div class="summary-number" style="color: var(--vscode-gitDecoration-modifiedResourceForeground);">
                                ${differencesByType.Modified || 0}
                            </div>
                            <div class="summary-label">Modified</div>
                        </div>
                        <div class="summary-card">
                            <div class="summary-number" style="color: var(--vscode-gitDecoration-renamedResourceForeground);">
                                ${differencesByType.Moved || 0}
                            </div>
                            <div class="summary-label">Moved</div>
                        </div>
                        <div class="summary-card">
                            <div class="summary-number">${data.differences.length}</div>
                            <div class="summary-label">Total</div>
                        </div>
                    </div>

                    <div class="differences-section">
                        <div class="section-header">
                            <div class="section-title">Differences</div>
                            <div class="filter-controls">
                                <button class="filter-btn active" onclick="filterDifferences('all')">All</button>
                                <button class="filter-btn" onclick="filterDifferences('critical')">Critical</button>
                                <button class="filter-btn" onclick="filterDifferences('high')">High</button>
                                <button class="filter-btn" onclick="filterDifferences('medium')">Medium</button>
                                <button class="filter-btn" onclick="filterDifferences('low')">Low</button>
                            </div>
                        </div>
                        <div class="differences-list" id="differencesList">
                            ${data.differences.map(diff => `
                                <div class="difference-item" data-severity="${diff.severity}" onclick="showDifferenceDetails('${diff.id}')">
                                    <div class="difference-icon diff-${diff.type.toLowerCase()}"></div>
                                    <div class="difference-content">
                                        <div class="difference-title">
                                            ${diff.objectName} (${diff.objectType})
                                            <span class="severity-badge severity-${diff.severity}">${diff.severity}</span>
                                        </div>
                                        <div class="difference-meta">
                                            Schema: ${diff.schema} • Type: ${diff.type}
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <div id="differenceDetails" class="diff-details" style="display: none;">
                        <h4>Difference Details</h4>
                        <div id="detailsContent"></div>
                    </div>
                </div>

                <div class="footer">
                    <div class="info">
                        ${data.differences.length} differences found • Mode: ${data.comparisonOptions.mode}
                    </div>
                    <div class="actions">
                        <button class="btn btn-secondary" onclick="exportComparison()">Export</button>
                        <button class="btn btn-primary" onclick="generateMigration()">Generate Migration</button>
                    </div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    let currentFilter = 'all';

                    function filterDifferences(severity) {
                        currentFilter = severity;
                        const items = document.querySelectorAll('.difference-item');

                        items.forEach(item => {
                            const itemSeverity = item.getAttribute('data-severity');
                            if (severity === 'all' || itemSeverity === severity) {
                                item.style.display = 'flex';
                            } else {
                                item.style.display = 'none';
                            }
                        });

                        // Update filter button states
                        document.querySelectorAll('.filter-btn').forEach(btn => {
                            btn.classList.remove('active');
                        });
                        event.target.classList.add('active');
                    }

                    function showDifferenceDetails(diffId) {
                        const detailsDiv = document.getElementById('differenceDetails');
                        const contentDiv = document.getElementById('detailsContent');

                        // Find the difference data
                        const differences = ${JSON.stringify(data.differences)};
                        const diff = differences.find(d => d.id === diffId);

                        if (diff) {
                            contentDiv.innerHTML = \`
                                <p><strong>Type:</strong> \${diff.type}</p>
                                <p><strong>Object:</strong> \${diff.objectName} (\${diff.objectType})</p>
                                <p><strong>Schema:</strong> \${diff.schema}</p>
                                <p><strong>Severity:</strong> \${diff.severity}</p>
                                <p><strong>Details:</strong></p>
                                <ul>
                                    \${diff.differenceDetails.map(detail => \`<li>\${detail}</li>\`).join('')}
                                </ul>
                                \${diff.sourceDefinition ? \`<p><strong>Source Definition:</strong></p><pre>\${diff.sourceDefinition}</pre>\` : ''}
                                \${diff.targetDefinition ? \`<p><strong>Target Definition:</strong></p><pre>\${diff.targetDefinition}</pre>\` : ''}
                            \`;
                            detailsDiv.style.display = 'block';
                        }
                    }

                    function exportComparison() {
                        vscode.postMessage({
                            command: 'exportComparison',
                            data: ${JSON.stringify(data)}
                        });
                    }

                    function generateMigration() {
                        vscode.postMessage({
                            command: 'generateMigration',
                            comparisonData: ${JSON.stringify(data)}
                        });
                    }
                </script>
            </body>
            </html>
        `;
    }

    private generateEmptyStateHtml(): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Schema Comparison</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        padding: 40px;
                        margin: 0;
                        background: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        height: 100vh;
                        text-align: center;
                    }
                    .empty-state {
                        max-width: 500px;
                    }
                    .icon {
                        font-size: 48px;
                        margin-bottom: 20px;
                    }
                    .title {
                        font-size: 24px;
                        font-weight: bold;
                        margin-bottom: 10px;
                    }
                    .description {
                        color: var(--vscode-descriptionForeground);
                        margin-bottom: 30px;
                        line-height: 1.5;
                    }
                    .btn {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 12px 24px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: bold;
                    }
                    .btn:hover {
                        background: var(--vscode-button-hoverBackground);
                    }
                </style>
            </head>
            <body>
                <div class="empty-state">
                    <div class="icon">🔍</div>
                    <div class="title">No Comparison Data</div>
                    <div class="description">
                        Select two database connections and run a schema comparison to see the differences here.
                    </div>
                    <button class="btn" onclick="startNewComparison()">Start New Comparison</button>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    function startNewComparison() {
                        vscode.postMessage({
                            command: 'startNewComparison'
                        });
                    }
                </script>
            </body>
            </html>
        `;
    }

    private groupDifferencesByType(differences: SchemaDifference[]): Record<string, number> {
        return differences.reduce((acc, diff) => {
            acc[diff.type] = (acc[diff.type] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
    }

    private groupDifferencesBySeverity(differences: SchemaDifference[]): Record<string, number> {
        return differences.reduce((acc, diff) => {
            acc[diff.severity] = (acc[diff.severity] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
    }

    private async handleWebviewMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'exportComparison':
                await this.exportComparison(message.data);
                break;
            case 'generateMigration':
                await this.generateMigrationFromComparison(message.comparisonData);
                break;
            case 'startNewComparison':
                await vscode.commands.executeCommand('postgresql.compareSchemas');
                break;
        }
    }

    private async exportComparison(data: SchemaComparisonData): Promise<void> {
        try {
            const exportContent = this.generateExportContent(data);
            const uri = await vscode.window.showSaveDialog({
                filters: {
                    'JSON Files': ['json'],
                    'Text Files': ['txt'],
                    'All Files': ['*']
                },
                defaultUri: vscode.Uri.file(`schema-comparison-${new Date().toISOString().split('T')[0]}.json`)
            });

            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(exportContent, 'utf8'));
                vscode.window.showInformationMessage('Schema comparison exported successfully');
            }
        } catch (error) {
            Logger.error('Failed to export comparison', error as Error);
            vscode.window.showErrorMessage('Failed to export comparison');
        }
    }

    private generateExportContent(data: SchemaComparisonData): string {
        return JSON.stringify(data, null, 2);
    }

    private async generateMigrationFromComparison(comparisonData: SchemaComparisonData): Promise<void> {
        try {
            await vscode.commands.executeCommand('postgresql.generateMigration', comparisonData);
        } catch (error) {
            Logger.error('Failed to generate migration from comparison', error as Error);
            vscode.window.showErrorMessage('Failed to generate migration');
        }
    }

    dispose(): void {
        if (this.panel) {
            this.panel.dispose();
            this.panel = undefined;
        }
        this.comparisonData = undefined;
    }
}