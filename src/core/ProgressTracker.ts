import { Logger } from '@/utils/Logger';
export interface ProgressInfo {
    id: string;
    operation: string;
    currentStep: number;
    totalSteps: number;
    percentage: number;
    message?: string;
    details?: Record<string, any>;
    timestamp: Date;
}
export interface ProgressCallback {
    (progress: ProgressInfo | BatchProgressInfo | ValidationProgressInfo | MigrationProgressInfo): void;
}
export interface BatchProgressInfo extends ProgressInfo {
    batchId: string;
    batchNumber: number;
    totalBatches: number;
    completedOperations: number;
    totalOperations: number;
    currentBatchOperation?: string;
    batchErrors: string[];
    batchWarnings: string[];
}
export interface ValidationProgressInfo extends ProgressInfo {
    validationType: 'business_rules' | 'schema' | 'data' | 'performance';
    rulesProcessed: number;
    totalRules: number;
    passedRules: number;
    failedRules: number;
    warningRules: number;
}
export interface MigrationProgressInfo extends ProgressInfo {
    migrationId: string;
    sourceConnection: string;
    targetConnection: string;
    currentPhase: 'validation' | 'backup' | 'execution' | 'verification' | 'cleanup';
    estimatedTimeRemaining?: number;
    executionLog: string[];
    errors: string[];
    warnings: string[];
}
export class ProgressTracker {
    private activeOperations: Map<string, ProgressInfo> = new Map();
    private callbacks: Map<string, ProgressCallback[]> = new Map();
    private batchOperations: Map<string, BatchProgressInfo> = new Map();
    private validationOperations: Map<string, ValidationProgressInfo> = new Map();
    private migrationOperations: Map<string, MigrationProgressInfo> = new Map();

    startOperation(
        id: string,
        operation: string,
        totalSteps: number,
        callback?: ProgressCallback
    ): void {
        const progressInfo: ProgressInfo = {
            id,
            operation,
            currentStep: 0,
            totalSteps,
            percentage: 0,
            timestamp: new Date()
        };

        this.activeOperations.set(id, progressInfo);

        if (callback) {
            this.addCallback(id, callback);
        }

        Logger.debug('Operation started', 'ProgressTracker.startOperation', {
            id,
            operation,
            totalSteps
        });
    }
    updateProgress(
        id: string,
        currentStep: number,
        message?: string,
        details?: Record<string, any>
    ): void {
        const operation = this.activeOperations.get(id);
        if (!operation) {
            Logger.warn('Attempted to update progress for non-existent operation', 'ProgressTracker.updateProgress', { id });
            return;
        }

        operation.currentStep = currentStep;
        operation.percentage = Math.round((currentStep / operation.totalSteps) * 100);
        operation.message = message;
        operation.details = details;
        operation.timestamp = new Date();

        this.activeOperations.set(id, operation);
        this.notifyCallbacks(id, operation);

        Logger.debug('Progress updated', 'ProgressTracker.updateProgress', {
            id,
            currentStep,
            percentage: operation.percentage,
            message
        });
    }
    completeOperation(id: string, message?: string): void {
        const operation = this.activeOperations.get(id);
        if (!operation) {
            Logger.warn('Attempted to complete non-existent operation', 'ProgressTracker.completeOperation', { id });
            return;
        }

        operation.currentStep = operation.totalSteps;
        operation.percentage = 100;
        operation.message = message || 'Operation completed successfully';
        operation.timestamp = new Date();

        this.notifyCallbacks(id, operation);

        // Keep completed operations for a short time for reference
        setTimeout(() => {
            this.activeOperations.delete(id);
            this.callbacks.delete(id);
        }, 30000); // 30 seconds

        Logger.info('Operation completed', 'ProgressTracker.completeOperation', {
            id,
            message
        });
    }
    failOperation(id: string, error: string): void {
        const operation = this.activeOperations.get(id);
        if (!operation) {
            Logger.warn('Attempted to fail non-existent operation', 'ProgressTracker.failOperation', { id });
            return;
        }

        operation.percentage = -1; // Special value indicating failure
        operation.message = `Operation failed: ${error}`;
        operation.timestamp = new Date();

        this.notifyCallbacks(id, operation);

        // Keep failed operations for reference
        setTimeout(() => {
            this.activeOperations.delete(id);
            this.callbacks.delete(id);
        }, 60000); // 1 minute for failed operations

        Logger.error('Operation failed', new Error(error), 'ProgressTracker.failOperation', { id });
    }
    startBatchOperation(
        id: string,
        batchId: string,
        totalBatches: number,
        totalOperations: number,
        callback?: ProgressCallback
    ): void {
        const batchProgress: BatchProgressInfo = {
            id,
            operation: 'Batch Operation',
            currentStep: 0,
            totalSteps: totalBatches,
            percentage: 0,
            timestamp: new Date(),
            batchId,
            batchNumber: 1,
            totalBatches,
            completedOperations: 0,
            totalOperations,
            batchErrors: [],
            batchWarnings: []
        };

        this.batchOperations.set(id, batchProgress);

        if (callback) {
            this.addCallback(id, callback);
        }

        Logger.debug('Batch operation started', 'ProgressTracker.startBatchOperation', {
            id,
            batchId,
            totalBatches,
            totalOperations
        });
    }
    updateBatchProgress(
        id: string,
        batchNumber: number,
        completedOperations: number,
        currentOperation?: string,
        errors: string[] = [],
        warnings: string[] = []
    ): void {
        const batchProgress = this.batchOperations.get(id);
        if (!batchProgress) {
            Logger.warn('Attempted to update batch progress for non-existent operation', 'ProgressTracker.updateBatchProgress', { id });
            return;
        }

        batchProgress.batchNumber = batchNumber;
        batchProgress.completedOperations = completedOperations;
        batchProgress.currentStep = batchNumber;
        batchProgress.percentage = Math.round((batchNumber / batchProgress.totalBatches) * 100);
        batchProgress.currentBatchOperation = currentOperation;
        batchProgress.batchErrors = errors;
        batchProgress.batchWarnings = warnings;
        batchProgress.timestamp = new Date();

        // Calculate overall progress based on operations completed
        const operationProgress = Math.round((completedOperations / batchProgress.totalOperations) * 100);
        batchProgress.percentage = Math.max(batchProgress.percentage, operationProgress);

        this.batchOperations.set(id, batchProgress);
        this.notifyCallbacks(id, batchProgress);

        Logger.debug('Batch progress updated', 'ProgressTracker.updateBatchProgress', {
            id,
            batchNumber,
            completedOperations,
            percentage: batchProgress.percentage
        });
    }
    startMigrationOperation(
        id: string,
        migrationId: string,
        sourceConnection: string,
        targetConnection: string,
        callback?: ProgressCallback
    ): void {
        const migrationProgress: MigrationProgressInfo = {
            id,
            operation: 'Migration',
            currentStep: 0,
            totalSteps: 5, // validation, backup, execution, verification, cleanup
            percentage: 0,
            timestamp: new Date(),
            migrationId,
            sourceConnection,
            targetConnection,
            currentPhase: 'validation',
            executionLog: [],
            errors: [],
            warnings: []
        };

        this.migrationOperations.set(id, migrationProgress);

        if (callback) {
            this.addCallback(id, callback);
        }

        Logger.debug('Migration operation started', 'ProgressTracker.startMigrationOperation', {
            id,
            migrationId,
            sourceConnection,
            targetConnection
        });
    }
    updateMigrationProgress(
        id: string,
        currentPhase: MigrationProgressInfo['currentPhase'],
        message?: string,
        estimatedTimeRemaining?: number,
        errors: string[] = [],
        warnings: string[] = []
    ): void {
        const migrationProgress = this.migrationOperations.get(id);
        if (!migrationProgress) {
            Logger.warn('Attempted to update migration progress for non-existent operation', 'ProgressTracker.updateMigrationProgress', { id });
            return;
        }

        // Map phases to steps
        const phaseSteps: Record<MigrationProgressInfo['currentPhase'], number> = {
            validation: 1,
            backup: 2,
            execution: 3,
            verification: 4,
            cleanup: 5
        };

        migrationProgress.currentStep = phaseSteps[currentPhase];
        migrationProgress.currentPhase = currentPhase;
        migrationProgress.percentage = Math.round((migrationProgress.currentStep / migrationProgress.totalSteps) * 100);
        migrationProgress.message = message;
        migrationProgress.estimatedTimeRemaining = estimatedTimeRemaining;
        migrationProgress.errors = errors;
        migrationProgress.warnings = warnings;
        migrationProgress.timestamp = new Date();

        if (message) {
            migrationProgress.executionLog.push(`${new Date().toISOString()}: ${message}`);
        }

        this.migrationOperations.set(id, migrationProgress);
        this.notifyCallbacks(id, migrationProgress);

        Logger.debug('Migration progress updated', 'ProgressTracker.updateMigrationProgress', {
            id,
            currentPhase,
            currentStep: migrationProgress.currentStep,
            percentage: migrationProgress.percentage
        });
    }
    getProgress(id: string): ProgressInfo | null {
        // Check all operation types
        return (
            this.activeOperations.get(id) ||
            this.batchOperations.get(id) ||
            this.validationOperations.get(id) ||
            this.migrationOperations.get(id) ||
            null
        );
    }
    cancelOperation(id: string): void {
        const operation = this.activeOperations.get(id);
        if (operation) {
            operation.message = 'Operation cancelled';
            operation.timestamp = new Date();
            this.notifyCallbacks(id, operation);

            this.activeOperations.delete(id);
            this.callbacks.delete(id);
        }

        Logger.info('Operation cancelled', 'ProgressTracker.cancelOperation', { id });
    }
    private addCallback(id: string, callback: ProgressCallback): void {
        if (!this.callbacks.has(id)) {
            this.callbacks.set(id, []);
        }
        this.callbacks.get(id)!.push(callback);
    }
    private notifyCallbacks(id: string, progress: ProgressInfo): void {
        const operationCallbacks = this.callbacks.get(id);
        if (operationCallbacks) {
            for (const callback of operationCallbacks) {
                try {
                    callback(progress);
                } catch (error) {
                    Logger.error('Progress callback failed', error as Error, 'ProgressTracker.notifyCallbacks', { id });
                }
            }
        }
    }
    getStats(): {
        activeOperations: number;
        batchOperations: number;
        validationOperations: number;
        migrationOperations: number;
        totalCallbacks: number;
    } {
        return {
            activeOperations: this.activeOperations.size,
            batchOperations: this.batchOperations.size,
            validationOperations: this.validationOperations.size,
            migrationOperations: this.migrationOperations.size,
            totalCallbacks: Array.from(this.callbacks.values()).reduce((sum, callbacks) => sum + callbacks.length, 0)
        };
    }
    dispose(): void {
        Logger.info('ProgressTracker disposed', 'ProgressTracker.dispose');

        this.activeOperations.clear();
        this.batchOperations.clear();
        this.validationOperations.clear();
        this.migrationOperations.clear();
        this.callbacks.clear();
    }
}