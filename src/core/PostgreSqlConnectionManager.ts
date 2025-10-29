import { Pool, Client, PoolClient } from 'pg';
import { Logger } from '@/utils/Logger';
import { PerformanceMonitor } from '@/services/PerformanceMonitor';

export interface ConnectionInfo {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  connectionTimeoutMillis?: number;
  query_timeout?: number;
  createdDate?: string;
}

export interface ConnectionHandle {
  connection: PoolClient;
  release: () => void;
}

// Native metadata interfaces to replace DotNet types
export interface NativeColumnMetadata {
  name: string;
  dataType: string;
  isNullable: boolean;
  defaultValue?: string;
  constraints: NativeConstraintMetadata[];
  statistics?: ColumnStatistics;
}

export interface NativeIndexMetadata {
  name: string;
  columnNames: string[];
  isUnique: boolean;
  statistics?: IndexStatistics;
}

export interface NativeConstraintMetadata {
  name: string;
  type: string;
  definition?: string;
  isEnabled: boolean;
  referencedTable?: string;
  referencedColumns?: string[];
}

export interface NativeViewMetadata {
  name: string;
  schema: string;
  definition: string;
  columns: ViewColumn[];
  dependencies: ViewDependency[];
  isMaterialized: boolean;
}

export interface ViewColumn {
  name: string;
  dataType: string;
}

export interface ViewDependency {
  type: "table" | "view" | "function";
  name: string;
  schema: string;
}

export interface NativeFunctionMetadata {
  name: string;
  schema: string;
  definition: string;
  language: string;
  returnType: string;
  parameters: FunctionParameter[];
}

export interface FunctionParameter {
  name: string;
  dataType: string;
  mode: "IN" | "OUT" | "INOUT";
}

export interface ColumnStatistics {
  distinctValues: number;
  nullCount: number;
  avgLength?: number;
  minValue?: any;
  maxValue?: any;
}

export interface IndexStatistics {
  sizeInBytes: number;
  indexScans: number;
  tuplesRead: number;
  tuplesFetched: number;
}

export class PostgreSqlConnectionManager {
  private static instance: PostgreSqlConnectionManager;
  private pools: Map<string, Pool> = new Map();
  private readonly performanceMonitor = PerformanceMonitor.getInstance();

  private constructor() {}

  static getInstance(): PostgreSqlConnectionManager {
    if (!PostgreSqlConnectionManager.instance) {
      PostgreSqlConnectionManager.instance = new PostgreSqlConnectionManager();
    }
    return PostgreSqlConnectionManager.instance;
  }

  async createConnection(connectionInfo: ConnectionInfo, cancellationToken?: AbortSignal): Promise<ConnectionHandle> {
    const operationId = this.performanceMonitor.startOperation('createConnection', {
      connectionId: connectionInfo.id,
      hostname: connectionInfo.host,
      database: connectionInfo.database
    });

    try {
      const pool = this.getOrCreatePool(connectionInfo);

      if (cancellationToken?.aborted) {
        throw new Error('Connection creation cancelled');
      }

      const client = await pool.connect();

      // Test the connection
      await client.query('SELECT 1');

      Logger.debug('Database connection established', 'createConnection', {
        connectionId: connectionInfo.id,
        database: connectionInfo.database
      });

      this.performanceMonitor.endOperation(operationId, true);

      return {
        connection: client,
        release: () => {
          client.release();
          Logger.debug('Database connection released', 'createConnection', {
            connectionId: connectionInfo.id
          });
        }
      };
    } catch (error) {
      this.performanceMonitor.endOperation(operationId, false, (error as Error).message);
      Logger.error('Failed to create database connection', error as Error, 'createConnection', {
        connectionId: connectionInfo.id,
        database: connectionInfo.database
      });
      throw error;
    }
  }

  async testConnection(connectionInfo: ConnectionInfo): Promise<boolean> {
    try {
      const handle = await this.createConnection(connectionInfo);
      handle.release();
      Logger.info('Connection test successful', 'testConnection', {
        connectionId: connectionInfo.id,
        database: connectionInfo.database
      });
      return true;
    } catch (error) {
      Logger.error('Connection test failed', error as Error, 'testConnection', {
        connectionId: connectionInfo.id,
        database: connectionInfo.database
      });
      return false;
    }
  }

  private getOrCreatePool(connectionInfo: ConnectionInfo): Pool {
    const poolKey = `${connectionInfo.host}:${connectionInfo.port}:${connectionInfo.database}:${connectionInfo.username}`;

    if (this.pools.has(poolKey)) {
      return this.pools.get(poolKey)!;
    }

    const pool = new Pool({
      host: connectionInfo.host,
      port: connectionInfo.port,
      database: connectionInfo.database,
      user: connectionInfo.username,
      password: connectionInfo.password,
      ssl: connectionInfo.ssl ?? false,
      connectionTimeoutMillis: connectionInfo.connectionTimeoutMillis ?? 10000,
      query_timeout: connectionInfo.query_timeout ?? 30000,
      max: 10, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    });

    // Handle pool events
    pool.on('connect', (client) => {
      Logger.debug('New client connected to pool', 'pool', { poolKey });
    });

    pool.on('error', (err, client) => {
      Logger.error('Unexpected error on idle client', err, 'pool', { poolKey });
    });

    this.pools.set(poolKey, pool);
    Logger.info('Created new connection pool', 'pool', { poolKey });

    return pool;
  }

  async closeAllPools(): Promise<void> {
    Logger.info('Closing all connection pools', 'closeAllPools');

    const closePromises = Array.from(this.pools.values()).map(pool =>
      pool.end().catch(error => {
        Logger.error('Error closing pool', error, 'closeAllPools');
      })
    );

    await Promise.all(closePromises);
    this.pools.clear();

    Logger.info('All connection pools closed', 'closeAllPools');
  }

  getPoolStats(): { [key: string]: { totalCount: number; idleCount: number; waitingCount: number } } {
    const stats: { [key: string]: { totalCount: number; idleCount: number; waitingCount: number } } = {};

    for (const [key, pool] of this.pools) {
      stats[key] = {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount
      };
    }

    return stats;
  }

  // Native metadata extraction methods to replace DotNet services
  async extractColumnMetadata(connection: ConnectionInfo, tableName: string, schema: string): Promise<NativeColumnMetadata[]> {
    const handle = await this.createConnection(connection);
    try {
      const query = `
        SELECT
          c.column_name as name,
          c.data_type as data_type,
          c.is_nullable = 'YES' as is_nullable,
          c.column_default as default_value,
          c.character_maximum_length,
          c.numeric_precision,
          c.numeric_scale
        FROM information_schema.columns c
        WHERE c.table_schema = $1 AND c.table_name = $2
        ORDER BY c.ordinal_position
      `;

      const result = await handle.connection.query(query, [schema, tableName]);
      const columns: NativeColumnMetadata[] = [];

      for (const row of result.rows) {
        const column: NativeColumnMetadata = {
          name: row.name,
          dataType: row.data_type,
          isNullable: row.is_nullable,
          defaultValue: row.default_value,
          constraints: [],
          statistics: undefined
        };
        columns.push(column);
      }

      // Get constraints for each column
      for (const column of columns) {
        column.constraints = await this.getColumnConstraints(handle.connection, tableName, schema, column.name);
      }

      return columns;
    } finally {
      handle.release();
    }
  }

  async extractIndexMetadata(connection: ConnectionInfo, tableName: string, schema: string): Promise<NativeIndexMetadata[]> {
    const handle = await this.createConnection(connection);
    try {
      const query = `
        SELECT
          i.indexname as name,
          i.indexdef,
          array_agg(a.attname) as column_names,
          i.indisunique as is_unique
        FROM pg_indexes i
        JOIN pg_class c ON c.relname = i.tablename
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_index idx ON idx.indexrelid = (SELECT oid FROM pg_class WHERE relname = i.indexname)
        LEFT JOIN pg_attribute a ON a.attrelid = idx.indrelid AND a.attnum = ANY(idx.indkey)
        WHERE n.nspname = $1 AND c.relname = $2 AND i.schemaname = $1
        GROUP BY i.indexname, i.indexdef, i.indisunique
      `;

      const result = await handle.connection.query(query, [schema, tableName]);
      const indexes: NativeIndexMetadata[] = [];

      for (const row of result.rows) {
        const index: NativeIndexMetadata = {
          name: row.name,
          columnNames: row.column_names || [],
          isUnique: row.is_unique,
          statistics: undefined
        };
        indexes.push(index);
      }

      return indexes;
    } finally {
      handle.release();
    }
  }

  async extractConstraintMetadata(connection: ConnectionInfo, tableName: string, schema: string): Promise<NativeConstraintMetadata[]> {
    const handle = await this.createConnection(connection);
    try {
      const query = `
        SELECT
          conname as name,
          CASE contype
            WHEN 'p' THEN 'PRIMARY KEY'
            WHEN 'f' THEN 'FOREIGN KEY'
            WHEN 'u' THEN 'UNIQUE'
            WHEN 'c' THEN 'CHECK'
            WHEN 'x' THEN 'EXCLUDE'
            ELSE 'UNKNOWN'
          END as type,
          pg_get_constraintdef(con.oid) as definition,
          con.connoinherit = false as is_enabled
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relname = $2
      `;

      const result = await handle.connection.query(query, [schema, tableName]);
      const constraints: NativeConstraintMetadata[] = [];

      for (const row of result.rows) {
        const constraint: NativeConstraintMetadata = {
          name: row.name,
          type: row.type,
          definition: row.definition,
          isEnabled: row.is_enabled,
          referencedTable: undefined, // Will be populated for foreign keys
          referencedColumns: []
        };
        constraints.push(constraint);
      }

      // For foreign key constraints, extract referenced table information
      for (const constraint of constraints) {
        if (constraint.type === 'FOREIGN KEY' && constraint.definition) {
          const fkMatch = constraint.definition.match(/REFERENCES\s+(\w+)\s*\(([^)]+)\)/i);
          if (fkMatch) {
            constraint.referencedTable = fkMatch[1];
            constraint.referencedColumns = fkMatch[2].split(',').map(col => col.trim());
          }
        }
      }

      return constraints;
    } finally {
      handle.release();
    }
  }

  async extractViewMetadata(connection: ConnectionInfo, viewName?: string, schema?: string): Promise<NativeViewMetadata[]> {
    const handle = await this.createConnection(connection);
    try {
      let query: string;
      let params: any[];

      if (viewName && schema) {
        query = `
          SELECT
            c.relname as name,
            n.nspname as schema,
            pg_get_viewdef(c.oid) as definition,
            c.relkind = 'm' as is_materialized
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind IN ('v', 'm')
        `;
        params = [schema, viewName];
      } else if (schema) {
        query = `
          SELECT
            c.relname as name,
            n.nspname as schema,
            pg_get_viewdef(c.oid) as definition,
            c.relkind = 'm' as is_materialized
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = $1 AND c.relkind IN ('v', 'm')
        `;
        params = [schema];
      } else {
        query = `
          SELECT
            c.relname as name,
            n.nspname as schema,
            pg_get_viewdef(c.oid) as definition,
            c.relkind = 'm' as is_materialized
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relkind IN ('v', 'm') AND n.nspname NOT IN ('information_schema', 'pg_catalog')
        `;
        params = [];
      }

      const result = await handle.connection.query(query, params);
      const views: NativeViewMetadata[] = [];

      for (const row of result.rows) {
        // Get columns for this view
        const columnsQuery = `
          SELECT
            a.attname as name,
            pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type
          FROM pg_attribute a
          JOIN pg_class c ON c.oid = a.attrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped
          ORDER BY a.attnum
        `;
        const columnsResult = await handle.connection.query(columnsQuery, [row.schema, row.name]);
        const columns: ViewColumn[] = columnsResult.rows.map(col => ({
          name: col.name,
          dataType: col.data_type
        }));

        const view: NativeViewMetadata = {
          name: row.name,
          schema: row.schema,
          definition: row.definition || '',
          columns,
          dependencies: [], // Will be populated by dependency analysis
          isMaterialized: row.is_materialized
        };
        views.push(view);
      }

      return views;
    } finally {
      handle.release();
    }
  }

  async extractFunctionMetadata(connection: ConnectionInfo, functionName?: string, schema?: string): Promise<NativeFunctionMetadata[]> {
    const handle = await this.createConnection(connection);
    try {
      let query: string;
      let params: any[];

      if (functionName && schema) {
        query = `
          SELECT
            p.proname as name,
            n.nspname as schema,
            pg_get_functiondef(p.oid) as definition,
            l.lanname as language,
            pg_catalog.format_type(p.prorettype, null) as return_type
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          JOIN pg_language l ON l.oid = p.prolang
          WHERE n.nspname = $1 AND p.proname = $2
        `;
        params = [schema, functionName];
      } else if (schema) {
        query = `
          SELECT
            p.proname as name,
            n.nspname as schema,
            pg_get_functiondef(p.oid) as definition,
            l.lanname as language,
            pg_catalog.format_type(p.prorettype, null) as return_type
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          JOIN pg_language l ON l.oid = p.prolang
          WHERE n.nspname = $1
        `;
        params = [schema];
      } else {
        query = `
          SELECT
            p.proname as name,
            n.nspname as schema,
            pg_get_functiondef(p.oid) as definition,
            l.lanname as language,
            pg_catalog.format_type(p.prorettype, null) as return_type
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          JOIN pg_language l ON l.oid = p.prolang
          WHERE n.nspname NOT IN ('information_schema', 'pg_catalog')
        `;
        params = [];
      }

      const result = await handle.connection.query(query, params);
      const functions: NativeFunctionMetadata[] = [];

      for (const row of result.rows) {
        // Get parameters for this function
        const paramsQuery = `
          SELECT
            coalesce(p.proargnames[ordinality], 'arg' || ordinality) as name,
            pg_catalog.format_type(unnest(p.proargtypes), null) as data_type,
            CASE
              WHEN p.proargmodes IS NOT NULL THEN
                CASE unnest(p.proargmodes)
                  WHEN 'i' THEN 'IN'
                  WHEN 'o' THEN 'OUT'
                  WHEN 'b' THEN 'INOUT'
                  ELSE 'IN'
                END
              ELSE 'IN'
            END as mode
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          CROSS JOIN unnest(coalesce(p.proargtypes, '{}')) WITH ORDINALITY as t(oid, ordinality)
          WHERE n.nspname = $1 AND p.proname = $2
          ORDER BY ordinality
        `;
        const paramsResult = await handle.connection.query(paramsQuery, [row.schema, row.name]);
        const parameters: FunctionParameter[] = paramsResult.rows.map(param => ({
          name: param.name,
          dataType: param.data_type,
          mode: param.mode as 'IN' | 'OUT' | 'INOUT'
        }));

        const func: NativeFunctionMetadata = {
          name: row.name,
          schema: row.schema,
          definition: row.definition || '',
          language: row.language,
          returnType: row.return_type,
          parameters
        };
        functions.push(func);
      }

      return functions;
    } finally {
      handle.release();
    }
  }

  private async getColumnConstraints(connection: PoolClient, tableName: string, schema: string, columnName: string): Promise<NativeConstraintMetadata[]> {
    const query = `
      SELECT
        conname as name,
        CASE contype
          WHEN 'p' THEN 'PRIMARY KEY'
          WHEN 'f' THEN 'FOREIGN KEY'
          WHEN 'u' THEN 'UNIQUE'
          WHEN 'c' THEN 'CHECK'
          WHEN 'x' THEN 'EXCLUDE'
          ELSE 'UNKNOWN'
        END as type,
        pg_get_constraintdef(con.oid) as definition,
        con.connoinherit = false as is_enabled
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relname = $2 AND $3 = ANY(
        SELECT a.attname
        FROM pg_attribute a
        WHERE a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
      )
    `;

    const result = await connection.query(query, [schema, tableName, columnName]);
    const constraints: NativeConstraintMetadata[] = [];

    for (const row of result.rows) {
      const constraint: NativeConstraintMetadata = {
        name: row.name,
        type: row.type,
        definition: row.definition,
        isEnabled: row.is_enabled
      };
      constraints.push(constraint);
    }

    return constraints;
  }
}