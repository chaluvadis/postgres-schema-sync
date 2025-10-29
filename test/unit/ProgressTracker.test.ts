import { ProgressTracker, ProgressInfo, BatchProgressInfo, ValidationProgressInfo, MigrationProgressInfo } from '../../src/core/ProgressTracker';

describe('ProgressTracker', () => {
    let progressTracker: ProgressTracker;

    beforeEach(() => {
        progressTracker = new ProgressTracker();
    });

    afterEach(() => {
        progressTracker.dispose();
    });

    describe('startOperation', () => {
        it('should start a new operation', () => {
            const callback = jest.fn();
            progressTracker.startOperation('test-op', 'Test Operation', 10, callback);

            const progress = progressTracker.getProgress('test-op');
            expect(progress).toBeDefined();
            expect(progress!.operation).toBe('Test Operation');
            expect(progress!.currentStep).toBe(0);
            expect(progress!.totalSteps).toBe(10);
            expect(progress!.percentage).toBe(0);
        });
    });

    describe('updateProgress', () => {
        it('should update operation progress', () => {
            progressTracker.startOperation('test-op', 'Test Operation', 10);

            progressTracker.updateProgress('test-op', 5, 'Halfway done', { detail: 'test' });

            const progress = progressTracker.getProgress('test-op') as ProgressInfo;
            expect(progress.currentStep).toBe(5);
            expect(progress.percentage).toBe(50);
            expect(progress.message).toBe('Halfway done');
            expect(progress.details).toEqual({ detail: 'test' });
        });

        it('should not update non-existent operation', () => {
            progressTracker.updateProgress('non-existent', 5);

            const progress = progressTracker.getProgress('non-existent');
            expect(progress).toBeNull();
        });
    });

    describe('completeOperation', () => {
        it('should complete an operation', () => {
            const callback = jest.fn();
            progressTracker.startOperation('test-op', 'Test Operation', 10, callback);

            progressTracker.completeOperation('test-op', 'Completed successfully');

            const progress = progressTracker.getProgress('test-op') as ProgressInfo;
            expect(progress.currentStep).toBe(10);
            expect(progress.percentage).toBe(100);
            expect(progress.message).toBe('Completed successfully');
            expect(callback).toHaveBeenCalledWith(progress);
        });

        it('should not complete non-existent operation', () => {
            progressTracker.completeOperation('non-existent');

            const progress = progressTracker.getProgress('non-existent');
            expect(progress).toBeNull();
        });
    });

    describe('failOperation', () => {
        it('should fail an operation', () => {
            const callback = jest.fn();
            progressTracker.startOperation('test-op', 'Test Operation', 10, callback);

            progressTracker.failOperation('test-op', 'Operation failed');

            const progress = progressTracker.getProgress('test-op') as ProgressInfo;
            expect(progress.percentage).toBe(-1);
            expect(progress.message).toBe('Operation failed: Operation failed');
            expect(callback).toHaveBeenCalledWith(progress);
        });
    });

    describe('startBatchOperation', () => {
        it('should start a batch operation', () => {
            const callback = jest.fn();
            progressTracker.startBatchOperation('batch-op', 'batch-1', 3, 30, callback);

            const progress = progressTracker.getProgress('batch-op') as BatchProgressInfo;
            expect(progress.operation).toBe('Batch Operation');
            expect(progress.batchId).toBe('batch-1');
            expect(progress.totalBatches).toBe(3);
            expect(progress.totalOperations).toBe(30);
            expect(progress.batchErrors).toEqual([]);
            expect(progress.batchWarnings).toEqual([]);
        });
    });

    describe('updateBatchProgress', () => {
        it('should update batch progress', () => {
            progressTracker.startBatchOperation('batch-op', 'batch-1', 3, 30);

            progressTracker.updateBatchProgress('batch-op', 2, 15, 'Processing batch 2', ['error1'], ['warning1']);

            const progress = progressTracker.getProgress('batch-op') as BatchProgressInfo;
            expect(progress.batchNumber).toBe(2);
            expect(progress.completedOperations).toBe(15);
            expect(progress.currentBatchOperation).toBe('Processing batch 2');
            expect(progress.batchErrors).toEqual(['error1']);
            expect(progress.batchWarnings).toEqual(['warning1']);
        });
    });

    describe('startMigrationOperation', () => {
        it('should start a migration operation', () => {
            const callback = jest.fn();
            progressTracker.startMigrationOperation('migration-op', 'migration-1', 'source-conn', 'target-conn', callback);

            const progress = progressTracker.getProgress('migration-op') as MigrationProgressInfo;
            expect(progress.operation).toBe('Migration');
            expect(progress.migrationId).toBe('migration-1');
            expect(progress.sourceConnection).toBe('source-conn');
            expect(progress.targetConnection).toBe('target-conn');
            expect(progress.currentPhase).toBe('validation');
            expect(progress.totalSteps).toBe(5);
            expect(progress.executionLog).toEqual([]);
            expect(progress.errors).toEqual([]);
            expect(progress.warnings).toEqual([]);
        });
    });

    describe('updateMigrationProgress', () => {
        it('should update migration progress', () => {
            progressTracker.startMigrationOperation('migration-op', 'migration-1', 'source-conn', 'target-conn');

            progressTracker.updateMigrationProgress('migration-op', 'backup', 'Creating backup', 5000, ['error1'], ['warning1']);

            const progress = progressTracker.getProgress('migration-op') as MigrationProgressInfo;
            expect(progress.currentPhase).toBe('backup');
            expect(progress.currentStep).toBe(2);
            expect(progress.percentage).toBe(40);
            expect(progress.message).toBe('Creating backup');
            expect(progress.estimatedTimeRemaining).toBe(5000);
            expect(progress.errors).toEqual(['error1']);
            expect(progress.warnings).toEqual(['warning1']);
            expect(progress.executionLog.length).toBe(1);
            expect(progress.executionLog[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z: Creating backup$/);
        });
    });

    describe('cancelOperation', () => {
        it('should cancel an operation', () => {
            const callback = jest.fn();
            progressTracker.startOperation('test-op', 'Test Operation', 10, callback);

            progressTracker.cancelOperation('test-op');

            const progress = progressTracker.getProgress('test-op');
            expect(progress).not.toBeNull();
            if (progress) {
                expect(progress.message).toBe('Operation cancelled');
                expect(callback).toHaveBeenCalledWith(progress);
            }
        });
    });

    describe('getStats', () => {
        it('should return tracker statistics', () => {
            progressTracker.startOperation('op1', 'Operation 1', 10);
            progressTracker.startBatchOperation('batch1', 'batch-1', 2, 20);
            progressTracker.startMigrationOperation('migration1', 'mig-1', 'src', 'tgt');

            const stats = progressTracker.getStats();

            expect(stats.activeOperations).toBe(1);
            expect(stats.batchOperations).toBe(1);
            expect(stats.migrationOperations).toBe(1);
            expect(stats.validationOperations).toBe(0);
        });
    });

    describe('dispose', () => {
        it('should clear all operations and callbacks', () => {
            progressTracker.startOperation('test-op', 'Test Operation', 10);

            progressTracker.dispose();

            const progress = progressTracker.getProgress('test-op');
            expect(progress).toBeNull();

            const stats = progressTracker.getStats();
            expect(stats.activeOperations).toBe(0);
            expect(stats.batchOperations).toBe(0);
            expect(stats.validationOperations).toBe(0);
            expect(stats.migrationOperations).toBe(0);
            expect(stats.totalCallbacks).toBe(0);
        });
    });
});