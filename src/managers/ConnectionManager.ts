import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';
import { DotNetIntegrationService, DotNetConnectionInfo } from '../services/DotNetIntegrationService';
import { CredentialManager } from '../services/CredentialManager';

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
    private credentialManager: CredentialManager;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.dotNetService = DotNetIntegrationService.getInstance();
        this.credentialManager = new CredentialManager(context);
        this.loadConnections();
        this.secrets = context.secrets;
    }

    async addConnection(connectionInfo: Omit<DatabaseConnection, 'id'>): Promise<void> {
        try {
            Logger.info('Adding new connection', { name: connectionInfo.name });

            const connection: DatabaseConnection = {
                ...connectionInfo,
                id: this.generateId()
            };

            // Validate password strength
            const passwordValidation = await this.credentialManager.validateCredentialStrength(connection.password);
            if (!passwordValidation.isValid) {
                throw new Error(`Weak password: ${passwordValidation.issues.join(', ')}`);
            }

            // Store password securely using credential manager
            await this.credentialManager.storeCredential(connection.id, connection.password);

            // Store connection info (without password)
            this.connections.set(connection.id, {
                ...connection,
                password: '' // Don't store password in memory
            });

            await this.saveConnections();
            Logger.info('Connection added successfully', { id: connection.id });
        } catch (error) {
            Logger.error('Failed to add connection', error as Error);
            throw error;
        }
    }

    async updateConnection(id: string, connectionInfo: Omit<DatabaseConnection, 'id'>): Promise<void> {
        try {
            Logger.info('Updating connection', { id });

            const existing = this.connections.get(id);
            if (!existing) {
                throw new Error(`Connection with id ${id} not found`);
            }

            const updatedConnection: DatabaseConnection = {
                ...connectionInfo,
                id
            };

            // Update password if changed
            if (connectionInfo.password && this.secrets) {
                await this.secrets.store(`connection_${id}_password`, connectionInfo.password);
            }

            // Update connection info
            this.connections.set(id, {
                ...updatedConnection,
                password: '' // Don't store password in memory
            });

            await this.saveConnections();
            Logger.info('Connection updated successfully', { id });
        } catch (error) {
            Logger.error('Failed to update connection', error as Error);
            throw error;
        }
    }

    async removeConnection(id: string): Promise<void> {
        try {
            Logger.info('Removing connection', { id });

            const connection = this.connections.get(id);
            if (!connection) {
                throw new Error(`Connection with id ${id} not found`);
            }

            // Remove password from secrets
            if (this.secrets) {
                await this.secrets.delete(`connection_${id}_password`);
            }

            // Remove connection
            this.connections.delete(id);
            await this.saveConnections();

            Logger.info('Connection removed successfully', { id });
        } catch (error) {
            Logger.error('Failed to remove connection', error as Error);
            throw error;
        }
    }

    async testConnection(id: string): Promise<boolean> {
        try {
            Logger.info('Testing connection', { id });

            const connection = this.connections.get(id);
            if (!connection) {
                throw new Error(`Connection with id ${id} not found`);
            }

            // Get password from secrets
            let password = '';
            if (this.secrets) {
                password = await this.secrets.get(`connection_${id}_password`) || '';
            }

            // Convert to .NET format and test via .NET service
            const dotNetConnection: DotNetConnectionInfo = {
                id: connection.id,
                name: connection.name,
                host: connection.host,
                port: connection.port,
                database: connection.database,
                username: connection.username,
                password: password
            };

            const success = await this.dotNetService.testConnection(dotNetConnection);

            Logger.info('Connection test completed', { id, success });
            return success;
        } catch (error) {
            Logger.error('Connection test failed', error as Error);
            return false;
        }
    }

    getConnections(): DatabaseConnection[] {
        return Array.from(this.connections.values()).map(conn => ({
            ...conn,
            password: '' // Never return password
        }));
    }

    getConnection(id: string): DatabaseConnection | undefined {
        const connection = this.connections.get(id);
        if (connection) {
            return {
                ...connection,
                password: '' // Never return password
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
                    password: '' // Passwords are stored separately in secrets
                });
            }

            Logger.info('Connections loaded', { count: this.connections.size });
        } catch (error) {
            Logger.error('Failed to load connections', error as Error);
            this.connections.clear();
        }
    }

    private async saveConnections(): Promise<void> {
        try {
            const connectionsArray = Array.from(this.connections.values()).map(conn => ({
                ...conn,
                password: '' // Never save password to state
            }));

            await this.context.globalState.update('postgresql.connections', JSON.stringify(connectionsArray));
            Logger.info('Connections saved', { count: connectionsArray.length });
        } catch (error) {
            Logger.error('Failed to save connections', error as Error);
            throw error;
        }
    }

    async dispose(): Promise<void> {
        Logger.info('Disposing ConnectionManager');
        this.connections.clear();
    }
}