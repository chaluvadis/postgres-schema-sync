import * as vscode from 'vscode';
import { PerformanceMonitorService, PerformanceAlert } from '@/services/PerformanceMonitorService';
import { Logger } from '@/utils/Logger';

interface AlertRule {
    id: string;
    name: string;
    description: string;
    type: 'SlowQuery' | 'HighCPU' | 'LowMemory' | 'Deadlock' | 'IndexInefficiency' | 'ConnectionSpike' | 'Custom';
    condition: AlertCondition;
    severity: 'Low' | 'Medium' | 'High' | 'Critical';
    enabled: boolean;
    notificationChannels: NotificationChannel[];
    cooldownMinutes: number;
    createdAt: Date;
    updatedAt: Date;
}

interface AlertCondition {
    metric: string;
    operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
    threshold: number;
    duration?: number; // For sustained conditions (e.g., high CPU for 5 minutes)
    queryPattern?: string; // For query-specific alerts
}

interface NotificationChannel {
    type: 'vscode' | 'email' | 'slack' | 'teams' | 'webhook';
    enabled: boolean;
    configuration: Record<string, any>;
}


export interface AlertNotification {
    id: string;
    alertId: string;
    ruleId: string;
    channel: string;
    status: 'sent' | 'failed' | 'pending';
    sentAt?: Date;
    error?: string;
    retryCount: number;
}

export class PerformanceAlertSystem {
    private static instance: PerformanceAlertSystem;
    private performanceMonitor: PerformanceMonitorService;
    private context: vscode.ExtensionContext;
    private alertRules: Map<string, AlertRule> = new Map();
    private notifications: Map<string, AlertNotification> = new Map();
    private statusBarItem?: vscode.StatusBarItem;
    private alertViewProvider?: AlertTreeProvider;
    private isMonitoring: boolean = false;
    private checkInterval?: NodeJS.Timeout;

    private constructor(context: vscode.ExtensionContext, performanceMonitor: PerformanceMonitorService) {
        this.context = context;
        this.performanceMonitor = performanceMonitor;
        this.loadAlertRules();
        this.initializeUI();
    }
    static getInstance(context: vscode.ExtensionContext, performanceMonitor: PerformanceMonitorService): PerformanceAlertSystem {
        if (!PerformanceAlertSystem.instance) {
            PerformanceAlertSystem.instance = new PerformanceAlertSystem(context, performanceMonitor);
        }
        return PerformanceAlertSystem.instance;
    }
    private initializeUI(): void {
        // Create status bar item for alerts
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.command = 'postgresql.showPerformanceAlerts';
        this.context.subscriptions.push(this.statusBarItem);

        // Create tree view for alerts
        this.alertViewProvider = new AlertTreeProvider(this);
        const treeView = vscode.window.createTreeView('postgresqlPerformanceAlerts', {
            treeDataProvider: this.alertViewProvider,
            showCollapseAll: true
        });
        this.context.subscriptions.push(treeView);

        this.updateStatusBar();
    }
    private loadAlertRules(): void {
        try {
            const rulesData = this.context.globalState.get<string>('postgresql.alerts.rules', '[]');
            const rules = JSON.parse(rulesData) as AlertRule[];

            this.alertRules.clear();
            rules.forEach(rule => {
                this.alertRules.set(rule.id, {
                    ...rule,
                    createdAt: new Date(rule.createdAt),
                    updatedAt: new Date(rule.updatedAt)
                });
            });

            // Create default rules if none exist
            if (this.alertRules.size === 0) {
                this.createDefaultAlertRules();
            }

            Logger.info('Alert rules loaded', 'loadAlertRules', {
                ruleCount: this.alertRules.size
            });

        } catch (error) {
            Logger.error('Failed to load alert rules', error as Error);
            this.createDefaultAlertRules();
        }
    }
    private createDefaultAlertRules(): void {
        const defaultRules: Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'>[] = [
            {
                name: 'Slow Query Detection',
                description: 'Alert when queries exceed 5 seconds',
                type: 'SlowQuery',
                condition: {
                    metric: 'executionTime',
                    operator: '>',
                    threshold: 5000
                },
                severity: 'Medium',
                enabled: true,
                notificationChannels: [{
                    type: 'vscode',
                    enabled: true,
                    configuration: {}
                }],
                cooldownMinutes: 5
            },
            {
                name: 'High Query Load',
                description: 'Alert when query rate is too high',
                type: 'HighCPU',
                condition: {
                    metric: 'queriesPerSecond',
                    operator: '>',
                    threshold: 100
                },
                severity: 'High',
                enabled: true,
                notificationChannels: [{
                    type: 'vscode',
                    enabled: true,
                    configuration: {}
                }],
                cooldownMinutes: 10
            },
            {
                name: 'Database Deadlocks',
                description: 'Alert when deadlocks are detected',
                type: 'Deadlock',
                condition: {
                    metric: 'deadlocks',
                    operator: '>',
                    threshold: 0
                },
                severity: 'Critical',
                enabled: true,
                notificationChannels: [{
                    type: 'vscode',
                    enabled: true,
                    configuration: {}
                }],
                cooldownMinutes: 1
            }
        ];

        defaultRules.forEach(ruleData => {
            const rule: AlertRule = {
                ...ruleData,
                id: this.generateId(),
                createdAt: new Date(),
                updatedAt: new Date()
            };
            this.alertRules.set(rule.id, rule);
        });

        this.saveAlertRules();
        Logger.info('Default alert rules created', 'createDefaultAlertRules');
    }
    private saveAlertRules(): void {
        try {
            const rulesArray = Array.from(this.alertRules.values());
            this.context.globalState.update('postgresql.alerts.rules', JSON.stringify(rulesArray));
            Logger.info('Alert rules saved', 'saveAlertRules');
        } catch (error) {
            Logger.error('Failed to save alert rules', error as Error);
        }
    }
    getAlertRules(): AlertRule[] {
        return Array.from(this.alertRules.values())
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }
    stopAlertMonitoring(): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = undefined;
        }

        this.isMonitoring = false;
        Logger.info('Alert monitoring stopped', 'stopAlertMonitoring');
    }
    private updateStatusBar(): void {
        if (!this.statusBarItem) {return;}

        const alerts = this.performanceMonitor.getAlerts(undefined, undefined, undefined, true);
        const criticalAlerts = alerts.filter(a => a.severity === 'Critical').length;
        const highAlerts = alerts.filter(a => a.severity === 'High').length;
        const mediumAlerts = alerts.filter(a => a.severity === 'Medium').length;

        let status = '';
        let tooltip = '';

        if (criticalAlerts > 0) {
            status = `🚨 ${criticalAlerts}`;
            tooltip = `${criticalAlerts} critical alert${criticalAlerts > 1 ? 's' : ''}`;
        } else if (highAlerts > 0) {
            status = `⚠️ ${highAlerts}`;
            tooltip = `${highAlerts} high priority alert${highAlerts > 1 ? 's' : ''}`;
        } else if (mediumAlerts > 0) {
            status = `ℹ️ ${mediumAlerts}`;
            tooltip = `${mediumAlerts} medium priority alert${mediumAlerts > 1 ? 's' : ''}`;
        } else {
            status = '✅';
            tooltip = 'No active alerts';
        }

        this.statusBarItem.text = status;
        this.statusBarItem.tooltip = tooltip;

        if (alerts.length > 0) {
            this.statusBarItem.show();
        } else {
            this.statusBarItem.hide();
        }
    }
    getActiveAlerts(): PerformanceAlert[] {
        return this.performanceMonitor.getAlerts(undefined, undefined, undefined, true);
    }
    getAlertStats(): {
        totalRules: number;
        enabledRules: number;
        totalNotifications: number;
        failedNotifications: number;
        alertsBySeverity: Record<string, number>;
        alertsByType: Record<string, number>;
    } {
        const rules = this.getAlertRules();
        const notifications = Array.from(this.notifications.values());
        const alerts = this.getActiveAlerts();

        const alertsBySeverity = alerts.reduce((acc, alert) => {
            acc[alert.severity] = (acc[alert.severity] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const alertsByType = alerts.reduce((acc, alert) => {
            acc[alert.type] = (acc[alert.type] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        return {
            totalRules: rules.length,
            enabledRules: rules.filter(r => r.enabled).length,
            totalNotifications: notifications.length,
            failedNotifications: notifications.filter(n => n.status === 'failed').length,
            alertsBySeverity,
            alertsByType
        };
    }

    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    dispose(): void {
        this.stopAlertMonitoring();
        if (this.statusBarItem) {
            this.statusBarItem.dispose();
        }
    }
}

// Tree Provider for Alert View
class AlertTreeProvider implements vscode.TreeDataProvider<AlertTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<AlertTreeItem | undefined | null> = new vscode.EventEmitter<AlertTreeItem | undefined | null>();
    readonly onDidChangeTreeData: vscode.Event<AlertTreeItem | undefined | null> = this._onDidChangeTreeData.event;

    constructor(private alertSystem: PerformanceAlertSystem) {}

    getTreeItem(element: AlertTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: AlertTreeItem): Thenable<AlertTreeItem[]> {
        if (!element) {
            // Root level - show alert categories
            return Promise.resolve([
                new AlertTreeItem(
                    'Active Alerts',
                    vscode.TreeItemCollapsibleState.Expanded,
                    'activeAlerts',
                    'alerts'
                ),
                new AlertTreeItem(
                    'Alert Rules',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'alertRules',
                    'settings'
                ),
                new AlertTreeItem(
                    'Statistics',
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'statistics',
                    'graph'
                )
            ]);
        }

        switch (element.contextValue) {
            case 'activeAlerts':
                return this.getActiveAlerts();
            case 'alertRules':
                return this.getAlertRules();
            case 'statistics':
                return this.getStatistics();
            default:
                return Promise.resolve([]);
        }
    }

    private async getActiveAlerts(): Promise<AlertTreeItem[]> {
        const alerts = this.alertSystem.getActiveAlerts();

        if (alerts.length === 0) {
            return [new AlertTreeItem('No active alerts', vscode.TreeItemCollapsibleState.None, 'noAlerts', 'info')];
        }

        return alerts.map(alert => {
            const icon = this.getSeverityIcon(alert.severity);
            return new AlertTreeItem(
                `${icon} ${alert.title}`,
                vscode.TreeItemCollapsibleState.None,
                'alert',
                alert.severity.toLowerCase(),
                {
                    command: 'postgresql.resolveAlert',
                    arguments: [alert.id],
                    title: 'Resolve Alert'
                }
            );
        });
    }

    private async getAlertRules(): Promise<AlertTreeItem[]> {
        const rules = this.alertSystem.getAlertRules();
        return rules.map(rule => {
            const status = rule.enabled ? '✅' : '❌';
            return new AlertTreeItem(
                `${status} ${rule.name}`,
                vscode.TreeItemCollapsibleState.None,
                'rule',
                rule.enabled ? 'enabled' : 'disabled'
            );
        });
    }

    private async getStatistics(): Promise<AlertTreeItem[]> {
        const stats = this.alertSystem.getAlertStats();

        return [
            new AlertTreeItem(`Total Rules: ${stats.totalRules}`, vscode.TreeItemCollapsibleState.None, 'stat', 'info'),
            new AlertTreeItem(`Enabled Rules: ${stats.enabledRules}`, vscode.TreeItemCollapsibleState.None, 'stat', 'info'),
            new AlertTreeItem(`Total Notifications: ${stats.totalNotifications}`, vscode.TreeItemCollapsibleState.None, 'stat', 'info'),
            new AlertTreeItem(`Failed Notifications: ${stats.failedNotifications}`, vscode.TreeItemCollapsibleState.None, 'stat', 'warning')
        ];
    }

    private getSeverityIcon(severity: string): string {
        switch (severity) {
            case 'Critical': return '🚨';
            case 'High': return '⚠️';
            case 'Medium': return 'ℹ️';
            case 'Low': return '💡';
            default: return '❓';
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }
}

class AlertTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string,
        public readonly severity?: string,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);

        this.tooltip = this.label;
        this.iconPath = this.getIcon(severity);

        if (command) {
            this.command = command;
        }
    }

    private getIcon(severity?: string): vscode.ThemeIcon | undefined {
        switch (severity) {
            case 'critical': return new vscode.ThemeIcon('error');
            case 'high': return new vscode.ThemeIcon('warning');
            case 'medium': return new vscode.ThemeIcon('info');
            case 'low': return new vscode.ThemeIcon('lightbulb');
            case 'enabled': return new vscode.ThemeIcon('check');
            case 'disabled': return new vscode.ThemeIcon('x');
            case 'warning': return new vscode.ThemeIcon('warning');
            case 'alerts': return new vscode.ThemeIcon('bell');
            case 'settings': return new vscode.ThemeIcon('settings');
            case 'graph': return new vscode.ThemeIcon('graph');
            default: return new vscode.ThemeIcon('dash');
        }
    }
}