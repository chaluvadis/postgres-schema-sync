import * as vscode from 'vscode';
import { Logger } from '@/utils/Logger';
import { ConnectionManager } from '@/managers/ConnectionManager';

export interface PerformanceMetrics {
    connectionId: string;
    timestamp: Date;
    queryPerformance: QueryPerformanceMetrics;
    schemaPerformance: SchemaPerformanceMetrics;
    systemPerformance: SystemPerformanceMetrics;
}

export interface QueryPerformanceMetrics {
    averageQueryTime: number;
    slowQueries: number;
    queryCount: number;
    cacheHitRatio: number;
    activeConnections: number;
}

export interface SchemaPerformanceMetrics {
    tableCount: number;
    indexCount: number;
    viewCount: number;
    largestTables: Array<{name: string; size: number}>;
    unusedIndexes: number;
    missingIndexes: number;
}

export interface SystemPerformanceMetrics {
    cpuUsage: number;
    memoryUsage: number;
    diskIO: number;
    networkIO: number;
    activeConnections: number;
    lockWaits: number;
}

export class PerformanceDashboardView {
    private panel: vscode.WebviewPanel | undefined;
    private metrics: PerformanceMetrics[] = [];
    private refreshInterval: NodeJS.Timeout | undefined;

    constructor(private connectionManager: ConnectionManager) {}

    async showDashboard(connectionId?: string): Promise<void> {
        try {
            Logger.info('Opening performance dashboard view');

            this.panel = vscode.window.createWebviewPanel(
                'postgresqlPerformanceDashboard',
                'Performance Dashboard',
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
                if (this.refreshInterval) {
                    clearInterval(this.refreshInterval);
                    this.refreshInterval = undefined;
                }
            });

            // Start auto-refresh
            this.startAutoRefresh();

            // Generate and set HTML content
            const htmlContent = await this.generateDashboardHtml();
            this.panel.webview.html = htmlContent;

            // Handle messages from webview
            this.panel.webview.onDidReceiveMessage(async (message) => {
                await this.handleWebviewMessage(message);
            });

        } catch (error) {
            Logger.error('Failed to show performance dashboard', error as Error);
            vscode.window.showErrorMessage(
                `Failed to open performance dashboard: ${(error as Error).message}`
            );
        }
    }

    private startAutoRefresh(): void {
        // Refresh metrics every 30 seconds
        this.refreshInterval = setInterval(async () => {
            await this.refreshMetrics();
        }, 30000);
    }

    private async refreshMetrics(): Promise<void> {
        try {
            // Collect performance metrics from all connections
            const connections = this.connectionManager.getConnections();
            const newMetrics: PerformanceMetrics[] = [];

            for (const connection of connections) {
                try {
                    const metrics = await this.collectConnectionMetrics(connection.id);
                    newMetrics.push(metrics);
                } catch (error) {
                    Logger.warn('Failed to collect metrics for connection', 'refreshMetrics', {
                        connectionId: connection.id,
                        error: (error as Error).message
                    });
                }
            }

            this.metrics = newMetrics;

            // Update dashboard if visible
            if (this.panel && this.panel.visible) {
                const htmlContent = await this.generateDashboardHtml();
                this.panel.webview.html = htmlContent;
            }

        } catch (error) {
            Logger.error('Failed to refresh metrics', error as Error);
        }
    }

    private async collectConnectionMetrics(connectionId: string): Promise<PerformanceMetrics> {
        // This would collect actual performance metrics from the database
        // For now, return mock data
        return {
            connectionId,
            timestamp: new Date(),
            queryPerformance: {
                averageQueryTime: Math.random() * 100,
                slowQueries: Math.floor(Math.random() * 10),
                queryCount: Math.floor(Math.random() * 1000),
                cacheHitRatio: Math.random() * 100,
                activeConnections: Math.floor(Math.random() * 20)
            },
            schemaPerformance: {
                tableCount: Math.floor(Math.random() * 100),
                indexCount: Math.floor(Math.random() * 200),
                viewCount: Math.floor(Math.random() * 20),
                largestTables: [
                    { name: 'users', size: Math.floor(Math.random() * 1000000) },
                    { name: 'orders', size: Math.floor(Math.random() * 500000) },
                    { name: 'products', size: Math.floor(Math.random() * 300000) }
                ],
                unusedIndexes: Math.floor(Math.random() * 5),
                missingIndexes: Math.floor(Math.random() * 3)
            },
            systemPerformance: {
                cpuUsage: Math.random() * 100,
                memoryUsage: Math.random() * 100,
                diskIO: Math.random() * 1000,
                networkIO: Math.random() * 500,
                activeConnections: Math.floor(Math.random() * 50),
                lockWaits: Math.floor(Math.random() * 10)
            }
        };
    }

    private async generateDashboardHtml(): Promise<string> {
        const latestMetrics = this.metrics.length > 0 ? this.metrics[this.metrics.length - 1] : null;

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>PostgreSQL Performance Dashboard</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        padding: 20px;
                        margin: 0;
                        background: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                    }
                    .header {
                        margin-bottom: 20px;
                        padding: 15px;
                        background: var(--vscode-textBlockQuote-background);
                        border-radius: 4px;
                    }
                    .metrics-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                        gap: 20px;
                        margin-bottom: 20px;
                    }
                    .metric-card {
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 6px;
                        padding: 15px;
                    }
                    .metric-title {
                        font-size: 14px;
                        font-weight: bold;
                        margin-bottom: 10px;
                        color: var(--vscode-textLink-foreground);
                    }
                    .metric-value {
                        font-size: 24px;
                        font-weight: bold;
                        margin-bottom: 5px;
                    }
                    .metric-unit {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                    }
                    .metric-list {
                        margin-top: 10px;
                    }
                    .metric-list-item {
                        display: flex;
                        justify-content: space-between;
                        padding: 5px 0;
                        border-bottom: 1px solid var(--vscode-panel-border);
                    }
                    .metric-list-item:last-child {
                        border-bottom: none;
                    }
                    .status-indicator {
                        width: 12px;
                        height: 12px;
                        border-radius: 50%;
                        display: inline-block;
                        margin-right: 8px;
                    }
                    .status-good { background: var(--vscode-gitDecoration-addedResourceForeground); }
                    .status-warning { background: var(--vscode-gitDecoration-renamedResourceForeground); }
                    .status-critical { background: var(--vscode-gitDecoration-deletedResourceForeground); }
                    .refresh-info {
                        text-align: center;
                        margin-top: 20px;
                        color: var(--vscode-descriptionForeground);
                        font-size: 12px;
                    }
                    .controls {
                        margin-bottom: 20px;
                        display: flex;
                        gap: 10px;
                        justify-content: center;
                    }
                    .btn {
                        padding: 8px 16px;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 12px;
                        font-weight: bold;
                    }
                    .btn-primary {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                    }
                    .btn-secondary {
                        background: var(--vscode-button-secondaryBackground);
                        color: var(--vscode-button-secondaryForeground);
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h2>PostgreSQL Performance Dashboard</h2>
                    <div>Real-time monitoring and performance metrics</div>
                </div>

                <div class="controls">
                    <button class="btn btn-primary" onclick="refreshMetrics()">Refresh Now</button>
                    <button class="btn btn-secondary" onclick="exportMetrics()">Export Metrics</button>
                </div>

                ${latestMetrics ? `
                    <div class="metrics-grid">
                        <div class="metric-card">
                            <div class="metric-title">Query Performance</div>
                            <div class="metric-value">${latestMetrics.queryPerformance.averageQueryTime.toFixed(1)}<span class="metric-unit">ms</span></div>
                            <div class="metric-list">
                                <div class="metric-list-item">
                                    <span>Slow Queries</span>
                                    <span>${latestMetrics.queryPerformance.slowQueries}</span>
                                </div>
                                <div class="metric-list-item">
                                    <span>Total Queries</span>
                                    <span>${latestMetrics.queryPerformance.queryCount}</span>
                                </div>
                                <div class="metric-list-item">
                                    <span>Cache Hit Ratio</span>
                                    <span>${latestMetrics.queryPerformance.cacheHitRatio.toFixed(1)}%</span>
                                </div>
                            </div>
                        </div>

                        <div class="metric-card">
                            <div class="metric-title">Schema Performance</div>
                            <div class="metric-value">${latestMetrics.schemaPerformance.tableCount}<span class="metric-unit">tables</span></div>
                            <div class="metric-list">
                                <div class="metric-list-item">
                                    <span>Indexes</span>
                                    <span>${latestMetrics.schemaPerformance.indexCount}</span>
                                </div>
                                <div class="metric-list-item">
                                    <span>Views</span>
                                    <span>${latestMetrics.schemaPerformance.viewCount}</span>
                                </div>
                                <div class="metric-list-item">
                                    <span>Unused Indexes</span>
                                    <span>${latestMetrics.schemaPerformance.unusedIndexes}</span>
                                </div>
                            </div>
                        </div>

                        <div class="metric-card">
                            <div class="metric-title">System Performance</div>
                            <div class="metric-value">${latestMetrics.systemPerformance.cpuUsage.toFixed(1)}<span class="metric-unit">%</span></div>
                            <div class="metric-list">
                                <div class="metric-list-item">
                                    <span>Memory Usage</span>
                                    <span>${latestMetrics.systemPerformance.memoryUsage.toFixed(1)}%</span>
                                </div>
                                <div class="metric-list-item">
                                    <span>Active Connections</span>
                                    <span>${latestMetrics.systemPerformance.activeConnections}</span>
                                </div>
                                <div class="metric-list-item">
                                    <span>Lock Waits</span>
                                    <span>${latestMetrics.systemPerformance.lockWaits}</span>
                                </div>
                            </div>
                        </div>

                        <div class="metric-card">
                            <div class="metric-title">Largest Tables</div>
                            <div class="metric-list">
                                ${latestMetrics.schemaPerformance.largestTables.map(table => `
                                    <div class="metric-list-item">
                                        <span>${table.name}</span>
                                        <span>${(table.size / 1024 / 1024).toFixed(1)} MB</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                ` : `
                    <div style="text-align: center; padding: 50px; color: var(--vscode-descriptionForeground);">
                        <div style="font-size: 48px; margin-bottom: 20px;">📊</div>
                        <div style="font-size: 18px; margin-bottom: 10px;">No Metrics Available</div>
                        <div style="font-size: 14px;">Connect to a database to start monitoring performance metrics</div>
                    </div>
                `}

                <div class="refresh-info">
                    Last updated: ${new Date().toLocaleTimeString()} • Auto-refresh: 30 seconds
                </div>

                <script>
                    const vscode = acquireVsCodeApi();

                    function refreshMetrics() {
                        vscode.postMessage({
                            command: 'refreshMetrics'
                        });
                    }

                    function exportMetrics() {
                        vscode.postMessage({
                            command: 'exportMetrics'
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
                <title>Performance Dashboard</title>
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
                    <div class="icon">📊</div>
                    <div class="title">Performance Dashboard</div>
                    <div class="description">
                        Monitor database performance metrics, query statistics, and system health in real-time.
                    </div>
                    <button class="btn" onclick="connectDatabase()">Connect Database</button>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    function connectDatabase() {
                        vscode.postMessage({
                            command: 'connectDatabase'
                        });
                    }
                </script>
            </body>
            </html>
        `;
    }

    private async handleWebviewMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'refreshMetrics':
                await this.refreshMetrics();
                break;
            case 'exportMetrics':
                await this.exportMetrics();
                break;
            case 'connectDatabase':
                await vscode.commands.executeCommand('postgresql.connect');
                break;
        }
    }

    private async exportMetrics(): Promise<void> {
        try {
            const exportContent = JSON.stringify(this.metrics, null, 2);
            const uri = await vscode.window.showSaveDialog({
                filters: {
                    'JSON Files': ['json'],
                    'All Files': ['*']
                },
                defaultUri: vscode.Uri.file('performance-metrics-' + new Date().toISOString().split('T')[0] + '.json')
            });

            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(exportContent, 'utf8'));
                vscode.window.showInformationMessage('Performance metrics exported successfully');
            }
        } catch (error) {
            Logger.error('Failed to export metrics', error as Error);
            vscode.window.showErrorMessage('Failed to export metrics');
        }
    }

    dispose(): void {
        if (this.panel) {
            this.panel.dispose();
            this.panel = undefined;
        }
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = undefined;
        }
    }
}