import * as vscode from 'vscode';
import { ConnectionManager, DatabaseConnection } from '../managers/ConnectionManager';
import { SchemaManager, DatabaseObject } from '../managers/SchemaManager';
import { Logger } from '../utils/Logger';

export class PostgreSqlTreeProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | void> = new vscode.EventEmitter<TreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | void> = this._onDidChangeTreeData.event;

    private connections: DatabaseConnection[] = [];
    private schemaObjects: Map<string, DatabaseObject[]> = new Map();

    constructor(
        private connectionManager: ConnectionManager,
        private schemaManager: SchemaManager
    ) {
        this.refresh();
    }

    refresh(): void {
        Logger.debug('Refreshing tree provider');
        this.connections = this.connectionManager.getConnections();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TreeItem): Promise<TreeItem[]> {
        try {
            if (!element) {
                // Root level - show connections
                return this.getConnectionItems();
            }

            const _treeItem = element as any;
            switch (_treeItem.type) {
                case 'connection':
                    return this.getDatabaseItems(_treeItem.connectionId);
                case 'database':
                    return this.getSchemaItems(_treeItem.connectionId);
                case 'schema':
                    return this.getObjectItems(_treeItem.connectionId, _treeItem.schemaName);
                case 'table':
                case 'view':
                    return this.getTableChildItems(_treeItem);
                default:
                    return [];
            }
        } catch (error) {
            Logger.error('Failed to get tree children', error as Error);
            return [];
        }
    }

    private getConnectionItems(): TreeItem[] {
        if (this.connections.length === 0) {
            return [
                new TreeItem(
                    'No PostgreSQL Connections',
                    'noConnections',
                    'database',
                    vscode.TreeItemCollapsibleState.None,
                    {
                        command: 'postgresql.addConnection',
                        title: 'Add Connection',
                        arguments: []
                    },
                    'Click to add your first PostgreSQL database connection',
                    undefined,
                    undefined,
                    undefined,
                    'noConnections',
                    'Add a connection to get started'
                )
            ];
        }

        return this.connections.map(connection => {
            const isConnected = connection.status === 'Connected';
            const statusIcon = isConnected ? 'check' : 'warning';
            const statusColor = isConnected ?
                new vscode.ThemeColor('debugIcon.startForeground') :
                new vscode.ThemeColor('debugIcon.stopForeground');

            const item = new TreeItem(
                connection.name,
                'connection',
                isConnected ? new vscode.ThemeIcon('debug-start') : new vscode.ThemeIcon('debug-breakpoint'),
                vscode.TreeItemCollapsibleState.Collapsed,
                {
                    command: 'postgresql.testConnection',
                    title: 'Test Connection',
                    arguments: [{ id: connection.id, name: connection.name }]
                },
                `${connection.host}:${connection.port}${isConnected ? ' (Connected)' : ' (Disconnected)'}`,
                connection.id,
                undefined,
                undefined,
                'connection',
                isConnected ? 'Connected' : 'Disconnected',
                statusColor
            );

            // Add enhanced context menu for connections
            item.contextValue = 'connection';

            return item;
        });
    }

    private async getDatabaseItems(connectionId: string): Promise<TreeItem[]> {
        const connection = this.connections.find(c => c.id === connectionId);
        if (!connection) {
            return [];
        }

        return [
            new TreeItem(
                connection.database,
                'database',
                new vscode.ThemeIcon('database'),
                vscode.TreeItemCollapsibleState.Collapsed,
                undefined,
                `Database: ${connection.database}`,
                connectionId,
                undefined,
                undefined,
                'database',
                'PostgreSQL database'
            )
        ];
    }

    private async getSchemaItems(connectionId: string): Promise<TreeItem[]> {
        try {
            // Load schema objects from the database
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
                const objectCounts = schemaObjects.reduce((acc, obj) => {
                    acc[obj.type] = (acc[obj.type] || 0) + 1;
                    return acc;
                }, {} as Record<string, number>);

                const summary = Object.entries(objectCounts)
                    .map(([type, count]) => `${count} ${type}`)
                    .join(', ');

                return new TreeItem(
                    schemaName,
                    'schema',
                    new vscode.ThemeIcon('symbol-namespace'),
                    vscode.TreeItemCollapsibleState.Collapsed,
                    undefined,
                    summary,
                    connectionId,
                    schemaName,
                    undefined,
                    'schema',
                    `${schemaObjects.length} objects`
                );
            });
        } catch (error) {
            Logger.error('Failed to get schema items', error as Error);
            return [];
        }
    }

    private async getObjectItems(connectionId: string, schemaName: string): Promise<TreeItem[]> {
        try {
            // Load schema objects from the database
            const objects = await this.schemaManager.getDatabaseObjects(connectionId);
            this.schemaObjects.set(connectionId, objects);

            const schemaObjects = objects.filter(obj =>
                obj.schema === schemaName && obj.type !== 'schema'
            );

            return schemaObjects.map(obj => {
                const icon = this.getObjectIcon(obj.type);
                const collapsibleState = this.isContainerType(obj.type)
                    ? vscode.TreeItemCollapsibleState.Collapsed
                    : vscode.TreeItemCollapsibleState.None;

                const description = obj.type;

                return new TreeItem(
                    obj.name,
                    obj.type,
                    icon,
                    collapsibleState,
                    {
                        command: 'postgresql.viewObjectDetails',
                        title: 'View Details',
                        arguments: [obj]
                    },
                    `${obj.type}: ${obj.name}`,
                    connectionId,
                    schemaName,
                    obj.name,
                    obj.type,
                    description
                );
            });
        } catch (error) {
            Logger.error('Failed to get object items', error as Error);
            return [];
        }
    }

    private getTableChildItems(_treeItem: any): TreeItem[] {
        return [
            new TreeItem(
                'Columns',
                'columns',
                new vscode.ThemeIcon('list-flat'),
                vscode.TreeItemCollapsibleState.Collapsed,
                undefined,
                'Table columns',
                _treeItem.connectionId,
                _treeItem.schemaName,
                _treeItem.objectName,
                'columns',
                'View table columns'
            ),
            new TreeItem(
                'Indexes',
                'indexes',
                new vscode.ThemeIcon('list-ordered'),
                vscode.TreeItemCollapsibleState.Collapsed,
                undefined,
                'Table indexes',
                _treeItem.connectionId,
                _treeItem.schemaName,
                _treeItem.objectName,
                'indexes',
                'View table indexes'
            ),
            new TreeItem(
                'Constraints',
                'constraints',
                new vscode.ThemeIcon('lock'),
                vscode.TreeItemCollapsibleState.Collapsed,
                undefined,
                'Table constraints',
                _treeItem.connectionId,
                _treeItem.schemaName,
                _treeItem.objectName,
                'constraints',
                'View table constraints'
            ),
            new TreeItem(
                'Triggers',
                'triggers',
                new vscode.ThemeIcon('zap'),
                vscode.TreeItemCollapsibleState.Collapsed,
                undefined,
                'Table triggers',
                _treeItem.connectionId,
                _treeItem.schemaName,
                _treeItem.objectName,
                'triggers',
                'View table triggers'
            )
        ];
    }

    private getObjectIcon(type: string): vscode.ThemeIcon {
        switch (type) {
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
            case 'schema': return new vscode.ThemeIcon('symbol-namespace');
            default: return new vscode.ThemeIcon('question');
        }
    }

    // Enhanced features for better UX

    /**
     * Get context menu items for tree items
     */
    getContextMenuItems(element: TreeItem): vscode.Command[] {
        const commands: vscode.Command[] = [];

        switch (element.type) {
            case 'connection':
                commands.push(
                    { command: 'postgresql.testConnection', title: 'Test Connection' },
                    { command: 'postgresql.refreshConnection', title: 'Refresh' },
                    { command: 'postgresql.editConnection', title: 'Edit Connection' },
                    { command: 'postgresql.duplicateConnection', title: 'Duplicate Connection' },
                    { command: 'postgresql.removeConnection', title: 'Remove Connection' },
                    { command: 'postgresql.connectionInfo', title: 'Connection Information' }
                );
                break;

            case 'database':
                commands.push(
                    { command: 'postgresql.refreshDatabase', title: 'Refresh Database' },
                    { command: 'postgresql.databaseInfo', title: 'Database Information' },
                    { command: 'postgresql.backupDatabase', title: 'Backup Database' }
                );
                break;

            case 'schema':
                commands.push(
                    { command: 'postgresql.refreshSchema', title: 'Refresh Schema' },
                    { command: 'postgresql.schemaInfo', title: 'Schema Information' },
                    { command: 'postgresql.compareSchema', title: 'Compare Schema' }
                );
                break;

            case 'table':
                commands.push(
                    { command: 'postgresql.viewTableData', title: 'View Data' },
                    { command: 'postgresql.editTable', title: 'Edit Table' },
                    { command: 'postgresql.tableInfo', title: 'Table Information' },
                    { command: 'postgresql.compareTable', title: 'Compare Table' },
                    { command: 'postgresql.generateMigration', title: 'Generate Migration' },
                    { command: 'postgresql.exportTableData', title: 'Export Data' },
                    { command: 'postgresql.truncateTable', title: 'Truncate Table' }
                );
                break;

            case 'view':
                commands.push(
                    { command: 'postgresql.viewViewData', title: 'View Data' },
                    { command: 'postgresql.editView', title: 'Edit View' },
                    { command: 'postgresql.viewInfo', title: 'View Information' },
                    { command: 'postgresql.compareView', title: 'Compare View' },
                    { command: 'postgresql.exportViewData', title: 'Export Data' }
                );
                break;

            case 'function':
            case 'procedure':
                commands.push(
                    { command: 'postgresql.editFunction', title: 'Edit Function' },
                    { command: 'postgresql.functionInfo', title: 'Function Information' },
                    { command: 'postgresql.testFunction', title: 'Test Function' },
                    { command: 'postgresql.debugFunction', title: 'Debug Function' }
                );
                break;

            case 'index':
                commands.push(
                    { command: 'postgresql.indexInfo', title: 'Index Information' },
                    { command: 'postgresql.rebuildIndex', title: 'Rebuild Index' },
                    { command: 'postgresql.dropIndex', title: 'Drop Index' }
                );
                break;

            case 'trigger':
                commands.push(
                    { command: 'postgresql.triggerInfo', title: 'Trigger Information' },
                    { command: 'postgresql.enableTrigger', title: 'Enable Trigger' },
                    { command: 'postgresql.disableTrigger', title: 'Disable Trigger' }
                );
                break;
        }

        return commands;
    }

    /**
     * Handle drag and drop operations
     */
    handleDrag(element: TreeItem, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): void {
        // Add object information to drag data
        if (element.type === 'table' || element.type === 'view') {
            const dragData = {
                type: 'database_object',
                objectType: element.type,
                objectName: element.objectName,
                schemaName: element.schemaName,
                connectionId: element.connectionId,
                source: 'tree_view'
            };

            dataTransfer.set('application/json', new vscode.DataTransferItem(JSON.stringify(dragData)));
        }
    }

    /**
     * Handle drop operations
     */
    async handleDrop(target: TreeItem, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
        const transferItem = dataTransfer.get('application/json');
        if (!transferItem) return;

        try {
            const dragData = JSON.parse(await transferItem.asString());

            if (dragData.type === 'database_object' && target.type === 'connection') {
                // Handle dropping table/view onto another connection for comparison
                await vscode.commands.executeCommand('postgresql.compareObjects', {
                    sourceObject: dragData,
                    targetConnection: target.connectionId
                });
            }
        } catch (error) {
            Logger.error('Failed to handle drop operation', error as Error);
        }
    }

    /**
     * Get enhanced tooltip with additional information
     */
    getEnhancedTooltip(element: TreeItem): string {
        let tooltip = '';

        if (typeof element.tooltip === 'string') {
            tooltip = element.tooltip;
        } else if (element.tooltip) {
            tooltip = element.tooltip.toString();
        } else {
            tooltip = typeof element.label === 'string' ? element.label : (element.label?.label || '');
        }

        switch (element.type) {
            case 'connection':
                const connection = this.connections.find(c => c.id === element.connectionId);
                if (connection) {
                    tooltip += `\n\nConnection Details:\n`;
                    tooltip += `Host: ${connection.host}\n`;
                    tooltip += `Port: ${connection.port}\n`;
                    tooltip += `Database: ${connection.database}\n`;
                    tooltip += `Status: ${connection.status}\n`;
                    // Connection timestamp information would be available in enhanced connection model
                    // if (connection.lastConnected) {
                    //     tooltip += `Last Connected: ${new Date(connection.lastConnected).toLocaleString()}\n`;
                    // }
                }
                break;

            case 'table':
                tooltip += `\n\nRight-click for table options\nDrag to compare with other tables`;
                break;

            case 'view':
                tooltip += `\n\nRight-click for view options\nDrag to compare with other views`;
                break;
        }

        return tooltip;
    }

    /**
     * Search and filter tree items
     */
    setSearchFilter(filter: string): void {
        this.searchFilter = filter.toLowerCase();
        this.refresh();
    }

    private searchFilter: string = '';

    /**
     * Enhanced refresh with progress indication
     */
    async refreshWithProgress(): Promise<void> {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Refreshing PostgreSQL Tree',
            cancellable: false
        }, async (progress, token) => {
            progress.report({ increment: 0, message: 'Loading connections...' });

            try {
                this.connections = this.connectionManager.getConnections();
                progress.report({ increment: 50, message: 'Loading schema objects...' });

                // Refresh schema objects for all connections
                for (const connection of this.connections) {
                    if (token.isCancellationRequested) break;

                    try {
                        await this.schemaManager.getDatabaseObjects(connection.id);
                    } catch (error) {
                        Logger.warn(`Failed to refresh schema for connection ${connection.name}`, error as Error);
                    }
                }

                progress.report({ increment: 100, message: 'Complete' });
                this._onDidChangeTreeData.fire();

            } catch (error) {
                Logger.error('Failed to refresh tree with progress', error as Error);
                throw error;
            }
        });
    }

    /**
     * Get quick actions for tree items
     */
    getQuickActions(element: TreeItem): vscode.Command[] {
        const actions: vscode.Command[] = [];

        switch (element.type) {
            case 'connection':
                if (element.description === 'Connected') {
                    actions.push(
                        { command: 'postgresql.browseSchema', title: 'Browse Schema', arguments: [element.connectionId] },
                        { command: 'postgresql.runQuery', title: 'Run Query', arguments: [element.connectionId] }
                    );
                } else {
                    actions.push(
                        { command: 'postgresql.testConnection', title: 'Test Connection', arguments: [element.connectionId] }
                    );
                }
                break;

            case 'table':
                actions.push(
                    { command: 'postgresql.viewTableData', title: 'View Data', arguments: [element] },
                    { command: 'postgresql.tableInfo', title: 'Info', arguments: [element] }
                );
                break;

            case 'view':
                actions.push(
                    { command: 'postgresql.viewViewData', title: 'View Data', arguments: [element] },
                    { command: 'postgresql.viewInfo', title: 'Info', arguments: [element] }
                );
                break;
        }

        return actions;
    }

    private isContainerType(type: string): boolean {
        return ['table', 'view'].includes(type);
    }
}

class TreeItem extends vscode.TreeItem {
    public connectionId?: string | undefined;
    public schemaName?: string | undefined;
    public objectName?: string | undefined;

    constructor(
        label: string,
        public type: string,
        icon: string | vscode.ThemeIcon,
        collapsibleState: vscode.TreeItemCollapsibleState,
        command?: vscode.Command,
        tooltip?: string,
        connectionId?: string,
        schemaName?: string,
        objectName?: string,
        contextValue?: string,
        description?: string | undefined,
        statusColor?: vscode.ThemeColor
    ) {
        super(label, collapsibleState);

        this.iconPath = icon;
        this.tooltip = tooltip;
        this.contextValue = contextValue || type;
        if (description) {
            this.description = description;
        }

        if (command) {
            this.command = command;
        }

        if (statusColor) {
            // Add visual indicator for status
            this.resourceUri = vscode.Uri.parse(`postgresql://${connectionId}`);
        }

        // Store additional properties
        this.connectionId = connectionId;
        this.schemaName = schemaName;
        this.objectName = objectName;
    }
}