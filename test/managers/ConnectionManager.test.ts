import { ConnectionManager } from '../../src/managers/ConnectionManager';

// Mock VSCode APIs
jest.mock('vscode', () => ({
    ExtensionContext: jest.fn(),
    SecretStorage: jest.fn(),
    window: {
        showErrorMessage: jest.fn(),
        showInformationMessage: jest.fn(),
        showWarningMessage: jest.fn(),
        createWebviewPanel: jest.fn(),
    },
    commands: {
        executeCommand: jest.fn(),
    },
}));

describe('ConnectionManager', () => {
    let connectionManager: ConnectionManager;
    let mockContext: any;
    let mockSecrets: any;

    beforeEach(() => {
        // Mock extension context
        mockContext = {
            globalState: {
                get: jest.fn(),
                update: jest.fn(),
            },
            secrets: {
                store: jest.fn(),
                get: jest.fn(),
                delete: jest.fn(),
            },
        };

        connectionManager = new ConnectionManager(mockContext);
    });

    describe('addConnection', () => {
        it('should add a new connection', async () => {
            const connection = {
                name: 'Test Connection',
                host: 'localhost',
                port: 5432,
                database: 'testdb',
                username: 'testuser',
                password: 'password123'
            };

            await connectionManager.addConnection(connection);

            const retrieved = connectionManager.getConnection('test-conn');
            expect(retrieved).toBeDefined();
            expect(retrieved?.name).toBe('Test Connection');
        });

        it('should store password securely', async () => {
            const connection = {
                name: 'Test Connection',
                host: 'localhost',
                port: 5432,
                database: 'testdb',
                username: 'testuser',
                password: 'password123'
            };

            await connectionManager.addConnection(connection);

            expect(mockContext.secrets.store).toHaveBeenCalledWith(
                expect.stringContaining('password'),
                'password123'
            );
        });
    });

    describe('getConnection', () => {
        it('should return connection by id', async () => {
            const connection = {
                name: 'Test Connection',
                host: 'localhost',
                port: 5432,
                database: 'testdb',
                username: 'testuser',
                password: 'password123'
            };

            await connectionManager.addConnection(connection);

            const retrieved = connectionManager.getConnection('test-conn');
            expect(retrieved).toBeDefined();
            expect(retrieved?.name).toBe('Test Connection');
            expect(retrieved?.password).toBe(''); // Password should not be returned
        });

        it('should return undefined for non-existent connection', () => {
            const retrieved = connectionManager.getConnection('non-existent');
            expect(retrieved).toBeUndefined();
        });
    });

    describe('getConnections', () => {
        it('should return all connections', async () => {
            const connection1 = {
                name: 'Test Connection 1',
                host: 'localhost',
                port: 5432,
                database: 'testdb1',
                username: 'testuser',
                password: 'password123'
            };

            const connection2 = {
                name: 'Test Connection 2',
                host: 'localhost',
                port: 5432,
                database: 'testdb2',
                username: 'testuser',
                password: 'password456'
            };

            await connectionManager.addConnection(connection1);
            await connectionManager.addConnection(connection2);

            const allConnections = connectionManager.getConnections();
            expect(allConnections).toHaveLength(2);
            expect(allConnections.every(conn => conn.password === '')).toBe(true);
        });
    });

    describe('updateConnection', () => {
        it('should update an existing connection', async () => {
            const connection = {
                name: 'Test Connection',
                host: 'localhost',
                port: 5432,
                database: 'testdb',
                username: 'testuser',
                password: 'password123'
            };

            await connectionManager.addConnection(connection);

            const updatedConnection = {
                name: 'Updated Test Connection',
                host: 'localhost',
                port: 5432,
                database: 'updateddb',
                username: 'testuser',
                password: 'newpassword'
            };

            await connectionManager.updateConnection('test-conn', updatedConnection);

            const retrieved = connectionManager.getConnection('test-conn');
            expect(retrieved?.name).toBe('Updated Test Connection');
            expect(retrieved?.database).toBe('updateddb');
        });
    });

    describe('removeConnection', () => {
        it('should remove an existing connection', async () => {
            const connection = {
                name: 'Test Connection',
                host: 'localhost',
                port: 5432,
                database: 'testdb',
                username: 'testuser',
                password: 'password123'
            };

            await connectionManager.addConnection(connection);
            await connectionManager.removeConnection('test-conn');

            const retrieved = connectionManager.getConnection('test-conn');
            expect(retrieved).toBeUndefined();
        });

        it('should delete stored password', async () => {
            const connection = {
                name: 'Test Connection',
                host: 'localhost',
                port: 5432,
                database: 'testdb',
                username: 'testuser',
                password: 'password123'
            };

            await connectionManager.addConnection(connection);
            await connectionManager.removeConnection('test-conn');

            expect(mockContext.secrets.delete).toHaveBeenCalledWith(
                expect.stringContaining('password')
            );
        });
    });

    describe('testConnection', () => {
        it('should handle non-existent connection', async () => {
            const result = await connectionManager.testConnection('non-existent');
            expect(result).toBe(false);
        });

        it('should handle missing password', async () => {
            const connection = {
                name: 'Test Connection',
                host: 'localhost',
                port: 5432,
                database: 'testdb',
                username: 'testuser',
                password: 'password123'
            };

            await connectionManager.addConnection(connection);

            // Mock secrets.get to return undefined
            mockContext.secrets.get.mockResolvedValue(undefined);

            const result = await connectionManager.testConnection('test-conn');
            expect(result).toBe(false);
        });
    });

    describe('getConnectionPassword', () => {
        it('should retrieve password from secrets', async () => {
            mockContext.secrets.get.mockResolvedValue('retrieved-password');

            const password = await connectionManager.getConnectionPassword('test-conn');
            expect(password).toBe('retrieved-password');
        });

        it('should return undefined when secrets not available', async () => {
            // Temporarily remove secrets
            const originalSecrets = mockContext.secrets;
            mockContext.secrets = undefined;

            const password = await connectionManager.getConnectionPassword('test-conn');
            expect(password).toBeUndefined();

            // Restore secrets
            mockContext.secrets = originalSecrets;
        });
    });

    describe('dispose', () => {
        it('should clear all connections and timers', async () => {
            const connection = {
                name: 'Test Connection',
                host: 'localhost',
                port: 5432,
                database: 'testdb',
                username: 'testuser',
                password: 'password123'
            };

            await connectionManager.addConnection(connection);
            await connectionManager.dispose();

            // Verify connections are cleared
            const connections = connectionManager.getConnections();
            expect(connections).toHaveLength(0);
        });
    });
});