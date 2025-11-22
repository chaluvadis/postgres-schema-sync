import * as vscode from "vscode";
import { ExtensionComponents } from "@/utils/ExtensionInitializer";
import { Logger } from "@/utils/Logger";

export class RealtimeMonitoringManager {
	private components?: ExtensionComponents;
	constructor(components?: ExtensionComponents) {
		this.components = components;
	}
	// Master switch to disable all monitoring by default
	isMonitoringEnabled(): boolean {
		const config = vscode.workspace.getConfiguration("postgresql-schema-sync");
		return config.get<boolean>("realtimeMonitoringEnabled", false); // Disabled by default
	}
	updateTreeViewTitle(treeView: vscode.TreeView<any>): void {
		// Check master monitoring switch first
		if (!this.isMonitoringEnabled()) {
			// Update title without real-time info when monitoring is disabled
			const connectionCount = this.components?.connectionManager?.getConnections().length || 0;
			treeView.title = `PostgreSQL Explorer (${connectionCount} connections)`;
			return;
		}

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
}
