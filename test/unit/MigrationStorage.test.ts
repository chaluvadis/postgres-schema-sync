import { MigrationStorage } from '../../src/core/MigrationStorage';
import { MigrationRequest, MigrationResult } from '../../src/core/MigrationOrchestrator';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('MigrationStorage', () => {
    let storage: MigrationStorage;
    let testStoragePath: string;

    beforeEach(() => {
        testStoragePath = path.join(os.tmpdir(), 'test-migrations.json');
        storage = new MigrationStorage(testStoragePath);
    });

    afterEach(() => {
        if (fs.existsSync(testStoragePath)) {
            fs.unlinkSync(testStoragePath);
        }
    });

    describe('loadData and saveData', () => {
        it('should load empty data initially', async () => {
            const data = await storage.loadData();

            expect(data.activeMigrations).toEqual({});
            expect(data.migrationResults).toEqual({});
        });

        it('should save and load data correctly', async () => {
            const testData = {
                activeMigrations: {
                    'migration1': {
                        id: 'migration1',
                        sourceConnectionId: 'source1',
                        targetConnectionId: 'target1'
                    } as MigrationRequest
                },
                migrationResults: {
                    'result1': {
                        migrationId: 'result1',
                        success: true,
                        executionTime: 1000,
                        operationsProcessed: 5,
                        errors: [],
                        warnings: [],
                        rollbackAvailable: false,
                        executionLog: ['Completed successfully'],
                        metadata: {}
                    } as MigrationResult
                }
            };

            await storage.saveData(testData);
            const loadedData = await storage.loadData();

            expect(loadedData.activeMigrations).toEqual(testData.activeMigrations);
            expect(loadedData.migrationResults).toEqual(testData.migrationResults);
        });
    });

    describe('active migrations', () => {
        it('should add and retrieve active migrations', async () => {
            const request: MigrationRequest = {
                id: 'test-migration',
                sourceConnectionId: 'source1',
                targetConnectionId: 'target1'
            };

            await storage.addActiveMigration('test-migration', request);
            const activeMigrations = await storage.getActiveMigrations();

            expect(activeMigrations.has('test-migration')).toBe(true);
            expect(activeMigrations.get('test-migration')).toEqual(request);
        });

        it('should remove active migrations', async () => {
            const request: MigrationRequest = {
                id: 'test-migration',
                sourceConnectionId: 'source1',
                targetConnectionId: 'target1'
            };

            await storage.addActiveMigration('test-migration', request);
            await storage.removeActiveMigration('test-migration');

            const activeMigrations = await storage.getActiveMigrations();
            expect(activeMigrations.has('test-migration')).toBe(false);
        });
    });

    describe('migration results', () => {
        it('should add and retrieve migration results', async () => {
            const result: MigrationResult = {
                migrationId: 'test-result',
                success: true,
                executionTime: 500,
                operationsProcessed: 3,
                errors: [],
                warnings: [],
                rollbackAvailable: false,
                executionLog: ['Success'],
                metadata: {}
            };

            await storage.addMigrationResult('test-result', result);
            const results = await storage.getMigrationResults();

            expect(results.has('test-result')).toBe(true);
            expect(results.get('test-result')).toEqual(result);
        });
    });

    describe('clear', () => {
        it('should clear all data', async () => {
            const request: MigrationRequest = {
                id: 'test-migration',
                sourceConnectionId: 'source1',
                targetConnectionId: 'target1'
            };

            const result: MigrationResult = {
                migrationId: 'test-result',
                success: true,
                executionTime: 500,
                operationsProcessed: 3,
                errors: [],
                warnings: [],
                rollbackAvailable: false,
                executionLog: ['Success'],
                metadata: {}
            };

            await storage.addActiveMigration('test-migration', request);
            await storage.addMigrationResult('test-result', result);

            await storage.clear();

            const activeMigrations = await storage.getActiveMigrations();
            const results = await storage.getMigrationResults();

            expect(activeMigrations.size).toBe(0);
            expect(results.size).toBe(0);
        });
    });

    describe('error handling', () => {
        it('should handle file read errors gracefully', async () => {
            // Create storage with invalid path
            const invalidPath = path.join(os.tmpdir(), 'nonexistent', 'dir', 'storage.json');
            const invalidStorage = new MigrationStorage(invalidPath);

            const data = await invalidStorage.loadData();

            // Should return default empty data
            expect(data.activeMigrations).toEqual({});
            expect(data.migrationResults).toEqual({});
        });

        it('should handle file write errors gracefully', async () => {
            // Create storage with a path that will fail to write
            const invalidPath = '/dev/null/invalid/path/storage.json';
            const invalidStorage = new MigrationStorage(invalidPath);

            const testData = {
                activeMigrations: {},
                migrationResults: {}
            };

            // Should not throw error even if write fails
            await expect(invalidStorage.saveData(testData)).resolves.not.toThrow();
        });
    });
});