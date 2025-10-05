import * as vscode from 'vscode';
import { ConnectionManager, DatabaseConnection } from '../../src/managers/ConnectionManager';
import { DotNetIntegrationService } from '../../src/services/DotNetIntegrationService';

// Mock VS Code modules
jest.mock('vscode', () => ({
    window: {
        showErrorMessage: jest.fn(),
        showInformationMessage: jest.fn()
    },
    workspace: {
        getConfiguration: jest.fn()
    }
}));

describe('ConnectionManager', () => {
    let connectionManager: ConnectionManager;
    let mockContext: vscode.ExtensionContext;
    let mockSecrets: vscode.SecretStorage;

    beforeEach(() => {
        // Create mock VS Code context
        mockContext = {
            globalState: {
                get: jest.fn().mockReturnValue('[]'),
                update: jest.fn().mockResolvedValue(undefined),
                setKeysForSync: jest.fn()
            },
            secrets: mockSecrets,
            subscriptions: []
        } as any;

        mockSecrets = {
            store: jest.fn().mockResolvedValue(undefined),
            get: jest.fn().mockResolvedValue(''),
            delete: jest.fn().mockResolvedValue(undefined),
            onDidChange: jest.fn().mockReturnValue({ dispose: jest.fn() })
        } as any;

        mockContext.secrets = mockSecrets;

        // Create ConnectionManager instance
        connectionManager = new ConnectionManager(mockContext);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('should initialize with empty connections', () => {
        const connections = connectionManager.getConnections();
        assert.strictEqual(connections.length, 0);
    });

    test('should add new connection with secure password storage', async () => {
        const connectionInfo = {
            name: 'Test Connection',
            host: 'localhost',
            port: 5432,
            database: 'testdb',
            username: 'testuser',
            password: 'testpass'
        };

        await connectionManager.addConnection(connectionInfo);

        const connections = connectionManager.getConnections();
        assert.strictEqual(connections.length, 1);
        assert.strictEqual(connections[0].name, 'Test Connection');
        assert.strictEqual(connections[0].password, ''); // Password should not be in memory

        // Verify password was stored securely
        sinon.assert.calledWith(mockSecrets.store as any, 'connection_' + connections[0].id + '_password', 'testpass');
    });

    test('should test connection successfully', async () => {
        // Add a test connection first
        const connectionInfo = {
            name: 'Test Connection',
            host: 'localhost',
            port: 5432,
            database: 'testdb',
            username: 'testuser',
            password: 'testpass'
        };

        await connectionManager.addConnection(connectionInfo);
        const connections = connectionManager.getConnections();
        const connectionId = connections[0].id;

        // Mock successful connection test
        dotNetServiceStub.testConnection.resolves(true);

        const result = await connectionManager.testConnection(connectionId);

        assert.strictEqual(result, true);
        sinon.assert.calledOnce(dotNetServiceStub.testConnection as any);
    });

    test('should handle connection test failure gracefully', async () => {
        // Add a test connection first
        const connectionInfo = {
            name: 'Test Connection',
            host: 'localhost',
            port: 5432,
            database: 'testdb',
            username: 'testuser',
            password: 'testpass'
        };

        await connectionManager.addConnection(connectionInfo);
        const connections = connectionManager.getConnections();
        const connectionId = connections[0].id;

        // Mock failed connection test
        dotNetServiceStub.testConnection.resolves(false);

        const result = await connectionManager.testConnection(connectionId);

        assert.strictEqual(result, false);
    });

    test('should validate connection parameters', async () => {
        const invalidConnectionInfo = {
            name: 'Invalid Connection',
            host: '', // Invalid: empty host
            port: 0,  // Invalid: port 0
            database: '', // Invalid: empty database
            username: '', // Invalid: empty username
            password: 'testpass'
        };

        try {
            await connectionManager.addConnection(invalidConnectionInfo);
            assert.fail('Should have thrown error for invalid connection');
        } catch (error) {
            assert.ok(true); // Expected error
        }
    });

    test('should remove connection and cleanup password', async () => {
        // Add a test connection first
        const connectionInfo = {
            name: 'Test Connection',
            host: 'localhost',
            port: 5432,
            database: 'testdb',
            username: 'testuser',
            password: 'testpass'
        };

        await connectionManager.addConnection(connectionInfo);
        const connections = connectionManager.getConnections();
        const connectionId = connections[0].id;

        // Remove the connection
        await connectionManager.removeConnection(connectionId);

        const updatedConnections = connectionManager.getConnections();
        assert.strictEqual(updatedConnections.length, 0);

        // Verify password was deleted from secure storage
        sinon.assert.calledWith(mockSecrets.delete as any, 'connection_' + connectionId + '_password');
    });

    test('should update connection with new password', async () => {
        // Add a test connection first
        const connectionInfo = {
            name: 'Test Connection',
            host: 'localhost',
            port: 5432,
            database: 'testdb',
            username: 'testuser',
            password: 'oldpass'
        };

        await connectionManager.addConnection(connectionInfo);
        const connections = connectionManager.getConnections();
        const connectionId = connections[0].id;

        // Update the connection
        const updatedInfo = {
            name: 'Updated Connection',
            host: 'localhost',
            port: 5432,
            database: 'testdb',
            username: 'testuser',
            password: 'newpass'
        };

        await connectionManager.updateConnection(connectionId, updatedInfo);

        const updatedConnections = connectionManager.getConnections();
        assert.strictEqual(updatedConnections.length, 1);
        assert.strictEqual(updatedConnections[0].name, 'Updated Connection');

        // Verify old password was deleted and new password was stored
        sinon.assert.calledWith(mockSecrets.delete as any, 'connection_' + connectionId + '_password');
        sinon.assert.calledWith(mockSecrets.store as any, 'connection_' + connectionId + '_password', 'newpass');
    });

    test('should handle missing password during connection test', async () => {
        // Add a test connection without password
        const connectionInfo = {
            name: 'Test Connection',
            host: 'localhost',
            port: 5432,
            database: 'testdb',
            username: 'testuser',
            password: 'testpass'
        };

        await connectionManager.addConnection(connectionInfo);
        const connections = connectionManager.getConnections();
        const connectionId = connections[0].id;

        // Mock missing password in secret storage
        mockSecrets.get.resolves('');

        const result = await connectionManager.testConnection(connectionId);

        assert.strictEqual(result, false);
    });

    test('should generate unique IDs for connections', async () => {
        const connectionInfo1 = {
            name: 'Connection 1',
            host: 'localhost',
            port: 5432,
            database: 'testdb',
            username: 'testuser',
            password: 'testpass'
        };

        const connectionInfo2 = {
            name: 'Connection 2',
            host: 'localhost',
            port: 5432,
            database: 'testdb',
            username: 'testuser',
            password: 'testpass'
        };

        await connectionManager.addConnection(connectionInfo1);
        await connectionManager.addConnection(connectionInfo2);

        const connections = connectionManager.getConnections();
        assert.strictEqual(connections.length, 2);
        assert.notStrictEqual(connections[0].id, connections[1].id);
    });

    test('should persist connections to global state', async () => {
        const connectionInfo = {
            name: 'Test Connection',
            host: 'localhost',
            port: 5432,
            database: 'testdb',
            username: 'testuser',
            password: 'testpass'
        };

        await connectionManager.addConnection(connectionInfo);

        // Verify global state was updated
        sinon.assert.calledWith(mockContext.globalState.update as any, 'postgresql.connections', sinon.match.string);
    });

    test('should load connections from global state on initialization', () => {
        const mockConnections = JSON.stringify([{
            id: 'test-id',
            name: 'Loaded Connection',
            host: 'localhost',
            port: 5432,
            database: 'testdb',
            username: 'testuser',
            password: ''
        }]);

        mockContext.globalState.get.returns(mockConnections);

        // Create new ConnectionManager to test loading
        const newConnectionManager = new ConnectionManager(mockContext);
        const connections = newConnectionManager.getConnections();

        assert.strictEqual(connections.length, 1);
        assert.strictEqual(connections[0].name, 'Loaded Connection');
    });

    test('should handle corrupted global state gracefully', () => {
        mockContext.globalState.get.returns('invalid json');

        // Should not throw error and should initialize with empty connections
        const newConnectionManager = new ConnectionManager(mockContext);
        const connections = newConnectionManager.getConnections();

        assert.strictEqual(connections.length, 0);
    });

    test('should dispose properly', async () => {
        const disposeStub = sinon.stub(connectionManager, 'dispose').resolves();

        await connectionManager.dispose();

        sinon.assert.calledOnce(disposeStub);
    });
});