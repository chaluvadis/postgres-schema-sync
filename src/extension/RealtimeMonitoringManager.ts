import * as vscode from 'vscode';
import { ExtensionComponents } from '@/utils/ExtensionInitializer';
import { Logger } from '@/utils/Logger';

/**
 * RealtimeMonitoringManager - Handles real-time monitoring, file watching, and connection monitoring
 * Extracted from the monolithic extension.ts for better organization
 */

// Real-time monitoring state interface
interface RealtimeState {
    fileWatchers: Map<string, vscode.FileSystemWatcher>;
    connectionMonitors: Map<string, NodeJS.Timeout>;
    statusBarItem: vscode.StatusBarItem | null;
    schemaMonitors: Map<string, NodeJS.Timeout>;
    activeSQLFile: string | null;
    lastSchemaCheck: Map<string, number>;
}

// Performance metrics interface
interface PerformanceMetrics {
    fileOperations: number;
    connectionChecks: number;
    schemaChecks: number;
    queryExecutions: number;
    averageResponseTime: number;
    lastResetTime: number;
}

// Global state (would be better as dependency injection in a real refactor)
let realtimeState: RealtimeState = {
    fileWatchers: new Map(),
    connectionMonitors: new Map(),
    statusBarItem: null,
    schemaMonitors: new Map(),
    activeSQLFile: null,
    lastSchemaCheck: new Map()
};

let performanceMetrics: PerformanceMetrics = {
    fileOperations: 0,
    connectionChecks: 0,
    schemaChecks: 0,
    queryExecutions: 0,
    averageResponseTime: 0,
    lastResetTime: Date.now()
};

/**
 * RealtimeMonitoringManager - Manages real-time features and monitoring
 */
export class RealtimeMonitoringManager {
    private components?: ExtensionComponents;

    constructor(components?: ExtensionComponents) {
        this.components = components;
    }

    /**
     * Initialize persistent status bar for SQL files
     */
    initializePersistentStatusBar(): void {
        if (!realtimeState.statusBarItem) {
            realtimeState.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
            realtimeState.statusBarItem.command = 'postgresql.openQueryEditor';
        }
    }

    /**
     * Update persistent status bar with SQL file info
     */
    updatePersistentStatusBar(document: vscode.TextDocument): void {
        if (!realtimeState.statusBarItem) {
            this.initializePersistentStatusBar();
        }

        if (!realtimeState.statusBarItem) return;

        const fileName = document.fileName.split(/[/\\]/).pop() || 'Unknown';
        const connectionInfo = this.getCurrentConnectionInfo();
        const lastModified = new Date(document.uri.fsPath).toLocaleTimeString();

        realtimeState.statusBarItem.text = `$(database) ${fileName}`;
        realtimeState.statusBarItem.tooltip = `SQL File: ${document.fileName}\nLanguage: ${document.languageId}\nLast Modified: ${lastModified}\nConnection: ${connectionInfo}\nSize: ${document.getText().length} characters`;
        realtimeState.statusBarItem.show();

        Logger.debug('Persistent status bar updated', 'updatePersistentStatusBar', {
            fileName,
            languageId: document.languageId
        });
    }

    /**
     * Clear persistent status bar
     */
    clearPersistentStatusBar(): void {
        if (realtimeState.statusBarItem) {
            realtimeState.statusBarItem.hide();
        }
    }

    /**
     * Get current connection info
     */
    getCurrentConnectionInfo(): string {
        const detectedConnectionId = vscode.workspace.getConfiguration().get<string>('postgresql.detectedConnection');
        if (detectedConnectionId && this.components?.connectionManager) {
            const connections = this.components.connectionManager.getConnections();
            const connection = connections.find(c => c.id === detectedConnectionId);
            if (connection) {
                return `${connection.name} (${connection.host}:${connection.port})`;
            }
        }
        return 'None';
    }

    /**
     * Setup file system watcher for SQL file changes
     */
    setupSQLFileWatcher(document: vscode.TextDocument): void {
        const filePath = document.fileName;

        // Remove existing watcher if any
        if (realtimeState.fileWatchers.has(filePath)) {
            realtimeState.fileWatchers.get(filePath)?.dispose();
        }

        // Create new file watcher for real-time changes
        const watcher = vscode.workspace.createFileSystemWatcher(filePath);

        watcher.onDidChange((uri) => {
            Logger.debug('SQL file changed', 'setupSQLFileWatcher', { filePath: uri.fsPath });

            // Update status bar with modification time
            if (realtimeState.activeSQLFile === filePath) {
                this.updatePersistentStatusBar(document);
            }

            // Trigger IntelliSense refresh
            if (this.components?.queryEditorView) {
                this.refreshIntelliSenseForFile(document);
            }

            // Show notification for external changes
            vscode.window.showInformationMessage(
                `SQL file "${document.fileName.split(/[/\\]/).pop()}" was modified externally`,
                'Refresh', 'Ignore'
            ).then(selection => {
                if (selection === 'Refresh') {
                    vscode.commands.executeCommand('postgresql.refreshExplorer');
                }
            });
        });

        watcher.onDidDelete((uri) => {
            Logger.info('SQL file deleted', 'setupSQLFileWatcher', { filePath: uri.fsPath });

            // Clean up watcher
            watcher.dispose();
            realtimeState.fileWatchers.delete(filePath);

            // Clear status if this was the active file
            if (realtimeState.activeSQLFile === filePath) {
                realtimeState.activeSQLFile = null;
                this.clearPersistentStatusBar();
            }
        });

        realtimeState.fileWatchers.set(filePath, watcher);
    }

    /**
     * Refresh IntelliSense for SQL file
     */
    refreshIntelliSenseForFile(document: vscode.TextDocument): void {
        try {
            const content = document.getText();
            const connectionId = vscode.workspace.getConfiguration().get<string>('postgresql.detectedConnection');

            if (connectionId && this.components?.queryEditorView) {
                // Trigger IntelliSense refresh for the current file
                Logger.debug('Refreshing IntelliSense for SQL file', 'refreshIntelliSenseForFile', {
                    fileName: document.fileName,
                    connectionId
                });

                // This could be enhanced to provide real-time suggestions based on file content
                vscode.commands.executeCommand('editor.action.triggerSuggest');
            }
        } catch (error) {
            Logger.error('Error refreshing IntelliSense', error as Error);
        }
    }

    /**
     * Start schema monitoring for SQL file
     */
    startSchemaMonitoring(document: vscode.TextDocument): void {
        const connectionId = vscode.workspace.getConfiguration().get<string>('postgresql.detectedConnection');
        if (!connectionId || !this.components?.schemaManager) return;

        // Clear existing monitor
        if (realtimeState.schemaMonitors.has(connectionId)) {
            clearTimeout(realtimeState.schemaMonitors.get(connectionId)!);
        }

        // Check schema changes every 30 seconds
        const monitor = setInterval(async () => {
            try {
                const lastCheck = realtimeState.lastSchemaCheck.get(connectionId) || 0;
                const now = Date.now();

                // Only check if enough time has passed (30 seconds)
                if (now - lastCheck > 30000) {
                    await this.checkSchemaChanges(connectionId);
                    realtimeState.lastSchemaCheck.set(connectionId, now);
                }
            } catch (error) {
                Logger.error('Error in schema monitoring', error as Error);
            }
        }, 5000); // Check every 5 seconds but only act every 30 seconds

        realtimeState.schemaMonitors.set(connectionId, monitor);
    }

    /**
     * Check for schema changes
     */
    private async checkSchemaChanges(connectionId: string): Promise<void> {
        try {
            // This would check for schema changes in the database
            // For now, we'll just log that we're monitoring
            Logger.debug('Checking for schema changes', 'checkSchemaChanges', { connectionId });

            // In a real implementation, this would:
            // 1. Query the database for current schema state
            // 2. Compare with cached schema state
            // 3. Trigger refresh if changes detected
            // 4. Show notification to user

        } catch (error) {
            Logger.error('Error checking schema changes', error as Error);
        }
    }

    /**
     * Start connection monitoring
     */
    startConnectionMonitoring(): void {
        if (!this.components?.connectionManager) return;

        const connections = this.components.connectionManager.getConnections();

        connections.forEach(connection => {
            // Clear existing monitor
            if (realtimeState.connectionMonitors.has(connection.id)) {
                clearInterval(realtimeState.connectionMonitors.get(connection.id)!);
            }

            // Monitor connection status every 60 seconds
            const monitor = setInterval(async () => {
                await this.checkConnectionStatus(connection.id);
            }, 60000);

            realtimeState.connectionMonitors.set(connection.id, monitor);
        });
    }

    /**
     * Stop connection monitoring
     */
    stopConnectionMonitoring(): void {
        realtimeState.connectionMonitors.forEach(monitor => {
            clearInterval(monitor);
        });
        realtimeState.connectionMonitors.clear();
    }

    /**
     * Check connection status
     */
    private async checkConnectionStatus(connectionId: string): Promise<void> {
        try {
            // Test connection status
            const isConnected = await this.testConnectionQuietly(connectionId);

            if (!isConnected) {
                Logger.warn('Connection lost', 'checkConnectionStatus', { connectionId });

                // Update status bar to show connection issue
                if (realtimeState.statusBarItem) {
                    realtimeState.statusBarItem.text = '$(warning) Connection Lost';
                    realtimeState.statusBarItem.tooltip += '\nConnection status: Disconnected';
                }

                // Show notification
                vscode.window.showWarningMessage(
                    'Database connection lost. Attempting to reconnect...',
                    'Retry Now', 'View Details'
                ).then(selection => {
                    if (selection === 'Retry Now') {
                        vscode.commands.executeCommand('postgresql.testConnection');
                    } else if (selection === 'View Details') {
                        Logger.showOutputChannel();
                    }
                });
            } else {
                Logger.debug('Connection healthy', 'checkConnectionStatus', { connectionId });
            }
        } catch (error) {
            Logger.error('Error checking connection status', error as Error);
        }
    }

    /**
     * Test connection quietly
     */
    private async testConnectionQuietly(connectionId: string): Promise<boolean> {
        try {
            // This would be a lightweight connection test
            // For now, return true (implement actual connection testing as needed)
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Setup workspace-wide SQL file watchers
     */
    setupWorkspaceSQLWatchers(): void {
        // Watch for SQL files in the entire workspace
        const sqlPattern = '**/*.{sql,psql}';
        const watcher = vscode.workspace.createFileSystemWatcher(sqlPattern);

        watcher.onDidCreate((uri) => {
            Logger.info('New SQL file detected', 'setupWorkspaceSQLWatchers', { filePath: uri.fsPath });

            // Setup watcher for the new file
            vscode.workspace.openTextDocument(uri).then(document => {
                if (document) {
                    this.setupSQLFileWatcher(document);
                }
            });
        });

        watcher.onDidDelete((uri) => {
            Logger.info('SQL file removed from workspace', 'setupWorkspaceSQLWatchers', { filePath: uri.fsPath });

            // Clean up watcher
            if (realtimeState.fileWatchers.has(uri.fsPath)) {
                realtimeState.fileWatchers.get(uri.fsPath)?.dispose();
                realtimeState.fileWatchers.delete(uri.fsPath);
            }
        });

        // Store the watcher reference for cleanup
        (realtimeState as any).workspaceWatcher = watcher;
    }

    /**
     * Start global real-time monitoring
     */
    startGlobalRealtimeMonitoring(): void {
        // Monitor VS Code state changes
        vscode.window.onDidChangeWindowState((state) => {
            if (state.focused && realtimeState.activeSQLFile) {
                // Refresh when window gains focus
                Logger.debug('Window focused, refreshing real-time state', 'startGlobalRealtimeMonitoring');

                // Refresh status bar
                vscode.workspace.openTextDocument(realtimeState.activeSQLFile).then(document => {
                    if (document) {
                        this.updatePersistentStatusBar(document);
                    }
                }, (error: any) => {
                    Logger.error('Error refreshing on window focus', error);
                });
            }
        });

        // Monitor text document changes for real-time updates
        vscode.workspace.onDidChangeTextDocument((event) => {
            const document = event.document;
            const isSQLFile = document.languageId === 'sql' || document.languageId === 'postgresql';

            if (isSQLFile && realtimeState.activeSQLFile === document.fileName) {
                // Update status bar with character count changes
                this.updatePersistentStatusBar(document);

                // Trigger real-time validation if needed
                if (this.components?.queryEditorView) {
                    // Could trigger real-time syntax checking
                }
            }
        });
    }

    /**
     * Restart real-time monitoring
     */
    restartRealtimeMonitoring(): void {
        Logger.info('Restarting real-time monitoring', 'restartRealtimeMonitoring');

        // Stop existing monitoring
        this.cleanupRealtimeMonitoring();

        // Restart monitoring
        this.startConnectionMonitoring();
        this.setupWorkspaceSQLWatchers();
        this.startGlobalRealtimeMonitoring();
    }

    /**
     * Restart file watchers
     */
    restartFileWatchers(): void {
        Logger.info('Restarting file watchers', 'restartFileWatchers');

        // Clear existing watchers
        realtimeState.fileWatchers.forEach(watcher => watcher.dispose());
        realtimeState.fileWatchers.clear();

        // Setup new watchers for current workspace
        this.setupWorkspaceSQLWatchers();
    }

    /**
     * Cleanup all real-time monitoring
     */
    cleanupRealtimeMonitoring(): void {
        Logger.info('Cleaning up real-time monitoring', 'cleanupRealtimeMonitoring');

        // Dispose file watchers
        realtimeState.fileWatchers.forEach(watcher => watcher.dispose());
        realtimeState.fileWatchers.clear();

        // Clear connection monitors
        this.stopConnectionMonitoring();

        // Clear schema monitors
        realtimeState.schemaMonitors.forEach(monitor => clearInterval(monitor));
        realtimeState.schemaMonitors.clear();

        // Clear status bar
        this.clearPersistentStatusBar();

        // Dispose workspace watcher
        if ((realtimeState as any).workspaceWatcher) {
            (realtimeState as any).workspaceWatcher.dispose();
        }

        // Reset state
        realtimeState.activeSQLFile = null;
        realtimeState.lastSchemaCheck.clear();
    }

    /**
     * Detect connection for SQL file
     */
    detectConnectionForSQLFile(document: vscode.TextDocument): void {
        try {
            const fileName = document.fileName;
            const content = document.getText();

            // Try to detect connection based on file name patterns
            const connections = this.components?.connectionManager.getConnections() || [];

            // Look for database name in file path
            const pathParts = fileName.split(/[/\\]/);
            for (const part of pathParts) {
                const matchingConnection = connections.find(conn =>
                    part.includes(conn.database) || part.includes(conn.name)
                );
                if (matchingConnection) {
                    vscode.commands.executeCommand('setContext', 'postgresql.detectedConnection', matchingConnection.id);
                    Logger.debug('Auto-detected connection for SQL file', 'detectConnectionForSQLFile', {
                        fileName,
                        detectedConnection: matchingConnection.name
                    });
                    return;
                }
            }

            // Look for connection hints in file content
            for (const connection of connections) {
                if (content.includes(connection.host) || content.includes(connection.database)) {
                    vscode.commands.executeCommand('setContext', 'postgresql.detectedConnection', connection.id);
                    Logger.debug('Connection detected in SQL content', 'detectConnectionForSQLFile', {
                        fileName,
                        detectedConnection: connection.name
                    });
                    return;
                }
            }

            // No specific connection detected
            vscode.commands.executeCommand('setContext', 'postgresql.detectedConnection', null);

        } catch (error) {
            Logger.error('Error detecting connection for SQL file', error as Error);
        }
    }

    /**
     * Initialize performance monitoring
     */
    initializePerformanceMonitoring(): void {
        // Reset metrics every hour
        setInterval(() => {
            this.resetPerformanceMetrics();
        }, 3600000);

        Logger.info('Performance monitoring initialized', 'initializePerformanceMonitoring');
    }

    /**
     * Record performance metric
     */
    recordPerformanceMetric(type: keyof PerformanceMetrics, responseTime?: number): void {
        try {
            switch (type) {
                case 'fileOperations':
                    performanceMetrics.fileOperations++;
                    break;
                case 'connectionChecks':
                    performanceMetrics.connectionChecks++;
                    break;
                case 'schemaChecks':
                    performanceMetrics.schemaChecks++;
                    break;
                case 'queryExecutions':
                    performanceMetrics.queryExecutions++;
                    break;
                case 'averageResponseTime':
                    if (responseTime) {
                        // Update running average
                        const current = performanceMetrics.averageResponseTime;
                        const count = performanceMetrics.queryExecutions;
                        performanceMetrics.averageResponseTime = (current * count + responseTime) / (count + 1);
                    }
                    break;
            }

            // Log periodic performance summaries
            if (performanceMetrics.fileOperations % 100 === 0) {
                this.logPerformanceSummary();
            }
        } catch (error) {
            Logger.error('Error recording performance metric', error as Error);
        }
    }

    /**
     * Reset performance metrics
     */
    private resetPerformanceMetrics(): void {
        Logger.info('Resetting performance metrics', 'resetPerformanceMetrics', {
            previousMetrics: { ...performanceMetrics }
        });

        performanceMetrics = {
            fileOperations: 0,
            connectionChecks: 0,
            schemaChecks: 0,
            queryExecutions: 0,
            averageResponseTime: 0,
            lastResetTime: Date.now()
        };
    }

    /**
     * Log performance summary
     */
    private logPerformanceSummary(): void {
        const uptime = Date.now() - performanceMetrics.lastResetTime;
        const avgResponseTime = performanceMetrics.averageResponseTime > 0 ? Math.round(performanceMetrics.averageResponseTime) : 0;

        Logger.info('Real-time Performance Summary', 'logPerformanceSummary', {
            uptime: `${Math.round(uptime / 1000)}s`,
            fileOperations: performanceMetrics.fileOperations,
            connectionChecks: performanceMetrics.connectionChecks,
            schemaChecks: performanceMetrics.schemaChecks,
            queryExecutions: performanceMetrics.queryExecutions,
            averageResponseTime: `${avgResponseTime}ms`
        });

        // Show performance info in status bar if there's an active SQL file
        if (realtimeState.statusBarItem && realtimeState.activeSQLFile) {
            if (realtimeState.statusBarItem.tooltip) {
                realtimeState.statusBarItem.tooltip += `\nPerformance: ${performanceMetrics.queryExecutions} queries, ${avgResponseTime}ms avg`;
            }
        }
    }

    /**
     * Get performance report
     */
    getPerformanceReport(): string {
        const uptime = Date.now() - performanceMetrics.lastResetTime;
        const avgResponseTime = performanceMetrics.averageResponseTime > 0 ? Math.round(performanceMetrics.averageResponseTime) : 0;

        return [
            `=== Real-time Performance Report ===`,
            `Uptime: ${Math.round(uptime / 1000)} seconds`,
            `File Operations: ${performanceMetrics.fileOperations}`,
            `Connection Checks: ${performanceMetrics.connectionChecks}`,
            `Schema Checks: ${performanceMetrics.schemaChecks}`,
            `Query Executions: ${performanceMetrics.queryExecutions}`,
            `Average Response Time: ${avgResponseTime}ms`,
            ``,
            `Active Monitors:`,
            `- File Watchers: ${realtimeState.fileWatchers.size}`,
            `- Connection Monitors: ${realtimeState.connectionMonitors.size}`,
            `- Schema Monitors: ${realtimeState.schemaMonitors.size}`,
            `- Active SQL File: ${realtimeState.activeSQLFile ? 'Yes' : 'No'}`
        ].join('\n');
    }

    /**
     * Get current realtime state
     */
    getRealtimeState(): RealtimeState {
        return { ...realtimeState };
    }

    /**
     * Get current performance metrics
     */
    getPerformanceMetrics(): PerformanceMetrics {
        return { ...performanceMetrics };
    }

    /**
     * Update tree view title with real-time info
     */
    updateTreeViewTitle(treeView: vscode.TreeView<any>): void {
        try {
            const connectionCount = this.components?.connectionManager?.getConnections().length || 0;
            const activeConnections = this.getActiveConnectionCount();
            const timestamp = new Date().toLocaleTimeString();

            treeView.title = `PostgreSQL Explorer (${connectionCount} connections, ${activeConnections} active) - ${timestamp}`;

            Logger.debug('Tree view title updated', 'updateTreeViewTitle', {
                connectionCount,
                activeConnections,
                timestamp
            });
        } catch (error) {
            Logger.error('Error updating tree view title', error as Error);
        }
    }

    /**
     * Get active connection count
     */
    private getActiveConnectionCount(): number {
        // This would check actual connection status
        // For now, return a placeholder
        return this.components?.connectionManager?.getConnections().length || 0;
    }

    /**
     * Track tree view expansion/collapse state
     */
    trackTreeViewExpansion(element: any, expanded: boolean): void {
        try {
            // Track expanded/collapsed state for real-time updates
            const elementKey = this.getElementKey(element);

            if (expanded) {
                Logger.debug('Element expanded for real-time tracking', 'trackTreeViewExpansion', {
                    elementKey,
                    expanded
                });

                // Could trigger real-time data refresh for expanded elements
                // This would be useful for schema objects that need fresh data
            } else {
                Logger.debug('Element collapsed', 'trackTreeViewExpansion', {
                    elementKey,
                    expanded
                });
            }
        } catch (error) {
            Logger.error('Error tracking tree view expansion', error as Error);
        }
    }

    /**
     * Get element key for tracking
     */
    private getElementKey(element: any): string {
        // Extract a unique key from the tree element for tracking
        if (element && typeof element === 'object') {
            if (element.id) return element.id;
            if (element.name) return element.name;
            if (element.label) return element.label;
        }
        return 'unknown';
    }
}