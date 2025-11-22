import React from "react";
import { Button } from "../components/shared/Button";
import { vscodeTheme } from "../theme/vscode-theme";

// VS Code API for communication with extension
declare const acquireVsCodeApi: () => any;
const vscode = acquireVsCodeApi();

export const Dashboard: React.FC = () => {
	const handleShowSchemaBrowser = () => {
		vscode.postMessage({ command: "showSchemaBrowser" });
	};

	const handleCreateMigration = () => {
		vscode.postMessage({ command: "createMigration" });
	};

	const handleShowQueryEditor = () => {
		vscode.postMessage({ command: "showQueryEditor" });
	};

	const handleShowSettings = () => {
		vscode.postMessage({ command: "showSettings" });
	};

	return (
		<div
			style={{
				padding: vscodeTheme.spacing.lg,
				fontFamily: vscodeTheme.typography.fontFamily,
				backgroundColor: vscodeTheme.colors.background,
				color: vscodeTheme.colors.foreground,
				height: "100vh",
				overflow: "auto",
			}}
		>
			<div style={{ marginBottom: vscodeTheme.spacing.xl }}>
				<h1
					style={{
						margin: 0,
						fontSize: vscodeTheme.typography.fontSize.xl,
						fontWeight: 600,
						color: vscodeTheme.colors.foreground,
					}}
				>
					PostgreSQL Schema Sync Dashboard
				</h1>
				<p
					style={{
						margin: `${vscodeTheme.spacing.sm} 0 0 0`,
						color: vscodeTheme.colors.foreground,
						opacity: 0.8,
					}}
				>
					Monitor your database connections, operations, and schema health
				</p>
			</div>

			{/* Status Overview */}
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
					gap: vscodeTheme.spacing.lg,
					marginBottom: vscodeTheme.spacing.xl,
				}}
			>
				<StatusCard
					title="Database Connections"
					value="3 Active"
					status="success"
					description="All connections healthy"
				/>
				<StatusCard
					title="Active Operations"
					value="2 Running"
					status="info"
					description="Migration and sync in progress"
				/>
				<StatusCard title="Schema Drift" value="No Issues" status="success" description="All schemas synchronized" />
				<StatusCard title="Performance" value="98% Uptime" status="success" description="System performing optimally" />
			</div>

			{/* Quick Actions */}
			<div style={{ marginBottom: vscodeTheme.spacing.xl }}>
				<h2
					style={{
						margin: `0 0 ${vscodeTheme.spacing.lg} 0`,
						fontSize: vscodeTheme.typography.fontSize.lg,
						fontWeight: 600,
					}}
				>
					Quick Actions
				</h2>
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
						gap: vscodeTheme.spacing.md,
					}}
				>
					<Button onClick={handleShowSchemaBrowser} variant="primary">
						📊 Browse Schema
					</Button>
					<Button onClick={handleCreateMigration} variant="success">
						⚡ Create Migration
					</Button>
					<Button onClick={handleShowQueryEditor} variant="secondary">
						💻 Open Query Editor
					</Button>
					<Button onClick={handleShowSettings} variant="secondary">
						⚙️ Settings
					</Button>
				</div>
			</div>

			{/* Recent Activity */}
			<div>
				<h2
					style={{
						margin: `0 0 ${vscodeTheme.spacing.lg} 0`,
						fontSize: vscodeTheme.typography.fontSize.lg,
						fontWeight: 600,
					}}
				>
					Recent Activity
				</h2>
				<div
					style={{
						backgroundColor: vscodeTheme.colors.background,
						border: `1px solid ${vscodeTheme.colors.border}`,
						borderRadius: vscodeTheme.borderRadius.lg,
						padding: vscodeTheme.spacing.lg,
					}}
				>
					<ActivityItem
						icon="✅"
						title="Schema synchronization completed"
						time="2 minutes ago"
						description="Successfully synchronized 15 tables"
					/>
					<ActivityItem
						icon="🔄"
						title="Migration in progress"
						time="5 minutes ago"
						description="Applying changes to production database"
					/>
					<ActivityItem
						icon="📊"
						title="Performance report generated"
						time="1 hour ago"
						description="Query performance analysis completed"
					/>
				</div>
			</div>
		</div>
	);
};

// Status Card Component
interface StatusCardProps {
	title: string;
	value: string;
	status: "success" | "error" | "warning" | "info";
	description: string;
}

const StatusCard: React.FC<StatusCardProps> = ({ title, value, status, description }) => {
	const statusColors = {
		success: vscodeTheme.colors.success,
		error: vscodeTheme.colors.error,
		warning: vscodeTheme.colors.warning,
		info: vscodeTheme.colors.info,
	};

	return (
		<div
			style={{
				backgroundColor: vscodeTheme.colors.background,
				border: `1px solid ${vscodeTheme.colors.border}`,
				borderRadius: vscodeTheme.borderRadius.lg,
				padding: vscodeTheme.spacing.lg,
				boxShadow: vscodeTheme.shadows.sm,
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					marginBottom: vscodeTheme.spacing.sm,
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
					{title}
				</h3>
				<div
					style={{
						width: "8px",
						height: "8px",
						borderRadius: "50%",
						backgroundColor: statusColors[status],
					}}
				/>
			</div>
			<div
				style={{
					fontSize: vscodeTheme.typography.fontSize.lg,
					fontWeight: 700,
					color: vscodeTheme.colors.foreground,
					marginBottom: vscodeTheme.spacing.xs,
				}}
			>
				{value}
			</div>
			<div
				style={{
					fontSize: vscodeTheme.typography.fontSize.sm,
					color: vscodeTheme.colors.foreground,
					opacity: 0.7,
				}}
			>
				{description}
			</div>
		</div>
	);
};

// Activity Item Component
interface ActivityItemProps {
	icon: string;
	title: string;
	time: string;
	description: string;
}

const ActivityItem: React.FC<ActivityItemProps> = ({ icon, title, time, description }) => {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "flex-start",
				gap: vscodeTheme.spacing.md,
				padding: `${vscodeTheme.spacing.md} 0`,
				borderBottom: `1px solid ${vscodeTheme.colors.border}`,
			}}
		>
			<div
				style={{
					fontSize: vscodeTheme.typography.fontSize.md,
					lineHeight: 1,
				}}
			>
				{icon}
			</div>
			<div style={{ flex: 1 }}>
				<div
					style={{
						fontSize: vscodeTheme.typography.fontSize.sm,
						fontWeight: 600,
						color: vscodeTheme.colors.foreground,
						marginBottom: vscodeTheme.spacing.xs,
					}}
				>
					{title}
				</div>
				<div
					style={{
						fontSize: vscodeTheme.typography.fontSize.xs,
						color: vscodeTheme.colors.foreground,
						opacity: 0.6,
						marginBottom: vscodeTheme.spacing.xs,
					}}
				>
					{time}
				</div>
				<div
					style={{
						fontSize: vscodeTheme.typography.fontSize.sm,
						color: vscodeTheme.colors.foreground,
						opacity: 0.8,
					}}
				>
					{description}
				</div>
			</div>
		</div>
	);
};
