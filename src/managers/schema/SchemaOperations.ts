import { ConnectionManager } from "../ConnectionManager";
import { Logger } from "@/utils/Logger";
import {
  PostgreSqlConnectionManager,
  ConnectionInfo,
} from "@/core/PostgreSqlConnectionManager";
import { ExtensionInitializer } from "@/utils/ExtensionInitializer";
import { DatabaseObject, ObjectType } from "@/core/PostgreSqlSchemaBrowser";

// Consolidated schema browser functionality from PostgreSqlSchemaBrowser

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

      // Create connection info directly using ConnectionManager
      const dotNetConnection = await this.connectionManager.toDotNetConnection(connectionId);
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

      // Create connection info directly using ConnectionManager
      const dotNetConnection = await this.connectionManager.toDotNetConnection(connectionId);
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
   * Get database objects using consolidated schema browser functionality
   */
  async getDatabaseObjectsFromConnection(
    connectionId: string,
    schemaFilter?: string
  ): Promise<DatabaseObject[]> {
    try {
      Logger.info("Getting database objects from connection", "getDatabaseObjectsFromConnection", {
        connectionId,
        schemaFilter
      });

      const dotNetConnection = await this.connectionManager.toDotNetConnection(connectionId);
      if (!dotNetConnection) {
        throw new Error(`Failed to get connection info for ${connectionId}`);
      }

      const handle = await this.dotNetService.createConnection(dotNetConnection);
      try {
        const objects: DatabaseObject[] = [];

        // Get all object types with complete data
        const schemas = await this.getSchemasAsync(handle, schemaFilter, undefined, dotNetConnection);
        const tables = await this.getTablesAsync(handle, schemaFilter, undefined, dotNetConnection);
        const views = await this.getViewsAsync(handle, schemaFilter, undefined, dotNetConnection);
        const functions = await this.getFunctionsAsync(handle, schemaFilter, undefined, dotNetConnection);
        const sequences = await this.getSequencesAsync(handle, schemaFilter, undefined, dotNetConnection);
        const types = await this.getTypesAsync(handle, schemaFilter, undefined, dotNetConnection);
        const indexes = await this.getIndexesAsync(handle, schemaFilter, undefined, dotNetConnection);
        const triggers = await this.getTriggersAsync(handle, schemaFilter, undefined, dotNetConnection);
        const constraints = await this.getConstraintsAsync(handle, schemaFilter, undefined, dotNetConnection);

        objects.push(...schemas, ...tables, ...views, ...functions, ...sequences, ...types, ...indexes, ...triggers, ...constraints);

        Logger.info('Retrieved database objects from connection', 'getDatabaseObjectsFromConnection', {
          connectionId,
          objectCount: objects.length
        });

        return objects;
      } finally {
        handle.release();
      }
    } catch (error) {
      Logger.error('Failed to get database objects from connection', error as Error, 'getDatabaseObjectsFromConnection', {
        connectionId
      });
      throw error;
    }
  }

  private async getTablesAsync(
    handle: any,
    schemaFilter: string | undefined,
    cancellationToken: AbortSignal | undefined,
    connectionInfo: ConnectionInfo
  ): Promise<DatabaseObject[]> {
    const query = `
      SELECT
        c.relname AS table_name,
        n.nspname AS table_schema,
        pg_total_relation_size(c.oid) AS size_bytes,
        pg_get_userbyid(c.relowner) AS owner,
        obj_description(c.oid, 'pg_class') AS description,
        c.reltuples AS estimated_row_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r'
        AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
        AND ($1::text IS NULL OR n.nspname = $1)
      ORDER BY n.nspname, c.relname
    `;

    const result = await handle.connection.query(query, [schemaFilter]);

    return result.rows.map((row: any) => ({
      id: `${row.table_schema}.${row.table_name}`,
      name: row.table_name,
      schema: row.table_schema,
      type: ObjectType.Table,
      database: connectionInfo.database,
      owner: row.owner,
      sizeInBytes: parseInt(row.size_bytes) || undefined,
      definition: `CREATE TABLE "${row.table_schema}"."${row.table_name}" (...);`,
      properties: {
        description: row.description,
        estimatedRowCount: parseFloat(row.estimated_row_count) || 0
      },
      createdAt: new Date(),
      modifiedAt: undefined,
      dependencies: []
    }));
  }

  private async getViewsAsync(
    handle: any,
    schemaFilter: string | undefined,
    cancellationToken: AbortSignal | undefined,
    connectionInfo: ConnectionInfo
  ): Promise<DatabaseObject[]> {
    const query = `
      SELECT
        v.table_name,
        v.table_schema,
        v.view_definition,
        pg_get_userbyid(c.relowner) AS owner,
        obj_description(c.oid, 'pg_class') AS description
      FROM information_schema.views v
      JOIN pg_class c ON c.relname = v.table_name
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = v.table_schema
      WHERE v.table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
        AND ($1::text IS NULL OR v.table_schema = $1)
      ORDER BY v.table_schema, v.table_name
    `;

    const result = await handle.connection.query(query, [schemaFilter]);

    return result.rows.map((row: any) => ({
      id: `${row.table_schema}.${row.table_name}`,
      name: row.table_name,
      schema: row.table_schema,
      type: ObjectType.View,
      database: connectionInfo.database,
      owner: row.owner,
      definition: row.view_definition || '',
      properties: {
        description: row.description
      },
      createdAt: new Date(),
      modifiedAt: undefined,
      dependencies: []
    }));
  }

  private async getFunctionsAsync(
    handle: any,
    schemaFilter: string | undefined,
    cancellationToken: AbortSignal | undefined,
    connectionInfo: ConnectionInfo
  ): Promise<DatabaseObject[]> {
    const query = `
      SELECT
        p.proname AS function_name,
        n.nspname AS function_schema,
        pg_get_function_identity_arguments(p.oid) AS identity_arguments,
        pg_get_functiondef(p.oid) AS function_definition,
        pg_get_userbyid(p.proowner) AS owner,
        obj_description(p.oid) AS description
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE p.prokind = 'f'
        AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
        AND ($1::text IS NULL OR n.nspname = $1)
      ORDER BY n.nspname, p.proname
    `;

    const result = await handle.connection.query(query, [schemaFilter]);

    return result.rows.map((row: any) => ({
      id: `${row.function_schema}.${row.function_name}`,
      name: row.function_name,
      schema: row.function_schema,
      type: ObjectType.Function,
      database: connectionInfo.database,
      owner: row.owner,
      definition: row.function_definition || '',
      properties: {
        signature: row.identity_arguments,
        description: row.description
      },
      createdAt: new Date(),
      modifiedAt: undefined,
      dependencies: []
    }));
  }

  private async getSequencesAsync(
    handle: any,
    schemaFilter: string | undefined,
    cancellationToken: AbortSignal | undefined,
    connectionInfo: ConnectionInfo
  ): Promise<DatabaseObject[]> {
    const query = `
      SELECT
        c.relname as sequence_name,
        n.nspname as sequence_schema,
        pg_get_userbyid(c.relowner) AS owner,
        obj_description(c.oid, 'pg_class') as description
      FROM pg_class c
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE c.relkind = 'S'
        AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
        AND ($1::text IS NULL OR n.nspname = $1)
      ORDER BY n.nspname, c.relname
    `;

    const result = await handle.connection.query(query, [schemaFilter]);

    return result.rows.map((row: any) => ({
      id: `${row.sequence_schema}.${row.sequence_name}`,
      name: row.sequence_name,
      schema: row.sequence_schema,
      type: ObjectType.Sequence,
      database: connectionInfo.database,
      owner: row.owner,
      definition: `CREATE SEQUENCE "${row.sequence_schema}"."${row.sequence_name}";`,
      properties: {
        description: row.description
      },
      createdAt: new Date(),
      modifiedAt: undefined,
      dependencies: []
    }));
  }

  private async getTypesAsync(
    handle: any,
    schemaFilter: string | undefined,
    cancellationToken: AbortSignal | undefined,
    connectionInfo: ConnectionInfo
  ): Promise<DatabaseObject[]> {
    const query = `
      SELECT
        t.typname as type_name,
        n.nspname as type_schema,
        pg_get_userbyid(t.typowner) AS owner,
        obj_description(t.oid) as description
      FROM pg_type t
      JOIN pg_namespace n ON t.typnamespace = n.oid
      WHERE n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
        AND t.typtype IN ('c', 'd', 'e')
        AND ($1 IS NULL OR n.nspname = $1)
      ORDER BY n.nspname, t.typname
    `;

    const result = await handle.connection.query(query, [schemaFilter]);

    return result.rows.map((row: any) => ({
      id: `${row.type_schema}.${row.type_name}`,
      name: row.type_name,
      schema: row.type_schema,
      type: ObjectType.Type,
      database: connectionInfo.database,
      owner: row.owner,
      definition: `CREATE TYPE "${row.type_schema}"."${row.type_name}" (...);`,
      properties: {
        description: row.description
      },
      createdAt: new Date(),
      modifiedAt: undefined,
      dependencies: []
    }));
  }

  private async getIndexesAsync(
    handle: any,
    schemaFilter: string | undefined,
    cancellationToken: AbortSignal | undefined,
    connectionInfo: ConnectionInfo
  ): Promise<DatabaseObject[]> {
    const query = `
      SELECT
        c.relname as index_name,
        t.relname as table_name,
        n.nspname as index_schema,
        pg_get_userbyid(c.relowner) AS owner,
        obj_description(c.oid, 'pg_class') as description
      FROM pg_class c
      JOIN pg_index i ON c.oid = i.indexrelid
      JOIN pg_class t ON i.indrelid = t.oid
      JOIN pg_namespace n ON c.relnamespace = n.oid
      JOIN pg_namespace tn ON t.relnamespace = tn.oid
      WHERE c.relkind = 'i'
        AND tn.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
        AND ($1 IS NULL OR tn.nspname = $1)
      ORDER BY tn.nspname, t.relname, c.relname
    `;

    const result = await handle.connection.query(query, [schemaFilter]);

    return result.rows.map((row: any) => ({
      id: `${row.index_schema}.${row.index_name}`,
      name: row.index_name,
      schema: row.index_schema,
      type: ObjectType.Index,
      database: connectionInfo.database,
      owner: row.owner,
      definition: `CREATE INDEX "${row.index_name}" ON "${row.index_schema}"."${row.table_name}" (...);`,
      properties: {
        tableName: row.table_name,
        description: row.description
      },
      createdAt: new Date(),
      modifiedAt: undefined,
      dependencies: []
    }));
  }

  private async getTriggersAsync(
    handle: any,
    schemaFilter: string | undefined,
    cancellationToken: AbortSignal | undefined,
    connectionInfo: ConnectionInfo
  ): Promise<DatabaseObject[]> {
    const query = `
      SELECT
        t.tgname as trigger_name,
        c.relname as table_name,
        n.nspname as trigger_schema,
        pg_get_userbyid(t.tgowner) AS owner,
        obj_description(t.oid) as description
      FROM pg_trigger t
      JOIN pg_class c ON t.tgrelid = c.oid
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE NOT t.tgisinternal
        AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
        AND ($1 IS NULL OR n.nspname = $1)
      ORDER BY n.nspname, c.relname, t.tgname
    `;

    const result = await handle.connection.query(query, [schemaFilter]);

    return result.rows.map((row: any) => ({
      id: `${row.trigger_schema}.${row.trigger_name}`,
      name: row.trigger_name,
      schema: row.trigger_schema,
      type: ObjectType.Trigger,
      database: connectionInfo.database,
      owner: row.owner,
      definition: `CREATE TRIGGER "${row.trigger_name}" ...;`,
      properties: {
        tableName: row.table_name,
        description: row.description
      },
      createdAt: new Date(),
      modifiedAt: undefined,
      dependencies: []
    }));
  }

  private async getConstraintsAsync(
    handle: any,
    schemaFilter: string | undefined,
    cancellationToken: AbortSignal | undefined,
    connectionInfo: ConnectionInfo
  ): Promise<DatabaseObject[]> {
    const query = `
      SELECT
        c.conname as constraint_name,
        t.relname as table_name,
        n.nspname as constraint_schema,
        c.contype as constraint_type,
        pg_get_userbyid(c.conowner) AS owner,
        obj_description(c.oid) as description
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON t.relnamespace = n.oid
      WHERE n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
        AND ($1 IS NULL OR n.nspname = $1)
      ORDER BY n.nspname, t.relname, c.conname
    `;

    const result = await handle.connection.query(query, [schemaFilter]);

    return result.rows.map((row: any) => ({
      id: `${row.constraint_schema}.${row.constraint_name}`,
      name: row.constraint_name,
      schema: row.constraint_schema,
      type: ObjectType.Constraint,
      database: connectionInfo.database,
      owner: row.owner,
      definition: `ALTER TABLE "${row.constraint_schema}"."${row.table_name}" ADD CONSTRAINT "${row.constraint_name}" ...;`,
      properties: {
        tableName: row.table_name,
        constraintType: row.constraint_type,
        description: row.description
      },
      createdAt: new Date(),
      modifiedAt: undefined,
      dependencies: []
    }));
  }

  private async getSchemasAsync(
    handle: any,
    schemaFilter: string | undefined,
    cancellationToken: AbortSignal | undefined,
    connectionInfo: ConnectionInfo
  ): Promise<DatabaseObject[]> {
    const query = `
      SELECT
        n.nspname as schema_name,
        pg_get_userbyid(n.nspowner) AS owner,
        obj_description(n.oid) as description
      FROM pg_namespace n
      WHERE n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
        AND ($1 IS NULL OR n.nspname = $1)
      ORDER BY n.nspname
    `;

    const result = await handle.connection.query(query, [schemaFilter]);

    return result.rows.map((row: any) => ({
      id: row.schema_name,
      name: row.schema_name,
      schema: row.schema_name,
      type: ObjectType.Schema,
      database: connectionInfo.database,
      owner: row.owner,
      definition: `CREATE SCHEMA "${row.schema_name}";`,
      properties: {
        description: row.description
      },
      createdAt: new Date(),
      modifiedAt: undefined,
      dependencies: []
    }));
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.schemaCache.clear();
    Logger.info("SchemaOperations disposed", "dispose");
  }
}
