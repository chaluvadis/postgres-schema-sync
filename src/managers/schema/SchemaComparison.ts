import { SchemaOperations } from "./SchemaOperations";
// DatabaseObject and ObjectType are now defined in SchemaOperations
import { DatabaseObject, ObjectType } from "./SchemaOperations";
import { Logger } from "@/utils/Logger";
import {
  PostgreSqlConnectionManager,
  ConnectionInfo,
  NativeColumnMetadata,
  NativeIndexMetadata,
  NativeConstraintMetadata,
  NativeViewMetadata,
} from "@/core/PostgreSqlConnectionManager";

// Schema comparison interfaces
export interface SchemaComparisonOptions {
  mode: "strict" | "lenient";
  ignoreSchemas?: string[];
  objectTypes?: string[];
  includeSystemObjects?: boolean;
}

export interface SchemaComparisonResult {
  comparisonId: string;
  sourceConnectionId: string;
  targetConnectionId: string;
  sourceObjectCount: number;
  targetObjectCount: number;
  differences: SchemaDifference[];
  comparisonMode: "strict" | "lenient";
  createdAt: Date;
  executionTime: number;
}

export interface SchemaDifference {
   type: "Added" | "Removed" | "Modified";
   objectType: string;
   objectName: string;
   schema: string;
   sourceDefinition?: string;
   targetDefinition?: string;
   differenceDetails: string[];
}

export interface ColumnComparisonDetail {
  columnName: string;
  dataTypeDifference?: {
    sourceType: string;
    targetType: string;
    isCompatible: boolean;
  };
  nullabilityDifference?: {
    sourceNullable: boolean;
    targetNullable: boolean;
  };
  defaultValueDifference?: {
    sourceDefault?: string;
    targetDefault?: string;
  };
  constraintDifferences: ConstraintDifference[];
  statisticsDifference?: {
    sourceStats?: ColumnStatistics;
    targetStats?: ColumnStatistics;
  };
}

export interface ConstraintDifference {
  constraintName: string;
  constraintType: string;
  differenceType: "Added" | "Removed" | "Modified";
  details: string[];
}

export interface ColumnStatistics {
  distinctValues: number;
  nullCount: number;
  avgLength?: number;
  minValue?: any;
  maxValue?: any;
}

export interface IndexComparisonDetail {
  indexName: string;
  uniquenessDifference?: {
    sourceUnique: boolean;
    targetUnique: boolean;
  };
  columnDifference?: {
    sourceColumns: string[];
    targetColumns: string[];
  };
  typeDifference?: {
    sourceType: string;
    targetType: string;
  };
  performanceDifference?: {
    sourceStats?: IndexStatistics;
    targetStats?: IndexStatistics;
  };
}

export interface IndexStatistics {
  sizeInBytes: number;
  indexScans: number;
  tuplesRead: number;
  tuplesFetched: number;
}

export interface ViewDependencyNode {
  viewName: string;
  schema: string;
  dependencies: ViewDependency[];
  dependents: string[];
  level: number;
  isMaterialized?: boolean;
  columnDependencies?: ColumnDependency[];
  hasCircularDependency?: boolean;
  complexity?: "simple" | "moderate" | "complex";
}

export interface ViewDependency {
  type: "table" | "view" | "function";
  name: string;
  schema: string;
}

export interface ColumnDependency {
  viewColumn: string;
  sourceColumns: string[];
  expression: string;
  complexity: "simple" | "moderate" | "complex";
}

export interface DetailedSchemaComparisonResult extends SchemaComparisonResult {
  columnComparisons: Map<string, ColumnComparisonDetail[]>;
  indexComparisons: Map<string, IndexComparisonDetail[]>;
  constraintComparisons: Map<string, ConstraintDifference[]>;
  viewDependencies: Map<string, ViewDependencyNode>;
  environmentComparison?: EnvironmentComparisonResult;
}

export interface EnvironmentComparisonResult {
  sourceEnvironment: any;
  targetEnvironment: any;
  environmentDrift: EnvironmentDrift[];
  complianceStatus: ComplianceStatus;
  recommendations: EnvironmentRecommendation[];
}

export interface EnvironmentDrift {
  type: "schema_drift" | "permission_drift" | "configuration_drift";
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  affectedObjects: string[];
  remediationSteps: string[];
}

export interface ComplianceStatus {
  isCompliant: boolean;
  standards: ComplianceStandard[];
  violations: ComplianceViolation[];
  lastChecked: Date;
}

export interface ComplianceStandard {
  name: string;
  version: string;
  status: "compliant" | "non_compliant" | "unknown";
  lastChecked: Date;
}

export interface ComplianceViolation {
  id: string;
  ruleId: string;
  standardId: string;
  objectId?: string;
  objectType?: string;
  objectName?: string;
  schema?: string;
  violationType:
  | "naming"
  | "structure"
  | "permission"
  | "data_quality"
  | "performance"
  | "security";
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  actualValue: any;
  expectedValue: any;
  remediation: string;
  detectedAt: Date;
  status: "open" | "acknowledged" | "resolved" | "false_positive";
}

export interface EnvironmentRecommendation {
  type: "optimization" | "security" | "performance" | "compliance";
  priority: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  estimatedEffort: "low" | "medium" | "high";
  potentialImpact: string;
}

/**
 * SchemaComparison - Handles schema comparison operations
 * Responsible for comparing schemas between different database connections
 */
export class SchemaComparison {
  private schemaOperations: SchemaOperations;

  constructor(schemaOperations: SchemaOperations) {
    this.schemaOperations = schemaOperations;
  }

  /**
   * Compare schemas between two database connections
   */
  async compareSchemas(
    sourceConnectionId: string,
    targetConnectionId: string,
    options: SchemaComparisonOptions = { mode: "strict" }
  ): Promise<SchemaComparisonResult> {
    try {
      Logger.info("Comparing schemas", "compareSchemas", {
        sourceConnectionId,
        targetConnectionId,
        mode: options.mode,
      });

      const comparisonStart = Date.now();

      // Get objects from both connections
      const [sourceObjects, targetObjects] = await Promise.all([
        this.schemaOperations.getDatabaseObjectsWithCache(sourceConnectionId),
        this.schemaOperations.getDatabaseObjectsWithCache(targetConnectionId),
      ]);

      // Filter objects based on options
      const filteredSource = this.filterObjects(sourceObjects, options);
      const filteredTarget = this.filterObjects(targetObjects, options);

      // Perform comparison
      const differences = this.compareObjectArrays(
        filteredSource,
        filteredTarget,
        options.mode
      );

      const result: SchemaComparisonResult = {
        comparisonId: this.generateId(),
        sourceConnectionId,
        targetConnectionId,
        sourceObjectCount: filteredSource.length,
        targetObjectCount: filteredTarget.length,
        differences,
        comparisonMode: options.mode,
        createdAt: new Date(),
        executionTime: Date.now() - comparisonStart,
      };

      Logger.info("Schema comparison completed", "compareSchemas", {
        comparisonId: result.comparisonId,
        differenceCount: differences.length,
      });

      return result;
    } catch (error) {
      Logger.error("Schema comparison failed", error as Error);
      throw error;
    }
  }

  /**
   * Perform detailed schema comparison with metadata extraction
   */
  async compareSchemasDetailed(
    sourceConnectionId: string,
    targetConnectionId: string,
    options: SchemaComparisonOptions = { mode: "strict" }
  ): Promise<DetailedSchemaComparisonResult> {
    try {
      Logger.info(
        "Starting detailed schema comparison",
        "compareSchemasDetailed",
        {
          sourceConnectionId,
          targetConnectionId,
          mode: options.mode,
        }
      );

      // Get basic comparison first
      const basicResult = await this.compareSchemas(
        sourceConnectionId,
        targetConnectionId,
        options
      );

      // Initialize detailed comparison components
      const columnComparisons = new Map<string, ColumnComparisonDetail[]>();
      const indexComparisons = new Map<string, IndexComparisonDetail[]>();
      const constraintComparisons = new Map<string, ConstraintDifference[]>();
      const viewDependencies = new Map<string, ViewDependencyNode>();

      // Get all tables for detailed comparison
      const sourceTables = await this.schemaOperations.getDatabaseObjects(
        sourceConnectionId,
        undefined
      );
      const targetTables = await this.schemaOperations.getDatabaseObjects(
        targetConnectionId,
        undefined
      );

      const allTableNames = new Set([
        ...sourceTables
          .filter((obj) => obj.type === ObjectType.Table)
          .map((obj) => `${obj.schema}.${obj.name}`),
        ...targetTables
          .filter((obj) => obj.type === ObjectType.Table)
          .map((obj) => `${obj.schema}.${obj.name}`),
      ]);

      // Perform detailed comparison for each table
      for (const tableIdentifier of allTableNames) {
        const [schema, tableName] = tableIdentifier.split(".");

        try {
          // Compare columns
          const columnComparison = await this.compareTableColumns(
            sourceConnectionId,
            targetConnectionId,
            tableName,
            schema
          );
          if (columnComparison.length > 0) {
            columnComparisons.set(tableIdentifier, columnComparison);
          }

          // Compare indexes
          const indexComparison = await this.compareTableIndexes(
            sourceConnectionId,
            targetConnectionId,
            tableName,
            schema
          );
          if (indexComparison.length > 0) {
            indexComparisons.set(tableIdentifier, indexComparison);
          }

          // Compare constraints
          const constraintComparison = await this.compareTableConstraints(
            sourceConnectionId,
            targetConnectionId,
            tableName,
            schema
          );
          if (constraintComparison.length > 0) {
            constraintComparisons.set(tableIdentifier, constraintComparison);
          }
        } catch (error) {
          Logger.warn(
            "Failed to extract detailed metadata for table",
            "compareSchemasDetailed",
            {
              tableIdentifier,
              sourceConnectionId,
              targetConnectionId,
              error: (error as Error).message,
            }
          );
        }
      }

      // Analyze view dependencies
      await this.analyzeViewDependencies(
        sourceConnectionId,
        targetConnectionId,
        sourceTables,
        targetTables,
        viewDependencies
      );

      const detailedResult: DetailedSchemaComparisonResult = {
        ...basicResult,
        columnComparisons,
        indexComparisons,
        constraintComparisons,
        viewDependencies,
      };

      Logger.info(
        "Detailed schema comparison completed",
        "compareSchemasDetailed",
        {
          comparisonId: detailedResult.comparisonId,
          tableCount: allTableNames.size,
          columnComparisonCount: columnComparisons.size,
          indexComparisonCount: indexComparisons.size,
          constraintComparisonCount: constraintComparisons.size,
          viewDependencyCount: viewDependencies.size,
        }
      );

      return detailedResult;
    } catch (error) {
      Logger.error("Detailed schema comparison failed", error as Error);
      throw error;
    }
  }

  /**
   * Compare columns between two tables
   */
  private async compareTableColumns(
    sourceConnectionId: string,
    targetConnectionId: string,
    tableName: string,
    schema: string
  ): Promise<ColumnComparisonDetail[]> {
    try {
      // Get connection info for metadata extraction
      const sourceConnection = await this.getConnectionInfo(sourceConnectionId);
      const targetConnection = await this.getConnectionInfo(targetConnectionId);

      // Extract column metadata
      const [sourceColumns, targetColumns] = await Promise.all([
        this.extractColumnMetadata(sourceConnection, tableName, schema),
        this.extractColumnMetadata(targetConnection, tableName, schema),
      ]);

      return this.compareColumnsDetailed(sourceColumns, targetColumns);
    } catch (error) {
      Logger.warn("Failed to compare table columns", "compareTableColumns", {
        tableName,
        schema,
        error: (error as Error).message,
      });
      return [];
    }
  }

  /**
   * Compare indexes between two tables
   */
  private async compareTableIndexes(
    sourceConnectionId: string,
    targetConnectionId: string,
    tableName: string,
    schema: string
  ): Promise<IndexComparisonDetail[]> {
    try {
      // Get connection info for metadata extraction
      const sourceConnection = await this.getConnectionInfo(sourceConnectionId);
      const targetConnection = await this.getConnectionInfo(targetConnectionId);

      // Extract index metadata
      const [sourceIndexes, targetIndexes] = await Promise.all([
        this.extractIndexMetadata(sourceConnection, tableName, schema),
        this.extractIndexMetadata(targetConnection, tableName, schema),
      ]);

      return this.compareIndexesDetailed(sourceIndexes, targetIndexes);
    } catch (error) {
      Logger.warn("Failed to compare table indexes", "compareTableIndexes", {
        tableName,
        schema,
        error: (error as Error).message,
      });
      return [];
    }
  }

  /**
   * Compare constraints between two tables
   */
  private async compareTableConstraints(
    sourceConnectionId: string,
    targetConnectionId: string,
    tableName: string,
    schema: string
  ): Promise<ConstraintDifference[]> {
    try {
      // Get connection info for metadata extraction
      const sourceConnection = await this.getConnectionInfo(sourceConnectionId);
      const targetConnection = await this.getConnectionInfo(targetConnectionId);

      // Extract constraint metadata
      const [sourceConstraints, targetConstraints] = await Promise.all([
        this.extractConstraintMetadata(sourceConnection, tableName, schema),
        this.extractConstraintMetadata(targetConnection, tableName, schema),
      ]);

      return this.compareConstraintsDetailed(
        sourceConstraints,
        targetConstraints
      );
    } catch (error) {
      Logger.warn(
        "Failed to compare table constraints",
        "compareTableConstraints",
        {
          tableName,
          schema,
          error: (error as Error).message,
        }
      );
      return [];
    }
  }

  /**
   * Analyze view dependencies between two connections
   */
  private async analyzeViewDependencies(
    sourceConnectionId: string,
    targetConnectionId: string,
    sourceTables: DatabaseObject[],
    targetTables: DatabaseObject[],
    viewDependencies: Map<string, ViewDependencyNode>
  ): Promise<void> {
    const allViews = new Set([
      ...sourceTables
        .filter((obj) => obj.type === ObjectType.View)
        .map((obj) => `${obj.schema}.${obj.name}`),
      ...targetTables
        .filter((obj) => obj.type === ObjectType.View)
        .map((obj) => `${obj.schema}.${obj.name}`),
    ]);

    for (const viewIdentifier of allViews) {
      const [schema, viewName] = viewIdentifier.split(".");

      try {
        const sourceConnection = await this.getConnectionInfo(
          sourceConnectionId
        );
        const targetConnection = await this.getConnectionInfo(
          targetConnectionId
        );

        const [sourceViewMetadata, targetViewMetadata] = await Promise.all([
          this.extractViewMetadata(sourceConnection, viewName, schema).catch(
            () => []
          ),
          this.extractViewMetadata(targetConnection, viewName, schema).catch(
            () => []
          ),
        ]);

        const viewDependency = this.analyzeViewDependenciesFromMetadata(
          sourceViewMetadata,
          targetViewMetadata
        );
        if (viewDependency) {
          viewDependencies.set(viewIdentifier, viewDependency);
        }
      } catch (error) {
        Logger.warn(
          "Failed to extract view metadata",
          "analyzeViewDependencies",
          {
            viewIdentifier,
            sourceConnectionId,
            targetConnectionId,
            error: (error as Error).message,
          }
        );
      }
    }
  }

  /**
    * Compare columns in detail
    */
  private compareColumnsDetailed(
    sourceColumns: NativeColumnMetadata[],
    targetColumns: NativeColumnMetadata[]
  ): ColumnComparisonDetail[] {
    const differences: ColumnComparisonDetail[] = [];

    // Create lookup maps
    const sourceMap = new Map(sourceColumns.map((col) => [col.name, col]));
    const targetMap = new Map(targetColumns.map((col) => [col.name, col]));

    // Check all columns from both sides
    const allColumnNames = new Set([...sourceMap.keys(), ...targetMap.keys()]);

    for (const columnName of allColumnNames) {
      const sourceColumn = sourceMap.get(columnName);
      const targetColumn = targetMap.get(columnName);

      const columnDiff: ColumnComparisonDetail = {
        columnName,
        constraintDifferences: [],
      };

      let hasDifferences = false;

      // Compare data types
      if (sourceColumn && targetColumn) {
        if (sourceColumn.dataType !== targetColumn.dataType) {
          columnDiff.dataTypeDifference = {
            sourceType: sourceColumn.dataType,
            targetType: targetColumn.dataType,
            isCompatible: this.areDataTypesCompatible(
              sourceColumn.dataType,
              targetColumn.dataType
            ),
          };
          hasDifferences = true;
        }

        // Compare nullability
        if (sourceColumn.isNullable !== targetColumn.isNullable) {
          columnDiff.nullabilityDifference = {
            sourceNullable: sourceColumn.isNullable,
            targetNullable: targetColumn.isNullable,
          };
          hasDifferences = true;
        }

        // Compare default values
        if (sourceColumn.defaultValue !== targetColumn.defaultValue) {
          columnDiff.defaultValueDifference = {
            sourceDefault: sourceColumn.defaultValue,
            targetDefault: targetColumn.defaultValue,
          };
          hasDifferences = true;
        }

        // Compare constraints
        const constraintDiffs = this.compareColumnConstraints(
          sourceColumn.constraints || [],
          targetColumn.constraints || []
        );
        if (constraintDiffs.length > 0) {
          columnDiff.constraintDifferences = constraintDiffs;
          hasDifferences = true;
        }

        // Compare statistics if available
        if (sourceColumn.statistics && targetColumn.statistics) {
          if (
            sourceColumn.statistics.distinctValues !==
            targetColumn.statistics.distinctValues ||
            sourceColumn.statistics.nullCount !==
            targetColumn.statistics.nullCount
          ) {
            columnDiff.statisticsDifference = {
              sourceStats: sourceColumn.statistics,
              targetStats: targetColumn.statistics,
            };
            hasDifferences = true;
          }
        }
      } else if (sourceColumn && !targetColumn) {
        // Column removed
        columnDiff.constraintDifferences = (sourceColumn.constraints || []).map(
          (c) => ({
            constraintName: c.name,
            constraintType: c.type,
            differenceType: "Removed" as const,
            details: ["Column constraint removed"],
          })
        );
        hasDifferences = true;
      } else if (!sourceColumn && targetColumn) {
        // Column added
        columnDiff.constraintDifferences = (targetColumn.constraints || []).map(
          (c) => ({
            constraintName: c.name,
            constraintType: c.type,
            differenceType: "Added" as const,
            details: ["Column constraint added"],
          })
        );
        hasDifferences = true;
      }

      if (hasDifferences) {
        differences.push(columnDiff);
      }
    }

    return differences;
  }

  /**
    * Compare indexes in detail
    */
  private compareIndexesDetailed(
    sourceIndexes: NativeIndexMetadata[],
    targetIndexes: NativeIndexMetadata[]
  ): IndexComparisonDetail[] {
    const differences: IndexComparisonDetail[] = [];

    const sourceMap = new Map(sourceIndexes.map((idx) => [idx.name, idx]));
    const targetMap = new Map(targetIndexes.map((idx) => [idx.name, idx]));

    const allIndexNames = new Set([...sourceMap.keys(), ...targetMap.keys()]);

    for (const indexName of allIndexNames) {
      const sourceIndex = sourceMap.get(indexName);
      const targetIndex = targetMap.get(indexName);

      const indexDiff: IndexComparisonDetail = {
        indexName,
      };

      let hasDifferences = false;

      if (sourceIndex && targetIndex) {
        // Compare uniqueness
        if (sourceIndex.isUnique !== targetIndex.isUnique) {
          indexDiff.uniquenessDifference = {
            sourceUnique: sourceIndex.isUnique,
            targetUnique: targetIndex.isUnique,
          };
          hasDifferences = true;
        }

        // Compare columns
        if (
          JSON.stringify(sourceIndex.columnNames) !==
          JSON.stringify(targetIndex.columnNames)
        ) {
          indexDiff.columnDifference = {
            sourceColumns: sourceIndex.columnNames,
            targetColumns: targetIndex.columnNames,
          };
          hasDifferences = true;
        }

        // Compare statistics if available
        if (sourceIndex.statistics && targetIndex.statistics) {
          if (
            sourceIndex.statistics.sizeInBytes !==
            targetIndex.statistics.sizeInBytes ||
            sourceIndex.statistics.indexScans !==
            targetIndex.statistics.indexScans
          ) {
            indexDiff.performanceDifference = {
              sourceStats: sourceIndex.statistics,
              targetStats: targetIndex.statistics,
            };
            hasDifferences = true;
          }
        }
      } else if (sourceIndex && !targetIndex) {
        hasDifferences = true;
      } else if (!sourceIndex && targetIndex) {
        hasDifferences = true;
      }

      if (hasDifferences) {
        differences.push(indexDiff);
      }
    }

    return differences;
  }

  /**
    * Compare constraints in detail
    */
  private compareConstraintsDetailed(
    sourceConstraints: NativeConstraintMetadata[],
    targetConstraints: NativeConstraintMetadata[]
  ): ConstraintDifference[] {
    const differences: ConstraintDifference[] = [];

    const sourceMap = new Map(sourceConstraints.map((c) => [c.name, c]));
    const targetMap = new Map(targetConstraints.map((c) => [c.name, c]));

    const allConstraintNames = new Set([
      ...sourceMap.keys(),
      ...targetMap.keys(),
    ]);

    for (const constraintName of allConstraintNames) {
      const sourceConstraint = sourceMap.get(constraintName);
      const targetConstraint = targetMap.get(constraintName);

      if (sourceConstraint && targetConstraint) {
        if (
          sourceConstraint.definition !== targetConstraint.definition ||
          sourceConstraint.isEnabled !== targetConstraint.isEnabled
        ) {
          differences.push({
            constraintName,
            constraintType: sourceConstraint.type,
            differenceType: "Modified",
            details: ["Constraint definition or enabled state differs"],
          });
        }
      } else if (sourceConstraint && !targetConstraint) {
        differences.push({
          constraintName,
          constraintType: sourceConstraint.type,
          differenceType: "Removed",
          details: ["Constraint removed"],
        });
      } else if (!sourceConstraint && targetConstraint) {
        differences.push({
          constraintName,
          constraintType: targetConstraint.type,
          differenceType: "Added",
          details: ["Constraint added"],
        });
      }
    }

    return differences;
  }

  /**
   * Compare column constraints
   */
  private compareColumnConstraints(
    sourceConstraints: any[],
    targetConstraints: any[]
  ): ConstraintDifference[] {
    const differences: ConstraintDifference[] = [];

    const sourceMap = new Map(sourceConstraints.map((c) => [c.name, c]));
    const targetMap = new Map(targetConstraints.map((c) => [c.name, c]));

    const allConstraintNames = new Set([
      ...sourceMap.keys(),
      ...targetMap.keys(),
    ]);

    for (const constraintName of allConstraintNames) {
      const sourceConstraint = sourceMap.get(constraintName);
      const targetConstraint = targetMap.get(constraintName);

      if (sourceConstraint && targetConstraint) {
        if (sourceConstraint.definition !== targetConstraint.definition) {
          differences.push({
            constraintName,
            constraintType: sourceConstraint.type,
            differenceType: "Modified",
            details: ["Constraint definition differs"],
          });
        }
      } else if (sourceConstraint && !targetConstraint) {
        differences.push({
          constraintName,
          constraintType: sourceConstraint.type,
          differenceType: "Removed",
          details: ["Constraint removed"],
        });
      } else if (!sourceConstraint && targetConstraint) {
        differences.push({
          constraintName,
          constraintType: targetConstraint.type,
          differenceType: "Added",
          details: ["Constraint added"],
        });
      }
    }

    return differences;
  }

  /**
   * Filter objects based on comparison options
   */
  private filterObjects(
    objects: DatabaseObject[],
    options: SchemaComparisonOptions
  ): DatabaseObject[] {
    let filtered = objects;

    // Filter by schemas to ignore
    if (options.ignoreSchemas && options.ignoreSchemas.length > 0) {
      filtered = filtered.filter(
        (obj) => !options.ignoreSchemas!.includes(obj.schema)
      );
    }

    // Filter by object types
    if (options.objectTypes && options.objectTypes.length > 0) {
      filtered = filtered.filter((obj) =>
        options.objectTypes!.includes(obj.type)
      );
    }

    // Filter system objects
    if (!options.includeSystemObjects) {
      const systemSchemas = ["information_schema", "pg_catalog", "pg_toast"];
      filtered = filtered.filter((obj) => !systemSchemas.includes(obj.schema));
    }

    return filtered;
  }

  /**
   * Compare object arrays to find differences
   */
  private compareObjectArrays(
    source: DatabaseObject[],
    target: DatabaseObject[],
    mode: "strict" | "lenient"
  ): SchemaDifference[] {
    const differences: SchemaDifference[] = [];

    // Create lookup maps for efficient comparison
    const sourceMap = new Map<string, DatabaseObject>();
    const targetMap = new Map<string, DatabaseObject>();

    source.forEach((obj) => {
      const key = `${obj.type}:${obj.schema}:${obj.name}`;
      sourceMap.set(key, obj);
    });

    target.forEach((obj) => {
      const key = `${obj.type}:${obj.schema}:${obj.name}`;
      targetMap.set(key, obj);
    });

    // Find added, removed, and modified objects
    for (const [key, sourceObj] of Array.from(sourceMap)) {
      const targetObj = targetMap.get(key);

      if (!targetObj) {
        differences.push({
          type: "Removed",
          objectType: sourceObj.type,
          objectName: sourceObj.name,
          schema: sourceObj.schema,
          sourceDefinition: sourceObj.definition || undefined,
          differenceDetails: ["Object exists in source but not in target"],
        });
      } else if (this.objectsDiffer(sourceObj, targetObj, mode)) {
        differences.push({
          type: "Modified",
          objectType: sourceObj.type,
          objectName: sourceObj.name,
          schema: sourceObj.schema,
          sourceDefinition: sourceObj.definition || undefined,
          targetDefinition: targetObj.definition || undefined,
          differenceDetails: this.getDifferenceDetails(
            sourceObj,
            targetObj,
            mode
          ),
        });
      }
    }

    // Find added objects
    for (const [key, targetObj] of Array.from(targetMap)) {
      if (!sourceMap.has(key)) {
        differences.push({
          type: "Added",
          objectType: targetObj.type,
          objectName: targetObj.name,
          schema: targetObj.schema,
          targetDefinition: targetObj.definition || undefined,
          differenceDetails: ["Object exists in target but not in source"],
        });
      }
    }

    return differences;
  }

  /**
   * Check if two objects differ based on comparison mode
   */
  private objectsDiffer(
    source: DatabaseObject,
    target: DatabaseObject,
    mode: "strict" | "lenient"
  ): boolean {
    if (mode === "strict") {
      return (
        source.definition !== target.definition ||
        source.owner !== target.owner ||
        source.sizeInBytes !== target.sizeInBytes
      );
    } else {
      // Lenient mode: ignore formatting and whitespace differences
      const sourceDef = this.normalizeDefinition(source.definition || "");
      const targetDef = this.normalizeDefinition(target.definition || "");
      return sourceDef !== targetDef;
    }
  }

  /**
   * Normalize definition for comparison
   */
  private normalizeDefinition(definition: string): string {
    return definition
      .replace(/\s+/g, " ") // Normalize whitespace
      .replace(/;\s*$/, "") // Remove trailing semicolon
      .trim()
      .toLowerCase();
  }

  /**
   * Get detailed difference information
   */
  private getDifferenceDetails(
    source: DatabaseObject,
    target: DatabaseObject,
    _mode: "strict" | "lenient"
  ): string[] {
    const details: string[] = [];

    if (source.definition !== target.definition) {
      details.push("Definition differs");
    }
    if (source.owner !== target.owner) {
      details.push(`Owner differs: ${source.owner} vs ${target.owner}`);
    }
    if (source.sizeInBytes !== target.sizeInBytes) {
      details.push(
        `Size differs: ${source.sizeInBytes} vs ${target.sizeInBytes} bytes`
      );
    }
    return details;
  }

  /**
   * Generate unique ID for comparison
   */
  private generateId(): string {
    return crypto.randomUUID();
  }

  /**
   * Get connection info for a connection ID
   */
  private async getConnectionInfo(
    connectionId: string
  ): Promise<ConnectionInfo> {
    const connection = await this.schemaOperations.getObjectDetails(
      connectionId,
      "connection",
      "",
      ""
    );
    // This would need to be implemented properly based on how connections are stored
    throw new Error("Connection info extraction not implemented");
  }

  /**
    * Extract column metadata using native service
    */
  private async extractColumnMetadata(
    connection: ConnectionInfo,
    tableName: string,
    schema: string
  ): Promise<NativeColumnMetadata[]> {
    const nativeService = PostgreSqlConnectionManager.getInstance();
    return await nativeService.extractColumnMetadata(
      connection,
      tableName,
      schema
    );
  }

  /**
    * Extract index metadata using native service
    */
  private async extractIndexMetadata(
    connection: ConnectionInfo,
    tableName: string,
    schema: string
  ): Promise<NativeIndexMetadata[]> {
    const nativeService = PostgreSqlConnectionManager.getInstance();
    return await nativeService.extractIndexMetadata(
      connection,
      tableName,
      schema
    );
  }

  /**
    * Extract constraint metadata using native service
    */
  private async extractConstraintMetadata(
    connection: ConnectionInfo,
    tableName: string,
    schema: string
  ): Promise<NativeConstraintMetadata[]> {
    const nativeService = PostgreSqlConnectionManager.getInstance();
    return await nativeService.extractConstraintMetadata(
      connection,
      tableName,
      schema
    );
  }

  /**
    * Extract view metadata using native service
    */
  private async extractViewMetadata(
    connection: ConnectionInfo,
    viewName: string,
    schema: string
  ): Promise<NativeViewMetadata[]> {
    const nativeService = PostgreSqlConnectionManager.getInstance();
    return await nativeService.extractViewMetadata(
      connection,
      viewName,
      schema
    );
  }

  /**
    * Analyze view dependencies from metadata
    */
  private analyzeViewDependenciesFromMetadata(
    sourceViewMetadata: NativeViewMetadata[],
    targetViewMetadata: NativeViewMetadata[]
  ): ViewDependencyNode | null {
    if (sourceViewMetadata.length > 0 || targetViewMetadata.length > 0) {
      const viewMeta = sourceViewMetadata[0] || targetViewMetadata[0];
      return {
        viewName: viewMeta.name,
        schema: viewMeta.schema,
        dependencies: viewMeta.dependencies.map(dep => ({
          type: dep.type,
          name: dep.name,
          schema: dep.schema
        })),
        dependents: [],
        level: 0,
      };
    }
    return null;
  }

  /**
   * Check if data types are compatible
   */
  private areDataTypesCompatible(
    sourceType: string,
    targetType: string
  ): boolean {
    // Basic compatibility check - could be enhanced with more sophisticated type mapping
    const compatibleTypes = new Map([
      ["integer", ["bigint", "numeric", "real", "double precision"]],
      ["bigint", ["numeric"]],
      ["numeric", ["real", "double precision"]],
      ["varchar", ["text", "character varying"]],
      ["text", ["varchar", "character varying"]],
    ]);

    const compatible = compatibleTypes.get(sourceType.toLowerCase());
    return compatible?.includes(targetType.toLowerCase()) || false;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    Logger.info("SchemaComparison disposed", "dispose");
  }
}
