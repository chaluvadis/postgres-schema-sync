import * as vscode from "vscode";
import { PostgreSqlConnectionManager } from "@/core/PostgreSqlConnectionManager";
import { ValidationFramework } from "@/core/ValidationFramework";
import { EnhancedStatusBarProvider } from "@/providers/EnhancedStatusBarProvider";
import { PostgreSqlTreeProvider } from "@/providers/PostgreSqlTreeProvider";
import { DataImportService } from "@/services/DataImportService";
import { PerformanceAlertSystem } from "@/services/PerformanceAlertSystem";
import { PerformanceMonitorService } from "@/services/PerformanceMonitorService";
import { QueryExecutionService } from "@/services/QueryExecutionService";
import { ReportingService } from "@/services/ReportingService";
import { Logger } from "@/utils/Logger";
import { ConnectionManagementView } from "@/views/legacy/ConnectionManagementView";
import { DashboardView } from "@/views/legacy/DashboardView";
import { DriftReportView } from "@/views/legacy/DriftReportView";
import { ErrorDisplayView } from "@/views/legacy/ErrorDisplayView";
import { ImportWizardView } from "@/views/legacy/ImportWizardView";
import { MigrationPreviewView } from "@/views/legacy/MigrationPreviewView";
import { NotificationManager } from "@/views/legacy/NotificationManager";
import { QueryAnalyticsView } from "@/views/legacy/QueryAnalyticsView";
import { QueryEditorView } from "@/views/legacy/QueryEditorView";
import { SchemaBrowserView } from "@/views/legacy/SchemaBrowserView";
import { SchemaComparisonView } from "@/views/legacy/SchemaComparisonView";
import { SettingsView } from "@/views/legacy/SettingsView";
import { ConnectionManager } from "../managers/ConnectionManager";
import { ModularSchemaManager } from "../managers/schema";

export interface ExtensionComponents {
	connectionManager: ConnectionManager;
	schemaManager: ModularSchemaManager;
	treeProvider: PostgreSqlTreeProvider;
	treeView?: vscode.TreeView<any>;
	enhancedStatusBarProvider?: EnhancedStatusBarProvider;
	dashboardView?: DashboardView;
	connectionView?: ConnectionManagementView;
	schemaBrowserView?: SchemaBrowserView;
	schemaComparisonView?: SchemaComparisonView;
	migrationPreviewView?: MigrationPreviewView;
	settingsView?: SettingsView;
	errorDisplayView?: ErrorDisplayView;
	notificationManager?: NotificationManager;
	queryExecutionService?: QueryExecutionService;
	queryEditorView?: QueryEditorView;
	performanceMonitorService?: PerformanceMonitorService;
	performanceAlertSystem?: PerformanceAlertSystem;
	dataImportService?: DataImportService;
	importWizardView?: ImportWizardView;
	queryAnalyticsView?: QueryAnalyticsView;
	advancedMigrationPreviewView?: any;
	enhancedTreeProvider?: any;
	reportingService?: ReportingService;
	driftReportView?: DriftReportView;
}

export class ExtensionInitializer {
	private static dotNetService: PostgreSqlConnectionManager;
	static async initializeDotNetService(): Promise<boolean> {
		try {
			Logger.info("Initializing .NET integration service");

			this.dotNetService = PostgreSqlConnectionManager.getInstance();
			// Native service doesn't need initialization
			const initialized = true;

			if (initialized) {
				Logger.info(".NET integration service initialized successfully");
				return true;
			} else {
				Logger.warn(".NET integration service initialization failed");
				return false;
			}
		} catch (error) {
			Logger.error("Failed to initialize .NET integration service", error as Error);
			return false;
		}
	}
	static initializeCoreComponents(context: vscode.ExtensionContext): ExtensionComponents {
		try {
			Logger.info("Initializing core extension components", "initializeCoreComponents");

			// Initialize core managers
			Logger.debug("Creating ConnectionManager instance", "initializeCoreComponents");
			const connectionManager = new ConnectionManager(context);
			Logger.debug("ConnectionManager created", "initializeCoreComponents");

			Logger.debug("Creating QueryExecutionService instance", "initializeCoreComponents");
			const queryExecutionService = new QueryExecutionService(connectionManager);
			Logger.debug("QueryExecutionService created", "initializeCoreComponents");

			Logger.debug("Creating ValidationFramework instance", "initializeCoreComponents");
			const validationFramework = new ValidationFramework();
			Logger.debug("ValidationFramework created", "initializeCoreComponents");

			Logger.debug("Creating ModularSchemaManager instance", "initializeCoreComponents");
			const schemaManager = new ModularSchemaManager(connectionManager, queryExecutionService, validationFramework);
			Logger.debug("ModularSchemaManager created", "initializeCoreComponents");

			Logger.debug("Creating PostgreSqlTreeProvider instance", "initializeCoreComponents");
			const treeProvider = new PostgreSqlTreeProvider(connectionManager, schemaManager);
			Logger.debug("PostgreSqlTreeProvider created", "initializeCoreComponents");

			const components: ExtensionComponents = {
				connectionManager,
				schemaManager,
				treeProvider,
			};

			Logger.info("Core extension components initialized successfully", "initializeCoreComponents", {
				componentsCount: Object.keys(components).length,
			});
			return components;
		} catch (error) {
			Logger.error("Failed to initialize core extension components", error as Error, "initializeCoreComponents");
			throw error;
		}
	}
	static initializeOptionalComponents(
		coreComponents: ExtensionComponents,
		context: vscode.ExtensionContext,
	): ExtensionComponents {
		try {
			Logger.info("Initializing optional UI components", "initializeOptionalComponents");

			// Initialize optional components
			Logger.debug("Creating NotificationManager instance", "initializeOptionalComponents");
			const notificationManager = NotificationManager.getInstance();

			Logger.debug("Creating EnhancedStatusBarProvider instance", "initializeOptionalComponents");
			const enhancedStatusBarProvider = EnhancedStatusBarProvider.getInstance(
				coreComponents.connectionManager,
				notificationManager,
			);

			Logger.debug("Creating DashboardView instance", "initializeOptionalComponents");
			const dashboardView = new DashboardView(coreComponents.connectionManager, coreComponents.schemaManager);

			Logger.debug("Creating ConnectionManagementView instance", "initializeOptionalComponents");
			const connectionView = new ConnectionManagementView(coreComponents.connectionManager);

			Logger.debug("Creating SchemaBrowserView instance", "initializeOptionalComponents");
			const schemaBrowserView = new SchemaBrowserView(coreComponents.schemaManager, coreComponents.connectionManager);

			Logger.debug("Creating SchemaComparisonView instance", "initializeOptionalComponents");
			const schemaComparisonView = new SchemaComparisonView(coreComponents.connectionManager);

			Logger.debug("Creating MigrationPreviewView instance", "initializeOptionalComponents");
			const migrationPreviewView = new MigrationPreviewView();

			Logger.debug("Creating SettingsView instance", "initializeOptionalComponents");
			const settingsView = new SettingsView();

			Logger.debug("Creating ErrorDisplayView instance", "initializeOptionalComponents");
			const errorDisplayView = new ErrorDisplayView();

			Logger.debug("Creating QueryExecutionService instance", "initializeOptionalComponents");
			const queryExecutionService = new QueryExecutionService(coreComponents.connectionManager);

			Logger.debug("Creating QueryEditorView instance", "initializeOptionalComponents");
			const queryEditorView = new QueryEditorView(coreComponents.connectionManager, queryExecutionService);

			Logger.debug("Creating PerformanceMonitorService instance", "initializeOptionalComponents");
			const performanceMonitorService = PerformanceMonitorService.getInstance();

			Logger.debug("Creating PerformanceAlertSystem instance", "initializeOptionalComponents");
			const performanceAlertSystem = PerformanceAlertSystem.getInstance(context, performanceMonitorService);

			Logger.debug("Creating DataImportService instance", "initializeOptionalComponents");
			const dataImportService = new DataImportService(context, coreComponents.connectionManager);

			Logger.debug("Creating QueryAnalyticsView instance", "initializeOptionalComponents");
			const queryAnalyticsView = new QueryAnalyticsView(context, performanceMonitorService);

			Logger.debug("Creating ReportingService instance", "initializeOptionalComponents");
			const reportingService = new ReportingService(context);

			Logger.debug("Creating DriftReportView instance", "initializeOptionalComponents");
			const driftReportView = new DriftReportView(context, reportingService);

			// Create import wizard view conditionally
			let importWizardView: ImportWizardView | undefined;
			if (coreComponents.dataImportService) {
				Logger.debug("Creating ImportWizardView instance", "initializeOptionalComponents");
				importWizardView = new ImportWizardView(coreComponents.dataImportService, coreComponents.connectionManager);
			} else {
				Logger.debug(
					"Skipping ImportWizardView creation - no dataImportService available",
					"initializeOptionalComponents",
				);
			}

			// Add optional components to the core components
			const components: ExtensionComponents = {
				...coreComponents,
				enhancedStatusBarProvider,
				dashboardView,
				connectionView,
				schemaBrowserView,
				schemaComparisonView,
				migrationPreviewView,
				settingsView,
				errorDisplayView,
				notificationManager,
				queryExecutionService,
				queryEditorView,
				performanceMonitorService,
				performanceAlertSystem,
				dataImportService,
				importWizardView,
				queryAnalyticsView,
				reportingService,
				driftReportView,
			};

			Logger.info("Optional UI components initialized successfully", "initializeOptionalComponents", {
				totalComponents: Object.keys(components).length,
				optionalComponentsCount: Object.keys(components).length - Object.keys(coreComponents).length,
			});
			return components;
		} catch (error) {
			Logger.error("Failed to initialize optional UI components", error as Error, "initializeOptionalComponents");
			// Return core components even if optional components fail
			return coreComponents;
		}
	}
	static registerTreeView(
		treeProvider: PostgreSqlTreeProvider,
		context: vscode.ExtensionContext,
	): vscode.TreeView<any> {
		try {
			Logger.info("Registering PostgreSQL tree view");
			const treeView = vscode.window.createTreeView("postgresqlExplorer", {
				treeDataProvider: treeProvider,
				showCollapseAll: true,
				canSelectMany: false,
			});
			context.subscriptions.push(treeView);
			Logger.info("PostgreSQL tree view registered successfully");
			return treeView;
		} catch (error) {
			Logger.error("Failed to register tree view", error as Error);
			throw error;
		}
	}
	static initializeComponent<T>(componentName: string, factory: () => T, required: boolean = false): T | undefined {
		try {
			Logger.debug(`Initializing component: ${componentName}`);

			const component = factory();

			Logger.debug(`Component ${componentName} initialized successfully`);
			return component;
		} catch (error) {
			const errorMessage = `Failed to initialize component ${componentName}`;
			Logger.error(errorMessage, error as Error);

			if (required) {
				throw new Error(`${errorMessage}: ${(error as Error).message}`);
			} else {
				Logger.warn(`Component ${componentName} is not required, continuing without it`);
				return undefined;
			}
		}
	}
	static getDotNetService(): PostgreSqlConnectionManager {
		if (!this.dotNetService) {
			throw new Error(".NET integration service not initialized");
		}
		return this.dotNetService;
	}
	static getStatusBarProvider(): EnhancedStatusBarProvider {
		return EnhancedStatusBarProvider.getCurrentInstance();
	}
}
