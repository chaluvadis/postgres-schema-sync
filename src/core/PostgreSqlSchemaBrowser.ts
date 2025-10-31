import { Logger } from '@/utils/Logger';
import { PerformanceMonitor } from '@/services/PerformanceMonitor';
import { PostgreSqlConnectionManager, ConnectionInfo, ConnectionHandle } from './PostgreSqlConnectionManager';

export interface DatabaseObject {
  id: string;
  name: string;
  schema: string;
  type: ObjectType;
  database: string;
  owner: string;
  sizeInBytes?: number;
  definition: string;
  properties: Record<string, any>;
  createdAt: Date;
  modifiedAt?: Date;
  dependencies: string[];
}

export interface DatabaseObjectDetails {
  name: string;
  type: ObjectType;
  schema: string;
  database: string;
  columns: ColumnInfo[];
  constraints: ConstraintInfo[];
  indexes: IndexInfo[];
  triggers: TriggerInfo[];
  additionalInfo: Record<string, any>;
}

export interface ColumnInfo {
  name: string;
  dataType: string;
  isNullable: boolean;
  defaultValue?: string;
  maxLength?: number;
  precision?: number;
  scale?: number;
}

export interface ConstraintInfo {
  name: string;
  type: string;
  columns: string[];
  checkClause?: string;
  references?: string;
}

export interface IndexInfo {
  name: string;
  columns: string[];
  isUnique: boolean;
  isPrimary: boolean;
  condition?: string;
}

export interface TriggerInfo {
  name: string;
  event: string;
  timing: string;
  function: string;
  condition?: string;
}

export enum ObjectType {
  Table = 'Table',
  View = 'View',
  Function = 'Function',
  Procedure = 'Procedure',
  Sequence = 'Sequence',
  Type = 'Type',
  Domain = 'Domain',
  Collation = 'Collation',
  Extension = 'Extension',
  Role = 'Role',
  Tablespace = 'Tablespace',
  Schema = 'Schema',
  Index = 'Index',
  Trigger = 'Trigger',
  Constraint = 'Constraint'
}

export class PostgreSqlSchemaBrowser {
  private readonly connectionManager = PostgreSqlConnectionManager.getInstance();
  private readonly performanceMonitor = PerformanceMonitor.getInstance();

  async getDatabaseObjectsAsync(
    connectionInfo: ConnectionInfo,
    schemaFilter?: string,
    cancellationToken?: AbortSignal
  ): Promise<DatabaseObject[]> {
    const operationId = this.performanceMonitor.startOperation('getDatabaseObjects', {
      connectionId: connectionInfo.id,
      schemaFilter
    });

    const handle = await this.connectionManager.createConnection(connectionInfo, cancellationToken);
    try {
      const objects: DatabaseObject[] = [];

      // Get all object types with complete data
      const tables = await this.getTablesAsync(handle, schemaFilter, cancellationToken, connectionInfo);
      const views = await this.getViewsAsync(handle, schemaFilter, cancellationToken, connectionInfo);
      const functions = await this.getFunctionsAsync(handle, schemaFilter, cancellationToken, connectionInfo);
      const sequences = await this.getSequencesAsync(handle, schemaFilter, cancellationToken, connectionInfo);
      const types = await this.getTypesAsync(handle, schemaFilter, cancellationToken, connectionInfo);
      const indexes = await this.getIndexesAsync(handle, schemaFilter, cancellationToken, connectionInfo);
      const triggers = await this.getTriggersAsync(handle, schemaFilter, cancellationToken, connectionInfo);
      const constraints = await this.getConstraintsAsync(handle, schemaFilter, cancellationToken, connectionInfo);

      objects.push(...tables, ...views, ...functions, ...sequences, ...types, ...indexes, ...triggers, ...constraints);

      Logger.info('Retrieved database objects', 'getDatabaseObjects', {
        connectionId: connectionInfo.id,
        objectCount: objects.length
      });

      this.performanceMonitor.endOperation(operationId, true);
      return objects;
    } catch (error) {
      this.performanceMonitor.endOperation(operationId, false, (error as Error).message);
      Logger.error('Failed to get database objects', error as Error);
      throw error;
    } finally {
      handle.release();
    }
  }

  private async getTablesAsync(
    handle: ConnectionHandle,
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

    return result.rows.map(row => ({
      id: `${row.table_schema}.${row.table_name}`,
      name: row.table_name,
      schema: row.table_schema,
      type: ObjectType.Table,
      database: connectionInfo.database,
      owner: row.owner,
      sizeInBytes: parseInt(row.size_bytes) || undefined,
      definition: `CREATE TABLE "${row.table_schema}"."${row.table_name}" (...);`, // Simplified
      properties: {
        description: row.description,
        estimatedRowCount: parseFloat(row.estimated_row_count) || 0
      },
      createdAt: new Date(),
      modifiedAt: this.getObjectModificationTime(handle.connection, 'pg_class', row.table_schema, row.table_name),
      dependencies: []
    }));
  }

  private async getViewsAsync(
    handle: ConnectionHandle,
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

    return result.rows.map(row => ({
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
    handle: ConnectionHandle,
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

    return result.rows.map(row => ({
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
    handle: ConnectionHandle,
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

    return result.rows.map(row => ({
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
    handle: ConnectionHandle,
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

    return result.rows.map(row => ({
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
    handle: ConnectionHandle,
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

    return result.rows.map(row => ({
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
    handle: ConnectionHandle,
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

    return result.rows.map(row => ({
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
    handle: ConnectionHandle,
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

    return result.rows.map(row => ({
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
  private getObjectModificationTime(connection: any, catalogTable: string, schema: string, name: string): Date | undefined {
    try {
      // PostgreSQL doesn't have a direct modification time for objects, but we can use the last DDL time from event triggers
      // For now, return undefined as PostgreSQL doesn't easily track this
      return undefined;
    } catch (error) {
      Logger.warn('Failed to get modification time', 'getObjectModificationTime', { error: (error as Error).message });
      return undefined;
    }
  }
}