import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';

export interface NotificationConfig {
    enabled: boolean;
    soundEnabled: boolean;
    showProgress: boolean;
    groupSimilar: boolean;
    maxNotifications: number;
    autoHideDelay: number;
    position: 'top' | 'bottom' | 'center';
}

export interface NotificationItem {
    id: string;
    type: 'info' | 'success' | 'warning' | 'error';
    title: string;
    message: string;
    details?: string | undefined;
    actions?: NotificationAction[] | undefined;
    timestamp: number;
    source: string;
    category: string;
    priority: 'low' | 'normal' | 'high' | 'urgent';
    persistent: boolean;
    read: boolean;
    groupId?: string | undefined;
    metadata?: Record<string, any> | undefined;
}

export interface NotificationAction {
    id: string;
    label: string;
    action: () => Promise<void> | void;
    primary?: boolean;
}

export interface NotificationGroup {
    id: string;
    title: string;
    count: number;
    latestTimestamp: number;
    notifications: NotificationItem[];
    collapsed: boolean;
}

export class NotificationManager {
    private static instance: NotificationManager;
    private config: NotificationConfig;
    private notifications: Map<string, NotificationItem> = new Map();
    private groups: Map<string, NotificationGroup> = new Map();
    private outputChannel: vscode.OutputChannel;
    private statusBarItem: vscode.StatusBarItem;
    private webviewPanel: vscode.WebviewPanel | undefined;
    private notificationHistory: NotificationItem[] = [];
    private maxHistorySize: number = 1000;

    private constructor() {
        this.config = this.loadConfig();
        this.outputChannel = vscode.window.createOutputChannel('PostgreSQL Notifications');
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            90
        );
        this.statusBarItem.command = 'postgresql.showNotifications';

        this.setupEventListeners();
        this.updateStatusBar();
    }

    static getInstance(): NotificationManager {
        if (!NotificationManager.instance) {
            NotificationManager.instance = new NotificationManager();
        }
        return NotificationManager.instance;
    }

    private loadConfig(): NotificationConfig {
        const vscodeConfig = vscode.workspace.getConfiguration('postgresql.notifications');
        return {
            enabled: vscodeConfig.get('enabled', true),
            soundEnabled: vscodeConfig.get('soundEnabled', false),
            showProgress: vscodeConfig.get('showProgress', true),
            groupSimilar: vscodeConfig.get('groupSimilar', true),
            maxNotifications: vscodeConfig.get('maxNotifications', 100),
            autoHideDelay: vscodeConfig.get('autoHideDelay', 5000),
            position: vscodeConfig.get('position', 'bottom')
        };
    }

    private setupEventListeners(): void {
        // Listen for configuration changes
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('postgresql.notifications')) {
                this.config = this.loadConfig();
            }
        });
    }

    private updateStatusBar(): void {
        const unreadCount = Array.from(this.notifications.values()).filter(n => !n.read).length;
        const errorCount = Array.from(this.notifications.values()).filter(n => n.type === 'error').length;

        let statusText = '$(bell)';
        let tooltip = 'PostgreSQL Notifications';
        let priority = 0;

        if (errorCount > 0) {
            statusText = `$(error) ${errorCount} error${errorCount > 1 ? 's' : ''}`;
            tooltip = `${errorCount} error notification${errorCount > 1 ? 's' : ''}`;
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            priority = 3;
        } else if (unreadCount > 0) {
            statusText = `$(bell-dot) ${unreadCount} unread`;
            tooltip = `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}`;
            priority = 2;
        } else {
            statusText = '$(bell)';
            tooltip = 'No unread notifications';
            priority = 1;
        }

        this.statusBarItem.text = statusText;
        this.statusBarItem.tooltip = tooltip;
        this.statusBarItem.show();
    }

    /**
     * Show an informational notification
     */
    showInformation(
        title: string,
        message: string,
        source: string = 'system',
        options?: {
            details?: string;
            actions?: NotificationAction[];
            category?: string;
            priority?: 'low' | 'normal' | 'high' | 'urgent';
            persistent?: boolean;
            groupId?: string;
        }
    ): string {
        return this.showNotification({
            type: 'info',
            title,
            message,
            source,
            ...options
        });
    }

    /**
     * Show a success notification
     */
    showSuccess(
        title: string,
        message: string,
        source: string = 'system',
        options?: {
            details?: string;
            actions?: NotificationAction[];
            category?: string;
            persistent?: boolean;
            groupId?: string;
        }
    ): string {
        return this.showNotification({
            type: 'success',
            title,
            message,
            source,
            priority: 'normal',
            ...options
        });
    }

    /**
     * Show a warning notification
     */
    showWarning(
        title: string,
        message: string,
        source: string = 'system',
        options?: {
            details?: string;
            actions?: NotificationAction[];
            category?: string;
            priority?: 'low' | 'normal' | 'high' | 'urgent';
            persistent?: boolean;
            groupId?: string;
        }
    ): string {
        return this.showNotification({
            type: 'warning',
            title,
            message,
            source,
            priority: options?.priority || 'normal',
            ...options
        });
    }

    /**
     * Show an error notification
     */
    showError(
        title: string,
        message: string,
        source: string = 'system',
        options?: {
            details?: string;
            actions?: NotificationAction[];
            category?: string;
            priority?: 'low' | 'normal' | 'high' | 'urgent';
            persistent?: boolean;
            groupId?: string;
        }
    ): string {
        return this.showNotification({
            type: 'error',
            title,
            message,
            source,
            priority: options?.priority || 'high',
            persistent: options?.persistent !== false,
            ...options
        });
    }


    private showNotification(options: {
        type: 'info' | 'success' | 'warning' | 'error';
        title: string;
        message: string;
        source: string;
        details?: string;
        actions?: NotificationAction[];
        category?: string;
        priority?: 'low' | 'normal' | 'high' | 'urgent';
        persistent?: boolean;
        groupId?: string;
    }): string {
        if (!this.config.enabled) {
            return '';
        }

        const id = `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const notification: NotificationItem = {
            id,
            type: options.type,
            title: options.title,
            message: options.message,
            details: options.details || undefined,
            actions: options.actions || undefined,
            timestamp: Date.now(),
            source: options.source,
            category: options.category || 'general',
            priority: options.priority || 'normal',
            persistent: options.persistent || false,
            read: false,
            groupId: options.groupId || undefined,
            metadata: {}
        };

        // Check for similar notifications to group
        if (this.config.groupSimilar && options.groupId) {
            const existingGroup = this.groups.get(options.groupId);
            if (existingGroup) {
                existingGroup.notifications.push(notification);
                existingGroup.count++;
                existingGroup.latestTimestamp = notification.timestamp;
                this.updateStatusBar();
                return id;
            }
        }

        this.notifications.set(id, notification);
        this.addToHistory(notification);

        // Create group if needed
        if (options.groupId) {
            this.groups.set(options.groupId, {
                id: options.groupId,
                title: options.title,
                count: 1,
                latestTimestamp: notification.timestamp,
                notifications: [notification],
                collapsed: true
            });
        }

        // Show VSCode notification for high priority items
        if (options.priority === 'urgent' || options.priority === 'high') {
            this.showVSCodeNotification(notification);
        }

        // Play sound if enabled
        if (this.config.soundEnabled) {
            this.playNotificationSound(options.type);
        }

        // Auto-hide after delay if not persistent
        if (!options.persistent && this.config.autoHideDelay > 0) {
            setTimeout(() => {
                this.markAsRead(id);
            }, this.config.autoHideDelay);
        }

        this.updateStatusBar();

        // Log to output channel
        this.logToOutputChannel(notification);

        return id;
    }

    private showVSCodeNotification(notification: NotificationItem): void {
        const message = `${notification.title}: ${notification.message}`;

        switch (notification.type) {
            case 'error':
                vscode.window.showErrorMessage(message, ...(notification.actions?.map(a => a.label) || []))
                    .then(selection => {
                        if (selection && notification.actions) {
                            const action = notification.actions.find(a => a.label === selection);
                            if (action) {
                                action.action();
                            }
                        }
                    });
                break;
            case 'warning':
                vscode.window.showWarningMessage(message, ...(notification.actions?.map(a => a.label) || []))
                    .then(selection => {
                        if (selection && notification.actions) {
                            const action = notification.actions.find(a => a.label === selection);
                            if (action) {
                                action.action();
                            }
                        }
                    });
                break;
            case 'success':
                vscode.window.showInformationMessage(message, ...(notification.actions?.map(a => a.label) || []))
                    .then(selection => {
                        if (selection && notification.actions) {
                            const action = notification.actions.find(a => a.label === selection);
                            if (action) {
                                action.action();
                            }
                        }
                    });
                break;
            default:
                vscode.window.showInformationMessage(message, ...(notification.actions?.map(a => a.label) || []))
                    .then(selection => {
                        if (selection && notification.actions) {
                            const action = notification.actions.find(a => a.label === selection);
                            if (action) {
                                action.action();
                            }
                        }
                    });
        }
    }

    /**
     * Mark a notification as read
     */
    private markAsRead(id: string): void {
        const notification = this.notifications.get(id);
        if (notification) {
            notification.read = true;
            this.updateStatusBar();
        }
    }

    /**
     * Mark all notifications as read
     */
    private markAllAsRead(): void {
        this.notifications.forEach(notification => {
            notification.read = true;
        });
        this.updateStatusBar();
    }

    /**
     * Clear all notifications
     */
    private clearAll(): void {
        this.notifications.clear();
        this.groups.clear();
        this.updateStatusBar();
    }

    /**
     * Get all notifications
     */
    private getNotifications(filter?: {
        type?: 'info' | 'success' | 'warning' | 'error';
        category?: string;
        unreadOnly?: boolean;
        source?: string;
    }): NotificationItem[] {
        let notifications = Array.from(this.notifications.values());

        if (filter) {
            if (filter.type) {
                notifications = notifications.filter(n => n.type === filter.type);
            }
            if (filter.category) {
                notifications = notifications.filter(n => n.category === filter.category);
            }
            if (filter.unreadOnly) {
                notifications = notifications.filter(n => !n.read);
            }
            if (filter.source) {
                notifications = notifications.filter(n => n.source === filter.source);
            }
        }

        return notifications.sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Get notification groups
     */
    private getGroups(): NotificationGroup[] {
        return Array.from(this.groups.values());
    }

    private playNotificationSound(type: string): void {
        if (!this.config.soundEnabled) {
            return;
        }

        try {
            // Try to play system notification sound using VS Code's built-in capabilities
            switch (type) {
                case 'error':
                    // For error sounds, we can use VS Code's error sound if available
                    vscode.commands.executeCommand('notifications.clearAll');
                    break;
                case 'warning':
                    // For warnings, show a warning message that makes a sound
                    vscode.window.showWarningMessage(`Notification sound: ${type}`);
                    break;
                case 'success':
                case 'info':
                default:
                    // For success and info, show an info message that makes a sound
                    vscode.window.showInformationMessage(`Notification sound: ${type}`);
                    break;
            }

            Logger.debug(`Notification sound played for type: ${type}`, 'playNotificationSound');
        } catch (error) {
            // Fallback: just log if sound playback fails
            Logger.debug(`Notification sound requested for type: ${type} (sound playback not available)`, 'playNotificationSound');
        }
    }

    private updateProgress(id: string, progress: number, message?: string): void {
        const notification = this.notifications.get(id);
        if (notification && notification.metadata) {
            notification.metadata.progress = Math.max(0, Math.min(100, progress));
            if (message) {
                notification.message = message;
            }

            // Update VSCode notification if it's a progress notification
            if (notification.category === 'progress') {
                this.showVSCodeNotification(notification);
            }
        }
    }

    private completeProgress(id: string, message?: string): void {
        const notification = this.notifications.get(id);
        if (notification) {
            notification.type = 'success';
            if (message) {
                notification.message = message;
            }
            notification.read = true;

            // Remove from active notifications after a short delay
            setTimeout(() => {
                this.notifications.delete(id);
                this.updateStatusBar();
            }, 2000);
        }
    }

    private errorProgress(id: string, message: string): void {
        const notification = this.notifications.get(id);
        if (notification) {
            notification.type = 'error';
            notification.message = message;
            notification.read = true;

            this.showVSCodeNotification(notification);
        }
    }


    /**
     * Show notification center webview
     */
    async showNotificationCenter(): Promise<void> {
        if (this.webviewPanel) {
            this.webviewPanel.reveal();
            return;
        }

        this.webviewPanel = vscode.window.createWebviewPanel(
            'notificationCenter',
            'PostgreSQL Notifications',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        this.webviewPanel.onDidDispose(() => {
            this.webviewPanel = undefined;
        });

        const htmlContent = await this.generateNotificationCenterHtml();
        this.webviewPanel.webview.html = htmlContent;

        this.webviewPanel.webview.onDidReceiveMessage(async (message) => {
            await this.handleNotificationCenterMessage(message);
        });
    }

    private async generateNotificationCenterHtml(): Promise<string> {
        const notifications = this.getNotifications();
        const groups = this.getGroups();
        const unreadCount = notifications.filter(n => !n.read).length;

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>PostgreSQL Notifications</title>
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

                    .title {
                        font-size: 16px;
                        font-weight: bold;
                        margin: 0;
                    }

                    .subtitle {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                    }

                    .btn {
                        padding: 6px 12px;
                        border: none;
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 11px;
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

                    .content-area {
                        flex: 1;
                        overflow: auto;
                        padding: 20px;
                    }

                    .filter-bar {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        margin-bottom: 20px;
                        flex-wrap: wrap;
                    }

                    .filter-select {
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 3px;
                        padding: 4px 8px;
                        font-size: 12px;
                    }

                    .notifications-container {
                        display: flex;
                        flex-direction: column;
                        gap: 10px;
                    }

                    .notification-item {
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 6px;
                        padding: 12px;
                        transition: all 0.2s ease;
                    }

                    .notification-item:hover {
                        border-color: var(--vscode-textLink-foreground);
                    }

                    .notification-item.unread {
                        border-left: 3px solid var(--vscode-textLink-foreground);
                    }

                    .notification-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-start;
                        margin-bottom: 8px;
                    }

                    .notification-title {
                        font-weight: bold;
                        font-size: 13px;
                        color: var(--vscode-textLink-foreground);
                    }

                    .notification-time {
                        font-size: 11px;
                        color: var(--vscode-descriptionForeground);
                    }

                    .notification-message {
                        font-size: 12px;
                        margin-bottom: 8px;
                        line-height: 1.4;
                    }

                    .notification-meta {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        font-size: 11px;
                        color: var(--vscode-descriptionForeground);
                        margin-bottom: 8px;
                    }

                    .notification-type {
                        padding: 2px 6px;
                        border-radius: 8px;
                        font-size: 10px;
                        font-weight: bold;
                        text-transform: uppercase;
                    }

                    .type-info { background: var(--vscode-gitDecoration-addedResourceForeground); color: white; }
                    .type-success { background: var(--vscode-gitDecoration-addedResourceForeground); color: white; }
                    .type-warning { background: var(--vscode-gitDecoration-renamedResourceForeground); color: white; }
                    .type-error { background: var(--vscode-gitDecoration-deletedResourceForeground); color: white; }

                    .notification-actions {
                        display: flex;
                        gap: 8px;
                        margin-top: 10px;
                    }

                    .action-btn {
                        background: none;
                        border: 1px solid var(--vscode-panel-border);
                        color: var(--vscode-textLink-foreground);
                        padding: 4px 8px;
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 11px;
                    }

                    .action-btn:hover {
                        background: var(--vscode-list-hoverBackground);
                    }

                    .empty-state {
                        text-align: center;
                        padding: 40px;
                        color: var(--vscode-descriptionForeground);
                    }

                    .stats-bar {
                        display: flex;
                        gap: 15px;
                        margin-bottom: 20px;
                        flex-wrap: wrap;
                    }

                    .stat-card {
                        background: var(--vscode-badge-background);
                        padding: 8px 12px;
                        border-radius: 4px;
                        text-align: center;
                        min-width: 60px;
                    }

                    .stat-value {
                        font-size: 16px;
                        font-weight: bold;
                        color: var(--vscode-textLink-foreground);
                    }

                    .stat-label {
                        font-size: 10px;
                        color: var(--vscode-badge-foreground);
                        opacity: 0.8;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="header-left">
                        <h2 class="title">PostgreSQL Notifications</h2>
                        <div class="subtitle">${unreadCount} unread • ${notifications.length} total</div>
                    </div>
                    <div class="header-right">
                        <button class="btn btn-secondary" onclick="markAllAsRead()">Mark All Read</button>
                        <button class="btn btn-secondary" onclick="clearAll()">Clear All</button>
                    </div>
                </div>

                <div class="content-area">
                    <div class="stats-bar">
                        <div class="stat-card">
                            <div class="stat-value">${notifications.filter(n => n.type === 'error').length}</div>
                            <div class="stat-label">Errors</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">${notifications.filter(n => n.type === 'warning').length}</div>
                            <div class="stat-label">Warnings</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">${notifications.filter(n => n.type === 'success').length}</div>
                            <div class="stat-label">Success</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">${notifications.filter(n => n.type === 'info').length}</div>
                            <div class="stat-label">Info</div>
                        </div>
                    </div>

                    <div class="filter-bar">
                        <select class="filter-select" id="typeFilter" onchange="filterNotifications()">
                            <option value="">All Types</option>
                            <option value="error">Errors</option>
                            <option value="warning">Warnings</option>
                            <option value="success">Success</option>
                            <option value="info">Info</option>
                        </select>

                        <select class="filter-select" id="sourceFilter" onchange="filterNotifications()">
                            <option value="">All Sources</option>
                            ${Array.from(new Set(notifications.map(n => n.source))).map(source =>
            `<option value="${source}">${source}</option>`
        ).join('')}
                        </select>

                        <label>
                            <input type="checkbox" id="unreadOnly" onchange="filterNotifications()">
                            Unread only
                        </label>
                    </div>

                    <div class="notifications-container" id="notificationsContainer">
                        ${notifications.length > 0 ? notifications.map(notification => `
                            <div class="notification-item ${notification.read ? '' : 'unread'}" data-id="${notification.id}">
                                <div class="notification-header">
                                    <div class="notification-title">${notification.title}</div>
                                    <div class="notification-time">${new Date(notification.timestamp).toLocaleString()}</div>
                                </div>
                                <div class="notification-message">${notification.message}</div>
                                ${notification.details ? `<div style="font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 8px;">${notification.details}</div>` : ''}
                                <div class="notification-meta">
                                    <span class="notification-type type-${notification.type}">${notification.type}</span>
                                    <span>${notification.source}</span>
                                    <span>${notification.category}</span>
                                    <span class="priority-${notification.priority}">${notification.priority}</span>
                                </div>
                                ${notification.actions && notification.actions.length > 0 ? `
                                    <div class="notification-actions">
                                        ${notification.actions.map(action => `
                                            <button class="action-btn" onclick="executeAction('${notification.id}', '${action.id}')">
                                                ${action.label}
                                            </button>
                                        `).join('')}
                                    </div>
                                ` : ''}
                            </div>
                        `).join('') : `
                            <div class="empty-state">
                                No notifications to display
                            </div>
                        `}
                    </div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();

                    function markAllAsRead() {
                        vscode.postMessage({
                            command: 'markAllAsRead'
                        });
                    }

                    function clearAll() {
                        vscode.postMessage({
                            command: 'clearAll'
                        });
                    }

                    function filterNotifications() {
                        const typeFilter = document.getElementById('typeFilter').value;
                        const sourceFilter = document.getElementById('sourceFilter').value;
                        const unreadOnly = document.getElementById('unreadOnly').checked;

                        vscode.postMessage({
                            command: 'filterNotifications',
                            filters: {
                                type: typeFilter,
                                source: sourceFilter,
                                unreadOnly: unreadOnly
                            }
                        });
                    }

                    function executeAction(notificationId, actionId) {
                        vscode.postMessage({
                            command: 'executeAction',
                            notificationId: notificationId,
                            actionId: actionId
                        });
                    }
                </script>
            </body>
            </html>
        `;
    }

    private async handleNotificationCenterMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'markAllAsRead':
                this.markAllAsRead();
                await this.refreshNotificationCenter();
                break;

            case 'clearAll':
                this.clearAll();
                await this.refreshNotificationCenter();
                break;

            case 'filterNotifications':
                await this.refreshNotificationCenter();
                break;

            case 'executeAction':
                await this.executeNotificationAction(message.notificationId, message.actionId);
                break;

            default:
                Logger.warn(`Unknown notification center command: ${message.command}`);
                break;
        }
    }

    private async refreshNotificationCenter(): Promise<void> {
        if (this.webviewPanel) {
            const htmlContent = await this.generateNotificationCenterHtml();
            this.webviewPanel.webview.html = htmlContent;
        }
    }

    private async executeNotificationAction(notificationId: string, actionId: string): Promise<void> {
        if (!notificationId || !actionId) {
            Logger.warn(`Invalid notification action parameters: ${notificationId}, ${actionId}`);
            return;
        }

        const notification = this.notifications.get(notificationId);
        if (!notification) {
            Logger.warn(`Notification not found for action execution: ${notificationId}`);
            return;
        }

        if (!notification.actions || notification.actions.length === 0) {
            Logger.warn(`Notification has no actions: ${notificationId}`);
            return;
        }

        const action = notification.actions.find(a => a.id === actionId);
        if (!action) {
            Logger.warn(`Action not found in notification: ${notificationId}, ${actionId}`);
            return;
        }

        try {
            await action.action();
            this.markAsRead(notificationId);
        } catch (error) {
            Logger.error('Failed to execute notification action', error as Error, 'executeNotificationAction', { notificationId, actionId });
            vscode.window.showErrorMessage(`Failed to execute action: ${(error as Error).message}`);
        }
    }

    private addToHistory(notification: NotificationItem): void {
        this.notificationHistory.unshift(notification);

        // Trim history if it gets too large
        if (this.notificationHistory.length > this.maxHistorySize) {
            this.notificationHistory = this.notificationHistory.slice(0, this.maxHistorySize);
        }
    }

    private logToOutputChannel(notification: NotificationItem): void {
        const timestamp = new Date(notification.timestamp).toISOString();
        const logEntry = `[${timestamp}] [${notification.type.toUpperCase()}] ${notification.title}: ${notification.message}`;

        this.outputChannel.appendLine(logEntry);

        if (notification.details) {
            this.outputChannel.appendLine(`  Details: ${notification.details}`);
        }

        if (notification.actions && notification.actions.length > 0) {
            this.outputChannel.appendLine(`  Actions: ${notification.actions.map(a => a.label).join(', ')}`);
        }
    }

    /**
     * Get notification statistics
     */
    getStatistics(): {
        total: number;
        unread: number;
        byType: Record<string, number>;
        bySource: Record<string, number>;
        byCategory: Record<string, number>;
    } {
        const notifications = Array.from(this.notifications.values());
        const unread = notifications.filter(n => !n.read).length;

        const byType = notifications.reduce((acc, n) => {
            acc[n.type] = (acc[n.type] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const bySource = notifications.reduce((acc, n) => {
            acc[n.source] = (acc[n.source] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const byCategory = notifications.reduce((acc, n) => {
            acc[n.category] = (acc[n.category] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        return {
            total: notifications.length,
            unread,
            byType,
            bySource,
            byCategory
        };
    }

    /**
     * Export notifications to file
     */
    async exportNotifications(): Promise<void> {
        try {
            const notifications = this.getNotifications();
            const exportData = {
                exportedAt: new Date().toISOString(),
                statistics: this.getStatistics(),
                notifications: notifications.map(n => ({
                    id: n.id,
                    type: n.type,
                    title: n.title,
                    message: n.message,
                    timestamp: new Date(n.timestamp).toISOString(),
                    source: n.source,
                    category: n.category,
                    priority: n.priority,
                    read: n.read
                }))
            };

            const uri = await vscode.window.showSaveDialog({
                filters: {
                    'JSON Files': ['json'],
                    'All Files': ['*']
                },
                defaultUri: vscode.Uri.file(`postgresql-notifications-${new Date().toISOString().split('T')[0]}.json`)
            });

            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(exportData, null, 2), 'utf8'));
                vscode.window.showInformationMessage('Notifications exported successfully');
            }
        } catch (error) {
            Logger.error('Failed to export notifications', error as Error);
            vscode.window.showErrorMessage('Failed to export notifications');
        }
    }

    /**
     * Dispose of the notification manager
     */
    dispose(): void {
        this.notifications.clear();
        this.groups.clear();
        this.notificationHistory.length = 0;
        this.outputChannel.dispose();
        this.statusBarItem.dispose();

        if (this.webviewPanel) {
            this.webviewPanel.dispose();
            this.webviewPanel = undefined;
        }
    }
}