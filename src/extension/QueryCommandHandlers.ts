import * as vscode from "vscode";
import { DatabaseConnection } from "@/managers/ConnectionManager";
import { ExtensionComponents } from "@/utils/ExtensionInitializer";
import { Logger } from "@/utils/Logger";

interface ConnectionItem {
	label: string;
	detail: string;
	connection: DatabaseConnection;
}

/**
 * Handles query-related commands for the PostgreSQL extension.
 * Manages query editor operations and connection selection for queries.
 */
export class QueryCommandHandlers {
	private components: ExtensionComponents;

	constructor(components: ExtensionComponents) {
		this.components = components;
	}

	/**
	 * Opens the query editor for a specific connection.
	 * @param connection The database connection.
	 */
	async openQueryEditor(connection?: DatabaseConnection): Promise<void> {
		if (this.components.queryEditorView) {
			await this.components.queryEditorView.showQueryEditor(connection?.id);
			Logger.info("Query editor opened successfully", "QueryCommandHandlers", {
				connectionId: connection?.id,
			});
		} else {
			Logger.warn("Query editor view not available", "QueryCommandHandlers");
			vscode.window.showErrorMessage("Query editor not available");
		}
	}

	/**
	 * Executes a query by selecting a connection and opening the query editor.
	 */
	async executeQuery(): Promise<void> {
		if (this.components.queryEditorView) {
			const selectedConnection = await this.selectConnection();
			if (!selectedConnection) {
				return;
			}

			await this.components.queryEditorView.showQueryEditor(selectedConnection.id);
		} else {
			vscode.window.showErrorMessage("Query editor not available");
		}
	}

	/**
	 * Selects a database connection from available connections.
	 * @returns The selected connection or undefined if cancelled.
	 */
	private async selectConnection(): Promise<DatabaseConnection | undefined> {
		const connections = this.components.connectionManager.getConnections();
		if (connections.length === 0) {
			vscode.window.showErrorMessage("No database connections available. Please add a connection first.");
			return undefined;
		}

		let selectedConnection = connections[0];
		if (connections.length > 1) {
			const connectionItems: ConnectionItem[] = connections.map((conn) => ({
				label: conn.name,
				detail: `${conn.host}:${conn.port}/${conn.database}`,
				connection: conn,
			}));

			const selected = await vscode.window.showQuickPick(connectionItems, {
				placeHolder: "Select a database connection",
			});

			if (!selected) {
				return undefined;
			}
			selectedConnection = selected.connection;
		}

		return selectedConnection;
	}
}
