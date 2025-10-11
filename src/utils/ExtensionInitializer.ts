import * as vscode from 'vscode';
import { ConnectionManager } from '@/managers/ConnectionManager';
import { SchemaManager } from '@/managers/SchemaManager';
import { MigrationManager } from '@/managers/MigrationManager';
import { PostgreSqlTreeProvider } from '@/providers/PostgreSqlTreeProvider';
import { ActivityBarProvider } from '@/providers/ActivityBarProvider';
import { EnhancedStatusBarProvider } from '@/providers/EnhancedStatusBarProvider';
import { ConnectionManagementView } from '@/views/ConnectionManagementView';
import { SchemaBrowserView } from '@/views/SchemaBrowserView';
import { SchemaComparisonView } from '@/views/SchemaComparisonView';
import { MigrationPreviewView } from '@/views/MigrationPreviewView';
import { SettingsView } from '@/views/SettingsView';
import { DashboardView } from '@/views/DashboardView';
import { ErrorDisplayView } from '@/views/ErrorDisplayView';
import { NotificationManager } from '@/views/NotificationManager';
import { DotNetIntegrationService } from '@/services/DotNetIntegrationService';
import { QueryExecutionService } from '@/services/QueryExecutionService';
import { QueryEditorView } from '@/views/QueryEditorView';
import { TeamCollaborationService } from '@/services/TeamCollaborationService';
import { PerformanceMonitorService } from '@/services/PerformanceMonitorService';
import { PerformanceAlertSystem } from '@/services/PerformanceAlertSystem';
import { SchemaDocumentationService } from '@/services/SchemaDocumentationService';
import { DataImportService } from '@/services/DataImportService';
import { BackupService } from '@/services/BackupService';
import { RecoveryService } from '@/services/RecoveryService';
import { DataValidationService } from '@/services/DataValidationService';
import { MigrationValidationService } from '@/services/MigrationValidationService';
import { QueryAnalyticsView } from '@/views/QueryAnalyticsView';
import { TeamQueryLibraryView } from '@/views/TeamQueryLibraryView';
import { ImportWizardView } from '@/views/ImportWizardView';
import { ImportManagementView } from '@/views/ImportManagementView';
import { Logger } from '@/utils/Logger';

export interface ExtensionComponents {
    connectionManager: ConnectionManager;
    schemaManager: SchemaManager;
    migrationManager: MigrationManager;
    treeProvider: PostgreSqlTreeProvider;
    treeView?: vscode.TreeView<any>;
    activityBarProvider?: ActivityBarProvider;
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
    teamCollaborationService?: TeamCollaborationService;
    performanceMonitorService?: PerformanceMonitorService;
    performanceAlertSystem?: PerformanceAlertSystem;
    schemaDocumentationService?: SchemaDocumentationService;
    dataImportService?: DataImportService;
    backupService?: BackupService;
    recoveryService?: RecoveryService;
    dataValidationService?: DataValidationService;
    migrationValidationService?: MigrationValidationService;
    importWizardView?: ImportWizardView;
    importManagementView?: ImportManagementView;
    queryAnalyticsView?: QueryAnalyticsView;
    teamQueryLibraryView?: TeamQueryLibraryView;
    advancedMigrationPreviewView?: any;
    enhancedTreeProvider?: any;
}

export class ExtensionInitializer {
    private static dotNetService: DotNetIntegrationService;
    static async initializeDotNetService(): Promise<boolean> {
        try {
            Logger.info('Initializing .NET integration service');

            this.dotNetService = DotNetIntegrationService.getInstance();
            const initialized = await this.dotNetService.initialize();

            if (initialized) {
                Logger.info('.NET integration service initialized successfully');
                return true;
            } else {
                Logger.warn('.NET integration service initialization failed');
                return false;
            }
        } catch (error) {
            Logger.error('Failed to initialize .NET integration service', error as Error);
            return false;
        }
    }
    static initializeCoreComponents(context: vscode.ExtensionContext): ExtensionComponents {
        try {
            Logger.info('Initializing core extension components');

            // Initialize core managers
            const connectionManager = new ConnectionManager(context);
            const schemaManager = new SchemaManager(connectionManager);
            const migrationManager = new MigrationManager(connectionManager);
            const treeProvider = new PostgreSqlTreeProvider(connectionManager, schemaManager);

            const components: ExtensionComponents = {
                connectionManager,
                schemaManager,
                migrationManager,
                treeProvider
            };

            Logger.info('Core extension components initialized successfully');
            return components;
        } catch (error) {
            Logger.error('Failed to initialize core extension components', error as Error);
            throw error;
        }
    }

    static initializeOptionalComponents(
        coreComponents: ExtensionComponents,
        context: vscode.ExtensionContext
    ): ExtensionComponents {
        try {
            Logger.info('Initializing optional UI components');

            // Initialize optional components
            const activityBarProvider = new ActivityBarProvider(coreComponents.connectionManager);
            const notificationManager = NotificationManager.getInstance();
            const enhancedStatusBarProvider = EnhancedStatusBarProvider.getInstance(coreComponents.connectionManager, notificationManager);
            const dashboardView = new DashboardView(coreComponents.connectionManager, coreComponents.schemaManager);
            const connectionView = new ConnectionManagementView(coreComponents.connectionManager);
            const schemaBrowserView = new SchemaBrowserView(coreComponents.schemaManager, coreComponents.connectionManager);
            const schemaComparisonView = new SchemaComparisonView(this.getDotNetService());
            const migrationPreviewView = new MigrationPreviewView();
            const settingsView = new SettingsView();
            const errorDisplayView = new ErrorDisplayView();
            const queryExecutionService = new QueryExecutionService(coreComponents.connectionManager);
            const queryEditorView = new QueryEditorView(coreComponents.connectionManager, queryExecutionService);
            const teamCollaborationService = new TeamCollaborationService(context);
            const performanceMonitorService = PerformanceMonitorService.getInstance();
            const performanceAlertSystem = PerformanceAlertSystem.getInstance(context, performanceMonitorService);
            const schemaDocumentationService = new SchemaDocumentationService(context);
            const dataImportService = new DataImportService(context, coreComponents.connectionManager);
            const backupService = new BackupService(context, coreComponents.connectionManager);
            const recoveryService = new RecoveryService(context, coreComponents.connectionManager);
            const dataValidationService = new DataValidationService(context, coreComponents.connectionManager);
            const migrationValidationService = new MigrationValidationService(coreComponents.connectionManager);
            const importWizardView = coreComponents.dataImportService ?
                new ImportWizardView(coreComponents.dataImportService, coreComponents.connectionManager) : undefined;
            const importManagementView = coreComponents.dataImportService ?
                new ImportManagementView(coreComponents.dataImportService, coreComponents.connectionManager) : undefined;
            const queryAnalyticsView = new QueryAnalyticsView(context, performanceMonitorService, teamCollaborationService);
            const teamQueryLibraryView = new TeamQueryLibraryView(context, teamCollaborationService);

            // Add optional components to the core components
            const components: ExtensionComponents = {
                ...coreComponents,
                activityBarProvider,
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
                teamCollaborationService,
                performanceMonitorService,
                performanceAlertSystem,
                schemaDocumentationService,
                dataImportService,
                backupService,
                recoveryService,
                dataValidationService,
                migrationValidationService,
                importWizardView,
                importManagementView,
                queryAnalyticsView,
                teamQueryLibraryView
            };

            Logger.info('Optional UI components initialized successfully');
            return components;
        } catch (error) {
            Logger.error('Failed to initialize optional UI components', error as Error);
            // Return core components even if optional components fail
            return coreComponents;
        }
    }

    static registerTreeView(
        treeProvider: PostgreSqlTreeProvider,
        context: vscode.ExtensionContext
    ): vscode.TreeView<any> {
        try {
            Logger.info('Registering PostgreSQL tree view');
            const treeView = vscode.window.createTreeView('postgresqlExplorer', {
                treeDataProvider: treeProvider,
                showCollapseAll: true,
                canSelectMany: false
            });
            context.subscriptions.push(treeView);
            Logger.info('PostgreSQL tree view registered successfully');
            return treeView;
        } catch (error) {
            Logger.error('Failed to register tree view', error as Error);
            throw error;
        }
    }
    static initializeComponent<T>(
        componentName: string,
        factory: () => T,
        required: boolean = false
    ): T | undefined {
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
    static getDotNetService(): DotNetIntegrationService {
        if (!this.dotNetService) {
            throw new Error('.NET integration service not initialized');
        }
        return this.dotNetService;
    }

    static getStatusBarProvider(): EnhancedStatusBarProvider {
        return EnhancedStatusBarProvider.getCurrentInstance();
    }

    static getImportManagementView(components: ExtensionComponents): ImportManagementView {
        if (!components.importManagementView) {
            throw new Error('ImportManagementView not initialized');
        }
        return components.importManagementView;
    }

    static disposeImportManagementView(components: ExtensionComponents): void {
        if (components.importManagementView) {
            components.importManagementView.dispose();
        }
    }
}