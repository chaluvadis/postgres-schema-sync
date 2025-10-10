import { ConnectionManager } from '@/managers/ConnectionManager';
import { Logger } from '@/utils/Logger';
import { DotNetIntegrationService } from '@/services/DotNetIntegrationService';
import { ErrorHandler } from '@/utils/ErrorHandler';

export interface QueryResult {
    id: string;
    query: string;
    executionTime: number;
    rowCount: number;
    columns: QueryColumn[];
    rows: any[][];
    error?: string;
    executionPlan?: string;
    timestamp: Date;
}

export interface QueryColumn {
    name: string;
    type: string;
    nullable: boolean;
}

export interface QueryOptions {
    timeout?: number;
    maxRows?: number;
    includeExecutionPlan?: boolean;
}

export interface IntelliSenseSuggestion {
    label: string;
    kind: 'table' | 'column' | 'function' | 'keyword' | 'schema';
    detail?: string;
    documentation?: string;
}

export class QueryExecutionService {
    private connectionManager: ConnectionManager;
    private dotNetService: DotNetIntegrationService;

    constructor(connectionManager: ConnectionManager) {
        this.connectionManager = connectionManager;
        this.dotNetService = DotNetIntegrationService.getInstance();
    }

    async executeQuery(
        connectionId: string,
        query: string,
        options: QueryOptions = {},
        cancellationToken?: any
    ): Promise<QueryResult> {
        const startTime = Date.now();

        try {
            Logger.info('Executing query', 'executeQuery', {
                connectionId,
                queryLength: query.length,
                options
            });

            // Get connection and validate
            const connection = this.connectionManager.getConnection(connectionId);
            if (!connection) {
                throw new Error(`Connection ${connectionId} not found`);
            }

            // Get password
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
            const dotNetResult = await this.dotNetService.executeQuery(
                dotNetConnection,
                query,
                {
                    maxRows: options.maxRows || 1000,
                    timeout: options.timeout || 30,
                    includeExecutionPlan: options.includeExecutionPlan || false
                }
            );

            const executionTime = Date.now() - startTime;

            // Convert .NET result to local format
            const result: QueryResult = {
                id: `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                query,
                executionTime,
                rowCount: dotNetResult.rowCount,
                columns: dotNetResult.columns.map(col => ({
                    name: col.name,
                    type: col.type,
                    nullable: col.nullable
                })),
                rows: dotNetResult.rows,
                error: dotNetResult.error,
                executionPlan: dotNetResult.executionPlan,
                timestamp: new Date()
            };

            Logger.info('Query executed successfully', 'executeQuery', {
                connectionId,
                rowCount: result.rowCount,
                executionTime: result.executionTime
            });

            return result;

        } catch (error) {
            const executionTime = Date.now() - startTime;

            Logger.error('Query execution failed', error as Error);

            // Return error result
            return {
                id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                query,
                executionTime,
                rowCount: 0,
                columns: [],
                rows: [],
                error: (error as Error).message,
                timestamp: new Date()
            };
        }
    }

    async getIntelliSense(
        connectionId: string,
        query: string,
        position: { line: number; column: number }
    ): Promise<IntelliSenseSuggestion[]> {
        try {
            Logger.debug('Getting IntelliSense suggestions', 'getIntelliSense', {
                connectionId,
                position
            });

            // For now, return basic SQL keywords and common suggestions
            // In a full implementation, this would query the database schema
            const basicKeywords: IntelliSenseSuggestion[] = [
                { label: 'SELECT', kind: 'keyword', detail: 'Select data from tables' },
                { label: 'INSERT', kind: 'keyword', detail: 'Insert new data' },
                { label: 'UPDATE', kind: 'keyword', detail: 'Update existing data' },
                { label: 'DELETE', kind: 'keyword', detail: 'Delete data' },
                { label: 'CREATE', kind: 'keyword', detail: 'Create database objects' },
                { label: 'DROP', kind: 'keyword', detail: 'Drop database objects' },
                { label: 'ALTER', kind: 'keyword', detail: 'Modify database objects' },
                { label: 'FROM', kind: 'keyword', detail: 'Specify source table' },
                { label: 'WHERE', kind: 'keyword', detail: 'Filter results' },
                { label: 'JOIN', kind: 'keyword', detail: 'Join tables' },
                { label: 'ORDER BY', kind: 'keyword', detail: 'Sort results' },
                { label: 'GROUP BY', kind: 'keyword', detail: 'Group results' },
                { label: 'HAVING', kind: 'keyword', detail: 'Filter grouped results' },
                { label: 'LIMIT', kind: 'keyword', detail: 'Limit result count' },
                { label: 'DISTINCT', kind: 'keyword', detail: 'Remove duplicates' }
            ];

            // Get connection and validate
            const connection = this.connectionManager.getConnection(connectionId);
            if (!connection) {
                return basicKeywords;
            }

            // Get password
            const password = await this.connectionManager.getConnectionPassword(connectionId);
            if (!password) {
                return basicKeywords;
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

            // Try to get schema objects for more specific suggestions
            try {
                const schemaObjects = await this.dotNetService.browseSchema(dotNetConnection);

                // Add table and view suggestions
                const objectSuggestions: IntelliSenseSuggestion[] = schemaObjects.map(obj => ({
                    label: obj.name,
                    kind: obj.type === 'table' ? 'table' : obj.type === 'view' ? 'table' : 'column',
                    detail: `${obj.type} in ${obj.schema}`,
                    documentation: obj.definition
                }));

                return [...basicKeywords, ...objectSuggestions];
            } catch (error) {
                Logger.warn('Failed to get schema objects for IntelliSense');
                return basicKeywords;
            }

        } catch (error) {
            Logger.error('Failed to get IntelliSense', error as Error);
            return [];
        }
    }

    async exportResults(
        result: QueryResult,
        format: 'csv' | 'json' | 'excel',
        filePath: string
    ): Promise<void> {
        try {
            Logger.info('Exporting query results', 'exportResults', {
                format,
                filePath,
                rowCount: result.rowCount
            });

            let content: string;

            switch (format) {
                case 'csv':
                    content = this.generateCSV(result);
                    break;
                case 'json':
                    content = this.generateJSON(result);
                    break;
                case 'excel':
                    // For now, export as CSV with Excel-friendly formatting
                    content = this.generateCSV(result, '\t');
                    break;
                default:
                    throw new Error(`Unsupported export format: ${format}`);
            }

            const fs = require('fs').promises;
            await fs.writeFile(filePath, content, 'utf8');

            Logger.info('Results exported successfully', 'exportResults', { filePath });

        } catch (error) {
            Logger.error('Failed to export results', error as Error);
            throw error;
        }
    }

    private generateCSV(result: QueryResult, delimiter: string = ','): string {
        const lines: string[] = [];

        // Add headers
        const headers = result.columns.map(col => `"${col.name}"`).join(delimiter);
        lines.push(headers);

        // Add data rows
        result.rows.forEach(row => {
            const values = row.map(cell => {
                const cellStr = cell !== null ? String(cell) : '';
                // Escape quotes and wrap in quotes if contains delimiter or quotes
                return cellStr.includes(delimiter) || cellStr.includes('"')
                    ? `"${cellStr.replace(/"/g, '""')}"`
                    : cellStr;
            });
            lines.push(values.join(delimiter));
        });

        return lines.join('\n');
    }

    private generateJSON(result: QueryResult): string {
        const data = result.rows.map(row => {
            const obj: any = {};
            result.columns.forEach((col, index) => {
                obj[col.name] = row[index];
            });
            return obj;
        });

        return JSON.stringify(data, null, 2);
    }

    async validateQuery(query: string): Promise<{ valid: boolean; error?: string }> {
        try {
            // Basic SQL validation
            const trimmed = query.trim();

            if (!trimmed) {
                return { valid: false, error: 'Query cannot be empty' };
            }

            // Check for basic SQL keywords
            const sqlKeywords = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER'];
            const hasKeyword = sqlKeywords.some(keyword =>
                trimmed.toUpperCase().includes(keyword)
            );

            if (!hasKeyword) {
                return { valid: false, error: 'Query does not appear to be valid SQL' };
            }

            // Check for potentially dangerous operations
            const dangerousPatterns = [
                /DROP\s+DATABASE/i,
                /DROP\s+SCHEMA/i,
                /TRUNCATE\s+TABLE/i,
                /DELETE\s+FROM\s+\w+\s+WHERE\s+1\s*=\s*1/i
            ];

            for (const pattern of dangerousPatterns) {
                if (pattern.test(trimmed)) {
                    return {
                        valid: false,
                        error: 'Query contains potentially dangerous operations. Please review carefully.'
                    };
                }
            }

            return { valid: true };

        } catch (error) {
            return { valid: false, error: (error as Error).message };
        }
    }

    async formatQuery(query: string): Promise<string> {
        try {
            // Basic SQL formatting
            let formatted = query;

            // Normalize whitespace
            formatted = formatted.replace(/\s+/g, ' ');

            // Add newlines after keywords
            const keywords = ['SELECT', 'FROM', 'WHERE', 'ORDER BY', 'GROUP BY', 'HAVING', 'INSERT', 'UPDATE', 'DELETE'];
            keywords.forEach(keyword => {
                const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
                formatted = formatted.replace(regex, `\n${keyword}`);
            });

            // Add indentation
            const lines = formatted.split('\n');
            let indentLevel = 0;
            const indentSize = 4;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();

                if (!line) continue;

                // Decrease indent for certain keywords
                if (line.startsWith('FROM') || line.startsWith('WHERE') || line.startsWith('ORDER BY')) {
                    indentLevel = Math.max(0, indentLevel - 1);
                }

                lines[i] = ' '.repeat(indentLevel * indentSize) + line;

                // Increase indent after certain keywords
                if (line.startsWith('SELECT') || line.startsWith('FROM')) {
                    indentLevel++;
                }
            }

            return lines.join('\n').trim();

        } catch (error) {
            Logger.error('Failed to format query', error as Error);
            return query; // Return original query if formatting fails
        }
    }

    async getQueryStatistics(query: string): Promise<{
        estimatedComplexity: 'Simple' | 'Medium' | 'Complex';
        estimatedRows: number;
        warnings: string[];
    }> {
        const warnings: string[] = [];
        let complexity: 'Simple' | 'Medium' | 'Complex' = 'Simple';
        let estimatedRows = 1000;

        try {
            const upperQuery = query.toUpperCase();

            // Analyze complexity
            if (upperQuery.includes('JOIN')) {
                complexity = 'Medium';
            }

            if (upperQuery.includes('SUBQUERY') || upperQuery.includes('CTE') ||
                upperQuery.includes('WINDOW FUNCTION') || upperQuery.match(/JOIN.*JOIN/)) {
                complexity = 'Complex';
            }

            // Check for missing WHERE clauses in DELETE/UPDATE
            if ((upperQuery.includes('DELETE') || upperQuery.includes('UPDATE')) &&
                !upperQuery.includes('WHERE')) {
                warnings.push('DELETE/UPDATE without WHERE clause may affect all rows');
            }

            // Check for SELECT * (could be expensive)
            if (upperQuery.includes('SELECT *') && !upperQuery.includes('COUNT')) {
                warnings.push('SELECT * may return large amounts of data');
            }

            // Check for missing LIMIT
            if (upperQuery.includes('SELECT') && !upperQuery.includes('LIMIT') &&
                !upperQuery.includes('COUNT') && !upperQuery.includes('EXISTS')) {
                warnings.push('Consider adding LIMIT clause for large result sets');
            }

            // Estimate row count (very basic heuristic)
            if (upperQuery.includes('COUNT')) {
                estimatedRows = 1;
            } else if (upperQuery.includes('LIMIT')) {
                const limitMatch = upperQuery.match(/LIMIT\s+(\d+)/i);
                if (limitMatch) {
                    estimatedRows = Math.min(parseInt(limitMatch[1]), 10000);
                }
            } else {
                estimatedRows = complexity === 'Simple' ? 1000 :
                               complexity === 'Medium' ? 10000 : 100000;
            }

            return {
                estimatedComplexity: complexity,
                estimatedRows,
                warnings
            };

        } catch (error) {
            Logger.error('Failed to analyze query statistics', error as Error);
            return {
                estimatedComplexity: 'Simple',
                estimatedRows: 1000,
                warnings: ['Failed to analyze query']
            };
        }
    }

    dispose(): void {
        // Cleanup if needed
    }
}