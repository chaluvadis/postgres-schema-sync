import React, { useEffect, useState } from "react";
import { Button } from "../components/shared/Button";
import { vscodeTheme } from "../theme/vscode-theme";

// VS Code API for communication with extension
declare const acquireVsCodeApi: () => any;
const vscode = acquireVsCodeApi();

interface Settings {
	// Connection settings
	"postgresql-schema-sync.compare.mode": "strict" | "lenient";
	"postgresql-schema-sync.compare.ignoreSchemas": string[];
	"postgresql-schema-sync.migration.dryRun": boolean;
	"postgresql-schema-sync.migration.batchSize": number;

	// Security settings
	"postgresql.securityManager.enabled": boolean;
	"postgresql.securityManager.securityLevel": "strict" | "warning" | "permissive";
	"postgresql.securityManager.certificateValidation.enabled": boolean;
	"postgresql.securityManager.certificateValidation.allowSelfSigned": boolean;

	// UI settings
	"postgresql-schema-sync.notifications.enabled": boolean;
	"postgresql-schema-sync.theme.colorScheme": "auto" | "light" | "dark";
	"postgresql-schema-sync.debug.enabled": boolean;

	// Query editor settings
	"postgresql.queryEditor.maxResults": number;
	"postgresql.queryEditor.queryTimeout": number;
	"postgresql.queryEditor.autoComplete.enabled": boolean;
	"postgresql.queryEditor.syntaxHighlighting.enabled": boolean;
	"postgresql.queryEditor.historySize": number;

	// Performance settings
	"postgresql.performanceMonitoring.enabled": boolean;
	"postgresql.performanceMonitoring.slowQueryThreshold": number;
	"postgresql.performanceMonitoring.alertCooldown": number;
}

export const Settings: React.FC = () => {
	const [settings, setSettings] = useState<Partial<Settings>>({});
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [activeTab, setActiveTab] = useState<"general" | "security" | "performance" | "editor">("general");

	useEffect(() => {
		// Load current settings
		vscode.postMessage({ command: "getSettings" });

		const messageHandler = (event: MessageEvent) => {
			const message = event.data;
			switch (message.command) {
				case "settingsLoaded":
					setSettings(message.settings);
					setLoading(false);
					break;
				case "settingsSaved":
					setSaving(false);
					// Show success message
					break;
			}
		};

		window.addEventListener("message", messageHandler);
		return () => window.removeEventListener("message", messageHandler);
	}, []);

	const handleSettingChange = (key: keyof Settings, value: any) => {
		setSettings((prev) => ({
			...prev,
			[key]: value,
		}));
	};

	const handleSaveSettings = () => {
		setSaving(true);
		vscode.postMessage({
			command: "saveSettings",
			settings,
		});
	};

	const handleResetToDefaults = () => {
		vscode.postMessage({ command: "resetSettingsToDefaults" });
	};

	if (loading) {
		return (
			<div
				style={{
					display: "flex",
					justifyContent: "center",
					alignItems: "center",
					height: "100vh",
					fontFamily: vscodeTheme.typography.fontFamily,
					backgroundColor: vscodeTheme.colors.background,
					color: vscodeTheme.colors.foreground,
				}}
			>
				Loading settings...
			</div>
		);
	}

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
					padding: vscodeTheme.spacing.lg,
					borderBottom: `1px solid ${vscodeTheme.colors.border}`,
					backgroundColor: vscodeTheme.colors.background,
				}}
			>
				<h1
					style={{
						margin: 0,
						fontSize: vscodeTheme.typography.fontSize.lg,
						fontWeight: 600,
						color: vscodeTheme.colors.foreground,
					}}
				>
					PostgreSQL Schema Sync Settings
				</h1>
				<p
					style={{
						margin: `${vscodeTheme.spacing.sm} 0 0 0`,
						color: vscodeTheme.colors.foreground,
						opacity: 0.8,
						fontSize: vscodeTheme.typography.fontSize.sm,
					}}
				>
					Configure extension behavior and preferences
				</p>
			</div>

			<div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
				{/* Sidebar */}
				<div
					style={{
						width: "200px",
						borderRight: `1px solid ${vscodeTheme.colors.border}`,
						backgroundColor: vscodeTheme.colors.inputBackground,
					}}
				>
					<div style={{ padding: vscodeTheme.spacing.md }}>
						<div
							style={{
								fontSize: vscodeTheme.typography.fontSize.sm,
								fontWeight: 600,
								marginBottom: vscodeTheme.spacing.md,
								color: vscodeTheme.colors.foreground,
							}}
						>
							Categories
						</div>

						{[
							{ id: "general", label: "General", icon: "⚙️" },
							{ id: "security", label: "Security", icon: "🔒" },
							{ id: "performance", label: "Performance", icon: "📊" },
							{ id: "editor", label: "Query Editor", icon: "💻" },
						].map((tab) => (
							<button
								key={tab.id}
								onClick={() => setActiveTab(tab.id as any)}
								style={{
									width: "100%",
									padding: vscodeTheme.spacing.sm,
									marginBottom: vscodeTheme.spacing.xs,
									backgroundColor:
										activeTab === tab.id ? vscodeTheme.colors.listActiveSelectionBackground : "transparent",
									color: vscodeTheme.colors.foreground,
									border: "none",
									borderRadius: vscodeTheme.borderRadius.sm,
									textAlign: "left",
									cursor: "pointer",
									fontSize: vscodeTheme.typography.fontSize.sm,
									display: "flex",
									alignItems: "center",
									gap: vscodeTheme.spacing.sm,
								}}
							>
								<span>{tab.icon}</span>
								<span>{tab.label}</span>
							</button>
						))}
					</div>
				</div>

				{/* Main Content */}
				<div
					style={{
						flex: 1,
						padding: vscodeTheme.spacing.lg,
						overflow: "auto",
					}}
				>
					{activeTab === "general" && <GeneralSettings settings={settings} onSettingChange={handleSettingChange} />}

					{activeTab === "security" && <SecuritySettings settings={settings} onSettingChange={handleSettingChange} />}

					{activeTab === "performance" && (
						<PerformanceSettings settings={settings} onSettingChange={handleSettingChange} />
					)}

					{activeTab === "editor" && <EditorSettings settings={settings} onSettingChange={handleSettingChange} />}
				</div>
			</div>

			{/* Footer */}
			<div
				style={{
					padding: vscodeTheme.spacing.lg,
					borderTop: `1px solid ${vscodeTheme.colors.border}`,
					backgroundColor: vscodeTheme.colors.inputBackground,
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
				}}
			>
				<Button onClick={handleResetToDefaults} variant="secondary" size="sm">
					Reset to Defaults
				</Button>

				<div style={{ display: "flex", gap: vscodeTheme.spacing.sm }}>
					<Button onClick={() => vscode.postMessage({ command: "showDashboard" })} variant="secondary" size="sm">
						Cancel
					</Button>
					<Button onClick={handleSaveSettings} variant="primary" size="sm" loading={saving}>
						{saving ? "Saving..." : "Save Settings"}
					</Button>
				</div>
			</div>
		</div>
	);
};

// General Settings Component
interface SettingsProps {
	settings: Partial<Settings>;
	onSettingChange: (key: keyof Settings, value: any) => void;
}

const GeneralSettings: React.FC<SettingsProps> = ({ settings, onSettingChange }) => {
	return (
		<div>
			<h2
				style={{
					margin: `0 0 ${vscodeTheme.spacing.lg} 0`,
					fontSize: vscodeTheme.typography.fontSize.md,
					fontWeight: 600,
				}}
			>
				General Settings
			</h2>

			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: vscodeTheme.spacing.lg,
				}}
			>
				{/* Schema Comparison */}
				<SettingGroup title="Schema Comparison">
					<SettingItem label="Comparison Mode" description="How strictly to compare schema objects">
						<select
							value={settings["postgresql-schema-sync.compare.mode"] || "strict"}
							onChange={(e) => onSettingChange("postgresql-schema-sync.compare.mode", e.target.value)}
							style={getInputStyle()}
						>
							<option value="strict">Strict - Exact comparison including whitespace</option>
							<option value="lenient">Lenient - Ignore formatting differences</option>
						</select>
					</SettingItem>

					<SettingItem label="Ignore Schemas" description="Comma-separated list of schemas to ignore during comparison">
						<input
							type="text"
							value={(settings["postgresql-schema-sync.compare.ignoreSchemas"] || []).join(", ")}
							onChange={(e) =>
								onSettingChange(
									"postgresql-schema-sync.compare.ignoreSchemas",
									e.target.value
										.split(",")
										.map((s) => s.trim())
										.filter((s) => s),
								)
							}
							style={getInputStyle()}
							placeholder="information_schema, pg_catalog, pg_toast"
						/>
					</SettingItem>
				</SettingGroup>

				{/* Migration */}
				<SettingGroup title="Migration">
					<SettingItem label="Dry Run Mode" description="Enable dry-run mode for migration preview">
						<Toggle
							checked={settings["postgresql-schema-sync.migration.dryRun"] ?? true}
							onChange={(checked) => onSettingChange("postgresql-schema-sync.migration.dryRun", checked)}
						/>
					</SettingItem>

					<SettingItem label="Batch Size" description="Number of operations per migration batch">
						<input
							type="number"
							min="10"
							max="200"
							value={settings["postgresql-schema-sync.migration.batchSize"] || 50}
							onChange={(e) => onSettingChange("postgresql-schema-sync.migration.batchSize", parseInt(e.target.value))}
							style={getInputStyle()}
						/>
					</SettingItem>
				</SettingGroup>

				{/* UI */}
				<SettingGroup title="User Interface">
					<SettingItem label="Enable Notifications" description="Show notifications for operation status">
						<Toggle
							checked={settings["postgresql-schema-sync.notifications.enabled"] ?? true}
							onChange={(checked) => onSettingChange("postgresql-schema-sync.notifications.enabled", checked)}
						/>
					</SettingItem>

					<SettingItem label="Color Scheme" description="Color scheme for the extension UI">
						<select
							value={settings["postgresql-schema-sync.theme.colorScheme"] || "auto"}
							onChange={(e) => onSettingChange("postgresql-schema-sync.theme.colorScheme", e.target.value)}
							style={getInputStyle()}
						>
							<option value="auto">Auto - Follow VS Code theme</option>
							<option value="light">Light</option>
							<option value="dark">Dark</option>
						</select>
					</SettingItem>

					<SettingItem label="Debug Mode" description="Enable debug logging">
						<Toggle
							checked={settings["postgresql-schema-sync.debug.enabled"] ?? false}
							onChange={(checked) => onSettingChange("postgresql-schema-sync.debug.enabled", checked)}
						/>
					</SettingItem>
				</SettingGroup>
			</div>
		</div>
	);
};

// Security Settings Component
const SecuritySettings: React.FC<SettingsProps> = ({ settings, onSettingChange }) => {
	return (
		<div>
			<h2
				style={{
					margin: `0 0 ${vscodeTheme.spacing.lg} 0`,
					fontSize: vscodeTheme.typography.fontSize.md,
					fontWeight: 600,
				}}
			>
				Security Settings
			</h2>

			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: vscodeTheme.spacing.lg,
				}}
			>
				{/* Security Manager */}
				<SettingGroup title="Security Manager">
					<SettingItem
						label="Enable Security Manager"
						description="Enable SSL/TLS certificate validation and security monitoring"
					>
						<Toggle
							checked={settings["postgresql.securityManager.enabled"] ?? true}
							onChange={(checked) => onSettingChange("postgresql.securityManager.enabled", checked)}
						/>
					</SettingItem>

					<SettingItem label="Security Level" description="Overall security level for certificate validation">
						<select
							value={settings["postgresql.securityManager.securityLevel"] || "warning"}
							onChange={(e) => onSettingChange("postgresql.securityManager.securityLevel", e.target.value)}
							style={getInputStyle()}
						>
							<option value="strict">Strict - All security checks enabled</option>
							<option value="warning">Warning - Security checks with warnings</option>
							<option value="permissive">Permissive - Minimal security checks</option>
						</select>
					</SettingItem>
				</SettingGroup>

				{/* Certificate Validation */}
				<SettingGroup title="Certificate Validation">
					<SettingItem
						label="Enable Certificate Validation"
						description="Validate SSL/TLS certificates when connecting"
					>
						<Toggle
							checked={settings["postgresql.securityManager.certificateValidation.enabled"] ?? true}
							onChange={(checked) =>
								onSettingChange("postgresql.securityManager.certificateValidation.enabled", checked)
							}
						/>
					</SettingItem>

					<SettingItem
						label="Allow Self-Signed Certificates"
						description="Allow self-signed certificates (not recommended for production)"
					>
						<Toggle
							checked={settings["postgresql.securityManager.certificateValidation.allowSelfSigned"] ?? false}
							onChange={(checked) =>
								onSettingChange("postgresql.securityManager.certificateValidation.allowSelfSigned", checked)
							}
						/>
					</SettingItem>
				</SettingGroup>
			</div>
		</div>
	);
};

// Performance Settings Component
const PerformanceSettings: React.FC<SettingsProps> = ({ settings, onSettingChange }) => {
	return (
		<div>
			<h2
				style={{
					margin: `0 0 ${vscodeTheme.spacing.lg} 0`,
					fontSize: vscodeTheme.typography.fontSize.md,
					fontWeight: 600,
				}}
			>
				Performance Settings
			</h2>

			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: vscodeTheme.spacing.lg,
				}}
			>
				{/* Performance Monitoring */}
				<SettingGroup title="Performance Monitoring">
					<SettingItem label="Enable Performance Monitoring" description="Enable performance monitoring and analytics">
						<Toggle
							checked={settings["postgresql.performanceMonitoring.enabled"] ?? true}
							onChange={(checked) => onSettingChange("postgresql.performanceMonitoring.enabled", checked)}
						/>
					</SettingItem>

					<SettingItem label="Slow Query Threshold (ms)" description="Threshold for slow query detection">
						<input
							type="number"
							min="1000"
							max="60000"
							value={settings["postgresql.performanceMonitoring.slowQueryThreshold"] || 5000}
							onChange={(e) =>
								onSettingChange("postgresql.performanceMonitoring.slowQueryThreshold", parseInt(e.target.value))
							}
							style={getInputStyle()}
						/>
					</SettingItem>

					<SettingItem label="Alert Cooldown (seconds)" description="Cooldown period between similar alerts">
						<input
							type="number"
							min="60"
							max="3600"
							value={settings["postgresql.performanceMonitoring.alertCooldown"] || 300}
							onChange={(e) =>
								onSettingChange("postgresql.performanceMonitoring.alertCooldown", parseInt(e.target.value))
							}
							style={getInputStyle()}
						/>
					</SettingItem>
				</SettingGroup>
			</div>
		</div>
	);
};

// Query Editor Settings Component
const EditorSettings: React.FC<SettingsProps> = ({ settings, onSettingChange }) => {
	return (
		<div>
			<h2
				style={{
					margin: `0 0 ${vscodeTheme.spacing.lg} 0`,
					fontSize: vscodeTheme.typography.fontSize.md,
					fontWeight: 600,
				}}
			>
				Query Editor Settings
			</h2>

			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: vscodeTheme.spacing.lg,
				}}
			>
				{/* Query Execution */}
				<SettingGroup title="Query Execution">
					<SettingItem label="Maximum Results" description="Maximum number of rows to display in query results">
						<input
							type="number"
							min="100"
							max="10000"
							value={settings["postgresql.queryEditor.maxResults"] || 1000}
							onChange={(e) => onSettingChange("postgresql.queryEditor.maxResults", parseInt(e.target.value))}
							style={getInputStyle()}
						/>
					</SettingItem>

					<SettingItem label="Query Timeout (seconds)" description="Query execution timeout">
						<input
							type="number"
							min="10"
							max="300"
							value={settings["postgresql.queryEditor.queryTimeout"] || 30}
							onChange={(e) => onSettingChange("postgresql.queryEditor.queryTimeout", parseInt(e.target.value))}
							style={getInputStyle()}
						/>
					</SettingItem>
				</SettingGroup>

				{/* Editor Features */}
				<SettingGroup title="Editor Features">
					<SettingItem label="Enable Autocomplete" description="Enable autocomplete in query editor">
						<Toggle
							checked={settings["postgresql.queryEditor.autoComplete.enabled"] ?? true}
							onChange={(checked) => onSettingChange("postgresql.queryEditor.autoComplete.enabled", checked)}
						/>
					</SettingItem>

					<SettingItem label="Enable Syntax Highlighting" description="Enable SQL syntax highlighting">
						<Toggle
							checked={settings["postgresql.queryEditor.syntaxHighlighting.enabled"] ?? true}
							onChange={(checked) => onSettingChange("postgresql.queryEditor.syntaxHighlighting.enabled", checked)}
						/>
					</SettingItem>

					<SettingItem label="History Size" description="Maximum number of queries to keep in history">
						<input
							type="number"
							min="50"
							max="500"
							value={settings["postgresql.queryEditor.historySize"] || 100}
							onChange={(e) => onSettingChange("postgresql.queryEditor.historySize", parseInt(e.target.value))}
							style={getInputStyle()}
						/>
					</SettingItem>
				</SettingGroup>
			</div>
		</div>
	);
};

// Shared Components
interface SettingGroupProps {
	title: string;
	children: React.ReactNode;
}

const SettingGroup: React.FC<SettingGroupProps> = ({ title, children }) => {
	return (
		<div
			style={{
				backgroundColor: vscodeTheme.colors.inputBackground,
				border: `1px solid ${vscodeTheme.colors.border}`,
				borderRadius: vscodeTheme.borderRadius.md,
				padding: vscodeTheme.spacing.lg,
			}}
		>
			<h3
				style={{
					margin: `0 0 ${vscodeTheme.spacing.md} 0`,
					fontSize: vscodeTheme.typography.fontSize.sm,
					fontWeight: 600,
					color: vscodeTheme.colors.foreground,
				}}
			>
				{title}
			</h3>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: vscodeTheme.spacing.md,
				}}
			>
				{children}
			</div>
		</div>
	);
};

interface SettingItemProps {
	label: string;
	description: string;
	children: React.ReactNode;
}

const SettingItem: React.FC<SettingItemProps> = ({ label, description, children }) => {
	return (
		<div
			style={{
				display: "flex",
				justifyContent: "space-between",
				alignItems: "center",
				padding: vscodeTheme.spacing.sm,
				backgroundColor: vscodeTheme.colors.background,
				borderRadius: vscodeTheme.borderRadius.sm,
			}}
		>
			<div style={{ flex: 1, marginRight: vscodeTheme.spacing.md }}>
				<div
					style={{
						fontSize: vscodeTheme.typography.fontSize.sm,
						fontWeight: 600,
						color: vscodeTheme.colors.foreground,
						marginBottom: vscodeTheme.spacing.xs,
					}}
				>
					{label}
				</div>
				<div
					style={{
						fontSize: vscodeTheme.typography.fontSize.xs,
						color: vscodeTheme.colors.foreground,
						opacity: 0.7,
					}}
				>
					{description}
				</div>
			</div>
			<div>{children}</div>
		</div>
	);
};

interface ToggleProps {
	checked: boolean;
	onChange: (checked: boolean) => void;
}

const Toggle: React.FC<ToggleProps> = ({ checked, onChange }) => {
	return (
		<button
			onClick={() => onChange(!checked)}
			style={{
				width: "40px",
				height: "20px",
				borderRadius: "10px",
				border: `1px solid ${vscodeTheme.colors.border}`,
				backgroundColor: checked ? vscodeTheme.colors.accent : vscodeTheme.colors.inputBackground,
				cursor: "pointer",
				position: "relative",
				transition: "background-color 0.2s ease",
			}}
		>
			<div
				style={{
					width: "16px",
					height: "16px",
					borderRadius: "50%",
					backgroundColor: vscodeTheme.colors.background,
					position: "absolute",
					top: "1px",
					left: checked ? "19px" : "1px",
					transition: "left 0.2s ease",
				}}
			/>
		</button>
	);
};

// Utility function for consistent input styling
const getInputStyle = (): React.CSSProperties => ({
	padding: vscodeTheme.spacing.sm,
	backgroundColor: vscodeTheme.colors.inputBackground,
	color: vscodeTheme.colors.inputForeground,
	border: `1px solid ${vscodeTheme.colors.border}`,
	borderRadius: vscodeTheme.borderRadius.sm,
	fontSize: vscodeTheme.typography.fontSize.sm,
	fontFamily: vscodeTheme.typography.fontFamily,
	minWidth: "200px",
});
