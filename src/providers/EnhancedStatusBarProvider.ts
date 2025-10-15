import * as vscode from 'vscode';
import { Logger } from '@/utils/Logger';
import { ConnectionManager } from '@/managers/ConnectionManager';
import { NotificationManager } from '@/views/NotificationManager';

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
    steps?: OperationStep[] | undefined;
    currentStep?: number | undefined;
    cancellable?: boolean | undefined;
    cancellationToken?: vscode.CancellationTokenSource | undefined;
}

export interface OperationStep {
    id: string;
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    progress?: number | undefined;
    message?: string | undefined;
    startTime?: number | undefined;
    endTime?: number | undefined;
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

    static getCurrentInstance(): EnhancedStatusBarProvider {
        if (!EnhancedStatusBarProvider.instance) {
            throw new Error('EnhancedStatusBarProvider not initialized. Call getInstance() first.');
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
        if (!this.config.enabled) { return; }

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
        if (!this.config.enabled) { return; }

        this.updateConnectionStatus();
        this.updateOperationIndicators();
        this.updateNotificationStatus();
        this.updateMemoryUsage();
        this.updateSystemStatus();
    }

    private updateConnectionStatus(): void {
        if (!this.config.showConnectionStatus) { return; }

        const item = this.statusBarItems.get('connection');
        if (!item) { return; }

        const connections = this.connectionManager.getConnections();
        const connectedCount = connections.filter(c => c.status === 'Connected').length;
        const errorCount = connections.filter(c => c.status === 'Error').length;
        const connectingCount = connections.filter(c => c.status === 'Connecting').length;
        const totalCount = connections.length;

        let text = '';
        let tooltip = '';
        let color: vscode.ThemeColor | undefined;

        if (totalCount === 0) {
            text = '$(database) No connections';
            tooltip = 'No PostgreSQL connections configured\nClick to add a connection';
        } else if (connectedCount === totalCount) {
            text = `$(check) PostgreSQL: ${connectedCount}/${totalCount}`;
            tooltip = `✅ All ${connectedCount} connections active\n📊 Database connectivity: 100%`;
            color = new vscode.ThemeColor('statusBarItem.activeBackground');
        } else if (connectedCount > 0) {
            text = `$(warning) PostgreSQL: ${connectedCount}/${totalCount}`;
            const successRate = Math.round((connectedCount / totalCount) * 100);
            tooltip = `⚠️ ${connectedCount} of ${totalCount} connections active\n📊 Success rate: ${successRate}%\n❌ ${errorCount} connection errors`;
            color = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else if (connectingCount > 0) {
            text = `$(sync~spin) PostgreSQL: ${connectingCount} connecting`;
            tooltip = `🔄 ${connectingCount} connection(s) in progress\n⏳ Attempting to establish connections`;
            color = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            text = `$(x) PostgreSQL: ${totalCount} disconnected`;
            tooltip = `❌ All ${totalCount} connections inactive\n🔧 Check connection settings\n📋 Click to manage connections`;
            color = new vscode.ThemeColor('statusBarItem.errorBackground');
        }

        // Add detailed connection information to tooltip
        if (totalCount > 0) {
            tooltip += '\n\n📋 Connection Details:';
            connections.slice(0, 5).forEach(conn => {
                const statusIcon = conn.status === 'Connected' ? '✅' :
                    conn.status === 'Error' ? '❌' :
                        conn.status === 'Connecting' ? '🔄' : '⚫';
                tooltip += `\n  ${statusIcon} ${conn.name} (${conn.host}:${conn.port})`;
            });

            if (connections.length > 5) {
                tooltip += `\n  ... and ${connections.length - 5} more`;
            }
        }

        item.text = text;
        item.tooltip = tooltip;
        if (color) {
            item.backgroundColor = color;
        }
    }

    private updateOperationIndicators(): void {
        if (!this.config.showOperationIndicators) { return; }

        const item = this.statusBarItems.get('operations');
        if (!item) { return; }

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

                // Add step progress if available
                if (op.steps && op.steps.length > 0) {
                    const completedSteps = op.steps.filter(s => s.status === 'completed').length;
                    tooltip += `\n  Steps: ${completedSteps}/${op.steps.length}`;

                    // Show current step
                    if (op.currentStep !== undefined && op.steps[op.currentStep]) {
                        const currentStep = op.steps[op.currentStep];
                        tooltip += ` | Current: ${currentStep.name}`;
                        if (currentStep.message) {
                            tooltip += ` - ${currentStep.message}`;
                        }
                    }
                }

                // Add progress percentage if available
                if (op.progress !== undefined) {
                    tooltip += `\n  Progress: ${Math.round(op.progress)}%`;
                }

                // Add cancellation option if cancellable
                if (op.cancellable) {
                    tooltip += `\n  [Click to cancel]`;
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
        if (!this.config.showNotifications) { return; }

        const item = this.statusBarItems.get('notifications');
        if (!item) { return; }

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
        if (!this.config.showMemoryUsage) { return; }

        const item = this.statusBarItems.get('memory');
        if (!item) { return; }

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
        if (!item) { return; }

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

    startOperation(
        id: string,
        name: string,
        options?: {
            message?: string;
            estimatedDuration?: number;
            cancellable?: boolean;
            steps?: OperationStep[];
            progress?: number;
        }
    ): OperationIndicator {
        const cancellationToken = options?.cancellable ? new vscode.CancellationTokenSource() : undefined;

        const indicator: OperationIndicator = {
            id,
            name,
            status: 'pending',
            startTime: Date.now(),
            estimatedDuration: options?.estimatedDuration,
            message: options?.message,
            steps: options?.steps,
            currentStep: 0,
            cancellable: options?.cancellable,
            cancellationToken: cancellationToken
        };

        this.operationIndicators.set(id, indicator);
        this.currentOperations.add(id);
        this.updateOperationIndicators();

        Logger.debug('Operation started', 'startOperation', {
            operationId: id,
            name,
            stepCount: options?.steps?.length || 0,
            cancellable: options?.cancellable
        });

        return indicator;
    }

    updateOperationStep(
        id: string,
        stepIndex: number,
        status: OperationStep['status'],
        options?: {
            message?: string;
            progress?: number;
        }
    ): void {
        const indicator = this.operationIndicators.get(id);
        if (!indicator || !indicator.steps) { return; }

        if (indicator.steps[stepIndex]) {
            const step = indicator.steps[stepIndex];
            step.status = status;
            step.startTime = step.startTime || Date.now();

            if (status === 'completed' || status === 'failed' || status === 'cancelled') {
                step.endTime = Date.now();
            }

            if (options?.message) {
                step.message = options.message;
            }

            if (options?.progress !== undefined) {
                step.progress = options.progress;
            }

            indicator.currentStep = stepIndex;
            indicator.status = status === 'running' ? 'running' : indicator.status;
        }

        this.updateOperationIndicators();
    }

    cancelOperation(id: string): boolean {
        const indicator = this.operationIndicators.get(id);
        if (!indicator || !indicator.cancellable || !indicator.cancellationToken) {
            return false;
        }

        try {
            indicator.cancellationToken.cancel();
            indicator.status = 'cancelled';
            this.updateOperationIndicators();

            Logger.info('Operation cancelled', 'cancelOperation', { operationId: id });
            return true;
        } catch (error) {
            Logger.error('Failed to cancel operation', error as Error, 'cancelOperation', { operationId: id });
            return false;
        }
    }

    getOperation(id: string): OperationIndicator | undefined {
        return this.operationIndicators.get(id);
    }

    getActiveOperations(): OperationIndicator[] {
        return Array.from(this.operationIndicators.values())
            .filter(op => op.status === 'running' || op.status === 'pending');
    }


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

        Logger.debug('Operation completed', 'completeOperation', { operationId: id });
    }

    /**
     * Show operation details in a webview
     */
    async showOperationDetails(): Promise<void> {
        const activeOperations = this.getActiveOperations();

        if (activeOperations.length === 0) {
            vscode.window.showInformationMessage('No active operations');
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'postgresqlOperationDetails',
            'Operation Details',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        const htmlContent = this.generateOperationDetailsHtml(activeOperations);
        panel.webview.html = htmlContent;

        // Handle messages from webview
        panel.webview.onDidReceiveMessage(async (message) => {
            if (message.command === 'cancelOperation') {
                const cancelled = this.cancelOperation(message.operationId);
                if (cancelled) {
                    vscode.window.showInformationMessage(`Operation ${message.operationId} cancelled`);
                    // Refresh the view
                    const updatedOperations = this.getActiveOperations();
                    panel.webview.html = this.generateOperationDetailsHtml(updatedOperations);
                } else {
                    vscode.window.showErrorMessage(`Failed to cancel operation ${message.operationId}`);
                }
            }
        });

        panel.onDidDispose(() => {
            // Refresh status bar when panel closes
            this.updateOperationIndicators();
        });
    }

    private generateOperationDetailsHtml(operations: OperationIndicator[]): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Operation Details</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        padding: 20px;
                        margin: 0;
                        background: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                    }
                    .operation-card {
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 6px;
                        margin-bottom: 15px;
                        overflow: hidden;
                    }
                    .operation-header {
                        background: var(--vscode-titleBar-activeBackground, #2f2f2f);
                        padding: 12px 15px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }
                    .operation-title {
                        font-weight: bold;
                        font-size: 13px;
                    }
                    .operation-status {
                        padding: 4px 8px;
                        border-radius: 12px;
                        font-size: 11px;
                        font-weight: bold;
                        text-transform: uppercase;
                    }
                    .status-running { background: var(--vscode-gitDecoration-modifiedResourceForeground); color: var(--vscode-editor-background); }
                    .status-pending { background: var(--vscode-gitDecoration-renamedResourceForeground); color: var(--vscode-editor-background); }
                    .status-completed { background: var(--vscode-gitDecoration-addedResourceForeground); color: var(--vscode-editor-background); }
                    .status-failed { background: var(--vscode-gitDecoration-deletedResourceForeground); color: var(--vscode-editor-background); }
                    .status-cancelled { background: var(--vscode-panel-border); color: var(--vscode-editor-foreground); }
                    .operation-content {
                        padding: 15px;
                    }
                    .operation-meta {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                        gap: 15px;
                        margin-bottom: 15px;
                    }
                    .meta-item {
                        font-size: 12px;
                    }
                    .meta-label {
                        color: var(--vscode-descriptionForeground);
                        margin-bottom: 2px;
                    }
                    .meta-value {
                        font-weight: bold;
                    }
                    .progress-container {
                        margin-bottom: 15px;
                    }
                    .progress-bar {
                        width: 100%;
                        height: 8px;
                        background: var(--vscode-panel-border);
                        border-radius: 4px;
                        overflow: hidden;
                    }
                    .progress-fill {
                        height: 100%;
                        background: var(--vscode-button-background);
                        transition: width 0.3s ease;
                    }
                    .steps-container {
                        max-height: 200px;
                        overflow-y: auto;
                    }
                    .step-item {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 6px 0;
                        border-bottom: 1px solid var(--vscode-panel-border);
                    }
                    .step-number {
                        width: 20px;
                        height: 20px;
                        border-radius: 50%;
                        background: var(--vscode-panel-border);
                        color: var(--vscode-editor-foreground);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 10px;
                        font-weight: bold;
                        flex-shrink: 0;
                    }
                    .step-completed .step-number { background: var(--vscode-gitDecoration-addedResourceForeground); color: var(--vscode-editor-background); }
                    .step-running .step-number { background: var(--vscode-gitDecoration-modifiedResourceForeground); color: var(--vscode-editor-background); }
                    .step-failed .step-number { background: var(--vscode-gitDecoration-deletedResourceForeground); color: var(--vscode-editor-background); }
                    .step-content {
                        flex: 1;
                    }
                    .step-title {
                        font-size: 12px;
                        font-weight: bold;
                        margin-bottom: 2px;
                    }
                    .step-message {
                        font-size: 11px;
                        color: var(--vscode-descriptionForeground);
                    }
                    .btn {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 6px 12px;
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 11px;
                        margin-right: 8px;
                    }
                    .btn:hover {
                        background: var(--vscode-button-hoverBackground);
                    }
                    .btn-danger {
                        background: var(--vscode-gitDecoration-deletedResourceForeground);
                    }
                    .btn-danger:hover {
                        opacity: 0.9;
                    }
                </style>
            </head>
            <body>
                <h2>Active Operations</h2>
                ${operations.length === 0 ? '<p>No active operations</p>' : ''}
                ${operations.map(op => `
                    <div class="operation-card">
                        <div class="operation-header">
                            <div class="operation-title">${op.name}</div>
                            <div>
                                <span class="operation-status status-${op.status}">${op.status}</span>
                                ${op.cancellable ? `<button class="btn btn-danger" onclick="cancelOperation('${op.id}')">Cancel</button>` : ''}
                            </div>
                        </div>
                        <div class="operation-content">
                            <div class="operation-meta">
                                <div class="meta-item">
                                    <div class="meta-label">Duration</div>
                                    <div class="meta-value">${this.formatDuration(Date.now() - op.startTime)}</div>
                                </div>
                                ${op.estimatedDuration ? `
                                    <div class="meta-item">
                                        <div class="meta-label">Estimated Total</div>
                                        <div class="meta-value">${this.formatDuration(op.estimatedDuration)}</div>
                                    </div>
                                ` : ''}
                                ${op.progress !== undefined ? `
                                    <div class="meta-item">
                                        <div class="meta-label">Progress</div>
                                        <div class="meta-value">${Math.round(op.progress)}%</div>
                                    </div>
                                ` : ''}
                            </div>

                            ${op.progress !== undefined ? `
                                <div class="progress-container">
                                    <div class="progress-bar">
                                        <div class="progress-fill" style="width: ${op.progress}%"></div>
                                    </div>
                                </div>
                            ` : ''}

                            ${op.message ? `
                                <div style="margin-bottom: 15px; font-size: 12px;">
                                    <strong>Message:</strong> ${op.message}
                                </div>
                            ` : ''}

                            ${op.steps && op.steps.length > 0 ? `
                                <div>
                                    <div style="font-size: 12px; font-weight: bold; margin-bottom: 10px;">Steps</div>
                                    <div class="steps-container">
                                        ${op.steps.map((step, index) => `
                                            <div class="step-item step-${step.status}">
                                                <div class="step-number">${index + 1}</div>
                                                <div class="step-content">
                                                    <div class="step-title">${step.name}</div>
                                                    ${step.message ? `<div class="step-message">${step.message}</div>` : ''}
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `).join('')}

                <script>
                    const vscode = acquireVsCodeApi();

                    function cancelOperation(operationId) {
                        vscode.postMessage({
                            command: 'cancelOperation',
                            operationId: operationId
                        });
                    }
                </script>
            </body>
            </html>
        `;
    }
    dispose(): void {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
            this.updateTimer = undefined;
        }

        // Cancel all cancellable operations
        this.operationIndicators.forEach((indicator) => {
            if (indicator.cancellable && indicator.cancellationToken) {
                indicator.cancellationToken.cancel();
            }
        });

        this.statusBarItems.forEach(item => item.dispose());
        this.statusBarItems.clear();
        this.operationIndicators.clear();
        this.currentOperations.clear();
    }
}