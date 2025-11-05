import React, { useEffect, useRef, useState } from "react";
import { Button } from "../components/shared/Button";
import { vscodeTheme } from "../theme/vscode-theme";

// VS Code API for communication with extension
declare const acquireVsCodeApi: () => any;
const vscode = acquireVsCodeApi();

interface QueryResult {
	columns: string[];
	rows: any[][];
	rowCount: number;
	executionTime: number;
	success: boolean;
	error?: string;
}

interface QueryHistoryItem {
	id: string;
	query: string;
	timestamp: Date;
	executionTime?: number;
	rowCount?: number;
	success: boolean;
}

export const QueryEditor: React.FC = () => {
	const [connections, setConnections] = useState<any[]>([]);
	const [selectedConnection, setSelectedConnection] = useState("");
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<QueryResult | null>(null);
	const [executing, setExecuting] = useState(false);
	const [history, setHistory] = useState<QueryHistoryItem[]>([]);
	const [showHistory, setShowHistory] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		// Load connections and history
		vscode.postMessage({ command: "getConnections" });
		vscode.postMessage({ command: "getQueryHistory" });

		// Listen for messages from extension
		const messageHandler = (event: MessageEvent) => {
			const message = event.data;
			switch (message.command) {
				case "connectionsLoaded":
					setConnections(message.connections);
					if (message.connections.length > 0 && !selectedConnection) {
						setSelectedConnection(message.connections[0].id);
					}
					break;
				case "queryHistoryLoaded":
					setHistory(
						message.history.map((item: any) => ({
							...item,
							timestamp: new Date(item.timestamp),
						})),
					);
					break;
				case "queryExecuted":
					setResults(message.result);
					setExecuting(false);
					// Add to history
					const historyItem: QueryHistoryItem = {
						id: Date.now().toString(),
						query: query.trim(),
						timestamp: new Date(),
						executionTime: message.result.executionTime,
						rowCount: message.result.rowCount,
						success: message.result.success,
					};
					setHistory((prev) => [historyItem, ...prev.slice(0, 99)]); // Keep last 100
					break;
			}
		};

		window.addEventListener("message", messageHandler);
		return () => window.removeEventListener("message", messageHandler);
	}, [selectedConnection, query]);

	const handleExecuteQuery = () => {
		if (!selectedConnection || !query.trim()) {
			return;
		}

		setExecuting(true);
		setResults(null);

		vscode.postMessage({
			command: "executeQuery",
			connectionId: selectedConnection,
			query: query.trim(),
		});
	};

	const handleLoadFromHistory = (historyItem: QueryHistoryItem) => {
		setQuery(historyItem.query);
		setShowHistory(false);
		if (textareaRef.current) {
			textareaRef.current.focus();
		}
	};

	const handleFormatQuery = () => {
		vscode.postMessage({
			command: "formatQuery",
			query: query,
		});
	};

	const handleClearResults = () => {
		setResults(null);
	};

	return (
		<div
			style={{
				height: "100vh",
				display: "flex",
				flexDirection: "column",
				fontFamily: vscodeTheme.typography.fontFamily,
				backgroundColor: vscodeTheme.colors.background,
				color: vscodeTheme.colors.foreground,
			}}
		>
			{/* Header */}
			<div
				style={{
					padding: vscodeTheme.spacing.md,
					borderBottom: `1px solid ${vscodeTheme.colors.border}`,
					display: "flex",
					alignItems: "center",
					gap: vscodeTheme.spacing.md,
				}}
			>
				<select
					value={selectedConnection}
					onChange={(e) => setSelectedConnection(e.target.value)}
					style={{
						padding: vscodeTheme.spacing.sm,
						backgroundColor: vscodeTheme.colors.inputBackground,
						color: vscodeTheme.colors.inputForeground,
						border: `1px solid ${vscodeTheme.colors.border}`,
						borderRadius: vscodeTheme.borderRadius.sm,
						fontSize: vscodeTheme.typography.fontSize.sm,
					}}
				>
					{connections.map((conn) => (
						<option key={conn.id} value={conn.id}>
							{conn.name} ({conn.host}:{conn.port})
						</option>
					))}
				</select>

				<Button onClick={() => setShowHistory(!showHistory)} variant="secondary" size="sm">
					📚 History
				</Button>

				<Button onClick={handleFormatQuery} variant="secondary" size="sm" disabled={!query.trim()}>
					🎨 Format
				</Button>

				<Button
					onClick={handleExecuteQuery}
					variant="primary"
					size="sm"
					disabled={!selectedConnection || !query.trim() || executing}
					loading={executing}
				>
					{executing ? "Executing..." : "▶️ Run"}
				</Button>
			</div>

			{/* Query History Panel */}
			{showHistory && (
				<div
					style={{
						borderBottom: `1px solid ${vscodeTheme.colors.border}`,
						maxHeight: "200px",
						overflow: "auto",
					}}
				>
					<div
						style={{
							padding: vscodeTheme.spacing.md,
							backgroundColor: vscodeTheme.colors.inputBackground,
						}}
					>
						<div
							style={{
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center",
								marginBottom: vscodeTheme.spacing.md,
							}}
						>
							<h3
								style={{
									margin: 0,
									fontSize: vscodeTheme.typography.fontSize.sm,
									fontWeight: 600,
								}}
							>
								Query History
							</h3>
							<Button onClick={() => setShowHistory(false)} variant="secondary" size="sm">
								✕
							</Button>
						</div>

						{history.length === 0 ? (
							<div
								style={{
									textAlign: "center",
									padding: vscodeTheme.spacing.lg,
									color: vscodeTheme.colors.foreground,
									opacity: 0.6,
								}}
							>
								No query history yet
							</div>
						) : (
							<div>
								{history.map((item) => (
									<div
										key={item.id}
										onClick={() => handleLoadFromHistory(item)}
										style={{
											padding: vscodeTheme.spacing.sm,
											border: `1px solid ${vscodeTheme.colors.border}`,
											borderRadius: vscodeTheme.borderRadius.sm,
											marginBottom: vscodeTheme.spacing.sm,
											cursor: "pointer",
											backgroundColor: vscodeTheme.colors.background,
											transition: "background-color 0.2s ease",
										}}
										onMouseEnter={(e) => {
											e.currentTarget.style.backgroundColor = vscodeTheme.colors.listHoverBackground;
										}}
										onMouseLeave={(e) => {
											e.currentTarget.style.backgroundColor = vscodeTheme.colors.background;
										}}
									>
										<div
											style={{
												fontSize: vscodeTheme.typography.fontSize.sm,
												fontWeight: 600,
												marginBottom: vscodeTheme.spacing.xs,
												color: item.success ? vscodeTheme.colors.success : vscodeTheme.colors.error,
											}}
										>
											{item.success ? "✅" : "❌"} {new Date(item.timestamp).toLocaleString()}
										</div>
										<div
											style={{
												fontSize: vscodeTheme.typography.fontSize.xs,
												color: vscodeTheme.colors.foreground,
												opacity: 0.8,
												marginBottom: vscodeTheme.spacing.xs,
											}}
										>
											{item.query.length > 100 ? `${item.query.substring(0, 100)}...` : item.query}
										</div>
										<div
											style={{
												fontSize: vscodeTheme.typography.fontSize.xs,
												color: vscodeTheme.colors.foreground,
												opacity: 0.6,
											}}
										>
											{item.executionTime && `${item.executionTime}ms`}
											{item.rowCount !== undefined && ` • ${item.rowCount} rows`}
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			)}

			{/* Query Editor */}
			<div
				style={{
					flex: 1,
					display: "flex",
					flexDirection: "column",
					padding: vscodeTheme.spacing.md,
				}}
			>
				<div
					style={{
						marginBottom: vscodeTheme.spacing.md,
						fontSize: vscodeTheme.typography.fontSize.sm,
						fontWeight: 600,
						color: vscodeTheme.colors.foreground,
					}}
				>
					SQL Query
				</div>

				<textarea
					ref={textareaRef}
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Enter your SQL query here..."
					style={{
						flex: 1,
						padding: vscodeTheme.spacing.md,
						backgroundColor: vscodeTheme.colors.inputBackground,
						color: vscodeTheme.colors.inputForeground,
						border: `1px solid ${vscodeTheme.colors.border}`,
						borderRadius: vscodeTheme.borderRadius.md,
						fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
						fontSize: vscodeTheme.typography.fontSize.sm,
						lineHeight: 1.4,
						resize: "none",
						outline: "none",
					}}
					onKeyDown={(e) => {
						if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
							e.preventDefault();
							handleExecuteQuery();
						}
					}}
				/>

				<div
					style={{
						marginTop: vscodeTheme.spacing.sm,
						fontSize: vscodeTheme.typography.fontSize.xs,
						color: vscodeTheme.colors.foreground,
						opacity: 0.6,
					}}
				>
					Press Ctrl+Enter to execute query
				</div>
			</div>

			{/* Results Panel */}
			{results && (
				<div
					style={{
						borderTop: `1px solid ${vscodeTheme.colors.border}`,
						backgroundColor: vscodeTheme.colors.background,
					}}
				>
					<div
						style={{
							padding: vscodeTheme.spacing.md,
							borderBottom: `1px solid ${vscodeTheme.colors.border}`,
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
						}}
					>
						<div
							style={{
								fontSize: vscodeTheme.typography.fontSize.sm,
								fontWeight: 600,
							}}
						>
							Query Results
							{results.success && (
								<span
									style={{
										marginLeft: vscodeTheme.spacing.sm,
										color: vscodeTheme.colors.success,
									}}
								>
									({results.rowCount} rows, {results.executionTime}ms)
								</span>
							)}
						</div>
						<Button onClick={handleClearResults} variant="secondary" size="sm">
							✕ Clear
						</Button>
					</div>

					<div
						style={{
							maxHeight: "400px",
							overflow: "auto",
						}}
					>
						{results.success ? (
							<ResultsTable columns={results.columns} rows={results.rows} maxRows={1000} />
						) : (
							<div
								style={{
									padding: vscodeTheme.spacing.lg,
									color: vscodeTheme.colors.error,
									backgroundColor: vscodeTheme.colors.inputBackground,
									border: `1px solid ${vscodeTheme.colors.error}`,
									borderRadius: vscodeTheme.borderRadius.md,
									margin: vscodeTheme.spacing.md,
								}}
							>
								<div
									style={{
										fontSize: vscodeTheme.typography.fontSize.md,
										fontWeight: 600,
										marginBottom: vscodeTheme.spacing.sm,
									}}
								>
									Query Error
								</div>
								<div
									style={{
										fontSize: vscodeTheme.typography.fontSize.sm,
										fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
									}}
								>
									{results.error}
								</div>
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
};

// Results Table Component
interface ResultsTableProps {
	columns: string[];
	rows: any[][];
	maxRows: number;
}

const ResultsTable: React.FC<ResultsTableProps> = ({ columns, rows, maxRows }) => {
	const displayRows = rows.slice(0, maxRows);
	const hasMoreRows = rows.length > maxRows;

	return (
		<div
			style={{
				padding: vscodeTheme.spacing.md,
				fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
				fontSize: vscodeTheme.typography.fontSize.xs,
			}}
		>
			<table
				style={{
					width: "100%",
					borderCollapse: "collapse",
					backgroundColor: vscodeTheme.colors.background,
				}}
			>
				<thead>
					<tr>
						{columns.map((column, index) => (
							<th
								key={index}
								style={{
									padding: `${vscodeTheme.spacing.sm} ${vscodeTheme.spacing.md}`,
									textAlign: "left",
									borderBottom: `2px solid ${vscodeTheme.colors.border}`,
									backgroundColor: vscodeTheme.colors.inputBackground,
									fontWeight: 600,
									color: vscodeTheme.colors.foreground,
									position: "sticky",
									top: 0,
									zIndex: 1,
								}}
							>
								{column}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{displayRows.map((row, rowIndex) => (
						<tr
							key={rowIndex}
							style={{
								backgroundColor:
									rowIndex % 2 === 0 ? vscodeTheme.colors.background : vscodeTheme.colors.inputBackground,
							}}
						>
							{row.map((cell, cellIndex) => (
								<td
									key={cellIndex}
									style={{
										padding: `${vscodeTheme.spacing.sm} ${vscodeTheme.spacing.md}`,
										borderBottom: `1px solid ${vscodeTheme.colors.border}`,
										color: vscodeTheme.colors.foreground,
										maxWidth: "300px",
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap",
									}}
									title={String(cell)}
								>
									{cell === null ? (
										<span
											style={{
												color: vscodeTheme.colors.foreground,
												opacity: 0.5,
											}}
										>
											NULL
										</span>
									) : (
										String(cell)
									)}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>

			{hasMoreRows && (
				<div
					style={{
						padding: vscodeTheme.spacing.md,
						textAlign: "center",
						color: vscodeTheme.colors.foreground,
						opacity: 0.7,
						fontSize: vscodeTheme.typography.fontSize.sm,
					}}
				>
					Showing first {maxRows} rows of {rows.length} total results
				</div>
			)}

			{rows.length === 0 && (
				<div
					style={{
						padding: vscodeTheme.spacing.xl,
						textAlign: "center",
						color: vscodeTheme.colors.foreground,
						opacity: 0.6,
					}}
				>
					No results returned
				</div>
			)}
		</div>
	);
};
