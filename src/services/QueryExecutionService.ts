import { ConnectionManager } from '@/managers/ConnectionManager';
import { SchemaManager } from '@/managers/SchemaManager';
import { Logger } from '@/utils/Logger';
import { DotNetIntegrationService } from '@/services/DotNetIntegrationService';

export interface QueryResult {
    id: string;
    query: string;
    executionTime: number;
    rowCount: number;
    columns: QueryColumn[];
    rows: any[][];
    error?: string;
    executionPlan?: string;
}

export interface QueryColumn {
    name: string;
    type: string;
    nullable: boolean;
    primaryKey?: boolean;
}

export interface QueryHistory {
    id: string;
    query: string;
    timestamp: Date;
    executionTime: number;
    rowCount: number;
    connectionId: string;
}

export class QueryExecutionService {
    private connectionManager: ConnectionManager;
    private schemaManager: SchemaManager;
    private dotNetService: DotNetIntegrationService;
    private queryHistory: QueryHistory[] = [];
    private activeQueries: Map<string, { cancel: () => void }> = new Map();

    constructor(connectionManager: ConnectionManager, schemaManager: SchemaManager) {
        this.connectionManager = connectionManager;
        this.schemaManager = schemaManager;
        this.dotNetService = DotNetIntegrationService.getInstance();
    }

    async executeQuery(
        query: string,
        connectionId: string,
        options: {
            maxRows?: number;
            timeout?: number;
            includeExecutionPlan?: boolean;
        } = {}
    ): Promise<QueryResult> {
        const queryId = this.generateId();
        const startTime = Date.now();

        try {
            Logger.info('Executing query', 'executeQuery', { queryId, connectionId });

            // Validate inputs
            if (!query?.trim()) {
                throw new Error('Query cannot be empty');
            }

            if (!connectionId) {
                throw new Error('Connection ID is required');
            }

            // Get connection and password
            const connection = this.connectionManager.getConnection(connectionId);
            if (!connection) {
                throw new Error(`Connection ${connectionId} not found`);
            }

            const password = await this.connectionManager.getConnectionPassword(connectionId);
            if (!password) {
                throw new Error('Connection password not found');
            }

            // Create .NET connection info
            const dotNetConnection = {
                id: connection.id,
                name: connection.name,
                host: connection.host,
                port: connection.port,
                database: connection.database,
                username: connection.username,
                password: password,
                createdDate: new Date().toISOString()
            };

            // Execute query via .NET service
            const result = await this.dotNetService.executeQuery(
                dotNetConnection,
                query,
                {
                    maxRows: options.maxRows || 1000,
                    timeout: options.timeout || 30000,
                    includeExecutionPlan: options.includeExecutionPlan || false
                }
            );

            if (!result) {
                throw new Error('Query execution returned no results');
            }

            const executionTime = Date.now() - startTime;

            // Convert result to local format
            const queryResult: QueryResult = {
                id: queryId,
                query: query,
                executionTime: executionTime,
                rowCount: result.rowCount,
                columns: result.columns.map((col: any) => ({
                    name: col.name,
                    type: col.type,
                    nullable: col.nullable,
                    primaryKey: col.primaryKey
                })),
                rows: result.rows,
                error: result.error,
                executionPlan: result.executionPlan
            };

            // Add to history
            this.addToHistory({
                id: queryId,
                query: query,
                timestamp: new Date(),
                executionTime: executionTime,
                rowCount: result.rowCount,
                connectionId: connectionId
            });

            Logger.info('Query executed successfully', 'executeQuery', {
                queryId,
                executionTime,
                rowCount: result.rowCount
            });

            return queryResult;

        } catch (error) {
            const executionTime = Date.now() - startTime;
            Logger.error('Query execution failed', error as Error);

            // Return error result
            return {
                id: queryId,
                query: query,
                executionTime: executionTime,
                rowCount: 0,
                columns: [],
                rows: [],
                error: (error as Error).message
            };
        }
    }

    async cancelQuery(queryId: string): Promise<boolean> {
        try {
            const activeQuery = this.activeQueries.get(queryId);
            if (activeQuery) {
                activeQuery.cancel();
                this.activeQueries.delete(queryId);
                Logger.info('Query cancelled', 'cancelQuery', { queryId });
                return true;
            }
            return false;
        } catch (error) {
            Logger.error('Failed to cancel query', error as Error);
            return false;
        }
    }

    getQueryHistory(limit: number = 100): QueryHistory[] {
        return this.queryHistory
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
            .slice(0, limit);
    }

    clearQueryHistory(): void {
        this.queryHistory = [];
        Logger.info('Query history cleared');
    }

    private addToHistory(history: QueryHistory): void {
        this.queryHistory.unshift(history);

        // Keep only last 1000 queries
        if (this.queryHistory.length > 1000) {
            this.queryHistory = this.queryHistory.slice(0, 1000);
        }
    }

    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    async dispose(): Promise<void> {
        Logger.info('Disposing QueryExecutionService');

        // Cancel all active queries
        for (const [queryId, activeQuery] of this.activeQueries) {
            try {
                activeQuery.cancel();
            } catch (error) {
                Logger.warn('Error cancelling query during disposal', 'dispose', error as Error);
            }
        }

        this.activeQueries.clear();
        this.queryHistory = [];
    }
}