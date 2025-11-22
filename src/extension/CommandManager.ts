import * as vscode from "vscode";
import { ValidationFramework } from "@/core/ValidationFramework";
import { DatabaseConnection } from "@/managers/ConnectionManager";
import { MigrationManagement } from "@/managers/schema/MigrationManagement";
import { SchemaOperations } from "@/managers/schema/SchemaOperations";
import { ExtensionComponents } from "@/utils/ExtensionInitializer";
import { Logger } from "@/utils/Logger";
import { DiagnosticLogger } from "@/utils/DiagnosticLogger";
import { PostgreSqlExtension } from "../PostgreSqlExtension";
import { AdditionalCommandHandlers } from "./AdditionalCommandHandlers";
import { CommandErrorHandler } from "./CommandErrorHandler";
import { CommandHandlers } from "./CommandHandlers";
import { CommandRegistry } from "./CommandRegistry";
import { QueryCommandHandlers } from "./QueryCommandHandlers";
import { SQLFileHandlers } from "./SQLFileHandlers";
import { UICommandHandlers } from "./UICommandHandlers";

/**
 * Manages VS Code commands for the PostgreSQL extension.
 * Orchestrates command registration, error handling, and delegates to specialized handlers.
 */
export class CommandManager {
	private context: vscode.ExtensionContext;
	private extension: PostgreSqlExtension;
	private components: ExtensionComponents;
	private commandRegistry: CommandRegistry;
	private errorHandler: CommandErrorHandler;
	private commandHandlers: CommandHandlers;
	private sqlFileHandlers: SQLFileHandlers;
	private uiCommandHandlers: UICommandHandlers;
	private queryCommandHandlers: QueryCommandHandlers;
	private additionalCommandHandlers: AdditionalCommandHandlers;

	constructor(context: vscode.ExtensionContext, extension: PostgreSqlExtension, components: ExtensionComponents) {
		this.context = context;
		this.extension = extension;
		this.components = components;

		// Initialize managers
		const migrationManager = new MigrationManagement(this.components.queryExecutionService!, new ValidationFramework());
		const schemaOperations = new SchemaOperations(this.components.connectionManager);

		// Initialize specialized handlers
		this.commandRegistry = new CommandRegistry();
		this.errorHandler = new CommandErrorHandler();
		this.commandHandlers = new CommandHandlers(extension, components, migrationManager, schemaOperations);
		this.sqlFileHandlers = new SQLFileHandlers(components);
		this.uiCommandHandlers = new UICommandHandlers(components);
		this.queryCommandHandlers = new QueryCommandHandlers(components);
		this.additionalCommandHandlers = new AdditionalCommandHandlers(components);
	}
	/**
	 * Registers all VS Code commands for the PostgreSQL extension.
	 * @returns Array of disposables for cleanup.
	 */
	registerCommands(): vscode.Disposable[] {
		const startTime = Date.now();
		const commandRegistrationTimes: Record<string, number> = {};
		const diagnosticLogger = DiagnosticLogger.getInstance();

		// Start command registration monitoring
		const commandRegistrationOperationId = diagnosticLogger.startOperation("CommandRegistration", {
			architecture: "modular",
		});

		try {
			Logger.info("Registering PostgreSQL extension commands", "CommandManager");

			const disposables: vscode.Disposable[] = [];

			const coreStart = Date.now();
			this.registerCoreCommands(disposables);
			commandRegistrationTimes.registerCoreCommands = Date.now() - coreStart;

			const queryStart = Date.now();
			this.registerQueryCommands(disposables);
			commandRegistrationTimes.registerQueryCommands = Date.now() - queryStart;

			const sqlStart = Date.now();
			this.registerSQLFileCommands(disposables);
			commandRegistrationTimes.registerSQLFileCommands = Date.now() - sqlStart;

			// Start command health monitoring
			const monitoringStart = Date.now();
			this.errorHandler.startCommandMonitoring();
			commandRegistrationTimes.startCommandMonitoring = Date.now() - monitoringStart;

			const totalDuration = Date.now() - startTime;

			// Complete command registration monitoring
			diagnosticLogger.endOperation(commandRegistrationOperationId, {
				totalDuration,
				registeredCommands: this.commandRegistry.getRegisteredCommandCount(),
				commandRegistrationTimes,
				disposablesCount: disposables.length,
			});

			Logger.info("All PostgreSQL extension commands registered successfully", "CommandManager", {
				totalDuration: `${totalDuration}ms`,
				registeredCommands: this.commandRegistry.getRegisteredCommandCount(),
				commandRegistrationTimes,
			});

			// Warn about slow command registration
			const slowRegistrations = Object.entries(commandRegistrationTimes)
				.filter(([, duration]) => duration > 1000)
				.map(([name, duration]) => `${name}: ${duration}ms`);

			if (slowRegistrations.length > 0) {
				Logger.warn("Slow command registration detected", "CommandManager", {
					slowRegistrations,
					totalDuration,
				});
			}

			return disposables;
		} catch (error) {
			const totalDuration = Date.now() - startTime;
			diagnosticLogger.failOperation(commandRegistrationOperationId, error as Error, {
				totalDuration,
				partialRegistrationTimes: commandRegistrationTimes,
			});

			Logger.error("Failed to register commands", error as Error, "CommandManager", {
				failedAfterDuration: `${totalDuration}ms`,
				partialRegistrationTimes: commandRegistrationTimes,
			});
			throw error;
		}
	}

	/**
	 * Registers core commands for database operations.
	 * @param disposables Array to collect disposables for cleanup.
	 */
	private registerCoreCommands(disposables: vscode.Disposable[]): void {
		const coreCommands = [
			{
				command: "postgresql.addConnection",
				handler: async () => {
					if (this.components.connectionManager) {
						// Use connection management view for adding connections
						const { ConnectionManagementView } = await import("@/views/legacy/ConnectionManagementView");
						const connectionView = new ConnectionManagementView(this.components.connectionManager);
						await connectionView.showConnectionDialog();
					} else {
						vscode.window.showErrorMessage("Connection manager not available");
					}
				},
				description: "Add a new database connection",
			},
			{
				command: "postgresql.editConnection",
				handler: (connection?: DatabaseConnection) => this.commandHandlers.handleEditConnection(connection),
				description: "Edit an existing database connection",
			},
			{
				command: "postgresql.testConnection",
				handler: (connection?: DatabaseConnection) => this.commandHandlers.handleTestConnection(connection),
				description: "Test database connection",
			},
			{
				command: "postgresql.executeMigration",
				handler: (migration?: any) => this.commandHandlers.handleExecuteMigration(migration),
				description: "Execute database migration",
			},
			{
				command: "postgresql.removeConnection",
				handler: (connection?: DatabaseConnection) => this.commandHandlers.handleRemoveConnection(connection),
				description: "Remove database connection",
			},
			{
				command: "postgresql.refreshExplorer",
				handler: () => this.commandHandlers.handleRefreshExplorer(),
				description: "Refresh database explorer",
			},
			{
				command: "postgresql.browseSchema",
				handler: (connectionId?: string, schemaName?: string) =>
					this.commandHandlers.handleBrowseSchema(connectionId, schemaName),
				description: "Browse database schema",
			},
			{
				command: "postgresql.compareSchemas",
				handler: (source?: DatabaseConnection, target?: DatabaseConnection) =>
					this.commandHandlers.handleCompareSchemas(source, target),
				description: "Compare database schemas",
			},
			{
				command: "postgresql.generateMigration",
				handler: (comparison?: any) => this.commandHandlers.handleGenerateMigration(comparison),
				description: "Generate migration script",
			},
			{
				command: "postgresql.previewMigration",
				handler: (migration?: any) => this.commandHandlers.handlePreviewMigration(migration),
				description: "Preview migration script",
			},
			{
				command: "postgresql.viewObjectDetails",
				handler: (databaseObject?: any) => this.commandHandlers.handleViewObjectDetails(databaseObject),
				description: "View database object details",
			},
			{
				command: "postgresql.showCommandStats",
				handler: () => this.errorHandler.showCommandStats(),
				description: "Show command execution statistics",
			},
			{
				command: "postgresql.clearCommandErrors",
				handler: () => this.errorHandler.clearCommandErrors(),
				description: "Clear command error history",
			},
		];

		coreCommands.forEach(({ command, handler, description }) => {
			this.commandRegistry.registerCommand(command, handler, description);
		});

		// Register UI-specific commands
		this.registerUICommands(disposables);

		// Register additional commands
		this.registerAdditionalCommands(disposables);

		// Register manage connections command
		this.registerManageConnectionsCommand(disposables);

		// Add all registry disposables
		disposables.push(...this.commandRegistry.getDisposables());
	}

	/**
	 * Registers additional utility commands.
	 * @param disposables Array to collect disposables for cleanup.
	 */
	private registerAdditionalCommands(disposables: vscode.Disposable[]): void {
		this.commandRegistry.registerCommand("postgresql.showHelp", () => this.additionalCommandHandlers.showHelp());
		this.commandRegistry.registerCommand("postgresql.openSettings", () =>
			this.additionalCommandHandlers.openSettings(),
		);
	}

	/**
	 * Registers the manage connections command.
	 * @param disposables Array to collect disposables for cleanup.
	 */
	private registerManageConnectionsCommand(disposables: vscode.Disposable[]): void {
		this.commandRegistry.registerCommand("postgresql.manageConnections", () =>
			this.additionalCommandHandlers.manageConnections(),
		);
	}
	/**
	 * Registers UI-specific commands.
	 * @param disposables Array to collect disposables for cleanup.
	 */
	private registerUICommands(disposables: vscode.Disposable[]): void {
		this.commandRegistry.registerCommand("postgresql.showDashboard", () => this.uiCommandHandlers.showDashboard());
		this.commandRegistry.registerCommand("postgresql.showNotifications", () =>
			this.uiCommandHandlers.showNotifications(),
		);
		this.commandRegistry.registerCommand("postgresql.showActiveOperations", () =>
			this.uiCommandHandlers.showActiveOperations(),
		);
		this.commandRegistry.registerCommand("postgresql.showSchemaDriftReport", (comparisonId?: string) =>
			this.uiCommandHandlers.showSchemaDriftReport(comparisonId),
		);
		this.commandRegistry.registerCommand("postgresql.showQueryAnalytics", () =>
			this.uiCommandHandlers.showQueryAnalytics(),
		);
		this.commandRegistry.registerCommand("postgresql.quickConnect", () => this.uiCommandHandlers.handleQuickConnect());
	}
	/**
	 * Registers query-related commands.
	 * @param disposables Array to collect disposables for cleanup.
	 */
	private registerQueryCommands(disposables: vscode.Disposable[]): void {
		this.commandRegistry.registerCommand("postgresql.openQueryEditor", (connection) =>
			this.queryCommandHandlers.openQueryEditor(connection),
		);
		this.commandRegistry.registerCommand("postgresql.executeQuery", () => this.queryCommandHandlers.executeQuery());
	}
	/**
	 * Registers SQL file-related commands.
	 * @param disposables Array to collect disposables for cleanup.
	 */
	private registerSQLFileCommands(disposables: vscode.Disposable[]): void {
		this.commandRegistry.registerCommand("postgresql.executeCurrentFile", () =>
			this.sqlFileHandlers.executeCurrentSQLFile(),
		);
		this.commandRegistry.registerCommand("postgresql.formatCurrentFile", () =>
			this.sqlFileHandlers.formatCurrentSQLFile(),
		);
	}
	/**
	 * Disposes of the CommandManager and cleans up resources.
	 */
	dispose(): void {
		Logger.info("Disposing CommandManager", "CommandManager");
		this.errorHandler.dispose();
		this.commandRegistry.dispose();
		Logger.info("CommandManager disposed successfully", "CommandManager");
	}
}
