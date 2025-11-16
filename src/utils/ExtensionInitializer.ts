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
	static initializeCoreComponents(context: vscode.ExtensionContext): ExtensionComponents {
		try {
			Logger.info("🔄 Initializing core extension components", "initializeCoreComponents");

			// Initialize core managers
			Logger.debug("Creating ConnectionManager instance", "initializeCoreComponents");
			const connectionManager = new ConnectionManager(context);
			Logger.debug("✅ ConnectionManager created", "initializeCoreComponents");

			Logger.debug("Creating QueryExecutionService instance", "initializeCoreComponents");
			const queryExecutionService = new QueryExecutionService(connectionManager);
			Logger.debug("✅ QueryExecutionService created", "initializeCoreComponents");

			Logger.debug("Creating ValidationFramework instance", "initializeCoreComponents");
			const validationFramework = new ValidationFramework();
			Logger.debug("✅ ValidationFramework created", "initializeCoreComponents");

			Logger.debug("Creating ModularSchemaManager instance", "initializeCoreComponents");
			const schemaManager = new ModularSchemaManager(connectionManager, queryExecutionService, validationFramework);
			Logger.debug("✅ ModularSchemaManager created", "initializeCoreComponents");

			Logger.debug("Creating PostgreSqlTreeProvider instance", "initializeCoreComponents");
			const treeProvider = new PostgreSqlTreeProvider(connectionManager, schemaManager);
			Logger.debug("✅ PostgreSqlTreeProvider created", "initializeCoreComponents");

			const components: ExtensionComponents = {
				connectionManager,
				schemaManager,
				treeProvider,
			};

			Logger.info("✅ Core extension components initialized successfully", "initializeCoreComponents", {
				componentsCount: Object.keys(components).length,
			});
			return components;
		} catch (error) {
			Logger.error("❌ Failed to initialize core extension components", error as Error, "initializeCoreComponents");
			throw error;
		}
	}
	static async initializeOptionalComponents(
		coreComponents: ExtensionComponents,
		context: vscode.ExtensionContext,
	): Promise<ExtensionComponents> {
		const startTime = Date.now();
		const componentTimings: Record<string, number> = {};

		try {
			Logger.info("🔄 Initializing optional UI components in parallel", "initializeOptionalComponents");

			// PHASE 1: Independent components that don't depend on other optional components
			const phase1Start = Date.now();
			const [
				notificationManager,
				performanceMonitorService,
				reportingService,
				migrationPreviewView,
				settingsView,
				errorDisplayView,
			] = await Promise.all([
				(async () => {
					const t0 = Date.now();
					const comp = NotificationManager.getInstance();
					componentTimings.NotificationManager = Date.now() - t0;
					return comp;
				})(),
				(async () => {
					const t0 = Date.now();
					const comp = PerformanceMonitorService.getInstance();
					componentTimings.PerformanceMonitorService = Date.now() - t0;
					return comp;
				})(),
				(async () => {
					const t0 = Date.now();
					const comp = new ReportingService(context);
					componentTimings.ReportingService = Date.now() - t0;
					return comp;
				})(),
				(async () => {
					const t0 = Date.now();
					const comp = new MigrationPreviewView();
					componentTimings.MigrationPreviewView = Date.now() - t0;
					return comp;
				})(),
				(async () => {
					const t0 = Date.now();
					const comp = new SettingsView();
					componentTimings.SettingsView = Date.now() - t0;
					return comp;
				})(),
				(async () => {
					const t0 = Date.now();
					const comp = new ErrorDisplayView();
					componentTimings.ErrorDisplayView = Date.now() - t0;
					return comp;
				})(),
			]);
			componentTimings.Phase1 = Date.now() - phase1Start;

			// PHASE 2: Components that depend on Phase 1 components
			const phase2Start = Date.now();
			const [
				enhancedStatusBarProvider,
				connectionView,
				schemaComparisonView,
				queryExecutionService,
				dataImportService,
				driftReportView,
			] = await Promise.all([
				(async () => {
					const t0 = Date.now();
					const comp = EnhancedStatusBarProvider.getInstance(coreComponents.connectionManager, notificationManager);
					componentTimings.EnhancedStatusBarProvider = Date.now() - t0;
					return comp;
				})(),
				(async () => {
					const t0 = Date.now();
					const comp = new ConnectionManagementView(coreComponents.connectionManager);
					componentTimings.ConnectionManagementView = Date.now() - t0;
					return comp;
				})(),
				(async () => {
					const t0 = Date.now();
					const comp = new SchemaComparisonView(coreComponents.connectionManager);
					componentTimings.SchemaComparisonView = Date.now() - t0;
					return comp;
				})(),
				(async () => {
					const t0 = Date.now();
					const comp = new QueryExecutionService(coreComponents.connectionManager);
					componentTimings.QueryExecutionService = Date.now() - t0;
					return comp;
				})(),
				(async () => {
					const t0 = Date.now();
					const comp = new DataImportService(context, coreComponents.connectionManager);
					componentTimings.DataImportService = Date.now() - t0;
					return comp;
				})(),
				(async () => {
					const t0 = Date.now();
					const comp = new DriftReportView(context, reportingService);
					componentTimings.DriftReportView = Date.now() - t0;
					return comp;
				})(),
			]);
			componentTimings.Phase2 = Date.now() - phase2Start;

			// PHASE 3: Components that depend on QueryExecutionService (lazy-loaded)
			const phase3Start = Date.now();
			const [queryEditorView, performanceAlertSystem, queryAnalyticsView] = await Promise.all([
				(async () => {
					const t0 = Date.now();
					const comp = new QueryEditorView(coreComponents.connectionManager, queryExecutionService);
					componentTimings.QueryEditorView = Date.now() - t0;
					return comp;
				})(),
				(async () => {
					const t0 = Date.now();
					const comp = PerformanceAlertSystem.getInstance(context, performanceMonitorService);
					componentTimings.PerformanceAlertSystem = Date.now() - t0;
					return comp;
				})(),
				(async () => {
					const t0 = Date.now();
					const comp = new QueryAnalyticsView(context, performanceMonitorService);
					componentTimings.QueryAnalyticsView = Date.now() - t0;
					return comp;
				})(),
			]);
			componentTimings.Phase3 = Date.now() - phase3Start;

			// PHASE 4: Components that depend on other Phase 2/3 components (lazy-loaded)
			const phase4Start = Date.now();
			const [dashboardView, schemaBrowserView, importWizardViewInstance] = await Promise.all([
				(async () => {
					const t0 = Date.now();
					const comp = new DashboardView(coreComponents.connectionManager, coreComponents.schemaManager);
					componentTimings.DashboardView = Date.now() - t0;
					return comp;
				})(),
				(async () => {
					const t0 = Date.now();
					const comp = new SchemaBrowserView(coreComponents.schemaManager, coreComponents.connectionManager);
					componentTimings.SchemaBrowserView = Date.now() - t0;
					return comp;
				})(),
				(async () => {
					const t0 = Date.now();
					const comp = dataImportService
						? new ImportWizardView(dataImportService, coreComponents.connectionManager)
						: undefined;
					componentTimings.ImportWizardView = Date.now() - t0;
					return comp;
				})(),
			]);
			componentTimings.Phase4 = Date.now() - phase4Start;

			// Use the lazy-loaded import wizard view
			let importWizardView: ImportWizardView | undefined = importWizardViewInstance;

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

			const totalDuration = Date.now() - startTime;

			// Log timing summary for performance analysis
			const slowComponents = Object.entries(componentTimings)
				.filter(([, duration]) => duration > 1000)
				.sort(([, a], [, b]) => b - a);

			Logger.info("Optional UI components initialization performance summary", "initializeOptionalComponents", {
				totalDuration: `${totalDuration}ms`,
				componentCount: Object.keys(componentTimings).length,
				slowComponents: slowComponents.map(([name, duration]) => `${name}: ${duration}ms`),
				averageComponentTime: `${Math.round(Object.values(componentTimings).reduce((a, b) => a + b, 0) / Object.keys(componentTimings).length)}ms`,
			});

			// Warn about slow components
			if (slowComponents.length > 0) {
				Logger.warn("Slow component initialization detected", "initializeOptionalComponents", {
					slowComponents: slowComponents.map(([name, duration]) => `${name} took ${duration}ms`),
					totalSlowTime: slowComponents.reduce((sum, [, duration]) => sum + duration, 0),
				});
			}

			Logger.info("✅ Optional UI components initialized successfully", "initializeOptionalComponents", {
				totalDuration: `${totalDuration}ms`,
				totalComponents: Object.keys(components).length,
				optionalComponentsCount: Object.keys(components).length - Object.keys(coreComponents).length,
			});
			return components;
		} catch (error) {
			const totalDuration = Date.now() - startTime;
			Logger.error("❌ Failed to initialize optional UI components", error as Error, "initializeOptionalComponents", {
				failedAfterDuration: `${totalDuration}ms`,
				partialComponentTimings: componentTimings,
			});
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
	static getStatusBarProvider(): EnhancedStatusBarProvider {
		return EnhancedStatusBarProvider.getCurrentInstance();
	}
}
