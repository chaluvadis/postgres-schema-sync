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
}