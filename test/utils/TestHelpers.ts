import { ConnectionInfo, MigrationRequest, MigrationOptions } from '../../src/types';

/**
 * Test helpers and utilities for comprehensive testing
 */

export class TestDatabaseManager {
  private static testDatabases: Map<string, ConnectionInfo> = new Map();

  /**
   * Create a test database connection
   */
  static createTestConnection(overrides: Partial<ConnectionInfo> = {}): ConnectionInfo {
    const baseConnection: ConnectionInfo = {
      id: `test_conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: 'Test Database',
      host: process.env.TEST_DB_HOST || 'localhost',
      port: parseInt(process.env.TEST_DB_PORT || '5432'),
      database: `test_db_${Date.now()}`,
      username: process.env.TEST_DB_USER || 'postgres',
      password: process.env.TEST_DB_PASSWORD || 'password',
      ssl: false,
      connectionTimeoutMillis: 5000,
      query_timeout: 10000,
      createdDate: new Date().toISOString()
    };

    return { ...baseConnection, ...overrides };
  }

  /**
   * Setup test database schema
   */
  static async setupTestSchema(connection: ConnectionInfo): Promise<void> {
    // Implementation would create test tables, views, etc.
    // This is a placeholder for actual test database setup
    console.log(`Setting up test schema for connection: ${connection.id}`);
  }

  /**
   * Clean up test database
   */
  static async cleanupTestDatabase(connection: ConnectionInfo): Promise<void> {
    // Implementation would drop test database and clean up
    console.log(`Cleaning up test database: ${connection.database}`);
  }

  /**
   * Get mock connection for unit tests
   */
  static getMockConnection(): ConnectionInfo {
    return {
      id: 'mock_connection',
      name: 'Mock Database',
      host: 'localhost',
      port: 5432,
      database: 'mock_db',
      username: 'mock_user',
      password: 'mock_password',
      ssl: false,
      connectionTimeoutMillis: 5000,
      query_timeout: 10000,
      createdDate: new Date().toISOString()
    };
  }
}

export class TestMigrationFactory {
  /**
   * Create a basic migration request for testing
   */
  static createBasicMigration(
    sourceConnectionId: string = 'source_conn',
    targetConnectionId: string = 'target_conn',
    options: Partial<MigrationOptions> = {}
  ): MigrationRequest {
    return {
      id: `test_migration_${Date.now()}`,
      name: 'Test Migration',
      sourceConnectionId,
      targetConnectionId,
      options: {
        includeRollback: true,
        validateBeforeExecution: true,
        createBackupBeforeExecution: false,
        executeInTransaction: true,
        stopOnFirstError: true,
        useBatching: true,
        batchSize: 10,
        failOnWarnings: false,
        author: 'test_user',
        businessJustification: 'Testing migration functionality',
        changeType: 'feature',
        environment: 'development',
        tags: ['test', 'automation'],
        ...options
      },
      metadata: {
        author: 'test_user',
        businessJustification: 'Testing migration functionality',
        changeType: 'feature',
        environment: 'development',
        tags: ['test', 'automation'],
        status: 'running',
        startedAt: new Date().toISOString(),
        currentPhase: 'initialization',
        progressPercentage: 0,
        lastUpdated: new Date().toISOString(),
        isRealTime: false
      }
    };
  }

  /**
   * Create a migration with specific error conditions
   */
  static createErrorMigration(errorType: 'connection' | 'permission' | 'validation'): MigrationRequest {
    const baseMigration = this.createBasicMigration();

    switch (errorType) {
      case 'connection':
        return {
          ...baseMigration,
          sourceConnectionId: 'nonexistent_source',
          targetConnectionId: 'nonexistent_target'
        };

      case 'permission':
        return {
          ...baseMigration,
          options: {
            ...baseMigration.options,
            author: 'unauthorized_user'
          }
        };

      case 'validation':
        return {
          ...baseMigration,
          options: {
            ...baseMigration.options,
            failOnWarnings: true,
            environment: 'production'
          }
        };

      default:
        return baseMigration;
    }
  }
}

export class TestDataGenerator {
  /**
   * Generate test table schema
   */
  static generateTestTable(name: string, columnCount: number = 5): string {
    const columns = [];
    for (let i = 1; i <= columnCount; i++) {
      columns.push(`column_${i} VARCHAR(255)`);
    }

    return `
      CREATE TABLE ${name} (
        id SERIAL PRIMARY KEY,
        ${columns.join(',\n        ')},
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
  }

  /**
   * Generate test view
   */
  static generateTestView(name: string, tableName: string): string {
    return `
      CREATE VIEW ${name} AS
      SELECT id, created_at, updated_at
      FROM ${tableName}
      WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '30 days';
    `;
  }

  /**
   * Generate test data for a table
   */
  static generateTestData(tableName: string, rowCount: number = 100): string {
    const values = [];
    for (let i = 1; i <= rowCount; i++) {
      values.push(`(${i}, 'test_value_${i}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`);
    }

    return `
      INSERT INTO ${tableName} (id, column_1, created_at, updated_at)
      VALUES ${values.join(',\n      ')};
    `;
  }
}

export class MockFactory {
  /**
   * Create mock connection service
   */
  static createMockConnectionService() {
    return {
      getConnection: jest.fn(),
      getConnectionPassword: jest.fn(),
      validateConnection: jest.fn(),
      createConnection: jest.fn(),
      testConnection: jest.fn()
    };
  }

  /**
   * Create mock validation framework
   */
  static createMockValidationFramework() {
    return {
      executeValidation: jest.fn(),
      addRule: jest.fn(),
      removeRule: jest.fn(),
      getAvailableRules: jest.fn(),
      getStats: jest.fn()
    };
  }

  /**
   * Create mock progress tracker
   */
  static createMockProgressTracker() {
    return {
      startMigrationOperation: jest.fn(),
      updateMigrationProgress: jest.fn(),
      cancelOperation: jest.fn(),
      getOperationProgress: jest.fn()
    };
  }

  /**
   * Create mock schema browser
   */
  static createMockSchemaBrowser() {
    return {
      getDatabaseObjectsAsync: jest.fn()
    };
  }
}

export class AssertionHelpers {
  /**
   * Assert migration result structure
   */
  static assertMigrationResult(result: any) {
    expect(result).toHaveProperty('migrationId');
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('executionTime');
    expect(result).toHaveProperty('operationsProcessed');
    expect(result).toHaveProperty('errors');
    expect(result).toHaveProperty('warnings');
    expect(result).toHaveProperty('rollbackAvailable');
    expect(result).toHaveProperty('executionLog');
    expect(result).toHaveProperty('metadata');

    expect(typeof result.migrationId).toBe('string');
    expect(typeof result.success).toBe('boolean');
    expect(typeof result.executionTime).toBe('number');
    expect(Array.isArray(result.errors)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
    expect(typeof result.rollbackAvailable).toBe('boolean');
    expect(Array.isArray(result.executionLog)).toBe(true);
  }

  /**
   * Assert validation report structure
   */
  static assertValidationReport(report: any) {
    expect(report).toHaveProperty('requestId');
    expect(report).toHaveProperty('validationTimestamp');
    expect(report).toHaveProperty('totalRules');
    expect(report).toHaveProperty('passedRules');
    expect(report).toHaveProperty('failedRules');
    expect(report).toHaveProperty('warningRules');
    expect(report).toHaveProperty('results');
    expect(report).toHaveProperty('overallStatus');
    expect(report).toHaveProperty('canProceed');
    expect(report).toHaveProperty('recommendations');
    expect(report).toHaveProperty('executionTime');

    expect(report.validationTimestamp).toBeInstanceOf(Date);
    expect(typeof report.totalRules).toBe('number');
    expect(Array.isArray(report.results)).toBe(true);
    expect(['passed', 'failed', 'warnings']).toContain(report.overallStatus);
    expect(typeof report.canProceed).toBe('boolean');
    expect(Array.isArray(report.recommendations)).toBe(true);
  }

  /**
   * Assert query result structure
   */
  static assertQueryResult(result: any) {
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('query');
    expect(result).toHaveProperty('executionTime');
    expect(result).toHaveProperty('rowCount');
    expect(result).toHaveProperty('columns');
    expect(result).toHaveProperty('rows');
    expect(result).toHaveProperty('timestamp');

    expect(typeof result.id).toBe('string');
    expect(typeof result.query).toBe('string');
    expect(typeof result.executionTime).toBe('number');
    expect(typeof result.rowCount).toBe('number');
    expect(Array.isArray(result.columns)).toBe(true);
    expect(Array.isArray(result.rows)).toBe(true);
    expect(result.timestamp).toBeInstanceOf(Date);
  }
}

export class PerformanceHelpers {
  /**
   * Measure execution time of async function
   */
  static async measureExecutionTime<T>(fn: () => Promise<T>): Promise<{ result: T; executionTime: number }> {
    const startTime = Date.now();
    const result = await fn();
    const executionTime = Date.now() - startTime;

    return { result, executionTime };
  }

  /**
   * Assert performance requirements
   */
  static assertPerformance(executionTime: number, maxTime: number, operation: string) {
    if (executionTime > maxTime) {
      throw new Error(`${operation} took ${executionTime}ms, exceeding maximum of ${maxTime}ms`);
    }
  }

  /**
   * Run performance benchmark
   */
  static async runBenchmark<T>(
    fn: () => Promise<T>,
    iterations: number = 10
  ): Promise<{
    results: T[];
    executionTimes: number[];
    averageTime: number;
    minTime: number;
    maxTime: number;
  }> {
    const results: T[] = [];
    const executionTimes: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const { result, executionTime } = await this.measureExecutionTime(fn);
      results.push(result);
      executionTimes.push(executionTime);
    }

    const averageTime = executionTimes.reduce((sum, time) => sum + time, 0) / iterations;
    const minTime = Math.min(...executionTimes);
    const maxTime = Math.max(...executionTimes);

    return {
      results,
      executionTimes,
      averageTime,
      minTime,
      maxTime
    };
  }
}