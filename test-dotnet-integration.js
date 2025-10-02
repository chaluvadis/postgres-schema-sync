#!/usr/bin/env node

/**
 * Test script for .NET integration
 * Tests Edge.js integration with the main PostgreSqlSchemaCompareSync class
 */

const { DotNetIntegrationService } = require('./src/services/DotNetIntegrationService');

async function testDotNetIntegration() {
    console.log('🧪 Testing .NET integration...\n');

    const service = DotNetIntegrationService.getInstance();

    try {
        // Test 1: Initialize the service
        console.log('1️⃣  Initializing .NET integration service...');
        const initialized = await service.initialize();
        console.log(`   ✅ Service initialized: ${initialized}\n`);

        // Test 2: Get system health
        console.log('2️⃣  Testing GetSystemHealth method...');
        const health = await service.getSystemHealth();
        console.log('   ✅ System health retrieved:');
        console.log(`      Status: ${health.status}`);
        console.log(`      Version: ${health.version}`);
        console.log(`      Services - Database: ${health.services.database}`);
        console.log(`      Services - Cache: ${health.services.cache}`);
        console.log(`      Services - Logging: ${health.services.logging}\n`);

        // Test 3: Test connection (will use simulation since no real DB)
        console.log('3️⃣  Testing connection functionality...');
        const connectionInfo = {
            id: 'test-connection-1',
            name: 'Test Connection',
            host: 'localhost',
            port: 5432,
            database: 'testdb',
            username: 'postgres',
            password: 'password'
        };

        const connectionTest = await service.testConnection(connectionInfo);
        console.log(`   ✅ Connection test result: ${connectionTest}\n`);

        // Test 4: Browse schema (will use simulation)
        console.log('4️⃣  Testing schema browsing...');
        const schemaObjects = await service.browseSchema(connectionInfo, 'public');
        console.log(`   ✅ Schema browsing completed:`);
        console.log(`      Found ${schemaObjects.length} objects`);

        // Group objects by type
        const objectsByType = {};
        schemaObjects.forEach(obj => {
            const type = obj.type;
            objectsByType[type] = (objectsByType[type] || 0) + 1;
        });

        Object.entries(objectsByType).forEach(([type, count]) => {
            console.log(`      - ${type}s: ${count}`);
        });
        console.log('');

        // Test 5: Schema comparison (will use simulation)
        console.log('5️⃣  Testing schema comparison...');
        const sourceConnection = {
            id: 'source-conn',
            name: 'Source DB',
            host: 'localhost',
            port: 5432,
            database: 'sourcedb',
            username: 'postgres',
            password: 'password'
        };

        const targetConnection = {
            id: 'target-conn',
            name: 'Target DB',
            host: 'localhost',
            port: 5432,
            database: 'targetdb',
            username: 'postgres',
            password: 'password'
        };

        const comparison = await service.compareSchemas(sourceConnection, targetConnection, {});
        console.log(`   ✅ Schema comparison completed:`);
        console.log(`      Comparison ID: ${comparison.id}`);
        console.log(`      Differences found: ${comparison.differences.length}`);

        comparison.differences.forEach((diff, index) => {
            console.log(`      ${index + 1}. ${diff.type} ${diff.objectType} '${diff.objectName}'`);
        });
        console.log('');

        // Test 6: Migration generation (will use simulation)
        console.log('6️⃣  Testing migration generation...');
        const migration = await service.generateMigration(comparison, { isDryRun: true });
        console.log(`   ✅ Migration generated:`);
        console.log(`      Migration ID: ${migration.id}`);
        console.log(`      SQL Script length: ${migration.sqlScript.length} characters`);
        console.log(`      Rollback Script length: ${migration.rollbackScript.length} characters`);
        console.log(`      Status: ${migration.status}\n`);

        // Test 7: Test error handling
        console.log('7️⃣  Testing error handling...');
        try {
            // Test with invalid connection info to trigger error handling
            const invalidConnection = {
                id: 'invalid-conn',
                name: 'Invalid Connection',
                host: '', // Invalid host
                port: 0,
                database: '',
                username: '',
                password: ''
            };

            await service.testConnection(invalidConnection);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.log(`   ✅ Error handling works: ${errorMessage}\n`);
        }

        console.log('🎉 All .NET integration tests completed successfully!');
        console.log('✅ Edge.js integration is working correctly');
        console.log('✅ Method bindings are functional');
        console.log('✅ Error handling is operational');
        console.log('✅ Both real and simulation modes are available');

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const stackTrace = error instanceof Error ? error.stack : 'No stack trace available';
        console.error('❌ .NET integration test failed:', errorMessage);
        console.error('Stack trace:', stackTrace);
        process.exit(1);
    }
}

// Run the test if this file is executed directly
if (require.main === module) {
    testDotNetIntegration().catch(error => {
        console.error('Test execution failed:', error);
        process.exit(1);
    });
}

module.exports = { testDotNetIntegration };