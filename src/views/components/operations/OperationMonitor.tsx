import React from "react";
import { vscodeTheme } from "../../theme/vscode-theme";

export interface Operation {
	id: string;
	type: "migration" | "sync" | "backup" | "query" | "analysis";
	status: "running" | "completed" | "failed" | "cancelled";
	name: string;
	description?: string;
	progress?: number;
	startTime: Date;
	endTime?: Date;
	duration?: number;
	errorMessage?: string;
	metadata?: Record<string, any>;
}

export interface OperationMonitorProps {
	operations: Operation[];
	maxItems?: number;
	showCompleted?: boolean;
	onCancelOperation?: (operationId: string) => void;
	onViewDetails?: (operation: Operation) => void;
}

export const OperationMonitor: React.FC<OperationMonitorProps> = ({
	operations,
	maxItems = 10,
	showCompleted = true,
	onCancelOperation,
	onViewDetails,
}) => {
	const activeOperations = operations.filter((op) => op.status === "running");
	const recentOperations = operations
		.filter((op) => showCompleted || op.status === "running")
		.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
		.slice(0, maxItems);

	const getOperationIcon = (type: string, status: string) => {
		const baseIcon =
			{
				migration: "⚡",
				sync: "🔄",
				backup: "💾",
				query: "🔍",
				analysis: "📊",
			}[type] || "⚙️";

		if (status === "running") {
			return `${baseIcon}⏳`;
		}
		if (status === "completed") {
			return `${baseIcon}✅`;
		}
		if (status === "failed") {
			return `${baseIcon}❌`;
		}
		if (status === "cancelled") {
			return `${baseIcon}🚫`;
		}
		return baseIcon;
	};

	const getStatusColor = (status: string) => {
		switch (status) {
			case "running":
				return vscodeTheme.colors.info;
			case "completed":
				return vscodeTheme.colors.success;
			case "failed":
				return vscodeTheme.colors.error;
			case "cancelled":
				return vscodeTheme.colors.warning;
			default:
				return vscodeTheme.colors.foreground;
		}
	};

	const formatDuration = (duration?: number) => {
		if (!duration) {
			return "";
		}
		if (duration < 1000) {
			return `${duration}ms`;
		}
		if (duration < 60000) {
			return `${(duration / 1000).toFixed(1)}s`;
		}
		return `${(duration / 60000).toFixed(1)}m`;
	};

	return (
		<div
			style={{
				backgroundColor: vscodeTheme.colors.background,
				border: `1px solid ${vscodeTheme.colors.border}`,
				borderRadius: vscodeTheme.borderRadius.lg,
				padding: vscodeTheme.spacing.lg,
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
						fontSize: vscodeTheme.typography.fontSize.md,
						fontWeight: 600,
						color: vscodeTheme.colors.foreground,
					}}
				>
					Active Operations
				</h3>
				<div
					style={{
						fontSize: vscodeTheme.typography.fontSize.sm,
						color: vscodeTheme.colors.foreground,
						opacity: 0.7,
					}}
				>
					{activeOperations.length} running
				</div>
			</div>

			{/* Active Operations Summary */}
			{activeOperations.length > 0 && (
				<div
					style={{
						marginBottom: vscodeTheme.spacing.lg,
						padding: vscodeTheme.spacing.md,
						backgroundColor: vscodeTheme.colors.inputBackground,
						borderRadius: vscodeTheme.borderRadius.md,
						border: `1px solid ${vscodeTheme.colors.border}`,
					}}
				>
					<div
						style={{
							fontSize: vscodeTheme.typography.fontSize.sm,
							fontWeight: 600,
							marginBottom: vscodeTheme.spacing.sm,
							color: vscodeTheme.colors.foreground,
						}}
					>
						Currently Running
					</div>
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: vscodeTheme.spacing.sm,
						}}
					>
						{activeOperations.slice(0, 3).map((operation) => (
							<div
								key={operation.id}
								style={{
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
									padding: vscodeTheme.spacing.sm,
									backgroundColor: vscodeTheme.colors.background,
									borderRadius: vscodeTheme.borderRadius.sm,
									border: `1px solid ${vscodeTheme.colors.border}`,
								}}
							>
								<div
									style={{
										display: "flex",
										alignItems: "center",
										gap: vscodeTheme.spacing.sm,
									}}
								>
									<span style={{ fontSize: "16px" }}>{getOperationIcon(operation.type, operation.status)}</span>
									<div>
										<div
											style={{
												fontSize: vscodeTheme.typography.fontSize.sm,
												fontWeight: 600,
												color: vscodeTheme.colors.foreground,
											}}
										>
											{operation.name}
										</div>
										<div
											style={{
												fontSize: vscodeTheme.typography.fontSize.xs,
												color: vscodeTheme.colors.foreground,
												opacity: 0.7,
											}}
										>
											Started {new Date(operation.startTime).toLocaleTimeString()}
										</div>
									</div>
								</div>

								<div
									style={{
										display: "flex",
										alignItems: "center",
										gap: vscodeTheme.spacing.sm,
									}}
								>
									{operation.progress !== undefined && (
										<div
											style={{
												display: "flex",
												alignItems: "center",
												gap: vscodeTheme.spacing.xs,
											}}
										>
											<div
												style={{
													width: "60px",
													height: "4px",
													backgroundColor: vscodeTheme.colors.border,
													borderRadius: "2px",
													overflow: "hidden",
												}}
											>
												<div
													style={{
														width: `${operation.progress}%`,
														height: "100%",
														backgroundColor: vscodeTheme.colors.accent,
														transition: "width 0.3s ease",
													}}
												/>
											</div>
											<span
												style={{
													fontSize: vscodeTheme.typography.fontSize.xs,
													color: vscodeTheme.colors.foreground,
													opacity: 0.7,
													minWidth: "30px",
												}}
											>
												{operation.progress}%
											</span>
										</div>
									)}

									{onCancelOperation && (
										<button
											onClick={() => onCancelOperation(operation.id)}
											style={{
												background: "none",
												border: "none",
												cursor: "pointer",
												padding: vscodeTheme.spacing.xs,
												borderRadius: vscodeTheme.borderRadius.sm,
												color: vscodeTheme.colors.error,
												fontSize: vscodeTheme.typography.fontSize.sm,
											}}
											title="Cancel operation"
										>
											✕
										</button>
									)}
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Recent Operations */}
			<div>
				<div
					style={{
						fontSize: vscodeTheme.typography.fontSize.sm,
						fontWeight: 600,
						marginBottom: vscodeTheme.spacing.sm,
						color: vscodeTheme.colors.foreground,
					}}
				>
					Recent Operations
				</div>

				<div
					style={{
						maxHeight: "300px",
						overflow: "auto",
						border: `1px solid ${vscodeTheme.colors.border}`,
						borderRadius: vscodeTheme.borderRadius.md,
					}}
				>
					{recentOperations.length === 0 ? (
						<div
							style={{
								padding: vscodeTheme.spacing.lg,
								textAlign: "center",
								color: vscodeTheme.colors.foreground,
								opacity: 0.6,
								fontSize: vscodeTheme.typography.fontSize.sm,
							}}
						>
							No operations yet
						</div>
					) : (
						recentOperations.map((operation, index) => (
							<div
								key={operation.id}
								style={{
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
									padding: vscodeTheme.spacing.md,
									borderBottom: index < recentOperations.length - 1 ? `1px solid ${vscodeTheme.colors.border}` : "none",
									backgroundColor: index % 2 === 0 ? vscodeTheme.colors.background : vscodeTheme.colors.inputBackground,
									cursor: onViewDetails ? "pointer" : "default",
								}}
								onClick={() => onViewDetails?.(operation)}
							>
								<div
									style={{
										display: "flex",
										alignItems: "center",
										gap: vscodeTheme.spacing.sm,
										flex: 1,
									}}
								>
									<span style={{ fontSize: "14px" }}>{getOperationIcon(operation.type, operation.status)}</span>
									<div style={{ flex: 1 }}>
										<div
											style={{
												fontSize: vscodeTheme.typography.fontSize.sm,
												fontWeight: 600,
												color: vscodeTheme.colors.foreground,
												marginBottom: vscodeTheme.spacing.xs,
											}}
										>
											{operation.name}
										</div>
										<div
											style={{
												fontSize: vscodeTheme.typography.fontSize.xs,
												color: vscodeTheme.colors.foreground,
												opacity: 0.7,
											}}
										>
											{new Date(operation.startTime).toLocaleString()}
											{operation.duration && ` • ${formatDuration(operation.duration)}`}
										</div>
										{operation.errorMessage && (
											<div
												style={{
													fontSize: vscodeTheme.typography.fontSize.xs,
													color: vscodeTheme.colors.error,
													marginTop: vscodeTheme.spacing.xs,
													maxWidth: "300px",
													overflow: "hidden",
													textOverflow: "ellipsis",
													whiteSpace: "nowrap",
												}}
												title={operation.errorMessage}
											>
												{operation.errorMessage}
											</div>
										)}
									</div>
								</div>

								<div
									style={{
										fontSize: vscodeTheme.typography.fontSize.xs,
										color: getStatusColor(operation.status),
										fontWeight: 600,
										textTransform: "uppercase",
									}}
								>
									{operation.status}
								</div>
							</div>
						))
					)}
				</div>
			</div>
		</div>
	);
};
