import { useCallback, useEffect, useState } from "react";

// VS Code API for communication with extension
declare const acquireVsCodeApi: () => any;
const vscode = acquireVsCodeApi();

export interface DatabaseConnection {
	id: string;
	name: string;
	host: string;
	port: number;
	database?: string;
	username?: string;
	status: "connected" | "disconnected" | "error" | "connecting";
	lastSync?: Date;
	errorMessage?: string;
	connectionTime?: number;
	ssl?: boolean;
	version?: string;
}

export interface UseDatabaseConnectionsReturn {
	connections: DatabaseConnection[];
	loading: boolean;
	error: string | null;
	refreshConnections: () => Promise<void>;
	connectToDatabase: (connectionId: string) => Promise<void>;
	disconnectFromDatabase: (connectionId: string) => Promise<void>;
	testConnection: (connectionId: string) => Promise<boolean>;
	addConnection: (connection: Omit<DatabaseConnection, "id" | "status">) => Promise<void>;
	removeConnection: (connectionId: string) => Promise<void>;
	updateConnection: (connectionId: string, updates: Partial<DatabaseConnection>) => Promise<void>;
}

export const useDatabaseConnections = (): UseDatabaseConnectionsReturn => {
	const [connections, setConnections] = useState<DatabaseConnection[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Load connections on mount
	useEffect(() => {
		refreshConnections();
	}, []);

	// Listen for messages from extension
	useEffect(() => {
		const messageHandler = (event: MessageEvent) => {
			const message = event.data;
			switch (message.command) {
				case "connectionsLoaded":
					setConnections(
						message.connections.map((conn: any) => ({
							...conn,
							lastSync: conn.lastSync ? new Date(conn.lastSync) : undefined,
						})),
					);
					setLoading(false);
					setError(null);
					break;
				case "connectionStatusChanged":
					setConnections((prev) =>
						prev.map((conn) =>
							conn.id === message.connectionId
								? {
										...conn,
										status: message.status,
										errorMessage: message.errorMessage,
									}
								: conn,
						),
					);
					break;
				case "connectionTested":
					// Handle connection test results
					if (message.success) {
						setConnections((prev) =>
							prev.map((conn) =>
								conn.id === message.connectionId ? { ...conn, status: "connected", errorMessage: undefined } : conn,
							),
						);
					} else {
						setConnections((prev) =>
							prev.map((conn) =>
								conn.id === message.connectionId
									? {
											...conn,
											status: "error",
											errorMessage: message.errorMessage,
										}
									: conn,
							),
						);
					}
					break;
				case "connectionError":
					setError(message.error);
					setLoading(false);
					break;
			}
		};

		window.addEventListener("message", messageHandler);
		return () => window.removeEventListener("message", messageHandler);
	}, []);

	const refreshConnections = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			vscode.postMessage({ command: "getConnections" });
		} catch (err) {
			setError("Failed to refresh connections");
			setLoading(false);
		}
	}, []);

	const connectToDatabase = useCallback(async (connectionId: string) => {
		try {
			setConnections((prev) =>
				prev.map((conn) => (conn.id === connectionId ? { ...conn, status: "connecting" as const } : conn)),
			);

			vscode.postMessage({
				command: "connectToDatabase",
				connectionId,
			});
		} catch (err) {
			setError("Failed to initiate connection");
		}
	}, []);

	const disconnectFromDatabase = useCallback(async (connectionId: string) => {
		try {
			vscode.postMessage({
				command: "disconnectFromDatabase",
				connectionId,
			});
		} catch (err) {
			setError("Failed to disconnect");
		}
	}, []);

	const testConnection = useCallback(async (connectionId: string): Promise<boolean> => {
		return new Promise((resolve) => {
			const messageHandler = (event: MessageEvent) => {
				const message = event.data;
				if (message.command === "connectionTested" && message.connectionId === connectionId) {
					window.removeEventListener("message", messageHandler);
					resolve(message.success);
				}
			};

			window.addEventListener("message", messageHandler);

			vscode.postMessage({
				command: "testConnection",
				connectionId,
			});

			// Timeout after 30 seconds
			setTimeout(() => {
				window.removeEventListener("message", messageHandler);
				resolve(false);
			}, 30000);
		});
	}, []);

	const addConnection = useCallback(async (connection: Omit<DatabaseConnection, "id" | "status">) => {
		try {
			vscode.postMessage({
				command: "addConnection",
				connection,
			});
		} catch (err) {
			setError("Failed to add connection");
		}
	}, []);

	const removeConnection = useCallback(async (connectionId: string) => {
		try {
			vscode.postMessage({
				command: "removeConnection",
				connectionId,
			});
		} catch (err) {
			setError("Failed to remove connection");
		}
	}, []);

	const updateConnection = useCallback(async (connectionId: string, updates: Partial<DatabaseConnection>) => {
		try {
			vscode.postMessage({
				command: "updateConnection",
				connectionId,
				updates,
			});
		} catch (err) {
			setError("Failed to update connection");
		}
	}, []);

	return {
		connections,
		loading,
		error,
		refreshConnections,
		connectToDatabase,
		disconnectFromDatabase,
		testConnection,
		addConnection,
		removeConnection,
		updateConnection,
	};
};
