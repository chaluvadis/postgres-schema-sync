import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';
import { ConnectionManager } from '../managers/ConnectionManager';
import { SchemaManager } from '../managers/SchemaManager';

export interface DashboardData {
    connections: {
        total: number;
        active: number;
        inactive: number;
        recentActivity: ConnectionActivity[];
    };
    performance: {
        averageQueryTime: number;
        totalQueries: number;
        cacheHitRate: number;
        slowQueries: number;
        trends: PerformanceTrend[];
    };
    schema: {
        totalObjects: number;
        recentChanges: SchemaChange[];
        validationErrors: number;
        lastSync: string;
    };
    security: {
        overallStatus: 'secure' | 'warning' | 'insecure';
        activeAlerts: number;
        recentEvents: SecurityEvent[];
        complianceScore: number;
    };
    system: {
        uptime: string;
        memoryUsage: NodeJS.MemoryUsage;
        extensionVersion: string;
        lastUpdate: string;
    };
}

export interface ConnectionActivity {
    id: string;
    connectionName: string;
    action: 'connected' | 'disconnected' | 'query' | 'error';
    timestamp: string;
    details?: string;
    duration?: number;
}

export interface PerformanceTrend {
    metric: string;
    trend: 'improving' | 'degrading' | 'stable';
    changePercent: number;
    timeframe: string;
}

export interface SchemaChange {
    id: string;
    type: 'created' | 'modified' | 'deleted';
    objectType: string;
    objectName: string;
    schema: string;
    timestamp: string;
    user?: string;
}

export interface SecurityEvent {
    id: string;
    type: 'authentication' | 'authorization' | 'data_access' | 'configuration';
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    timestamp: string;
    resolved: boolean;
}

export class DashboardView {
    private panel: vscode.WebviewPanel | undefined;
    private dashboardData: DashboardData | undefined;
    private refreshInterval: NodeJS.Timeout | undefined;

    constructor(
        private connectionManager: ConnectionManager,
        private schemaManager: SchemaManager,
        private performanceMonitor?: any // Removed PerformanceMonitor
    ) {}

    async showDashboard(): Promise<void> {
        try {
            Logger.info('Opening PostgreSQL dashboard');

            this.panel = vscode.window.createWebviewPanel(
                'postgresqlDashboard',
                'PostgreSQL Extension Dashboard',
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

            // Load initial data and start auto-refresh
            await this.loadDashboardData();
            this.startAutoRefresh();

            // Generate and set HTML content
            const htmlContent = await this.generateDashboardHtml(this.dashboardData!);
            this.panel.webview.html = htmlContent;

            // Handle messages from webview
            this.panel.webview.onDidReceiveMessage(async (message) => {
                await this.handleWebviewMessage(message);
            });

        } catch (error) {
            Logger.error('Failed to show dashboard', error as Error);
            vscode.window.showErrorMessage(
                `Failed to open dashboard: ${(error as Error).message}`
            );
        }
    }

    private async loadDashboardData(): Promise<void> {
        try {
            const connections = this.connectionManager.getConnections();
            const performanceSummary = this.performanceMonitor.getPerformanceSummary(1);

            // Mock data for demonstration - in real implementation, this would come from actual services
            this.dashboardData = {
                connections: {
                    total: connections.length,
                    active: connections.filter(c => c.status === 'Connected').length,
                    inactive: connections.filter(c => c.status !== 'Connected').length,
                    recentActivity: this.getRecentConnectionActivity()
                },
                performance: {
                    averageQueryTime: performanceSummary.averageResponseTime,
                    totalQueries: performanceSummary.totalOperations,
                    cacheHitRate: 0.85, // Mock data
                    slowQueries: Math.floor(performanceSummary.totalOperations * 0.05), // Mock data
                    trends: this.getPerformanceTrends()
                },
                schema: {
                    totalObjects: 0, // Would be calculated from actual schema data
                    recentChanges: this.getRecentSchemaChanges(),
                    validationErrors: 0, // Would come from validation service
                    lastSync: new Date().toISOString()
                },
                security: {
                    overallStatus: 'secure', // Would come from security service
                    activeAlerts: 0, // Would come from security service
                    recentEvents: this.getRecentSecurityEvents(),
                    complianceScore: 95 // Mock data
                },
                system: {
                    uptime: this.getSystemUptime(),
                    memoryUsage: process.memoryUsage(),
                    extensionVersion: '1.0.0', // Would come from package.json
                    lastUpdate: new Date().toISOString()
                }
            };

        } catch (error) {
            Logger.error('Failed to load dashboard data', error as Error);
            throw error;
        }
    }

    private getRecentConnectionActivity(): ConnectionActivity[] {
        // Mock data - in real implementation, this would come from connection logs
        return [
            {
                id: '1',
                connectionName: 'Production DB',
                action: 'connected',
                timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
                details: 'SSL connection established'
            },
            {
                id: '2',
                connectionName: 'Development DB',
                action: 'query',
                timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
                details: 'SELECT query executed',
                duration: 45
            },
            {
                id: '3',
                connectionName: 'Production DB',
                action: 'error',
                timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
                details: 'Connection timeout'
            }
        ];
    }

    private getPerformanceTrends(): PerformanceTrend[] {
        // Mock data - in real implementation, this would be calculated from actual metrics
        return [
            {
                metric: 'Query Response Time',
                trend: 'improving',
                changePercent: -12.5,
                timeframe: 'Last hour'
            },
            {
                metric: 'Cache Hit Rate',
                trend: 'stable',
                changePercent: 2.1,
                timeframe: 'Last hour'
            },
            {
                metric: 'Memory Usage',
                trend: 'degrading',
                changePercent: 8.3,
                timeframe: 'Last hour'
            }
        ];
    }

    private getRecentSchemaChanges(): SchemaChange[] {
        // Mock data - in real implementation, this would come from schema audit logs
        return [
            {
                id: '1',
                type: 'created',
                objectType: 'table',
                objectName: 'user_preferences',
                schema: 'public',
                timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
                user: 'developer'
            },
            {
                id: '2',
                type: 'modified',
                objectType: 'function',
                objectName: 'calculate_total',
                schema: 'public',
                timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
                user: 'developer'
            }
        ];
    }

    private getRecentSecurityEvents(): SecurityEvent[] {
        // Mock data - in real implementation, this would come from security audit logs
        return [
            {
                id: '1',
                type: 'authentication',
                severity: 'low',
                description: 'Successful login from trusted IP',
                timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
                resolved: true
            }
        ];
    }

    private getSystemUptime(): string {
        // Mock uptime calculation
        const uptimeMs = process.uptime() * 1000;
        const hours = Math.floor(uptimeMs / (1000 * 60 * 60));
        const minutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours}h ${minutes}m`;
    }

    private startAutoRefresh(): void {
        this.refreshInterval = setInterval(async () => {
            await this.refreshDashboard();
        }, 30000); // Refresh every 30 seconds
    }

    private async refreshDashboard(): Promise<void> {
        if (this.panel && this.panel.visible) {
            await this.loadDashboardData();
            const htmlContent = await this.generateDashboardHtml(this.dashboardData!);
            this.panel.webview.html = htmlContent;
        }
    }

    private async generateDashboardHtml(data: DashboardData): Promise<string> {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>PostgreSQL Extension Dashboard</title>
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
                        --vscode-input-border: #3c3c3c;
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

                    .header-left {
                        display: flex;
                        align-items: center;
                        gap: 15px;
                    }

                    .header-right {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                    }

                    .dashboard-title {
                        font-size: 18px;
                        font-weight: bold;
                        margin: 0;
                    }

                    .last-updated {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                    }

                    .refresh-btn {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        border-radius: 3px;
                        padding: 6px 12px;
                        font-size: 12px;
                        cursor: pointer;
                        transition: background-color 0.2s;
                    }

                    .refresh-btn:hover {
                        background: var(--vscode-button-hoverBackground);
                    }

                    .content-area {
                        flex: 1;
                        overflow: auto;
                        padding: 20px;
                    }

                    .dashboard-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                        gap: 20px;
                        margin-bottom: 20px;
                    }

                    .dashboard-card {
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 6px;
                        overflow: hidden;
                    }

                    .card-header {
                        background: var(--vscode-titleBar-activeBackground, #2f2f2f);
                        padding: 12px 15px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }

                    .card-title {
                        font-weight: bold;
                        font-size: 13px;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }

                    .card-title-icon {
                        width: 16px;
                        height: 16px;
                        border-radius: 50%;
                    }

                    .icon-connections { background: var(--vscode-gitDecoration-addedResourceForeground); }
                    .icon-performance { background: var(--vscode-gitDecoration-modifiedResourceForeground); }
                    .icon-schema { background: var(--vscode-gitDecoration-renamedResourceForeground); }
                    .icon-security { background: var(--vscode-textLink-foreground); }
                    .icon-system { background: var(--vscode-gitDecoration-deletedResourceForeground); }

                    .card-actions {
                        display: flex;
                        gap: 5px;
                    }

                    .card-action {
                        background: none;
                        border: none;
                        color: var(--vscode-textLink-foreground);
                        cursor: pointer;
                        padding: 4px;
                        border-radius: 3px;
                        font-size: 12px;
                    }

                    .card-action:hover {
                        background: var(--vscode-list-hoverBackground);
                    }

                    .card-content {
                        padding: 15px;
                    }

                    .metric-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
                        gap: 15px;
                    }

                    .metric-item {
                        text-align: center;
                    }

                    .metric-value {
                        font-size: 24px;
                        font-weight: bold;
                        color: var(--vscode-textLink-foreground);
                        margin-bottom: 5px;
                    }

                    .metric-label {
                        font-size: 11px;
                        color: var(--vscode-descriptionForeground);
                        text-transform: uppercase;
                        font-weight: bold;
                    }

                    .status-indicator {
                        display: inline-block;
                        width: 8px;
                        height: 8px;
                        border-radius: 50%;
                        margin-right: 5px;
                    }

                    .status-good { background: var(--vscode-gitDecoration-addedResourceForeground); }
                    .status-warning { background: var(--vscode-gitDecoration-renamedResourceForeground); }
                    .status-error { background: var(--vscode-gitDecoration-deletedResourceForeground); }

                    .activity-list {
                        max-height: 200px;
                        overflow-y: auto;
                    }

                    .activity-item {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 8px 0;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        font-size: 12px;
                    }

                    .activity-item:last-child {
                        border-bottom: none;
                    }

                    .activity-icon {
                        width: 12px;
                        height: 12px;
                        border-radius: 50%;
                        flex-shrink: 0;
                    }

                    .activity-connected { background: var(--vscode-gitDecoration-addedResourceForeground); }
                    .activity-disconnected { background: var(--vscode-gitDecoration-deletedResourceForeground); }
                    .activity-query { background: var(--vscode-gitDecoration-modifiedResourceForeground); }
                    .activity-error { background: var(--vscode-gitDecoration-deletedResourceForeground); }

                    .activity-content {
                        flex: 1;
                    }

                    .activity-title {
                        font-weight: bold;
                        margin-bottom: 2px;
                    }

                    .activity-time {
                        color: var(--vscode-descriptionForeground);
                        font-size: 11px;
                    }

                    .trend-item {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 8px 0;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        font-size: 12px;
                    }

                    .trend-item:last-child {
                        border-bottom: none;
                    }

                    .trend-metric {
                        font-weight: bold;
                    }

                    .trend-indicator {
                        display: flex;
                        align-items: center;
                        gap: 5px;
                        font-size: 11px;
                    }

                    .trend-improving { color: var(--vscode-gitDecoration-addedResourceForeground); }
                    .trend-degrading { color: var(--vscode-gitDecoration-deletedResourceForeground); }
                    .trend-stable { color: var(--vscode-descriptionForeground); }

                    .trend-arrow {
                        font-weight: bold;
                    }

                    .schema-changes {
                        max-height: 150px;
                        overflow-y: auto;
                    }

                    .change-item {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        padding: 6px 0;
                        font-size: 12px;
                    }

                    .change-icon {
                        width: 10px;
                        height: 10px;
                        border-radius: 50%;
                        flex-shrink: 0;
                    }

                    .change-created { background: var(--vscode-gitDecoration-addedResourceForeground); }
                    .change-modified { background: var(--vscode-gitDecoration-modifiedResourceForeground); }
                    .change-deleted { background: var(--vscode-gitDecoration-deletedResourceForeground); }

                    .security-score {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        margin-bottom: 10px;
                    }

                    .score-circle {
                        width: 60px;
                        height: 60px;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 18px;
                        font-weight: bold;
                        background: conic-gradient(
                            var(--vscode-gitDecoration-addedResourceForeground) 0deg ${data.security.complianceScore * 3.6}deg,
                            var(--vscode-panel-border) ${data.security.complianceScore * 3.6}deg 360deg
                        );
                    }

                    .score-label {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                    }

                    .footer {
                        padding: 15px 20px;
                        border-top: 1px solid var(--vscode-panel-border);
                        background: var(--vscode-editor-background);
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }

                    .system-info {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                    }

                    .action-buttons {
                        display: flex;
                        gap: 10px;
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

                    @media (max-width: 768px) {
                        .dashboard-grid {
                            grid-template-columns: 1fr;
                        }

                        .metric-grid {
                            grid-template-columns: repeat(2, 1fr);
                        }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="header-left">
                        <h1 class="dashboard-title">PostgreSQL Extension Dashboard</h1>
                        <div class="last-updated">Last updated: ${new Date().toLocaleTimeString()}</div>
                    </div>
                    <div class="header-right">
                        <button class="refresh-btn" onclick="refreshDashboard()">Refresh</button>
                    </div>
                </div>

                <div class="content-area">
                    <div class="dashboard-grid">
                        <!-- Connections Card -->
                        <div class="dashboard-card">
                            <div class="card-header">
                                <div class="card-title">
                                    <div class="card-title-icon icon-connections"></div>
                                    Database Connections
                                </div>
                                <div class="card-actions">
                                    <button class="card-action" onclick="manageConnections()" title="Manage Connections">⚙️</button>
                                </div>
                            </div>
                            <div class="card-content">
                                <div class="metric-grid">
                                    <div class="metric-item">
                                        <div class="metric-value">${data.connections.total}</div>
                                        <div class="metric-label">Total</div>
                                    </div>
                                    <div class="metric-item">
                                        <div class="metric-value" style="color: var(--vscode-gitDecoration-addedResourceForeground);">${data.connections.active}</div>
                                        <div class="metric-label">Active</div>
                                    </div>
                                    <div class="metric-item">
                                        <div class="metric-value" style="color: var(--vscode-gitDecoration-deletedResourceForeground);">${data.connections.inactive}</div>
                                        <div class="metric-label">Inactive</div>
                                    </div>
                                </div>

                                <div style="margin-top: 15px;">
                                    <div style="font-size: 12px; font-weight: bold; margin-bottom: 8px;">Recent Activity</div>
                                    <div class="activity-list">
                                        ${data.connections.recentActivity.map(activity => `
                                            <div class="activity-item">
                                                <div class="activity-icon activity-${activity.action}"></div>
                                                <div class="activity-content">
                                                    <div class="activity-title">${activity.connectionName} - ${activity.action}</div>
                                                    <div class="activity-time">${new Date(activity.timestamp).toLocaleTimeString()}</div>
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Performance Card -->
                        <div class="dashboard-card">
                            <div class="card-header">
                                <div class="card-title">
                                    <div class="card-title-icon icon-performance"></div>
                                    Performance Metrics
                                </div>
                                <div class="card-actions">
                                    <button class="card-action" onclick="viewPerformanceReport()" title="View Report">📊</button>
                                </div>
                            </div>
                            <div class="card-content">
                                <div class="metric-grid">
                                    <div class="metric-item">
                                        <div class="metric-value">${data.performance.averageQueryTime.toFixed(0)}ms</div>
                                        <div class="metric-label">Avg Query Time</div>
                                    </div>
                                    <div class="metric-item">
                                        <div class="metric-value">${data.performance.totalQueries}</div>
                                        <div class="metric-label">Total Queries</div>
                                    </div>
                                    <div class="metric-item">
                                        <div class="metric-value">${(data.performance.cacheHitRate * 100).toFixed(1)}%</div>
                                        <div class="metric-label">Cache Hit Rate</div>
                                    </div>
                                    <div class="metric-item">
                                        <div class="metric-value" style="color: var(--vscode-gitDecoration-deletedResourceForeground);">${data.performance.slowQueries}</div>
                                        <div class="metric-label">Slow Queries</div>
                                    </div>
                                </div>

                                <div style="margin-top: 15px;">
                                    <div style="font-size: 12px; font-weight: bold; margin-bottom: 8px;">Performance Trends</div>
                                    ${data.performance.trends.map(trend => `
                                        <div class="trend-item">
                                            <span class="trend-metric">${trend.metric}</span>
                                            <span class="trend-indicator trend-${trend.trend}">
                                                <span class="trend-arrow">
                                                    ${trend.trend === 'improving' ? '↗' : trend.trend === 'degrading' ? '↘' : '→'}
                                                </span>
                                                ${trend.changePercent > 0 ? '+' : ''}${trend.changePercent.toFixed(1)}%
                                            </span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        </div>

                        <!-- Schema Card -->
                        <div class="dashboard-card">
                            <div class="card-header">
                                <div class="card-title">
                                    <div class="card-title-icon icon-schema"></div>
                                    Schema Management
                                </div>
                                <div class="card-actions">
                                    <button class="card-action" onclick="browseSchema()" title="Browse Schema">🔍</button>
                                </div>
                            </div>
                            <div class="card-content">
                                <div class="metric-grid">
                                    <div class="metric-item">
                                        <div class="metric-value">${data.schema.totalObjects}</div>
                                        <div class="metric-label">Total Objects</div>
                                    </div>
                                    <div class="metric-item">
                                        <div class="metric-value">${data.schema.recentChanges.length}</div>
                                        <div class="metric-label">Recent Changes</div>
                                    </div>
                                    <div class="metric-item">
                                        <div class="metric-value" style="color: ${data.schema.validationErrors > 0 ? 'var(--vscode-gitDecoration-deletedResourceForeground)' : 'var(--vscode-gitDecoration-addedResourceForeground)'};">${data.schema.validationErrors}</div>
                                        <div class="metric-label">Validation Errors</div>
                                    </div>
                                </div>

                                <div style="margin-top: 15px;">
                                    <div style="font-size: 12px; font-weight: bold; margin-bottom: 8px;">Recent Changes</div>
                                    <div class="schema-changes">
                                        ${data.schema.recentChanges.map(change => `
                                            <div class="change-item">
                                                <div class="change-icon change-${change.type}"></div>
                                                <div>
                                                    <strong>${change.objectName}</strong> (${change.objectType})
                                                    <div style="font-size: 11px; color: var(--vscode-descriptionForeground);">
                                                        ${new Date(change.timestamp).toLocaleDateString()}
                                                    </div>
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Security Card -->
                        <div class="dashboard-card">
                            <div class="card-header">
                                <div class="card-title">
                                    <div class="card-title-icon icon-security"></div>
                                    Security Status
                                </div>
                            </div>
                            <div class="card-content">
                                <div class="security-score">
                                    <div class="score-circle">
                                        ${data.security.complianceScore}%
                                    </div>
                                    <div>
                                        <div style="font-size: 14px; font-weight: bold;">${data.security.overallStatus.toUpperCase()}</div>
                                        <div class="score-label">Compliance Score</div>
                                    </div>
                                </div>

                                <div class="metric-grid">
                                    <div class="metric-item">
                                        <div class="metric-value" style="color: ${data.security.activeAlerts > 0 ? 'var(--vscode-gitDecoration-deletedResourceForeground)' : 'var(--vscode-gitDecoration-addedResourceForeground)'};">${data.security.activeAlerts}</div>
                                        <div class="metric-label">Active Alerts</div>
                                    </div>
                                    <div class="metric-item">
                                        <div class="metric-value">${data.security.recentEvents.length}</div>
                                        <div class="metric-label">Recent Events</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- System Card -->
                        <div class="dashboard-card">
                            <div class="card-header">
                                <div class="card-title">
                                    <div class="card-title-icon icon-system"></div>
                                    System Status
                                </div>
                                <div class="card-actions">
                                    <button class="card-action" onclick="viewSystemInfo()" title="View Info">ℹ️</button>
                                </div>
                            </div>
                            <div class="card-content">
                                <div class="metric-grid">
                                    <div class="metric-item">
                                        <div class="metric-value">${data.system.uptime}</div>
                                        <div class="metric-label">Uptime</div>
                                    </div>
                                    <div class="metric-item">
                                        <div class="metric-value">${(data.system.memoryUsage.heapUsed / 1024 / 1024).toFixed(1)}MB</div>
                                        <div class="metric-label">Memory Usage</div>
                                    </div>
                                    <div class="metric-item">
                                        <div class="metric-value">${data.system.extensionVersion}</div>
                                        <div class="metric-label">Version</div>
                                    </div>
                                </div>

                                <div style="margin-top: 15px; font-size: 11px; color: var(--vscode-descriptionForeground);">
                                    Last Update: ${new Date(data.system.lastUpdate).toLocaleString()}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="footer">
                    <div class="system-info">
                        PostgreSQL Extension Dashboard • Real-time monitoring active
                    </div>
                    <div class="action-buttons">
                        <button class="btn btn-secondary" onclick="exportDashboard()">Export Report</button>
                        <button class="btn btn-primary" onclick="openSettings()">Settings</button>
                    </div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();

                    function refreshDashboard() {
                        vscode.postMessage({
                            command: 'refreshDashboard'
                        });
                    }

                    function manageConnections() {
                        vscode.postMessage({
                            command: 'manageConnections'
                        });
                    }

                    function viewPerformanceReport() {
                        vscode.postMessage({
                            command: 'viewPerformanceReport'
                        });
                    }

                    function browseSchema() {
                        vscode.postMessage({
                            command: 'browseSchema'
                        });
                    }


                    function viewSystemInfo() {
                        vscode.postMessage({
                            command: 'viewSystemInfo'
                        });
                    }

                    function exportDashboard() {
                        vscode.postMessage({
                            command: 'exportDashboard'
                        });
                    }

                    function openSettings() {
                        vscode.postMessage({
                            command: 'openSettings'
                        });
                    }

                    // Auto-refresh every 30 seconds
                    setInterval(refreshDashboard, 30000);
                </script>
            </body>
            </html>
        `;
    }

    private async handleWebviewMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'refreshDashboard':
                await this.refreshDashboard();
                break;

            case 'manageConnections':
                await vscode.commands.executeCommand('postgresql.manageConnections');
                break;

            case 'viewPerformanceReport':
                this.performanceMonitor.showPerformanceReport();
                break;

            case 'browseSchema':
                await vscode.commands.executeCommand('postgresql.browseSchema');
                break;


            case 'viewSystemInfo':
                await this.showSystemInformation();
                break;

            case 'exportDashboard':
                await this.exportDashboardReport();
                break;

            case 'openSettings':
                await vscode.commands.executeCommand('postgresql.openSettings');
                break;
        }
    }

    private async showSystemInformation(): Promise<void> {
        if (!this.dashboardData) return;

        const systemInfo = `
System Information:
- Extension Version: ${this.dashboardData.system.extensionVersion}
- Uptime: ${this.dashboardData.system.uptime}
- Memory Usage: ${(this.dashboardData.system.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB
- Platform: ${process.platform}
- Node Version: ${process.version}
- Last Update: ${new Date(this.dashboardData.system.lastUpdate).toLocaleString()}
        `;

        const outputChannel = vscode.window.createOutputChannel('PostgreSQL System Info');
        outputChannel.clear();
        outputChannel.appendLine(systemInfo);
        outputChannel.show();
    }

    private async exportDashboardReport(): Promise<void> {
        if (!this.dashboardData) return;

        try {
            const reportContent = this.generateDashboardReport(this.dashboardData);
            const uri = await vscode.window.showSaveDialog({
                filters: {
                    'Text Files': ['txt'],
                    'JSON Files': ['json'],
                    'All Files': ['*']
                },
                defaultUri: vscode.Uri.file(`postgresql-dashboard-${new Date().toISOString().split('T')[0]}.txt`)
            });

            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(reportContent, 'utf8'));
                vscode.window.showInformationMessage('Dashboard report exported successfully');
            }
        } catch (error) {
            Logger.error('Failed to export dashboard report', error as Error);
            vscode.window.showErrorMessage('Failed to export dashboard report');
        }
    }

    private generateDashboardReport(data: DashboardData): string {
        return `PostgreSQL Extension Dashboard Report
Generated: ${new Date().toISOString()}

CONNECTIONS:
- Total Connections: ${data.connections.total}
- Active Connections: ${data.connections.active}
- Inactive Connections: ${data.connections.inactive}

PERFORMANCE:
- Average Query Time: ${data.performance.averageQueryTime.toFixed(2)}ms
- Total Queries: ${data.performance.totalQueries}
- Cache Hit Rate: ${(data.performance.cacheHitRate * 100).toFixed(2)}%
- Slow Queries: ${data.performance.slowQueries}

SCHEMA:
- Total Objects: ${data.schema.totalObjects}
- Recent Changes: ${data.schema.recentChanges.length}
- Validation Errors: ${data.schema.validationErrors}
- Last Sync: ${new Date(data.schema.lastSync).toLocaleString()}

SECURITY:
- Overall Status: ${data.security.overallStatus.toUpperCase()}
- Active Alerts: ${data.security.activeAlerts}
- Recent Events: ${data.security.recentEvents.length}
- Compliance Score: ${data.security.complianceScore}%

SYSTEM:
- Uptime: ${data.system.uptime}
- Memory Usage: ${(data.system.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB
- Extension Version: ${data.system.extensionVersion}
- Last Update: ${new Date(data.system.lastUpdate).toLocaleString()}
`;
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
        this.dashboardData = undefined;
    }
}