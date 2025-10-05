import { ConnectionManager } from './ConnectionManager';
import { Logger } from '../utils/Logger';
import { DotNetIntegrationService, DotNetConnectionInfo } from '../services/DotNetIntegrationService';

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

export interface SchemaComparisonOptions {
    mode: 'strict' | 'lenient';
    ignoreSchemas?: string[];
    objectTypes?: string[];
    includeSystemObjects?: boolean;
}

export class SchemaManager {
    private connectionManager: ConnectionManager;
    private dotNetService: DotNetIntegrationService;
    private schemaCache: Map<string, SchemaCache> = new Map();
    private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

    constructor(connectionManager: ConnectionManager) {
        this.connectionManager = connectionManager;
        this.dotNetService = DotNetIntegrationService.getInstance();
    }

    async getDatabaseObjects(connectionId: string, schemaFilter?: string): Promise<DatabaseObject[]> {
        try {
            Logger.info('Getting database objects', 'getDatabaseObjects', { connectionId });

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
                Logger.warn('No objects found in schema', 'getDatabaseObjects', { connectionId });
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

            Logger.info('Database objects retrieved', 'getDatabaseObjects', {
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

    private mapDotNetTypeToLocal(dotNetType: string): string {
        const typeMap: { [key: string]: string; } = {
            'table': 'table', 'view': 'view', 'function': 'function',
            'procedure': 'procedure', 'sequence': 'sequence', 'type': 'type',
            'domain': 'domain', 'index': 'index', 'trigger': 'trigger',
            'constraint': 'constraint', 'column': 'column', 'schema': 'schema'
        };
        return typeMap[dotNetType.toLowerCase()] || 'unknown';
    }

    // Enhanced schema operations with caching
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

    private isCacheStale(cache: SchemaCache): boolean {
        const age = Date.now() - cache.lastUpdated.getTime();
        return age > this.CACHE_DURATION;
    }

    async refreshSchemaCache(connectionId: string): Promise<void> {
        Logger.info('Refreshing schema cache', 'refreshSchemaCache', { connectionId });

        // Clear all cache entries for this connection
        for (const [key, cache] of Array.from(this.schemaCache.entries())) {
            if (cache.connectionId === connectionId) {
                this.schemaCache.delete(key);
            }
        }

        // Force refresh by calling getDatabaseObjects
        await this.getDatabaseObjects(connectionId);
    }

    async compareSchemas(
        sourceConnectionId: string,
        targetConnectionId: string,
        options: SchemaComparisonOptions = { mode: 'strict' }
    ): Promise<SchemaComparisonResult> {
        try {
            Logger.info('Comparing schemas', 'compareSchemas', {
                sourceConnectionId,
                targetConnectionId,
                mode: options.mode
            });

            // Get objects from both connections
            const [sourceObjects, targetObjects] = await Promise.all([
                this.getDatabaseObjectsWithCache(sourceConnectionId),
                this.getDatabaseObjectsWithCache(targetConnectionId)
            ]);

            // Filter objects based on options
            const filteredSource = this.filterObjects(sourceObjects, options);
            const filteredTarget = this.filterObjects(targetObjects, options);

            // Perform comparison
            const differences = this.compareObjectArrays(filteredSource, filteredTarget, options.mode);

            const result: SchemaComparisonResult = {
                comparisonId: this.generateId(),
                sourceConnectionId,
                targetConnectionId,
                sourceObjectCount: filteredSource.length,
                targetObjectCount: filteredTarget.length,
                differences,
                comparisonMode: options.mode,
                createdAt: new Date(),
                executionTime: Date.now() - Date.now() // Will be updated when comparison completes
            };

            Logger.info('Schema comparison completed', 'compareSchemas', {
                comparisonId: result.comparisonId,
                differenceCount: differences.length
            });

            return result;
        } catch (error) {
            Logger.error('Schema comparison failed', error as Error);
            throw error;
        }
    }

    private filterObjects(objects: DatabaseObject[], options: SchemaComparisonOptions): DatabaseObject[] {
        let filtered = objects;

        // Filter by schemas to ignore
        if (options.ignoreSchemas && options.ignoreSchemas.length > 0) {
            filtered = filtered.filter(obj => !options.ignoreSchemas!.includes(obj.schema));
        }

        // Filter by object types
        if (options.objectTypes && options.objectTypes.length > 0) {
            filtered = filtered.filter(obj => options.objectTypes!.includes(obj.type));
        }

        // Filter system objects
        if (!options.includeSystemObjects) {
            const systemSchemas = ['information_schema', 'pg_catalog', 'pg_toast'];
            filtered = filtered.filter(obj => !systemSchemas.includes(obj.schema));
        }

        return filtered;
    }

    private compareObjectArrays(
        source: DatabaseObject[],
        target: DatabaseObject[],
        mode: 'strict' | 'lenient'
    ): SchemaDifference[] {
        const differences: SchemaDifference[] = [];

        // Create lookup maps for efficient comparison
        const sourceMap = new Map<string, DatabaseObject>();
        const targetMap = new Map<string, DatabaseObject>();

        source.forEach(obj => {
            const key = `${obj.type}:${obj.schema}:${obj.name}`;
            sourceMap.set(key, obj);
        });

        target.forEach(obj => {
            const key = `${obj.type}:${obj.schema}:${obj.name}`;
            targetMap.set(key, obj);
        });

        // Find added, removed, and modified objects
        for (const [key, sourceObj] of Array.from(sourceMap)) {
            const targetObj = targetMap.get(key);

            if (!targetObj) {
                differences.push({
                    type: 'Removed',
                    objectType: sourceObj.type,
                    objectName: sourceObj.name,
                    schema: sourceObj.schema,
                    sourceDefinition: sourceObj.definition || undefined,
                    differenceDetails: ['Object exists in source but not in target']
                });
            } else if (this.objectsDiffer(sourceObj, targetObj, mode)) {
                differences.push({
                    type: 'Modified',
                    objectType: sourceObj.type,
                    objectName: sourceObj.name,
                    schema: sourceObj.schema,
                    sourceDefinition: sourceObj.definition || undefined,
                    targetDefinition: targetObj.definition || undefined,
                    differenceDetails: this.getDifferenceDetails(sourceObj, targetObj, mode)
                });
            }
        }

        // Find added objects
        for (const [key, targetObj] of Array.from(targetMap)) {
            if (!sourceMap.has(key)) {
                differences.push({
                    type: 'Added',
                    objectType: targetObj.type,
                    objectName: targetObj.name,
                    schema: targetObj.schema,
                    targetDefinition: targetObj.definition || undefined,
                    differenceDetails: ['Object exists in target but not in source']
                });
            }
        }

        return differences;
    }

    private objectsDiffer(source: DatabaseObject, target: DatabaseObject, mode: 'strict' | 'lenient'): boolean {
        if (mode === 'strict') {
            return source.definition !== target.definition ||
                source.owner !== target.owner ||
                source.sizeInBytes !== target.sizeInBytes;
        } else {
            // Lenient mode: ignore formatting and whitespace differences
            const sourceDef = this.normalizeDefinition(source.definition || '');
            const targetDef = this.normalizeDefinition(target.definition || '');
            return sourceDef !== targetDef;
        }
    }

    private normalizeDefinition(definition: string): string {
        return definition
            .replace(/\s+/g, ' ') // Normalize whitespace
            .replace(/;\s*$/, '') // Remove trailing semicolon
            .trim()
            .toLowerCase();
    }

    private getDifferenceDetails(
        source: DatabaseObject,
        target: DatabaseObject,
        _mode: 'strict' | 'lenient'
    ): string[] {
        const details: string[] = [];

        if (source.definition !== target.definition) {
            details.push('Definition differs');
        }
        if (source.owner !== target.owner) {
            details.push(`Owner differs: ${source.owner} vs ${target.owner}`);
        }
        if (source.sizeInBytes !== target.sizeInBytes) {
            details.push(`Size differs: ${source.sizeInBytes} vs ${target.sizeInBytes} bytes`);
        }

        return details;
    }

    async getObjectDependencies(connectionId: string, objectType: string, schema: string, objectName: string): Promise<string[]> {
        try {
            const objects = await this.getDatabaseObjectsWithCache(connectionId);
            const targetObject = objects.find(obj =>
                obj.type === objectType &&
                obj.schema === schema &&
                obj.name === objectName
            );

            if (!targetObject) {
                return [];
            }

            // Simple dependency analysis based on object relationships
            const dependencies: string[] = [];

            switch (objectType) {
                case 'table':
                    // Find foreign key constraints and views that depend on this table
                    const dependentViews = objects.filter(obj =>
                        obj.type === 'view' &&
                        obj.definition &&
                        obj.definition.toLowerCase().includes(objectName.toLowerCase())
                    );
                    dependencies.push(...dependentViews.map(v => `${v.type}:${v.schema}.${v.name}`));
                    break;

                case 'function':
                case 'procedure':
                    // Find objects that reference this function
                    const dependentObjects = objects.filter(obj =>
                        obj.definition &&
                        obj.definition.toLowerCase().includes(objectName.toLowerCase())
                    );
                    dependencies.push(...dependentObjects.map(o => `${o.type}:${o.schema}.${o.name}`));
                    break;
            }

            return dependencies;
        } catch (error) {
            Logger.error('Failed to get object dependencies', error as Error);
            return [];
        }
    }

    async searchObjects(connectionId: string, searchTerm: string, objectTypes?: string[]): Promise<DatabaseObject[]> {
        try {
            const objects = await this.getDatabaseObjectsWithCache(connectionId);

            const filtered = objects.filter(obj => {
                // Filter by object types if specified
                if (objectTypes && objectTypes.length > 0 && !objectTypes.includes(obj.type)) {
                    return false;
                }

                // Search in name, schema, or definition
                const searchLower = searchTerm.toLowerCase();
                return obj.name.toLowerCase().includes(searchLower) ||
                    obj.schema.toLowerCase().includes(searchLower) ||
                    (obj.definition && obj.definition.toLowerCase().includes(searchLower));
            });

            Logger.info('Object search completed', 'searchObjects', {
                connectionId,
                searchTerm,
                resultCount: filtered.length
            });

            return filtered;
        } catch (error) {
            Logger.error('Object search failed', error as Error);
            throw error;
        }
    }

    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    async dispose(): Promise<void> {
        Logger.info('Disposing SchemaManager');
        this.schemaCache.clear();
    }
}

export interface SchemaComparisonResult {
    comparisonId: string;
    sourceConnectionId: string;
    targetConnectionId: string;
    sourceObjectCount: number;
    targetObjectCount: number;
    differences: SchemaDifference[];
    comparisonMode: 'strict' | 'lenient';
    createdAt: Date;
    executionTime: number;
}

export interface SchemaDifference {
    type: 'Added' | 'Removed' | 'Modified';
    objectType: string;
    objectName: string;
    schema: string;
    sourceDefinition?: string | undefined;
    targetDefinition?: string | undefined;
    differenceDetails: string[];
}