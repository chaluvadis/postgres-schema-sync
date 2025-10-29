import * as vscode from 'vscode';
import { ExtensionComponents } from '@/utils/ExtensionInitializer';
import { Logger } from '@/utils/Logger';
interface RealtimeState {
    fileWatchers: Map<string, vscode.FileSystemWatcher>;
    connectionMonitors: Map<string, NodeJS.Timeout>;
    statusBarItem: vscode.StatusBarItem | null;
    schemaMonitors: Map<string, NodeJS.Timeout>;
    activeSQLFile: string | null;
    lastSchemaCheck: Map<string, number>;
    schemaCache: Map<string, SchemaCacheEntry>;
}
interface SchemaCacheEntry {
    schemaFingerprint: string;
    timestamp: number;
    objectCount: number;
    connectionId: string;
    cachedBy: string; // file or global
}
interface PersistentSchemaCacheData {
    schemaFingerprint: string;
    timestamp: number;
    objectCount: number;
    cachedBy: string;
}
interface PerformanceMetrics {
    fileOperations: number;
    connectionChecks: number;
    schemaChecks: number;
    queryExecutions: number;
    averageResponseTime: number;
    lastResetTime: number;
}
let realtimeState: RealtimeState = {
    fileWatchers: new Map(),
    connectionMonitors: new Map(),
    statusBarItem: null,
    schemaMonitors: new Map(),
    activeSQLFile: null,
    lastSchemaCheck: new Map(),
    schemaCache: new Map()
};

let performanceMetrics: PerformanceMetrics = {
    fileOperations: 0,
    connectionChecks: 0,
    schemaChecks: 0,
    queryExecutions: 0,
    averageResponseTime: 0,
    lastResetTime: Date.now()
};
export class EventHandlerManager {
    private context: vscode.ExtensionContext;
    private treeProvider: any;
    private components?: ExtensionComponents;

    constructor(
        context: vscode.ExtensionContext,
        treeProvider: any,
        components?: ExtensionComponents
    ) {
        this.context = context;
        this.treeProvider = treeProvider;
        this.components = components;
    }

    /**
     * Register all event handlers
     */
    registerEventHandlers(): void {
        this.registerTextEditorEvents();
        this.registerConfigurationEvents();
        this.registerWorkspaceEvents();
        this.registerTreeViewEvents();
        this.registerGlobalMonitoringEvents();
        this.registerCleanupHandlers();

        // Register cache management commands
        this.registerCacheManagementCommands();
    }
    private registerTextEditorEvents(): void {
        // Handle active text editor changes
        this.context.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor((editor) => {
                if (!editor) return;

                const document = editor.document;
                const isSQLFile = document.languageId === 'sql' || document.languageId === 'postgresql';
                const fileName = document.fileName.toLowerCase();

                if (isSQLFile || fileName.endsWith('.sql') || fileName.endsWith('.psql')) {
                    Logger.debug('SQL file activated', 'onDidChangeActiveTextEditor', {
                        fileName: document.fileName,
                        languageId: document.languageId
                    });

                    // Update context for SQL-specific commands
                    vscode.commands.executeCommand('setContext', 'postgresql.sqlFileActive', true);
                    vscode.commands.executeCommand('setContext', 'postgresql.sqlFilePath', document.fileName);

                    // Set as active SQL file for real-time monitoring
                    realtimeState.activeSQLFile = document.fileName;

                    // Auto-detect connection based on file path or content
                    this.detectConnectionForSQLFile(document);

                    // Update persistent status bar with SQL file info
                    this.updatePersistentStatusBar(document);

                    // Setup file system watcher for real-time changes
                    this.setupSQLFileWatcher(document);

                    // Start real-time schema monitoring if connected
                    this.startSchemaMonitoring(document);

                    // Trigger IntelliSense refresh if query editor is available
                    if (this.components?.queryEditorView) {
                        this.refreshIntelliSenseForFile(document);
                    }
                } else {
                    // Clear SQL-specific context when switching away from SQL files
                    vscode.commands.executeCommand('setContext', 'postgresql.sqlFileActive', false);
                    realtimeState.activeSQLFile = null;
                    this.clearPersistentStatusBar();
                }
            })
        );

        // Monitor text document changes for real-time updates
        this.context.subscriptions.push(
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
            })
        );
    }
    private registerConfigurationEvents(): void {
        this.context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(event => {
                if (event.affectsConfiguration('postgresql-schema-sync')) {
                    Logger.info('Configuration changed, refreshing extension state');
                    this.treeProvider.refresh();

                    // Update tree view title to reflect changes
                    if (this.components?.treeView) {
                        this.components.treeView.title = `PostgreSQL Explorer (Updated: ${new Date().toLocaleTimeString()})`;
                    }

                    // Restart real-time monitoring with new settings
                    this.restartRealtimeMonitoring();
                }
            })
        );
    }
    private registerWorkspaceEvents(): void {
        this.context.subscriptions.push(
            vscode.workspace.onDidChangeWorkspaceFolders(() => {
                Logger.info('Workspace folders changed, refreshing connections');
                this.treeProvider.refresh();

                // Restart file watchers for new workspace
                this.restartFileWatchers();
            })
        );

        // Setup workspace-wide SQL file watchers
        this.setupWorkspaceSQLWatchers();
    }
    private registerTreeViewEvents(): void {
        if (this.components?.treeView) {
            this.context.subscriptions.push(
                this.components.treeView.onDidChangeVisibility((visible) => {
                    if (visible) {
                        Logger.debug('PostgreSQL tree view became visible');
                        // Refresh data when tree view becomes visible
                        this.treeProvider.refresh();

                        // Start real-time connection monitoring
                        this.startConnectionMonitoring();

                        // Update tree view title with real-time info
                        this.updateTreeViewTitle();
                    } else {
                        // Stop connection monitoring when tree view is hidden
                        this.stopConnectionMonitoring();
                    }
                })
            );

            // Tree view selection handling integrated into tree provider

            // Add real-time expansion/collapse tracking
            this.context.subscriptions.push(
                this.components.treeView.onDidExpandElement((event) => {
                    Logger.debug('Tree view element expanded', 'onDidExpandElement', {
                        element: event.element
                    });

                    // Track expanded elements for real-time updates
                    this.trackTreeViewExpansion(event.element, true);
                })
            );

            this.context.subscriptions.push(
                this.components.treeView.onDidCollapseElement((event) => {
                    Logger.debug('Tree view element collapsed', 'onDidCollapseElement', {
                        element: event.element
                    });

                    // Track collapsed elements for real-time updates
                    this.trackTreeViewExpansion(event.element, false);
                })
            );
        }
    }
    private registerGlobalMonitoringEvents(): void {
        // Monitor VS Code state changes
        this.context.subscriptions.push(
            vscode.window.onDidChangeWindowState((state) => {
                if (state.focused && realtimeState.activeSQLFile) {
                    // Refresh when window gains focus
                    Logger.debug('Window focused, refreshing real-time state', 'onDidChangeWindowState');

                    // Refresh status bar
                    vscode.workspace.openTextDocument(realtimeState.activeSQLFile).then(document => {
                        if (document) {
                            this.updatePersistentStatusBar(document);
                        }
                    }, (error: any) => {
                        Logger.error('Error refreshing on window focus', error);
                    });
                }
            })
        );

        // Start global real-time monitoring
        this.startGlobalRealtimeMonitoring();
    }
    private registerCleanupHandlers(): void {
        // Cleanup on extension deactivation
        this.context.subscriptions.push({
            dispose: () => {
                this.cleanupRealtimeMonitoring();
            }
        });
    }
    private detectConnectionForSQLFile(document: vscode.TextDocument): void {
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
    private initializePersistentStatusBar(): void {
        if (!realtimeState.statusBarItem) {
            realtimeState.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
            realtimeState.statusBarItem.command = 'postgresql.openQueryEditor';
        }
    }
    private updatePersistentStatusBar(document: vscode.TextDocument): void {
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
    private clearPersistentStatusBar(): void {
        if (realtimeState.statusBarItem) {
            realtimeState.statusBarItem.hide();
        }
    }
    private getCurrentConnectionInfo(): string {
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
    private setupSQLFileWatcher(document: vscode.TextDocument): void {
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
    private refreshIntelliSenseForFile(document: vscode.TextDocument): void {
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
    private startSchemaMonitoring(document: vscode.TextDocument): void {
        // Use document to get file-specific context for schema monitoring
        const fileName = document.fileName;
        const fileContent = document.getText();

        // Try to detect connection from document content or use configured connection
        let connectionId = vscode.workspace.getConfiguration().get<string>('postgresql.detectedConnection');

        // If no configured connection, try to detect from document content
        if (!connectionId) {
            const detectedConnectionId = this.detectConnectionFromDocument(fileContent, fileName);
            connectionId = detectedConnectionId || undefined;
        }

        if (!connectionId || !this.components?.schemaManager) {
            Logger.debug('Schema monitoring skipped - no valid connection', 'startSchemaMonitoring', {
                fileName,
                hasConnectionId: !!connectionId
            });
            return;
        }

        // Clear existing monitor for this connection
        if (realtimeState.schemaMonitors.has(connectionId)) {
            clearInterval(realtimeState.schemaMonitors.get(connectionId)!);
        }

        Logger.info('Starting schema monitoring for SQL file', 'startSchemaMonitoring', {
            fileName,
            connectionId
        });

        // Check schema changes every 30 seconds
        const monitor = setInterval(async () => {
            try {
                const lastCheck = realtimeState.lastSchemaCheck.get(connectionId) || 0;
                const now = Date.now();

                // Only check if enough time has passed (30 seconds)
                if (now - lastCheck > 30000) {
                    await this.checkSchemaChanges(connectionId, document);
                    realtimeState.lastSchemaCheck.set(connectionId, now);
                }
            } catch (error) {
                Logger.error('Error in schema monitoring', error as Error, 'startSchemaMonitoring', {
                    connectionId,
                    fileName
                });
            }
        }, 5000); // Check every 5 seconds but only act every 30 seconds

        realtimeState.schemaMonitors.set(connectionId, monitor);
    }
    private async checkSchemaChanges(connectionId: string, document?: vscode.TextDocument): Promise<void> {
        try {
            Logger.debug('Checking for schema changes', 'checkSchemaChanges', {
                connectionId,
                fileName: document?.fileName
            });

            if (!this.components?.schemaManager) {
                Logger.debug('Schema manager not available for change detection', 'checkSchemaChanges');
                return;
            }

            // Get current schema state
            const currentSchema = await this.getCurrentSchemaState(connectionId);

            // Compare with previous state (would need to implement caching)
            const previousSchema = this.getCachedSchemaState(connectionId);

            if (this.hasSchemaChanged(previousSchema, currentSchema)) {
                Logger.info('Schema changes detected', 'checkSchemaChanges', {
                    connectionId,
                    fileName: document?.fileName
                });

                // Show notification to user
                const fileName = document?.fileName.split(/[/\\]/).pop() || 'current file';
                vscode.window.showInformationMessage(
                    `Schema changes detected for "${fileName}". Refresh to see updates.`,
                    'Refresh', 'Ignore'
                ).then(selection => {
                    if (selection === 'Refresh') {
                        vscode.commands.executeCommand('postgresql.refreshExplorer');
                    }
                });

                // Update cached schema state
                this.updateCachedSchemaState(connectionId, currentSchema);
            }

        } catch (error) {
            Logger.error('Error checking schema changes', error as Error, 'checkSchemaChanges', {
                connectionId,
                fileName: document?.fileName
            });
        }
    }
    private detectConnectionFromDocument(content: string, fileName: string): string | null {
        try {
            const connections = this.components?.connectionManager.getConnections() || [];

            // Look for connection hints in file content
            for (const connection of connections) {
                // Check if content contains connection details
                if (content.includes(connection.host) ||
                    content.includes(connection.database) ||
                    content.includes(connection.name)) {
                    Logger.debug('Connection detected in document content', 'detectConnectionFromDocument', {
                        fileName,
                        detectedConnection: connection.name,
                        connectionId: connection.id
                    });
                    return connection.id;
                }
            }

            // Look for database name in file path
            const pathParts = fileName.split(/[/\\]/);
            for (const part of pathParts) {
                const matchingConnection = connections.find(conn =>
                    part.includes(conn.database) || part.includes(conn.name)
                );
                if (matchingConnection) {
                    Logger.debug('Connection detected in file path', 'detectConnectionFromDocument', {
                        fileName,
                        detectedConnection: matchingConnection.name,
                        connectionId: matchingConnection.id
                    });
                    return matchingConnection.id;
                }
            }

            Logger.debug('No connection detected for document', 'detectConnectionFromDocument', { fileName });
            return null;

        } catch (error) {
            Logger.error('Error detecting connection from document', error as Error, 'detectConnectionFromDocument', {
                fileName
            });
            return null;
        }
    }
    private async getCurrentSchemaState(connectionId: string): Promise<string> {
        try {
            if (!this.components?.schemaManager) {
                return '';
            }

            // Get database objects to create a schema fingerprint
            const objects = await this.components.schemaManager.getDatabaseObjects(connectionId);

            // Create a simple hash of object names and types
            const schemaFingerprint = objects
                .sort((a: any, b: any) => a.name.localeCompare(b.name))
                .map((obj: any) => `${obj.type}:${obj.name}:${obj.schema}`)
                .join('|');

            return schemaFingerprint;

        } catch (error) {
            Logger.error('Error getting current schema state', error as Error, 'getCurrentSchemaState', {
                connectionId
            });
            return '';
        }
    }

    /**
     * Get cached schema state for connection
     */
    private getCachedSchemaState(connectionId: string): string {
        try {
            // Check in-memory cache first
            const cachedEntry = realtimeState.schemaCache.get(connectionId);
            if (cachedEntry) {
                // Check if cache is still valid (not older than 1 hour)
                const cacheAge = Date.now() - cachedEntry.timestamp;
                const maxCacheAge = 60 * 60 * 1000; // 1 hour

                if (cacheAge < maxCacheAge) {
                    Logger.debug('Using in-memory cached schema state', 'getCachedSchemaState', {
                        connectionId,
                        cacheAge: Math.round(cacheAge / 1000),
                        objectCount: cachedEntry.objectCount
                    });

                    return cachedEntry.schemaFingerprint;
                } else {
                    // Cache expired, remove it
                    realtimeState.schemaCache.delete(connectionId);
                    Logger.debug('Cached schema state expired, removed from cache', 'getCachedSchemaState', {
                        connectionId,
                        cacheAge: Math.round(cacheAge / 1000)
                    });
                }
            }

            // Try to load from persistent storage (VSCode workspace state)
            const persistentCache = this.loadPersistentSchemaCache(connectionId);
            if (persistentCache) {
                // Validate persistent cache age
                const cacheAge = Date.now() - persistentCache.timestamp;
                const maxPersistentAge = 24 * 60 * 60 * 1000; // 24 hours

                if (cacheAge < maxPersistentAge) {
                    // Move to in-memory cache for faster access
                    realtimeState.schemaCache.set(connectionId, persistentCache);

                    Logger.debug('Using persistent cached schema state', 'getCachedSchemaState', {
                        connectionId,
                        cacheAge: Math.round(cacheAge / 1000 / 60 / 60),
                        objectCount: persistentCache.objectCount
                    });

                    return persistentCache.schemaFingerprint;
                } else {
                    // Persistent cache expired, remove it
                    this.clearPersistentSchemaCache(connectionId);
                    Logger.debug('Persistent cached schema state expired', 'getCachedSchemaState', {
                        connectionId,
                        cacheAge: Math.round(cacheAge / 1000 / 60 / 60)
                    });
                }
            }

            Logger.debug('No valid cached schema state found', 'getCachedSchemaState', { connectionId });
            return '';

        } catch (error) {
            Logger.error('Error retrieving cached schema state', error as Error, 'getCachedSchemaState', {
                connectionId
            });
            return '';
        }
    }

    /**
     * Check if schema has changed
     */
    private hasSchemaChanged(previousSchema: string, currentSchema: string): boolean {
        if (!previousSchema) {
            return !!currentSchema; // Changed if we now have schema data
        }
        return previousSchema !== currentSchema;
    }

    /**
     * Update cached schema state
     */
    private updateCachedSchemaState(connectionId: string, schemaState: string, objectCount: number = 0, cachedBy: string = 'system'): void {
        try {
            // Update in-memory cache
            const cacheEntry: SchemaCacheEntry = {
                schemaFingerprint: schemaState,
                timestamp: Date.now(),
                objectCount,
                connectionId,
                cachedBy
            };

            realtimeState.schemaCache.set(connectionId, cacheEntry);

            // Update persistent cache for long-term storage
            this.savePersistentSchemaCache(connectionId, cacheEntry);

            Logger.debug('Schema state cached successfully', 'updateCachedSchemaState', {
                connectionId,
                stateLength: schemaState.length,
                objectCount,
                cachedBy,
                cacheType: 'both' // in-memory and persistent
            });

        } catch (error) {
            Logger.error('Error updating cached schema state', error as Error, 'updateCachedSchemaState', {
                connectionId,
                stateLength: schemaState.length
            });
        }
    }

    /**
     * Save schema cache to persistent storage
     */
    private savePersistentSchemaCache(connectionId: string, cacheEntry: SchemaCacheEntry): void {
        try {
            const cacheKey = `postgresql.schemaCache.${connectionId}`;
            const cacheData = {
                schemaFingerprint: cacheEntry.schemaFingerprint,
                timestamp: cacheEntry.timestamp,
                objectCount: cacheEntry.objectCount,
                cachedBy: cacheEntry.cachedBy
            };

            // Use VSCode workspace state for persistence
            this.context.workspaceState.update(cacheKey, cacheData);

            Logger.debug('Schema cache saved to persistent storage', 'savePersistentSchemaCache', {
                connectionId,
                cacheKey
            });

        } catch (error) {
            Logger.error('Error saving persistent schema cache', error as Error, 'savePersistentSchemaCache', {
                connectionId
            });
        }
    }

    /**
     * Load schema cache from persistent storage
     */
    private loadPersistentSchemaCache(connectionId: string): SchemaCacheEntry | null {
        try {
            const cacheKey = `postgresql.schemaCache.${connectionId}`;
            const cachedData = this.context.workspaceState.get(cacheKey) as PersistentSchemaCacheData | undefined;

            if (cachedData) {
                // Validate cache data structure
                if (cachedData.schemaFingerprint && cachedData.timestamp) {
                    const cacheEntry: SchemaCacheEntry = {
                        schemaFingerprint: cachedData.schemaFingerprint,
                        timestamp: cachedData.timestamp,
                        objectCount: cachedData.objectCount || 0,
                        connectionId,
                        cachedBy: cachedData.cachedBy || 'persistent'
                    };

                    Logger.debug('Schema cache loaded from persistent storage', 'loadPersistentSchemaCache', {
                        connectionId,
                        cacheAge: Math.round((Date.now() - cacheEntry.timestamp) / 1000 / 60)
                    });

                    return cacheEntry;
                }
            }

            return null;

        } catch (error) {
            Logger.error('Error loading persistent schema cache', error as Error, 'loadPersistentSchemaCache', {
                connectionId
            });
            return null;
        }
    }

    /**
     * Clear schema cache from persistent storage
     */
    private clearPersistentSchemaCache(connectionId: string): void {
        try {
            const cacheKey = `postgresql.schemaCache.${connectionId}`;
            this.context.workspaceState.update(cacheKey, undefined);

            Logger.debug('Persistent schema cache cleared', 'clearPersistentSchemaCache', {
                connectionId,
                cacheKey
            });

        } catch (error) {
            Logger.error('Error clearing persistent schema cache', error as Error, 'clearPersistentSchemaCache', {
                connectionId
            });
        }
    }

    /**
     * Clear all schema caches
     */
    clearAllSchemaCaches(): void {
        try {
            // Clear in-memory cache
            const inMemoryCount = realtimeState.schemaCache.size;
            realtimeState.schemaCache.clear();

            // Clear persistent caches by finding all cache keys
            const allKeys = this.context.workspaceState.keys();
            const cacheKeys = allKeys.filter(key => key.startsWith('postgresql.schemaCache.'));

            cacheKeys.forEach(key => {
                this.context.workspaceState.update(key, undefined);
            });

            Logger.info('All schema caches cleared', 'clearAllSchemaCaches', {
                inMemoryCount,
                persistentKeysCleared: cacheKeys.length
            });

            vscode.window.showInformationMessage(
                `Cleared ${inMemoryCount} in-memory and ${cacheKeys.length} persistent schema caches`
            );

        } catch (error) {
            Logger.error('Error clearing all schema caches', error as Error, 'clearAllSchemaCaches');
            vscode.window.showErrorMessage(`Failed to clear schema caches: ${(error as Error).message}`);
        }
    }

    /**
     * Get schema cache statistics
     */
    getSchemaCacheStats(): {
        inMemoryCache: { count: number; totalSize: number; };
        persistentCache: { keys: string[]; totalSize: number; };
        cacheHealth: 'healthy' | 'degraded' | 'corrupted';
    } {
        try {
            // In-memory cache stats
            let totalSize = 0;
            realtimeState.schemaCache.forEach((entry) => {
                totalSize += entry.schemaFingerprint.length;
            });

            const inMemoryStats = {
                count: realtimeState.schemaCache.size,
                totalSize
            };

            // Persistent cache stats
            const allKeys = this.context.workspaceState.keys();
            const cacheKeys = allKeys.filter(key => key.startsWith('postgresql.schemaCache.'));
            const persistentStats = {
                keys: cacheKeys,
                totalSize: 0 // Would need to calculate actual size
            };

            // Determine cache health
            let cacheHealth: 'healthy' | 'degraded' | 'corrupted' = 'healthy';

            if (inMemoryStats.count === 0 && persistentStats.keys.length === 0) {
                cacheHealth = 'healthy'; // Empty but functional
            } else if (inMemoryStats.count > 100) {
                cacheHealth = 'degraded'; // Too many cached entries
            }

            return {
                inMemoryCache: inMemoryStats,
                persistentCache: persistentStats,
                cacheHealth
            };

        } catch (error) {
            Logger.error('Error getting schema cache statistics', error as Error, 'getSchemaCacheStats');
            return {
                inMemoryCache: { count: 0, totalSize: 0 },
                persistentCache: { keys: [], totalSize: 0 },
                cacheHealth: 'corrupted'
            };
        }
    }

    /**
     * Start connection monitoring
     */
    private startConnectionMonitoring(): void {
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
    private stopConnectionMonitoring(): void {
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
     * Test connection quietly with real-time database validation
     */
    private async testConnectionQuietly(connectionId: string): Promise<boolean> {
        const startTime = Date.now();

        try {
            Logger.debug('Testing connection quietly', 'testConnectionQuietly', {
                connectionId,
                startTime: new Date().toISOString()
            });

            if (!this.components?.connectionManager) {
                Logger.warn('Connection manager not available for quiet testing', 'testConnectionQuietly', {
                    connectionId
                });
                return false;
            }

            // Get connection details
            const connections = this.components.connectionManager.getConnections();
            const connection = connections.find(c => c.id === connectionId);

            if (!connection) {
                Logger.warn('Connection not found for quiet testing', 'testConnectionQuietly', {
                    connectionId
                });
                return false;
            }

            // Perform lightweight connection test
            const isConnected = await this.performLightweightConnectionTest(connection);

            // Record performance metric
            const responseTime = Date.now() - startTime;
            this.recordPerformanceMetric('connectionChecks', responseTime);

            Logger.debug('Quiet connection test completed', 'testConnectionQuietly', {
                connectionId,
                isConnected,
                responseTime
            });

            return isConnected;

        } catch (error) {
            const responseTime = Date.now() - startTime;

            Logger.error('Quiet connection test failed', error as Error, 'testConnectionQuietly', {
                connectionId,
                responseTime
            });

            // Record failed connection check
            this.recordPerformanceMetric('connectionChecks', responseTime);

            return false;
        }
    }

    /**
     * Perform lightweight connection test with real-time database validation
     */
    private async performLightweightConnectionTest(connection: any): Promise<boolean> {
        const testStartTime = Date.now();

        try {
            Logger.debug('Starting real-time lightweight connection test', 'performLightweightConnectionTest', {
                connectionId: connection.id,
                connectionName: connection.name,
                testStartTime: new Date().toISOString()
            });

            if (!this.components?.connectionManager) {
                Logger.warn('Connection manager not available for real-time testing', 'performLightweightConnectionTest', {
                    connectionId: connection.id
                });
                return false;
            }

            // Use the actual connection manager to get connection details
            const connectionInfo = await this.components.connectionManager.getConnection(connection.id);

            if (!connectionInfo) {
                Logger.warn('Connection info not found', 'performLightweightConnectionTest', {
                    connectionId: connection.id
                });
                return false;
            }

            // Get connection password for authentication
            const password = await this.components.connectionManager.getConnectionPassword(connection.id);

            if (!password) {
                Logger.warn('Connection password not available', 'performLightweightConnectionTest', {
                    connectionId: connection.id
                });
                return false;
            }

            // Create proper DotNet connection object
            const dotNetConnection = {
                id: connectionInfo.id,
                name: connectionInfo.name,
                host: connectionInfo.host,
                port: connectionInfo.port,
                database: connectionInfo.database,
                username: connectionInfo.username,
                password: password,
                createdDate: connectionInfo.lastConnected?.toISOString() || new Date().toISOString()
            };

            // Validate connection object
            if (!this.validateConnectionObject(dotNetConnection)) {
                Logger.error('Invalid connection object for testing', 'performLightweightConnectionTest', {
                    connectionId: connection.id,
                    hasRequiredFields: !!(
                        dotNetConnection.host &&
                        dotNetConnection.port &&
                        dotNetConnection.database &&
                        dotNetConnection.username &&
                        dotNetConnection.password
                    )
                });
                return false;
            }

            // Get DotNet service instance for real connection testing
            const { PostgreSqlConnectionManager } = await import('../services/PostgreSqlConnectionManager');
            const dotNetService = PostgreSqlConnectionManager.getInstance();

            // Ensure DotNet service is initialized
            if (!dotNetService) {
                Logger.error('DotNet service not available', 'performLightweightConnectionTest', {
                    connectionId: connection.id
                });
                return false;
            }

            // Perform actual database connection test
            const testTimeout = 5000; // 5 seconds for lightweight testing
            const timeoutPromise = new Promise<boolean>((_, reject) => {
                setTimeout(() => {
                    reject(new Error(`Connection test timed out after ${testTimeout}ms`));
                }, testTimeout);
            });

            const testPromise = dotNetService.testConnection(dotNetConnection)
                .then((result) => {
                    const testDuration = Date.now() - testStartTime;
                    Logger.debug('Real-time connection test successful', 'performLightweightConnectionTest', {
                        connectionId: connection.id,
                        connectionName: connection.name,
                        testDuration,
                        result
                    });
                    return true;
                })
                .catch((error) => {
                    const testDuration = Date.now() - testStartTime;
                    Logger.debug('Real-time connection test failed', 'performLightweightConnectionTest', {
                        connectionId: connection.id,
                        connectionName: connection.name,
                        testDuration,
                        error: (error as Error).message
                    });
                    return false;
                });

            // Race between actual test and timeout
            const result = await Promise.race([testPromise, timeoutPromise]);

            const totalTestTime = Date.now() - testStartTime;
            Logger.debug('Lightweight connection test completed', 'performLightweightConnectionTest', {
                connectionId: connection.id,
                result,
                totalTestTime
            });

            return result;

        } catch (error) {
            const testDuration = Date.now() - testStartTime;

            Logger.error('Error in real-time lightweight connection test', error as Error, 'performLightweightConnectionTest', {
                connectionId: connection.id,
                testDuration
            });

            return false;
        }
    }

    /**
     * Validate connection object structure
     */
    private validateConnectionObject(connection: any): boolean {
        try {
            const requiredFields = ['host', 'port', 'database', 'username', 'password'];
            const missingFields = requiredFields.filter(field => !connection[field]);

            if (missingFields.length > 0) {
                Logger.warn('Connection object missing required fields', 'validateConnectionObject', {
                    missingFields,
                    connectionId: connection.id
                });
                return false;
            }

            // Validate field types and values
            if (typeof connection.port !== 'number' || connection.port <= 0 || connection.port > 65535) {
                Logger.warn('Invalid port number', 'validateConnectionObject', {
                    port: connection.port,
                    connectionId: connection.id
                });
                return false;
            }

            if (typeof connection.host !== 'string' || connection.host.trim().length === 0) {
                Logger.warn('Invalid host', 'validateConnectionObject', {
                    host: connection.host,
                    connectionId: connection.id
                });
                return false;
            }

            Logger.debug('Connection object validation passed', 'validateConnectionObject', {
                connectionId: connection.id,
                host: connection.host,
                port: connection.port,
                database: connection.database
            });

            return true;

        } catch (error) {
            Logger.error('Error validating connection object', error as Error, 'validateConnectionObject', {
                connectionId: connection.id
            });
            return false;
        }
    }




    /**
     * Setup workspace-wide SQL file watchers
     */
    private setupWorkspaceSQLWatchers(): void {
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
    private startGlobalRealtimeMonitoring(): void {
        // Initialize persistent status bar
        this.initializePersistentStatusBar();

        // Initialize performance monitoring
        this.initializePerformanceMonitoring();
    }

    /**
     * Initialize performance monitoring
     */
    private initializePerformanceMonitoring(): void {
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
            realtimeState.statusBarItem.tooltip += `\nPerformance: ${performanceMetrics.queryExecutions} queries, ${avgResponseTime}ms avg`;
        }
    }

    /**
     * Update tree view title with real-time info
     */
    private updateTreeViewTitle(): void {
        try {
            const connectionCount = this.components?.connectionManager?.getConnections().length || 0;
            const activeConnections = this.getActiveConnectionCount();
            const timestamp = new Date().toLocaleTimeString();

            if (this.components?.treeView) {
                this.components.treeView.title = `PostgreSQL Explorer (${connectionCount} connections, ${activeConnections} active) - ${timestamp}`;
            }

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
    private trackTreeViewExpansion(element: any, expanded: boolean): void {
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

    /**
     * Restart real-time monitoring
     */
    private restartRealtimeMonitoring(): void {
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
    private restartFileWatchers(): void {
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
    private cleanupRealtimeMonitoring(): void {
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
        realtimeState.schemaCache.clear();

        // Cleanup expired cache entries
        this.cleanupExpiredCaches();
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
     * Register cache management commands
     */
    registerCacheManagementCommands(): void {
        // Command to clear all schema caches
        vscode.commands.registerCommand('postgresql.clearAllSchemaCaches', () => {
            this.clearAllSchemaCaches();
        });

        // Command to show cache statistics
        vscode.commands.registerCommand('postgresql.showCacheStats', () => {
            this.showCacheStats();
        });

        // Command to cleanup expired caches
        vscode.commands.registerCommand('postgresql.cleanupExpiredCaches', () => {
            this.cleanupExpiredCaches();
        });

        Logger.info('Cache management commands registered', 'registerCacheManagementCommands');
    }

    /**
     * Show cache statistics in output channel
     */
    private showCacheStats(): void {
        const cacheStats = this.getSchemaCacheStats();
        const realtimeStats = this.getRealtimeState();

        const statsMessage = `
PostgreSQL Extension - Cache Statistics
======================================

Schema Cache Status:
- Health: ${cacheStats.cacheHealth.toUpperCase()}
- In-Memory Entries: ${cacheStats.inMemoryCache.count}
- In-Memory Size: ${cacheStats.inMemoryCache.totalSize} characters
- Persistent Keys: ${cacheStats.persistentCache.keys.length}

Real-time Monitoring:
- Active File Watchers: ${realtimeStats.fileWatchers.size}
- Connection Monitors: ${realtimeStats.connectionMonitors.size}
- Schema Monitors: ${realtimeStats.schemaMonitors.size}
- Active SQL File: ${realtimeStats.activeSQLFile ? 'Yes' : 'No'}

Performance Metrics:
- File Operations: ${performanceMetrics.fileOperations}
- Connection Checks: ${performanceMetrics.connectionChecks}
- Schema Checks: ${performanceMetrics.schemaChecks}
- Query Executions: ${performanceMetrics.queryExecutions}
- Avg Response Time: ${Math.round(performanceMetrics.averageResponseTime)}ms

Generated at: ${new Date().toLocaleString()}
        `.trim();

        // Show in output channel
        const channel = vscode.window.createOutputChannel('PostgreSQL Cache');
        channel.clear();
        channel.appendLine(statsMessage);
        channel.show();

        // Show summary in info message
        vscode.window.showInformationMessage(
            `Cache: ${cacheStats.inMemoryCache.count} entries, ${cacheStats.cacheHealth} health`,
            'View Details', 'Clear Caches'
        ).then(selection => {
            if (selection === 'View Details') {
                channel.show();
            } else if (selection === 'Clear Caches') {
                this.clearAllSchemaCaches();
            }
        });
    }

    /**
     * Cleanup expired cache entries
     */
    cleanupExpiredCaches(): void {
        try {
            const initialInMemoryCount = realtimeState.schemaCache.size;
            const initialPersistentKeys = this.context.workspaceState.keys().filter(key =>
                key.startsWith('postgresql.schemaCache.')
            ).length;

            let removedInMemory = 0;
            let removedPersistent = 0;

            // Cleanup in-memory cache
            const now = Date.now();
            const maxAge = 60 * 60 * 1000; // 1 hour

            for (const [connectionId, entry] of realtimeState.schemaCache.entries()) {
                if (now - entry.timestamp > maxAge) {
                    realtimeState.schemaCache.delete(connectionId);
                    removedInMemory++;
                }
            }

            // Cleanup persistent cache
            const allKeys = this.context.workspaceState.keys();
            const expiredKeys: string[] = [];

            for (const key of allKeys) {
                if (key.startsWith('postgresql.schemaCache.')) {
                    const cachedData = this.context.workspaceState.get(key) as PersistentSchemaCacheData | undefined;
                    if (cachedData && now - cachedData.timestamp > maxAge) {
                        expiredKeys.push(key);
                    }
                }
            }

            // Remove expired persistent cache entries
            expiredKeys.forEach(key => {
                this.context.workspaceState.update(key, undefined);
                removedPersistent++;
            });

            Logger.info('Expired cache cleanup completed', 'cleanupExpiredCaches', {
                removedInMemory,
                removedPersistent,
                remainingInMemory: initialInMemoryCount - removedInMemory,
                remainingPersistent: initialPersistentKeys - removedPersistent
            });

            vscode.window.showInformationMessage(
                `Cache cleanup: Removed ${removedInMemory} in-memory, ${removedPersistent} persistent entries`
            );

        } catch (error) {
            Logger.error('Error during cache cleanup', error as Error, 'cleanupExpiredCaches');
            vscode.window.showErrorMessage(`Cache cleanup failed: ${(error as Error).message}`);
        }
    }
}