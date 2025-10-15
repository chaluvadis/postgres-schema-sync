import { ConnectionManager } from '../managers/ConnectionManager';
import { Logger } from '../utils/Logger';
import {
    DotNetIntegrationService,
    DotNetConnectionInfo
} from '../services/DotNetIntegrationService';
export interface ConnectionInfo {
    id: string;
    name: string;
    host: string;
    port: number;
    database: string;
    username: string;
    createdDate?: string;
}
export interface ConnectionValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    connectionTime?: number;
}
export interface ConnectionServiceOptions {
    retryAttempts?: number;
    connectionTimeout?: number;
    validateOnGet?: boolean;
}
export class ConnectionService {
    private connectionManager: ConnectionManager;
    private dotNetService: DotNetIntegrationService;
    private options: Required<ConnectionServiceOptions>;

    constructor(
        connectionManager: ConnectionManager,
        options: ConnectionServiceOptions = {}
    ) {
        this.connectionManager = connectionManager;
        this.dotNetService = DotNetIntegrationService.getInstance();
        this.options = {
            retryAttempts: 3,
            connectionTimeout: 30000,
            validateOnGet: true,
            ...options
        };
    }
    async getConnection(connectionId: string): Promise<ConnectionInfo | null> {
        try {
            const connection = this.connectionManager.getConnection(connectionId);

            if (!connection) {
                Logger.warn('Connection not found', 'ConnectionService.getConnection', { connectionId });
                return null;
            }

            if (this.options.validateOnGet) {
                const validation = await this.validateConnection(connectionId);
                if (!validation.isValid) {
                    Logger.error('Connection validation failed', 'ConnectionService.getConnection', {
                        connectionId,
                        errors: validation.errors
                    });
                    return null;
                }
            }

            return {
                id: connection.id,
                name: connection.name,
                host: connection.host,
                port: connection.port,
                database: connection.database,
                username: connection.username,
                createdDate: connection.lastConnected?.toISOString() || new Date().toISOString()
            };
        } catch (error) {
            Logger.error('Failed to get connection', error as Error, 'ConnectionService.getConnection', { connectionId });
            return null;
        }
    }
    async getConnectionPassword(connectionId: string): Promise<string | null> {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= this.options.retryAttempts; attempt++) {
            try {
                const password = await this.connectionManager.getConnectionPassword(connectionId);

                if (password) {
                    if (attempt > 1) {
                        Logger.info('Password retrieved successfully after retry', 'ConnectionService.getConnectionPassword', {
                            connectionId,
                            attempt
                        });
                    }
                    return password;
                }

                lastError = new Error('Password not found');
            } catch (error) {
                lastError = error as Error;
                Logger.warn('Password retrieval attempt failed', 'ConnectionService.getConnectionPassword', {
                    connectionId,
                    attempt,
                    error: lastError.message
                });

                if (attempt < this.options.retryAttempts) {
                    await this.delay(1000 * attempt); // Exponential backoff
                }
            }
        }

        Logger.error('Failed to get connection password after all retries', lastError as Error, 'ConnectionService.getConnectionPassword', {
            connectionId,
            attempts: this.options.retryAttempts
        });

        return null;
    }
    async toDotNetConnection(connectionId: string): Promise<DotNetConnectionInfo | null> {
        try {
            const connection = await this.getConnection(connectionId);
            if (!connection) {
                return null;
            }

            const password = await this.getConnectionPassword(connectionId);
            if (!password) {
                return null;
            }

            return {
                id: connection.id,
                name: connection.name,
                host: connection.host,
                port: connection.port,
                database: connection.database,
                username: connection.username,
                password: password,
                createdDate: connection.createdDate
            };
        } catch (error) {
            Logger.error('Failed to convert to DotNet connection', error as Error, 'ConnectionService.toDotNetConnection', { connectionId });
            return null;
        }
    }
    async validateConnection(connectionId: string): Promise<ConnectionValidationResult> {
        const startTime = Date.now();
        const errors: string[] = [];
        const warnings: string[] = [];

        try {
            // Check if connection exists
            const connection = this.connectionManager.getConnection(connectionId);
            if (!connection) {
                errors.push(`Connection ${connectionId} not found`);
                return { isValid: false, errors, warnings };
            }

            // Check if password is available
            const password = await this.getConnectionPassword(connectionId);
            if (!password) {
                errors.push('Connection password not available');
                return { isValid: false, errors, warnings };
            }

            // Test actual connectivity via DotNet service
            const dotNetConnection = await this.toDotNetConnection(connectionId);
            if (!dotNetConnection) {
                errors.push('Failed to create DotNet connection info');
                return { isValid: false, errors, warnings };
            }

            try {
                // Test connection with timeout
                await Promise.race([
                    this.dotNetService.testConnection(dotNetConnection),
                    this.delay(this.options.connectionTimeout)
                ]);

                const connectionTime = Date.now() - startTime;
                warnings.push(`Connection test completed in ${connectionTime}ms`);

            } catch (testError) {
                errors.push(`Connection test failed: ${(testError as Error).message}`);
            }

        } catch (error) {
            errors.push(`Connection validation error: ${(error as Error).message}`);
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            connectionTime: Date.now() - startTime
        };
    }
    getServiceStats(): {
        options: Required<ConnectionServiceOptions>;
        health: 'healthy' | 'degraded' | 'unhealthy';
    } {
        return {
            options: this.options,
            health: 'healthy' // Would be determined by connection success rates
        };
    }
    private delay(milliseconds: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, milliseconds));
    }
    dispose(): void {
        Logger.info('ConnectionService disposed', 'ConnectionService.dispose');
    }
}