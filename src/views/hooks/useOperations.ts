import { useCallback, useEffect, useState } from "react";

// VS Code API for communication with extension
declare const acquireVsCodeApi: () => any;
const vscode = acquireVsCodeApi();

export interface Operation {
	id: string;
	type: "migration" | "sync" | "backup" | "query" | "analysis" | "schema_comparison";
	status: "pending" | "running" | "completed" | "failed" | "cancelled";
	name: string;
	description?: string;
	progress?: number;
	startTime: Date;
	endTime?: Date;
	duration?: number;
	errorMessage?: string;
	metadata?: Record<string, any>;
	sourceConnectionId?: string;
	targetConnectionId?: string;
	steps?: OperationStep[];
}

export interface OperationStep {
	id: string;
	name: string;
	status: "pending" | "running" | "completed" | "failed" | "skipped";
	startTime?: Date;
	endTime?: Date;
	duration?: number;
	errorMessage?: string;
	sqlScript?: string;
	rollbackScript?: string;
}

export interface UseOperationsReturn {
	operations: Operation[];
	activeOperations: Operation[];
	completedOperations: Operation[];
	loading: boolean;
	error: string | null;
	refreshOperations: () => Promise<void>;
	startOperation: (operation: Omit<Operation, "id" | "status" | "startTime">) => Promise<string>;
	cancelOperation: (operationId: string) => Promise<void>;
	getOperationDetails: (operationId: string) => Promise<Operation | null>;
	clearCompletedOperations: () => void;
	retryOperation: (operationId: string) => Promise<void>;
}

export const useOperations = (): UseOperationsReturn => {
	const [operations, setOperations] = useState<Operation[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Load operations on mount
	useEffect(() => {
		refreshOperations();
	}, []);

	// Listen for messages from extension
	useEffect(() => {
		const messageHandler = (event: MessageEvent) => {
			const message = event.data;
			switch (message.command) {
				case "operationsLoaded":
					setOperations(
						message.operations.map((op: any) => ({
							...op,
							startTime: new Date(op.startTime),
							endTime: op.endTime ? new Date(op.endTime) : undefined,
							steps: op.steps?.map((step: any) => ({
								...step,
								startTime: step.startTime ? new Date(step.startTime) : undefined,
								endTime: step.endTime ? new Date(step.endTime) : undefined,
							})),
						})),
					);
					setLoading(false);
					setError(null);
					break;
				case "operationStarted":
					setOperations((prev) => [
						...prev,
						{
							...message.operation,
							startTime: new Date(message.operation.startTime),
						},
					]);
					break;
				case "operationUpdated":
					setOperations((prev) =>
						prev.map((op) =>
							op.id === message.operationId
								? {
										...op,
										...message.updates,
										endTime: message.updates.endTime ? new Date(message.updates.endTime) : op.endTime,
										steps:
											message.updates.steps?.map((step: any) => ({
												...step,
												startTime: step.startTime ? new Date(step.startTime) : undefined,
												endTime: step.endTime ? new Date(step.endTime) : undefined,
											})) || op.steps,
									}
								: op,
						),
					);
					break;
				case "operationCompleted":
					setOperations((prev) =>
						prev.map((op) =>
							op.id === message.operationId
								? {
										...op,
										status: message.success ? "completed" : "failed",
										endTime: new Date(),
										duration: message.duration,
										errorMessage: message.errorMessage,
										progress: 100,
									}
								: op,
						),
					);
					break;
				case "operationError":
					setError(message.error);
					setLoading(false);
					break;
			}
		};

		window.addEventListener("message", messageHandler);
		return () => window.removeEventListener("message", messageHandler);
	}, []);

	const refreshOperations = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			vscode.postMessage({ command: "getOperations" });
		} catch (err) {
			setError("Failed to refresh operations");
			setLoading(false);
		}
	}, []);

	const startOperation = useCallback(
		async (operation: Omit<Operation, "id" | "status" | "startTime">): Promise<string> => {
			return new Promise((resolve, reject) => {
				const messageHandler = (event: MessageEvent) => {
					const message = event.data;
					if (message.command === "operationStarted") {
						window.removeEventListener("message", messageHandler);
						resolve(message.operation.id);
					} else if (message.command === "operationError") {
						window.removeEventListener("message", messageHandler);
						reject(new Error(message.error));
					}
				};

				window.addEventListener("message", messageHandler);

				vscode.postMessage({
					command: "startOperation",
					operation,
				});

				// Timeout after 5 seconds
				setTimeout(() => {
					window.removeEventListener("message", messageHandler);
					reject(new Error("Operation start timeout"));
				}, 5000);
			});
		},
		[],
	);

	const cancelOperation = useCallback(async (operationId: string) => {
		try {
			vscode.postMessage({
				command: "cancelOperation",
				operationId,
			});
		} catch (err) {
			setError("Failed to cancel operation");
		}
	}, []);

	const getOperationDetails = useCallback(async (operationId: string): Promise<Operation | null> => {
		return new Promise((resolve) => {
			const messageHandler = (event: MessageEvent) => {
				const message = event.data;
				if (message.command === "operationDetailsLoaded" && message.operationId === operationId) {
					window.removeEventListener("message", messageHandler);
					resolve(
						message.operation
							? {
									...message.operation,
									startTime: new Date(message.operation.startTime),
									endTime: message.operation.endTime ? new Date(message.operation.endTime) : undefined,
									steps: message.operation.steps?.map((step: any) => ({
										...step,
										startTime: step.startTime ? new Date(step.startTime) : undefined,
										endTime: step.endTime ? new Date(step.endTime) : undefined,
									})),
								}
							: null,
					);
				}
			};

			window.addEventListener("message", messageHandler);

			vscode.postMessage({
				command: "getOperationDetails",
				operationId,
			});

			// Timeout after 10 seconds
			setTimeout(() => {
				window.removeEventListener("message", messageHandler);
				resolve(null);
			}, 10000);
		});
	}, []);

	const clearCompletedOperations = useCallback(() => {
		setOperations((prev) => prev.filter((op) => op.status === "running" || op.status === "pending"));
	}, []);

	const retryOperation = useCallback(async (operationId: string) => {
		try {
			vscode.postMessage({
				command: "retryOperation",
				operationId,
			});
		} catch (err) {
			setError("Failed to retry operation");
		}
	}, []);

	const activeOperations = operations.filter((op) => op.status === "running" || op.status === "pending");
	const completedOperations = operations.filter(
		(op) => op.status === "completed" || op.status === "failed" || op.status === "cancelled",
	);

	return {
		operations,
		activeOperations,
		completedOperations,
		loading,
		error,
		refreshOperations,
		startOperation,
		cancelOperation,
		getOperationDetails,
		clearCompletedOperations,
		retryOperation,
	};
};
