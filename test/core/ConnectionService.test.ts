import { ConnectionService } from '../../src/core/ConnectionService';

describe('ConnectionService', () => {
    let connectionService: ConnectionService;
    let mockConnectionManager: any;
    let mockValidationFramework: any;

    beforeEach(() => {
        mockConnectionManager = {
            getConnection: jest.fn(),
            getConnectionPassword: jest.fn()
        };

        mockValidationFramework = {
            executeValidation: jest.fn()
        };

        connectionService = new ConnectionService(
            mockConnectionManager,
            mockValidationFramework
        );
    });

    describe('getConnection', () => {
        it('should return connection by id', async () => {
            const mockConnection = {
                id: 'test-conn',
                name: 'Test Connection',
                host: 'localhost',
                port: 5432,
                database: 'testdb',
                username: 'testuser',
                lastConnected: new Date()
            };

            mockConnectionManager.getConnection.mockReturnValue(mockConnection);
            mockConnectionManager.getConnectionPassword.mockResolvedValue('password123');

            // Mock validation to pass
            mockValidationFramework.executeValidation.mockResolvedValue({
                canProceed: true,
                results: []
            });

            const result = await connectionService.getConnection('test-conn');

            expect(result).not.toBeNull();
            expect(result?.id).toBe('test-conn');
            expect(result?.name).toBe('Test Connection');
        });

        it('should return null for non-existent connection', async () => {
            mockConnectionManager.getConnection.mockReturnValue(null);

            const result = await connectionService.getConnection('non-existent');

            expect(result).toBeNull();
        });
    });


    describe('getConnectionPassword', () => {
        it('should return connection password', async () => {
            mockConnectionManager.getConnectionPassword.mockResolvedValue('password123');

            const password = await connectionService.getConnectionPassword('test-conn');

            expect(password).toBe('password123');
        });

        it('should return null for non-existent connection', async () => {
            mockConnectionManager.getConnectionPassword.mockRejectedValue(new Error('Password not found'));

            const password = await connectionService.getConnectionPassword('non-existent');

            expect(password).toBeNull();
        });
    });

    describe('validateConnection', () => {
        it('should validate connection successfully', async () => {
            const mockConnection = {
                id: 'test-conn',
                name: 'Test Connection',
                host: 'localhost',
                port: 5432,
                database: 'testdb',
                username: 'testuser'
            };

            mockConnectionManager.getConnection.mockReturnValue(mockConnection);
            mockConnectionManager.getConnectionPassword.mockResolvedValue('password123');

            // Mock successful validation framework
            mockValidationFramework.executeValidation.mockResolvedValue({
                canProceed: true,
                results: []
            });

            const result = await connectionService.validateConnection('test-conn');

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should handle validation failure', async () => {
            mockConnectionManager.getConnection.mockReturnValue(null);

            const result = await connectionService.validateConnection('non-existent');

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Connection non-existent not found');
        });
    });

    describe('getServiceStats', () => {
        it('should return service statistics', () => {
            const stats = connectionService.getServiceStats();

            expect(stats).toHaveProperty('options');
            expect(stats).toHaveProperty('health');
            expect(stats.health).toBe('healthy');
        });
    });
});