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
            // Load schema objects from the database (check cache first)
            let objects = this.schemaObjects.get(connectionId);
            if (!objects) {
                objects = await this.schemaManager.getDatabaseObjects(connectionId);
                this.schemaObjects.set(connectionId, objects);
            }

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
            // Load schema objects from the database (check cache first)
            let objects = this.schemaObjects.get(connectionId);
            if (!objects) {
                objects = await this.schemaManager.getDatabaseObjects(connectionId);
                this.schemaObjects.set(connectionId, objects);
            }

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

    private async getTableChildItems(_treeItem: any): Promise<TreeItem[]> {
        const children: TreeItem[] = [];

        // Add columns section
        children.push(new TreeItem(
            'Columns',
            'columns',
            new vscode.ThemeIcon('list-flat'),
            vscode.TreeItemCollapsibleState.Collapsed,
            {
                command: 'postgresql.viewTableColumns',
                title: 'View Columns',
                arguments: [_treeItem.connectionId, _treeItem.schemaName, _treeItem.objectName]
            },
            'Table columns',
            _treeItem.connectionId,
            _treeItem.schemaName,
            _treeItem.objectName,
            'columns',
            'View table columns'
        ));

        // Add indexes section
        children.push(new TreeItem(
            'Indexes',
            'indexes',
            new vscode.ThemeIcon('list-ordered'),
            vscode.TreeItemCollapsibleState.Collapsed,
            {
                command: 'postgresql.viewTableIndexes',
                title: 'View Indexes',
                arguments: [_treeItem.connectionId, _treeItem.schemaName, _treeItem.objectName]
            },
            'Table indexes',
            _treeItem.connectionId,
            _treeItem.schemaName,
            _treeItem.objectName,
            'indexes',
            'View table indexes'
        ));

        // Add constraints section
        children.push(new TreeItem(
            'Constraints',
            'constraints',
            new vscode.ThemeIcon('lock'),
            vscode.TreeItemCollapsibleState.Collapsed,
            {
                command: 'postgresql.viewTableConstraints',
                title: 'View Constraints',
                arguments: [_treeItem.connectionId, _treeItem.schemaName, _treeItem.objectName]
            },
            'Table constraints',
            _treeItem.connectionId,
            _treeItem.schemaName,
            _treeItem.objectName,
            'constraints',
            'View table constraints'
        ));

        // Add triggers section
        children.push(new TreeItem(
            'Triggers',
            'triggers',
            new vscode.ThemeIcon('zap'),
            vscode.TreeItemCollapsibleState.Collapsed,
            {
                command: 'postgresql.viewTableTriggers',
                title: 'View Triggers',
                arguments: [_treeItem.connectionId, _treeItem.schemaName, _treeItem.objectName]
            },
            'Table triggers',
            _treeItem.connectionId,
            _treeItem.schemaName,
            _treeItem.objectName,
            'triggers',
            'View table triggers'
        ));

        return children;
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