import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';
import { ConnectionManager } from '../managers/ConnectionManager';
import { NotificationManager } from '../views/NotificationManager';

export interface StatusBarItem {
    id: string;
    text: string;
    tooltip: string;
    command?: string;
    color?: vscode.ThemeColor;
    backgroundColor?: vscode.ThemeColor;
    priority: number;
    alignment: 'left' | 'right';
    visible: boolean | undefined;
}

export interface OperationIndicator {
    id: string;
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    progress?: number | undefined;
    startTime: number;
    estimatedDuration?: number | undefined;
    message?: string | undefined;
}

export interface StatusBarConfig {
    enabled: boolean;
    showConnectionStatus: boolean;
    showOperationIndicators: boolean;
    showNotifications: boolean;
    showMemoryUsage: boolean;
    compactMode: boolean;
    updateInterval: number;
    maxOperationIndicators: number;
}

export class EnhancedStatusBarProvider {
    private static instance: EnhancedStatusBarProvider;
    private config: StatusBarConfig;
    private statusBarItems: Map<string, vscode.StatusBarItem> = new Map();
    private operationIndicators: Map<string, OperationIndicator> = new Map();
    private currentOperations: Set<string> = new Set();
    private updateTimer?: NodeJS.Timeout | undefined;
    private notificationManager: NotificationManager;
    private connectionManager: ConnectionManager;

    private constructor(
        connectionManager: ConnectionManager,
        notificationManager: NotificationManager
    ) {
        this.connectionManager = connectionManager;
        this.notificationManager = notificationManager;
        this.config = this.loadConfig();

        this.createStatusBarItems();
        this.setupEventListeners();
        this.startAutoUpdate();
    }

    static getInstance(
        connectionManager: ConnectionManager,
        notificationManager: NotificationManager
    ): EnhancedStatusBarProvider {
        if (!EnhancedStatusBarProvider.instance) {
            EnhancedStatusBarProvider.instance = new EnhancedStatusBarProvider(
                connectionManager,
                notificationManager
            );
        }
        return EnhancedStatusBarProvider.instance;
    }

    private loadConfig(): StatusBarConfig {
        const vscodeConfig = vscode.workspace.getConfiguration('postgresql.statusBar');
        return {
            enabled: vscodeConfig.get('enabled', true),
            showConnectionStatus: vscodeConfig.get('showConnectionStatus', true),
            showOperationIndicators: vscodeConfig.get('showOperationIndicators', true),
            showNotifications: vscodeConfig.get('showNotifications', true),
            showMemoryUsage: vscodeConfig.get('showMemoryUsage', false),
            compactMode: vscodeConfig.get('compactMode', false),
            updateInterval: vscodeConfig.get('updateInterval', 2000),
            maxOperationIndicators: vscodeConfig.get('maxOperationIndicators', 3)
        };
    }

    private createStatusBarItems(): void {
        if (!this.config.enabled) return;

        // Main connection status item
        if (this.config.showConnectionStatus) {
            this.createStatusBarItem({
                id: 'connection',
                text: '$(database) PostgreSQL',
                tooltip: 'PostgreSQL Connection Status',
                command: 'postgresql.manageConnections',
                priority: 100,
                alignment: 'left',
                visible: true
            });
        }


        // Operation indicators area
        if (this.config.showOperationIndicators) {
            this.createStatusBarItem({
                id: 'operations',
                text: '$(sync) Operations',
                tooltip: 'Active Operations',
                command: 'postgresql.showActiveOperations',
                priority: 90,
                alignment: 'left',
                visible: true
            });
        }

        // Notifications item
        if (this.config.showNotifications) {
            this.createStatusBarItem({
                id: 'notifications',
                text: '$(bell) Notifications',
                tooltip: 'PostgreSQL Notifications',
                command: 'postgresql.showNotifications',
                priority: 85,
                alignment: 'left',
                visible: true
            });
        }

        // Memory usage item (right side)
        if (this.config.showMemoryUsage) {
            this.createStatusBarItem({
                id: 'memory',
                text: '$(graph-line) Memory',
                tooltip: 'Memory Usage',
                priority: 10,
                alignment: 'right',
                visible: true
            });
        }

        // System status item (right side)
        this.createStatusBarItem({
            id: 'system',
            text: '$(pulse) System',
            tooltip: 'System Status',
            command: 'postgresql.showDashboard',
            priority: 5,
            alignment: 'right',
            visible: true
        });
    }

    private createStatusBarItem(item: StatusBarItem): void {
        const statusBarItem = vscode.window.createStatusBarItem(
            item.alignment === 'left' ? vscode.StatusBarAlignment.Left : vscode.StatusBarAlignment.Right,
            item.priority
        );

        statusBarItem.text = item.text;
        statusBarItem.tooltip = item.tooltip;
        if (item.command) {
            statusBarItem.command = item.command;
        }
        if (item.color) {
            statusBarItem.color = item.color;
        }
        if (item.backgroundColor) {
            statusBarItem.backgroundColor = item.backgroundColor;
        }

        this.statusBarItems.set(item.id, statusBarItem);
        statusBarItem.show();
    }

    private setupEventListeners(): void {
        // Listen for configuration changes
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('postgresql.statusBar')) {
                this.config = this.loadConfig();
                this.recreateStatusBarItems();
            }
        });
    }

    private recreateStatusBarItems(): void {
        // Hide all existing items
        this.statusBarItems.forEach(item => item.hide());
        this.statusBarItems.clear();

        // Recreate items based on new config
        this.createStatusBarItems();
    }

    private startAutoUpdate(): void {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
        }

        this.updateTimer = setInterval(() => {
            this.updateAllStatusItems();
        }, this.config.updateInterval);
    }

    private updateAllStatusItems(): void {
        if (!this.config.enabled) return;

        this.updateConnectionStatus();
        this.updateOperationIndicators();
        this.updateNotificationStatus();
        this.updateMemoryUsage();
        this.updateSystemStatus();
    }

    private updateConnectionStatus(): void {
        if (!this.config.showConnectionStatus) return;

        const item = this.statusBarItems.get('connection');
        if (!item) return;

        const connections = this.connectionManager.getConnections();
        const connectedCount = connections.filter(c => c.status === 'Connected').length;
        const totalCount = connections.length;

        let text = '';
        let tooltip = '';
        let color: vscode.ThemeColor | undefined;

        if (totalCount === 0) {
            text = '$(database) No connections';
            tooltip = 'No PostgreSQL connections configured';
        } else if (connectedCount === totalCount) {
            text = `$(check) PostgreSQL: ${connectedCount}/${totalCount}`;
            tooltip = `${connectedCount} of ${totalCount} connections active`;
            color = new vscode.ThemeColor('statusBarItem.activeBackground');
        } else if (connectedCount > 0) {
            text = `$(warning) PostgreSQL: ${connectedCount}/${totalCount}`;
            tooltip = `${connectedCount} of ${totalCount} connections active`;
            color = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            text = `$(x) PostgreSQL: ${totalCount} disconnected`;
            tooltip = 'All PostgreSQL connections inactive';
            color = new vscode.ThemeColor('statusBarItem.errorBackground');
        }

        item.text = text;
        item.tooltip = tooltip;
        if (color) {
            item.backgroundColor = color;
        }
    }


    private updateOperationIndicators(): void {
        if (!this.config.showOperationIndicators) return;

        const item = this.statusBarItems.get('operations');
        if (!item) return;

        const activeOperations = Array.from(this.operationIndicators.values())
            .filter(op => op.status === 'running' || op.status === 'pending');

        if (activeOperations.length === 0) {
            item.text = '$(sync) No operations';
            item.tooltip = 'No active operations';
            item.backgroundColor = undefined;
        } else {
            const runningCount = activeOperations.filter(op => op.status === 'running').length;
            const pendingCount = activeOperations.filter(op => op.status === 'pending').length;

            let text = '$(sync~spin) Operations';
            let tooltip = `Active Operations:\n`;
            let color: vscode.ThemeColor | undefined;

            if (runningCount > 0) {
                text = `$(sync~spin) ${runningCount} running`;
                tooltip += `${runningCount} running\n`;
                color = new vscode.ThemeColor('statusBarItem.activeBackground');
            }

            if (pendingCount > 0) {
                text += `, ${pendingCount} pending`;
                tooltip += `${pendingCount} pending\n`;
            }

            // Add details for each operation
            activeOperations.slice(0, this.config.maxOperationIndicators).forEach(op => {
                const duration = Date.now() - op.startTime;
                tooltip += `\n• ${op.name}: ${this.formatDuration(duration)}`;
                if (op.message) {
                    tooltip += ` - ${op.message}`;
                }
            });

            if (activeOperations.length > this.config.maxOperationIndicators) {
                tooltip += `\n... and ${activeOperations.length - this.config.maxOperationIndicators} more`;
            }

            item.text = text;
            item.tooltip = tooltip;
            if (color) {
                item.backgroundColor = color;
            }
        }
    }

    private updateNotificationStatus(): void {
        if (!this.config.showNotifications) return;

        const item = this.statusBarItems.get('notifications');
        if (!item) return;

        const stats = this.notificationManager.getStatistics();
        const unreadCount = stats.unread;

        if (unreadCount === 0) {
            item.text = '$(bell) No notifications';
            item.tooltip = 'No unread notifications';
            item.backgroundColor = undefined;
        } else {
            const errorCount = stats.byType.error || 0;
            const warningCount = stats.byType.warning || 0;

            let text = `$(bell-dot) ${unreadCount} unread`;
            let tooltip = `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}`;
            let color: vscode.ThemeColor | undefined;

            if (errorCount > 0) {
                text = `$(error) ${errorCount} error${errorCount > 1 ? 's' : ''}`;
                tooltip = `${errorCount} error notification${errorCount > 1 ? 's' : ''}`;
                color = new vscode.ThemeColor('statusBarItem.errorBackground');
            } else if (warningCount > 0) {
                text = `$(warning) ${warningCount} warning${warningCount > 1 ? 's' : ''}`;
                tooltip = `${warningCount} warning notification${warningCount > 1 ? 's' : ''}`;
                color = new vscode.ThemeColor('statusBarItem.warningBackground');
            }

            item.text = text;
            item.tooltip = tooltip;
            if (color) {
                item.backgroundColor = color;
            }
        }
    }

    private updateMemoryUsage(): void {
        if (!this.config.showMemoryUsage) return;

        const item = this.statusBarItems.get('memory');
        if (!item) return;

        const memUsage = process.memoryUsage();
        const memMB = Math.round(memUsage.heapUsed / 1024 / 1024);

        let color: vscode.ThemeColor | undefined;
        if (memMB > 500) {
            color = new vscode.ThemeColor('statusBarItem.errorBackground');
        } else if (memMB > 200) {
            color = new vscode.ThemeColor('statusBarItem.warningBackground');
        }

        const text = `$(graph-line) ${memMB}MB`;
        const tooltip = `Memory Usage: ${memMB}MB\nHeap Used: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB\nHeap Total: ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`;

        item.text = text;
        item.tooltip = tooltip;
        if (color) {
            item.backgroundColor = color;
        }
    }

    private updateSystemStatus(): void {
        const item = this.statusBarItems.get('system');
        if (!item) return;

        const uptime = this.getSystemUptime();

        const text = '$(pulse) System';
        const tooltip = `System Status\nUptime: ${uptime}`;

        item.text = text;
        item.tooltip = tooltip;
    }

    private getSystemUptime(): string {
        const uptimeMs = process.uptime() * 1000;
        const hours = Math.floor(uptimeMs / (1000 * 60 * 60));
        const minutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours}h ${minutes}m`;
    }

    private formatDuration(ms: number): string {
        if (ms < 1000) {
            return `${ms}ms`;
        } else if (ms < 60000) {
            return `${(ms / 1000).toFixed(1)}s`;
        } else {
            const minutes = Math.floor(ms / 60000);
            const seconds = Math.floor((ms % 60000) / 1000);
            return `${minutes}m ${seconds}s`;
        }
    }

    /**
     * Start an operation indicator
     */
    startOperation(
        id: string,
        name: string,
        options?: {
            message?: string;
            estimatedDuration?: number;
            cancellable?: boolean;
        }
    ): void {
        const indicator: OperationIndicator = {
            id,
            name,
            status: 'pending',
            startTime: Date.now(),
            estimatedDuration: options?.estimatedDuration,
            message: options?.message
        };

        this.operationIndicators.set(id, indicator);
        this.currentOperations.add(id);
        this.updateOperationIndicators();

        Logger.debug('Operation started', { operationId: id, name });
    }

    /**
     * Update an operation indicator
     */
    updateOperation(
        id: string,
        status: OperationIndicator['status'],
        options?: {
            progress?: number;
            message?: string;
        }
    ): void {
        const indicator = this.operationIndicators.get(id);
        if (indicator) {
            indicator.status = status;
            if (options?.progress !== undefined) {
                indicator.progress = options.progress;
            }
            if (options?.message) {
                indicator.message = options.message;
            }

            this.updateOperationIndicators();

            // Auto-remove completed/failed operations after a delay
            if (status === 'completed' || status === 'failed' || status === 'cancelled') {
                setTimeout(() => {
                    this.completeOperation(id);
                }, 3000);
            }
        }
    }

    /**
     * Complete an operation indicator
     */
    completeOperation(id: string): void {
        this.operationIndicators.delete(id);
        this.currentOperations.delete(id);
        this.updateOperationIndicators();

        Logger.debug('Operation completed', { operationId: id });
    }

    /**
     * Dispose of the provider
     */
    dispose(): void {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
            this.updateTimer = undefined;
        }

        this.statusBarItems.forEach(item => item.dispose());
        this.statusBarItems.clear();
        this.operationIndicators.clear();
        this.currentOperations.clear();
    }
}