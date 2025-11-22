import React, { useEffect, useState } from "react";
import { Button } from "../components/shared/Button";
import { vscodeTheme } from "../theme/vscode-theme";

// VS Code API for communication with extension
declare const acquireVsCodeApi: () => any;
const vscode = acquireVsCodeApi();

interface MigrationStep {
	id: string;
	name: string;
	description: string;
	sqlScript: string;
	objectType: string;
	objectName: string;
	schema: string;
	operation: "CREATE" | "DROP" | "ALTER";
	riskLevel: "low" | "medium" | "high" | "critical";
	estimatedDuration: number;
	dependencies: string[];
}

interface MigrationScript {
	id: string;
	name: string;
	description: string;
	sourceConnectionId: string;
	targetConnectionId: string;
	migrationSteps: MigrationStep[];
	estimatedExecutionTime: number;
	riskLevel: "low" | "medium" | "high" | "critical";
	createdAt: Date;
}

type WizardStep = "select-connections" | "analyze-changes" | "review-script" | "execute" | "complete";

export const MigrationWizard: React.FC = () => {
	const [currentStep, setCurrentStep] = useState<WizardStep>("select-connections");
	const [connections, setConnections] = useState<any[]>([]);
	const [sourceConnection, setSourceConnection] = useState("");
	const [targetConnection, setTargetConnection] = useState("");
	const [migrationScript, setMigrationScript] = useState<MigrationScript | null>(null);
	const [analyzing, setAnalyzing] = useState(false);
	const [executing, setExecuting] = useState(false);
	const [executionProgress, setExecutionProgress] = useState(0);
	const [executionResults, setExecutionResults] = useState<any[]>([]);

	useEffect(() => {
		// Load connections
		vscode.postMessage({ command: "getConnections" });

		// Listen for messages from extension
		const messageHandler = (event: MessageEvent) => {
			const message = event.data;
			switch (message.command) {
				case "connectionsLoaded":
					setConnections(message.connections);
					break;
				case "migrationScriptGenerated":
					setMigrationScript(message.script);
					setCurrentStep("review-script");
					setAnalyzing(false);
					break;
				case "migrationExecutionProgress":
					setExecutionProgress(message.progress);
					setExecutionResults(message.results);
					break;
				case "migrationExecutionComplete":
					setExecuting(false);
					setCurrentStep("complete");
					break;
			}
		};

		window.addEventListener("message", messageHandler);
		return () => window.removeEventListener("message", messageHandler);
	}, []);

	const handleAnalyzeChanges = () => {
		if (!sourceConnection || !targetConnection) {
			return;
		}

		setAnalyzing(true);
		vscode.postMessage({
			command: "analyzeSchemaChanges",
			sourceConnectionId: sourceConnection,
			targetConnectionId: targetConnection,
		});
	};

	const handleExecuteMigration = () => {
		if (!migrationScript) {
			return;
		}

		setExecuting(true);
		setExecutionProgress(0);
		setCurrentStep("execute");

		vscode.postMessage({
			command: "executeMigration",
			scriptId: migrationScript.id,
		});
	};

	const getStepNumber = (step: WizardStep): number => {
		const steps: WizardStep[] = ["select-connections", "analyze-changes", "review-script", "execute", "complete"];
		return steps.indexOf(step) + 1;
	};

	const getTotalSteps = (): number => 5;

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
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						marginBottom: vscodeTheme.spacing.md,
					}}
				>
					<h1
						style={{
							margin: 0,
							fontSize: vscodeTheme.typography.fontSize.lg,
							fontWeight: 600,
						}}
					>
						Migration Wizard
					</h1>
					<div
						style={{
							fontSize: vscodeTheme.typography.fontSize.sm,
							color: vscodeTheme.colors.foreground,
							opacity: 0.7,
						}}
					>
						Step {getStepNumber(currentStep)} of {getTotalSteps()}
					</div>
				</div>

				{/* Progress Bar */}
				<div
					style={{
						width: "100%",
						height: "4px",
						backgroundColor: vscodeTheme.colors.border,
						borderRadius: "2px",
						overflow: "hidden",
					}}
				>
					<div
						style={{
							width: `${(getStepNumber(currentStep) / getTotalSteps()) * 100}%`,
							height: "100%",
							backgroundColor: vscodeTheme.colors.accent,
							transition: "width 0.3s ease",
						}}
					/>
				</div>
			</div>

			{/* Content */}
			<div
				style={{
					flex: 1,
					padding: vscodeTheme.spacing.lg,
					overflow: "auto",
				}}
			>
				{currentStep === "select-connections" && (
					<SelectConnectionsStep
						connections={connections}
						sourceConnection={sourceConnection}
						targetConnection={targetConnection}
						onSourceChange={setSourceConnection}
						onTargetChange={setTargetConnection}
						onNext={() => setCurrentStep("analyze-changes")}
					/>
				)}

				{currentStep === "analyze-changes" && (
					<AnalyzeChangesStep
						analyzing={analyzing}
						onAnalyze={handleAnalyzeChanges}
						onBack={() => setCurrentStep("select-connections")}
						canProceed={!!sourceConnection && !!targetConnection}
					/>
				)}

				{currentStep === "review-script" && migrationScript && (
					<ReviewScriptStep
						script={migrationScript}
						onExecute={handleExecuteMigration}
						onBack={() => setCurrentStep("analyze-changes")}
					/>
				)}

				{currentStep === "execute" && migrationScript && (
					<ExecuteStep
						script={migrationScript}
						progress={executionProgress}
						results={executionResults}
						executing={executing}
					/>
				)}

				{currentStep === "complete" && (
					<CompleteStep
						results={executionResults}
						onNewMigration={() => {
							setCurrentStep("select-connections");
							setMigrationScript(null);
							setExecutionResults([]);
						}}
					/>
				)}
			</div>
		</div>
	);
};

// Step Components
interface SelectConnectionsStepProps {
	connections: any[];
	sourceConnection: string;
	targetConnection: string;
	onSourceChange: (id: string) => void;
	onTargetChange: (id: string) => void;
	onNext: () => void;
}

const SelectConnectionsStep: React.FC<SelectConnectionsStepProps> = ({
	connections,
	sourceConnection,
	targetConnection,
	onSourceChange,
	onTargetChange,
	onNext,
}) => {
	return (
		<div>
			<h2
				style={{
					margin: `0 0 ${vscodeTheme.spacing.lg} 0`,
					fontSize: vscodeTheme.typography.fontSize.md,
					fontWeight: 600,
				}}
			>
				Select Source and Target Connections
			</h2>

			<div
				style={{
					display: "grid",
					gridTemplateColumns: "1fr 1fr",
					gap: vscodeTheme.spacing.lg,
					marginBottom: vscodeTheme.spacing.xl,
				}}
			>
				<ConnectionSelector
					label="Source Database (Current State)"
					value={sourceConnection}
					onChange={onSourceChange}
					connections={connections}
					placeholder="Select source database"
				/>

				<ConnectionSelector
					label="Target Database (Desired State)"
					value={targetConnection}
					onChange={onTargetChange}
					connections={connections}
					placeholder="Select target database"
				/>
			</div>

			<div
				style={{
					backgroundColor: vscodeTheme.colors.inputBackground,
					padding: vscodeTheme.spacing.lg,
					borderRadius: vscodeTheme.borderRadius.md,
					border: `1px solid ${vscodeTheme.colors.border}`,
					marginBottom: vscodeTheme.spacing.xl,
				}}
			>
				<h3
					style={{
						margin: `0 0 ${vscodeTheme.spacing.md} 0`,
						fontSize: vscodeTheme.typography.fontSize.sm,
						fontWeight: 600,
					}}
				>
					What happens next?
				</h3>
				<ul
					style={{
						margin: 0,
						paddingLeft: vscodeTheme.spacing.lg,
						fontSize: vscodeTheme.typography.fontSize.sm,
						lineHeight: 1.5,
					}}
				>
					<li>The wizard will analyze the schema differences between the source and target databases</li>
					<li>A migration script will be generated to transform the source schema to match the target</li>
					<li>You can review and modify the script before execution</li>
					<li>The migration will be executed safely with rollback capabilities</li>
				</ul>
			</div>

			<div style={{ display: "flex", justifyContent: "flex-end" }}>
				<Button onClick={onNext} disabled={!sourceConnection || !targetConnection} variant="primary">
					Analyze Changes →
				</Button>
			</div>
		</div>
	);
};

interface ConnectionSelectorProps {
	label: string;
	value: string;
	onChange: (value: string) => void;
	connections: any[];
	placeholder: string;
}

const ConnectionSelector: React.FC<ConnectionSelectorProps> = ({
	label,
	value,
	onChange,
	connections,
	placeholder,
}) => {
	return (
		<div>
			<label
				style={{
					display: "block",
					marginBottom: vscodeTheme.spacing.sm,
					fontSize: vscodeTheme.typography.fontSize.sm,
					fontWeight: 600,
					color: vscodeTheme.colors.foreground,
				}}
			>
				{label}
			</label>
			<select
				value={value}
				onChange={(e) => onChange(e.target.value)}
				style={{
					width: "100%",
					padding: vscodeTheme.spacing.md,
					backgroundColor: vscodeTheme.colors.inputBackground,
					color: vscodeTheme.colors.inputForeground,
					border: `1px solid ${vscodeTheme.colors.border}`,
					borderRadius: vscodeTheme.borderRadius.sm,
					fontSize: vscodeTheme.typography.fontSize.sm,
				}}
			>
				<option value="">{placeholder}</option>
				{connections.map((conn) => (
					<option key={conn.id} value={conn.id}>
						{conn.name} ({conn.host}:{conn.port})
					</option>
				))}
			</select>
		</div>
	);
};

interface AnalyzeChangesStepProps {
	analyzing: boolean;
	onAnalyze: () => void;
	onBack: () => void;
	canProceed: boolean;
}

const AnalyzeChangesStep: React.FC<AnalyzeChangesStepProps> = ({ analyzing, onAnalyze, onBack, canProceed }) => {
	return (
		<div>
			<h2
				style={{
					margin: `0 0 ${vscodeTheme.spacing.lg} 0`,
					fontSize: vscodeTheme.typography.fontSize.md,
					fontWeight: 600,
				}}
			>
				Analyze Schema Changes
			</h2>

			<div
				style={{
					backgroundColor: vscodeTheme.colors.inputBackground,
					padding: vscodeTheme.spacing.xl,
					borderRadius: vscodeTheme.borderRadius.md,
					border: `1px solid ${vscodeTheme.colors.border}`,
					textAlign: "center",
					marginBottom: vscodeTheme.spacing.xl,
				}}
			>
				{analyzing ? (
					<div>
						<div
							style={{
								fontSize: "48px",
								marginBottom: vscodeTheme.spacing.md,
							}}
						>
							🔍
						</div>
						<h3
							style={{
								margin: `0 0 ${vscodeTheme.spacing.md} 0`,
								fontSize: vscodeTheme.typography.fontSize.md,
							}}
						>
							Analyzing Schema Differences
						</h3>
						<p
							style={{
								margin: 0,
								color: vscodeTheme.colors.foreground,
								opacity: 0.7,
							}}
						>
							Comparing source and target database schemas...
						</p>
					</div>
				) : (
					<div>
						<div
							style={{
								fontSize: "48px",
								marginBottom: vscodeTheme.spacing.md,
							}}
						>
							📊
						</div>
						<h3
							style={{
								margin: `0 0 ${vscodeTheme.spacing.md} 0`,
								fontSize: vscodeTheme.typography.fontSize.md,
							}}
						>
							Ready to Analyze
						</h3>
						<p
							style={{
								margin: 0,
								color: vscodeTheme.colors.foreground,
								opacity: 0.7,
							}}
						>
							Click the button below to start analyzing schema differences
						</p>
					</div>
				)}
			</div>

			<div style={{ display: "flex", justifyContent: "space-between" }}>
				<Button onClick={onBack} variant="secondary">
					← Back
				</Button>
				<Button onClick={onAnalyze} disabled={!canProceed || analyzing} loading={analyzing} variant="primary">
					{analyzing ? "Analyzing..." : "Start Analysis"}
				</Button>
			</div>
		</div>
	);
};

interface ReviewScriptStepProps {
	script: MigrationScript;
	onExecute: () => void;
	onBack: () => void;
}

const ReviewScriptStep: React.FC<ReviewScriptStepProps> = ({ script, onExecute, onBack }) => {
	const getRiskColor = (risk: string) => {
		switch (risk) {
			case "critical":
				return vscodeTheme.colors.error;
			case "high":
				return vscodeTheme.colors.error;
			case "medium":
				return vscodeTheme.colors.warning;
			case "low":
				return vscodeTheme.colors.success;
			default:
				return vscodeTheme.colors.foreground;
		}
	};

	return (
		<div>
			<h2
				style={{
					margin: `0 0 ${vscodeTheme.spacing.lg} 0`,
					fontSize: vscodeTheme.typography.fontSize.md,
					fontWeight: 600,
				}}
			>
				Review Migration Script
			</h2>

			{/* Script Overview */}
			<div
				style={{
					backgroundColor: vscodeTheme.colors.inputBackground,
					padding: vscodeTheme.spacing.lg,
					borderRadius: vscodeTheme.borderRadius.md,
					border: `1px solid ${vscodeTheme.colors.border}`,
					marginBottom: vscodeTheme.spacing.lg,
				}}
			>
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
						gap: vscodeTheme.spacing.md,
						marginBottom: vscodeTheme.spacing.lg,
					}}
				>
					<div>
						<div
							style={{
								fontSize: vscodeTheme.typography.fontSize.xs,
								color: vscodeTheme.colors.foreground,
								opacity: 0.7,
								marginBottom: vscodeTheme.spacing.xs,
							}}
						>
							Total Steps
						</div>
						<div
							style={{
								fontSize: vscodeTheme.typography.fontSize.lg,
								fontWeight: 600,
							}}
						>
							{script.migrationSteps.length}
						</div>
					</div>
					<div>
						<div
							style={{
								fontSize: vscodeTheme.typography.fontSize.xs,
								color: vscodeTheme.colors.foreground,
								opacity: 0.7,
								marginBottom: vscodeTheme.spacing.xs,
							}}
						>
							Estimated Time
						</div>
						<div
							style={{
								fontSize: vscodeTheme.typography.fontSize.lg,
								fontWeight: 600,
							}}
						>
							{Math.ceil(script.estimatedExecutionTime / 60)}m
						</div>
					</div>
					<div>
						<div
							style={{
								fontSize: vscodeTheme.typography.fontSize.xs,
								color: vscodeTheme.colors.foreground,
								opacity: 0.7,
								marginBottom: vscodeTheme.spacing.xs,
							}}
						>
							Risk Level
						</div>
						<div
							style={{
								fontSize: vscodeTheme.typography.fontSize.lg,
								fontWeight: 600,
								color: getRiskColor(script.riskLevel),
							}}
						>
							{script.riskLevel.toUpperCase()}
						</div>
					</div>
				</div>
			</div>

			{/* Migration Steps */}
			<div style={{ marginBottom: vscodeTheme.spacing.xl }}>
				<h3
					style={{
						margin: `0 0 ${vscodeTheme.spacing.md} 0`,
						fontSize: vscodeTheme.typography.fontSize.sm,
						fontWeight: 600,
					}}
				>
					Migration Steps
				</h3>
				<div
					style={{
						maxHeight: "400px",
						overflow: "auto",
						border: `1px solid ${vscodeTheme.colors.border}`,
						borderRadius: vscodeTheme.borderRadius.md,
					}}
				>
					{script.migrationSteps.map((step, index) => (
						<div
							key={step.id}
							style={{
								padding: vscodeTheme.spacing.md,
								borderBottom:
									index < script.migrationSteps.length - 1 ? `1px solid ${vscodeTheme.colors.border}` : "none",
								backgroundColor: index % 2 === 0 ? vscodeTheme.colors.background : vscodeTheme.colors.inputBackground,
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
								<div
									style={{
										fontSize: vscodeTheme.typography.fontSize.sm,
										fontWeight: 600,
										color: vscodeTheme.colors.foreground,
									}}
								>
									{index + 1}. {step.name}
								</div>
								<div
									style={{
										fontSize: vscodeTheme.typography.fontSize.xs,
										padding: `${vscodeTheme.spacing.xs} ${vscodeTheme.spacing.sm}`,
										borderRadius: vscodeTheme.borderRadius.sm,
										backgroundColor: getRiskColor(step.riskLevel),
										color: vscodeTheme.colors.background,
									}}
								>
									{step.riskLevel}
								</div>
							</div>
							<div
								style={{
									fontSize: vscodeTheme.typography.fontSize.sm,
									color: vscodeTheme.colors.foreground,
									opacity: 0.8,
									marginBottom: vscodeTheme.spacing.sm,
								}}
							>
								{step.description}
							</div>
							<div
								style={{
									fontSize: vscodeTheme.typography.fontSize.xs,
									color: vscodeTheme.colors.foreground,
									opacity: 0.6,
								}}
							>
								{step.objectType} • {step.schema}.{step.objectName} • ~{step.estimatedDuration}s
							</div>
						</div>
					))}
				</div>
			</div>

			<div style={{ display: "flex", justifyContent: "space-between" }}>
				<Button onClick={onBack} variant="secondary">
					← Back
				</Button>
				<Button onClick={onExecute} variant="success">
					Execute Migration →
				</Button>
			</div>
		</div>
	);
};

interface ExecuteStepProps {
	script: MigrationScript;
	progress: number;
	results: any[];
	executing: boolean;
}

const ExecuteStep: React.FC<ExecuteStepProps> = ({ script, progress, results, executing }) => {
	return (
		<div>
			<h2
				style={{
					margin: `0 0 ${vscodeTheme.spacing.lg} 0`,
					fontSize: vscodeTheme.typography.fontSize.md,
					fontWeight: 600,
				}}
			>
				Executing Migration
			</h2>

			<div
				style={{
					backgroundColor: vscodeTheme.colors.inputBackground,
					padding: vscodeTheme.spacing.xl,
					borderRadius: vscodeTheme.borderRadius.md,
					border: `1px solid ${vscodeTheme.colors.border}`,
					textAlign: "center",
					marginBottom: vscodeTheme.spacing.xl,
				}}
			>
				<div
					style={{
						fontSize: "48px",
						marginBottom: vscodeTheme.spacing.md,
					}}
				>
					{executing ? "⚙️" : "✅"}
				</div>
				<h3
					style={{
						margin: `0 0 ${vscodeTheme.spacing.md} 0`,
						fontSize: vscodeTheme.typography.fontSize.md,
					}}
				>
					{executing ? "Executing Migration Steps" : "Migration Complete"}
				</h3>

				{executing && (
					<div style={{ marginBottom: vscodeTheme.spacing.md }}>
						<div
							style={{
								width: "100%",
								height: "8px",
								backgroundColor: vscodeTheme.colors.border,
								borderRadius: "4px",
								overflow: "hidden",
								marginBottom: vscodeTheme.spacing.sm,
							}}
						>
							<div
								style={{
									width: `${progress}%`,
									height: "100%",
									backgroundColor: vscodeTheme.colors.accent,
									transition: "width 0.3s ease",
								}}
							/>
						</div>
						<div
							style={{
								fontSize: vscodeTheme.typography.fontSize.sm,
								color: vscodeTheme.colors.foreground,
								opacity: 0.7,
							}}
						>
							{Math.round(progress)}% complete
						</div>
					</div>
				)}

				<div
					style={{
						fontSize: vscodeTheme.typography.fontSize.sm,
						color: vscodeTheme.colors.foreground,
						opacity: 0.7,
					}}
				>
					{executing
						? `${results.length} of ${script.migrationSteps.length} steps completed`
						: `All ${script.migrationSteps.length} steps completed successfully`}
				</div>
			</div>

			{/* Execution Results */}
			{results.length > 0 && (
				<div>
					<h3
						style={{
							margin: `0 0 ${vscodeTheme.spacing.md} 0`,
							fontSize: vscodeTheme.typography.fontSize.sm,
							fontWeight: 600,
						}}
					>
						Execution Results
					</h3>
					<div
						style={{
							maxHeight: "300px",
							overflow: "auto",
							border: `1px solid ${vscodeTheme.colors.border}`,
							borderRadius: vscodeTheme.borderRadius.md,
						}}
					>
						{results.map((result, index) => (
							<div
								key={index}
								style={{
									padding: vscodeTheme.spacing.md,
									borderBottom: index < results.length - 1 ? `1px solid ${vscodeTheme.colors.border}` : "none",
									backgroundColor: result.success ? vscodeTheme.colors.success : vscodeTheme.colors.error,
									color: vscodeTheme.colors.background,
									fontSize: vscodeTheme.typography.fontSize.sm,
								}}
							>
								<div
									style={{
										fontWeight: 600,
										marginBottom: vscodeTheme.spacing.xs,
									}}
								>
									Step {index + 1}: {result.stepName}
								</div>
								<div style={{ opacity: 0.9 }}>
									{result.success ? "✅ Success" : "❌ Failed"}
									{result.duration && ` (${result.duration}ms)`}
								</div>
								{result.error && (
									<div
										style={{
											marginTop: vscodeTheme.spacing.xs,
											fontSize: vscodeTheme.typography.fontSize.xs,
											opacity: 0.8,
										}}
									>
										{result.error}
									</div>
								)}
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
};

interface CompleteStepProps {
	results: any[];
	onNewMigration: () => void;
}

const CompleteStep: React.FC<CompleteStepProps> = ({ results, onNewMigration }) => {
	const successCount = results.filter((r) => r.success).length;
	const totalCount = results.length;
	const successRate = totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 0;

	return (
		<div>
			<h2
				style={{
					margin: `0 0 ${vscodeTheme.spacing.lg} 0`,
					fontSize: vscodeTheme.typography.fontSize.md,
					fontWeight: 600,
				}}
			>
				Migration Complete
			</h2>

			<div
				style={{
					backgroundColor: successRate === 100 ? vscodeTheme.colors.success : vscodeTheme.colors.warning,
					color: vscodeTheme.colors.background,
					padding: vscodeTheme.spacing.xl,
					borderRadius: vscodeTheme.borderRadius.md,
					textAlign: "center",
					marginBottom: vscodeTheme.spacing.xl,
				}}
			>
				<div
					style={{
						fontSize: "48px",
						marginBottom: vscodeTheme.spacing.md,
					}}
				>
					{successRate === 100 ? "🎉" : "⚠️"}
				</div>
				<h3
					style={{
						margin: `0 0 ${vscodeTheme.spacing.md} 0`,
						fontSize: vscodeTheme.typography.fontSize.lg,
					}}
				>
					{successRate === 100 ? "Migration Successful!" : "Migration Completed with Issues"}
				</h3>
				<div
					style={{
						fontSize: vscodeTheme.typography.fontSize.md,
						opacity: 0.9,
					}}
				>
					{successCount} of {totalCount} steps completed successfully ({successRate}%)
				</div>
			</div>

			<div
				style={{
					backgroundColor: vscodeTheme.colors.inputBackground,
					padding: vscodeTheme.spacing.lg,
					borderRadius: vscodeTheme.borderRadius.md,
					border: `1px solid ${vscodeTheme.colors.border}`,
					marginBottom: vscodeTheme.spacing.xl,
				}}
			>
				<h3
					style={{
						margin: `0 0 ${vscodeTheme.spacing.md} 0`,
						fontSize: vscodeTheme.typography.fontSize.sm,
						fontWeight: 600,
					}}
				>
					What happened?
				</h3>
				<ul
					style={{
						margin: 0,
						paddingLeft: vscodeTheme.spacing.lg,
						fontSize: vscodeTheme.typography.fontSize.sm,
						lineHeight: 1.5,
					}}
				>
					<li>Schema changes were applied to the target database</li>
					<li>All migration steps were executed in the correct order</li>
					<li>Dependencies between objects were respected</li>
					<li>Rollback scripts were prepared for safety</li>
				</ul>
			</div>

			<div
				style={{
					display: "flex",
					justifyContent: "center",
					gap: vscodeTheme.spacing.md,
				}}
			>
				<Button onClick={onNewMigration} variant="primary">
					Create Another Migration
				</Button>
				<Button onClick={() => vscode.postMessage({ command: "showDashboard" })} variant="secondary">
					Return to Dashboard
				</Button>
			</div>
		</div>
	);
};
