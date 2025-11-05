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
			Logger.info("Initializing core extension components");

			// Initialize core managers
			const connectionManager = new ConnectionManager(context);
			const queryExecutionService = new QueryExecutionService(connectionManager);
			const validationFramework = new ValidationFramework();
			const schemaManager = new ModularSchemaManager(connectionManager, queryExecutionService, validationFramework);

			const treeProvider = new PostgreSqlTreeProvider(connectionManager, schemaManager);

			const components: ExtensionComponents = {
				connectionManager,
				schemaManager,
				treeProvider,
			};

			Logger.info("Core extension components initialized successfully");
			return components;
		} catch (error) {
			Logger.error("Failed to initialize core extension components", error as Error);
			throw error;
		}
	}
	static initializeOptionalComponents(
		coreComponents: ExtensionComponents,
		context: vscode.ExtensionContext,
	): ExtensionComponents {
		try {
			Logger.info("Initializing optional UI components");

			// Initialize optional components
			const notificationManager = NotificationManager.getInstance();
			const enhancedStatusBarProvider = EnhancedStatusBarProvider.getInstance(
				coreComponents.connectionManager,
				notificationManager,
			);
			const dashboardView = new DashboardView(coreComponents.connectionManager, coreComponents.schemaManager);
			const connectionView = new ConnectionManagementView(coreComponents.connectionManager);
			const schemaBrowserView = new SchemaBrowserView(coreComponents.schemaManager, coreComponents.connectionManager);
			const schemaComparisonView = new SchemaComparisonView(coreComponents.connectionManager);
			const migrationPreviewView = new MigrationPreviewView();
			const settingsView = new SettingsView();
			const errorDisplayView = new ErrorDisplayView();
			const queryExecutionService = new QueryExecutionService(coreComponents.connectionManager);
			const queryEditorView = new QueryEditorView(coreComponents.connectionManager, queryExecutionService);
			const performanceMonitorService = PerformanceMonitorService.getInstance();
			const performanceAlertSystem = PerformanceAlertSystem.getInstance(context, performanceMonitorService);
			const dataImportService = new DataImportService(context, coreComponents.connectionManager);
			const queryAnalyticsView = new QueryAnalyticsView(context, performanceMonitorService);
			const importWizardView = coreComponents.dataImportService
				? new ImportWizardView(coreComponents.dataImportService, coreComponents.connectionManager)
				: undefined;
			const reportingService = new ReportingService(context);
			const driftReportView = new DriftReportView(context, reportingService);

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

			Logger.info("Optional UI components initialized successfully");
			return components;
		} catch (error) {
			Logger.error("Failed to initialize optional UI components", error as Error);
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
