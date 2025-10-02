import { ConnectionManager } from './ConnectionManager';
import { Logger } from '../utils/Logger';
import { DotNetIntegrationService, DotNetConnectionInfo } from '../services/DotNetIntegrationService';

export interface DatabaseObject {
    id: string;
    name: string;
    type: string;
    schema: string;
    database: string;
}

export class SchemaManager {
    private connectionManager: ConnectionManager;
    private dotNetService: DotNetIntegrationService;

    constructor(connectionManager: ConnectionManager) {
        this.connectionManager = connectionManager;
        this.dotNetService = DotNetIntegrationService.getInstance();
    }

    async getDatabaseObjects(connectionId: string, schemaFilter?: string): Promise<DatabaseObject[]> {
        try {
            Logger.info('Getting database objects', { connectionId });

            // Get connection and password directly
            const connection = this.connectionManager.getConnection(connectionId);
            if (!connection) {
                throw new Error(`Connection ${connectionId} not found`);
            }

            const password = await this.connectionManager.getConnectionPassword(connectionId);
            if (!password) {
                throw new Error('Password not found for connection');
            }

            // Create .NET connection info
            const dotNetConnection: DotNetConnectionInfo = {
                id: connection.id,
                name: connection.name,
                host: connection.host,
                port: connection.port,
                database: connection.database,
                username: connection.username,
                password: password,
                createdDate: new Date().toISOString()
            };

            // Get objects via .NET service
            const dotNetObjects = await this.dotNetService.browseSchema(dotNetConnection, schemaFilter || undefined);

            if (!dotNetObjects || dotNetObjects.length === 0) {
                Logger.warn('No objects found in schema', { connectionId });
                return [];
            }

            // Convert from .NET format to local format with simplified mapping
            const objects: DatabaseObject[] = dotNetObjects.map(dotNetObj => ({
                id: dotNetObj.id,
                name: dotNetObj.name,
                type: this.mapDotNetTypeToLocal(dotNetObj.type),
                schema: dotNetObj.schema,
                database: dotNetObj.database
            }));

            Logger.info('Database objects retrieved', {
                connectionId,
                objectCount: objects.length
            });

            return objects;
        } catch (error) {
            Logger.error('Failed to get database objects', error as Error);
            throw error;
        }
    }

    async getObjectDetails(connectionId: string, objectType: string, schema: string, objectName: string): Promise<any> {
        try {
            Logger.info('Getting object details', { connectionId, objectType, schema, objectName });

            // Get connection and password directly
            const connection = this.connectionManager.getConnection(connectionId);
            if (!connection) {
                throw new Error(`Connection ${connectionId} not found`);
            }

            const password = await this.connectionManager.getConnectionPassword(connectionId);
            if (!password) {
                throw new Error('Password not found for connection');
            }

            // Create .NET connection info
            const dotNetConnection: DotNetConnectionInfo = {
                id: connection.id,
                name: connection.name,
                host: connection.host,
                port: connection.port,
                database: connection.database,
                username: connection.username,
                password: password,
                createdDate: new Date().toISOString()
            };

            // Get object details via .NET service
            const details = await this.dotNetService.getObjectDetails(
                dotNetConnection,
                objectType,
                schema,
                objectName
            );

            if (!details) {
                throw new Error('Object details returned null or undefined');
            }

            Logger.info('Object details retrieved', {
                connectionId,
                objectType,
                objectName
            });

            return details;
        } catch (error) {
            Logger.error('Failed to get object details', error as Error);
            throw error;
        }
    }

    private mapDotNetTypeToLocal(dotNetType: string): string {
        const typeMap: { [key: string]: string } = {
            'table': 'table', 'view': 'view', 'function': 'function',
            'procedure': 'procedure', 'sequence': 'sequence', 'type': 'type',
            'domain': 'domain', 'index': 'index', 'trigger': 'trigger',
            'constraint': 'constraint', 'column': 'column', 'schema': 'schema'
        };
        return typeMap[dotNetType.toLowerCase()] || 'unknown';
    }




}