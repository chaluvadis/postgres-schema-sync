import * as vscode from 'vscode';
import { Logger } from '@/utils/Logger';
import { DotNetIntegrationService, DotNetConnectionInfo } from '@/services/DotNetIntegrationService';
import { SecurityManager } from '@/services/SecurityManager';
import { ActivityBarProvider } from '@/providers/ActivityBarProvider';

export interface DatabaseConnection {
    id: string;
    name: string;
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    status?: 'Connected' | 'Disconnected' | 'Error' | 'Connecting' | 'Reconnecting';
    lastConnected?: Date;
    connectionAttempts?: number;
    lastError?: string;
    isPooled?: boolean;
    poolSize?: number;
    maxConnections?: number;
    autoReconnect?: boolean;
    reconnectDelay?: number;
    maxReconnectAttempts?: number;
    createdDate?: string;
}

export interface ConnectionPool {
    connectionId: string;
    activeConnections: number;
    idleConnections: number;
    totalConnections: number;
    maxConnections: number;
    createdAt: Date;
    lastActivity: Date;
}

export interface ConnectionHealth {
    connectionId: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    responseTime: number;
    lastChecked: Date;
    consecutiveFailures: number;
    isAutoReconnecting: boolean;
}

export class ConnectionManager {
    private context: vscode.ExtensionContext;
    private connections: Map<string, DatabaseConnection> = new Map();
    private connectionPools: Map<string, ConnectionPool> = new Map();
    private connectionHealth: Map<string, ConnectionHealth> = new Map();
    private activeConnectionInstances: Map<string, Set<string>> = new Map(); // connectionId -> Set of active connection instances
    private reconnectionTimers: Map<string, NodeJS.Timeout> = new Map();
    private healthCheckInterval?: NodeJS.Timeout;
    private secrets: vscode.SecretStorage | undefined;
    private dotNetService: DotNetIntegrationService;
    private activityBarProvider?: ActivityBarProvider | undefined;

    constructor(context: vscode.ExtensionContext, activityBarProvider?: ActivityBarProvider) {
        this.context = context;
        this.dotNetService = DotNetIntegrationService.getInstance();
        this.activityBarProvider = activityBarProvider;
        this.loadConnections();
        this.secrets = context.secrets;
        this.startHealthMonitoring();
    }

    async addConnection(connectionInfo: Omit<DatabaseConnection, 'id'>): Promise<void> {
        try {
            Logger.info(`Adding connection: ${connectionInfo.name}`);

            const connection: DatabaseConnection = {
                ...connectionInfo,
                id: this.generateId()
            };

            // Store password securely using VS Code Secret Storage
            if (connectionInfo.password && this.secrets) {
                await this.secrets.store(`connection_${connection.id}_password`, connectionInfo.password);
                Logger.info(`Password stored securely for connection: ${connection.id}`);
            }

            this.connections.set(connection.id, {
                ...connection,
                password: '' // Don't store password in memory
            });

            await this.saveConnections();

            // Update activity bar with new connection count
            if (this.activityBarProvider) {
                this.activityBarProvider.updateActivityBar();
            }

            Logger.info(`Connection added: ${connection.id}`);
        } catch (error) {
            Logger.error(`Failed to add connection: ${(error as Error).message}`, error as Error, 'addConnection');
            throw error;
        }
    }
    async updateConnection(id: string, connectionInfo: Omit<DatabaseConnection, 'id'>): Promise<void> {
        try {
            Logger.info(`Updating connection: ${id}`);

            const existing = this.connections.get(id);
            if (!existing) {
                throw new Error(`Connection with id ${id} not found`);
            }

            // Handle password update securely
            if (connectionInfo.password) {
                if (this.secrets) {
                    // Delete old password if it exists
                    await this.secrets.delete(`connection_${id}_password`);
                    // Store new password securely
                    await this.secrets.store(`connection_${id}_password`, connectionInfo.password);
                    Logger.info(`Password updated securely for connection: ${id}`);
                } else {
                    Logger.warn('Secret storage not available, password not updated');
                }
            }

            this.connections.set(id, {
                ...connectionInfo,
                id,
                password: '' // Don't store password in memory
            });

            await this.saveConnections();

            // Update activity bar with updated connection count
            if (this.activityBarProvider) {
                this.activityBarProvider.updateActivityBar();
            }

            Logger.info(`Connection updated: ${id}`);
        } catch (error) {
            Logger.error(`Failed to update connection: ${(error as Error).message}`, error as Error, 'updateConnection');
            throw error;
        }
    }
    async removeConnection(id: string): Promise<void> {
        try {
            Logger.info(`Removing connection: ${id}`);

            const connection = this.connections.get(id);
            if (!connection) {
                throw new Error(`Connection with id ${id} not found`);
            }

            if (this.secrets) {
                await this.secrets.delete(`connection_${id}_password`);
            }

            this.connections.delete(id);
            await this.saveConnections();
            this.activityBarProvider?.updateActivityBar();
            Logger.info(`Connection removed: ${id}`);
        } catch (error) {
            Logger.error(`Failed to remove connection: ${(error as Error).message}`);
            throw error;
        }
    }
    async testConnection(id: string): Promise<boolean> {
        try {
            Logger.info(`Testing connection: ${id}`);

            const connection = this.connections.get(id);
            if (!connection) {
                Logger.error(`Connection not found: ${id}`, new Error(`Connection ${id} not found`), 'testConnection');
                return false;
            }

            if (!this.dotNetService) {
                Logger.error('DotNet service not available', new Error('DotNet service is null'), 'testConnection');
                return false;
            }

            // Retrieve password securely from VS Code Secret Storage
            let password = '';
            if (this.secrets) {
                password = await this.secrets.get(`connection_${id}_password`) || '';
            }

            if (!password) {
                Logger.error(`Password not found for connection: ${id}`, new Error('Password not available'), 'testConnection');
                throw new Error('Password not configured for this connection. Please edit the connection and set the password.');
            }

            // Validate connection parameters before testing
            if (!this.validateConnectionInfo(connection)) {
                Logger.error(`Invalid connection parameters for: ${id}`, new Error('Invalid connection info'), 'testConnection');
                throw new Error('Connection parameters are invalid. Please check host, port, and database name.');
            }

            // Perform security validation if SSL is enabled
            if (connection.port === 5432) { // Default PostgreSQL SSL port
                const securityManager = SecurityManager.getInstance();
                const securityValidation = securityManager.validateConnectionSecurity(
                    connection.host,
                    connection.port,
                    true // Assume SSL for port 5432
                );

                if (!securityValidation.allowed) {
                    Logger.warn(`Security validation failed for connection ${id}`, 'testConnection');
                    if (!securityValidation.requiresSSL) {
                        throw new Error(`Security policy violation: ${securityValidation.reason}`);
                    }
                }

                // Validate SSL certificate if using SSL
                try {
                    const certValidation = await securityManager.validateCertificate(
                        connection.host,
                        connection.port,
                        id
                    );

                    if (!certValidation.valid) {
                        Logger.warn(`Certificate validation failed for ${connection.host}`, 'testConnection');
                        vscode.window.showWarningMessage(
                            `Certificate validation failed for ${connection.host}. Connection may not be secure.`,
                            'View Details', 'Continue Anyway'
                        ).then(selection => {
                            if (selection === 'View Details' && certValidation.warnings) {
                                vscode.window.showInformationMessage(
                                    `Certificate warnings: ${certValidation.warnings.join(', ')}`
                                );
                            }
                        });
                    }
                } catch (certError) {
                    Logger.warn('Certificate validation error', 'testConnection', certError as Error);
                    // Continue with connection test even if certificate validation fails
                }
            }

            const dotNetConnection: DotNetConnectionInfo = {
                id: connection.id,
                name: connection.name,
                host: connection.host,
                port: connection.port,
                database: connection.database,
                username: connection.username,
                password: password
            };

            // Test the connection with timeout
            const result = await Promise.race([
                this.dotNetService.testConnection(dotNetConnection),
                new Promise<boolean>((_, reject) =>
                    setTimeout(() => reject(new Error('Connection test timed out after 30 seconds')), 30000)
                )
            ]);

            const success = !!result;

            // Update connection status
            connection.status = success ? 'Connected' : 'Error';

            Logger.info(`Connection test ${success ? 'successful' : 'failed'}: ${id}`, 'testConnection');
            return success;
        } catch (error) {
            Logger.error(`Connection test error: ${(error as Error).message}`, error as Error, 'testConnection');

            // Update connection status on error
            const connection = this.connections.get(id);
            if (connection) {
                connection.status = 'Error';
            }

            // Show user-friendly error message
            const errorMessage = (error as Error).message;
            if (errorMessage.includes('password') || errorMessage.includes('authentication')) {
                vscode.window.showErrorMessage(`Connection failed: Authentication error. Please check username and password.`);
            } else if (errorMessage.includes('host') || errorMessage.includes('port')) {
                vscode.window.showErrorMessage(`Connection failed: Network error. Please check host and port.`);
            } else {
                vscode.window.showErrorMessage(`Connection test failed: ${errorMessage}`);
            }

            return false;
        }
    }
    private validateConnectionInfo(connection: DatabaseConnection): boolean {
        return !!(
            connection.host &&
            connection.host.length > 0 &&
            connection.port &&
            connection.port > 0 &&
            connection.port <= 65535 &&
            connection.database &&
            connection.database.length > 0 &&
            connection.username &&
            connection.username.length > 0
        );
    }
    async testConnectionData(connectionData: Omit<DatabaseConnection, 'id'> & { password: string; }): Promise<boolean> {
        try {
            Logger.info(`Testing connection data: ${connectionData.name}`);

            if (!this.dotNetService) {
                Logger.error('DotNet service not available');
                return false;
            }

            const dotNetConnection: DotNetConnectionInfo = {
                id: 'temp-' + Date.now(), // Temporary ID for testing
                name: connectionData.name,
                host: connectionData.host,
                port: connectionData.port,
                database: connectionData.database,
                username: connectionData.username,
                password: connectionData.password
            };

            const result = await this.dotNetService.testConnection(dotNetConnection);
            const success = !!result;

            Logger.info(`Connection test ${success ? 'successful' : 'failed'}: ${connectionData.name}`);
            return success;
        } catch (error) {
            Logger.error(`Connection test error: ${(error as Error).message}`);
            return false;
        }
    }
    getConnections(): DatabaseConnection[] {
        return Array.from(this.connections.values()).map(conn => ({
            ...conn,
            password: ''
        }));
    }
    getConnection(id: string): DatabaseConnection | undefined {
        const connection = this.connections.get(id);
        if (connection) {
            return {
                ...connection,
                password: ''
            };
        }
        return undefined;
    }
    async getConnectionPassword(id: string): Promise<string | undefined> {
        if (this.secrets) {
            return await this.secrets.get(`connection_${id}_password`);
        }
        return undefined;
    }
    private generateId(): string {
        return crypto.randomUUID();
    }
    private async loadConnections(): Promise<void> {
        try {
            const connectionsData = this.context.globalState.get<string>('postgresql.connections', '[]');
            const connections = JSON.parse(connectionsData) as DatabaseConnection[];

            this.connections.clear();
            for (const connection of connections) {
                this.connections.set(connection.id, {
                    ...connection,
                    password: ''
                });
            }

            Logger.info(`Loaded ${this.connections.size} connections`);
        } catch (error) {
            Logger.error(`Failed to load connections: ${(error as Error).message}`);
            this.connections.clear();
        }
    }
    private async saveConnections(): Promise<void> {
        try {
            const connectionsArray = Array.from(this.connections.values()).map(conn => ({
                ...conn,
                password: ''
            }));

            await this.context.globalState.update('postgresql.connections', JSON.stringify(connectionsArray));
            Logger.info(`Saved ${connectionsArray.length} connections`);
        } catch (error) {
            Logger.error(`Failed to save connections: ${(error as Error).message}`);
            throw error;
        }
    }
    async dispose(): Promise<void> {
        try {
            Logger.info('Disposing ConnectionManager');

            // Clear reconnection timers
            for (const timer of this.reconnectionTimers.values()) {
                clearTimeout(timer);
            }
            this.reconnectionTimers.clear();

            // Stop health monitoring
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
            }

            // Close all active connections
            for (const [connectionId, activeConnectionIds] of this.activeConnectionInstances) {
                for (const activeConnectionId of activeConnectionIds) {
                    try {
                        await this.closeConnection(connectionId, activeConnectionId);
                    } catch (error) {
                        Logger.warn(`Error closing connection ${activeConnectionId}`, 'dispose');
                    }
                }
            }

            this.connections.clear();
            this.connectionPools.clear();
            this.activeConnectionInstances.clear();

            Logger.info('ConnectionManager disposed');
        } catch (error) {
            Logger.error(`Disposal error: ${(error as Error).message}`);
        }
    }
    async releasePooledConnection(connectionId: string, activeConnectionId: string): Promise<void> {
        try {
            // Remove from active connections
            const activeSet = this.activeConnectionInstances.get(connectionId);
            if (activeSet) {
                activeSet.delete(activeConnectionId);
            }

            Logger.debug('Released connection', 'releasePooledConnection', {
                connectionId,
                activeConnectionId
            });

        } catch (error) {
            Logger.error('Failed to release connection', error as Error);
        }
    }
    private async scheduleReconnection(connectionId: string): Promise<void> {
        try {
            const connection = this.connections.get(connectionId);
            if (!connection) return;

            // Clear existing reconnection timer
            const existingTimer = this.reconnectionTimers.get(connectionId);
            if (existingTimer) {
                clearTimeout(existingTimer);
            }

            connection.status = 'Reconnecting';
            this.connections.set(connectionId, connection);

            const delay = (connection.reconnectDelay || 5) * 1000; // Convert to milliseconds

            Logger.info(`Scheduling reconnection for ${connectionId} in ${delay}ms`);

            const timer = setTimeout(async () => {
                try {
                    this.reconnectionTimers.delete(connectionId);
                    await this.attemptReconnection(connectionId);
                } catch (error) {
                    Logger.error('Reconnection attempt failed', error as Error);
                }
            }, delay);

            this.reconnectionTimers.set(connectionId, timer);

        } catch (error) {
            Logger.error('Failed to schedule reconnection', error as Error);
        }
    }
    private async attemptReconnection(connectionId: string): Promise<void> {
        try {
            Logger.info(`Attempting reconnection: ${connectionId}`);

            const connection = this.connections.get(connectionId);
            if (!connection) return;

            connection.status = 'Connecting';
            this.connections.set(connectionId, connection);

            // Test the connection
            const success = await this.testConnection(connectionId);

            if (success) {
                connection.status = 'Connected';
                connection.lastConnected = new Date();
                connection.connectionAttempts = 0;
                connection.lastError = undefined;
                this.connections.set(connectionId, connection);

                // Update health status
                const health = this.connectionHealth.get(connectionId);
                if (health) {
                    health.status = 'healthy';
                    health.consecutiveFailures = 0;
                    health.lastChecked = new Date();
                    this.connectionHealth.set(connectionId, health);
                }

                Logger.info(`Reconnection successful: ${connectionId}`);

                vscode.window.showInformationMessage(
                    `Connection "${connection.name}" reconnected successfully`,
                    'Test Connection', 'View Details'
                ).then(selection => {
                    if (selection === 'Test Connection') {
                        this.testConnection(connectionId);
                    } else if (selection === 'View Details') {
                        Logger.showOutputChannel();
                    }
                });

            } else {
                // Reconnection failed, schedule another attempt if within limits
                if ((connection.connectionAttempts || 0) < (connection.maxReconnectAttempts || 3)) {
                    await this.scheduleReconnection(connectionId);
                } else {
                    connection.status = 'Error';
                    this.connections.set(connectionId, connection);

                    Logger.error(`Max reconnection attempts reached for ${connectionId}`);

                    vscode.window.showErrorMessage(
                        `Connection "${connection.name}" failed to reconnect after ${connection.maxReconnectAttempts} attempts`,
                        'Edit Connection', 'View Logs', 'Disable Auto-reconnect'
                    ).then(selection => {
                        if (selection === 'Edit Connection') {
                            vscode.commands.executeCommand('postgresql.editConnection', connection);
                        } else if (selection === 'View Logs') {
                            Logger.showOutputChannel();
                        } else if (selection === 'Disable Auto-reconnect') {
                            connection.autoReconnect = false;
                            this.connections.set(connectionId, connection);
                            this.saveConnections();
                        }
                    });
                }
            }

        } catch (error) {
            Logger.error('Reconnection attempt error', error as Error);
        }
    }
    private startHealthMonitoring(): void {
        // Check connection health every 30 seconds
        this.healthCheckInterval = setInterval(async () => {
            await this.performHealthChecks();
        }, 30000);

        Logger.info('Connection health monitoring started');
    }
    private async performHealthChecks(): Promise<void> {
        try {
            for (const [connectionId, connection] of this.connections) {
                if (connection.status === 'Connected') {
                    try {
                        const startTime = Date.now();
                        const isHealthy = await this.testConnection(connectionId);
                        const responseTime = Date.now() - startTime;

                        // Update health status
                        const health = this.connectionHealth.get(connectionId) || {
                            connectionId,
                            status: 'healthy' as const,
                            responseTime: 0,
                            lastChecked: new Date(),
                            consecutiveFailures: 0,
                            isAutoReconnecting: false
                        };

                        if (isHealthy) {
                            health.status = responseTime < 1000 ? 'healthy' : 'degraded';
                            health.responseTime = responseTime;
                            health.consecutiveFailures = 0;
                        } else {
                            health.status = 'unhealthy';
                            health.consecutiveFailures++;
                        }

                        health.lastChecked = new Date();
                        this.connectionHealth.set(connectionId, health);

                    } catch (error) {
                        Logger.warn(`Health check failed for ${connectionId}`, 'performHealthChecks');
                    }
                }
            }
        } catch (error) {
            Logger.error('Error during health checks', error as Error);
        }
    }
    async closeConnection(connectionId: string, activeConnectionId?: string): Promise<void> {
        try {
            if (activeConnectionId) {
                // Close specific pooled connection
                await this.releasePooledConnection(connectionId, activeConnectionId);
            } else {
                // Close all connections for this connection ID
                const activeSet = this.activeConnectionInstances.get(connectionId);
                if (activeSet) {
                    for (const id of activeSet) {
                        await this.releasePooledConnection(connectionId, id);
                    }
                }

                // Clear reconnection timer
                const timer = this.reconnectionTimers.get(connectionId);
                if (timer) {
                    clearTimeout(timer);
                    this.reconnectionTimers.delete(connectionId);
                }

                // Update connection status
                const connection = this.connections.get(connectionId);
                if (connection) {
                    connection.status = 'Disconnected';
                    this.connections.set(connectionId, connection);
                }
            }

            Logger.info('Connection closed', 'closeConnection', { connectionId, activeConnectionId });

        } catch (error) {
            Logger.error('Failed to close connection', error as Error);
        }
    }
}