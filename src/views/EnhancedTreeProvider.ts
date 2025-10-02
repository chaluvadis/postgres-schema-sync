import * as vscode from 'vscode';
import { ConnectionManager, DatabaseConnection } from '../managers/ConnectionManager';
import { SchemaManager, DatabaseObject } from '../managers/SchemaManager';
import { Logger } from '../utils/Logger';

export interface IEnhancedTreeItem extends vscode.TreeItem {
    object?: DatabaseObject;
    connectionId?: string | undefined;
    schemaName?: string | undefined;
    objectName?: string | undefined;
    objectType?: string | undefined;
    metadata?: ObjectMetadata | undefined;
    children?: IEnhancedTreeItem[];
    isLoading?: boolean;
    lastUpdated?: Date;
}

export interface ObjectMetadata {
    rowCount?: number;
    size?: string;
    lastModified?: Date;
    dependencies?: string[];
    dependents?: string[];
    status?: 'active' | 'inactive' | 'error';
    performance?: {
        avgQueryTime?: number;
        lastAccess?: Date;
        accessCount?: number;
    };
}

export class EnhancedTreeProvider implements vscode.TreeDataProvider<IEnhancedTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<EnhancedTreeItem | undefined | void> = new vscode.EventEmitter<EnhancedTreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<EnhancedTreeItem | undefined | void> = this._onDidChangeTreeData.event;

    private connections: DatabaseConnection[] = [];
    private schemaObjects: Map<string, DatabaseObject[]> = new Map();
    private objectMetadata: Map<string, ObjectMetadata> = new Map();
    private expandedItems: Set<string> = new Set();
    private searchFilter: string = '';
    private viewMode: 'standard' | 'compact' | 'detailed' = 'standard';

    constructor(
        private connectionManager: ConnectionManager,
        private schemaManager: SchemaManager,
        private performanceMonitor?: any // Removed PerformanceMonitor
    ) {
        this.refresh();
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        // Listen for configuration changes
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('postgresql.treeView')) {
                this.refresh();
            }
        });

        // Listen for performance updates - simplified for now
        // this.performanceMonitor.onPerformanceUpdate(() => {
        //     this.refreshMetadata();
        // });
    }

    refresh(): void {
        Logger.debug('Refreshing enhanced tree provider');
        this.connections = this.connectionManager.getConnections();
        this._onDidChangeTreeData.fire();
    }

    refreshMetadata(): void {
        this._onDidChangeTreeData.fire();
    }

    setSearchFilter(filter: string): void {
        this.searchFilter = filter.toLowerCase();
        this._onDidChangeTreeData.fire();
    }

    setViewMode(mode: 'standard' | 'compact' | 'detailed'): void {
        this.viewMode = mode;
        this._onDidChangeTreeData.fire();
    }

    toggleExpanded(itemId: string): void {
        if (this.expandedItems.has(itemId)) {
            this.expandedItems.delete(itemId);
        } else {
            this.expandedItems.add(itemId);
        }
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: EnhancedTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: EnhancedTreeItem): Promise<EnhancedTreeItem[]> {
        try {
            if (!element) {
                return await this.getConnectionItems();
            }

            switch (element.objectType) {
                case 'connection':
                    return this.getDatabaseItems(element.connectionId!);
                case 'database':
                    return this.getSchemaItems(element.connectionId!);
                case 'schema':
                    return this.getObjectItems(element.connectionId!, element.schemaName!);
                case 'table':
                case 'view':
                    return this.getTableChildItems(element);
                case 'columns':
                    return this.getColumnItems(element);
                case 'indexes':
                    return this.getIndexItems(element);
                case 'constraints':
                    return this.getConstraintItems(element);
                case 'triggers':
                    return this.getTriggerItems(element);
                case 'functions':
                    return this.getFunctionItems(element);
                default:
                    return [];
            }
        } catch (error) {
            Logger.error('Failed to get tree children', error as Error);
            return [];
        }
    }

    private async getConnectionItems(): Promise<IEnhancedTreeItem[]> {
        if (this.connections.length === 0) {
            return [this.createNoConnectionsItem()];
        }

        return this.connections.map(connection => {
            const isConnected = connection.status === 'Connected';
            const metadata = this.getConnectionMetadata(connection);
            const itemId = `connection:${connection.id}`;

            return new EnhancedTreeItem(
                connection.name,
                isConnected ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
                connection.id,
                'connection',
                await metadata,
                isConnected
            );
        });
    }

    private async getDatabaseItems(connectionId: string): Promise<EnhancedTreeItem[]> {
        const connection = this.connections.find(c => c.id === connectionId);
        if (!connection) return [];

        const metadata = await this.getDatabaseMetadata(connection);
        const itemId = `database:${connectionId}:${connection.database}`;

        return [new EnhancedTreeItem(
            connection.database,
            vscode.TreeItemCollapsibleState.Expanded,
            connectionId,
            'database',
            metadata
        )];
    }

    private async getSchemaItems(connectionId: string): Promise<EnhancedTreeItem[]> {
        try {
            const objects = await this.schemaManager.getDatabaseObjects(connectionId);
            this.schemaObjects.set(connectionId, objects);

            // Group objects by schema
            const schemaGroups = new Map<string, DatabaseObject[]>();
            for (const obj of objects) {
                if (obj.type === 'schema') {
                    schemaGroups.set(obj.name, []);
                }
            }

            // Add objects to their respective schemas
            for (const obj of objects) {
                if (obj.type !== 'schema' && obj.schema) {
                    const schemaObjects = schemaGroups.get(obj.schema) || [];
                    schemaObjects.push(obj);
                    schemaGroups.set(obj.schema, schemaObjects);
                }
            }

            return Array.from(schemaGroups.entries()).map(([schemaName, schemaObjects]) => {
                const metadata = this.getSchemaMetadata(schemaName, schemaObjects);
                const itemId = `schema:${connectionId}:${schemaName}`;

                return new EnhancedTreeItem(
                    schemaName,
                    this.expandedItems.has(itemId) ?
                        vscode.TreeItemCollapsibleState.Expanded :
                        vscode.TreeItemCollapsibleState.Collapsed,
                    connectionId,
                    'schema',
                    metadata,
                    true,
                    schemaName
                );
            });
        } catch (error) {
            Logger.error('Failed to get schema items', error as Error);
            return [];
        }
    }

    private async getObjectItems(connectionId: string, schemaName: string): Promise<EnhancedTreeItem[]> {
        const objects = this.schemaObjects.get(connectionId) || [];
        const schemaObjects = objects.filter(obj =>
            obj.schema === schemaName && obj.type !== 'schema'
        );

        // Apply search filter if set
        const filteredObjects = this.searchFilter
            ? schemaObjects.filter(obj =>
                obj.name.toLowerCase().includes(this.searchFilter) ||
                obj.type.toLowerCase().includes(this.searchFilter)
              )
            : schemaObjects;

        return filteredObjects.map(obj => {
            const metadata = this.getObjectMetadata(obj);
            const itemId = `object:${connectionId}:${schemaName}:${obj.name}`;
            const isContainer = this.isContainerType(obj.type);

            return new EnhancedTreeItem(
                obj.name,
                isContainer && this.expandedItems.has(itemId) ?
                    vscode.TreeItemCollapsibleState.Expanded :
                    isContainer ? vscode.TreeItemCollapsibleState.Collapsed :
                    vscode.TreeItemCollapsibleState.None,
                connectionId,
                obj.type,
                metadata,
                true,
                schemaName,
                obj.name
            );
        });
    }

    private getTableChildItems(element: EnhancedTreeItem): EnhancedTreeItem[] {
        const children = [
            this.createChildItem('columns', 'list-flat', 'Table columns', element),
            this.createChildItem('indexes', 'list-ordered', 'Table indexes', element),
            this.createChildItem('constraints', 'lock', 'Table constraints', element),
            this.createChildItem('triggers', 'zap', 'Table triggers', element)
        ];

        // Add performance metrics for tables
        if (element.metadata?.performance) {
            children.push(this.createChildItem(
                'performance',
                'graph',
                `Performance: ${element.metadata.performance.avgQueryTime}ms avg`,
                element
            ));
        }

        return children;
    }

    private async getColumnItems(element: EnhancedTreeItem): Promise<EnhancedTreeItem[]> {
        // This would typically fetch column information from the database
        // For now, return placeholder items
        return [
            this.createPlaceholderItem('Columns will be loaded from database', element)
        ];
    }

    private async getIndexItems(element: EnhancedTreeItem): Promise<EnhancedTreeItem[]> {
        return [
            this.createPlaceholderItem('Indexes will be loaded from database', element)
        ];
    }

    private async getConstraintItems(element: EnhancedTreeItem): Promise<EnhancedTreeItem[]> {
        return [
            this.createPlaceholderItem('Constraints will be loaded from database', element)
        ];
    }

    private async getTriggerItems(element: EnhancedTreeItem): Promise<EnhancedTreeItem[]> {
        return [
            this.createPlaceholderItem('Triggers will be loaded from database', element)
        ];
    }

    private async getFunctionItems(element: EnhancedTreeItem): Promise<EnhancedTreeItem[]> {
        return [
            this.createPlaceholderItem('Functions will be loaded from database', element)
        ];
    }

    private createNoConnectionsItem(): EnhancedTreeItem {
        const item = new EnhancedTreeItem(
            'No PostgreSQL Connections',
            vscode.TreeItemCollapsibleState.None,
            undefined,
            'noConnections'
        );
        item.command = {
            command: 'postgresql.addConnection',
            title: 'Add Connection',
            arguments: []
        };
        item.tooltip = 'Click to add your first PostgreSQL database connection';
        item.iconPath = new vscode.ThemeIcon('add');
        return item;
    }

    private createChildItem(
        type: string,
        icon: string,
        label: string,
        parent: EnhancedTreeItem
    ): EnhancedTreeItem {
        const item = new EnhancedTreeItem(
            label,
            vscode.TreeItemCollapsibleState.Collapsed,
            parent.connectionId,
            type,
            undefined,
            true,
            parent.schemaName,
            parent.objectName
        );
        item.iconPath = new vscode.ThemeIcon(icon);
        return item;
    }

    private createPlaceholderItem(message: string, parent: EnhancedTreeItem): EnhancedTreeItem {
        const item = new EnhancedTreeItem(
            message,
            vscode.TreeItemCollapsibleState.None,
            parent.connectionId,
            'placeholder'
        );
        item.iconPath = new vscode.ThemeIcon('info');
        return item;
    }

    private async getConnectionMetadata(connection: DatabaseConnection): Promise<ObjectMetadata> {
        return {
            status: connection.status === 'Connected' ? 'active' : 'inactive',
            lastModified: new Date()
        };
    }

    private async getDatabaseMetadata(connection: DatabaseConnection): Promise<ObjectMetadata> {
        // This would typically fetch database statistics
        return {
            size: 'Unknown',
            status: 'active'
        };
    }

    private getSchemaMetadata(schemaName: string, objects: DatabaseObject[]): ObjectMetadata {
        const objectCounts = objects.reduce((acc, obj) => {
            acc[obj.type] = (acc[obj.type] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        return {
            size: `${objects.length} objects`,
            status: 'active'
        };
    }

    private getObjectMetadata(obj: DatabaseObject): ObjectMetadata {
        // Get cached metadata or create default
        const key = `${obj.schema}.${obj.name}`;
        return this.objectMetadata.get(key) || {
            status: 'active',
            lastModified: new Date()
        };
    }

    private isContainerType(type: string): boolean {
        return ['table', 'view', 'schema', 'database'].includes(type);
    }

    // Drag and Drop support
    getDragItems(elements: IEnhancedTreeItem[]): vscode.DataTransferItem[] {
        const dataTransferItems: vscode.DataTransferItem[] = [];

        for (const element of elements) {
            if (element.object) {
                dataTransferItems.push({
                    asString: () => JSON.stringify(element.object),
                    value: JSON.stringify(element.object),
                    fileSize: JSON.stringify(element.object).length,
                    asFile: () => undefined
                } as unknown as vscode.DataTransferItem);
            }
        }

        return dataTransferItems;
    }

    // Context menu support
    getContextMenuItems(element: EnhancedTreeItem): vscode.Command[] {
        const commands: vscode.Command[] = [];

        switch (element.objectType) {
            case 'connection':
                commands.push(
                    { command: 'postgresql.testConnection', title: 'Test Connection' },
                    { command: 'postgresql.refreshConnection', title: 'Refresh' },
                    { command: 'postgresql.editConnection', title: 'Edit Connection' },
                    { command: 'postgresql.removeConnection', title: 'Remove Connection' }
                );
                break;
            case 'table':
                commands.push(
                    { command: 'postgresql.viewTableData', title: 'View Data' },
                    { command: 'postgresql.editTable', title: 'Edit Table' },
                    { command: 'postgresql.compareTable', title: 'Compare Table' },
                    { command: 'postgresql.generateMigration', title: 'Generate Migration' }
                );
                break;
            case 'view':
                commands.push(
                    { command: 'postgresql.viewViewData', title: 'View Data' },
                    { command: 'postgresql.editView', title: 'Edit View' },
                    { command: 'postgresql.compareView', title: 'Compare View' }
                );
                break;
        }

        return commands;
    }
}

class EnhancedTreeItem extends vscode.TreeItem {
    public object?: DatabaseObject;
    public connectionId?: string | undefined;
    public schemaName?: string | undefined;
    public objectName?: string | undefined;
    public objectType?: string | undefined;
    public metadata?: ObjectMetadata | undefined;
    public isLoading?: boolean;
    public lastUpdated?: Date;

    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        connectionId?: string,
        objectType?: string,
        metadata?: ObjectMetadata,
        isLoading: boolean = false,
        schemaName?: string,
        objectName?: string
    ) {
        super(label, collapsibleState);

        this.connectionId = connectionId;
        this.objectType = objectType;
        this.metadata = metadata;
        this.isLoading = isLoading;
        this.schemaName = schemaName;
        this.objectName = objectName;
        this.lastUpdated = new Date();

        // Set icon based on object type
        this.iconPath = this.getIconForType(objectType);

        // Set context value for context menus
        this.contextValue = objectType || 'unknown';

        // Set tooltip with metadata
        this.tooltip = this.buildTooltip();

        // Set description based on view mode
        this.description = this.buildDescription();
    }

    private getIconForType(type?: string): vscode.ThemeIcon | string {
        if (this.isLoading) {
            return new vscode.ThemeIcon('sync~spin');
        }

        switch (type) {
            case 'connection': return this.metadata?.status === 'active' ?
                new vscode.ThemeIcon('debug-start') : new vscode.ThemeIcon('debug-breakpoint');
            case 'database': return new vscode.ThemeIcon('database');
            case 'schema': return new vscode.ThemeIcon('symbol-namespace');
            case 'table': return new vscode.ThemeIcon('database');
            case 'view': return new vscode.ThemeIcon('eye');
            case 'function': return new vscode.ThemeIcon('symbol-function');
            case 'procedure': return new vscode.ThemeIcon('symbol-method');
            case 'sequence': return new vscode.ThemeIcon('symbol-numeric');
            case 'type': return new vscode.ThemeIcon('symbol-class');
            case 'domain': return new vscode.ThemeIcon('symbol-value');
            case 'collation': return new vscode.ThemeIcon('symbol-string');
            case 'extension': return new vscode.ThemeIcon('package');
            case 'role': return new vscode.ThemeIcon('person');
            case 'tablespace': return new vscode.ThemeIcon('file-submodule');
            case 'index': return new vscode.ThemeIcon('list-ordered');
            case 'trigger': return new vscode.ThemeIcon('zap');
            case 'constraint': return new vscode.ThemeIcon('lock');
            case 'column': return new vscode.ThemeIcon('symbol-field');
            case 'columns': return new vscode.ThemeIcon('list-flat');
            case 'indexes': return new vscode.ThemeIcon('list-ordered');
            case 'constraints': return new vscode.ThemeIcon('lock');
            case 'triggers': return new vscode.ThemeIcon('zap');
            case 'performance': return new vscode.ThemeIcon('graph');
            case 'noConnections': return new vscode.ThemeIcon('info');
            default: return new vscode.ThemeIcon('question');
        }
    }

    private buildTooltip(): string {
        if (!this.metadata) return typeof this.label === 'string' ? this.label : this.label?.label || '';

        let tooltip = typeof this.label === 'string' ? this.label : this.label?.label || '';

        if (this.metadata.size) {
            tooltip += `\nSize: ${this.metadata.size}`;
        }

        if (this.metadata.rowCount) {
            tooltip += `\nRows: ${this.metadata.rowCount.toLocaleString()}`;
        }

        if (this.metadata.lastModified) {
            tooltip += `\nLast Modified: ${this.metadata.lastModified.toLocaleString()}`;
        }

        if (this.metadata.status) {
            tooltip += `\nStatus: ${this.metadata.status}`;
        }

        if (this.metadata.performance?.avgQueryTime) {
            tooltip += `\nAvg Query Time: ${this.metadata.performance.avgQueryTime}ms`;
        }

        return tooltip;
    }

    private buildDescription(): string {
        if (!this.metadata) return '';

        switch (this.objectType) {
            case 'schema':
                return this.metadata.size || '';
            case 'table':
                return this.metadata.rowCount ?
                    `${this.metadata.rowCount.toLocaleString()} rows` : '';
            case 'connection':
                return this.metadata.status === 'active' ? 'Connected' : 'Disconnected';
            default:
                return '';
        }
    }
}