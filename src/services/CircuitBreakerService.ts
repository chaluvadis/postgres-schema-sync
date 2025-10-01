import { Logger } from '../utils/Logger';

/**
 * Circuit breaker states
 */
export enum CircuitState {
    CLOSED = 'CLOSED',     // Normal operation
    OPEN = 'OPEN',         // Failing, requests rejected
    HALF_OPEN = 'HALF_OPEN' // Testing if service recovered
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
    failureThreshold: number;      // Number of failures before opening
    recoveryTimeout: number;       // Time in ms before attempting recovery
    monitoringPeriod: number;      // Time window in ms to track failures
    successThreshold: number;      // Number of successes needed in half-open state
}

/**
 * Default circuit breaker configuration
 */
const DEFAULT_CONFIG: CircuitBreakerConfig = {
    failureThreshold: 5,
    recoveryTimeout: 60000,    // 1 minute
    monitoringPeriod: 60000,   // 1 minute
    successThreshold: 3
};

/**
 * Circuit breaker for handling service failures gracefully
 */
export class CircuitBreakerService {
    private static instance: CircuitBreakerService;
    private circuits: Map<string, CircuitBreaker> = new Map();
    private config: CircuitBreakerConfig;

    private constructor(config: Partial<CircuitBreakerConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    static getInstance(config?: Partial<CircuitBreakerConfig>): CircuitBreakerService {
        if (!CircuitBreakerService.instance) {
            CircuitBreakerService.instance = new CircuitBreakerService(config);
        }
        return CircuitBreakerService.instance;
    }

    /**
     * Execute operation with circuit breaker protection
     */
    async execute<T>(
        serviceName: string,
        operation: () => Promise<T>
    ): Promise<T> {
        const circuit = this.getCircuit(serviceName);

        if (circuit.state === CircuitState.OPEN) {
            if (this.shouldAttemptReset(circuit)) {
                circuit.state = CircuitState.HALF_OPEN;
                Logger.debug(`Circuit breaker for ${serviceName} moved to HALF_OPEN`);
            } else {
                throw new Error(`Circuit breaker for ${serviceName} is OPEN`);
            }
        }

        try {
            const result = await operation();
            this.onSuccess(circuit, serviceName);
            return result;
        } catch (error) {
            this.onFailure(circuit, serviceName, error as Error);
            throw error;
        }
    }

    /**
     * Get or create circuit breaker for service
     */
    private getCircuit(serviceName: string): CircuitBreaker {
        if (!this.circuits.has(serviceName)) {
            this.circuits.set(serviceName, new CircuitBreaker(this.config));
        }
        return this.circuits.get(serviceName)!;
    }

    /**
     * Check if circuit should attempt reset
     */
    private shouldAttemptReset(circuit: CircuitBreaker): boolean {
        if (!circuit.lastFailureTime) return true;
        const now = Date.now();
        return (now - circuit.lastFailureTime) >= this.config.recoveryTimeout;
    }

    /**
     * Handle successful operation
     */
    private onSuccess(circuit: CircuitBreaker, serviceName: string): void {
        circuit.failures = 0;
        circuit.successCount = circuit.state === CircuitState.HALF_OPEN ? circuit.successCount + 1 : 0;

        if (circuit.state === CircuitState.HALF_OPEN && circuit.successCount >= this.config.successThreshold) {
            circuit.state = CircuitState.CLOSED;
            circuit.successCount = 0;
            Logger.info(`Circuit breaker for ${serviceName} reset to CLOSED`);
        }
    }

    /**
     * Handle failed operation
     */
    private onFailure(circuit: CircuitBreaker, serviceName: string, error: Error): void {
        circuit.failures++;
        circuit.lastFailureTime = Date.now();

        if (circuit.failures >= this.config.failureThreshold) {
            circuit.state = CircuitState.OPEN;
            Logger.warn(`Circuit breaker for ${serviceName} opened after ${circuit.failures} failures`);
        }
    }

    /**
     * Get circuit breaker status
     */
    getCircuitStatus(serviceName: string): { state: CircuitState; failures: number; lastFailureTime?: number } | null {
        const circuit = this.circuits.get(serviceName);
        if (!circuit) return null;

        const status: { state: CircuitState; failures: number; lastFailureTime?: number } = {
            state: circuit.state,
            failures: circuit.failures
        };

        if (circuit.lastFailureTime) {
            status.lastFailureTime = circuit.lastFailureTime;
        }

        return status;
    }

    /**
     * Reset circuit breaker
     */
    resetCircuit(serviceName: string): void {
        const circuit = this.circuits.get(serviceName);
        if (circuit) {
            circuit.state = CircuitState.CLOSED;
            circuit.failures = 0;
            circuit.successCount = 0;
            Logger.info(`Circuit breaker for ${serviceName} manually reset`);
        }
    }

    /**
     * Dispose of the service
     */
    dispose(): void {
        this.circuits.clear();
        Logger.info('Circuit breaker service disposed');
    }
}

/**
 * Individual circuit breaker implementation
 */
class CircuitBreaker {
    state: CircuitState = CircuitState.CLOSED;
    failures: number = 0;
    successCount: number = 0;
    lastFailureTime?: number;

    constructor(public config: CircuitBreakerConfig) {}
}