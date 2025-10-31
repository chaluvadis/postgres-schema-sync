import { MigrationCoordinator } from '../../src/core/MigrationCoordinator';
import { TestDatabaseManager, TestMigrationFactory, MockFactory, AssertionHelpers } from '../utils/TestHelpers';

describe('MigrationCoordinator', () => {
  let coordinator: MigrationCoordinator;
  let mockConnectionService: any;
  let mockProgressTracker: any;
  let mockValidationFramework: any;
  let mockSchemaBrowser: any;

  beforeEach(() => {
    // Create mocks
    mockConnectionService = MockFactory.createMockConnectionService();
    mockProgressTracker = MockFactory.createMockProgressTracker();
    mockValidationFramework = MockFactory.createMockValidationFramework();
    mockSchemaBrowser = MockFactory.createMockSchemaBrowser();

    // Create coordinator with mocks
    coordinator = new MigrationCoordinator(
      mockConnectionService,
      mockProgressTracker,
      mockValidationFramework,
      mockSchemaBrowser
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('executeMigration', () => {
    it('should execute a successful migration', async () => {
      // Arrange
      const migrationRequest = TestMigrationFactory.createBasicMigration();
      const mockValidationReport = {
        requestId: 'test_validation',
        validationTimestamp: new Date(),
        totalRules: 3,
        passedRules: 3,
        failedRules: 0,
        warningRules: 0,
        results: [],
        overallStatus: 'passed' as const,
        canProceed: true,
        recommendations: [],
        executionTime: 100
      };

      mockValidationFramework.executeValidation.mockResolvedValue({
        success: true,
        data: mockValidationReport
      });

      mockConnectionService.getConnection.mockResolvedValue(TestDatabaseManager.getMockConnection());
      mockConnectionService.getConnectionPassword.mockResolvedValue('password');
      mockSchemaBrowser.getDatabaseObjectsAsync.mockResolvedValue([]);

      // Act
      const result = await coordinator.executeMigration(migrationRequest);

      // Assert
      AssertionHelpers.assertMigrationResult(result);
      expect(result.success).toBe(true);
      expect(result.migrationId).toBe(migrationRequest.id);
      expect(mockValidationFramework.executeValidation).toHaveBeenCalled();
    });

    it('should handle validation failure', async () => {
      // Arrange
      const migrationRequest = TestMigrationFactory.createBasicMigration();
      const mockValidationReport = {
        requestId: 'test_validation',
        validationTimestamp: new Date(),
        totalRules: 3,
        passedRules: 1,
        failedRules: 2,
        warningRules: 0,
        results: [],
        overallStatus: 'failed' as const,
        canProceed: false,
        recommendations: ['Fix validation errors'],
        executionTime: 100
      };

      mockValidationFramework.executeValidation.mockResolvedValue({
        success: true,
        data: mockValidationReport
      });

      // Act & Assert
      await expect(coordinator.executeMigration(migrationRequest))
        .rejects
        .toThrow('Pre-migration validation failed');
    });

    it('should handle dry run migrations', async () => {
      // Arrange
      const migrationRequest = TestMigrationFactory.createBasicMigration();
      const mockValidationReport = {
        requestId: 'test_validation',
        validationTimestamp: new Date(),
        totalRules: 3,
        passedRules: 3,
        failedRules: 0,
        warningRules: 0,
        results: [],
        overallStatus: 'passed' as const,
        canProceed: true,
        recommendations: [],
        executionTime: 100
      };

      mockValidationFramework.executeValidation.mockResolvedValue({
        success: true,
        data: mockValidationReport
      });

      mockConnectionService.getConnection.mockResolvedValue(TestDatabaseManager.getMockConnection());
      mockConnectionService.getConnectionPassword.mockResolvedValue('password');
      mockSchemaBrowser.getDatabaseObjectsAsync.mockResolvedValue([]);

      // Act
      const result = await coordinator.executeMigration(migrationRequest, true);

      // Assert
      AssertionHelpers.assertMigrationResult(result);
      expect(result.success).toBe(true);
      expect(result.metadata?.isRealTime).toBe(false); // Dry run should not be real-time
    });

    it('should handle connection errors gracefully', async () => {
      // Arrange
      const migrationRequest = TestMigrationFactory.createErrorMigration('connection');

      mockConnectionService.getConnection.mockRejectedValue(new Error('Connection not found'));

      // Act
      const result = await coordinator.executeMigration(migrationRequest);

      // Assert
      AssertionHelpers.assertMigrationResult(result);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('getStats', () => {
    it('should return migration statistics', async () => {
      // Act
      const stats = await coordinator.getStats();

      // Assert
      expect(stats).toHaveProperty('activeMigrations');
      expect(stats).toHaveProperty('completedMigrations');
      expect(stats).toHaveProperty('failedMigrations');
      expect(stats).toHaveProperty('totalExecutionTime');

      expect(typeof stats.activeMigrations).toBe('number');
      expect(typeof stats.completedMigrations).toBe('number');
      expect(typeof stats.failedMigrations).toBe('number');
      expect(typeof stats.totalExecutionTime).toBe('number');
    });
  });

  describe('dispose', () => {
    it('should dispose resources properly', async () => {
      // Act
      await coordinator.dispose();

      // Assert - No specific assertions needed, just ensure no errors
      expect(true).toBe(true);
    });
  });
});