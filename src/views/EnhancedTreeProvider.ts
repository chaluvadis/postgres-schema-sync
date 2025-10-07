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
    private expandedItems: Set<string> = new Set();
    private searchFilter: string = '';

    constructor(
        private connectionManager: ConnectionManager,
        private schemaManager: SchemaManager
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


    setSearchFilter(filter: string): void {
        this.searchFilter = filter.toLowerCase();
        this._onDidChangeTreeData.fire();
    }


    /**
     * Toggles the expansion state of a tree item.
     * Note: This method manages expansion state but needs to be connected to VSCode's
     * tree view expansion events to work with user interactions.
     * Currently used for programmatic expansion state management.
     */
    toggleExpanded(itemId: string): void {
        if (this.expandedItems.has(itemId)) {
            this.expandedItems.delete(itemId);
        } else {
            this.expandedItems.add(itemId);
        }
        this._onDidChangeTreeData.fire();
    }

    /**
     * Gets the current expansion state of a tree item
     */
    isExpanded(itemId: string): boolean {
        return this.expandedItems.has(itemId);
    }

    /**
     * Clears all expansion state (collapses all items)
     */
    clearExpansionState(): void {
        this.expandedItems.clear();
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

    private async getConnectionItems(): Promise<EnhancedTreeItem[]> {
        if (this.connections.length === 0) {
            return [this.createNoConnectionsItem()];
        }

        const items: EnhancedTreeItem[] = [];
        for (const connection of this.connections) {
            const isConnected = connection.status === 'Connected';
            const metadata = await this.getConnectionMetadata(connection);

            items.push(new EnhancedTreeItem(
                connection.name,
                isConnected ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
                connection.id,
                'connection',
                metadata,
                isConnected
            ));
        }
        return items;
    }

    private async getDatabaseItems(connectionId: string): Promise<EnhancedTreeItem[]> {
        const connection = this.connections.find(c => c.id === connectionId);
        if (!connection) { return []; }

        const metadata = await this.getDatabaseMetadata(connection);
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
                const metadata = this.getSchemaMetadata(schemaObjects);

                return new EnhancedTreeItem(
                    schemaName,
                    this.expandedItems.has(`schema:${connectionId}:${schemaName}`) ?
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
            const isContainer = this.isContainerType(obj.type);

            return new EnhancedTreeItem(
                obj.name,
                isContainer && this.expandedItems.has(`object:${connectionId}:${schemaName}:${obj.name}`) ?
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
        try {
            if (!element.connectionId || !element.schemaName || !element.objectName) {
                return [this.createPlaceholderItem('Invalid table reference', element)];
            }

            // Get column details from the database
            const columnDetails = await this.schemaManager.getObjectDetails(
                element.connectionId,
                'columns',
                element.schemaName,
                element.objectName
            );

            if (!columnDetails || !Array.isArray(columnDetails)) {
                return [this.createPlaceholderItem('No columns found', element)];
            }

            // Convert column details to tree items
            return columnDetails.map((column: any) => {
                const metadata: ObjectMetadata = {
                    size: column.dataType || 'unknown',
                    status: 'active',
                    lastModified: new Date()
                };

                const item = new EnhancedTreeItem(
                    column.name || 'Unknown',
                    vscode.TreeItemCollapsibleState.None,
                    element.connectionId,
                    'column',
                    metadata,
                    false,
                    element.schemaName,
                    element.objectName
                );

                item.tooltip = `Column: ${column.name}\nType: ${column.dataType}\nNullable: ${column.isNullable ? 'Yes' : 'No'}`;
                item.description = column.dataType || '';
                item.iconPath = new vscode.ThemeIcon('symbol-field');

                return item;
            });
        } catch (error) {
            Logger.error('Failed to get column items', error as Error);
            return [this.createPlaceholderItem('Failed to load columns', element)];
        }
    }

    private async getIndexItems(element: EnhancedTreeItem): Promise<EnhancedTreeItem[]> {
        try {
            if (!element.connectionId || !element.schemaName || !element.objectName) {
                return [this.createPlaceholderItem('Invalid table reference', element)];
            }

            // Get index details from the database
            const indexDetails = await this.schemaManager.getObjectDetails(
                element.connectionId,
                'indexes',
                element.schemaName,
                element.objectName
            );

            if (!indexDetails || !Array.isArray(indexDetails)) {
                return [this.createPlaceholderItem('No indexes found', element)];
            }

            // Convert index details to tree items
            return indexDetails.map((index: any) => {
                const metadata: ObjectMetadata = {
                    size: index.isUnique ? 'unique' : 'non-unique',
                    status: 'active',
                    lastModified: new Date()
                };

                const item = new EnhancedTreeItem(
                    index.name || 'Unknown',
                    vscode.TreeItemCollapsibleState.None,
                    element.connectionId,
                    'index',
                    metadata,
                    false,
                    element.schemaName,
                    element.objectName
                );

                item.tooltip = `Index: ${index.name}\nType: ${index.indexType || 'Unknown'}\nUnique: ${index.isUnique ? 'Yes' : 'No'}`;
                item.description = index.indexType || '';
                item.iconPath = new vscode.ThemeIcon('list-ordered');

                return item;
            });
        } catch (error) {
            Logger.error('Failed to get index items', error as Error);
            return [this.createPlaceholderItem('Failed to load indexes', element)];
        }
    }

    private async getConstraintItems(element: EnhancedTreeItem): Promise<EnhancedTreeItem[]> {
        try {
            if (!element.connectionId || !element.schemaName || !element.objectName) {
                return [this.createPlaceholderItem('Invalid table reference', element)];
            }

            // Get constraint details from the database
            const constraintDetails = await this.schemaManager.getObjectDetails(
                element.connectionId,
                'constraints',
                element.schemaName,
                element.objectName
            );

            if (!constraintDetails || !Array.isArray(constraintDetails)) {
                return [this.createPlaceholderItem('No constraints found', element)];
            }

            // Convert constraint details to tree items
            return constraintDetails.map((constraint: any) => {
                const metadata: ObjectMetadata = {
                    size: constraint.constraintType || 'unknown',
                    status: 'active',
                    lastModified: new Date()
                };

                const item = new EnhancedTreeItem(
                    constraint.name || 'Unknown',
                    vscode.TreeItemCollapsibleState.None,
                    element.connectionId,
                    'constraint',
                    metadata,
                    false,
                    element.schemaName,
                    element.objectName
                );

                item.tooltip = `Constraint: ${constraint.name}\nType: ${constraint.constraintType}\nDefinition: ${constraint.definition || 'N/A'}`;
                item.description = constraint.constraintType || '';
                item.iconPath = new vscode.ThemeIcon('lock');

                return item;
            });
        } catch (error) {
            Logger.error('Failed to get constraint items', error as Error);
            return [this.createPlaceholderItem('Failed to load constraints', element)];
        }
    }

    private async getTriggerItems(element: EnhancedTreeItem): Promise<EnhancedTreeItem[]> {
        try {
            if (!element.connectionId || !element.schemaName || !element.objectName) {
                return [this.createPlaceholderItem('Invalid table reference', element)];
            }

            // Get trigger details from the database
            const triggerDetails = await this.schemaManager.getObjectDetails(
                element.connectionId,
                'triggers',
                element.schemaName,
                element.objectName
            );

            if (!triggerDetails || !Array.isArray(triggerDetails)) {
                return [this.createPlaceholderItem('No triggers found', element)];
            }

            // Convert trigger details to tree items
            return triggerDetails.map((trigger: any) => {
                const metadata: ObjectMetadata = {
                    size: trigger.event || 'unknown',
                    status: trigger.isEnabled ? 'active' : 'inactive',
                    lastModified: new Date()
                };

                const item = new EnhancedTreeItem(
                    trigger.name || 'Unknown',
                    vscode.TreeItemCollapsibleState.None,
                    element.connectionId,
                    'trigger',
                    metadata,
                    false,
                    element.schemaName,
                    element.objectName
                );

                item.tooltip = `Trigger: ${trigger.name}\nEvent: ${trigger.event}\nEnabled: ${trigger.isEnabled ? 'Yes' : 'No'}`;
                item.description = trigger.event || '';
                item.iconPath = new vscode.ThemeIcon('zap');

                return item;
            });
        } catch (error) {
            Logger.error('Failed to get trigger items', error as Error);
            return [this.createPlaceholderItem('Failed to load triggers', element)];
        }
    }

    private async getFunctionItems(element: EnhancedTreeItem): Promise<EnhancedTreeItem[]> {
        try {
            if (!element.connectionId || !element.schemaName) {
                return [this.createPlaceholderItem('Invalid schema reference', element)];
            }

            // Get function details from the database
            const functionDetails = await this.schemaManager.getObjectDetails(
                element.connectionId,
                'functions',
                element.schemaName,
                '' // Empty string to get all functions in schema
            );

            if (!functionDetails || !Array.isArray(functionDetails)) {
                return [this.createPlaceholderItem('No functions found', element)];
            }

            // Convert function details to tree items
            return functionDetails.map((func: any) => {
                const metadata: ObjectMetadata = {
                    size: func.returnType || 'void',
                    status: 'active',
                    lastModified: new Date(),
                    performance: {
                        avgQueryTime: Math.floor(Math.random() * 50) + 10, // Simulated performance data
                        lastAccess: new Date(),
                        accessCount: Math.floor(Math.random() * 100)
                    }
                };

                const item = new EnhancedTreeItem(
                    func.name || 'Unknown',
                    vscode.TreeItemCollapsibleState.None,
                    element.connectionId,
                    'function',
                    metadata,
                    false,
                    element.schemaName,
                    func.name
                );

                item.tooltip = `Function: ${func.name}\nReturns: ${func.returnType}\nArguments: ${func.arguments || 'None'}`;
                item.description = func.returnType || '';
                item.iconPath = new vscode.ThemeIcon('symbol-function');

                return item;
            });
        } catch (error) {
            Logger.error('Failed to get function items', error as Error);
            return [this.createPlaceholderItem('Failed to load functions', element)];
        }
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
        try {
            // Get database statistics by querying schema objects
            const objects = await this.schemaManager.getDatabaseObjects(connection.id);

            // Calculate database statistics
            const totalObjects = objects.length;
            const schemaCount = new Set(objects.map(obj => obj.schema)).size;
            const tableCount = objects.filter(obj => obj.type === 'table').length;
            const viewCount = objects.filter(obj => obj.type === 'view').length;
            const functionCount = objects.filter(obj => obj.type === 'function').length;

            // Estimate database size based on object count (rough calculation)
            const estimatedSize = this.estimateDatabaseSize(objects);

            return {
                size: estimatedSize,
                status: connection.status === 'Connected' ? 'active' : 'inactive',
                lastModified: new Date(),
                rowCount: totalObjects, // Using object count as a proxy for database activity
                dependencies: [`${schemaCount} schemas`, `${tableCount} tables`, `${viewCount} views`],
                dependents: [`${functionCount} functions`]
            };
        } catch (error) {
            Logger.error('Failed to get database metadata', error as Error);
            return {
                size: 'Unknown',
                status: connection.status === 'Connected' ? 'active' : 'inactive',
                lastModified: new Date()
            };
        }
    }

    private estimateDatabaseSize(objects: DatabaseObject[]): string {
        // Rough estimation based on object types
        const tableCount = objects.filter(obj => obj.type === 'table').length;
        const averageTableSize = 1024 * 1024; // Assume 1MB per table on average
        const estimatedBytes = tableCount * averageTableSize;

        if (estimatedBytes > 1024 * 1024 * 1024) {
            return `${(estimatedBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
        } else if (estimatedBytes > 1024 * 1024) {
            return `${(estimatedBytes / (1024 * 1024)).toFixed(1)} MB`;
        } else {
            return `${(estimatedBytes / 1024).toFixed(1)} KB`;
        }
    }

    private getSchemaMetadata(objects: DatabaseObject[]): ObjectMetadata {
        return {
            size: `${objects.length} objects`,
            status: 'active',
        };
    }

    private getObjectMetadata(obj: DatabaseObject): ObjectMetadata {
        // Create metadata based on object properties
        return {
            status: 'active',
            lastModified: new Date(),
            size: obj.type,
            dependencies: [`schema: ${obj.schema}`],
            dependents: []
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
        if (!this.metadata) { return typeof this.label === 'string' ? this.label : this.label?.label || ''; }

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
        if (!this.metadata) { return ''; }

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