import React from "react";
import { vscodeTheme } from "../../theme/vscode-theme";

export interface ConnectionStatusProps {
	connections: Array<{
		id: string;
		name: string;
		host: string;
		port: number;
		status: "connected" | "disconnected" | "error";
		lastSync?: Date;
		errorMessage?: string;
	}>;
	onRefresh?: () => void;
	compact?: boolean;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ connections, onRefresh, compact = false }) => {
	const connectedCount = connections.filter((c) => c.status === "connected").length;
	const errorCount = connections.filter((c) => c.status === "error").length;

	const getStatusIcon = (status: string) => {
		switch (status) {
			case "connected":
				return "🟢";
			case "error":
				return "🔴";
			case "disconnected":
				return "🟡";
			default:
				return "⚪";
		}
	};

	const getStatusColor = (status: string) => {
		switch (status) {
			case "connected":
				return vscodeTheme.colors.success;
			case "error":
				return vscodeTheme.colors.error;
			case "disconnected":
				return vscodeTheme.colors.warning;
			default:
				return vscodeTheme.colors.foreground;
		}
	};

	if (compact) {
		return (
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: vscodeTheme.spacing.sm,
					padding: vscodeTheme.spacing.sm,
					backgroundColor: vscodeTheme.colors.inputBackground,
					borderRadius: vscodeTheme.borderRadius.sm,
					border: `1px solid ${vscodeTheme.colors.border}`,
				}}
			>
				<span style={{ fontSize: "16px" }}>{errorCount > 0 ? "🔴" : connectedCount > 0 ? "🟢" : "🟡"}</span>
				<div>
					<div
						style={{
							fontSize: vscodeTheme.typography.fontSize.sm,
							fontWeight: 600,
							color: vscodeTheme.colors.foreground,
						}}
					>
						{connectedCount}/{connections.length} Connected
					</div>
					{errorCount > 0 && (
						<div
							style={{
								fontSize: vscodeTheme.typography.fontSize.xs,
								color: vscodeTheme.colors.error,
							}}
						>
							{errorCount} connection error{errorCount !== 1 ? "s" : ""}
						</div>
					)}
				</div>
				{onRefresh && (
					<button
						onClick={onRefresh}
						style={{
							background: "none",
							border: "none",
							cursor: "pointer",
							padding: vscodeTheme.spacing.xs,
							borderRadius: vscodeTheme.borderRadius.sm,
							color: vscodeTheme.colors.foreground,
							opacity: 0.7,
						}}
						title="Refresh connections"
					>
						🔄
					</button>
				)}
			</div>
		);
	}

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
					Database Connections
				</h3>
				{onRefresh && (
					<button
						onClick={onRefresh}
						style={{
							background: "none",
							border: "none",
							cursor: "pointer",
							padding: vscodeTheme.spacing.sm,
							borderRadius: vscodeTheme.borderRadius.sm,
							color: vscodeTheme.colors.foreground,
							opacity: 0.7,
						}}
						title="Refresh connections"
					>
						🔄 Refresh
					</button>
				)}
			</div>

			<div
				style={{
					display: "grid",
					gap: vscodeTheme.spacing.sm,
				}}
			>
				{connections.map((connection) => (
					<div
						key={connection.id}
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							padding: vscodeTheme.spacing.sm,
							backgroundColor: vscodeTheme.colors.inputBackground,
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
							<span style={{ fontSize: "14px" }}>{getStatusIcon(connection.status)}</span>
							<div>
								<div
									style={{
										fontSize: vscodeTheme.typography.fontSize.sm,
										fontWeight: 600,
										color: vscodeTheme.colors.foreground,
									}}
								>
									{connection.name}
								</div>
								<div
									style={{
										fontSize: vscodeTheme.typography.fontSize.xs,
										color: vscodeTheme.colors.foreground,
										opacity: 0.7,
									}}
								>
									{connection.host}:{connection.port}
								</div>
							</div>
						</div>

						<div style={{ textAlign: "right" }}>
							<div
								style={{
									fontSize: vscodeTheme.typography.fontSize.xs,
									color: getStatusColor(connection.status),
									fontWeight: 600,
								}}
							>
								{connection.status.toUpperCase()}
							</div>
							{connection.lastSync && (
								<div
									style={{
										fontSize: vscodeTheme.typography.fontSize.xs,
										color: vscodeTheme.colors.foreground,
										opacity: 0.6,
									}}
								>
									{new Date(connection.lastSync).toLocaleTimeString()}
								</div>
							)}
							{connection.errorMessage && (
								<div
									style={{
										fontSize: vscodeTheme.typography.fontSize.xs,
										color: vscodeTheme.colors.error,
										maxWidth: "200px",
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap",
									}}
									title={connection.errorMessage}
								>
									{connection.errorMessage}
								</div>
							)}
						</div>
					</div>
				))}
			</div>

			{connections.length === 0 && (
				<div
					style={{
						textAlign: "center",
						padding: vscodeTheme.spacing.xl,
						color: vscodeTheme.colors.foreground,
						opacity: 0.6,
					}}
				>
					No database connections configured
				</div>
			)}
		</div>
	);
};
