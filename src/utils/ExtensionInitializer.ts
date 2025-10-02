import * as vscode from 'vscode';
import { ConnectionManager } from '../managers/ConnectionManager';
import { SchemaManager } from '../managers/SchemaManager';
import { MigrationManager } from '../managers/MigrationManager';
import { PostgreSqlTreeProvider } from '../providers/PostgreSqlTreeProvider';
import { StatusBarProvider } from '../providers/StatusBarProvider';
import { ActivityBarProvider } from '../providers/ActivityBarProvider';
import { EnhancedStatusBarProvider } from '../providers/EnhancedStatusBarProvider';
import { NotificationManager } from '../views/NotificationManager';
import { EnhancedTreeProvider } from '../views/EnhancedTreeProvider';
import { InteractiveSchemaComparisonView } from '../views/InteractiveSchemaComparisonView';
import { AdvancedMigrationPreviewView } from '../views/AdvancedMigrationPreviewView';
import { DashboardView } from '../views/DashboardView';
import { Logger } from './Logger';
import { ErrorHandler } from './ErrorHandler';

export interface ExtensionComponents {
    connectionManager: ConnectionManager;
    schemaManager: SchemaManager;
    migrationManager: MigrationManager;
    treeProvider: PostgreSqlTreeProvider;
    statusBarProvider?: StatusBarProvider;
    activityBarProvider?: ActivityBarProvider;
    notificationManager?: NotificationManager;
    enhancedStatusBarProvider?: EnhancedStatusBarProvider;
    enhancedTreeProvider?: EnhancedTreeProvider;
    interactiveComparisonView?: InteractiveSchemaComparisonView;
    advancedMigrationPreviewView?: AdvancedMigrationPreviewView;
    dashboardView?: DashboardView;
}

export class ExtensionInitializer {
    /**
     * Initialize a component with standardized error handling
     */
    static initializeComponent<T>(
        componentName: string,
        initializer: () => T,
        isCritical: boolean = false
    ): T | undefined {
        try {
            return initializer();
        } catch (error) {
            const errorMessage = `Failed to initialize ${componentName}`;
            Logger.error(errorMessage, error as Error);

            if (isCritical) {
                throw new Error(`${errorMessage}: ${(error as Error).message}`);
            } else {
                Logger.warn(`${errorMessage}, continuing without this component`, error as Error);
                return undefined;
            }
        }
    }

    /**
     * Initialize all core components
     */
    static initializeCoreComponents(context: vscode.ExtensionContext): ExtensionComponents {
        Logger.info('Initializing core extension components');

        // Initialize ConnectionManager first (critical component)
        const connectionManager = this.initializeComponent(
            'ConnectionManager',
            () => new ConnectionManager(context),
            true
        ) as ConnectionManager;

        // Initialize managers that depend on ConnectionManager
        const schemaManager = this.initializeComponent(
            'SchemaManager',
            () => new SchemaManager(connectionManager),
            true
        ) as SchemaManager;

        const migrationManager = this.initializeComponent(
            'MigrationManager',
            () => new MigrationManager(connectionManager),
            true
        ) as MigrationManager;

        // Initialize tree provider
        const treeProvider = this.initializeComponent(
            'PostgreSqlTreeProvider',
            () => new PostgreSqlTreeProvider(connectionManager, schemaManager),
            true
        ) as PostgreSqlTreeProvider;

        return {
            connectionManager,
            schemaManager,
            migrationManager,
            treeProvider
        };
    }

    /**
     * Initialize optional UI components
     */
    static initializeOptionalComponents(
        context: vscode.ExtensionContext,
        components: ExtensionComponents
    ): ExtensionComponents {
        Logger.info('Initializing optional extension components');

        // Initialize status bar provider
        const statusBarProvider = this.initializeComponent(
            'StatusBarProvider',
            () => new StatusBarProvider(components.connectionManager),
            false
        ) as StatusBarProvider;

        // Initialize activity bar provider
        this.initializeComponent(
            'ActivityBarProvider',
            () => new ActivityBarProvider(components.connectionManager),
            false
        );

        // Performance monitor removed

        // Initialize notification manager
        const notificationManager = this.initializeComponent(
            'NotificationManager',
            () => NotificationManager.getInstance(),
            false
        ) as NotificationManager;

        // Initialize enhanced status bar provider
        const enhancedStatusBarProvider = this.initializeComponent(
            'EnhancedStatusBarProvider',
            () => EnhancedStatusBarProvider.getInstance(
                components.connectionManager,
                notificationManager || NotificationManager.getInstance()
            ),
            false
        ) as EnhancedStatusBarProvider;

        // Initialize enhanced tree provider
        const enhancedTreeProvider = this.initializeComponent(
            'EnhancedTreeProvider',
            () => new EnhancedTreeProvider(
                components.connectionManager,
                components.schemaManager,
                undefined as any // PerformanceMonitor removed
            ),
            false
        ) as EnhancedTreeProvider;

        // Initialize interactive comparison view
        const interactiveComparisonView = this.initializeComponent(
            'InteractiveSchemaComparisonView',
            () => new InteractiveSchemaComparisonView(undefined as any), // PerformanceMonitor removed
            false
        ) as InteractiveSchemaComparisonView;

        // Initialize advanced migration preview view
        const advancedMigrationPreviewView = this.initializeComponent(
            'AdvancedMigrationPreviewView',
            () => new AdvancedMigrationPreviewView(),
            false
        ) as AdvancedMigrationPreviewView;

        // Initialize dashboard view
        const dashboardView = this.initializeComponent(
            'DashboardView',
            () => new DashboardView(
                components.connectionManager,
                components.schemaManager,
                undefined as any // PerformanceMonitor removed
            ),
            false
        ) as DashboardView;

        return {
            ...components,
            statusBarProvider,
            notificationManager,
            enhancedStatusBarProvider,
            enhancedTreeProvider,
            interactiveComparisonView,
            advancedMigrationPreviewView,
            dashboardView
        };
    }

    /**
     * Register VS Code tree view
     */
    static registerTreeView(
        treeProvider: PostgreSqlTreeProvider,
        context: vscode.ExtensionContext
    ): vscode.TreeView<any> {
        return this.initializeComponent(
            'TreeView',
            () => {
                const treeView = vscode.window.createTreeView('postgresqlExplorer', {
                    treeDataProvider: treeProvider,
                    showCollapseAll: true,
                    canSelectMany: false
                });
                context.subscriptions.push(treeView);
                return treeView;
            },
            true
        ) as vscode.TreeView<any>;
    }

    /**
     * Initialize .NET integration service
     */
    static async initializeDotNetService(): Promise<boolean> {
        const { DotNetIntegrationService } = await import('../services/DotNetIntegrationService');

        try {
            const dotNetService = DotNetIntegrationService.getInstance();
            const isAvailable = await dotNetService.initialize();

            if (isAvailable) {
                Logger.info('.NET library integration enabled');
                return true;
            } else {
                Logger.warn('.NET library not available, running in compatibility mode');
                return false;
            }
        } catch (error) {
            Logger.warn('.NET integration failed, continuing without .NET features', { error: (error as Error).message });
            return false;
        }
    }
}