import * as vscode from 'vscode';
import { ConnectionManager } from '../managers/ConnectionManager';
import { SchemaManager } from '../managers/SchemaManager';
import { MigrationManager } from '../managers/MigrationManager';
import { PostgreSqlTreeProvider } from '../providers/PostgreSqlTreeProvider';
import { EnhancedStatusBarProvider } from '../providers/EnhancedStatusBarProvider';
import { NotificationManager } from '../views/NotificationManager';
import { EnhancedTreeProvider } from '../views/EnhancedTreeProvider';
import { InteractiveSchemaComparisonView } from '../views/InteractiveSchemaComparisonView';
import { AdvancedMigrationPreviewView } from '../views/AdvancedMigrationPreviewView';
import { DashboardView } from '../views/DashboardView';
import { Logger } from './Logger';

export interface ExtensionComponents {
    connectionManager: ConnectionManager;
    schemaManager: SchemaManager;
    migrationManager: MigrationManager;
    treeProvider: PostgreSqlTreeProvider;
    notificationManager?: NotificationManager;
    enhancedStatusBarProvider?: EnhancedStatusBarProvider;
    enhancedTreeProvider?: EnhancedTreeProvider;
    interactiveComparisonView?: InteractiveSchemaComparisonView;
    advancedMigrationPreviewView?: AdvancedMigrationPreviewView;
    dashboardView?: DashboardView;
}

export class ExtensionInitializer {
    /**
     * Initialize a component with standardized error handling and performance tracking
     */
    static initializeComponent<T>(
        componentName: string,
        initializer: () => T,
        isCritical: boolean = false
    ): T | undefined {
        const startTime = Date.now();

        try {
            const component = initializer();
            const initializationTime = Date.now() - startTime;

            Logger.debug(`${componentName} initialized successfully`, {
                duration: `${initializationTime}ms`,
                isCritical
            });

            return component;
        } catch (error) {
            const initializationTime = Date.now() - startTime;
            const errorMessage = `Failed to initialize ${componentName} after ${initializationTime}ms`;

            Logger.error(errorMessage, {
                error: error as Error,
                isCritical,
                duration: `${initializationTime}ms`
            });

            if (isCritical) {
                throw new Error(`${errorMessage}: ${(error as Error).message}`);
            } else {
                Logger.warn(`${errorMessage}, continuing without this component`);
                return undefined;
            }
        }
    }

    /**
     * Initialize all core components with enhanced error handling and performance tracking
     */
    static initializeCoreComponents(context: vscode.ExtensionContext): ExtensionComponents {
        Logger.info('Initializing core extension components');
        const startTime = Date.now();

        // Initialize ConnectionManager first (critical component)
        const connectionManager = this.initializeComponent(
            'ConnectionManager',
            () => new ConnectionManager(context),
            true
        ) as ConnectionManager;

        Logger.debug('ConnectionManager initialized successfully');

        // Initialize managers that depend on ConnectionManager
        const schemaManager = this.initializeComponent(
            'SchemaManager',
            () => new SchemaManager(connectionManager),
            true
        ) as SchemaManager;

        Logger.debug('SchemaManager initialized successfully');

        const migrationManager = this.initializeComponent(
            'MigrationManager',
            () => new MigrationManager(connectionManager),
            true
        ) as MigrationManager;

        Logger.debug('MigrationManager initialized successfully');

        // Initialize tree provider
        const treeProvider = this.initializeComponent(
            'PostgreSqlTreeProvider',
            () => new PostgreSqlTreeProvider(connectionManager, schemaManager),
            true
        ) as PostgreSqlTreeProvider;

        Logger.debug('PostgreSqlTreeProvider initialized successfully');

        const initializationTime = Date.now() - startTime;
        Logger.info('Core components initialization completed', {
            duration: `${initializationTime}ms`,
            componentsCount: 4
        });

        return {
            connectionManager,
            schemaManager,
            migrationManager,
            treeProvider
        };
    }

    /**
     * Initialize optional UI components with enhanced error handling and logging
     */
    static initializeOptionalComponents(
        context: vscode.ExtensionContext,
        components: ExtensionComponents
    ): ExtensionComponents {
        Logger.info('Initializing optional extension components');
        const startTime = Date.now();

        // Initialize notification manager
        const notificationManager = this.initializeComponent(
            'NotificationManager',
            () => NotificationManager.getInstance(),
            false
        ) as NotificationManager;

        Logger.debug('NotificationManager initialized', {
            hasInstance: !!notificationManager
        });

        // Initialize enhanced status bar provider
        const enhancedStatusBarProvider = this.initializeComponent(
            'EnhancedStatusBarProvider',
            () => EnhancedStatusBarProvider.getInstance(
                components.connectionManager,
                notificationManager || NotificationManager.getInstance()
            ),
            false
        ) as EnhancedStatusBarProvider;

        Logger.debug('EnhancedStatusBarProvider initialized', {
            hasInstance: !!enhancedStatusBarProvider
        });

        // Initialize enhanced tree provider
        const enhancedTreeProvider = this.initializeComponent(
            'EnhancedTreeProvider',
            () => new EnhancedTreeProvider(
                components.connectionManager,
                components.schemaManager
            ),
            false
        ) as EnhancedTreeProvider;

        Logger.debug('EnhancedTreeProvider initialized', {
            hasInstance: !!enhancedTreeProvider
        });

        // Initialize interactive comparison view
        const interactiveComparisonView = this.initializeComponent(
            'InteractiveSchemaComparisonView',
            () => new InteractiveSchemaComparisonView(),
            false
        ) as InteractiveSchemaComparisonView;

        Logger.debug('InteractiveSchemaComparisonView initialized', {
            hasInstance: !!interactiveComparisonView
        });

        // Initialize advanced migration preview view
        const advancedMigrationPreviewView = this.initializeComponent(
            'AdvancedMigrationPreviewView',
            () => new AdvancedMigrationPreviewView(),
            false
        ) as AdvancedMigrationPreviewView;

        Logger.debug('AdvancedMigrationPreviewView initialized', {
            hasInstance: !!advancedMigrationPreviewView
        });

        // Initialize dashboard view
        const dashboardView = this.initializeComponent(
            'DashboardView',
            () => new DashboardView(
                components.connectionManager,
                components.schemaManager
            ),
            false
        ) as DashboardView;

        Logger.debug('DashboardView initialized', {
            hasInstance: !!dashboardView
        });

        const initializationTime = Date.now() - startTime;
        Logger.info('Optional components initialization completed', {
            duration: `${initializationTime}ms`,
            componentsInitialized: [
                notificationManager,
                enhancedStatusBarProvider,
                enhancedTreeProvider,
                interactiveComparisonView,
                advancedMigrationPreviewView,
                dashboardView
            ].filter(Boolean).length
        });

        return {
            ...components,
            notificationManager,
            enhancedStatusBarProvider,
            enhancedTreeProvider,
            interactiveComparisonView,
            advancedMigrationPreviewView,
            dashboardView
        };
    }

    /**
     * Register VS Code tree view with enhanced configuration and error handling
     */
    static registerTreeView(
        treeProvider: PostgreSqlTreeProvider,
        context: vscode.ExtensionContext
    ): vscode.TreeView<any> {
        Logger.debug('Registering PostgreSQL tree view');

        return this.initializeComponent(
            'TreeView',
            () => {
                const treeView = vscode.window.createTreeView('postgresqlExplorer', {
                    treeDataProvider: treeProvider,
                    showCollapseAll: true,
                    canSelectMany: false,
                    manageCheckboxStateManually: false
                });

                // Register tree view disposal with context subscriptions
                context.subscriptions.push(treeView);

                Logger.info('PostgreSQL tree view registered successfully', {
                    viewId: 'postgresqlExplorer',
                    canSelectMany: false,
                    showCollapseAll: true
                });

                return treeView;
            },
            true
        ) as vscode.TreeView<any>;
    }

    /**
     * Initialize .NET integration service with enhanced error handling and performance tracking
     */
    static async initializeDotNetService(): Promise<boolean> {
        const startTime = Date.now();

        try {
            Logger.debug('Starting .NET integration service initialization');

            const { DotNetIntegrationService } = await import('../services/DotNetIntegrationService');
            const dotNetService = DotNetIntegrationService.getInstance();
            const isAvailable = await dotNetService.initialize();

            const initializationTime = Date.now() - startTime;

            if (isAvailable) {
                Logger.info('.NET library integration enabled successfully', {
                    duration: `${initializationTime}ms`
                });
                return true;
            } else {
                Logger.warn('.NET library not available, running in compatibility mode', {
                    duration: `${initializationTime}ms`
                });
                return false;
            }
        } catch (error) {
            const initializationTime = Date.now() - startTime;
            Logger.warn('.NET integration failed, continuing without .NET features', {
                error: (error as Error).message,
                duration: `${initializationTime}ms`
            });
            return false;
        }
    }
}