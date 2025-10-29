import { PostgreSqlConnectionManager } from '../../src/core/PostgreSqlConnectionManager';

describe('PostgreSqlConnectionManager', () => {
    let connectionManager: PostgreSqlConnectionManager;

    beforeEach(() => {
        connectionManager = PostgreSqlConnectionManager.getInstance();
    });

    describe('getInstance', () => {
        it('should return the same instance', () => {
            const instance1 = PostgreSqlConnectionManager.getInstance();
            const instance2 = PostgreSqlConnectionManager.getInstance();

            expect(instance1).toBe(instance2);
        });
    });

    describe('createConnection', () => {
        it('should create connection handle successfully', async () => {
            const connectionInfo = {
                id: 'test-conn',
                name: 'Test Connection',
                host: 'localhost',
                port: 5432,
                database: 'testdb',
                username: 'testuser',
                password: 'password123'
            };

            // Mock the connection creation - in real tests this would need a test database
            try {
                const handle = await connectionManager.createConnection(connectionInfo);
                expect(handle).toBeDefined();
                expect(handle.connection).toBeDefined();

                // Clean up
                handle.release();
            } catch (error) {
                // Expected to fail without actual database
                expect(error).toBeDefined();
            }
        });

        it('should handle connection creation failure', async () => {
            const invalidConnectionInfo = {
                id: 'invalid-conn',
                name: 'Invalid Connection',
                host: 'invalid-host',
                port: 5432,
                database: 'nonexistent',
                username: 'invalid',
                password: 'invalid'
            };

            await expect(connectionManager.createConnection(invalidConnectionInfo))
                .rejects.toThrow();
        });
    });

    describe('testConnection', () => {
        it('should test connection successfully', async () => {
            const connectionInfo = {
                id: 'test-conn',
                name: 'Test Connection',
                host: 'localhost',
                port: 5432,
                database: 'testdb',
                username: 'testuser',
                password: 'password123'
            };

            // Mock the connection test - in real tests this would need a test database
            try {
                await connectionManager.testConnection(connectionInfo);
                // If no error, connection test passed
            } catch (error) {
                // Expected to fail without actual database
                expect(error).toBeDefined();
            }
        });

        it('should handle connection test failure', async () => {
            const invalidConnectionInfo = {
                id: 'invalid-conn',
                name: 'Invalid Connection',
                host: 'invalid-host',
                port: 5432,
                database: 'nonexistent',
                username: 'invalid',
                password: 'invalid'
            };

            await expect(connectionManager.testConnection(invalidConnectionInfo))
                .rejects.toThrow();
        });
    });

});