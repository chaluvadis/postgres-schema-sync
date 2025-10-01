import { Logger } from '../utils/Logger';
import { CircuitBreakerService } from './CircuitBreakerService';
import { RetryService } from './RetryService';

/**
 * Connection health status
 */
export enum ConnectionHealth {
    HEALTHY = 'HEALTHY',
    DEGRADED = 'DEGRADED',
    UNHEALTHY = 'UNHEALTHY',
    UNKNOWN = 'UNKNOWN'
}

/**
 * Health check result
 */
export interface HealthCheckResult {
    connectionId: string;
    status: ConnectionHealth;
    responseTime: number;
    timestamp: number;
    error?: string;
    metadata?: Record<string, any>;
}

/**
 * Connection health configuration
 */
export interface HealthMonitorConfig {
    checkInterval: number;        // Health check interval in ms
    timeout: number;             // Health check timeout in ms
    healthyThreshold: number;    // Response time threshold for healthy (ms)
    degradedThreshold: number;   // Response time threshold for degraded (ms)
    failureThreshold: number;    // Number of failures before marking unhealthy
    circuitBreakerThreshold: number; // Response time threshold for circuit breaker
}

/**
 * Default health monitor configuration
 */
const DEFAULT_CONFIG: HealthMonitorConfig = {
    checkInterval: 30000,        // 30 seconds
    timeout: 5000,              // 5 seconds
    healthyThreshold: 100,      // 100ms
    degradedThreshold: 500,     // 500ms
    failureThreshold: 3,
    circuitBreakerThreshold: 1000 // 1 second
};

/**
 * Connection health monitoring service
 */
export class ConnectionHealthMonitor {
    private static instance: ConnectionHealthMonitor;
    private config: HealthMonitorConfig;
    private healthStatus: Map<string, HealthCheckResult[]> = new Map();
    private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();
    private circuitBreaker: CircuitBreakerService;
    private retryService: RetryService;
    private isMonitoring: boolean = false;

    private constructor(config: Partial<HealthMonitorConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.circuitBreaker = CircuitBreakerService.getInstance();
        this.retryService = RetryService.getInstance();
    }

    static getInstance(config?: Partial<HealthMonitorConfig>): ConnectionHealthMonitor {
        if (!ConnectionHealthMonitor.instance) {
            ConnectionHealthMonitor.instance = new ConnectionHealthMonitor(config);
        }
        return ConnectionHealthMonitor.instance;
    }

    /**
     * Start monitoring a connection
     */
    startMonitoring(connectionId: string, healthCheckFn: () => Promise<void>): void {
        if (this.monitoringIntervals.has(connectionId)) {
            Logger.debug(`Already monitoring connection: ${connectionId}`);
            return;
        }

        Logger.info(`Starting health monitoring for connection: ${connectionId}`);

        const interval = setInterval(async () => {
            await this.performHealthCheck(connectionId, healthCheckFn);
        }, this.config.checkInterval);

        this.monitoringIntervals.set(connectionId, interval);
        this.isMonitoring = true;

        // Perform initial health check
        this.performHealthCheck(connectionId, healthCheckFn).catch(error => {
            Logger.error(`Initial health check failed for ${connectionId}`, error as Error);
        });
    }

    /**
     * Stop monitoring a connection
     */
    stopMonitoring(connectionId: string): void {
        const interval = this.monitoringIntervals.get(connectionId);
        if (interval) {
            clearInterval(interval);
            this.monitoringIntervals.delete(connectionId);
            Logger.info(`Stopped health monitoring for connection: ${connectionId}`);
        }

        // Clean up old health records
        this.healthStatus.delete(connectionId);
    }

    /**
     * Stop all monitoring
     */
    stopAllMonitoring(): void {
        Logger.info('Stopping all connection health monitoring');

        for (const [connectionId, interval] of this.monitoringIntervals.entries()) {
            clearInterval(interval);
            Logger.debug(`Stopped monitoring connection: ${connectionId}`);
        }

        this.monitoringIntervals.clear();
        this.healthStatus.clear();
        this.isMonitoring = false;
    }

    /**
     * Get current health status for a connection
     */
    getConnectionHealth(connectionId: string): ConnectionHealth {
        const results = this.healthStatus.get(connectionId);
        if (!results || results.length === 0) {
            return ConnectionHealth.UNKNOWN;
        }

        const recentResults = results.filter(r => Date.now() - r.timestamp < this.config.checkInterval * 2);

        if (recentResults.length === 0) {
            return ConnectionHealth.UNKNOWN;
        }

        const failures = recentResults.filter(r => r.status === ConnectionHealth.UNHEALTHY).length;

        if (failures >= this.config.failureThreshold) {
            return ConnectionHealth.UNHEALTHY;
        }

        const avgResponseTime = recentResults.reduce((sum, r) => sum + r.responseTime, 0) / recentResults.length;

        if (avgResponseTime > this.config.degradedThreshold) {
            return ConnectionHealth.DEGRADED;
        }

        return ConnectionHealth.HEALTHY;
    }

    /**
     * Get detailed health history for a connection
     */
    getHealthHistory(connectionId: string, limit: number = 10): HealthCheckResult[] {
        const results = this.healthStatus.get(connectionId) || [];
        return results
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);
    }

    /**
     * Get all monitored connections
     */
    getMonitoredConnections(): string[] {
        return Array.from(this.monitoringIntervals.keys());
    }

    /**
     * Perform a health check for a connection
     */
    private async performHealthCheck(connectionId: string, healthCheckFn: () => Promise<void>): Promise<void> {
        const startTime = Date.now();

        try {
            await this.retryService.execute(async () => {
                return this.circuitBreaker.execute(`health-${connectionId}`, async () => {
                    // Execute health check with timeout
                    await Promise.race([
                        healthCheckFn(),
                        this.timeout(this.config.timeout)
                    ]);
                });
            }, `Health check for ${connectionId}`, {
                maxAttempts: 2,
                baseDelayMs: 100,
                retryableErrors: ['timeout', 'network']
            });

            const responseTime = Date.now() - startTime;
            const result: HealthCheckResult = {
                connectionId,
                status: this.calculateHealthStatus(responseTime),
                responseTime,
                timestamp: Date.now()
            };

            this.recordHealthResult(result);

            // Update circuit breaker if response time is too high
            if (responseTime > this.config.circuitBreakerThreshold) {
                Logger.warn(`Slow response time for ${connectionId}: ${responseTime}ms`);
            }

        } catch (error) {
            const responseTime = Date.now() - startTime;
            const result: HealthCheckResult = {
                connectionId,
                status: ConnectionHealth.UNHEALTHY,
                responseTime,
                timestamp: Date.now(),
                error: (error as Error).message
            };

            this.recordHealthResult(result);
            Logger.warn(`Health check failed for ${connectionId}`, error as Error);
        }
    }

    /**
     * Calculate health status based on response time
     */
    private calculateHealthStatus(responseTime: number): ConnectionHealth {
        if (responseTime <= this.config.healthyThreshold) {
            return ConnectionHealth.HEALTHY;
        } else if (responseTime <= this.config.degradedThreshold) {
            return ConnectionHealth.DEGRADED;
        } else {
            return ConnectionHealth.UNHEALTHY;
        }
    }

    /**
     * Record health check result
     */
    private recordHealthResult(result: HealthCheckResult): void {
        if (!this.healthStatus.has(result.connectionId)) {
            this.healthStatus.set(result.connectionId, []);
        }

        const results = this.healthStatus.get(result.connectionId)!;
        results.push(result);

        // Keep only recent results (last 24 hours)
        const cutoff = Date.now() - (24 * 60 * 60 * 1000);
        const recentResults = results.filter(r => r.timestamp > cutoff);
        this.healthStatus.set(result.connectionId, recentResults);

        Logger.debug(`Health check recorded for ${result.connectionId}`, {
            status: result.status,
            responseTime: result.responseTime
        });
    }

    /**
     * Timeout promise helper
     */
    private timeout(ms: number): Promise<never> {
        return new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Health check timeout')), ms);
        });
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<HealthMonitorConfig>): void {
        this.config = { ...this.config, ...config };
        Logger.info('Health monitor configuration updated');
    }

    /**
     * Check if service is monitoring
     */
    isActive(): boolean {
        return this.isMonitoring;
    }

    /**
     * Dispose of the service
     */
    dispose(): void {
        this.stopAllMonitoring();
        Logger.info('Connection health monitor disposed');
    }
}