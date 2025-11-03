import { ConnectionManager } from "../ConnectionManager";
import { Logger } from "@/utils/Logger";
import {
  PostgreSqlConnectionManager,
  ConnectionInfo,
} from "@/core/PostgreSqlConnectionManager";
import { ExtensionInitializer } from "@/utils/ExtensionInitializer";
import { DatabaseObject, ObjectType } from "@/core/PostgreSqlSchemaBrowser";

export interface SchemaCache {
  connectionId: string;
  objects: DatabaseObject[];
  lastUpdated: Date;
  isStale: boolean;
}

export interface ExtendedConnectionInfo extends ConnectionInfo {
  environment?: EnvironmentInfo;
  comparisonMetadata?: ConnectionComparisonMetadata;
}

export interface EnvironmentInfo {
  id: string;
  name: string;
  type: "development" | "staging" | "production" | "testing" | "custom";
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
  private dotNetService: PostgreSqlConnectionManager;
  private schemaCache: Map<string, SchemaCache> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  constructor(connectionManager: ConnectionManager) {
    this.connectionManager = connectionManager;
    this.dotNetService = PostgreSqlConnectionManager.getInstance();
  }

  /**
   * Get database objects for a connection with optional schema filtering
   */
  async getDatabaseObjects(
    connectionId: string,
    schemaFilter?: string
  ): Promise<DatabaseObject[]> {
    const operationId = `schema-load-${connectionId}-${Date.now()}`;

    try {
      Logger.info("Getting database objects", "getDatabaseObjects", {
        connectionId,
      });

      // Start operation tracking
      const statusBarProvider = ExtensionInitializer.getStatusBarProvider();

      // Step 1: Connect
      statusBarProvider.updateOperationStep(operationId, 0, "running", {
        message: "Connecting to database...",
      });

      // Get connection and password directly
      const connection = this.connectionManager.getConnection(connectionId);
      if (!connection) {
        throw new Error(`Connection ${connectionId} not found`);
      }

      const password = await this.connectionManager.getConnectionPassword(
        connectionId
      );
      if (!password) {
        throw new Error("Password not found for connection");
      }

      // Step 2: Query
      statusBarProvider.updateOperationStep(operationId, 0, "completed");
      statusBarProvider.updateOperationStep(operationId, 1, "running", {
        message: "Querying schema objects...",
      });

      // Create connection info using ConnectionService for consistency
      const { ConnectionServiceFactory } = await import("@/utils/ConnectionServiceFactory");
      const factory = ConnectionServiceFactory.getInstance();
      const connectionService = factory.createConnectionService(this.connectionManager);
      const dotNetConnection = await connectionService.toDotNetConnection(connectionId);
      if (!dotNetConnection) {
        throw new Error("Failed to create connection info");
      }

      // Get objects via native service - use PostgreSqlSchemaBrowser
      const schemaBrowser = new (await import("@/core/PostgreSqlSchemaBrowser")).PostgreSqlSchemaBrowser();
      const dotNetObjects = await schemaBrowser.getDatabaseObjectsAsync(
        dotNetConnection,
        schemaFilter || undefined
      );

      // Step 3: Process
      statusBarProvider.updateOperationStep(operationId, 1, "completed");
      statusBarProvider.updateOperationStep(operationId, 2, "running", {
        message: "Processing objects...",
      });

      if (!dotNetObjects || dotNetObjects.length === 0) {
        Logger.warn("No objects found in schema", "getDatabaseObjects", {
          connectionId,
        });
        statusBarProvider.updateOperation(operationId, "completed", {
          message: "Schema loaded (0 objects)",
        });
        return [];
      }

      // Convert from .NET format to local format preserving ALL details
      const objects: DatabaseObject[] = dotNetObjects.map((dotNetObj) => ({
        id: dotNetObj.id,
        name: dotNetObj.name,
        type: this.mapDotNetTypeToLocal(dotNetObj.type) as ObjectType,
        schema: dotNetObj.schema,
        database: dotNetObj.database,
        owner: dotNetObj.owner,
        sizeInBytes: dotNetObj.sizeInBytes,
        definition: dotNetObj.definition,
        properties: dotNetObj.properties || {},
        createdAt: dotNetObj.createdAt,
        modifiedAt: dotNetObj.modifiedAt,
        dependencies: dotNetObj.dependencies
      }));

      // Complete operation
      statusBarProvider.updateOperationStep(operationId, 2, "completed");
      statusBarProvider.updateOperation(operationId, "completed", {
        message: `Schema loaded (${objects.length} objects)`,
      });

      Logger.info("Database objects retrieved", "getDatabaseObjects", {
        connectionId,
        objectCount: objects.length,
      });

      return objects;
    } catch (error) {
      // Mark operation as failed
      const statusBarProvider = ExtensionInitializer.getStatusBarProvider();
      statusBarProvider.updateOperation(operationId, "failed", {
        message: `Schema load failed: ${(error as Error).message}`,
      });

      Logger.error("Failed to get database objects", error as Error);
      throw error;
    }
  }

  /**
   * Get detailed information about a specific database object
   */
  async getObjectDetails(
    connectionId: string,
    objectType: string,
    schema: string,
    objectName: string
  ): Promise<any> {
    try {
      Logger.info("Getting object details", "getObjectDetails", {
        connectionId,
        objectType,
        schema,
        objectName,
      });

      // Use ConnectionService for consistent connection handling
      const { ConnectionServiceFactory } = await import("@/utils/ConnectionServiceFactory");
      const factory = ConnectionServiceFactory.getInstance();
      const connectionService = factory.createConnectionService(this.connectionManager);
      const dotNetConnection = await connectionService.toDotNetConnection(connectionId);
      if (!dotNetConnection) {
        throw new Error("Failed to create connection info");
      }

      // Get object details via native service - use PostgreSqlSchemaBrowser
      const schemaBrowser = new (await import("@/core/PostgreSqlSchemaBrowser")).PostgreSqlSchemaBrowser();
      const allObjects = await schemaBrowser.getDatabaseObjectsAsync(dotNetConnection);
      const object = allObjects.find(obj => obj.schema === schema && obj.name === objectName && obj.type === objectType);
      const details = object ? {
        name: object.name,
        type: object.type,
        schema: object.schema,
        database: object.database,
        owner: object.owner,
        sizeInBytes: object.sizeInBytes,
        definition: object.definition,
        createdAt: object.createdAt,
        modifiedAt: object.modifiedAt,
        properties: object.properties || {}
      } : null;

      if (!details) {
        throw new Error("Object details returned null or undefined");
      }

      Logger.info("Object details retrieved", "getObjectDetails", {
        connectionId,
        objectType,
        objectName,
      });

      return details;
    } catch (error) {
      Logger.error("Failed to get object details", error as Error);
      throw error;
    }
  }

  /**
   * Get database objects with caching for improved performance
   */
  async getDatabaseObjectsWithCache(
    connectionId: string,
    schemaFilter?: string
  ): Promise<DatabaseObject[]> {
    const cacheKey = `${connectionId}:${schemaFilter || "all"}`;

    // Check cache first
    const cached = this.schemaCache.get(cacheKey);
    if (cached && !this.isCacheStale(cached)) {
      Logger.debug(
        "Returning cached schema objects",
        "getDatabaseObjectsWithCache",
        {
          connectionId,
          objectCount: cached.objects.length,
        }
      );
      return cached.objects;
    }

    // Fetch fresh data
    const objects = await this.getDatabaseObjects(connectionId, schemaFilter);

    // Update cache
    this.schemaCache.set(cacheKey, {
      connectionId,
      objects,
      lastUpdated: new Date(),
      isStale: false,
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
        if (key.startsWith(connectionId + ":")) {
          this.schemaCache.delete(key);
        }
      }
      Logger.debug("Schema cache cleared for connection", "clearSchemaCache", {
        connectionId,
      });
    } else {
      // Clear all cache
      this.schemaCache.clear();
      Logger.debug("All schema cache cleared", "clearSchemaCache");
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats(): { size: number; entries: string[]; } {
    return {
      size: this.schemaCache.size,
      entries: Array.from(this.schemaCache.keys()),
    };
  }

  /**
   * Map .NET object type to local type
   */
  private mapDotNetTypeToLocal(dotNetType: string): string {
    const typeMap: { [key: string]: string; } = {
      table: "table",
      view: "view",
      function: "function",
      procedure: "procedure",
      sequence: "sequence",
      type: "type",
      domain: "domain",
      index: "index",
      trigger: "trigger",
      constraint: "constraint",
      column: "column",
      schema: "schema",
    };
    return typeMap[dotNetType.toLowerCase()] || "unknown";
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
    Logger.info("SchemaOperations disposed", "dispose");
  }
}
