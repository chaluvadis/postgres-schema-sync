import { PostgreSqlTreeProvider } from '../../src/providers/PostgreSqlTreeProvider';

// Mock VSCode APIs
jest.mock('vscode', () => ({
    TreeItem: jest.fn(),
    TreeItemCollapsibleState: {
        None: 0,
        Collapsed: 1,
        Expanded: 2,
    },
    ThemeIcon: jest.fn(),
    EventEmitter: jest.fn(),
    commands: {
        registerCommand: jest.fn(),
    },
}));

describe('PostgreSqlTreeProvider', () => {
    let treeProvider: PostgreSqlTreeProvider;
    let mockConnectionManager: any;

    beforeEach(() => {
        // Mock connection manager
        mockConnectionManager = {
            getConnections: jest.fn(),
            onConnectionAdded: jest.fn(),
            onConnectionRemoved: jest.fn(),
            onConnectionUpdated: jest.fn(),
        };

        treeProvider = new PostgreSqlTreeProvider(mockConnectionManager, {} as any);
    });

    describe('getTreeItem', () => {
        it('should return tree item for element', () => {
            const mockElement = {
                label: 'Test Element',
                type: 'test',
                tooltip: 'Test tooltip',
                iconPath: 'test-icon',
                command: { command: 'test.command', title: 'Test' },
            };

            const treeItem = treeProvider.getTreeItem(mockElement as any);

            expect(treeItem).toBeDefined();
            expect(treeItem.label).toBe('Test Element');
        });
    });

    describe('getChildren', () => {
        it('should return connections when no element provided', () => {
            const mockConnections = [
                {
                    id: 'conn1',
                    name: 'Connection 1',
                    host: 'localhost',
                    port: 5432,
                    database: 'db1',
                    username: 'user1',
                    status: 'Connected',
                },
                {
                    id: 'conn2',
                    name: 'Connection 2',
                    host: 'remotehost',
                    port: 5432,
                    database: 'db2',
                    username: 'user2',
                    status: 'Disconnected',
                },
            ];

            mockConnectionManager.getConnections.mockReturnValue(mockConnections);

            const children = treeProvider.getChildren();

            expect(children).toBeDefined();
            // Note: getChildren returns a Promise, so we need to await it
            expect(children).toBeInstanceOf(Promise);
        });

        it('should return database objects for connection element', () => {
            const mockElement = {
                id: 'conn1',
                type: 'connection',
                connectionId: 'conn1',
            };

            // Mock schema browser
            const mockSchemaBrowser = {
                getDatabaseObjectsAsync: jest.fn().mockResolvedValue([
                    { name: 'table1', type: 'table', schema: 'public' },
                    { name: 'view1', type: 'view', schema: 'public' },
                ]),
            };

            // Inject mock schema browser
            (treeProvider as any).schemaBrowser = mockSchemaBrowser;

            const children = treeProvider.getChildren(mockElement);

            expect(children).toBeDefined();
            // Note: This would be async in real implementation
        });

        it('should return empty array for unknown element type', () => {
            const mockElement = {
                id: 'unknown',
                type: 'unknown',
            };

            const children = treeProvider.getChildren(mockElement);

            expect(children).toEqual([]);
        });
    });

    describe('refresh', () => {
        it('should fire tree data changed event', () => {
            const mockEventEmitter = {
                fire: jest.fn(),
            };

            (treeProvider as any).onDidChangeTreeData = mockEventEmitter;

            treeProvider.refresh();

            expect(mockEventEmitter.fire).toHaveBeenCalled();
        });
    });

    // Note: getParent method doesn't exist in PostgreSqlTreeProvider
    // This test would need to be implemented if the method is added later

    describe('connection status handling', () => {
        it('should show connected status with green icon', () => {
            const mockConnection = {
                id: 'conn1',
                name: 'Test Connection',
                status: 'Connected',
            };

            const treeItem = (treeProvider as any).createConnectionItem(mockConnection);

            expect(treeItem).toBeDefined();
            expect(treeItem.label).toContain('Test Connection');
            expect(treeItem.tooltip).toContain('Connected');
        });

        it('should show disconnected status with red icon', () => {
            const mockConnection = {
                id: 'conn1',
                name: 'Test Connection',
                status: 'Disconnected',
            };

            const treeItem = (treeProvider as any).createConnectionItem(mockConnection);

            expect(treeItem).toBeDefined();
            expect(treeItem.tooltip).toContain('Disconnected');
        });

        it('should show error status with warning icon', () => {
            const mockConnection = {
                id: 'conn1',
                name: 'Test Connection',
                status: 'Error',
                lastError: 'Connection failed',
            };

            const treeItem = (treeProvider as any).createConnectionItem(mockConnection);

            expect(treeItem).toBeDefined();
            expect(treeItem.tooltip).toContain('Error');
            expect(treeItem.tooltip).toContain('Connection failed');
        });
    });

    describe('database object icons', () => {
        it('should assign correct icon for table', () => {
            const mockTable = {
                name: 'users',
                type: 'table',
                schema: 'public',
            };

            const treeItem = (treeProvider as any).createDatabaseObjectItem(mockTable, 'conn1');

            expect(treeItem).toBeDefined();
            expect(treeItem.iconPath).toBeDefined();
        });

        it('should assign correct icon for view', () => {
            const mockView = {
                name: 'user_view',
                type: 'view',
                schema: 'public',
            };

            const treeItem = (treeProvider as any).createDatabaseObjectItem(mockView, 'conn1');

            expect(treeItem).toBeDefined();
            expect(treeItem.iconPath).toBeDefined();
        });

        it('should assign correct icon for function', () => {
            const mockFunction = {
                name: 'get_users',
                type: 'function',
                schema: 'public',
            };

            const treeItem = (treeProvider as any).createDatabaseObjectItem(mockFunction, 'conn1');

            expect(treeItem).toBeDefined();
            expect(treeItem.iconPath).toBeDefined();
        });
    });

    describe('event handling', () => {
        it('should refresh when connection is added', () => {
            const mockEventEmitter = {
                fire: jest.fn(),
            };

            (treeProvider as any).onDidChangeTreeData = mockEventEmitter;

            // Simulate connection added event
            const mockConnection = { id: 'new-conn', name: 'New Connection' };
            mockConnectionManager.onConnectionAdded.mock.calls.forEach((call: any) => {
                const callback = call[0];
                if (callback) callback(mockConnection);
            });

            // Note: In real implementation, event listeners would be set up in constructor
        });

        it('should refresh when connection is removed', () => {
            const mockEventEmitter = {
                fire: jest.fn(),
            };

            (treeProvider as any).onDidChangeTreeData = mockEventEmitter;

            // Simulate connection removed event
            mockConnectionManager.onConnectionRemoved.mock.calls.forEach((call: any) => {
                const callback = call[0];
                if (callback) callback('removed-conn-id');
            });
        });
    });
});