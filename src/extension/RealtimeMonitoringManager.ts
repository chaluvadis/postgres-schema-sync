import * as vscode from "vscode";
import { ExtensionComponents } from "@/utils/ExtensionInitializer";
import { Logger } from "@/utils/Logger";

interface RealtimeState {
	fileWatchers: Map<string, vscode.FileSystemWatcher>;
	connectionMonitors: Map<string, NodeJS.Timeout>;
	statusBarItem: vscode.StatusBarItem | null;
	schemaMonitors: Map<string, NodeJS.Timeout>;
	activeSQLFile: string | null;
	lastSchemaCheck: Map<string, number>;
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
};

let performanceMetrics: PerformanceMetrics = {
	fileOperations: 0,
	connectionChecks: 0,
	schemaChecks: 0,
	queryExecutions: 0,
	averageResponseTime: 0,
	lastResetTime: Date.now(),
};
export class RealtimeMonitoringManager {
	private components?: ExtensionComponents;
	constructor(components?: ExtensionComponents) {
		this.components = components;
	}

	initializePersistentStatusBar(): void {
		if (!realtimeState.statusBarItem) {
			realtimeState.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
			realtimeState.statusBarItem.command = "postgresql.openQueryEditor";
		}
	}
	updatePersistentStatusBar(document: vscode.TextDocument): void {
		if (!realtimeState.statusBarItem) {
			this.initializePersistentStatusBar();
		}

		if (!realtimeState.statusBarItem) {
			return;
		}

		const fileName = document.fileName.split(/[/\\]/).pop() || "Unknown";
		const connectionInfo = this.getCurrentConnectionInfo();
		const lastModified = new Date(document.uri.fsPath).toLocaleTimeString();

		realtimeState.statusBarItem.text = `$(database) ${fileName}`;
		realtimeState.statusBarItem.tooltip = `SQL File: ${document.fileName}\nLanguage: ${
			document.languageId
		}\nLast Modified: ${lastModified}\nConnection: ${connectionInfo}\nSize: ${document.getText().length} characters`;
		realtimeState.statusBarItem.show();

		Logger.debug("Persistent status bar updated", "updatePersistentStatusBar", {
			fileName,
			languageId: document.languageId,
		});
	}
	clearPersistentStatusBar(): void {
		if (realtimeState.statusBarItem) {
			realtimeState.statusBarItem.hide();
		}
	}
	getCurrentConnectionInfo(): string {
		const detectedConnectionId = vscode.workspace
			.getConfiguration()
			.get<string>("postgresql-schema-sync.detectedConnection");
		if (detectedConnectionId && this.components?.connectionManager) {
			const connections = this.components.connectionManager.getConnections();
			const connection = connections.find((c) => c.id === detectedConnectionId);
			if (connection) {
				return `${connection.name} (${connection.host}:${connection.port})`;
			}
		}
		return "None";
	}
	setupSQLFileWatcher(document: vscode.TextDocument): void {
		const filePath = document.fileName;

		// Remove existing watcher if any
		if (realtimeState.fileWatchers.has(filePath)) {
			realtimeState.fileWatchers.get(filePath)?.dispose();
		}

		// Create new file watcher for real-time changes
		const watcher = vscode.workspace.createFileSystemWatcher(filePath);

		watcher.onDidChange((uri) => {
			Logger.debug("SQL file changed", "setupSQLFileWatcher", {
				filePath: uri.fsPath,
			});

			// Update status bar with modification time
			if (realtimeState.activeSQLFile === filePath) {
				this.updatePersistentStatusBar(document);
			}

			// Trigger IntelliSense refresh
			if (this.components?.queryEditorView) {
				this.refreshIntelliSenseForFile(document);
			}

			// Show notification for external changes
			vscode.window
				.showInformationMessage(
					`SQL file "${document.fileName.split(/[/\\]/).pop()}" was modified externally`,
					"Refresh",
					"Ignore",
				)
				.then((selection) => {
					if (selection === "Refresh") {
						vscode.commands.executeCommand("postgresql.refreshExplorer");
					}
				});
		});

		watcher.onDidDelete((uri) => {
			Logger.info("SQL file deleted", "setupSQLFileWatcher", {
				filePath: uri.fsPath,
			});

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
	refreshIntelliSenseForFile(document: vscode.TextDocument): void {
		try {
			const content = document.getText();
			const connectionId = vscode.workspace.getConfiguration().get<string>("postgresql-schema-sync.detectedConnection");

			if (connectionId && this.components?.queryEditorView) {
				// Trigger IntelliSense refresh for the current file
				Logger.debug("Refreshing IntelliSense for SQL file", "refreshIntelliSenseForFile", {
					fileName: document.fileName,
					connectionId,
				});

				// This could be enhanced to provide real-time suggestions based on file content
				vscode.commands.executeCommand("editor.action.triggerSuggest");
			}
		} catch (error) {
			Logger.error("Error refreshing IntelliSense", error as Error);
		}
	}
	startConnectionMonitoring(): void {
		if (!this.components?.connectionManager) {
			return;
		}

		const connections = this.components.connectionManager.getConnections();

		connections.forEach((connection) => {
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
	stopConnectionMonitoring(): void {
		realtimeState.connectionMonitors.forEach((monitor) => {
			clearInterval(monitor);
		});
		realtimeState.connectionMonitors.clear();
	}
	private async checkConnectionStatus(connectionId: string): Promise<void> {
		try {
			// Test connection status
			const isConnected = await this.testConnectionQuietly(connectionId);

			if (!isConnected) {
				Logger.warn("Connection lost", "checkConnectionStatus", {
					connectionId,
				});

				// Update status bar to show connection issue
				if (realtimeState.statusBarItem) {
					realtimeState.statusBarItem.text = "$(warning) Connection Lost";
					realtimeState.statusBarItem.tooltip += "\nConnection status: Disconnected";
				}

				// Show notification
				vscode.window
					.showWarningMessage("Database connection lost. Attempting to reconnect...", "Retry Now", "View Details")
					.then((selection) => {
						if (selection === "Retry Now") {
							vscode.commands.executeCommand("postgresql.testConnection");
						} else if (selection === "View Details") {
							Logger.showOutputChannel();
						}
					});
			} else {
				Logger.debug("Connection healthy", "checkConnectionStatus", {
					connectionId,
				});
			}
		} catch (error) {
			Logger.error("Error checking connection status", error as Error);
		}
	}
	private async testConnectionQuietly(connectionId: string): Promise<boolean> {
		try {
			// Get connection details from the connection manager
			const connection = this.components?.connectionManager?.getConnection(connectionId);
			if (!connection) {
				Logger.warn("Connection not found for quiet test", "testConnectionQuietly", { connectionId });
				return false;
			}

			// Get password securely from secret storage
			const password = await this.components?.connectionManager?.getConnectionPassword(connectionId);
			if (!password) {
				Logger.warn("Password not available for connection test", "testConnectionQuietly", { connectionId });
				return false;
			}

			// Validate connection parameters
			if (!connection.host || !connection.port || !connection.database || !connection.username) {
				Logger.warn("Invalid connection parameters", "testConnectionQuietly", {
					connectionId,
				});
				return false;
			}

			// Create DotNet connection info for testing
			const dotNetConnection: any = {
				id: connection.id,
				name: connection.name,
				host: connection.host,
				port: connection.port,
				database: connection.database,
				username: connection.username,
				password: password, // Note: In production, this should be encrypted
			};

			// Test connection with a short timeout (5 seconds for quiet testing)
			const testPromise = this.testConnectionWithDotNet(dotNetConnection);
			const timeoutPromise = new Promise<boolean>((_, reject) =>
				setTimeout(() => reject(new Error("Connection test timed out")), 5000),
			);

			const result = await Promise.race([testPromise, timeoutPromise]);
			const isConnected = !!result;

			Logger.debug("Quiet connection test completed", "testConnectionQuietly", {
				connectionId,
				success: isConnected,
			});

			return isConnected;
		} catch (error) {
			Logger.warn("Quiet connection test failed", "testConnectionQuietly", {
				connectionId,
				error: (error as Error).message,
			});
			return false;
		}
	}
	private async testConnectionWithDotNet(dotNetConnection: any): Promise<boolean> {
		try {
			// Import PostgreSqlConnectionManager dynamically to avoid circular dependencies
			const { PostgreSqlConnectionManager } = await import("@/core/PostgreSqlConnectionManager");
			const dotNetService = PostgreSqlConnectionManager.getInstance();

			if (!dotNetService) {
				Logger.error("DotNet service not available", "testConnectionWithDotNet");
				return false;
			}

			const result = await dotNetService.testConnection(dotNetConnection);
			return !!result;
		} catch (error) {
			Logger.error("DotNet connection test error", error as Error, "testConnectionWithDotNet");
			return false;
		}
	}
	setupWorkspaceSQLWatchers(): void {
		// Watch for SQL files in the entire workspace
		const sqlPattern = "**/*.{sql,psql}";
		const watcher = vscode.workspace.createFileSystemWatcher(sqlPattern);

		watcher.onDidCreate((uri) => {
			Logger.info("New SQL file detected", "setupWorkspaceSQLWatchers", {
				filePath: uri.fsPath,
			});

			// Setup watcher for the new file
			vscode.workspace.openTextDocument(uri).then((document) => {
				if (document) {
					this.setupSQLFileWatcher(document);
				}
			});
		});

		watcher.onDidDelete((uri) => {
			Logger.info("SQL file removed from workspace", "setupWorkspaceSQLWatchers", { filePath: uri.fsPath });

			// Clean up watcher
			if (realtimeState.fileWatchers.has(uri.fsPath)) {
				realtimeState.fileWatchers.get(uri.fsPath)?.dispose();
				realtimeState.fileWatchers.delete(uri.fsPath);
			}
		});

		// Store the watcher reference for cleanup
		(realtimeState as any).workspaceWatcher = watcher;
	}
	startGlobalRealtimeMonitoring(): void {
		// Monitor VS Code state changes
		vscode.window.onDidChangeWindowState((state) => {
			if (state.focused && realtimeState.activeSQLFile) {
				// Refresh when window gains focus
				Logger.debug("Window focused, refreshing real-time state", "startGlobalRealtimeMonitoring");

				// Refresh status bar
				vscode.workspace.openTextDocument(realtimeState.activeSQLFile).then(
					(document) => {
						if (document) {
							this.updatePersistentStatusBar(document);
						}
					},
					(error: any) => {
						Logger.error("Error refreshing on window focus", error);
					},
				);
			}
		});

		// Monitor text document changes for real-time updates
		vscode.workspace.onDidChangeTextDocument((event) => {
			const document = event.document;
			const isSQLFile = document.languageId === "sql" || document.languageId === "postgresql";

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
	restartRealtimeMonitoring(): void {
		Logger.info("Restarting real-time monitoring", "restartRealtimeMonitoring");

		// Stop existing monitoring
		this.cleanupRealtimeMonitoring();

		// Restart monitoring
		this.startConnectionMonitoring();
		this.setupWorkspaceSQLWatchers();
		this.startGlobalRealtimeMonitoring();
	}
	restartFileWatchers(): void {
		Logger.info("Restarting file watchers", "restartFileWatchers");

		// Clear existing watchers
		realtimeState.fileWatchers.forEach((watcher) => watcher.dispose());
		realtimeState.fileWatchers.clear();

		// Setup new watchers for current workspace
		this.setupWorkspaceSQLWatchers();
	}
	cleanupRealtimeMonitoring(): void {
		Logger.info("Cleaning up real-time monitoring", "cleanupRealtimeMonitoring");

		// Dispose file watchers
		realtimeState.fileWatchers.forEach((watcher) => watcher.dispose());
		realtimeState.fileWatchers.clear();

		// Clear connection monitors
		this.stopConnectionMonitoring();

		// Clear schema monitors
		realtimeState.schemaMonitors.forEach((monitor) => clearInterval(monitor));
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
	detectConnectionForSQLFile(document: vscode.TextDocument): void {
		try {
			const fileName = document.fileName;
			const content = document.getText();

			// Try to detect connection based on file name patterns
			const connections = this.components?.connectionManager.getConnections() || [];

			// Look for database name in file path
			const pathParts = fileName.split(/[/\\]/);
			for (const part of pathParts) {
				const matchingConnection = connections.find((conn) => part.includes(conn.database) || part.includes(conn.name));
				if (matchingConnection) {
					vscode.commands.executeCommand(
						"setContext",
						"postgresql-schema-sync.detectedConnection",
						matchingConnection.id,
					);
					Logger.debug("Auto-detected connection for SQL file", "detectConnectionForSQLFile", {
						fileName,
						detectedConnection: matchingConnection.name,
					});
					return;
				}
			}

			// Look for connection hints in file content
			for (const connection of connections) {
				if (content.includes(connection.host) || content.includes(connection.database)) {
					vscode.commands.executeCommand("setContext", "postgresql-schema-sync.detectedConnection", connection.id);
					Logger.debug("Connection detected in SQL content", "detectConnectionForSQLFile", {
						fileName,
						detectedConnection: connection.name,
					});
					return;
				}
			}

			// No specific connection detected
			vscode.commands.executeCommand("setContext", "postgresql-schema-sync.detectedConnection", null);
		} catch (error) {
			Logger.error("Error detecting connection for SQL file", error as Error);
		}
	}
	initializePerformanceMonitoring(): void {
		// Reset metrics every hour
		setInterval(() => {
			this.resetPerformanceMetrics();
		}, 3600000);

		Logger.info("Performance monitoring initialized", "initializePerformanceMonitoring");
	}
	recordPerformanceMetric(type: keyof PerformanceMetrics, responseTime?: number): void {
		try {
			switch (type) {
				case "fileOperations":
					performanceMetrics.fileOperations++;
					break;
				case "connectionChecks":
					performanceMetrics.connectionChecks++;
					break;
				case "schemaChecks":
					performanceMetrics.schemaChecks++;
					break;
				case "queryExecutions":
					performanceMetrics.queryExecutions++;
					break;
				case "averageResponseTime":
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
			Logger.error("Error recording performance metric", error as Error);
		}
	}
	private resetPerformanceMetrics(): void {
		Logger.info("Resetting performance metrics", "resetPerformanceMetrics", {
			previousMetrics: { ...performanceMetrics },
		});

		performanceMetrics = {
			fileOperations: 0,
			connectionChecks: 0,
			schemaChecks: 0,
			queryExecutions: 0,
			averageResponseTime: 0,
			lastResetTime: Date.now(),
		};
	}
	private logPerformanceSummary(): void {
		const uptime = Date.now() - performanceMetrics.lastResetTime;
		const avgResponseTime =
			performanceMetrics.averageResponseTime > 0 ? Math.round(performanceMetrics.averageResponseTime) : 0;

		Logger.info("Real-time Performance Summary", "logPerformanceSummary", {
			uptime: `${Math.round(uptime / 1000)}s`,
			fileOperations: performanceMetrics.fileOperations,
			connectionChecks: performanceMetrics.connectionChecks,
			schemaChecks: performanceMetrics.schemaChecks,
			queryExecutions: performanceMetrics.queryExecutions,
			averageResponseTime: `${avgResponseTime}ms`,
		});

		// Show performance info in status bar if there's an active SQL file
		if (realtimeState.statusBarItem && realtimeState.activeSQLFile) {
			if (realtimeState.statusBarItem.tooltip) {
				realtimeState.statusBarItem.tooltip += `\nPerformance: ${performanceMetrics.queryExecutions} queries, ${avgResponseTime}ms avg`;
			}
		}
	}
	getRealtimeState(): RealtimeState {
		return { ...realtimeState };
	}
	getPerformanceMetrics(): PerformanceMetrics {
		return { ...performanceMetrics };
	}
	updateTreeViewTitle(treeView: vscode.TreeView<any>): void {
		try {
			const connectionCount = this.components?.connectionManager?.getConnections().length || 0;
			const activeConnections = this.getActiveConnectionCount();
			const timestamp = new Date().toLocaleTimeString();

			treeView.title = `PostgreSQL Explorer (${connectionCount} connections, ${activeConnections} active) - ${timestamp}`;

			Logger.debug("Tree view title updated", "updateTreeViewTitle", {
				connectionCount,
				activeConnections,
				timestamp,
			});
		} catch (error) {
			Logger.error("Error updating tree view title", error as Error);
		}
	}
	private getActiveConnectionCount(): number {
		// This would check actual connection status
		// For now, return a placeholder
		return this.components?.connectionManager?.getConnections().length || 0;
	}
	trackTreeViewExpansion(element: any, expanded: boolean): void {
		try {
			// Track expanded/collapsed state for real-time updates
			const elementKey = this.getElementKey(element);

			if (expanded) {
				Logger.debug("Element expanded for real-time tracking", "trackTreeViewExpansion", {
					elementKey,
					expanded,
				});

				// Could trigger real-time data refresh for expanded elements
				// This would be useful for schema objects that need fresh data
			} else {
				Logger.debug("Element collapsed", "trackTreeViewExpansion", {
					elementKey,
					expanded,
				});
			}
		} catch (error) {
			Logger.error("Error tracking tree view expansion", error as Error);
		}
	}
	private getElementKey(element: any): string {
		// Extract a unique key from the tree element for tracking
		if (element && typeof element === "object") {
			if (element.id) {
				return element.id;
			}
			if (element.name) {
				return element.name;
			}
			if (element.label) {
				return element.label;
			}
		}
		return "unknown";
	}
}
