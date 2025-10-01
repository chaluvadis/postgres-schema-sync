import { Logger } from '../utils/Logger';
import { CircuitBreakerService } from './CircuitBreakerService';
import { RetryService } from './RetryService';
import { ConnectionHealthMonitor } from './ConnectionHealthMonitor';

/**
 * Pooled connection interface
 */
export interface PooledConnection {
    id: string;
    connectionId: string;
    createdAt: number;
    lastUsedAt: number;
    isInUse: boolean;
    isHealthy: boolean;
    usageCount: number;
    errorCount: number;
}

/**
 * Connection pool configuration
 */
export interface ConnectionPoolConfig {
    minSize: number;              // Minimum connections to maintain
    maxSize: number;              // Maximum connections allowed
    acquireTimeoutMs: number;     // Timeout for acquiring connection
    idleTimeoutMs: number;        // Connection idle timeout
    healthCheckIntervalMs: number; // Health check interval
    maxConnectionAgeMs: number;   // Maximum connection age
    retryAttempts: number;        // Retry attempts for connection creation
}

/**
 * Default connection pool configuration
 */
const DEFAULT_CONFIG: ConnectionPoolConfig = {
    minSize: 2,
    maxSize: 10,
    acquireTimeoutMs: 30000,
    idleTimeoutMs: 300000,       // 5 minutes
    healthCheckIntervalMs: 60000, // 1 minute
    maxConnectionAgeMs: 3600000, // 1 hour
    retryAttempts: 3
};

/**
 * Connection pool for managing database connections efficiently
 */
export class ConnectionPool {
    private static instance: ConnectionPool;
    private pools: Map<string, {
        connections: PooledConnection[];
        creating: boolean;
        waitingQueue: Array<{
            resolve: (connection: PooledConnection) => void;
            reject: (error: Error) => void;
            timeout: NodeJS.Timeout;
        }>;
    }> = new Map();

    private config: ConnectionPoolConfig;
    private circuitBreaker: CircuitBreakerService;
    private retryService: RetryService;
    private healthMonitor: ConnectionHealthMonitor;
    private maintenanceInterval?: NodeJS.Timeout;

    private constructor(config: Partial<ConnectionPoolConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.circuitBreaker = CircuitBreakerService.getInstance();
        this.retryService = RetryService.getInstance();
        this.healthMonitor = ConnectionHealthMonitor.getInstance();

        this.startMaintenance();
    }

    static getInstance(config?: Partial<ConnectionPoolConfig>): ConnectionPool {
        if (!ConnectionPool.instance) {
            ConnectionPool.instance = new ConnectionPool(config);
        }
        return ConnectionPool.instance;
    }

    /**
     * Acquire a connection from the pool
     */
    async acquireConnection(connectionId: string): Promise<PooledConnection> {
        const pool = this.getOrCreatePool(connectionId);

        return new Promise((resolve, reject) => {
            // Try to get an available connection
            const availableConnection = this.getAvailableConnection(pool);
            if (availableConnection) {
                availableConnection.isInUse = true;
                availableConnection.lastUsedAt = Date.now();
                availableConnection.usageCount++;

                Logger.debug(`Acquired existing connection: ${availableConnection.id}`);
                resolve(availableConnection);
                return;
            }

            // No available connection, check if we can create more
            if (pool.connections.length < this.config.maxSize && !pool.creating) {
                this.createConnection(connectionId, pool);
            }

            // Add to waiting queue
            const timeout = setTimeout(() => {
                pool.waitingQueue = pool.waitingQueue.filter((w: any) => w !== waitingItem);
                reject(new Error(`Connection acquisition timeout for ${connectionId}`));
            }, this.config.acquireTimeoutMs);

            const waitingItem = { resolve, reject, timeout };
            pool.waitingQueue.push(waitingItem);

            Logger.debug(`Connection request queued for ${connectionId}, pool size: ${pool.connections.length}`);
        });
    }

    /**
     * Release a connection back to the pool
     */
    releaseConnection(pooledConnection: PooledConnection): void {
        const pool = this.pools.get(pooledConnection.connectionId);
        if (!pool) {
            Logger.warn(`Attempting to release connection to non-existent pool: ${pooledConnection.connectionId}`);
            return;
        }

        pooledConnection.isInUse = false;
        pooledConnection.lastUsedAt = Date.now();

        // Try to fulfill waiting requests
        if (pool.waitingQueue.length > 0) {
            const waitingItem = pool.waitingQueue.shift()!;
            clearTimeout(waitingItem.timeout);

            pooledConnection.isInUse = true;
            pooledConnection.lastUsedAt = Date.now();
            pooledConnection.usageCount++;

            Logger.debug(`Released connection to waiting request: ${pooledConnection.id}`);
            waitingItem.resolve(pooledConnection);
        } else {
            Logger.debug(`Released connection back to pool: ${pooledConnection.id}`);
        }
    }

    /**
     * Get pool statistics
     */
    getPoolStats(connectionId: string): Record<string, any> | null {
        const pool = this.pools.get(connectionId);
        if (!pool) return null;

        const total = pool.connections.length;
        const available = pool.connections.filter(c => !c.isInUse).length;
        const unhealthy = pool.connections.filter(c => !c.isHealthy).length;
        const waiting = pool.waitingQueue.length;

        return {
            connectionId,
            totalConnections: total,
            availableConnections: available,
            inUseConnections: total - available,
            unhealthyConnections: unhealthy,
            waitingRequests: waiting,
            poolUtilization: total > 0 ? ((total - available) / total) * 100 : 0
        };
    }

    /**
     * Get all pool statistics
     */
    getAllPoolStats(): Record<string, any> {
        const stats: Record<string, any> = {};

        for (const [connectionId] of this.pools) {
            const poolStats = this.getPoolStats(connectionId);
            if (poolStats) {
                stats[connectionId] = poolStats;
            }
        }

        return {
            totalPools: this.pools.size,
            pools: stats,
            config: this.config
        };
    }

    /**
     * Close all connections in a pool
     */
    async closePool(connectionId: string): Promise<void> {
        const pool = this.pools.get(connectionId);
        if (!pool) return;

        Logger.info(`Closing connection pool for ${connectionId}`);

        // Reject all waiting requests
        for (const waitingItem of pool.waitingQueue) {
            clearTimeout(waitingItem.timeout);
            waitingItem.reject(new Error(`Pool closed for ${connectionId}`));
        }
        pool.waitingQueue = [];

        // Close all connections (in real implementation, this would close actual DB connections)
        pool.connections = [];

        this.pools.delete(connectionId);
        this.healthMonitor.stopMonitoring(connectionId);
    }

    /**
     * Close all pools
     */
    async closeAllPools(): Promise<void> {
        Logger.info('Closing all connection pools');

        const connectionIds = Array.from(this.pools.keys());
        await Promise.all(connectionIds.map(id => this.closePool(id)));
    }

    /**
     * Get available connection from pool
     */
    private getAvailableConnection(pool: { connections: PooledConnection[] }): PooledConnection | null {
        // First, try to get a healthy, non-recently used connection
        const healthyConnections = pool.connections.filter(c => !c.isInUse && c.isHealthy);

        if (healthyConnections.length > 0) {
            // Return the least recently used healthy connection
            return healthyConnections.sort((a, b) => a.lastUsedAt - b.lastUsedAt)[0];
        }

        // If no healthy connections, return any available connection
        return pool.connections.find(c => !c.isInUse) || null;
    }

    /**
     * Create a new connection for the pool
     */
    private async createConnection(connectionId: string, pool: any): Promise<void> {
        if (pool.creating || pool.connections.length >= this.config.maxSize) {
            return;
        }

        pool.creating = true;
        Logger.debug(`Creating new connection for pool: ${connectionId}`);

        try {
            const pooledConnection: PooledConnection = {
                id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                connectionId,
                createdAt: Date.now(),
                lastUsedAt: Date.now(),
                isInUse: false,
                isHealthy: true,
                usageCount: 0,
                errorCount: 0
            };

            // In real implementation, this would create actual database connection
            // For now, we'll simulate connection creation
            await this.retryService.execute(async () => {
                // Simulate connection creation time
                await new Promise(resolve => setTimeout(resolve, 100));
                return pooledConnection;
            }, `Create connection for ${connectionId}`);

            pool.connections.push(pooledConnection);

            // Fulfill waiting request if any
            if (pool.waitingQueue.length > 0) {
                const waitingItem = pool.waitingQueue.shift()!;
                clearTimeout(waitingItem.timeout);

                pooledConnection.isInUse = true;
                pooledConnection.lastUsedAt = Date.now();
                pooledConnection.usageCount++;

                Logger.debug(`Created and assigned new connection: ${pooledConnection.id}`);
                waitingItem.resolve(pooledConnection);
            } else {
                Logger.debug(`Created new connection for pool: ${pooledConnection.id}`);
            }

        } catch (error) {
            Logger.error(`Failed to create connection for ${connectionId}`, error as Error);

            // Reject waiting requests if creation failed
            if (pool.waitingQueue.length > 0) {
                const waitingItem = pool.waitingQueue.shift()!;
                clearTimeout(waitingItem.timeout);
                waitingItem.reject(error as Error);
            }
        } finally {
            pool.creating = false;
        }
    }

    /**
     * Get or create pool for connection
     */
    private getOrCreatePool(connectionId: string): any {
        if (!this.pools.has(connectionId)) {
            this.pools.set(connectionId, {
                connections: [],
                creating: false,
                waitingQueue: []
            });

            // Start health monitoring for this connection
            this.healthMonitor.startMonitoring(connectionId, async () => {
                // Health check implementation would go here
                await new Promise(resolve => setTimeout(resolve, 10));
            });

            Logger.info(`Created new connection pool for ${connectionId}`);
        }

        return this.pools.get(connectionId)!;
    }

    /**
     * Start maintenance routines
     */
    private startMaintenance(): void {
        this.maintenanceInterval = setInterval(() => {
            this.performMaintenance();
        }, this.config.healthCheckIntervalMs);

        Logger.info('Connection pool maintenance started');
    }

    /**
     * Perform pool maintenance
     */
    private performMaintenance(): void {
        const now = Date.now();

        for (const [connectionId, pool] of this.pools) {
            // Remove old connections
            pool.connections = pool.connections.filter(conn => {
                const age = now - conn.createdAt;
                if (age > this.config.maxConnectionAgeMs) {
                    Logger.debug(`Removing old connection: ${conn.id}`);
                    return false;
                }
                return true;
            });

            // Mark idle connections as unhealthy if too old
            pool.connections.forEach(conn => {
                const idleTime = now - conn.lastUsedAt;
                if (idleTime > this.config.idleTimeoutMs) {
                    conn.isHealthy = false;
                    Logger.debug(`Marked idle connection as unhealthy: ${conn.id}`);
                }
            });

            // Ensure minimum pool size
            if (pool.connections.length < this.config.minSize && !pool.creating) {
                Logger.debug(`Pool ${connectionId} below minimum size, creating connections`);
                this.createConnection(connectionId, pool);
            }
        }
    }

    /**
     * Update pool configuration
     */
    updateConfig(config: Partial<ConnectionPoolConfig>): void {
        this.config = { ...this.config, ...config };
        Logger.info('Connection pool configuration updated');
    }

    /**
     * Dispose of the connection pool
     */
    async dispose(): Promise<void> {
        if (this.maintenanceInterval) {
            clearInterval(this.maintenanceInterval);
        }

        await this.closeAllPools();
        Logger.info('Connection pool disposed');
    }
}