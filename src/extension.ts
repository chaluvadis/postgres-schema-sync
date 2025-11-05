import * as vscode from "vscode";
import { CommandManager } from "@/extension/CommandManager";
import { EventHandlerManager } from "@/extension/EventHandlerManager";
import { RealtimeMonitoringManager } from "@/extension/RealtimeMonitoringManager";
import { ErrorHandler, ErrorSeverity } from "@/utils/ErrorHandler";
import { ExtensionComponents, ExtensionInitializer } from "@/utils/ExtensionInitializer";
import { Logger } from "@/utils/Logger";
import { PostgreSqlConnectionManager } from "./core/PostgreSqlConnectionManager";
import { PostgreSqlExtension } from "./PostgreSqlExtension";

let extension: PostgreSqlExtension | undefined;
let components: ExtensionComponents | undefined;
export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const activationContext = ErrorHandler.createEnhancedContext("ExtensionActivation", {
		vscodeVersion: vscode.version,
		nodeVersion: process.version,
		platform: process.platform,
		arch: process.arch,
	});

	try {
		Logger.info("Activating PostgreSQL Schema Compare & Sync extension");

		// Initialize PostgreSQL connection manager
		const connectionManager = PostgreSqlConnectionManager.getInstance();
		Logger.info("PostgreSQL connection manager initialized");

		// Initialize core components
		const coreComponents = ExtensionInitializer.initializeCoreComponents(context);

		// Initialize optional UI components
		components = ExtensionInitializer.initializeOptionalComponents(coreComponents, context);

		// Initialize main extension
		extension = ExtensionInitializer.initializeComponent(
			"PostgreSqlExtension",
			() => new PostgreSqlExtension(context, components!.connectionManager, components!.treeProvider),
			true,
		) as PostgreSqlExtension;

		// Initialize modular managers
		const commandManager = new CommandManager(context, extension, components!);
		const eventHandlerManager = new EventHandlerManager(context, components!.treeProvider, components);
		const realtimeMonitoringManager = new RealtimeMonitoringManager(components);

		// Register tree view and update title with real-time info
		const treeView = ExtensionInitializer.registerTreeView(components.treeProvider, context);
		components.treeView = treeView;
		realtimeMonitoringManager.updateTreeViewTitle(treeView);

		// Register all commands using the modular command manager
		const commandDisposables = commandManager.registerCommands();

		// Register all command disposables in the main extension context
		commandDisposables.forEach((disposable) => {
			context.subscriptions.push(disposable);
		});

		// Register critical commands directly to avoid dynamic import issues
		registerCriticalCommands(context, components);

		// Register all event handlers using the modular event handler manager
		eventHandlerManager.registerEventHandlers();

		Logger.info("PostgreSQL Schema Compare & Sync extension activated successfully");

		vscode.window
			.showInformationMessage(
				"PostgreSQL Schema Compare & Sync extension activated successfully!",
				"View Getting Started",
				"Open Settings",
			)
			.then((selection) => {
				if (selection === "View Getting Started") {
					vscode.commands.executeCommand("postgresql.showHelp");
				} else if (selection === "Open Settings") {
					vscode.commands.executeCommand("postgresql.openSettings");
				}
			});
	} catch (error) {
		Logger.error("Failed to activate PostgreSQL Schema Compare & Sync extension", error as Error);

		const errorMessage = error instanceof Error ? error.message : String(error);
		const severity =
			errorMessage.toLowerCase().includes("critical") ||
			errorMessage.toLowerCase().includes("fatal") ||
			activationContext.operation.includes("Extension")
				? ErrorSeverity.CRITICAL
				: ErrorSeverity.HIGH;

		ErrorHandler.handleErrorWithSeverity(error, activationContext, severity);

		vscode.window
			.showErrorMessage(
				"PostgreSQL Schema Compare & Sync extension failed to activate. Please check the logs for details.",
				"View Logs",
				"Reload Window",
				"Get Help",
			)
			.then((selection) => {
				if (selection === "View Logs") {
					Logger.showOutputChannel();
				} else if (selection === "Reload Window") {
					vscode.commands.executeCommand("workbench.action.reloadWindow");
				} else if (selection === "Get Help") {
					vscode.commands.executeCommand("postgresql.showHelp");
				}
			});

		throw error;
	}
}

function registerCriticalCommands(context: vscode.ExtensionContext, components: ExtensionComponents): void {
	// Register the critical addConnection command directly to avoid dynamic import issues
	const addConnectionCommand = vscode.commands.registerCommand("postgresql.addConnection", async () => {
		try {
			if (components.connectionManager) {
				// Use connection management view for adding connections
				const { ConnectionManagementView } = await import("./views/legacy/ConnectionManagementView");
				const connectionView = new ConnectionManagementView(components.connectionManager);
				await connectionView.showConnectionDialog();
			} else {
				vscode.window.showErrorMessage("Connection manager not available");
			}
		} catch (error) {
			Logger.error("Failed to add connection", error as Error);
			vscode.window.showErrorMessage(`Failed to add connection: ${(error as Error).message}`);
		}
	});

	context.subscriptions.push(addConnectionCommand);
	Logger.info("Critical commands registered successfully", "Extension");
}
export function deactivate(): Thenable<void> | undefined {
	const deactivationContext = ErrorHandler.createEnhancedContext("ExtensionDeactivation", {
		timestamp: new Date().toISOString(),
		graceful: true,
	});

	try {
		Logger.info("Deactivating PostgreSQL Schema Compare & Sync extension");

		const promises: Thenable<void>[] = [];

		try {
			const connectionManager = PostgreSqlConnectionManager.getInstance();
			try {
				connectionManager.closeAllPools();
				promises.push(Promise.resolve());
			} catch (error) {
				Logger.warn("Error closing connection pools, continuing with other disposals", "deactivate", error as Error);
				ErrorHandler.handleError(error, ErrorHandler.createContext("ConnectionManagerDisposal"));
				promises.push(Promise.resolve()); // Don't fail deactivation for connection disposal errors
			}
		} catch (error) {
			Logger.warn("Failed to get connection manager instance during deactivation", "deactivate", error as Error);
		}

		if (extension) {
			try {
				extension!.dispose();
				promises.push(Promise.resolve());
			} catch (error) {
				Logger.error("Error disposing main extension", error as Error);
				ErrorHandler.handleError(error, ErrorHandler.createContext("PostgreSqlExtensionDisposal"));
				promises.push(Promise.resolve()); // Don't fail deactivation for extension disposal errors
			}
		}

		try {
			Logger.dispose();
			promises.push(Promise.resolve());
		} catch (error) {
			Logger.error("Error disposing logger", error as Error);
			ErrorHandler.handleError(error, ErrorHandler.createContext("LoggerDisposal"));
			promises.push(Promise.resolve()); // Don't fail deactivation for logger disposal errors
		}

		return Promise.race([
			Promise.all(promises).then(() => {
				Logger.info("PostgreSQL Schema Compare & Sync extension deactivated successfully");
				return undefined;
			}),
			new Promise<undefined>((_, reject) => {
				setTimeout(() => {
					Logger.warn("Extension deactivation timed out, forcing completion");
					reject(new Error("Deactivation timeout"));
				}, 10000); // 10 second timeout
			}),
		]).catch((error) => {
			Logger.error("Error during extension deactivation", error as Error);

			ErrorHandler.handleError(error, deactivationContext);

			return undefined;
		});
	} catch (error) {
		Logger.error("Critical error during extension deactivation", error as Error);

		// Handle critical deactivation errors
		ErrorHandler.handleErrorWithSeverity(error, deactivationContext, ErrorSeverity.HIGH);

		// Return gracefully even on critical errors to avoid VS Code issues
		return undefined;
	}
}
