import { ConnectionManager } from '../ConnectionManager';
import { Logger } from '@/utils/Logger';
import { DotNetIntegrationService, DotNetConnectionInfo } from '@/services/DotNetIntegrationService';
import { SecurityManager, DataClassification } from '@/services/SecurityManager';
import { ExtensionInitializer } from '@/utils/ExtensionInitializer';

// Core schema operation interfaces
export interface DatabaseObject {
    id: string;
    name: string;
    type: string;
    schema: string;
    database: string;
    owner?: string;
    sizeInBytes?: number;
    definition?: string;
    createdAt?: string;
    modifiedAt?: string;
    dependencies?: string[];
    dependents?: string[];
    properties?: Record<string, any>;
}

export interface SchemaCache {
    connectionId: string;
    objects: DatabaseObject[];
    lastUpdated: Date;
    isStale: boolean;
}

export interface ExtendedConnectionInfo extends DotNetConnectionInfo {
    environment?: EnvironmentInfo;
    comparisonMetadata?: ConnectionComparisonMetadata;
}

export interface EnvironmentInfo {
    id: string;
    name: string;
    type: 'development' | 'staging' | 'production' | 'testing' | 'custom';
    description?: string;
    tags: string[];
    color?: string;
    priority: number;
}

export interface ConnectionComparisonMetadata {
    lastComparison?: Date;
    comparisonCount: number;
    averageComparisonTime: number;
    lastKnownSchemaHash?: string;
    driftScore?: number;
}

/**
 * SchemaOperations - Handles basic schema CRUD operations
 * Responsible for retrieving database objects, object details, and basic schema operations
 */
export class SchemaOperations {
    private connectionManager: ConnectionManager;
    private dotNetService: DotNetIntegrationService;
    private schemaCache: Map<string, SchemaCache> = new Map();
    private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

    constructor(connectionManager: ConnectionManager) {
        this.connectionManager = connectionManager;
        this.dotNetService = DotNetIntegrationService.getInstance();
    }

    /**
     * Get database objects for a connection with optional schema filtering
     */
    async getDatabaseObjects(connectionId: string, schemaFilter?: string): Promise<DatabaseObject[]> {
        const operationId = `schema-load-${connectionId}-${Date.now()}`;

        try {
            Logger.info('Getting database objects', 'getDatabaseObjects', { connectionId });

            // Start operation tracking
            const statusBarProvider = ExtensionInitializer.getStatusBarProvider();
            const operationSteps = [
                { id: 'connect', name: 'Connecting to database', status: 'pending' as const },
                { id: 'query', name: 'Querying schema objects', status: 'pending' as const },
                { id: 'process', name: 'Processing objects', status: 'pending' as const }
            ];

            const operationIndicator = statusBarProvider.startOperation(operationId, `Load Schema: ${connectionId}`, {
                message: 'Loading database schema...',
                cancellable: true,
                steps: operationSteps,
                estimatedDuration: 15000 // 15 seconds estimated
            });

            // Step 1: Connect
            statusBarProvider.updateOperationStep(operationId, 0, 'running', {
                message: 'Connecting to database...'
            });

            // Get connection and password directly
            const connection = this.connectionManager.getConnection(connectionId);
            if (!connection) {
                throw new Error(`Connection ${connectionId} not found`);
            }

            const password = await this.connectionManager.getConnectionPassword(connectionId);
            if (!password) {
                throw new Error('Password not found for connection');
            }

            // Step 2: Query
            statusBarProvider.updateOperationStep(operationId, 0, 'completed');
            statusBarProvider.updateOperationStep(operationId, 1, 'running', {
                message: 'Querying schema objects...'
            });

            // Encrypt password for secure transmission to DotNet service
            const securityManager = SecurityManager.getInstance();
            const encryptedPassword = await securityManager.encryptSensitiveData(
                password,
                DataClassification.RESTRICTED
            );

            // Create .NET connection info
            const dotNetConnection: DotNetConnectionInfo = {
                id: connection.id,
                name: connection.name,
                host: connection.host,
                port: connection.port,
                database: connection.database,
                username: connection.username,
                password: encryptedPassword, // 🔒 ENCRYPTED PASSWORD
                createdDate: new Date().toISOString()
            };

            // Get objects via .NET service
            const dotNetObjects = await this.dotNetService.browseSchema(dotNetConnection, schemaFilter || undefined);

            // Step 3: Process
            statusBarProvider.updateOperationStep(operationId, 1, 'completed');
            statusBarProvider.updateOperationStep(operationId, 2, 'running', {
                message: 'Processing objects...'
            });

            if (!dotNetObjects || dotNetObjects.length === 0) {
                Logger.warn('No objects found in schema', 'getDatabaseObjects', { connectionId });
                statusBarProvider.updateOperation(operationId, 'completed', {
                    message: 'Schema loaded (0 objects)'
                });
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

            // Complete operation
            statusBarProvider.updateOperationStep(operationId, 2, 'completed');
            statusBarProvider.updateOperation(operationId, 'completed', {
                message: `Schema loaded (${objects.length} objects)`
            });

            Logger.info('Database objects retrieved', 'getDatabaseObjects', {
                connectionId,
                objectCount: objects.length
            });

            return objects;
        } catch (error) {
            // Mark operation as failed
            const statusBarProvider = ExtensionInitializer.getStatusBarProvider();
            statusBarProvider.updateOperation(operationId, 'failed', {
                message: `Schema load failed: ${(error as Error).message}`
            });

            Logger.error('Failed to get database objects', error as Error);
            throw error;
        }
    }

    /**
     * Get detailed information about a specific database object
     */
    async getObjectDetails(connectionId: string, objectType: string, schema: string, objectName: string): Promise<any> {
        try {
            Logger.info('Getting object details', 'getObjectDetails', { connectionId, objectType, schema, objectName });

            // Get connection and password directly
            const connection = this.connectionManager.getConnection(connectionId);
            if (!connection) {
                throw new Error(`Connection ${connectionId} not found`);
            }

            const password = await this.connectionManager.getConnectionPassword(connectionId);
            if (!password) {
                throw new Error('Password not found for connection');
            }

            // Encrypt password for secure transmission to DotNet service
            const securityManager = SecurityManager.getInstance();
            const encryptedPassword = await securityManager.encryptSensitiveData(
                password,
                DataClassification.RESTRICTED
            );

            // Create extended connection info with environment support
            const extendedConnection: ExtendedConnectionInfo = {
                id: connection.id,
                name: connection.name,
                host: connection.host,
                port: connection.port,
                database: connection.database,
                username: connection.username,
                password: encryptedPassword, // 🔒 ENCRYPTED PASSWORD
                createdDate: new Date().toISOString(),
                comparisonMetadata: {
                    comparisonCount: 0,
                    averageComparisonTime: 0
                }
            };

            // Convert to DotNetConnectionInfo for compatibility (password is already encrypted)
            const dotNetConnection: DotNetConnectionInfo = {
                id: extendedConnection.id,
                name: extendedConnection.name,
                host: extendedConnection.host,
                port: extendedConnection.port,
                database: extendedConnection.database,
                username: extendedConnection.username,
                password: extendedConnection.password, // Already encrypted
                createdDate: extendedConnection.createdDate
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

            Logger.info('Object details retrieved', 'getObjectDetails', {
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

    /**
     * Get database objects with caching for improved performance
     */
    async getDatabaseObjectsWithCache(connectionId: string, schemaFilter?: string): Promise<DatabaseObject[]> {
        const cacheKey = `${connectionId}:${schemaFilter || 'all'}`;

        // Check cache first
        const cached = this.schemaCache.get(cacheKey);
        if (cached && !this.isCacheStale(cached)) {
            Logger.debug('Returning cached schema objects', 'getDatabaseObjectsWithCache', {
                connectionId,
                objectCount: cached.objects.length
            });
            return cached.objects;
        }

        // Fetch fresh data
        const objects = await this.getDatabaseObjects(connectionId, schemaFilter);

        // Update cache
        this.schemaCache.set(cacheKey, {
            connectionId,
            objects,
            lastUpdated: new Date(),
            isStale: false
        });

        return objects;
    }

    /**
     * Clear the schema cache for a specific connection or all connections
     */
    clearSchemaCache(connectionId?: string): void {
        if (connectionId) {
            // Clear cache for specific connection
            for (const [key] of this.schemaCache) {
                if (key.startsWith(connectionId + ':')) {
                    this.schemaCache.delete(key);
                }
            }
            Logger.debug('Schema cache cleared for connection', 'clearSchemaCache', { connectionId });
        } else {
            // Clear all cache
            this.schemaCache.clear();
            Logger.debug('All schema cache cleared', 'clearSchemaCache');
        }
    }

    /**
     * Get cache statistics for monitoring
     */
    getCacheStats(): { size: number; entries: string[] } {
        return {
            size: this.schemaCache.size,
            entries: Array.from(this.schemaCache.keys())
        };
    }

    /**
     * Map .NET object type to local type
     */
    private mapDotNetTypeToLocal(dotNetType: string): string {
        const typeMap: { [key: string]: string; } = {
            'table': 'table', 'view': 'view', 'function': 'function',
            'procedure': 'procedure', 'sequence': 'sequence', 'type': 'type',
            'domain': 'domain', 'index': 'index', 'trigger': 'trigger',
            'constraint': 'constraint', 'column': 'column', 'schema': 'schema'
        };
        return typeMap[dotNetType.toLowerCase()] || 'unknown';
    }

    /**
     * Check if cache entry is stale
     */
    private isCacheStale(cache: SchemaCache): boolean {
        const age = Date.now() - cache.lastUpdated.getTime();
        return age > this.CACHE_DURATION;
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        this.schemaCache.clear();
        Logger.info('SchemaOperations disposed', 'dispose');
    }
}