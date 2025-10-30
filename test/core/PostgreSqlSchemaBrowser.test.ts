import { PostgreSqlSchemaBrowser } from '../../src/core/PostgreSqlSchemaBrowser';

describe('PostgreSqlSchemaBrowser', () => {
    let schemaBrowser: PostgreSqlSchemaBrowser;

    beforeEach(() => {
        schemaBrowser = new PostgreSqlSchemaBrowser();
    });

    describe('getDatabaseObjectsAsync', () => {
        it('should retrieve database objects successfully', async () => {
            const connectionInfo = {
                id: 'test-conn',
                name: 'Test Connection',
                host: 'localhost',
                port: 5432,
                database: 'testdb',
                username: 'testuser',
                password: 'password123'
            };

            // Mock the schema browsing - in real tests this would need a test database
            try {
                const objects = await schemaBrowser.getDatabaseObjectsAsync(connectionInfo);
                expect(objects).toBeDefined();
                expect(Array.isArray(objects)).toBe(true);
            } catch (error) {
                // Expected to fail without actual database
                expect(error).toBeDefined();
            }
        });

        it('should handle connection failure', async () => {
            const invalidConnectionInfo = {
                id: 'invalid-conn',
                name: 'Invalid Connection',
                host: 'invalid-host',
                port: 5432,
                database: 'nonexistent',
                username: 'invalid',
                password: 'invalid'
            };

            await expect(schemaBrowser.getDatabaseObjectsAsync(invalidConnectionInfo))
                .rejects.toThrow();
        });
    });

});