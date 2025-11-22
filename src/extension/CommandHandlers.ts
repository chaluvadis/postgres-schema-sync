import * as vscode from "vscode";
import { DatabaseConnection } from "@/managers/ConnectionManager";
import { MigrationManagement } from "@/managers/schema/MigrationManagement";
import { DetailedSchemaComparisonResult, SchemaComparisonOptions } from "@/managers/schema/SchemaComparison";
import { SchemaOperations } from "@/managers/schema/SchemaOperations";
import { ExtensionComponents } from "@/utils/ExtensionInitializer";
import { Logger } from "@/utils/Logger";
import { PostgreSqlExtension } from "../PostgreSqlExtension";
import { CommandErrorHandler } from "./CommandErrorHandler";

/**
 * Contains all command handler implementations for the PostgreSQL extension.
 * Each handler method corresponds to a specific VS Code command.
 */
export class CommandHandlers {
	private extension: PostgreSqlExtension;
	private components: ExtensionComponents;
	private migrationManager: MigrationManagement;
	private schemaOperations: SchemaOperations;

	constructor(
		extension: PostgreSqlExtension,
		components: ExtensionComponents,
		migrationManager: MigrationManagement,
		schemaOperations: SchemaOperations,
	) {
		this.extension = extension;
		this.components = components;
		this.migrationManager = migrationManager;
		this.schemaOperations = schemaOperations;
	}

	// Connection Management Handlers

	/**
	 * Handles editing a database connection.
	 * @param connection The connection to edit.
	 */
	async handleEditConnection(connection?: DatabaseConnection): Promise<void> {
		if (!connection) {
			vscode.window.showErrorMessage("No connection provided for editing");
			return;
		}

		await this.extension.editConnection(connection);
	}

	/**
	 * Handles testing a database connection.
	 * @param connection The connection to test.
	 */
	async handleTestConnection(connection?: DatabaseConnection): Promise<void> {
		if (!connection) {
			vscode.window.showErrorMessage("No connection provided for testing");
			return;
		}

		await this.extension.testConnection(connection);
	}

	/**
	 * Handles executing a database migration.
	 * @param migration The migration to execute.
	 */
	async handleExecuteMigration(migration?: any): Promise<void> {
		if (!migration) {
			vscode.window.showErrorMessage("No migration provided for execution");
			return;
		}

		await this.extension.executeMigration(migration);
	}

	/**
	 * Handles removing a database connection.
	 * @param connection The connection to remove.
	 */
	async handleRemoveConnection(connection?: DatabaseConnection): Promise<void> {
		try {
			if (!connection) {
				Logger.warn("No connection provided for removal", "CommandHandlers");
				vscode.window.showErrorMessage("No connection provided for removal");
				return;
			}

			if (this.components.connectionManager) {
				const confirm = await vscode.window.showWarningMessage(
					`Are you sure you want to remove connection "${connection.name}"?`,
					"Remove",
					"Cancel",
				);

				if (confirm === "Remove") {
					await this.components.connectionManager.removeConnection(connection.id);

					if (this.components.treeProvider) {
						this.components.treeProvider.refresh();
						Logger.info("Tree view refreshed after connection removal", "CommandHandlers");
					} else {
						Logger.warn("Tree provider not available for refresh after connection removal", "CommandHandlers");
					}

					Logger.info("Connection removed successfully", "CommandHandlers", {
						connectionId: connection.id,
					});
					vscode.window.showInformationMessage(`Connection "${connection.name}" removed successfully`);
				}
			} else {
				Logger.warn("Connection manager not available", "CommandHandlers");
				vscode.window.showErrorMessage("Connection manager not available");
			}
		} catch (error) {
			Logger.error("Failed to remove connection", error as Error, "CommandHandlers");
			vscode.window.showErrorMessage(`Failed to remove connection: ${(error as Error).message}`);
		}
	}

	/**
	 * Handles refreshing the database explorer.
	 */
	async handleRefreshExplorer(): Promise<void> {
		try {
			if (this.components.treeProvider) {
				this.components.treeProvider.refresh();
				vscode.window.showInformationMessage("Database explorer refreshed");
				Logger.info("Database explorer refreshed successfully", "CommandHandlers");
			} else {
				Logger.warn("Tree provider not available for refresh", "CommandHandlers");
				vscode.window.showErrorMessage("Tree provider not available");
			}
		} catch (error) {
			Logger.error("Failed to refresh explorer", error as Error, "CommandHandlers");
			vscode.window.showErrorMessage(`Failed to refresh explorer: ${(error as Error).message}`);
		}
	}

	/**
	 * Handles browsing database schema.
	 * @param connectionId The connection ID.
	 * @param schemaName The schema name.
	 */
	async handleBrowseSchema(connectionId?: string, schemaName?: string): Promise<void> {
		try {
			if (!connectionId) {
				Logger.warn("Connection ID is required to browse schema", "CommandHandlers");
				vscode.window.showErrorMessage("Connection ID is required to browse schema");
				return;
			}

			if (this.components.schemaBrowserView) {
				await this.components.schemaBrowserView.showSchemaBrowser(connectionId, schemaName);
				Logger.info("Schema browser opened successfully", "CommandHandlers", {
					connectionId,
					schemaName,
				});
			} else {
				Logger.warn("Schema browser view not available", "CommandHandlers");
				vscode.window.showErrorMessage("Schema browser not available");
			}
		} catch (error) {
			Logger.error("Failed to browse schema", error as Error, "CommandHandlers");
			vscode.window.showErrorMessage(`Failed to browse schema: ${(error as Error).message}`);
		}
	}

	/**
	 * Handles comparing database schemas.
	 * @param source The source connection for comparison.
	 * @param target The target connection for comparison.
	 */
	async handleCompareSchemas(source?: DatabaseConnection, target?: DatabaseConnection): Promise<void> {
		let operationId: string | undefined;
		const statusProvider = this.components.enhancedStatusBarProvider;

		try {
			const connectionManager = this.components.connectionManager;
			const schemaManager = this.components.schemaManager;

			if (!connectionManager || !schemaManager) {
				vscode.window.showErrorMessage("Schema comparison services unavailable");
				return;
			}

			const availableConnections = connectionManager.getConnections();
			if (availableConnections.length < 2) {
				vscode.window.showErrorMessage("You need at least two connections to perform a schema comparison");
				return;
			}

			const resolveConnection = async (
				provided: any,
				placeholder: string,
				excludeId?: string,
			): Promise<DatabaseConnection | undefined> => {
				if (provided?.id) {
					return connectionManager.getConnection(provided.id);
				}

				const pickItems = availableConnections
					.filter((conn) => conn.id !== excludeId)
					.map((conn) => ({
						label: conn.name,
						description: `${conn.host}:${conn.port}/${conn.database}`,
						connection: conn,
					}));

				if (pickItems.length === 0) {
					return undefined;
				}

				const selection = await vscode.window.showQuickPick(pickItems, {
					placeHolder: placeholder,
				});
				return selection?.connection;
			};

			const sourceConnection = await resolveConnection(source, "Select source environment for schema comparison");
			if (!sourceConnection) {
				vscode.window.showWarningMessage("Schema comparison cancelled: source environment not selected");
				return;
			}

			const targetConnection = await resolveConnection(
				target,
				"Select target environment for schema comparison",
				sourceConnection.id,
			);
			if (!targetConnection) {
				vscode.window.showWarningMessage("Schema comparison cancelled: target environment not selected");
				return;
			}

			if (sourceConnection.id === targetConnection.id) {
				vscode.window.showErrorMessage("Select two different connections to run a schema comparison");
				return;
			}

			const notificationManager = this.components.notificationManager;
			const reportingService = this.components.reportingService;
			const driftReportView = this.components.driftReportView;

			operationId = `schema-compare-${Date.now()}`;
			statusProvider?.startOperation(operationId, `Schema drift: ${sourceConnection.name} → ${targetConnection.name}`, {
				message: "Collecting metadata",
				progress: 0,
			});

			const comparisonOptions: SchemaComparisonOptions = {
				mode: "strict",
				includeSystemObjects: false,
				ignoreSchemas: ["pg_catalog", "information_schema"],
			};

			let comparisonResult: DetailedSchemaComparisonResult | undefined;

			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: `Comparing ${sourceConnection.name} to ${targetConnection.name}`,
					cancellable: false,
				},
				async (progress) => {
					progress.report({ increment: 10, message: "Collecting metadata..." });
					if (operationId) {
						statusProvider?.updateOperation(operationId, "running", {
							progress: 10,
							message: "Collecting metadata",
						});
					}

					const start = Date.now();
					comparisonResult = await schemaManager.compareSchemasDetailed(
						sourceConnection.id,
						targetConnection.id,
						comparisonOptions,
					);
					const execTime = Date.now() - start;

					progress.report({
						increment: 70,
						message: "Analyzing differences...",
					});
					if (operationId) {
						statusProvider?.updateOperation(operationId, "running", {
							progress: 80,
							message: "Analyzing differences",
						});
					}

					if (comparisonResult) {
						comparisonResult.executionTime = comparisonResult.executionTime || execTime;
						comparisonResult.createdAt = comparisonResult.createdAt || new Date();
					}

					progress.report({ increment: 20, message: "Preparing report..." });
					if (operationId) {
						statusProvider?.updateOperation(operationId, "running", {
							progress: 95,
							message: "Preparing report",
						});
					}
				},
			);

			if (!comparisonResult) {
				throw new Error("Comparison did not return any result");
			}

			if (operationId) {
				statusProvider?.updateOperation(operationId, "completed", {
					progress: 100,
					message: "Schema comparison completed",
				});
			}

			let recordedEntryId: string | undefined;
			if (reportingService) {
				const recordedEntry = await reportingService.recordComparison(comparisonResult, {
					sourceConnectionId: sourceConnection.id,
					targetConnectionId: targetConnection.id,
					sourceName: sourceConnection.name,
					targetName: targetConnection.name,
				});
				recordedEntryId = recordedEntry.id;
			}

			const differenceCount = comparisonResult.differences?.length || 0;
			const detailMessage =
				differenceCount === 0
					? "No drift detected between the selected environments."
					: `${differenceCount} difference${differenceCount === 1 ? "" : "s"} detected.`;

			notificationManager?.showInformation("Schema comparison completed", detailMessage, "schema-comparison", {
				actions: recordedEntryId
					? [
							{
								id: "view-report",
								label: "View Drift Report",
								primary: true,
								action: () => {
									void vscode.commands.executeCommand("postgresql.showSchemaDriftReport", recordedEntryId);
								},
							},
						]
					: undefined,
				category: "Schema Drift",
			});

			const openReport = "View drift report";
			const userChoice = await vscode.window.showInformationMessage(
				`Schema comparison finished. ${detailMessage}`,
				openReport,
			);

			if (userChoice === openReport && driftReportView) {
				await driftReportView.showReport(recordedEntryId);
			}
		} catch (error) {
			Logger.error("Failed to compare schemas", error as Error, "CommandHandlers");
			vscode.window.showErrorMessage(`Failed to compare schemas: ${(error as Error).message}`);
		} finally {
			if (statusProvider && operationId) {
				statusProvider.completeOperation(operationId);
			}
		}
	}

	/**
	 * Handles generating a migration script from schema comparison.
	 * @param comparison The schema comparison result.
	 */
	async handleGenerateMigration(comparison?: any): Promise<void> {
		try {
			if (!comparison) {
				vscode.window.showErrorMessage("Schema comparison data is required for migration generation");
				return;
			}

			if (this.components.migrationPreviewView) {
				const enhancedScript = await this.migrationManager.generateEnhancedMigrationScript(
					comparison.sourceConnectionId,
					comparison.targetConnectionId,
					comparison.differences || [],
				);

				const migrationScript = {
					id: enhancedScript.id,
					sqlScript: enhancedScript.migrationSteps.map((step) => step.sqlScript).join(";\n"),
					rollbackScript: enhancedScript.rollbackScript.steps.map((step) => step.description).join(";\n") || undefined,
					description: enhancedScript.description,
					createdAt: enhancedScript.generatedAt.toISOString(),
				};

				await this.components.migrationPreviewView.showPreview(migrationScript);
				Logger.info("Migration script generated and preview shown with real-time validation", "CommandHandlers");
			} else {
				vscode.window.showErrorMessage("Migration preview view not available");
			}
		} catch (error) {
			Logger.error("Failed to generate migration", error as Error, "CommandHandlers");
			vscode.window.showErrorMessage(`Failed to generate migration: ${(error as Error).message}`);
		}
	}

	/**
	 * Handles previewing a migration script.
	 * @param migration The migration to preview.
	 */
	async handlePreviewMigration(migration?: any): Promise<void> {
		try {
			if (!migration) {
				vscode.window.showErrorMessage("Migration data is required for preview");
				return;
			}

			if (this.components.migrationPreviewView) {
				await this.components.migrationPreviewView.showPreview(migration);
				Logger.info("Migration preview displayed with real-time validation", "CommandHandlers");
			} else {
				vscode.window.showErrorMessage("Migration preview view not available");
			}
		} catch (error) {
			Logger.error("Failed to preview migration", error as Error, "CommandHandlers");
			vscode.window.showErrorMessage(`Failed to preview migration: ${(error as Error).message}`);
		}
	}
	async handleViewObjectDetails(databaseObject?: any): Promise<void> {
		try {
			if (!databaseObject) {
				vscode.window.showErrorMessage("Database object is required for viewing details");
				return;
			}

			if (this.components.schemaBrowserView) {
				const objectDetails = await this.schemaOperations.getObjectDetails(
					databaseObject.connectionId,
					databaseObject.type,
					databaseObject.schema,
					databaseObject.name,
				);
				await this.components.schemaBrowserView.showSchemaBrowser(databaseObject.connectionId, databaseObject.schema);
				Logger.info("Object details displayed with real-time metadata", "CommandHandlers", {
					object: databaseObject.name,
				});
			} else {
				vscode.window.showErrorMessage("Schema browser not available");
			}
		} catch (error) {
			Logger.error("Failed to view object details", error as Error, "CommandHandlers");
			vscode.window.showErrorMessage(`Failed to view object details: ${(error as Error).message}`);
		}
	}
}
