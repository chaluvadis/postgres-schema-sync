import * as vscode from 'vscode';
import { PerformanceMonitorService, PerformanceReport } from '@/services/PerformanceMonitorService';
import { Logger } from '@/utils/Logger';
import { ErrorHandler } from '@/utils/ErrorHandler';

export class QueryAnalyticsView {
    private context: vscode.ExtensionContext;
    private performanceMonitor: PerformanceMonitorService;
    private webviewPanel?: vscode.WebviewPanel;
    private currentReport?: PerformanceReport;

    constructor(
        context: vscode.ExtensionContext,
        performanceMonitor: PerformanceMonitorService,
    ) {
        this.context = context;
        this.performanceMonitor = performanceMonitor;
    }

    async showAnalytics(connectionId?: string): Promise<void> {
        try {
            Logger.info('Opening query analytics view', 'showAnalytics', { connectionId });

            // Create or focus existing webview panel
            if (!this.webviewPanel) {
                this.webviewPanel = vscode.window.createWebviewPanel(
                    'queryAnalytics',
                    'Query Performance Analytics',
                    vscode.ViewColumn.One,
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

            // Generate performance report
            await this.generateReport(connectionId);

            // Update webview content
            await this.updateWebviewContent();

            this.webviewPanel.reveal();

        } catch (error) {
            Logger.error('Failed to show analytics view', error as Error);
            ErrorHandler.handleError(error, ErrorHandler.createContext('ShowAnalytics'));
        }
    }

    private async generateReport(connectionId?: string): Promise<void> {
        try {
            // Get available connections for selection
            const connections = await this.getAvailableConnections();

            if (connections.length === 0) {
                throw new Error('No database connections available');
            }

            let selectedConnectionId = connectionId;

            // If no specific connection and multiple available, show selection dialog
            if (!selectedConnectionId && connections.length > 1) {
                const selected = await vscode.window.showQuickPick(
                    connections.map(conn => ({
                        label: conn.name,
                        detail: `${conn.host}:${conn.port}/${conn.database}`,
                        connectionId: conn.id
                    })),
                    { placeHolder: 'Select a database connection for analytics' }
                );

                if (!selected) {return;}
                selectedConnectionId = selected.connectionId;
            } else if (!selectedConnectionId) {
                selectedConnectionId = connections[0].id;
            }

            // Generate comprehensive report
            if (!selectedConnectionId) {
                throw new Error('No connection selected for analytics');
            }

            this.currentReport = this.performanceMonitor.generatePerformanceReport(
                selectedConnectionId,
                `Performance Report - ${new Date().toLocaleDateString()}`,
                24 // 24 hours
            );

            Logger.info('Performance report generated', 'generateReport', {
                connectionId: selectedConnectionId,
                totalQueries: this.currentReport.summary.totalQueries
            });

        } catch (error) {
            Logger.error('Failed to generate performance report', error as Error);
            throw error;
        }
    }

    private async getAvailableConnections(): Promise<any[]> {
        // This would typically get connections from ConnectionManager
        // For now, return mock data
        return [
            {
                id: 'conn-1',
                name: 'Development DB',
                host: 'localhost',
                port: 5432,
                database: 'dev_db'
            }
        ];
    }

    private setupMessageHandler(): void {
        if (!this.webviewPanel) {return;}

        this.webviewPanel.webview.onDidReceiveMessage(async (message) => {
            try {
                switch (message.command) {
                    case 'refreshReport':
                        await this.generateReport(message.connectionId);
                        await this.updateWebviewContent();
                        break;

                    case 'changeTimeRange':
                        await this.changeTimeRange(message.hours);
                        await this.updateWebviewContent();
                        break;

                    case 'resolveAlert':
                        this.performanceMonitor.resolveAlert(message.alertId, message.resolution);
                        await this.updateWebviewContent();
                        break;

                    case 'applyRecommendation':
                        this.performanceMonitor.updateRecommendationStatus(message.recommendationId, 'Applied');
                        await this.updateWebviewContent();
                        break;

                    case 'dismissRecommendation':
                        this.performanceMonitor.updateRecommendationStatus(message.recommendationId, 'Dismissed');
                        await this.updateWebviewContent();
                        break;

                    case 'exportReport':
                        await this.exportReport(message.format);
                        break;
                }
            } catch (error) {
                Logger.error('Error handling analytics message', error as Error);
                ErrorHandler.handleError(error, ErrorHandler.createContext('AnalyticsMessage'));
            }
        });
    }

    private async changeTimeRange(_hours: number): Promise<void> {
        if (!this.currentReport) {return;}

        // Regenerate report with new time range
        const connectionId = this.currentReport.summary.totalQueries > 0 ?
            this.currentReport.id.split('-')[0] : undefined;

        await this.generateReport(connectionId);
    }

    private async exportReport(format: 'pdf' | 'html' | 'json'): Promise<void> {
        try {
            if (!this.currentReport) {
                vscode.window.showErrorMessage('No report available to export');
                return;
            }

            const uri = await vscode.window.showSaveDialog({
                filters: {
                    'PDF': ['pdf'],
                    'HTML': ['html'],
                    'JSON': ['json']
                },
                defaultUri: vscode.Uri.file(`performance_report_${Date.now()}.${format}`)
            });

            if (uri) {
                await this.performExport(this.currentReport, format, uri.fsPath);
                vscode.window.showInformationMessage(`Report exported to ${uri.fsPath}`);
            }

        } catch (error) {
            Logger.error('Failed to export report', error as Error);
            vscode.window.showErrorMessage(`Export failed: ${(error as Error).message}`);
        }
    }

    private async performExport(report: PerformanceReport, format: string, filePath: string): Promise<void> {
        let content: string;

        switch (format) {
            case 'json':
                content = JSON.stringify(report, null, 2);
                break;
            case 'html':
                content = this.generateHTMLReport(report);
                break;
            case 'pdf':
                // For PDF, generate HTML first and convert (simplified)
                content = this.generateHTMLReport(report);
                break;
            default:
                throw new Error(`Unsupported export format: ${format}`);
        }

        const fs = require('fs').promises;
        await fs.writeFile(filePath, content, 'utf8');
    }

    private generateHTMLReport(report: PerformanceReport): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>${report.title}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; }
                    .header { border-bottom: 2px solid #333; margin-bottom: 30px; }
                    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 30px 0; }
                    .metric-card { background: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; }
                    .metric-value { font-size: 2em; font-weight: bold; color: #2c3e50; }
                    .metric-label { color: #7f8c8d; margin-top: 10px; }
                    .section { margin: 40px 0; }
                    .section h2 { color: #2c3e50; border-bottom: 1px solid #bdc3c7; }
                    .alert { background: #ffeaa7; border: 1px solid #fdcb6e; padding: 15px; margin: 10px 0; border-radius: 5px; }
                    .alert.critical { background: #fab1a0; border-color: #e17055; }
                    .alert.high { background: #fd79a8; border-color: #e84393; }
                    .recommendation { background: #a0e7e5; border: 1px solid #55efc4; padding: 15px; margin: 10px 0; border-radius: 5px; }
                    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
                    th { background-color: #f8f9fa; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>${report.title}</h1>
                    <p>Generated: ${report.generatedAt.toLocaleString()}</p>
                    <p>Period: ${report.period.start.toLocaleString()} - ${report.period.end.toLocaleString()}</p>
                </div>

                <div class="summary">
                    <div class="metric-card">
                        <div class="metric-value">${report.summary.totalQueries}</div>
                        <div class="metric-label">Total Queries</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value">${report.summary.averageExecutionTime.toFixed(0)}ms</div>
                        <div class="metric-label">Avg Execution Time</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value">${report.summary.slowQueries}</div>
                        <div class="metric-label">Slow Queries</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value">${report.summary.errorRate.toFixed(1)}%</div>
                        <div class="metric-label">Error Rate</div>
                    </div>
                </div>

                ${report.alerts.length > 0 ? `
                    <div class="section">
                        <h2>Active Alerts (${report.alerts.length})</h2>
                        ${report.alerts.map(alert => `
                            <div class="alert ${alert.severity.toLowerCase()}">
                                <strong>${alert.title}</strong><br>
                                ${alert.description}<br>
                                <small>${alert.timestamp.toLocaleString()}</small>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}

                ${report.recommendations.length > 0 ? `
                    <div class="section">
                        <h2>Performance Recommendations (${report.recommendations.length})</h2>
                        ${report.recommendations.map(rec => `
                            <div class="recommendation">
                                <strong>${rec.title}</strong> (${rec.impact} Impact, ${rec.effort} Effort)<br>
                                ${rec.description}<br>
                                <strong>Suggested Action:</strong> ${rec.suggestedAction}<br>
                                <strong>Estimated Improvement:</strong> ${rec.estimatedImprovement}
                            </div>
                        `).join('')}
                    </div>
                ` : ''}

                ${report.topSlowQueries.length > 0 ? `
                    <div class="section">
                        <h2>Top Slow Queries</h2>
                        <table>
                            <thead>
                                <tr>
                                    <th>Execution Time</th>
                                    <th>Query</th>
                                    <th>Rows</th>
                                    <th>Timestamp</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${report.topSlowQueries.map(query => `
                                    <tr>
                                        <td>${query.executionTime}ms</td>
                                        <td>${query.query.length > 100 ? query.query.substring(0, 100) + '...' : query.query}</td>
                                        <td>${query.rowsReturned}</td>
                                        <td>${query.timestamp.toLocaleString()}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                ` : ''}
            </body>
            </html>
        `;
    }

    private async updateWebviewContent(): Promise<void> {
        if (!this.webviewPanel || !this.currentReport) {return;}

        const html = await this.generateAnalyticsHtml(this.currentReport);
        this.webviewPanel.webview.html = html;
    }

    private async generateAnalyticsHtml(report: PerformanceReport): Promise<string> {
        const stats = report.summary;
        const trends = report.performanceTrends;

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Query Performance Analytics</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        margin: 0;
                        padding: 20px;
                        background: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                    }

                    .header {
                        margin-bottom: 30px;
                        padding-bottom: 20px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                    }

                    .controls {
                        margin-bottom: 20px;
                        display: flex;
                        gap: 15px;
                        align-items: center;
                    }

                    .time-range-selector {
                        display: flex;
                        gap: 10px;
                    }

                    .time-range-btn {
                        padding: 6px 12px;
                        border: 1px solid var(--vscode-button-border);
                        background: var(--vscode-button-secondaryBackground);
                        color: var(--vscode-button-secondaryForeground);
                        border-radius: 3px;
                        cursor: pointer;
                    }

                    .time-range-btn.active {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                    }

                    .summary-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                        gap: 20px;
                        margin-bottom: 30px;
                    }

                    .metric-card {
                        background: var(--vscode-textBlockQuote-background);
                        padding: 20px;
                        border-radius: 8px;
                        border: 1px solid var(--vscode-textBlockQuote-border);
                        text-align: center;
                    }

                    .metric-value {
                        font-size: 2em;
                        font-weight: bold;
                        color: var(--vscode-textLink-foreground);
                    }

                    .metric-label {
                        color: var(--vscode-descriptionForeground);
                        margin-top: 8px;
                        font-size: 0.9em;
                    }

                    .metric-trend {
                        margin-top: 5px;
                        font-size: 0.8em;
                    }

                    .trend-up { color: var(--vscode-errorForeground); }
                    .trend-down { color: var(--vscode-charts-green); }
                    .trend-stable { color: var(--vscode-descriptionForeground); }

                    .section {
                        margin: 30px 0;
                        padding: 20px;
                        background: var(--vscode-editorWidget-background);
                        border-radius: 8px;
                        border: 1px solid var(--vscode-panel-border);
                    }

                    .section h3 {
                        margin-top: 0;
                        color: var(--vscode-textLink-foreground);
                        border-bottom: 1px solid var(--vscode-panel-border);
                        padding-bottom: 10px;
                    }

                    .alerts-grid {
                        display: grid;
                        gap: 15px;
                    }

                    .alert-card {
                        padding: 15px;
                        border-radius: 6px;
                        border-left: 4px solid;
                    }

                    .alert-card.critical {
                        background: var(--vscode-inputValidation-errorBackground);
                        border-color: var(--vscode-errorForeground);
                    }

                    .alert-card.high {
                        background: var(--vscode-inputValidation-warningBackground);
                        border-color: var(--vscode-editorWarning-foreground);
                    }

                    .alert-card.medium {
                        background: var(--vscode-inputValidation-infoBackground);
                        border-color: var(--vscode-textLink-foreground);
                    }

                    .recommendations-grid {
                        display: grid;
                        gap: 15px;
                    }

                    .recommendation-card {
                        padding: 15px;
                        background: var(--vscode-textBlockQuote-background);
                        border-radius: 6px;
                        border: 1px solid var(--vscode-textBlockQuote-border);
                    }

                    .recommendation-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 10px;
                    }

                    .recommendation-title {
                        font-weight: bold;
                        color: var(--vscode-textLink-foreground);
                    }

                    .impact-badge {
                        padding: 2px 8px;
                        border-radius: 12px;
                        font-size: 0.8em;
                        font-weight: bold;
                    }

                    .impact-high { background: var(--vscode-errorForeground); color: white; }
                    .impact-medium { background: var(--vscode-editorWarning-foreground); color: white; }
                    .impact-low { background: var(--vscode-descriptionForeground); color: white; }

                    .slow-queries-table {
                        width: 100%;
                        border-collapse: collapse;
                    }

                    .slow-queries-table th,
                    .slow-queries-table td {
                        padding: 10px;
                        text-align: left;
                        border-bottom: 1px solid var(--vscode-list-inactiveSelectionBackground);
                    }

                    .slow-queries-table th {
                        background: var(--vscode-breadcrumb-background);
                        font-weight: bold;
                    }

                    .slow-queries-table tbody tr:hover {
                        background: var(--vscode-list-hoverBackground);
                    }

                    .execution-time {
                        font-family: 'Courier New', monospace;
                    }

                    .btn {
                        padding: 8px 16px;
                        border: 1px solid var(--vscode-button-border);
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border-radius: 4px;
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
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>${report.title}</h1>
                    <div class="controls">
                        <div class="time-range-selector">
                            <button class="time-range-btn" onclick="changeTimeRange(1)">1h</button>
                            <button class="time-range-btn active" onclick="changeTimeRange(24)">24h</button>
                            <button class="time-range-btn" onclick="changeTimeRange(168)">7d</button>
                        </div>

                        <button class="btn" onclick="refreshReport()">Refresh</button>
                        <button class="btn btn-secondary" onclick="exportReport('html')">Export HTML</button>
                        <button class="btn btn-secondary" onclick="exportReport('json')">Export JSON</button>
                    </div>
                </div>

                <div class="summary-grid">
                    <div class="metric-card">
                        <div class="metric-value">${stats.totalQueries}</div>
                        <div class="metric-label">Total Queries</div>
                    </div>

                    <div class="metric-card">
                        <div class="metric-value">${stats.averageExecutionTime.toFixed(0)}ms</div>
                        <div class="metric-label">Avg Execution Time</div>
                    </div>

                    <div class="metric-card">
                        <div class="metric-value">${stats.slowQueries}</div>
                        <div class="metric-label">Slow Queries</div>
                    </div>

                    <div class="metric-card">
                        <div class="metric-value">${stats.errorRate.toFixed(1)}%</div>
                        <div class="metric-label">Error Rate</div>
                    </div>

                    <div class="metric-card">
                        <div class="metric-value">${stats.cacheHitRatio.toFixed(1)}%</div>
                        <div class="metric-label">Cache Hit Ratio</div>
                    </div>

                    <div class="metric-card">
                        <div class="metric-value">${(stats.totalExecutionTime / 1000).toFixed(1)}s</div>
                        <div class="metric-label">Total Execution Time</div>
                    </div>
                </div>

                ${report.alerts.length > 0 ? `
                    <div class="section">
                        <h3>Active Alerts (${report.alerts.length})</h3>
                        <div class="alerts-grid">
                            ${report.alerts.map(alert => `
                                <div class="alert-card ${alert.severity.toLowerCase()}">
                                    <div style="display: flex; justify-content: space-between; align-items: start;">
                                        <div>
                                            <strong>${alert.title}</strong><br>
                                            <span>${alert.description}</span><br>
                                            <small>${alert.timestamp.toLocaleString()}</small>
                                        </div>
                                        <button class="btn btn-secondary" onclick="resolveAlert('${alert.id}')"
                                                title="Mark as resolved">✓</button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                ${report.recommendations.length > 0 ? `
                    <div class="section">
                        <h3>Performance Recommendations (${report.recommendations.length})</h3>
                        <div class="recommendations-grid">
                            ${report.recommendations.map(rec => `
                                <div class="recommendation-card">
                                    <div class="recommendation-header">
                                        <span class="recommendation-title">${rec.title}</span>
                                        <span class="impact-badge impact-${rec.impact.toLowerCase()}">${rec.impact}</span>
                                    </div>
                                    <p>${rec.description}</p>
                                    <p><strong>Suggested:</strong> ${rec.suggestedAction}</p>
                                    <p><strong>Estimated Improvement:</strong> ${rec.estimatedImprovement}</p>
                                    <div style="margin-top: 10px;">
                                        <button class="btn" onclick="applyRecommendation('${rec.id}')"
                                                title="Mark as applied">Apply</button>
                                        <button class="btn btn-secondary" onclick="dismissRecommendation('${rec.id}')"
                                                title="Dismiss">Dismiss</button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                ${report.topSlowQueries.length > 0 ? `
                    <div class="section">
                        <h3>Top Slow Queries</h3>
                        <table class="slow-queries-table">
                            <thead>
                                <tr>
                                    <th>Execution Time</th>
                                    <th>Query Preview</th>
                                    <th>Rows Returned</th>
                                    <th>Timestamp</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${report.topSlowQueries.map(query => `
                                    <tr>
                                        <td class="execution-time">${query.executionTime}ms</td>
                                        <td title="${query.query}">
                                            ${query.query.length > 80 ? query.query.substring(0, 80) + '...' : query.query}
                                        </td>
                                        <td>${query.rowsReturned.toLocaleString()}</td>
                                        <td>${query.timestamp.toLocaleString()}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                ` : ''}

                <script>
                    const vscode = acquireVsCodeApi();

                    function refreshReport() {
                        vscode.postMessage({ command: 'refreshReport' });
                    }

                    function changeTimeRange(hours) {
                        document.querySelectorAll('.time-range-btn').forEach(btn => {
                            btn.classList.remove('active');
                        });
                        event.target.classList.add('active');

                        vscode.postMessage({
                            command: 'changeTimeRange',
                            hours: hours
                        });
                    }

                    function resolveAlert(alertId) {
                        const resolution = prompt('Enter resolution note (optional):');
                        vscode.postMessage({
                            command: 'resolveAlert',
                            alertId: alertId,
                            resolution: resolution
                        });
                    }

                    function applyRecommendation(recommendationId) {
                        vscode.postMessage({
                            command: 'applyRecommendation',
                            recommendationId: recommendationId
                        });
                    }

                    function dismissRecommendation(recommendationId) {
                        vscode.postMessage({
                            command: 'dismissRecommendation',
                            recommendationId: recommendationId
                        });
                    }

                    function exportReport(format) {
                        vscode.postMessage({
                            command: 'exportReport',
                            format: format
                        });
                    }
                </script>
            </body>
            </html>
        `;
    }

    dispose(): void {
        if (this.webviewPanel) {
            this.webviewPanel.dispose();
        }
    }
}