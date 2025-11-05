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

// Initialize Logger output channel before any logging
Logger.initializeOutputChannel();

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const activationContext = ErrorHandler.createEnhancedContext("ExtensionActivation", {
		vscodeVersion: vscode.version,
		nodeVersion: process.version,
		platform: process.platform,
		arch: process.arch,
	});

	try {
		Logger.info("Activating PostgreSQL Schema Compare & Sync extension", "activate", {
			vscodeVersion: vscode.version,
			nodeVersion: process.version,
			platform: process.platform,
			arch: process.arch,
			timestamp: new Date().toISOString(),
		});

		// Initialize PostgreSQL connection manager with timeout
		Logger.debug("Initializing PostgreSQL connection manager", "activate");
		const connectionManager = PostgreSqlConnectionManager.getInstance();
		Logger.info("PostgreSQL connection manager initialized", "activate");

		// Add a small delay to allow the extension host to remain responsive during initialization
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Initialize core components
		Logger.debug("Initializing core extension components", "activate");
		const coreComponents = ExtensionInitializer.initializeCoreComponents(context);
		Logger.info("Core extension components initialized", "activate", {
			hasConnectionManager: !!coreComponents.connectionManager,
			hasSchemaManager: !!coreComponents.schemaManager,
			hasTreeProvider: !!coreComponents.treeProvider,
		});

		// Initialize optional UI components
		Logger.debug("Initializing optional UI components", "activate");
		components = ExtensionInitializer.initializeOptionalComponents(coreComponents, context);
		Logger.info("Optional UI components initialized", "activate", {
			totalComponents: Object.keys(components).length,
			hasDashboardView: !!components.dashboardView,
			hasNotificationManager: !!components.notificationManager,
			hasQueryEditorView: !!components.queryEditorView,
		});

		// Initialize main extension
		Logger.debug("Initializing main PostgreSqlExtension component", "activate");
		extension = ExtensionInitializer.initializeComponent(
			"PostgreSqlExtension",
			() => new PostgreSqlExtension(context, components!.connectionManager, components!.treeProvider),
			true,
		) as PostgreSqlExtension;
		Logger.info("Main PostgreSqlExtension component initialized", "activate");

		// Initialize modular managers
		Logger.debug("Initializing modular managers", "activate");
		const commandManager = new CommandManager(context, extension, components!);
		const eventHandlerManager = new EventHandlerManager(context, components!.treeProvider, components);
		const realtimeMonitoringManager = new RealtimeMonitoringManager(components);
		Logger.info("Modular managers initialized", "activate", {
			hasCommandManager: !!commandManager,
			hasEventHandlerManager: !!eventHandlerManager,
			hasRealtimeMonitoringManager: !!realtimeMonitoringManager,
		});

		// Register tree view and update title with real-time info
		Logger.debug("Registering tree view", "activate");
		const treeView = ExtensionInitializer.registerTreeView(components.treeProvider, context);
		components.treeView = treeView;
		realtimeMonitoringManager.updateTreeViewTitle(treeView);
		Logger.info("Tree view registered and configured", "activate");

		// Register all commands using the modular command manager
		Logger.debug("Registering commands", "activate");
		const commandDisposables = commandManager.registerCommands();
		Logger.info("Commands registered", "activate", {
			commandCount: commandDisposables.length,
		});

		// Register all command disposables in the main extension context
		commandDisposables.forEach((disposable) => {
			context.subscriptions.push(disposable);
		});
		Logger.debug("Command disposables registered in context", "activate");

		// Register critical commands directly to avoid dynamic import issues
		Logger.debug("Registering critical commands", "activate");
		registerCriticalCommands(context, components);
		Logger.info("Critical commands registered", "activate");

		// Register all event handlers using the modular event handler manager
		Logger.debug("Registering event handlers", "activate");
		eventHandlerManager.registerEventHandlers();
		Logger.info("Event handlers registered", "activate");

		Logger.info("PostgreSQL Schema Compare & Sync extension activated successfully", "activate", {
			activationTime: Date.now() - new Date(activationContext.timestamp).getTime(),
			totalComponents: Object.keys(components).length,
		});

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
