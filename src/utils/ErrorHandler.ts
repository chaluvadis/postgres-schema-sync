import * as vscode from 'vscode';
import { Logger } from './Logger';

export interface ErrorContext {
    operation: string;
    timestamp: Date;
    contextData?: Record<string, any> | undefined;
    component?: string | undefined;
    version?: string | undefined;
}

export enum ErrorSeverity {
    LOW = 'LOW',
    MEDIUM = 'MEDIUM',
    HIGH = 'HIGH',
    CRITICAL = 'CRITICAL'
}

// Error recovery strategy interface
export interface ErrorRecoveryStrategy {
    canRecover(error: unknown, context: ErrorContext): boolean;
    recover(error: unknown, context: ErrorContext): Promise<boolean>;
    getUserMessage(error: unknown): string;
}

// Error boundary handler interface
export interface ErrorBoundaryHandler {
    handleError(error: unknown, componentName: string): Promise<boolean>;
    shouldShowFallback(error: unknown): boolean;
    getFallbackComponent(error: unknown): any;
}

export class ErrorHandler {
    private static errorCounts: Map<string, number> = new Map();
    private static lastErrorTimes: Map<string, Date> = new Map();
    private static recoveryStrategies: Map<string, ErrorRecoveryStrategy> = new Map();
    private static errorBoundaryHandlers: Map<string, ErrorBoundaryHandler> = new Map();
    private constructor() { }

    // Register error recovery strategies for different error types
    static registerRecoveryStrategy(errorType: string, strategy: ErrorRecoveryStrategy): void {
        this.recoveryStrategies.set(errorType, strategy);
        Logger.info(`Registered recovery strategy for error type: ${errorType}`);
    }

    // Register error boundary handlers for different components
    static registerErrorBoundary(componentName: string, handler: ErrorBoundaryHandler): void {
        this.errorBoundaryHandlers.set(componentName, handler);
        Logger.info(`Registered error boundary for component: ${componentName}`);
    }
    static createContext(operation: string, contextData?: Record<string, any>): ErrorContext {
        return {
            operation,
            timestamp: new Date(),
            contextData
        };
    }
    static createEnhancedContext(
        operation: string,
        contextData?: Record<string, any>,
        component?: string,
        version?: string
    ): ErrorContext {
        return {
            operation,
            timestamp: new Date(),
            contextData: {
                ...contextData,
                component,
                version,
                machineName: 'VSCode Extension',
                processId: process.pid
            }
        };
    }

    static handleError(error: unknown, context: ErrorContext): void {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;

        // Log the error
        if (error instanceof Error) {
            Logger.error(errorMessage, error, context.operation, {
                ...context.contextData,
                stack: errorStack
            });
        } else {
            Logger.error(errorMessage, context.operation, {
                ...context.contextData,
                originalError: String(error)
            });
        }

        // Track error statistics
        this.trackError(context.operation, errorMessage);

        // Show user-friendly error message for certain types of errors
        if (this.shouldShowUserNotification(errorMessage)) {
            this.showUserErrorNotification(errorMessage, context);
        }
    }
    static handleErrorWithSeverity(
        error: unknown,
        context: ErrorContext,
        severity: ErrorSeverity
    ): void {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Log with appropriate level based on severity
        switch (severity) {
            case ErrorSeverity.CRITICAL:
                if (error instanceof Error) {
                    Logger.critical(errorMessage, error, context.operation, context.contextData);
                } else {
                    Logger.critical(errorMessage, context.operation, { ...context.contextData, originalError: String(error) });
                }
                break;
            case ErrorSeverity.HIGH:
                if (error instanceof Error) {
                    Logger.error(errorMessage, error, context.operation, context.contextData);
                } else {
                    Logger.error(errorMessage, context.operation, { ...context.contextData, originalError: String(error) });
                }
                break;
            case ErrorSeverity.MEDIUM:
                Logger.warn(errorMessage, context.operation, context.contextData);
                break;
            case ErrorSeverity.LOW:
            default:
                Logger.info(errorMessage, context.operation, context.contextData);
                break;
        }

        // Track error statistics
        this.trackError(context.operation, errorMessage);

        // Show user notification for high severity errors
        if (severity === ErrorSeverity.HIGH || severity === ErrorSeverity.CRITICAL) {
            this.showUserErrorNotification(errorMessage, context);
        }
    }

    private static trackError(operation: string, errorMessage: string): void {
        const key = `${operation}:${errorMessage}`;
        const currentCount = this.errorCounts.get(key) || 0;
        this.errorCounts.set(key, currentCount + 1);
        this.lastErrorTimes.set(key, new Date());

        // Log error statistics periodically
        if (currentCount > 0 && currentCount % 10 === 0) {
            Logger.warn(`Error '{errorMessage}' in operation '{operation}' has occurred {currentCount} times`, 'trackError',
                { errorMessage, count: currentCount });
        }
    }

    private static shouldShowUserNotification(errorMessage: string): boolean {
        const userNotificationKeywords = [
            'connection failed',
            'authentication failed',
            'access denied',
            'database not found',
            'migration failed',
            'schema error',
            'critical error',
            'fatal error'
        ];

        return userNotificationKeywords.some(keyword =>
            errorMessage.toLowerCase().includes(keyword)
        );
    }
    private static showUserErrorNotification(errorMessage: string, context: ErrorContext): void {
        const actions: string[] = [];

        // Add relevant actions based on error type
        if (errorMessage.toLowerCase().includes('connection')) {
            actions.push('Add Connection', 'View Logs');
        } else if (errorMessage.toLowerCase().includes('migration')) {
            actions.push('View Logs', 'Get Help');
        } else {
            actions.push('View Logs', 'Report Issue');
        }

        vscode.window.showErrorMessage(
            `PostgreSQL Schema Sync: ${errorMessage}`,
            ...(actions as [string, ...string[]])
        ).then(selection => {
            if (selection === 'View Logs') {
                Logger.showOutputChannel();
            } else if (selection === 'Add Connection') {
                vscode.commands.executeCommand('postgresql.addConnection');
            } else if (selection === 'Get Help') {
                vscode.commands.executeCommand('postgresql.showHelp');
            } else if (selection === 'Report Issue') {
                vscode.commands.executeCommand('postgresql.showHelp'); // Could link to issues page
            }
        });
    }

    static getErrorStatistics(): { totalErrors: number; errorsByOperation: Record<string, number>; recentErrors: Array<{ operation: string; message: string; timestamp: Date; }>; } {
        const totalErrors = Array.from(this.errorCounts.values()).reduce((sum, count) => sum + count, 0);

        const errorsByOperation: Record<string, number> = {};
        for (const [key, count] of this.errorCounts.entries()) {
            const operation = key.split(':')[0];
            errorsByOperation[operation] = (errorsByOperation[operation] || 0) + count;
        }

        const recentErrors = Array.from(this.lastErrorTimes.entries())
            .filter(([key, timestamp]) => {
                const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
                return timestamp > fiveMinutesAgo;
            })
            .map(([key, timestamp]) => {
                const [operation, message] = key.split(':');
                return { operation, message, timestamp };
            })
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
            .slice(0, 10); // Last 10 recent errors

        return {
            totalErrors,
            errorsByOperation,
            recentErrors
        };
    }
    static clearErrorStatistics(): void {
        this.errorCounts.clear();
        this.lastErrorTimes.clear();
        Logger.info('Error statistics cleared');
    }

    static determineSeverity(error: unknown): ErrorSeverity {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const message = errorMessage.toLowerCase();

        // Critical errors
        if (message.includes('fatal') ||
            message.includes('catastrophic') ||
            message.includes('out of memory') ||
            message.includes('stack overflow')) {
            return ErrorSeverity.CRITICAL;
        }

        // High severity errors
        if (message.includes('authentication failed') ||
            message.includes('access denied') ||
            message.includes('permission denied') ||
            message.includes('corruption') ||
            message.includes('data loss')) {
            return ErrorSeverity.HIGH;
        }

        // Medium severity errors
        if (message.includes('timeout') ||
            message.includes('connection failed') ||
            message.includes('network error') ||
            message.includes('deadlock')) {
            return ErrorSeverity.MEDIUM;
        }
        return ErrorSeverity.LOW;
    }

    static async wrapAsyncOperation<T>(
        operation: () => Promise<T>,
        context: ErrorContext,
        severity?: ErrorSeverity
    ): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            const errorSeverity = severity || this.determineSeverity(error);
            this.handleErrorWithSeverity(error, context, errorSeverity);
            throw error;
        }
    }
    static wrapSyncOperation<T>(
        operation: () => T,
        context: ErrorContext,
        severity?: ErrorSeverity
    ): T {
        try {
            return operation();
        } catch (error) {
            const errorSeverity = severity || this.determineSeverity(error);
            this.handleErrorWithSeverity(error, context, errorSeverity);
            throw error;
        }
    }

    // Enhanced error handling with recovery
    static async handleErrorWithRecovery(
        error: unknown,
        context: ErrorContext,
        recoveryOptions?: {
            maxRetries?: number;
            retryDelay?: number;
            fallbackOperation?: () => Promise<any>;
        }
    ): Promise<boolean> {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorSeverity = this.determineSeverity(error);

        // Log the error
        this.handleErrorWithSeverity(error, context, errorSeverity);

        // Try to find and execute recovery strategy
        const recoveryStrategy = this.findRecoveryStrategy(error, context);
        if (recoveryStrategy) {
            try {
                Logger.info(`Attempting error recovery for: ${errorMessage}`, 'handleErrorWithRecovery');
                const recovered = await recoveryStrategy.recover(error, context);

                if (recovered) {
                    Logger.info('Error recovery successful', 'handleErrorWithRecovery');
                    vscode.window.showInformationMessage(`Recovered from error: ${recoveryStrategy.getUserMessage(error)}`);
                    return true;
                }
            } catch (recoveryError) {
                Logger.error('Error recovery failed', recoveryError as Error, 'handleErrorWithRecovery');
            }
        }

        // Try retry mechanism if configured
        if (recoveryOptions?.maxRetries && recoveryOptions.maxRetries > 0) {
            return await this.attemptRetry(error, context, {
                maxRetries: recoveryOptions.maxRetries,
                retryDelay: recoveryOptions.retryDelay || 1000
            });
        }

        // Try fallback operation if provided
        if (recoveryOptions?.fallbackOperation) {
            try {
                Logger.info('Executing fallback operation', 'handleErrorWithRecovery');
                await recoveryOptions.fallbackOperation();
                return true;
            } catch (fallbackError) {
                Logger.error('Fallback operation failed', fallbackError as Error, 'handleErrorWithRecovery');
            }
        }

        return false;
    }

    private static findRecoveryStrategy(error: unknown, context: ErrorContext): ErrorRecoveryStrategy | undefined {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Find matching recovery strategy
        for (const [errorType, strategy] of this.recoveryStrategies.entries()) {
            if (strategy.canRecover(error, context)) {
                return strategy;
            }
        }

        return undefined;
    }

    private static async attemptRetry(
        error: unknown,
        context: ErrorContext,
        options: { maxRetries: number; retryDelay: number; }
    ): Promise<boolean> {
        const errorMessage = error instanceof Error ? error.message : String(error);

        for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
            Logger.info(`Retry attempt ${attempt}/${options.maxRetries} for: ${errorMessage}`, 'attemptRetry');

            await new Promise(resolve => setTimeout(resolve, options.retryDelay * attempt));

            try {
                // The actual retry would need to be provided by the caller
                // For now, we'll just log the attempt
                Logger.info(`Retry attempt ${attempt} completed`, 'attemptRetry');
                return true;
            } catch (retryError) {
                Logger.warn(`Retry attempt ${attempt} failed`, 'attemptRetry');
                if (attempt === options.maxRetries) {
                    Logger.error('All retry attempts exhausted', retryError as Error, 'attemptRetry');
                    return false;
                }
            }
        }

        return false;
    }

    // Error boundary handling for React-like error containment
    static async handleComponentError(
        error: unknown,
        componentName: string,
        componentStack?: string
    ): Promise<boolean> {
        const context: ErrorContext = {
            operation: `ComponentError:${componentName}`,
            timestamp: new Date(),
            contextData: {
                componentName,
                componentStack,
                errorBoundary: true
            }
        };

        Logger.error(
            `Component error in ${componentName}`,
            error instanceof Error ? error : new Error(String(error)),
            'handleComponentError',
            { componentName, componentStack }
        );

        // Find error boundary handler
        const boundaryHandler = this.errorBoundaryHandlers.get(componentName);
        if (boundaryHandler) {
            try {
                return await boundaryHandler.handleError(error, componentName);
            } catch (boundaryError) {
                Logger.error('Error boundary handler failed', boundaryError as Error, 'handleComponentError');
            }
        }

        // Default error boundary behavior
        vscode.window.showErrorMessage(
            `PostgreSQL Schema Sync: Component error in ${componentName}. Please restart the extension if issues persist.`,
            'Restart Extension',
            'View Logs'
        ).then(selection => {
            if (selection === 'Restart Extension') {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            } else if (selection === 'View Logs') {
                Logger.showOutputChannel();
            }
        });

        return false;
    }

    // Circuit breaker pattern for failing operations
    private static circuitBreakerStates: Map<string, CircuitBreakerState> = new Map();

    static async executeWithCircuitBreaker<T>(
        operation: () => Promise<T>,
        circuitName: string,
        context: ErrorContext,
        options: {
            failureThreshold?: number;
            recoveryTimeout?: number;
            monitoringPeriod?: number;
        } = {}
    ): Promise<T> {
        const {
            failureThreshold = 5,
            recoveryTimeout = 60000,
            monitoringPeriod = 10000
        } = options;

        let circuitState = this.circuitBreakerStates.get(circuitName);

        if (!circuitState) {
            circuitState = {
                state: 'CLOSED',
                failures: 0,
                lastFailureTime: null,
                nextAttempt: 0
            };
            this.circuitBreakerStates.set(circuitName, circuitState);
        }

        // Check if circuit breaker should allow the operation
        if (circuitState.state === 'OPEN') {
            if (Date.now() < circuitState.nextAttempt) {
                throw this.createCircuitBreakerError(circuitName, 'Circuit breaker is OPEN');
            } else {
                circuitState.state = 'HALF_OPEN';
                Logger.info(`Circuit breaker for ${circuitName} transitioning to HALF_OPEN`, 'executeWithCircuitBreaker');
            }
        }

        try {
            const result = await operation();

            // Success - reset circuit breaker
            if (circuitState.state === 'HALF_OPEN') {
                circuitState.state = 'CLOSED';
                circuitState.failures = 0;
                Logger.info(`Circuit breaker for ${circuitName} reset to CLOSED`, 'executeWithCircuitBreaker');
            }

            return result;
        } catch (error) {
            circuitState.failures++;
            circuitState.lastFailureTime = new Date();

            if (circuitState.failures >= failureThreshold) {
                circuitState.state = 'OPEN';
                circuitState.nextAttempt = Date.now() + recoveryTimeout;
                Logger.warn(`Circuit breaker for ${circuitName} opened after ${circuitState.failures} failures`, 'executeWithCircuitBreaker');
            }

            throw error;
        }
    }

    private static createCircuitBreakerError(circuitName: string, message: string): Error {
        const error = new Error(`CircuitBreaker: ${message} (${circuitName})`);
        error.name = 'CircuitBreakerError';
        return error;
    }

    // Graceful degradation for non-critical features
    static async executeWithGracefulDegradation<T>(
        primaryOperation: () => Promise<T>,
        fallbackOperation: () => Promise<T>,
        context: ErrorContext,
        featureName: string
    ): Promise<T> {
        try {
            return await primaryOperation();
        } catch (error) {
            Logger.warn(`Primary operation failed for ${featureName}, using fallback`, 'executeWithGracefulDegradation');

            // Log the primary failure
            this.handleError(error, {
                ...context,
                operation: `${context.operation}:PrimaryFailed`,
                contextData: {
                    ...context.contextData,
                    featureName,
                    gracefulDegradation: true
                }
            });

            try {
                return await fallbackOperation();
            } catch (fallbackError) {
                Logger.error(`Fallback operation also failed for ${featureName}`, fallbackError as Error, 'executeWithGracefulDegradation');

                // Both operations failed
                this.handleError(fallbackError, {
                    ...context,
                    operation: `${context.operation}:FallbackFailed`,
                    contextData: {
                        ...context.contextData,
                        featureName,
                        bothOperationsFailed: true
                    }
                });

                throw fallbackError;
            }
        }
    }
};

// Circuit breaker state interface
interface CircuitBreakerState {
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    failures: number;
    lastFailureTime: Date | null;
    nextAttempt: number;
}