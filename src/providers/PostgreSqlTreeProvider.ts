import * as vscode from 'vscode';
import { ConnectionManager, DatabaseConnection } from '@/managers/ConnectionManager';
import { ModularSchemaManager } from '@/managers/schema';
// DatabaseObject and ObjectType are now defined in SchemaOperations
import { DatabaseObject, ObjectType } from '@/managers/schema/SchemaOperations';
import { Logger } from '@/utils/Logger';
import { ExtensionInitializer } from '@/utils/ExtensionInitializer';
export class PostgreSqlTreeProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | void> = new vscode.EventEmitter<TreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | void> = this._onDidChangeTreeData.event;

    private connections: DatabaseConnection[] = [];
    private schemaObjects: Map<string, DatabaseObject[]> = new Map();

    constructor(
        private connectionManager: ConnectionManager,
        private schemaManager: ModularSchemaManager
    ) {
        this.refresh();
    }

    refresh(): void {
        const operationId = `tree-refresh-${Date.now()}`;

        try {
            Logger.debug('Refreshing tree provider');

            // Start operation tracking for tree refresh
            const statusBarProvider = ExtensionInitializer.getStatusBarProvider();
            const operationSteps = [
                { id: 'connections', name: 'Loading connections', status: 'pending' as const },
                { id: 'schemas', name: 'Loading schemas', status: 'pending' as const },
                { id: 'complete', name: 'Completing refresh', status: 'pending' as const }
            ];

            const operationIndicator = statusBarProvider.startOperation(operationId, 'Refresh Explorer', {
                message: 'Refreshing PostgreSQL explorer...',
                cancellable: true,
                steps: operationSteps,
                estimatedDuration: 10000 // 10 seconds estimated
            });

            // Step 1: Load connections
            statusBarProvider.updateOperationStep(operationId, 0, 'running', {
                message: 'Loading connections...'
            });

            this.connections = this.connectionManager.getConnections();

            // Step 2: Load schemas for all connections
            statusBarProvider.updateOperationStep(operationId, 0, 'completed');
            statusBarProvider.updateOperationStep(operationId, 1, 'running', {
                message: 'Loading schemas...'
            });

            // Load schema objects for all connections (this could be long-running)
            const loadPromises = this.connections.map(async (connection) => {
                try {
                    const objects = await this.schemaManager.getDatabaseObjects(connection.id) || [];
                    this.schemaObjects.set(connection.id, objects);
                } catch (error) {
                    Logger.warn('Failed to load schema for connection', 'refresh', {
                        connectionId: connection.id,
                        error: (error as Error).message
                    });
                }
            });

            // Wait for all schema loading to complete
            Promise.all(loadPromises).then(() => {
                // Step 3: Complete
                statusBarProvider.updateOperationStep(operationId, 1, 'completed');
                statusBarProvider.updateOperationStep(operationId, 2, 'running', {
                    message: 'Completing refresh...'
                });

                this._onDidChangeTreeData.fire();

                statusBarProvider.updateOperationStep(operationId, 2, 'completed');
                statusBarProvider.updateOperation(operationId, 'completed', {
                    message: `Explorer refreshed (${this.connections.length} connections)`
                });
            }).catch((error) => {
                statusBarProvider.updateOperation(operationId, 'failed', {
                    message: `Refresh failed: ${(error as Error).message}`
                });
                throw error;
            });

        } catch (error) {
            Logger.error('Failed to refresh tree provider', error as Error);
            this._onDidChangeTreeData.fire();
            throw error;
        }
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TreeItem): Promise<TreeItem[]> {
        try {
            if (!element) {
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
                    new vscode.ThemeIcon('database'),
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
            const hasError = connection.status === 'Error';
            const isConnecting = connection.status === 'Connecting';

            // Enhanced status indicators
            let icon: vscode.ThemeIcon;
            let statusColor: vscode.ThemeColor | undefined;
            let statusEmoji = '';

            if (isConnected) {
                icon = new vscode.ThemeIcon('debug-start');
                statusColor = new vscode.ThemeColor('debugIcon.startForeground');
                statusEmoji = '🟢';
            } else if (hasError) {
                icon = new vscode.ThemeIcon('error');
                statusColor = new vscode.ThemeColor('debugIcon.stopForeground');
                statusEmoji = '🔴';
            } else if (isConnecting) {
                icon = new vscode.ThemeIcon('sync~spin');
                statusColor = new vscode.ThemeColor('debugIcon.pauseForeground');
                statusEmoji = '🟡';
            } else {
                icon = new vscode.ThemeIcon('debug-breakpoint');
                statusColor = new vscode.ThemeColor('debugIcon.stopForeground');
                statusEmoji = '⚫';
            }

            // Enhanced tooltip with detailed connection information
            const tooltip = [
                `Connection: ${connection.name}`,
                `Host: ${connection.host}:${connection.port}`,
                `Database: ${connection.database}`,
                `Status: ${connection.status}`,
                ...(connection.lastConnected ? [`Last Connected: ${new Date(connection.lastConnected).toLocaleString()}`] : []),
                ...(connection.lastError ? [`Error: ${connection.lastError}`] : [])
            ].join('\n');

            // Enhanced description with connection details
            const description = `${connection.host}:${connection.port} • ${connection.database}`;

            const item = new TreeItem(
                `${statusEmoji} ${connection.name}`,
                'connection',
                icon,
                vscode.TreeItemCollapsibleState.Collapsed,
                {
                    command: 'postgresql.testConnection',
                    title: 'Test Connection',
                    arguments: [{ id: connection.id, name: connection.name }]
                },
                tooltip,
                connection.id,
                undefined,
                undefined,
                'connection',
                description,
                statusColor
            );

            // Add enhanced context menu for connections
            item.contextValue = `connection${isConnected ? '' : ' disconnected'}${hasError ? ' error' : ''}`;

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
                objects = await this.schemaManager.getDatabaseObjects(connectionId) || [];
                this.schemaObjects.set(connectionId, objects);
            }

            // Group objects by schema
            const schemaGroups = new Map<string, DatabaseObject[]>();
            for (const obj of objects) {
                if (obj.type === ObjectType.Schema) {
                    schemaGroups.set(obj.name, []);
                }
            }

            // Add objects to their respective schemas
            for (const obj of objects) {
                if (obj.type !== ObjectType.Schema && obj.schema) {
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

                // Enhanced tooltip for schema
                const connectionObj = this.connections.find(c => c.id === connectionId);
                const tooltip = [
                    `Schema: ${schemaName}`,
                    `Total Objects: ${schemaObjects.length}`,
                    `Connection: ${connectionObj?.name}`,
                    ``,
                    `Object Breakdown:`,
                    ...Object.entries(objectCounts).map(([type, count]) => `  ${count} ${type}${count !== 1 ? 's' : ''}`)
                ].join('\n');

                return new TreeItem(
                    schemaName,
                    'schema',
                    new vscode.ThemeIcon('symbol-namespace'),
                    vscode.TreeItemCollapsibleState.Collapsed,
                    undefined,
                    tooltip,
                    connectionId,
                    schemaName,
                    undefined,
                    'schema',
                    summary
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
                objects = await this.schemaManager.getDatabaseObjects(connectionId) || [];
                this.schemaObjects.set(connectionId, objects);
            }

            const schemaObjects = objects.filter(obj =>
                obj.schema === schemaName && obj.type !== ObjectType.Schema
            );

            return schemaObjects.map(obj => {
                const icon = this.getObjectIcon(obj.type);
                const collapsibleState = this.isContainerType(obj.type)
                    ? vscode.TreeItemCollapsibleState.Collapsed
                    : vscode.TreeItemCollapsibleState.None;

                // Enhanced tooltip for database objects
                const tooltip = [
                    `Object: ${obj.name}`,
                    `Type: ${obj.type}`,
                    `Schema: ${obj.schema}`,
                    ...(obj.sizeInBytes ? [`Size: ${(obj.sizeInBytes / 1024).toFixed(2)} KB`] : []),
                    ...(obj.modifiedAt ? [`Last Modified: ${new Date(obj.modifiedAt).toLocaleString()}`] : []),
                    ...(obj.createdAt ? [`Created: ${new Date(obj.createdAt).toLocaleString()}`] : []),
                    ...(obj.owner ? [`Owner: ${obj.owner}`] : [])
                ].join('\n');

                // Enhanced description with additional metadata
                const sizeInfo = obj.sizeInBytes ? ` (${(obj.sizeInBytes / 1024).toFixed(1)} KB)` : '';
                const description = obj.type + sizeInfo;

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
                    tooltip,
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
export class TreeItem extends vscode.TreeItem {
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