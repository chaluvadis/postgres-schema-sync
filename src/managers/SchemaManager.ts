import { ConnectionManager } from './ConnectionManager';
import { Logger } from '../utils/Logger';
import { DotNetIntegrationService, DotNetConnectionInfo } from '../services/DotNetIntegrationService';

export interface DatabaseObject {
    id: string;
    name: string;
    type: string;
    schema: string;
    database: string;
    children?: DatabaseObject[];
}

export class SchemaManager {
    private connectionManager: ConnectionManager;
    private dotNetService: DotNetIntegrationService;

    constructor(connectionManager: ConnectionManager) {
        this.connectionManager = connectionManager;
        this.dotNetService = DotNetIntegrationService.getInstance();
    }

    async getDatabaseObjects(connectionId: string): Promise<DatabaseObject[]> {
        try {
            Logger.info('Getting database objects', { connectionId });

            const connection = this.connectionManager.getConnection(connectionId);
            if (!connection) {
                throw new Error(`Connection ${connectionId} not found`);
            }

            // Get password from VSCode secrets
            const password = await this.connectionManager.getConnectionPassword(connectionId);
            if (!password) {
                throw new Error('Password not found for connection');
            }

            // Convert to .NET format
            const dotNetConnection: DotNetConnectionInfo = {
                id: connection.id,
                name: connection.name,
                host: connection.host,
                port: connection.port,
                database: connection.database,
                username: connection.username,
                password: password
            };

            // Get objects via .NET service
            const dotNetObjects = await this.dotNetService.browseSchema(dotNetConnection);

            // Convert from .NET format to local format
            const objects = dotNetObjects.map(dotNetObj => ({
                id: dotNetObj.id,
                name: dotNetObj.name,
                type: this.mapDotNetTypeToLocal(dotNetObj.type),
                schema: dotNetObj.schema,
                database: dotNetObj.database,
                owner: dotNetObj.owner,
                sizeInBytes: dotNetObj.sizeInBytes,
                properties: dotNetObj.properties,
                definition: dotNetObj.definition,
                createdAt: dotNetObj.createdAt,
                modifiedAt: dotNetObj.modifiedAt,
                dependencies: dotNetObj.dependencies
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

            const connection = this.connectionManager.getConnection(connectionId);
            if (!connection) {
                throw new Error(`Connection ${connectionId} not found`);
            }

            // Get password from VSCode secrets
            const password = await this.connectionManager.getConnectionPassword(connectionId);
            if (!password) {
                throw new Error('Password not found for connection');
            }

            // Convert to .NET format
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
        // Map .NET object types to local types
        switch (dotNetType.toLowerCase()) {
            case 'table': return 'table';
            case 'view': return 'view';
            case 'function': return 'function';
            case 'procedure': return 'procedure';
            case 'sequence': return 'sequence';
            case 'type': return 'type';
            case 'domain': return 'domain';
            case 'collation': return 'collation';
            case 'extension': return 'extension';
            case 'role': return 'role';
            case 'tablespace': return 'tablespace';
            case 'index': return 'index';
            case 'trigger': return 'trigger';
            case 'constraint': return 'constraint';
            case 'column': return 'column';
            case 'schema': return 'schema';
            default: return 'unknown';
        }
    }

}