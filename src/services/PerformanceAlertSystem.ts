import * as vscode from 'vscode';
import { PerformanceMonitorService, PerformanceAlert, QueryPerformanceMetrics } from '@/services/PerformanceMonitorService';
import { Logger } from '@/utils/Logger';
import { ErrorHandler } from '@/utils/ErrorHandler';

export interface AlertRule {
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

export interface AlertCondition {
    metric: string;
    operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
    threshold: number;
    duration?: number; // For sustained conditions (e.g., high CPU for 5 minutes)
    queryPattern?: string; // For query-specific alerts
}

export interface NotificationChannel {
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
    private lastAlertTimes: Map<string, Date> = new Map(); // For cooldown tracking
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

    // Alert Rule Management
    async createAlertRule(ruleData: Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<AlertRule> {
        try {
            const rule: AlertRule = {
                ...ruleData,
                id: this.generateId(),
                createdAt: new Date(),
                updatedAt: new Date()
            };

            this.alertRules.set(rule.id, rule);
            this.saveAlertRules();

            Logger.info('Alert rule created', 'createAlertRule', {
                ruleId: rule.id,
                name: rule.name
            });

            return rule;

        } catch (error) {
            Logger.error('Failed to create alert rule', error as Error);
            throw error;
        }
    }

    async updateAlertRule(ruleId: string, updates: Partial<AlertRule>): Promise<AlertRule> {
        try {
            const rule = this.alertRules.get(ruleId);
            if (!rule) {
                throw new Error(`Alert rule ${ruleId} not found`);
            }

            const updatedRule: AlertRule = {
                ...rule,
                ...updates,
                updatedAt: new Date()
            };

            this.alertRules.set(ruleId, updatedRule);
            this.saveAlertRules();

            Logger.info('Alert rule updated', 'updateAlertRule', {
                ruleId,
                name: updatedRule.name
            });

            return updatedRule;

        } catch (error) {
            Logger.error('Failed to update alert rule', error as Error);
            throw error;
        }
    }

    async deleteAlertRule(ruleId: string): Promise<void> {
        try {
            const rule = this.alertRules.get(ruleId);
            if (!rule) {
                throw new Error(`Alert rule ${ruleId} not found`);
            }

            this.alertRules.delete(ruleId);
            this.saveAlertRules();

            Logger.info('Alert rule deleted', 'deleteAlertRule', {
                ruleId,
                name: rule.name
            });

        } catch (error) {
            Logger.error('Failed to delete alert rule', error as Error);
            throw error;
        }
    }

    getAlertRules(): AlertRule[] {
        return Array.from(this.alertRules.values())
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }

    // Alert Processing
    startAlertMonitoring(): void {
        if (this.isMonitoring) {
            this.stopAlertMonitoring();
        }

        this.isMonitoring = true;

        // Check for alerts every 30 seconds
        this.checkInterval = setInterval(() => {
            this.processAlerts();
        }, 30000);

        Logger.info('Alert monitoring started', 'startAlertMonitoring');
    }

    stopAlertMonitoring(): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = undefined;
        }

        this.isMonitoring = false;
        Logger.info('Alert monitoring stopped', 'stopAlertMonitoring');
    }

    private processAlerts(): void {
        try {
            // Get recent performance metrics
            const recentMetrics = this.performanceMonitor.getQueryMetrics(undefined, {
                start: new Date(Date.now() - 5 * 60 * 1000), // Last 5 minutes
                end: new Date()
            });

            // Check each enabled rule
            this.alertRules.forEach(rule => {
                if (!rule.enabled) return;

                this.checkRule(rule, recentMetrics);
            });

            this.updateStatusBar();

        } catch (error) {
            Logger.error('Error processing alerts', error as Error);
        }
    }

    private checkRule(rule: AlertRule, metrics: QueryPerformanceMetrics[]): void {
        try {
            const cooldownKey = `${rule.id}:${rule.type}`;
            const lastAlertTime = this.lastAlertTimes.get(cooldownKey);

            // Check cooldown
            if (lastAlertTime) {
                const cooldownMs = rule.cooldownMinutes * 60 * 1000;
                if (Date.now() - lastAlertTime.getTime() < cooldownMs) {
                    return; // Still in cooldown period
                }
            }

            let shouldAlert = false;
            let alertMetrics: Record<string, any> = {};

            switch (rule.type) {
                case 'SlowQuery':
                    const slowQueries = metrics.filter(m => m.executionTime > rule.condition.threshold);
                    if (slowQueries.length > 0) {
                        shouldAlert = true;
                        alertMetrics = {
                            slowQueryCount: slowQueries.length,
                            maxExecutionTime: Math.max(...slowQueries.map(m => m.executionTime)),
                            averageExecutionTime: slowQueries.reduce((sum, m) => sum + m.executionTime, 0) / slowQueries.length
                        };
                    }
                    break;

                case 'HighCPU':
                    // This would check database metrics in a real implementation
                    shouldAlert = Math.random() > 0.8; // Simulated for demo
                    alertMetrics = { simulatedHighCPU: true };
                    break;

                case 'Deadlock':
                    // This would check for actual deadlocks
                    shouldAlert = Math.random() > 0.95; // Simulated for demo
                    alertMetrics = { simulatedDeadlock: true };
                    break;

                default:
                    // Custom rule checking logic
                    shouldAlert = this.evaluateCustomCondition(rule, metrics);
                    break;
            }

            if (shouldAlert) {
                this.triggerAlert(rule, alertMetrics);
                this.lastAlertTimes.set(cooldownKey, new Date());
            }

        } catch (error) {
            Logger.error('Error checking alert rule', error as Error);
        }
    }

    private evaluateCustomCondition(rule: AlertRule, metrics: QueryPerformanceMetrics[]): boolean {
        // Custom condition evaluation logic
        // This is a simplified implementation
        return false;
    }

    private triggerAlert(rule: AlertRule, metrics: Record<string, any>): void {
        try {
            const alert: PerformanceAlert = {
                id: this.generateId(),
                type: rule.type === 'Custom' ? 'SlowQuery' : rule.type,
                severity: rule.severity,
                title: rule.name,
                description: rule.description,
                timestamp: new Date(),
                metrics,
                resolved: false
            };

            // Store alert in performance monitor
            this.performanceMonitor['alerts'].set(alert.id, alert);

            // Send notifications
            this.sendNotifications(rule, alert);

            Logger.warn('Performance alert triggered', 'triggerAlert', {
                alertId: alert.id,
                ruleId: rule.id,
                type: rule.type,
                severity: rule.severity
            });

        } catch (error) {
            Logger.error('Failed to trigger alert', error as Error);
        }
    }

    private async sendNotifications(rule: AlertRule, alert: PerformanceAlert): Promise<void> {
        for (const channel of rule.notificationChannels) {
            if (!channel.enabled) continue;

            try {
                await this.sendNotification(channel, rule, alert);
            } catch (error) {
                Logger.error('Failed to send notification', error as Error);
            }
        }
    }

    private async sendNotification(
        channel: NotificationChannel,
        rule: AlertRule,
        alert: PerformanceAlert
    ): Promise<void> {
        const notification: AlertNotification = {
            id: this.generateId(),
            alertId: alert.id,
            ruleId: rule.id,
            channel: channel.type,
            status: 'pending',
            retryCount: 0
        };

        this.notifications.set(notification.id, notification);

        try {
            switch (channel.type) {
                case 'vscode':
                    await this.sendVSCodeNotification(alert);
                    break;

                case 'email':
                    await this.sendEmailNotification(channel, alert);
                    break;

                case 'slack':
                    await this.sendSlackNotification(channel, alert);
                    break;

                case 'teams':
                    await this.sendTeamsNotification(channel, alert);
                    break;

                case 'webhook':
                    await this.sendWebhookNotification(channel, alert);
                    break;

                default:
                    throw new Error(`Unsupported notification channel: ${channel.type}`);
            }

            notification.status = 'sent';
            notification.sentAt = new Date();

        } catch (error) {
            notification.status = 'failed';
            notification.error = (error as Error).message;

            Logger.error('Notification failed', error as Error);
        }

        this.notifications.set(notification.id, notification);
    }

    private async sendVSCodeNotification(alert: PerformanceAlert): Promise<void> {
        const severity = alert.severity.toLowerCase();

        switch (severity) {
            case 'critical':
            case 'high':
                vscode.window.showErrorMessage(
                    `🚨 ${alert.title}: ${alert.description}`,
                    'View Details', 'Dismiss'
                ).then(selection => {
                    if (selection === 'View Details') {
                        vscode.commands.executeCommand('postgresql.showPerformanceAlerts');
                    }
                });
                break;

            case 'medium':
                vscode.window.showWarningMessage(
                    `⚠️ ${alert.title}: ${alert.description}`,
                    'View Details', 'Dismiss'
                ).then(selection => {
                    if (selection === 'View Details') {
                        vscode.commands.executeCommand('postgresql.showPerformanceAlerts');
                    }
                });
                break;

            case 'low':
                vscode.window.showInformationMessage(
                    `ℹ️ ${alert.title}: ${alert.description}`,
                    'View Details', 'Dismiss'
                ).then(selection => {
                    if (selection === 'View Details') {
                        vscode.commands.executeCommand('postgresql.showPerformanceAlerts');
                    }
                });
                break;
        }

        // Update status bar
        this.updateStatusBar();
    }

    private async sendEmailNotification(channel: NotificationChannel, alert: PerformanceAlert): Promise<void> {
        // Email notification implementation would go here
        Logger.info('Email notification sent', 'sendEmailNotification', {
            alertId: alert.id,
            recipient: channel.configuration.recipient
        });
    }

    private async sendSlackNotification(channel: NotificationChannel, alert: PerformanceAlert): Promise<void> {
        // Slack notification implementation would go here
        Logger.info('Slack notification sent', 'sendSlackNotification', {
            alertId: alert.id,
            webhook: channel.configuration.webhookUrl
        });
    }

    private async sendTeamsNotification(channel: NotificationChannel, alert: PerformanceAlert): Promise<void> {
        // Teams notification implementation would go here
        Logger.info('Teams notification sent', 'sendTeamsNotification', {
            alertId: alert.id,
            webhook: channel.configuration.webhookUrl
        });
    }

    private async sendWebhookNotification(channel: NotificationChannel, alert: PerformanceAlert): Promise<void> {
        // Webhook notification implementation would go here
        Logger.info('Webhook notification sent', 'sendWebhookNotification', {
            alertId: alert.id,
            url: channel.configuration.url
        });
    }

    private updateStatusBar(): void {
        if (!this.statusBarItem) return;

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

    // Alert Management
    getActiveAlerts(): PerformanceAlert[] {
        return this.performanceMonitor.getAlerts(undefined, undefined, undefined, true);
    }

    resolveAlert(alertId: string, resolution?: string): void {
        this.performanceMonitor.resolveAlert(alertId, resolution);
        this.updateStatusBar();
    }

    // Statistics
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