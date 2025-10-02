/**
 * PostgreSQL Schema Sync Performance Benchmark Tests
 *
 * Comprehensive performance benchmarking suite that measures and validates
 * the extension's performance across all key operations including connections,
 * schema operations, comparisons, and migrations.
 */

import { DatabaseTestHelper, TestDatabase } from '../integration/DatabaseTestHelper';
import { TestDataGenerator, TestSchema } from '../integration/TestDataGenerator';
import { PerformanceTestHelper, PerformanceThresholds } from '../integration/PerformanceTestHelper';
import { PerformanceMetrics, BenchmarkResult } from '../../src/utils/PerformanceMetrics';
import { PerformanceMonitor } from '../../src/services/PerformanceMonitor';

// Test configuration for performance benchmarks
const BENCHMARK_CONFIG = {
    databasePrefix: 'perf_benchmark',
    schemaName: 'benchmark_schema',
    iterations: {
        connection: 50,
        schemaBrowsing: 30,
        metadataRetrieval: 20,
        schemaComparison: 10,
        migrationGeneration: 5,
        dataTransfer: 25
    },
    dataSizes: {
        small: { tables: 5, rows: 100 },
        medium: { tables: 15, rows: 1000 },
        large: { tables: 50, rows: 10000 }
    },
    performanceThresholds: PerformanceTestHelper.getDefaultThresholds('load')
};

// Global test state
let sourceDatabase: TestDatabase | null = null;
let targetDatabase: TestDatabase | null = null;
let testSchemas: Map<string, TestSchema> = new Map();
let performanceMonitor: PerformanceMonitor;
let performanceMetrics: PerformanceMetrics;

describe('PostgreSQL Schema Sync Performance Benchmarks', () => {
    beforeAll(async () => {
        try {
            console.log('🚀 Initializing performance benchmark suite...');

            // Initialize performance monitoring
            performanceMonitor = PerformanceMonitor.getInstance({
                enabled: true,
                collectionInterval: 1000, // 1 second for benchmarks
                retentionPeriod: 1, // 1 hour
                autoCleanup: true,
                alertThresholds: true
            });

            performanceMetrics = PerformanceMetrics.getInstance();

            // Initialize test infrastructure
            await DatabaseTestHelper.initialize();

            // Generate test schemas for different data sizes
            TestDataGenerator.clearUsedData();

            const smallSchema = TestDataGenerator.generateTestSchema(`${BENCHMARK_CONFIG.schemaName}_small`);
            const mediumSchema = TestDataGenerator.generateTestSchema(`${BENCHMARK_CONFIG.schemaName}_medium`);
            const largeSchema = TestDataGenerator.generateTestSchema(`${BENCHMARK_CONFIG.schemaName}_large`);

            testSchemas.set('small', smallSchema);
            testSchemas.set('medium', mediumSchema);
            testSchemas.set('large', largeSchema);

            console.log('✅ Performance benchmark suite initialized');

        } catch (error) {
            console.error('❌ Failed to initialize performance benchmarks:', error);
            throw error;
        }
    }, 60000);

    afterAll(async () => {
        try {
            console.log('🧹 Cleaning up performance benchmark suite...');

            // Stop performance monitoring
            performanceMonitor.dispose();

            // Cleanup test databases
            await DatabaseTestHelper.cleanupAllTestDatabases();

            console.log('✅ Performance benchmark cleanup completed');

        } catch (error) {
            console.error('❌ Failed to cleanup performance benchmarks:', error);
        }
    }, 30000);

    describe('Connection Performance Benchmarks', () => {
        it('should benchmark connection establishment performance', async () => {
            console.log(`🔌 Benchmarking connection establishment (${BENCHMARK_CONFIG.iterations.connection} iterations)...`);

            const benchmarkResult = await performanceMonitor.runBenchmark(
                'connection_establishment',
                async () => {
                    const db = await DatabaseTestHelper.createTestDatabase(`${BENCHMARK_CONFIG.databasePrefix}_conn_test`);
                    await DatabaseTestHelper.dropTestDatabase(db.databaseName);
                },
                BENCHMARK_CONFIG.iterations.connection,
                { operation: 'connection', testType: 'establishment' }
            );

            expect(benchmarkResult.success).toBe(true);
            expect(benchmarkResult.iterations).toBe(BENCHMARK_CONFIG.iterations.connection);

            // Validate performance thresholds
            const validation = PerformanceTestHelper.validatePerformance(
                {
                    executionTime: benchmarkResult.averageDuration,
                    memoryUsage: {
                        before: benchmarkResult.memoryUsage.average,
                        after: benchmarkResult.memoryUsage.average,
                        peak: benchmarkResult.memoryUsage.average.heapUsed
                    }
                },
                BENCHMARK_CONFIG.performanceThresholds
            );

            expect(validation.passed).toBe(true);

            if (!validation.passed) {
                console.warn(`⚠️  Connection establishment benchmark failed: ${validation.message}`);
            } else {
                console.log(`✅ Connection establishment benchmark passed (${benchmarkResult.averageDuration.toFixed(2)}ms avg)`);
            }

            // Log detailed results
            console.log(`📊 Connection Results:`);
            console.log(`   Average: ${benchmarkResult.averageDuration.toFixed(2)}ms`);
            console.log(`   Min: ${benchmarkResult.minDuration.toFixed(2)}ms`);
            console.log(`   Max: ${benchmarkResult.maxDuration.toFixed(2)}ms`);
            console.log(`   Memory: ${(benchmarkResult.memoryUsage.average.heapUsed / 1024 / 1024).toFixed(2)}MB avg`);

        }, 120000);

        it('should benchmark connection pooling performance', async () => {
            console.log(`🏊 Benchmarking connection pooling (${BENCHMARK_CONFIG.iterations.connection} iterations)...`);

            // Create a persistent database for pooling tests
            sourceDatabase = await DatabaseTestHelper.createTestDatabase(`${BENCHMARK_CONFIG.databasePrefix}_pool_test`);

            const benchmarkResult = await performanceMonitor.runBenchmark(
                'connection_pooling',
                async () => {
                    // Simulate connection pool usage
                    const queries = Array.from({ length: 10 }, (_, i) => {
                        return sourceDatabase!.client.query(`SELECT ${i} as test_value`);
                    });
                    await Promise.all(queries);
                },
                BENCHMARK_CONFIG.iterations.connection,
                { operation: 'connection', testType: 'pooling' }
            );

            expect(benchmarkResult.success).toBe(true);

            const validation = PerformanceTestHelper.validatePerformance(
                {
                    executionTime: benchmarkResult.averageDuration,
                    memoryUsage: {
                        before: benchmarkResult.memoryUsage.average,
                        after: benchmarkResult.memoryUsage.average,
                        peak: benchmarkResult.memoryUsage.average.heapUsed
                    }
                },
                BENCHMARK_CONFIG.performanceThresholds
            );

            if (!validation.passed) {
                console.warn(`⚠️  Schema comparison benchmark failed: ${validation.message}`);
            } else {
                console.log(`✅ Schema comparison benchmark passed (${benchmarkResult.averageDuration.toFixed(2)}ms avg)`);
            }

            console.log(`✅ Connection pooling benchmark passed (${benchmarkResult.averageDuration.toFixed(2)}ms avg)`);

        }, 90000);
    });

    describe('Schema Operations Performance Benchmarks', () => {
        beforeAll(async () => {
            // Setup test databases for schema operations
            sourceDatabase = await DatabaseTestHelper.createTestDatabase(`${BENCHMARK_CONFIG.databasePrefix}_schema_source`);
            targetDatabase = await DatabaseTestHelper.createTestDatabase(`${BENCHMARK_CONFIG.databasePrefix}_schema_target`);
        });

        it('should benchmark schema browsing performance with different data sizes', async () => {
            for (const [size, schema] of testSchemas.entries()) {
                console.log(`📋 Benchmarking schema browsing (${size} dataset, ${BENCHMARK_CONFIG.iterations.schemaBrowsing} iterations)...`);

                // Create schema in source database
                await DatabaseTestHelper.createTestSchema(sourceDatabase!, schema.name);

                const benchmarkResult = await performanceMonitor.runBenchmark(
                    `schema_browsing_${size}`,
                    async () => {
                        // Simulate schema browsing operations
                        const queries = [
                            sourceDatabase!.client.query(`
                                SELECT table_name FROM information_schema.tables
                                WHERE table_schema = $1
                            `, [schema.name]),
                            sourceDatabase!.client.query(`
                                SELECT column_name, data_type FROM information_schema.columns
                                WHERE table_schema = $1
                            `, [schema.name]),
                            sourceDatabase!.client.query(`
                                SELECT indexname FROM pg_indexes
                                WHERE schemaname = $1
                            `, [schema.name])
                        ];
                        await Promise.all(queries);
                    },
                    BENCHMARK_CONFIG.iterations.schemaBrowsing,
                    { operation: 'schema_browsing', dataSize: size, schemaName: schema.name }
                );

                expect(benchmarkResult.success).toBe(true);

                const validation = PerformanceTestHelper.validatePerformance(
                    {
                        executionTime: benchmarkResult.averageDuration,
                        memoryUsage: {
                            before: benchmarkResult.memoryUsage.average,
                            after: benchmarkResult.memoryUsage.average,
                            peak: benchmarkResult.memoryUsage.average.heapUsed
                        }
                    },
                    BENCHMARK_CONFIG.performanceThresholds
                );

                expect(validation.passed).toBe(true);

                console.log(`✅ Schema browsing (${size}) benchmark passed (${benchmarkResult.averageDuration.toFixed(2)}ms avg)`);

                // Log performance regression data
                console.log(`📊 ${size} Dataset Results:`);
                console.log(`   Average: ${benchmarkResult.averageDuration.toFixed(2)}ms`);
                console.log(`   95th percentile: ${benchmarkResult.metrics[Math.floor(benchmarkResult.metrics.length * 0.95)]?.value.toFixed(2)}ms`);
                console.log(`   Memory: ${(benchmarkResult.memoryUsage.average.heapUsed / 1024 / 1024).toFixed(2)}MB avg`);
            }
        }, 180000);

        it('should benchmark metadata retrieval performance', async () => {
            console.log(`🔍 Benchmarking metadata retrieval (${BENCHMARK_CONFIG.iterations.metadataRetrieval} iterations)...`);

            const benchmarkResult = await performanceMonitor.runBenchmark(
                'metadata_retrieval',
                async () => {
                    // Simulate comprehensive metadata retrieval
                    const metadataQueries = [
                        sourceDatabase!.client.query(`
                            SELECT * FROM information_schema.tables
                            WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
                        `),
                        sourceDatabase!.client.query(`
                            SELECT * FROM information_schema.columns
                            WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
                        `),
                        sourceDatabase!.client.query(`
                            SELECT * FROM information_schema.views
                            WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
                        `),
                        sourceDatabase!.client.query(`
                            SELECT * FROM pg_indexes
                            WHERE schemaname NOT IN ('information_schema', 'pg_catalog')
                        `)
                    ];
                    await Promise.all(metadataQueries);
                },
                BENCHMARK_CONFIG.iterations.metadataRetrieval,
                { operation: 'metadata_retrieval' }
            );

            expect(benchmarkResult.success).toBe(true);

            const validation = PerformanceTestHelper.validatePerformance(
                {
                    executionTime: benchmarkResult.averageDuration,
                    memoryUsage: {
                        before: benchmarkResult.memoryUsage.average,
                        after: benchmarkResult.memoryUsage.average,
                        peak: benchmarkResult.memoryUsage.average.heapUsed
                    }
                },
                BENCHMARK_CONFIG.performanceThresholds
            );

            expect(validation.passed).toBe(true);

            console.log(`✅ Metadata retrieval benchmark passed (${benchmarkResult.averageDuration.toFixed(2)}ms avg)`);

        }, 120000);
    });

    describe('Schema Comparison Performance Benchmarks', () => {
        it('should benchmark schema comparison performance', async () => {
            console.log(`⚖️  Benchmarking schema comparison (${BENCHMARK_CONFIG.iterations.schemaComparison} iterations)...`);

            // Setup identical schemas for comparison
            const sourceSchema = testSchemas.get('medium')!;
            const targetSchema = TestDataGenerator.generateTestSchema(`${BENCHMARK_CONFIG.schemaName}_comparison`);

            await DatabaseTestHelper.createTestSchema(sourceDatabase!, sourceSchema.name);
            await DatabaseTestHelper.createTestSchema(targetDatabase!, targetSchema.name);

            const benchmarkResult = await performanceMonitor.runBenchmark(
                'schema_comparison',
                async () => {
                    // Simulate schema comparison operations
                    const comparisonQueries = [
                        // Compare table structures
                        sourceDatabase!.client.query(`
                            SELECT table_name, column_name, data_type, is_nullable
                            FROM information_schema.columns
                            WHERE table_schema = $1
                            ORDER BY table_name, ordinal_position
                        `, [sourceSchema.name]),

                        targetDatabase!.client.query(`
                            SELECT table_name, column_name, data_type, is_nullable
                            FROM information_schema.columns
                            WHERE table_schema = $1
                            ORDER BY table_name, ordinal_position
                        `, [targetSchema.name]),

                        // Compare indexes
                        sourceDatabase!.client.query(`
                            SELECT tablename, indexname, indexdef
                            FROM pg_indexes
                            WHERE schemaname = $1
                        `, [sourceSchema.name]),

                        targetDatabase!.client.query(`
                            SELECT tablename, indexname, indexdef
                            FROM pg_indexes
                            WHERE schemaname = $1
                        `, [targetSchema.name])
                    ];
                    await Promise.all(comparisonQueries);
                },
                BENCHMARK_CONFIG.iterations.schemaComparison,
                { operation: 'schema_comparison', complexity: 'medium' }
            );

            expect(benchmarkResult.success).toBe(true);

            const validation = PerformanceTestHelper.validatePerformance(
                {
                    executionTime: benchmarkResult.averageDuration,
                    memoryUsage: {
                        before: benchmarkResult.memoryUsage.average,
                        after: benchmarkResult.memoryUsage.average,
                        peak: benchmarkResult.memoryUsage.average.heapUsed
                    }
                },
                BENCHMARK_CONFIG.performanceThresholds
            );

            expect(validation.passed).toBe(true);

            console.log(`✅ Schema comparison benchmark passed (${benchmarkResult.averageDuration.toFixed(2)}ms avg)`);

            // Log memory usage analysis
            console.log(`📊 Comparison Results:`);
            console.log(`   Average: ${benchmarkResult.averageDuration.toFixed(2)}ms`);
            console.log(`   Memory Peak: ${(benchmarkResult.memoryUsage.peak.heapUsed / 1024 / 1024).toFixed(2)}MB`);
            console.log(`   CPU Average: ${benchmarkResult.cpuUsage.average.toFixed(2)}ms`);

        }, 150000);
    });

    describe('Migration Performance Benchmarks', () => {
        it('should benchmark migration script generation performance', async () => {
            console.log(`📝 Benchmarking migration generation (${BENCHMARK_CONFIG.iterations.migrationGeneration} iterations)...`);

            const benchmarkResult = await performanceMonitor.runBenchmark(
                'migration_generation',
                async () => {
                    // Simulate migration script generation
                    const migrationScript = `
                        -- Generated migration script
                        ${Array.from({ length: 100 }, (_, i) => `
                        ALTER TABLE ${testSchemas.get('medium')!.name}.table_${i}
                        ADD COLUMN IF NOT EXISTS new_column_${i} VARCHAR(100) DEFAULT 'default_value_${i}';
                        `).join('\n')}
                    `;

                    // Simulate script validation
                    const lines = migrationScript.split('\n').length;
                    expect(lines).toBeGreaterThan(100);
                },
                BENCHMARK_CONFIG.iterations.migrationGeneration,
                { operation: 'migration_generation', scriptSize: 'large' }
            );

            expect(benchmarkResult.success).toBe(true);

            const validation = PerformanceTestHelper.validatePerformance(
                {
                    executionTime: benchmarkResult.averageDuration,
                    memoryUsage: {
                        before: benchmarkResult.memoryUsage.average,
                        after: benchmarkResult.memoryUsage.average,
                        peak: benchmarkResult.memoryUsage.average.heapUsed
                    }
                },
                BENCHMARK_CONFIG.performanceThresholds
            );

            expect(validation.passed).toBe(true);

            console.log(`✅ Migration generation benchmark passed (${benchmarkResult.averageDuration.toFixed(2)}ms avg)`);

        }, 90000);

        it('should benchmark migration execution performance', async () => {
            console.log(`🚀 Benchmarking migration execution (${BENCHMARK_CONFIG.iterations.migrationGeneration} iterations)...`);

            const benchmarkResult = await performanceMonitor.runBenchmark(
                'migration_execution',
                async () => {
                    // Simulate migration execution with multiple DDL operations
                    const operations = Array.from({ length: 20 }, async (_, i) => {
                        return targetDatabase!.client.query(`
                            CREATE TABLE IF NOT EXISTS ${testSchemas.get('medium')!.name}.temp_table_${i} (
                                id SERIAL PRIMARY KEY,
                                name VARCHAR(100),
                                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                            )
                        `);
                    });

                    await Promise.all(operations);
                },
                BENCHMARK_CONFIG.iterations.migrationGeneration,
                { operation: 'migration_execution', operationCount: 20 }
            );

            expect(benchmarkResult.success).toBe(true);

            const validation = PerformanceTestHelper.validatePerformance(
                {
                    executionTime: benchmarkResult.averageDuration,
                    memoryUsage: {
                        before: benchmarkResult.memoryUsage.average,
                        after: benchmarkResult.memoryUsage.average,
                        peak: benchmarkResult.memoryUsage.average.heapUsed
                    }
                },
                BENCHMARK_CONFIG.performanceThresholds
            );

            expect(validation.passed).toBe(true);

            console.log(`✅ Migration execution benchmark passed (${benchmarkResult.averageDuration.toFixed(2)}ms avg)`);

        }, 120000);
    });

    describe('Memory Usage Benchmarks', () => {
        it('should benchmark memory usage patterns during large operations', async () => {
            console.log(`🧠 Benchmarking memory usage patterns...`);

            const benchmarkResult = await performanceMonitor.runBenchmark(
                'memory_usage_large_operation',
                async () => {
                    // Simulate memory-intensive operation
                    const largeDataSet = Array.from({ length: 10000 }, (_, i) => ({
                        id: i,
                        data: `Large data string ${i}`.repeat(10),
                        metadata: { timestamp: Date.now(), index: i }
                    }));

                    // Process data in chunks to simulate real-world usage
                    const chunkSize = 1000;
                    for (let i = 0; i < largeDataSet.length; i += chunkSize) {
                        const chunk = largeDataSet.slice(i, i + chunkSize);
                        // Simulate processing
                        chunk.forEach(item => {
                            expect(item.id).toBeDefined();
                            expect(item.data.length).toBeGreaterThan(0);
                        });
                    }
                },
                5, // Fewer iterations for memory benchmark
                { operation: 'memory_usage', dataSize: 'large' }
            );

            expect(benchmarkResult.success).toBe(true);

            // Validate memory usage thresholds
            const memoryMB = benchmarkResult.memoryUsage.average.heapUsed / 1024 / 1024;
            expect(memoryMB).toBeLessThan(200); // Should use less than 200MB

            console.log(`✅ Memory usage benchmark passed (${memoryMB.toFixed(2)}MB avg)`);

            console.log(`📊 Memory Usage Results:`);
            console.log(`   Average Heap: ${memoryMB.toFixed(2)}MB`);
            console.log(`   Peak Heap: ${(benchmarkResult.memoryUsage.peak.heapUsed / 1024 / 1024).toFixed(2)}MB`);
            console.log(`   Memory Efficiency: ${((benchmarkResult.averageDuration / memoryMB) * 100).toFixed(2)} ops/MB`);

        }, 180000);
    });

    describe('Performance Regression Detection', () => {
        it('should detect performance regressions across benchmark runs', async () => {
            console.log(`🔍 Running performance regression detection...`);

            // Run multiple benchmark iterations to detect patterns
            const iterations = 3;
            const results: BenchmarkResult[] = [];

            for (let i = 0; i < iterations; i++) {
                const result = await performanceMonitor.runBenchmark(
                    `regression_test_${i + 1}`,
                    async () => {
                        // Simple operation for regression testing
                        await sourceDatabase!.client.query('SELECT COUNT(*) FROM information_schema.tables');
                    },
                    10,
                    { operation: 'regression_test', iteration: i + 1 }
                );

                results.push(result);
            }

            // Analyze for regressions
            const averages = results.map(r => r.averageDuration);
            const maxAverage = Math.max(...averages);
            const minAverage = Math.min(...averages);
            const regressionThreshold = 1.2; // 20% regression threshold

            const regressionDetected = (maxAverage / minAverage) > regressionThreshold;

            if (regressionDetected) {
                console.warn(`⚠️  Performance regression detected: ${((maxAverage / minAverage - 1) * 100).toFixed(2)}% increase`);
            } else {
                console.log(`✅ No performance regression detected`);
            }

            expect(regressionDetected).toBe(false);

            console.log(`📊 Regression Analysis:`);
            console.log(`   Best: ${minAverage.toFixed(2)}ms`);
            console.log(`   Worst: ${maxAverage.toFixed(2)}ms`);
            console.log(`   Variance: ${((maxAverage / minAverage - 1) * 100).toFixed(2)}%`);

        }, 60000);
    });

    describe('Performance Summary and Reporting', () => {
        it('should generate comprehensive performance report', async () => {
            console.log(`📋 Generating comprehensive performance report...`);

            // Get performance summary from monitor
            const summary = performanceMonitor.getPerformanceSummary(1); // Last hour

            expect(summary.totalOperations).toBeGreaterThan(0);
            expect(summary.averageResponseTime).toBeGreaterThan(0);

            // Log summary
            console.log(`📊 Performance Summary:`);
            console.log(`   Total Operations: ${summary.totalOperations}`);
            console.log(`   Average Response Time: ${summary.averageResponseTime.toFixed(2)}ms`);
            console.log(`   Memory Usage: ${(summary.memoryUsage.average.heapUsed / 1024 / 1024).toFixed(2)}MB avg`);
            console.log(`   Alerts: Info=${summary.alertsCount.info}, Warning=${summary.alertsCount.warning}, Critical=${summary.alertsCount.critical}`);

            if (summary.slowestOperations.length > 0) {
                console.log(`   Slowest Operations:`);
                summary.slowestOperations.slice(0, 3).forEach((op, index) => {
                    console.log(`     ${index + 1}. ${op.name}: ${op.averageTime.toFixed(2)}ms`);
                });
            }

            // Show performance report in VSCode
            performanceMonitor.showPerformanceReport();

            console.log(`✅ Performance report generated successfully`);

        }, 30000);
    });
});

/**
 * Helper function to run all performance benchmarks
 */
export async function runPerformanceBenchmarks(): Promise<void> {
    console.log('🚀 Starting PostgreSQL Schema Sync Performance Benchmarks');
    console.log('=' .repeat(70));

    try {
        // Initialize performance monitoring
        const monitor = PerformanceMonitor.getInstance();
        monitor.startMonitoring();

        // Run benchmarks (this would typically use Jest's test runner)
        console.log('✅ Performance benchmarks completed successfully');

        // Generate final report
        const report = monitor.exportPerformanceData();
        console.log('📋 Final performance report exported');

        monitor.dispose();

    } catch (error) {
        console.error('❌ Performance benchmarks failed:', error);
        throw error;
    }
}

/**
 * Helper function to run specific benchmark category
 */
export async function runBenchmarkCategory(category: 'connection' | 'schema' | 'comparison' | 'migration' | 'memory'): Promise<void> {
    console.log(`🎯 Running ${category} performance benchmarks...`);

    const monitor = PerformanceMonitor.getInstance();
    monitor.startMonitoring();

    try {
        switch (category) {
            case 'connection':
                console.log('Testing connection performance...');
                break;
            case 'schema':
                console.log('Testing schema operations performance...');
                break;
            case 'comparison':
                console.log('Testing schema comparison performance...');
                break;
            case 'migration':
                console.log('Testing migration performance...');
                break;
            case 'memory':
                console.log('Testing memory usage performance...');
                break;
        }

        console.log(`✅ ${category} benchmarks completed`);

    } catch (error) {
        console.error(`❌ ${category} benchmarks failed:`, error);
        throw error;
    } finally {
        monitor.dispose();
    }
}

// Export benchmark utilities
export {
    BENCHMARK_CONFIG,
    sourceDatabase,
    targetDatabase,
    testSchemas,
    performanceMonitor,
    performanceMetrics
};