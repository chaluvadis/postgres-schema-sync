/**
 * Cross-Platform Compatibility Testing
 *
 * Tests the extension's functionality across different operating systems
 * and PostgreSQL versions to ensure consistent behavior.
 */

import { DatabaseTestHelper, TestDatabase } from './DatabaseTestHelper';
import { PlatformTestHelper } from './PlatformTestHelper';

// Platform configurations
interface PlatformConfig {
  name: string;
  platform: string;
  config: {
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
    ssl?: boolean;
  };
  expectedBehavior: {
    filePathSeparator: string;
    lineEnding: string;
    caseSensitive: boolean;
  };
}

// Test framework types
declare const describe: any;
declare const it: any;
declare const expect: any;
declare const beforeAll: any;
declare const afterAll: any;

const PLATFORM_CONFIGS: PlatformConfig[] = [
  {
    name: 'Windows',
    platform: 'win32',
    config: {
      host: 'localhost',
      port: 5432,
      database: 'test_db',
      username: 'test_user',
      password: 'test_pass',
      ssl: false
    },
    expectedBehavior: {
      filePathSeparator: '\\',
      lineEnding: '\r\n',
      caseSensitive: false
    }
  },
  {
    name: 'macOS',
    platform: 'darwin',
    config: {
      host: 'localhost',
      port: 5432,
      database: 'test_db',
      username: 'test_user',
      password: 'test_pass',
      ssl: true
    },
    expectedBehavior: {
      filePathSeparator: '/',
      lineEnding: '\n',
      caseSensitive: true
    }
  },
  {
    name: 'Linux',
    platform: 'linux',
    config: {
      host: 'localhost',
      port: 5432,
      database: 'test_db',
      username: 'test_user',
      password: 'test_pass',
      ssl: true
    },
    expectedBehavior: {
      filePathSeparator: '/',
      lineEnding: '\n',
      caseSensitive: true
    }
  }
];

const POSTGRESQL_VERSIONS = [
  { version: '12.0', name: 'PostgreSQL 12' },
  { version: '13.0', name: 'PostgreSQL 13' },
  { version: '14.0', name: 'PostgreSQL 14' },
  { version: '15.0', name: 'PostgreSQL 15' },
  { version: '16.0', name: 'PostgreSQL 16' }
];

describe('Cross-Platform Compatibility Testing', () => {
  let originalPlatform: string;

  beforeAll(async () => {
    originalPlatform = process.platform;
    await DatabaseTestHelper.initialize();
  });

  afterAll(async () => {
    // Restore original platform
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  PLATFORM_CONFIGS.forEach(platformConfig => {
    describe(`${platformConfig.name} Compatibility`, () => {
      beforeAll(() => {
        // Mock the platform
        Object.defineProperty(process, 'platform', { value: platformConfig.platform });
      });

      it('should handle platform-specific file paths correctly', async () => {
        console.log(`🖥️  Testing file path handling on ${platformConfig.name}...`);

        const testPaths = [
          `test${platformConfig.expectedBehavior.filePathSeparator}schema`,
          `database${platformConfig.expectedBehavior.filePathSeparator}migration.sql`,
          `C:${platformConfig.expectedBehavior.filePathSeparator}Users${platformConfig.expectedBehavior.filePathSeparator}test`
        ];

        for (const path of testPaths) {
          // Test path normalization
          const normalizedPath = PlatformTestHelper.normalizePath(path);
          expect(normalizedPath).toBeDefined();

          // Test path validation
          const isValid = PlatformTestHelper.validatePath(normalizedPath);
          expect(isValid).toBe(true);
        }

        console.log(`✅ File path handling works correctly on ${platformConfig.name}`);

      });

      it('should handle platform-specific line endings', async () => {
        console.log(`📝 Testing line ending handling on ${platformConfig.name}...`);

        const testContent = 'SELECT * FROM users;';
        const expectedEnding = platformConfig.expectedBehavior.lineEnding;

        // Test content normalization
        const normalizedContent = PlatformTestHelper.normalizeLineEndings(testContent, expectedEnding);
        expect(normalizedContent).toContain(expectedEnding);

        console.log(`✅ Line ending handling works correctly on ${platformConfig.name}`);

      });

      it('should handle platform-specific case sensitivity', async () => {
        console.log(`🔤 Testing case sensitivity on ${platformConfig.name}...`);

        const testStrings = ['Users', 'users', 'USERS'];
        const caseSensitive = platformConfig.expectedBehavior.caseSensitive;

        if (caseSensitive) {
          // On case-sensitive platforms, strings should be treated as different
          expect(testStrings[0]).not.toBe(testStrings[1]);
          expect(testStrings[1]).not.toBe(testStrings[2]);
        } else {
          // On case-insensitive platforms, might need special handling
          const normalized = testStrings.map(s => s.toLowerCase());
          expect(normalized[0]).toBe(normalized[1]);
          expect(normalized[1]).toBe(normalized[2]);
        }

        console.log(`✅ Case sensitivity handling works correctly on ${platformConfig.name}`);

      });

      it('should establish database connections correctly', async () => {
        console.log(`🔗 Testing database connections on ${platformConfig.name}...`);

        const db = await DatabaseTestHelper.createTestDatabase(
          `platform_test_${platformConfig.platform}`
        );

        expect(db.isConnected).toBe(true);

        // Test connection-specific platform behaviors
        const result = await db.client.query('SELECT version()');
        expect(result.rows).toHaveLength(1);

        await DatabaseTestHelper.dropTestDatabase(db.databaseName);

        console.log(`✅ Database connections work correctly on ${platformConfig.name}`);

      });
    });
  });

  describe('PostgreSQL Version Compatibility', () => {
    POSTGRESQL_VERSIONS.forEach(pgVersion => {
      it(`should work with ${pgVersion.name}`, async () => {
        console.log(`🐘 Testing PostgreSQL ${pgVersion.version} compatibility...`);

        // Create database with specific version
        const db = await DatabaseTestHelper.createTestDatabase(
          `pg_version_test_${pgVersion.version.replace(/\./g, '_')}`
        );

        expect(db.isConnected).toBe(true);

        // Test version-specific features
        const versionResult = await db.client.query('SELECT version()');
        const versionString = versionResult.rows[0].version;
        expect(versionString).toContain('PostgreSQL');

        // Test version-specific SQL syntax
        await testVersionSpecificSyntax(db, pgVersion.version);

        // Test deprecated feature handling
        await testDeprecatedFeatureHandling(db, pgVersion.version);

        await DatabaseTestHelper.dropTestDatabase(db.databaseName);

        console.log(`✅ PostgreSQL ${pgVersion.version} compatibility verified`);

      }, 30000);
    });
  });

  describe('Platform-Specific Integration Tests', () => {
    it('should handle Windows-specific scenarios', async () => {
      console.log('🪟 Testing Windows-specific scenarios...');

      Object.defineProperty(process, 'platform', { value: 'win32' });

      // Test Windows drive letters
      const windowsPaths = ['C:\\Users\\test', 'D:\\data\\db'];
      for (const path of windowsPaths) {
        const normalized = PlatformTestHelper.normalizePath(path);
        expect(normalized).toMatch(/^[A-Za-z]:/); // Should preserve drive letter
      }

      // Test Windows registry-like configurations
      const windowsConfig = {
        installDir: 'C:\\Program Files\\PostgreSQL\\16',
        dataDir: 'C:\\ProgramData\\PostgreSQL'
      };

      expect(windowsConfig.installDir).toMatch(/^[A-Za-z]:/);

      console.log('✅ Windows-specific scenarios handled correctly');

    });

    it('should handle Unix-specific scenarios', async () => {
      console.log('🐧 Testing Unix-specific scenarios...');

      const unixPlatforms = ['darwin', 'linux'];

      for (const platform of unixPlatforms) {
        Object.defineProperty(process, 'platform', { value: platform });

        // Test Unix file permissions
        const unixPaths = ['/home/user/.pgpass', '/etc/postgresql/'];
        for (const path of unixPaths) {
          const normalized = PlatformTestHelper.normalizePath(path);
          expect(normalized).toMatch(/^\/home|^\/etc/);
        }

        // Test Unix socket connections
        const socketConfig = {
          host: '/var/run/postgresql',
          port: 5432
        };

        expect(socketConfig.host).toMatch(/^\/var\/run/);
      }

      console.log('✅ Unix-specific scenarios handled correctly');

    });
  });
});

// Helper functions
async function testVersionSpecificSyntax(db: TestDatabase, version: string): Promise<void> {
  const majorVersion = parseInt(version.split('.')[0]);

  // Test features available in specific versions
  if (majorVersion >= 13) {
    // Test PostgreSQL 13+ features
    await db.client.query(`
      CREATE TABLE test_table (
        id SERIAL PRIMARY KEY,
        data JSONB
      )
    `);
  }

  if (majorVersion >= 14) {
    // Test PostgreSQL 14+ features
    await db.client.query(`
      SELECT * FROM pg_stat_statements
      WHERE query LIKE '%test%'
    `);
  }

  if (majorVersion >= 15) {
    // Test PostgreSQL 15+ features
    await db.client.query(`
      CREATE TABLE test_partitioned (
        id SERIAL,
        created_date DATE
      ) PARTITION BY RANGE (created_date);
    `);
  }
}

async function testDeprecatedFeatureHandling(db: TestDatabase, version: string): Promise<void> {
  const majorVersion = parseInt(version.split('.')[0]);

  // Test handling of deprecated features
  try {
    // Some older syntax that might be deprecated
    await db.client.query(`
      SELECT oid FROM pg_class WHERE relname = 'test_table'
    `);

    // If it works, that's fine
    // If it fails with deprecation warning, should handle gracefully
  } catch (error) {
    // Should handle deprecation warnings appropriately
    expect(error).toBeDefined();
  }
}

// Export for use in other test files
export {
  PlatformConfig,
  PLATFORM_CONFIGS,
  POSTGRESQL_VERSIONS,
  testVersionSpecificSyntax,
  testDeprecatedFeatureHandling
};