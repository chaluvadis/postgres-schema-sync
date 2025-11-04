import { ConnectionManager } from "@/managers/ConnectionManager";
import { Logger } from "@/utils/Logger";
import { PostgreSqlConnectionManager } from "@/core/PostgreSqlConnectionManager";
import { SchemaOperations } from "@/managers/schema/SchemaOperations";
import { getUUId } from "@/utils/helper";

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
  kind: "table" | "column" | "function" | "keyword" | "schema";
  detail?: string;
  documentation?: string;
}

export class QueryExecutionService {
  private connectionManager: ConnectionManager;
  private dotNetService: PostgreSqlConnectionManager;
  private schemaOperations: SchemaOperations;

  constructor(connectionManager: ConnectionManager) {
    this.connectionManager = connectionManager;
    this.dotNetService = PostgreSqlConnectionManager.getInstance();
    this.schemaOperations = new SchemaOperations(connectionManager);
  }

  async executeQuery(
    connectionId: string,
    query: string,
    options: QueryOptions = {},
    _cancellationToken?: any
  ): Promise<QueryResult> {
    const startTime = Date.now();

    try {
      Logger.info("Executing query", "executeQuery", {
        connectionId,
        queryLength: query.length,
        options,
      });

      // Use ConnectionManager directly
      const connectionService = this.connectionManager;
      const dotNetConnection = await connectionService.toDotNetConnection(connectionId);
      if (!dotNetConnection) {
        throw new Error("Failed to create connection info");
      }

      // Execute query via native service using pooled connection
      const dotNetResult = await this.dotNetService.createConnection(dotNetConnection).then(async (handle) => {
        try {
          const queryResult = await handle.connection.query(query);
          return {
            rowCount: queryResult.rowCount,
            columns: queryResult.fields.map(field => ({
              name: field.name,
              type: field.dataTypeID.toString(),
              nullable: true // Simplified
            })),
            rows: queryResult.rows,
            error: undefined,
            executionPlan: undefined
          };
        } finally {
          handle.release();
        }
      });

      const executionTime = Date.now() - startTime;

      // Convert .NET result to local format
      const result: QueryResult = {
        id: `query_${getUUId()}`,
        query,
        executionTime,
        rowCount: dotNetResult.rowCount || 0,
        columns: dotNetResult.columns.map((col) => ({
          name: col.name,
          type: col.type,
          nullable: col.nullable,
        })),
        rows: dotNetResult.rows,
        error: dotNetResult.error,
        executionPlan: dotNetResult.executionPlan,
        timestamp: new Date(),
      };

      Logger.info("Query executed successfully", "executeQuery", {
        connectionId,
        rowCount: result.rowCount,
        executionTime: result.executionTime,
      });

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;

      Logger.error("Query execution failed", error as Error);

      // Return error result
      return {
        id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        query,
        executionTime,
        rowCount: 0,
        columns: [],
        rows: [],
        error: (error as Error).message,
        timestamp: new Date(),
      };
    }
  }

  async getIntelliSense(
    connectionId: string,
    _query: string,
    position: { line: number; column: number }
  ): Promise<IntelliSenseSuggestion[]> {
    try {
      Logger.debug("Getting IntelliSense suggestions", "getIntelliSense", {
        connectionId,
        position,
      });
      // For now, return basic SQL keywords and common suggestions
      // In a full implementation, this would query the database schema
      const basicKeywords: IntelliSenseSuggestion[] = [
        { label: "SELECT", kind: "keyword", detail: "Select data from tables" },
        { label: "INSERT", kind: "keyword", detail: "Insert new data" },
        { label: "UPDATE", kind: "keyword", detail: "Update existing data" },
        { label: "DELETE", kind: "keyword", detail: "Delete data" },
        { label: "CREATE", kind: "keyword", detail: "Create database objects" },
        { label: "DROP", kind: "keyword", detail: "Drop database objects" },
        { label: "ALTER", kind: "keyword", detail: "Modify database objects" },
        { label: "FROM", kind: "keyword", detail: "Specify source table" },
        { label: "WHERE", kind: "keyword", detail: "Filter results" },
        { label: "JOIN", kind: "keyword", detail: "Join tables" },
        { label: "ORDER BY", kind: "keyword", detail: "Sort results" },
        { label: "GROUP BY", kind: "keyword", detail: "Group results" },
        { label: "HAVING", kind: "keyword", detail: "Filter grouped results" },
        { label: "LIMIT", kind: "keyword", detail: "Limit result count" },
        { label: "DISTINCT", kind: "keyword", detail: "Remove duplicates" },
      ];

      // Use ConnectionManager directly
      const connectionService = this.connectionManager;
      const dotNetConnection = await connectionService.toDotNetConnection(connectionId);
      if (!dotNetConnection) {
        return basicKeywords;
      }

      // Try to get schema objects for more specific suggestions
      try {
        const schemaObjects = await this.schemaOperations.getDatabaseObjects(connectionId);

        // Add table and view suggestions
        const objectSuggestions: IntelliSenseSuggestion[] = schemaObjects.map(
          (obj: any) => ({
            label: obj.name,
            kind:
              obj.type === "table"
                ? "table"
                : obj.type === "view"
                ? "table"
                : "column",
            detail: `${obj.type} in ${obj.schema}`,
            documentation: obj.definition,
          })
        );

        return [...basicKeywords, ...objectSuggestions];
      } catch (error) {
        Logger.warn("Failed to get schema objects for IntelliSense");
        return basicKeywords;
      }
    } catch (error) {
      Logger.error("Failed to get IntelliSense", error as Error);
      return [];
    }
  }

  async exportResults(
    result: QueryResult,
    format: "csv" | "json" | "excel",
    filePath: string
  ): Promise<void> {
    try {
      Logger.info("Exporting query results", "exportResults", {
        format,
        filePath,
        rowCount: result.rowCount,
      });

      let content: string;

      switch (format) {
        case "csv":
          content = this.generateCSV(result);
          break;
        case "json":
          content = this.generateJSON(result);
          break;
        case "excel":
          // For now, export as CSV with Excel-friendly formatting
          content = this.generateCSV(result, "\t");
          break;
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }

      const fs = require("fs").promises;
      await fs.writeFile(filePath, content, "utf8");

      Logger.info("Results exported successfully", "exportResults", {
        filePath,
      });
    } catch (error) {
      Logger.error("Failed to export results", error as Error);
      throw error;
    }
  }

  private generateCSV(result: QueryResult, delimiter: string = ","): string {
    const lines: string[] = [];

    // Add headers
    const headers = result.columns
      .map((col) => `"${col.name}"`)
      .join(delimiter);
    lines.push(headers);

    // Add data rows
    result.rows.forEach((row) => {
      const values = row.map((cell) => {
        const cellStr = cell !== null ? String(cell) : "";
        // Escape quotes and wrap in quotes if contains delimiter or quotes
        return cellStr.includes(delimiter) || cellStr.includes('"')
          ? `"${cellStr.replace(/"/g, '""')}"`
          : cellStr;
      });
      lines.push(values.join(delimiter));
    });

    return lines.join("\n");
  }

  private generateJSON(result: QueryResult): string {
    const data = result.rows.map((row) => {
      const obj: any = {};
      result.columns.forEach((col, index) => {
        obj[col.name] = row[index];
      });
      return obj;
    });

    return JSON.stringify(data, null, 2);
  }
}
