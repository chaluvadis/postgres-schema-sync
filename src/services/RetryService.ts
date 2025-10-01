import { Logger } from '../utils/Logger';

/**
 * Retry configuration
 */
export interface RetryConfig {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
    retryableErrors: Array<string | RegExp>;
    onRetry?: (error: Error, attempt: number) => void;
}

/**
 * Default retry configuration
 */
const DEFAULT_CONFIG: RetryConfig = {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    retryableErrors: [
        'ECONNRESET',
        'ETIMEDOUT',
        'ENOTFOUND',
        'ECONNREFUSED',
        'Network timeout',
        'Connection timeout',
        /timeout/i,
        /network.*error/i,
        /connection.*error/i
    ]
};

/**
 * Retry service with exponential backoff
 */
export class RetryService {
    private static instance: RetryService;
    private config: RetryConfig;

    private constructor(config: Partial<RetryConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    static getInstance(config?: Partial<RetryConfig>): RetryService {
        if (!RetryService.instance) {
            RetryService.instance = new RetryService(config);
        }
        return RetryService.instance;
    }

    /**
     * Execute operation with retry logic
     */
    async execute<T>(
        operation: () => Promise<T>,
        operationName: string = 'operation',
        customConfig?: Partial<RetryConfig>
    ): Promise<T> {
        const config = { ...this.config, ...customConfig };
        let lastError: Error;

        for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
            try {
                Logger.debug(`${operationName} - Attempt ${attempt}/${config.maxAttempts}`);
                const result = await operation();

                if (attempt > 1) {
                    Logger.info(`${operationName} succeeded after ${attempt} attempts`);
                }

                return result;
            } catch (error) {
                lastError = error as Error;

                // Check if error is retryable
                if (!this.isRetryableError(lastError, config)) {
                    Logger.debug(`${operationName} failed with non-retryable error: ${lastError.message}`);
                    throw lastError;
                }

                // Don't retry on last attempt
                if (attempt === config.maxAttempts) {
                    Logger.warn(`${operationName} failed after ${config.maxAttempts} attempts`);
                    throw lastError;
                }

                // Calculate delay with exponential backoff
                const delay = this.calculateDelay(attempt, config);

                Logger.debug(`${operationName} failed (attempt ${attempt}/${config.maxAttempts}), retrying in ${delay}ms: ${lastError.message}`);

                // Call retry callback if provided
                if (config.onRetry) {
                    config.onRetry(lastError, attempt);
                }

                // Wait before retry
                await this.delay(delay);
            }
        }

        throw lastError!;
    }

    /**
     * Check if error is retryable based on configuration
     */
    private isRetryableError(error: Error, config: RetryConfig): boolean {
        const errorMessage = error.message.toLowerCase();

        return config.retryableErrors.some(pattern => {
            if (typeof pattern === 'string') {
                return errorMessage.includes(pattern.toLowerCase());
            }
            if (pattern instanceof RegExp) {
                return pattern.test(error.message);
            }
            return false;
        });
    }

    /**
     * Calculate delay for exponential backoff
     */
    private calculateDelay(attempt: number, config: RetryConfig): number {
        const exponentialDelay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
        const jitteredDelay = exponentialDelay * (0.5 + Math.random() * 0.5); // Add jitter
        return Math.min(jitteredDelay, config.maxDelayMs);
    }

    /**
     * Delay execution for specified milliseconds
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Execute with different strategies
     */
    async executeWithLinearBackoff<T>(
        operation: () => Promise<T>,
        operationName: string = 'operation',
        maxAttempts: number = 3,
        delayMs: number = 1000
    ): Promise<T> {
        return this.execute(operation, operationName, {
            maxAttempts,
            baseDelayMs: delayMs,
            backoffMultiplier: 1 // Linear backoff
        });
    }

    async executeWithImmediateRetry<T>(
        operation: () => Promise<T>,
        operationName: string = 'operation',
        maxAttempts: number = 3
    ): Promise<T> {
        return this.execute(operation, operationName, {
            maxAttempts,
            baseDelayMs: 0,
            backoffMultiplier: 1
        });
    }

    /**
     * Update global retry configuration
     */
    updateConfig(config: Partial<RetryConfig>): void {
        this.config = { ...this.config, ...config };
        Logger.info('Retry service configuration updated');
    }

    /**
     * Get current configuration
     */
    getConfig(): RetryConfig {
        return { ...this.config };
    }

    /**
     * Dispose of the service
     */
    dispose(): void {
        Logger.info('Retry service disposed');
    }
}