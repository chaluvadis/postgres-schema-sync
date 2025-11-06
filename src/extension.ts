import * as vscode from "vscode";
import { CommandManager } from "@/extension/CommandManager";
import { EventHandlerManager } from "@/extension/EventHandlerManager";
import { RealtimeMonitoringManager } from "@/extension/RealtimeMonitoringManager";
import { ErrorHandler, ErrorSeverity } from "@/utils/ErrorHandler";
import { ExtensionComponents, ExtensionInitializer } from "@/utils/ExtensionInitializer";
import { Logger } from "@/utils/Logger";
import { DiagnosticLogger } from "@/utils/DiagnosticLogger";
import { EventHandlerOptimizer } from "@/utils/EventHandlerOptimizer";
import { ResourceCleanupManager } from "@/utils/ResourceCleanupManager";
import { PostgreSqlConnectionManager } from "./core/PostgreSqlConnectionManager";
import { PostgreSqlExtension } from "./PostgreSqlExtension";

let extension: PostgreSqlExtension | undefined;
let components: ExtensionComponents | undefined;

// Initialize Logger output channel before any logging
Logger.initializeOutputChannel();

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const activationStartTime = Date.now();
	const diagnosticLogger = DiagnosticLogger.getInstance();

	// Initialize optimizers
	const eventHandlerOptimizer = EventHandlerOptimizer.getInstance();
	const resourceCleanupManager = ResourceCleanupManager.getInstance();

	// Initialize diagnostic logging for activation
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

		Logger.debug("PostgreSqlConnectionManager initialization skipped - handled by ExtensionInitializer", "activate");

		// Initialize core components
		const coreComponentsStart = Date.now();
		Logger.debug("Initializing core extension components", "activate");
		const coreComponents = ExtensionInitializer.initializeCoreComponents(context);
		const coreComponentsDuration = Date.now() - coreComponentsStart;
		Logger.info("Core extension components initialized", "activate", {
			duration: coreComponentsDuration,
			hasConnectionManager: !!coreComponents.connectionManager,
			hasSchemaManager: !!coreComponents.schemaManager,
			hasTreeProvider: !!coreComponents.treeProvider,
		});

		if (coreComponentsDuration > 10000) {
			Logger.warn(`Core components initialization took ${coreComponentsDuration}ms - this might be slow!`, "activate");
		}

		// Initialize optional UI components
		const optionalComponentsStart = Date.now();
		Logger.debug("Initializing optional UI components", "activate");
		components = await ExtensionInitializer.initializeOptionalComponents(coreComponents, context);
		const optionalComponentsDuration = Date.now() - optionalComponentsStart;
		const componentsLength = components ? Object.keys(components).length : 0;
		Logger.info("Optional UI components initialized", "activate", {
			duration: optionalComponentsDuration,
			totalComponents: componentsLength,
			hasDashboardView: !!components?.dashboardView,
			hasNotificationManager: !!components?.notificationManager,
			hasQueryEditorView: !!components?.queryEditorView,
		});

		if (optionalComponentsDuration > 15000) {
			Logger.warn(
				`Optional components initialization took ${optionalComponentsDuration}ms - this might be slow!`,
				"activate",
			);
		}

		// Initialize main extension
		const mainExtensionStart = Date.now();
		Logger.debug("Initializing main PostgreSqlExtension component", "activate");
		extension = ExtensionInitializer.initializeComponent(
			"PostgreSqlExtension",
			() => new PostgreSqlExtension(context, components!.connectionManager, components!.treeProvider),
			true,
		) as PostgreSqlExtension;
		const mainExtensionDuration = Date.now() - mainExtensionStart;
		Logger.info("Main PostgreSqlExtension component initialized", "activate", {
			duration: mainExtensionDuration,
		});

		if (mainExtensionDuration > 5000) {
			Logger.warn(`Main extension initialization took ${mainExtensionDuration}ms - this might be slow!`, "activate");
		}

		// Initialize modular managers
		const managersStart = Date.now();
		Logger.debug("Initializing modular managers", "activate");
		const commandManager = new CommandManager(context, extension, components!);
		const eventHandlerManager = new EventHandlerManager(context, components!.treeProvider, components);
		const realtimeMonitoringManager = new RealtimeMonitoringManager(components);
		const managersDuration = Date.now() - managersStart;
		Logger.info("Modular managers initialized", "activate", {
			duration: managersDuration,
			hasCommandManager: !!commandManager,
			hasEventHandlerManager: !!eventHandlerManager,
			hasRealtimeMonitoringManager: !!realtimeMonitoringManager,
		});

		if (managersDuration > 10000) {
			Logger.warn(`Modular managers initialization took ${managersDuration}ms - this might be slow!`, "activate");
		}

		// Register tree view and update title with real-time info
		const treeViewStart = Date.now();
		Logger.debug("Registering tree view", "activate");
		if (components?.treeProvider) {
			const treeView = ExtensionInitializer.registerTreeView(components.treeProvider, context);
			components.treeView = treeView;
			realtimeMonitoringManager.updateTreeViewTitle(treeView);
		}
		const treeViewDuration = Date.now() - treeViewStart;
		Logger.info("Tree view registered and configured", "activate", {
			duration: treeViewDuration,
		});

		if (treeViewDuration > 5000) {
			Logger.warn(`Tree view registration took ${treeViewDuration}ms - this might be slow!`, "activate");
		}

		// Register all commands using the modular command manager
		const commandsStart = Date.now();
		Logger.debug("Registering commands", "activate");
		const commandDisposables = commandManager.registerCommands();
		const commandsDuration = Date.now() - commandsStart;
		Logger.info("Commands registered", "activate", {
			duration: commandsDuration,
			commandCount: commandDisposables.length,
		});

		if (commandsDuration > 8000) {
			Logger.warn(`Command registration took ${commandsDuration}ms - this might be slow!`, "activate");
		}

		// Register all command disposables in the main extension context
		const disposablesStart = Date.now();
		commandDisposables.forEach((disposable) => {
			context.subscriptions.push(disposable);
		});
		const disposablesDuration = Date.now() - disposablesStart;
		Logger.debug("Command disposables registered in context", "activate", {
			duration: disposablesDuration,
		});

		// Register all event handlers using the modular event handler manager
		const eventHandlersStart = Date.now();
		Logger.debug("Registering event handlers", "activate");
		eventHandlerManager.registerEventHandlers();
		const eventHandlersDuration = Date.now() - eventHandlersStart;
		Logger.info("Event handlers registered", "activate", {
			duration: eventHandlersDuration,
		});

		if (eventHandlersDuration > 5000) {
			Logger.warn(`Event handlers registration took ${eventHandlersDuration}ms - this might be slow!`, "activate");
		}

		// Initialize optimizers
		const optimizationStart = Date.now();
		Logger.debug("Initializing optimizers", "activate");

		// Initialize event handler optimization
		eventHandlerOptimizer.initialize();

		// Initialize resource cleanup manager
		resourceCleanupManager.initialize();

		const optimizationDuration = Date.now() - optimizationStart;
		Logger.info("Optimizers initialized", "activate", {
			duration: optimizationDuration,
			hasEventHandlerOptimizer: !!eventHandlerOptimizer,
			hasResourceCleanupManager: !!resourceCleanupManager,
		});

		const totalActivationTime = Date.now() - activationStartTime;
		Logger.info("PostgreSQL Schema Compare & Sync extension activated successfully", "activate", {
			totalActivationTime,
			totalComponents: components ? Object.keys(components).length : 0,
		});

		// Generate and log performance summary
		const performanceSummary = diagnosticLogger.getPerformanceSummary();
		Logger.info("Extension Activation Performance Summary", "activate", { performanceSummary });

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

		// Dispose optimizers
		try {
			const eventHandlerOptimizer = EventHandlerOptimizer.getInstance();
			const resourceCleanupManager = ResourceCleanupManager.getInstance();
			eventHandlerOptimizer.dispose();
			resourceCleanupManager.dispose();
			promises.push(Promise.resolve());
		} catch (error) {
			Logger.warn("Error disposing optimizers, continuing with other disposals", "deactivate", error as Error);
			ErrorHandler.handleError(error, ErrorHandler.createContext("OptimizerDisposal"));
			promises.push(Promise.resolve()); // Don't fail deactivation for optimizer disposal errors
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
