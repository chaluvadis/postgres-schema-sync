import { Logger } from '../utils/Logger';
import { CircuitBreakerService } from './CircuitBreakerService';
import { RetryService } from './RetryService';

/**
 * Error severity levels
 */
export enum ErrorSeverity {
    LOW = 'LOW',
    MEDIUM = 'MEDIUM',
    HIGH = 'HIGH',
    CRITICAL = 'CRITICAL'
}

/**
 * Error category for classification
 */
export enum ErrorCategory {
    NETWORK = 'NETWORK',
    DATABASE = 'DATABASE',
    AUTHENTICATION = 'AUTHENTICATION',
    AUTHORIZATION = 'AUTHORIZATION',
    VALIDATION = 'VALIDATION',
    SYSTEM = 'SYSTEM',
    CONFIGURATION = 'CONFIGURATION',
    TIMEOUT = 'TIMEOUT'
}

/**
 * Recovery strategy
 */
export interface RecoveryStrategy {
    name: string;
    canRecover: (error: Error, context?: any) => boolean;
    recover: (error: Error, context?: any) => Promise<boolean>;
    priority: number;
}

/**
 * Error context for recovery
 */
export interface ErrorContext {
    operation: string;
    connectionId?: string;
    userId?: string;
    timestamp: number;
    attempt: number;
    metadata?: Record<string, any>;
}

/**
 * Recovery result
 */
export interface RecoveryResult {
    success: boolean;
    strategy?: string;
    duration: number;
    error?: string;
    metadata?: Record<string, any>;
}

/**
 * Structured error recovery service
 */
export class ErrorRecoveryService {
    private static instance: ErrorRecoveryService;
    private recoveryStrategies: Map<ErrorCategory, RecoveryStrategy[]> = new Map();
    private circuitBreaker: CircuitBreakerService;
    private retryService: RetryService;
    private recoveryHistory: RecoveryResult[] = [];
    private maxHistorySize: number = 1000;

    private constructor() {
        this.circuitBreaker = CircuitBreakerService.getInstance();
        this.retryService = RetryService.getInstance();
        this.initializeDefaultStrategies();
    }

    static getInstance(): ErrorRecoveryService {
        if (!ErrorRecoveryService.instance) {
            ErrorRecoveryService.instance = new ErrorRecoveryService();
        }
        return ErrorRecoveryService.instance;
    }

    /**
     * Execute operation with error recovery
     */
    async executeWithRecovery<T>(
        operation: () => Promise<T>,
        context: ErrorContext,
        customStrategies?: RecoveryStrategy[]
    ): Promise<T> {
        const startTime = Date.now();
        let lastError: Error;

        try {
            // First attempt
            Logger.debug(`Executing operation with recovery: ${context.operation}`);
            return await operation();
        } catch (error) {
            lastError = error as Error;

            // Classify error
            const category = this.classifyError(lastError);
            const strategies = customStrategies || this.getStrategiesForCategory(category);

            Logger.warn(`Operation failed, attempting recovery: ${context.operation}`, {
                error: lastError.message,
                category,
                strategies: strategies.map(s => s.name)
            });

            // Try recovery strategies in priority order
            for (const strategy of strategies.sort((a, b) => b.priority - a.priority)) {
                if (!strategy.canRecover(lastError, context)) {
                    continue;
                }

                try {
                    const recoveryStart = Date.now();
                    const recovered = await strategy.recover(lastError, context);

                    if (recovered) {
                        const recoveryResult: RecoveryResult = {
                            success: true,
                            strategy: strategy.name,
                            duration: Date.now() - recoveryStart,
                            metadata: { operation: context.operation, category }
                        };

                        this.recordRecoveryResult(recoveryResult);

                        Logger.info(`Recovery successful using strategy: ${strategy.name}`, {
                            operation: context.operation,
                            duration: recoveryResult.duration
                        });

                        // Retry operation after successful recovery
                        try {
                            return await operation();
                        } catch (retryError) {
                            lastError = retryError as Error;
                            Logger.warn(`Operation failed after recovery, trying next strategy`, {
                                strategy: strategy.name,
                                error: lastError.message
                            });
                        }
                    }
                } catch (recoveryError) {
                    Logger.error(`Recovery strategy failed: ${strategy.name}`, recoveryError as Error);
                }
            }

            // All recovery attempts failed
            const totalDuration = Date.now() - startTime;
            const recoveryResult: RecoveryResult = {
                success: false,
                duration: totalDuration,
                error: lastError.message,
                metadata: { operation: context.operation, category, originalError: lastError.message }
            };

            this.recordRecoveryResult(recoveryResult);

            Logger.error(`All recovery strategies failed for: ${context.operation}`, {
                error: lastError.message,
                duration: totalDuration
            });

            throw lastError;
        }
    }

    /**
     * Register custom recovery strategy
     */
    registerStrategy(category: ErrorCategory, strategy: RecoveryStrategy): void {
        if (!this.recoveryStrategies.has(category)) {
            this.recoveryStrategies.set(category, []);
        }

        const strategies = this.recoveryStrategies.get(category)!;
        strategies.push(strategy);
        strategies.sort((a, b) => b.priority - a.priority);

        Logger.info(`Recovery strategy registered: ${strategy.name} for category: ${category}`);
    }

    /**
     * Get recovery history
     */
    getRecoveryHistory(limit: number = 100): RecoveryResult[] {
        return this.recoveryHistory
            .slice(-limit)
            .reverse();
    }

    /**
     * Get recovery statistics
     */
    getRecoveryStats(): Record<string, any> {
        const total = this.recoveryHistory.length;
        const successful = this.recoveryHistory.filter(r => r.success).length;
        const successRate = total > 0 ? (successful / total) * 100 : 0;

        const byStrategy: Record<string, number> = {};
        const byCategory: Record<string, number> = {};

        this.recoveryHistory.forEach(result => {
            if (result.strategy) {
                byStrategy[result.strategy] = (byStrategy[result.strategy] || 0) + 1;
            }
            if (result.metadata?.category) {
                byCategory[result.metadata.category] = (byCategory[result.metadata.category] || 0) + 1;
            }
        });

        return {
            totalRecoveries: total,
            successfulRecoveries: successful,
            successRate,
            averageDuration: total > 0 ?
                this.recoveryHistory.reduce((sum, r) => sum + r.duration, 0) / total : 0,
            byStrategy,
            byCategory
        };
    }

    /**
     * Classify error into category
     */
    private classifyError(error: Error): ErrorCategory {
        const message = error.message.toLowerCase();

        if (message.includes('timeout') || message.includes('timed out')) {
            return ErrorCategory.TIMEOUT;
        }
        if (message.includes('network') || message.includes('connection') ||
            message.includes('econnrefused') || message.includes('enotfound')) {
            return ErrorCategory.NETWORK;
        }
        if (message.includes('authentication') || message.includes('invalid credentials')) {
            return ErrorCategory.AUTHENTICATION;
        }
        if (message.includes('authorization') || message.includes('access denied') ||
            message.includes('permission denied')) {
            return ErrorCategory.AUTHORIZATION;
        }
        if (message.includes('validation') || message.includes('invalid') ||
            message.includes('constraint')) {
            return ErrorCategory.VALIDATION;
        }
        if (message.includes('database') || message.includes('sql') ||
            message.includes('relation') || message.includes('table')) {
            return ErrorCategory.DATABASE;
        }
        if (message.includes('configuration') || message.includes('config')) {
            return ErrorCategory.CONFIGURATION;
        }

        return ErrorCategory.SYSTEM;
    }

    /**
     * Get recovery strategies for error category
     */
    private getStrategiesForCategory(category: ErrorCategory): RecoveryStrategy[] {
        return this.recoveryStrategies.get(category) || [];
    }

    /**
     * Initialize default recovery strategies
     */
    private initializeDefaultStrategies(): void {
        // Network error recovery
        this.registerStrategy(ErrorCategory.NETWORK, {
            name: 'retry_with_backoff',
            priority: 10,
            canRecover: () => true,
            recover: async (error, context) => {
                Logger.debug('Attempting network retry recovery');
                // Retry will be handled by the retry service
                return true;
            }
        });

        // Timeout error recovery
        this.registerStrategy(ErrorCategory.TIMEOUT, {
            name: 'increase_timeout',
            priority: 10,
            canRecover: () => true,
            recover: async (error, context) => {
                Logger.debug('Attempting timeout recovery by increasing timeout');
                // This would modify connection timeout settings
                return true;
            }
        });

        // Authentication error recovery
        this.registerStrategy(ErrorCategory.AUTHENTICATION, {
            name: 'credential_refresh',
            priority: 10,
            canRecover: (error) => error.message.includes('token') || error.message.includes('expired'),
            recover: async (error, context) => {
                Logger.debug('Attempting credential refresh recovery');
                // This would trigger credential refresh logic
                return true;
            }
        });

        // Database connection recovery
        this.registerStrategy(ErrorCategory.DATABASE, {
            name: 'connection_reset',
            priority: 10,
            canRecover: () => true,
            recover: async (error, context) => {
                Logger.debug('Attempting database connection reset');
                if (context?.connectionId) {
                    // Reset circuit breaker for this connection
                    this.circuitBreaker.resetCircuit(`db-${context.connectionId}`);
                }
                return true;
            }
        });

        Logger.info('Default recovery strategies initialized');
    }

    /**
     * Record recovery result
     */
    private recordRecoveryResult(result: RecoveryResult): void {
        this.recoveryHistory.push(result);

        // Maintain history size limit
        if (this.recoveryHistory.length > this.maxHistorySize) {
            this.recoveryHistory = this.recoveryHistory.slice(-this.maxHistorySize);
        }
    }

    /**
     * Dispose of the service
     */
    dispose(): void {
        this.recoveryHistory = [];
        Logger.info('Error recovery service disposed');
    }
}