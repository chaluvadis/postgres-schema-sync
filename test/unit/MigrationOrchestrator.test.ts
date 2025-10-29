import { MigrationOrchestrator } from '../../src/core/MigrationOrchestrator';

describe('MigrationOrchestrator', () => {
    let orchestrator: MigrationOrchestrator;
    let mockConnectionService: any;
    let mockProgressTracker: any;
    let mockValidationFramework: any;
    let mockSchemaBrowser: any;

    beforeEach(() => {
        mockConnectionService = {
            getConnection: jest.fn(),
            validateConnection: jest.fn(),
            getConnectionPassword: jest.fn()
        };

        mockProgressTracker = {
            startMigrationOperation: jest.fn(),
            updateMigrationProgress: jest.fn(),
            cancelOperation: jest.fn()
        };

        mockValidationFramework = {};

        mockSchemaBrowser = {
            getDatabaseObjectsAsync: jest.fn()
        };

        orchestrator = new MigrationOrchestrator(
            mockConnectionService,
            mockProgressTracker,
            mockValidationFramework,
            mockSchemaBrowser
        );
    });

    describe('executeMigration', () => {
        it('should execute migration successfully', async () => {
            const request = {
                sourceConnectionId: 'source1',
                targetConnectionId: 'target1',
                options: { includeRollback: true, createBackupBeforeExecution: true }
            };

            mockConnectionService.getConnection.mockResolvedValue({
                id: 'source1',
                name: 'Source DB',
                host: 'localhost',
                port: 5432,
                database: 'source_db',
                username: 'user',
                password: 'pass'
            });

            mockConnectionService.validateConnection.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
            mockConnectionService.getConnectionPassword.mockResolvedValue('password');

            mockSchemaBrowser.getDatabaseObjectsAsync.mockResolvedValue([]);

            const result = await orchestrator.executeMigration(request);

            expect(result.success).toBe(true);
            expect(result.migrationId).toBeDefined();
        });

        it('should handle migration failure with rollback', async () => {
            const request = {
                sourceConnectionId: 'source1',
                targetConnectionId: 'target1',
                options: { includeRollback: true }
            };

            mockConnectionService.getConnection.mockRejectedValue(new Error('Connection failed'));

            const result = await orchestrator.executeMigration(request);

            expect(result.success).toBe(false);
            expect(result.errors).toContain('Connection failed');
        });
    });

    describe('generateMigration', () => {
        it('should generate migration script', async () => {
            const request = {
                sourceConnectionId: 'source1',
                targetConnectionId: 'target1'
            };

            mockConnectionService.getConnection.mockResolvedValue({
                id: 'source1',
                name: 'Source DB',
                host: 'localhost',
                port: 5432,
                database: 'source_db',
                username: 'user',
                password: 'pass'
            });

            mockConnectionService.getConnectionPassword.mockResolvedValue('password');
            mockSchemaBrowser.getDatabaseObjectsAsync.mockResolvedValue([]);

            const result = await orchestrator.generateMigration(request);

            expect(result.migrationId).toBeDefined();
            expect(result.sqlScript).toBeDefined();
            expect(result.riskLevel).toBeDefined();
        });
    });

    describe('cancelMigration', () => {
        it('should cancel active migration', async () => {
            const migrationId = 'test-migration';

            // First start a migration to make it active
            const request = {
                id: migrationId,
                sourceConnectionId: 'source1',
                targetConnectionId: 'target1'
            };

            mockConnectionService.getConnection.mockResolvedValue({
                id: 'source1',
                name: 'Source DB',
                host: 'localhost',
                port: 5432,
                database: 'source_db',
                username: 'user',
                password: 'pass'
            });

            mockConnectionService.validateConnection.mockResolvedValue({ isValid: true, errors: [], warnings: [] });
            mockConnectionService.getConnectionPassword.mockResolvedValue('password');
            mockSchemaBrowser.getDatabaseObjectsAsync.mockResolvedValue([]);

            // Start migration (it will run in background)
            orchestrator.executeMigration(request);

            // Cancel it
            const cancelled = await orchestrator.cancelMigration(migrationId);
            expect(cancelled).toBe(true);
        });
    });

    describe('getStats', () => {
        it('should return migration statistics', async () => {
            const stats = await orchestrator.getStats();

            expect(stats).toHaveProperty('activeMigrations');
            expect(stats).toHaveProperty('completedMigrations');
            expect(stats).toHaveProperty('failedMigrations');
            expect(stats).toHaveProperty('totalExecutionTime');
        });
    });
});