import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';
import { DotNetIntegrationService, DotNetConnectionInfo } from '../services/DotNetIntegrationService';

export interface DatabaseConnection {
    id: string;
    name: string;
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    status?: 'Connected' | 'Disconnected' | 'Error';
}

export class ConnectionManager {
    private context: vscode.ExtensionContext;
    private connections: Map<string, DatabaseConnection> = new Map();
    private secrets: vscode.SecretStorage | undefined;
    private dotNetService: DotNetIntegrationService;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.dotNetService = DotNetIntegrationService.getInstance();
        this.loadConnections();
        this.secrets = context.secrets;
    }

    async addConnection(connectionInfo: Omit<DatabaseConnection, 'id'>): Promise<void> {
        try {
            Logger.info(`Adding connection: ${connectionInfo.name}`);

            const connection: DatabaseConnection = {
                ...connectionInfo,
                id: this.generateId()
            };

            this.connections.set(connection.id, {
                ...connection,
                password: '' // Don't store password in memory
            });

            await this.saveConnections();
            Logger.info(`Connection added: ${connection.id}`);
        } catch (error) {
            Logger.error(`Failed to add connection: ${(error as Error).message}`);
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

            if (connectionInfo.password && this.secrets) {
                await this.secrets.store(`connection_${id}_password`, connectionInfo.password);
            }

            this.connections.set(id, {
                ...connectionInfo,
                id,
                password: '' // Don't store password in memory
            });

            await this.saveConnections();
            Logger.info(`Connection updated: ${id}`);
        } catch (error) {
            Logger.error(`Failed to update connection: ${(error as Error).message}`);
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
                Logger.error(`Connection not found: ${id}`);
                return false;
            }

            if (!this.dotNetService) {
                Logger.error('DotNet service not available');
                return false;
            }

            let password = '';
            if (this.secrets) {
                password = await this.secrets.get(`connection_${id}_password`) || '';
            }

            if (!password) {
                Logger.error(`Password not found for connection: ${id}`);
                return false;
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

            const result = await this.dotNetService.testConnection(dotNetConnection);
            const success = !!result;

            Logger.info(`Connection test ${success ? 'successful' : 'failed'}: ${id}`);
            return success;
        } catch (error) {
            Logger.error(`Connection test error: ${(error as Error).message}`);
            return false;
        }
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
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
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
            this.connections.clear();
            Logger.info('ConnectionManager disposed');
        } catch (error) {
            Logger.error(`Disposal error: ${(error as Error).message}`);
        }
    }
}