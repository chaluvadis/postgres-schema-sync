import { Logger } from '../utils/Logger';

/**
 * Lock type for different operation scopes
 */
export enum LockType {
    GLOBAL = 'GLOBAL',           // Entire system
    DATABASE = 'DATABASE',       // Specific database
    SCHEMA = 'SCHEMA',           // Specific schema
    TABLE = 'TABLE',             // Specific table
    CONNECTION = 'CONNECTION'    // Specific connection
}

/**
 * Lock mode
 */
export enum LockMode {
    SHARED = 'SHARED',           // Multiple operations can hold shared locks
    EXCLUSIVE = 'EXCLUSIVE'      // Only one operation can hold exclusive lock
}

/**
 * Lock information
 */
export interface LockInfo {
    id: string;
    type: LockType;
    mode: LockMode;
    resource: string;           // The resource being locked (e.g., "db:users", "schema:public", "table:users")
    operationId: string;        // ID of the operation holding the lock
    acquiredAt: number;         // When the lock was acquired
    timeoutMs: number;          // Lock timeout
    metadata?: Record<string, any>;
}

/**
 * Lock request
 */
export interface LockRequest {
    type: LockType;
    mode: LockMode;
    resource: string;
    operationId: string;
    timeoutMs?: number;
    metadata?: Record<string, any>;
}

/**
 * Lock acquisition result
 */
export interface LockResult {
    success: boolean;
    lock?: LockInfo;
    error?: string;
    waitTime?: number;
}

/**
 * Concurrent operation locks configuration
 */
export interface LockConfig {
    defaultTimeoutMs: number;
    maxWaitTimeMs: number;
    deadlockDetectionIntervalMs: number;
    enableDeadlockDetection: boolean;
    maxLocksPerResource: number;
}

/**
 * Default lock configuration
 */
const DEFAULT_CONFIG: LockConfig = {
    defaultTimeoutMs: 30000,     // 30 seconds
    maxWaitTimeMs: 60000,        // 1 minute
    deadlockDetectionIntervalMs: 5000, // 5 seconds
    enableDeadlockDetection: true,
    maxLocksPerResource: 10
};

/**
 * Concurrent operation locks for preventing race conditions
 */
export class ConcurrentOperationLocks {
    private static instance: ConcurrentOperationLocks;
    private config: LockConfig;
    private activeLocks: Map<string, LockInfo> = new Map();
    private waitingQueues: Map<string, Array<{
        request: LockRequest;
        resolve: (result: LockResult) => void;
        reject: (error: Error) => void;
        queuedAt: number;
    }>> = new Map();

    private deadlockDetectionInterval?: NodeJS.Timeout;

    private constructor(config: Partial<LockConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.startDeadlockDetection();
    }

    static getInstance(config?: Partial<LockConfig>): ConcurrentOperationLocks {
        if (!ConcurrentOperationLocks.instance) {
            ConcurrentOperationLocks.instance = new ConcurrentOperationLocks(config);
        }
        return ConcurrentOperationLocks.instance;
    }

    /**
     * Acquire a lock for an operation
     */
    async acquireLock(request: LockRequest): Promise<LockResult> {
        const startTime = Date.now();
        const lockKey = this.generateLockKey(request.type, request.resource);

        Logger.debug(`Acquiring lock: ${lockKey}`, {
            operationId: request.operationId,
            mode: request.mode
        });

        return new Promise((resolve, reject) => {
            const timeoutMs = request.timeoutMs || this.config.defaultTimeoutMs;

            // Set up timeout
            const timeout = setTimeout(() => {
                this.removeFromWaitingQueue(lockKey, request.operationId);
                resolve({
                    success: false,
                    error: `Lock acquisition timeout after ${timeoutMs}ms`
                });
            }, timeoutMs);

            // Try to acquire lock immediately
            const immediateResult = this.tryAcquireLock(request, lockKey);
            if (immediateResult) {
                clearTimeout(timeout);
                resolve(immediateResult);
                return;
            }

            // Add to waiting queue
            this.addToWaitingQueue(lockKey, request, (result) => {
                clearTimeout(timeout);
                resolve(result);
            }, reject);
        });
    }

    /**
     * Release a lock
     */
    releaseLock(lockId: string): boolean {
        const lock = this.activeLocks.get(lockId);
        if (!lock) {
            Logger.warn(`Attempting to release non-existent lock: ${lockId}`);
            return false;
        }

        Logger.debug(`Releasing lock: ${lockId}`, {
            operationId: lock.operationId,
            heldFor: Date.now() - lock.acquiredAt
        });

        this.activeLocks.delete(lockId);

        // Try to fulfill waiting requests
        this.processWaitingQueue(lock.type, lock.resource);

        return true;
    }

    /**
     * Release all locks for an operation
     */
    releaseOperationLocks(operationId: string): number {
        let releasedCount = 0;

        for (const [lockId, lock] of this.activeLocks.entries()) {
            if (lock.operationId === operationId) {
                this.releaseLock(lockId);
                releasedCount++;
            }
        }

        if (releasedCount > 0) {
            Logger.info(`Released ${releasedCount} locks for operation: ${operationId}`);
        }

        return releasedCount;
    }

    /**
     * Get active locks for a resource
     */
    getActiveLocks(type: LockType, resource: string): LockInfo[] {
        const lockKey = this.generateLockKey(type, resource);
        const locks: LockInfo[] = [];

        for (const lock of this.activeLocks.values()) {
            if (this.generateLockKey(lock.type, lock.resource) === lockKey) {
                locks.push(lock);
            }
        }

        return locks;
    }

    /**
     * Get all active locks
     */
    getAllActiveLocks(): LockInfo[] {
        return Array.from(this.activeLocks.values());
    }

    /**
     * Check if resource is locked
     */
    isResourceLocked(type: LockType, resource: string, mode: LockMode = LockMode.EXCLUSIVE): boolean {
        const lockKey = this.generateLockKey(type, resource);
        const activeLocks = this.getActiveLocks(type, resource);

        if (mode === LockMode.EXCLUSIVE) {
            return activeLocks.length > 0;
        } else {
            // For shared locks, check if there are any exclusive locks
            return activeLocks.some(lock => lock.mode === LockMode.EXCLUSIVE);
        }
    }

    /**
     * Execute operation with lock
     */
    async withLock<T>(
        request: LockRequest,
        operation: () => Promise<T>
    ): Promise<T> {
        const lockResult = await this.acquireLock(request);

        if (!lockResult.success) {
            throw new Error(`Failed to acquire lock: ${lockResult.error}`);
        }

        try {
            Logger.debug(`Executing operation with lock: ${request.operationId}`);
            return await operation();
        } finally {
            this.releaseLock(lockResult.lock!.id);
        }
    }

    /**
     * Try to acquire lock immediately
     */
    private tryAcquireLock(request: LockRequest, lockKey: string): LockResult | null {
        const activeLocks = this.getActiveLocks(request.type, request.resource);

        // Check if lock can be acquired
        if (this.canAcquireLock(request, activeLocks)) {
            const lock: LockInfo = {
                id: `lock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: request.type,
                mode: request.mode,
                resource: request.resource,
                operationId: request.operationId,
                acquiredAt: Date.now(),
                timeoutMs: request.timeoutMs || this.config.defaultTimeoutMs,
                ...(request.metadata && { metadata: request.metadata })
            };

            this.activeLocks.set(lock.id, lock);

            Logger.debug(`Lock acquired immediately: ${lockKey}`, {
                operationId: request.operationId,
                lockId: lock.id
            });

            return {
                success: true,
                lock,
                waitTime: 0
            };
        }

        return null;
    }

    /**
     * Check if lock can be acquired based on compatibility
     */
    private canAcquireLock(request: LockRequest, activeLocks: LockInfo[]): boolean {
        // If requesting exclusive lock, no other locks allowed
        if (request.mode === LockMode.EXCLUSIVE) {
            return activeLocks.length === 0;
        }

        // If requesting shared lock, check for exclusive locks
        return !activeLocks.some(lock => lock.mode === LockMode.EXCLUSIVE);
    }

    /**
     * Add request to waiting queue
     */
    private addToWaitingQueue(
        lockKey: string,
        request: LockRequest,
        resolve: (result: LockResult) => void,
        reject: (error: Error) => void
    ): void {
        if (!this.waitingQueues.has(lockKey)) {
            this.waitingQueues.set(lockKey, []);
        }

        const queue = this.waitingQueues.get(lockKey)!;

        // Check queue size limit
        if (queue.length >= this.config.maxLocksPerResource) {
            reject(new Error(`Too many waiting requests for resource: ${lockKey}`));
            return;
        }

        queue.push({
            request,
            resolve,
            reject,
            queuedAt: Date.now()
        });

        Logger.debug(`Added to waiting queue: ${lockKey}`, {
            operationId: request.operationId,
            queueSize: queue.length
        });
    }

    /**
     * Remove request from waiting queue
     */
    private removeFromWaitingQueue(lockKey: string, operationId: string): void {
        const queue = this.waitingQueues.get(lockKey);
        if (queue) {
            const index = queue.findIndex(item => item.request.operationId === operationId);
            if (index >= 0) {
                queue.splice(index, 1);
                Logger.debug(`Removed from waiting queue: ${lockKey}`, { operationId });
            }
        }
    }

    /**
     * Process waiting queue for a resource
     */
    private processWaitingQueue(type: LockType, resource: string): void {
        const lockKey = this.generateLockKey(type, resource);
        const queue = this.waitingQueues.get(lockKey);

        if (!queue || queue.length === 0) {
            return;
        }

        const activeLocks = this.getActiveLocks(type, resource);

        // Try to fulfill waiting requests in order
        let i = 0;
        while (i < queue.length) {
            const waitingItem = queue[i];
            const request = waitingItem.request;

            if (this.canAcquireLock(request, activeLocks)) {
                // Can acquire lock, create it and fulfill request
                const lock: LockInfo = {
                    id: `lock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    type: request.type,
                    mode: request.mode,
                    resource: request.resource,
                    operationId: request.operationId,
                    acquiredAt: Date.now(),
                    timeoutMs: request.timeoutMs || this.config.defaultTimeoutMs,
                    ...(request.metadata && { metadata: request.metadata })
                };

                this.activeLocks.set(lock.id, lock);

                const waitTime = Date.now() - waitingItem.queuedAt;
                waitingItem.resolve({
                    success: true,
                    lock,
                    waitTime
                });

                // Remove from queue
                queue.splice(i, 1);

                Logger.debug(`Fulfilled waiting request: ${lockKey}`, {
                    operationId: request.operationId,
                    waitTime
                });
            } else {
                i++;
            }
        }
    }

    /**
     * Generate lock key for resource
     */
    private generateLockKey(type: LockType, resource: string): string {
        return `${type}:${resource}`;
    }

    /**
     * Start deadlock detection
     */
    private startDeadlockDetection(): void {
        if (!this.config.enableDeadlockDetection) {
            return;
        }

        this.deadlockDetectionInterval = setInterval(() => {
            this.detectDeadlocks();
        }, this.config.deadlockDetectionIntervalMs);

        Logger.info('Deadlock detection started');
    }

    /**
     * Detect potential deadlocks
     */
    private detectDeadlocks(): void {
        // Simplified deadlock detection
        // In a real implementation, this would use more sophisticated algorithms

        const now = Date.now();
        let deadlocksDetected = 0;

        for (const [lockKey, queue] of this.waitingQueues.entries()) {
            // Check for requests waiting too long
            for (const waitingItem of queue) {
                const waitTime = now - waitingItem.queuedAt;

                if (waitTime > this.config.maxWaitTimeMs) {
                    Logger.warn(`Potential deadlock detected: ${lockKey}`, {
                        operationId: waitingItem.request.operationId,
                        waitTime,
                        queueSize: queue.length
                    });

                    // Remove from queue and reject
                    this.removeFromWaitingQueue(lockKey, waitingItem.request.operationId);
                    waitingItem.reject(new Error(`Potential deadlock detected after ${waitTime}ms`));

                    deadlocksDetected++;
                }
            }
        }

        if (deadlocksDetected > 0) {
            Logger.warn(`${deadlocksDetected} potential deadlocks detected and resolved`);
        }
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<LockConfig>): void {
        this.config = { ...this.config, ...config };
        Logger.info('Concurrent operation locks configuration updated');
    }

    /**
     * Get lock statistics
     */
    getLockStats(): Record<string, any> {
        const activeLocks = this.activeLocks.size;
        const waitingRequests = Array.from(this.waitingQueues.values())
            .reduce((sum, queue) => sum + queue.length, 0);

        const locksByType: Record<string, number> = {};
        for (const lock of this.activeLocks.values()) {
            locksByType[lock.type] = (locksByType[lock.type] || 0) + 1;
        }

        return {
            activeLocks,
            waitingRequests,
            locksByType,
            config: this.config
        };
    }

    /**
     * Dispose of the service
     */
    dispose(): void {
        if (this.deadlockDetectionInterval) {
            clearInterval(this.deadlockDetectionInterval);
        }

        // Release all locks
        this.activeLocks.clear();

        // Reject all waiting requests
        for (const [lockKey, queue] of this.waitingQueues.entries()) {
            for (const waitingItem of queue) {
                waitingItem.reject(new Error(`Lock service disposed: ${lockKey}`));
            }
        }
        this.waitingQueues.clear();

        Logger.info('Concurrent operation locks disposed');
    }
}