import { ConnectionManager } from "../ConnectionManager";
import { Logger } from "@/utils/Logger";
import { DotNetIntegrationService } from "@/services/DotNetIntegrationService";
import { ExtensionInitializer } from "@/utils/ExtensionInitializer";
import { ConflictResolutionService } from "@/services/ConflictResolutionService";
import { ValidationFramework } from "../../core/ValidationFramework";
import { QueryExecutionService } from "@/services/QueryExecutionService";

// Import all the modular components
import { SchemaOperations } from "./SchemaOperations";
import { SchemaComparison } from "./SchemaComparison";
import { MetadataManagement } from "./MetadataManagement";
import { DependencyAnalysis } from "./DependencyAnalysis";
import { ImpactAnalysis } from "./ImpactAnalysis";
import { MigrationManagement } from "./MigrationManagement";
import { PerformanceAnalysis } from "./PerformanceAnalysis";

// Re-export key interfaces for backward compatibility (selective exports to avoid conflicts)
export * from "./SchemaOperations";
export * from "./SchemaComparison";
export * from "./MetadataManagement";

// Export specific interfaces from other modules to avoid naming conflicts
export {
  RichDependencyGraph,
  RichDependencyNode,
  RichDependencyEdge,
  RelationshipMetrics,
  DependencyCluster,
  LineageChain,
  ObjectLineage,
  DependencyAnalysisReport,
  DependencySummary,
  DependencyRecommendation,
  DependencyRiskAssessment,
  RiskFactor,
  OptimizationOpportunity,
  DependencyGraphVisualization,
  DependencyGraphNode,
  GraphLayout,
  GraphMetadata,
} from "./DependencyAnalysis";

export {
  BasicImpactAnalysis,
  AdvancedImpactAnalysis,
  BusinessImpactAssessment,
  TechnicalImpactAssessment,
  RollbackPlan,
  MigrationPath,
  RiskMitigation,
  StakeholderImpact,
} from "./ImpactAnalysis";

export {
  EnhancedMigrationScript,
  SchemaSnapshot,
  MigrationStep,
  PreCondition,
  PostCondition,
  RollbackScript,
  ValidationStep,
  MigrationDependency,
  MigrationMetadata,
  MigrationExecutionResult,
  ExecutionLogEntry,
  MigrationPerformanceMetrics,
  ValidationResult,
} from "./MigrationManagement";

// TODO: ConflictResolution module needs to be created
// For now, commenting out exports to fix compilation errors
// export {
//     ConflictResolutionStrategyInfo,
//     ConflictType,
//     SchemaConflict,
//     ConflictDetail,
//     ConflictResolution,
//     RollbackInfo,
//     ConflictResolutionSession,
//     ResolutionProgress,
//     ConflictAnalysis,
//     ResolutionResult
// } from './ConflictResolution';

// PerformanceAnalysis module is now implemented and exported
export {
  DataPoint,
  SystemPerformanceTrend,
  PerformanceRecommendation,
  PerformanceAlert,
  PerformanceBaseline,
  BaselineMetric,
  SystemBaselineMetric
} from './PerformanceAnalysis';

/**
 * ModularSchemaManager - Simplified schema manager using consolidated services
 * This class provides a clean interface to schema management functionality
 */
export class ModularSchemaManager {
  private connectionManager: ConnectionManager;
  private dotNetService: DotNetIntegrationService;
  private queryService: QueryExecutionService;
  private validationFramework: ValidationFramework;

  // Modular components
  private schemaOperations: SchemaOperations;
  private schemaComparison: SchemaComparison;
  private metadataManagement: MetadataManagement;
  private dependencyAnalysis: DependencyAnalysis;
  private impactAnalysis: ImpactAnalysis;
  private migrationManagement: MigrationManagement;
  private conflictResolutionService: ConflictResolutionService;
  private performanceAnalysis: PerformanceAnalysis;

  constructor(
    connectionManager: ConnectionManager,
    queryService: QueryExecutionService,
    validationFramework: ValidationFramework
  ) {
    this.connectionManager = connectionManager;
    this.dotNetService = DotNetIntegrationService.getInstance();
    this.queryService = queryService;
    this.validationFramework = validationFramework;

    // Initialize all modular components
    this.schemaOperations = new SchemaOperations(connectionManager);
    this.metadataManagement = new MetadataManagement(
      this.schemaOperations,
      connectionManager
    );
    this.schemaComparison = new SchemaComparison(this.schemaOperations);
    this.dependencyAnalysis = new DependencyAnalysis(this.metadataManagement);
    this.impactAnalysis = new ImpactAnalysis(
      this.schemaComparison,
      this.dependencyAnalysis
    );
    this.migrationManagement = new MigrationManagement(
      this.queryService,
      this.validationFramework
    );
    this.conflictResolutionService = new ConflictResolutionService();
    this.performanceAnalysis = new PerformanceAnalysis(this.queryService);

    Logger.info(
      "ModularSchemaManager initialized with all components",
      "ModularSchemaManager"
    );
  }

  // ========== DELEGATED METHODS FROM SCHEMA OPERATIONS ==========

  /**
   * Get database objects for a connection
   */
  async getDatabaseObjects(connectionId: string, schemaFilter?: string) {
    return this.schemaOperations.getDatabaseObjects(connectionId, schemaFilter);
  }

  /**
   * Get object details
   */
  async getObjectDetails(
    connectionId: string,
    objectType: string,
    schema: string,
    objectName: string
  ) {
    return this.schemaOperations.getObjectDetails(
      connectionId,
      objectType,
      schema,
      objectName
    );
  }

  /**
   * Get database objects with caching
   */
  async getDatabaseObjectsWithCache(
    connectionId: string,
    schemaFilter?: string
  ) {
    return this.schemaOperations.getDatabaseObjectsWithCache(
      connectionId,
      schemaFilter
    );
  }

  /**
   * Clear schema cache
   */
  clearSchemaCache(connectionId?: string): void {
    this.schemaOperations.clearSchemaCache(connectionId);
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.schemaOperations.getCacheStats();
  }

  // ========== DELEGATED METHODS FROM SCHEMA COMPARISON ==========

  /**
   * Compare schemas between two connections
   */
  async compareSchemas(
    sourceConnectionId: string,
    targetConnectionId: string,
    options?: any
  ) {
    return this.schemaComparison.compareSchemas(
      sourceConnectionId,
      targetConnectionId,
      options
    );
  }

  /**
   * Compare schemas with detailed metadata
   */
  async compareSchemasDetailed(
    sourceConnectionId: string,
    targetConnectionId: string,
    options?: any
  ) {
    return this.schemaComparison.compareSchemasDetailed(
      sourceConnectionId,
      targetConnectionId,
      options
    );
  }

  // ========== DELEGATED METHODS FROM METADATA MANAGEMENT ==========

  /**
   * Get rich metadata object with caching
   */
  async getRichMetadataObject(
    connectionId: string,
    objectType: string,
    schema: string,
    objectName: string,
    options?: any
  ) {
    return this.metadataManagement.getRichMetadataObject(
      connectionId,
      objectType,
      schema,
      objectName,
      options
    );
  }

  /**
   * Invalidate cache entries
   */
  async invalidateCacheEntries(pattern?: string) {
    return this.metadataManagement.invalidateCacheEntries(pattern);
  }

  /**
   * Get cache analytics
   */
  async getCacheAnalytics() {
    return this.metadataManagement.getCacheAnalytics();
  }

  /**
   * Optimize cache performance
   */
  async optimizeCachePerformance() {
    return this.metadataManagement.optimizeCachePerformance();
  }

  // ========== DELEGATED METHODS FROM DEPENDENCY ANALYSIS ==========

  /**
   * Build rich dependency graph
   */
  async buildRichDependencyGraph(connectionId: string, objectIds?: string[]) {
    return this.dependencyAnalysis.buildRichDependencyGraph(
      connectionId,
      objectIds
    );
  }

  /**
   * Get object lineage
   */
  async getObjectLineage(
    connectionId: string,
    objectType: string,
    schema: string,
    objectName: string,
    direction?: any,
    maxDepth?: number
  ) {
    return this.dependencyAnalysis.getObjectLineage(
      connectionId,
      objectType,
      schema,
      objectName,
      direction,
      maxDepth
    );
  }

  /**
   * Resolve dependencies
   */
  async resolveDependencies(
    connectionId: string,
    objectIds: string[],
    direction?: any
  ) {
    return this.dependencyAnalysis.resolveDependencies(
      connectionId,
      objectIds,
      direction
    );
  }

  /**
   * Generate dependency analysis report
   */
  async generateDependencyAnalysisReport(
    connectionId: string,
    objectIds?: string[]
  ) {
    return this.dependencyAnalysis.generateDependencyAnalysisReport(
      connectionId,
      objectIds
    );
  }

  // ========== DELEGATED METHODS FROM IMPACT ANALYSIS ==========

  /**
   * Perform advanced impact analysis
   */
  async performAdvancedImpactAnalysis(
    sourceConnectionId: string,
    targetConnectionId: string,
    schemaChanges: any[],
    options?: any
  ) {
    return this.impactAnalysis.performAdvancedImpactAnalysis(
      sourceConnectionId,
      targetConnectionId,
      schemaChanges,
      options
    );
  }

  // ========== DELEGATED METHODS FROM MIGRATION MANAGEMENT ==========

  /**
   * Generate enhanced migration script
   */
  async generateEnhancedMigrationScript(
    sourceConnectionId: string,
    targetConnectionId: string,
    schemaChanges: any[],
    options?: any
  ) {
    return this.migrationManagement.generateEnhancedMigrationScript(
      sourceConnectionId,
      targetConnectionId,
      schemaChanges,
      options
    );
  }

  /**
   * Execute migration script
   */
  async executeMigrationScript(
    script: any,
    connectionId: string,
    options?: any
  ) {
    return this.migrationManagement.executeMigrationScript(
      script,
      connectionId,
      options
    );
  }

  /**
   * Validate migration script
   */
  async validateMigrationScript(script: any, connectionId: string) {
    return this.migrationManagement.validateMigrationScript(
      script,
      connectionId
    );
  }

  // ========== DELEGATED METHODS FROM CONFLICT RESOLUTION ==========

  /**
   * Detect schema conflicts
   */
  async detectSchemaConflicts(
    sourceConnectionId: string,
    targetConnectionId: string,
    schemaChanges: any[]
  ) {
    return this.conflictResolutionService.detectSchemaConflicts(
      sourceConnectionId,
      targetConnectionId,
      schemaChanges
    );
  }

  /**
   * Create conflict resolution session
   */
  async createConflictResolutionSession(
    sourceConnectionId: string,
    targetConnectionId: string,
    conflicts: any[],
    options?: any
  ) {
    return this.conflictResolutionService.createConflictResolutionSession(
      sourceConnectionId,
      targetConnectionId,
      conflicts,
      options
    );
  }

  /**
   * Resolve conflicts automatically
   */
  async resolveConflictsAutomatically(sessionId: string) {
    return this.conflictResolutionService.resolveConflictsAutomatically(
      sessionId
    );
  }

  /**
   * Generate conflict resolution script
   */
  async generateConflictResolutionScript(session: any, resolutions: any[]) {
    return this.conflictResolutionService.generateConflictResolutionScript(
      session,
      resolutions
    );
  }

  // ========== DELEGATED METHODS FROM PERFORMANCE ANALYSIS ==========

  /**
   * Analyze performance trends in realtime
   */
  async analyzePerformanceTrends(
    connectionId: string,
    objectIds?: string[],
    timeRange?: { start: Date; end: Date; interval?: "hour" | "day" | "week" }
  ) {
    return this.performanceAnalysis.analyzePerformanceTrends(
      connectionId,
      objectIds,
      timeRange
    );
  }

  /**
   * Create performance baseline in realtime
   */
  async createPerformanceBaseline(
    connectionId: string,
    baselineName: string,
    objectIds?: string[]
  ) {
    return this.performanceAnalysis.createPerformanceBaseline(
      connectionId,
      baselineName,
      objectIds
    );
  }

  // ========== ADDITIONAL COORDINATION METHODS ==========

  /**
   * Perform comprehensive schema analysis
   */
  async performComprehensiveSchemaAnalysis(
    sourceConnectionId: string,
    targetConnectionId: string,
    options: {
      includePerformanceAnalysis?: boolean;
      includeDependencyAnalysis?: boolean;
      includeImpactAnalysis?: boolean;
      includeConflictResolution?: boolean;
    } = {}
  ) {
    try {
      Logger.info(
        "Starting comprehensive schema analysis",
        "performComprehensiveSchemaAnalysis",
        {
          sourceConnectionId,
          targetConnectionId,
          options,
        }
      );

      // Step 1: Basic schema comparison
      const schemaComparison = await this.compareSchemasDetailed(
        sourceConnectionId,
        targetConnectionId
      );

      // Step 2: Performance analysis (if requested)
      let performanceAnalysis;
      if (options.includePerformanceAnalysis) {
        try {
          performanceAnalysis = await this.analyzePerformanceTrends(
            sourceConnectionId
          );
          Logger.info(
            "Performance analysis completed successfully",
            "performComprehensiveSchemaAnalysis"
          );
        } catch (error) {
          Logger.warn(
            "Performance analysis failed, skipping",
            "performComprehensiveSchemaAnalysis",
            { error: (error as Error).message }
          );
        }
      }

      // Step 3: Dependency analysis (if requested)
      let dependencyAnalysis;
      if (options.includeDependencyAnalysis) {
        try {
          const allObjectIds = [
            ...(schemaComparison.sourceObjectCount > 0
              ? ["source_objects"]
              : []),
            ...(schemaComparison.targetObjectCount > 0
              ? ["target_objects"]
              : []),
          ];
          dependencyAnalysis = await this.generateDependencyAnalysisReport(
            sourceConnectionId
          );
          dependencyAnalysis = await this.generateDependencyAnalysisReport(
            targetConnectionId
          );
        } catch (error) {
          Logger.warn(
            "Dependency analysis not available, skipping",
            "performComprehensiveSchemaAnalysis",
            { error: (error as Error).message }
          );
        }
      }

      // Step 4: Impact analysis (if requested)
      let impactAnalysis;
      if (
        options.includeImpactAnalysis &&
        schemaComparison.differences.length > 0
      ) {
        try {
          impactAnalysis = await this.performAdvancedImpactAnalysis(
            sourceConnectionId,
            targetConnectionId,
            schemaComparison.differences
          );
        } catch (error) {
          Logger.warn(
            "Impact analysis not available, skipping",
            "performComprehensiveSchemaAnalysis",
            { error: (error as Error).message }
          );
        }
      }

      // Step 5: Conflict resolution (if requested)
      let conflictResolution;
      if (
        options.includeConflictResolution &&
        schemaComparison.differences.length > 0
      ) {
        try {
          const conflicts = await this.detectSchemaConflicts(
            sourceConnectionId,
            targetConnectionId,
            schemaComparison.differences
          );
          if (conflicts && (conflicts as any).length > 0) {
            const session = await this.createConflictResolutionSession(
              sourceConnectionId,
              targetConnectionId,
              conflicts as any
            );
            if (session && (session as any).id) {
              conflictResolution = {
                session,
                conflicts,
                autoResolutions: await this.resolveConflictsAutomatically(
                  (session as any).id
                ),
              };
            }
          }
        } catch (error) {
          Logger.warn(
            "Conflict resolution not available, skipping",
            "performComprehensiveSchemaAnalysis",
            { error: (error as Error).message }
          );
        }
      }

      const comprehensiveResult = {
        schemaComparison,
        performanceAnalysis,
        dependencyAnalysis,
        impactAnalysis,
        conflictResolution,
        analysisTimestamp: new Date(),
        analysisScope: {
          sourceConnectionId,
          targetConnectionId,
          options,
        },
      };

      Logger.info(
        "Comprehensive schema analysis completed",
        "performComprehensiveSchemaAnalysis",
        {
          schemaDifferences: schemaComparison.differences.length,
          performanceAnalysisIncluded: !!performanceAnalysis,
          dependencyAnalysisIncluded: !!dependencyAnalysis,
          impactAnalysisIncluded: !!impactAnalysis,
          conflictResolutionIncluded: !!conflictResolution,
        }
      );

      return comprehensiveResult;
    } catch (error) {
      Logger.error("Comprehensive schema analysis failed", error as Error);
      throw error;
    }
  }

  /**
   * Get system health overview
   */
  async getSystemHealthOverview(connectionId: string) {
    try {
      Logger.info("Getting system health overview", "getSystemHealthOverview", {
        connectionId,
      });

      const [cacheAnalytics, dependencyReport] = await Promise.all([
        this.getCacheAnalytics(),
        this.generateDependencyAnalysisReport(connectionId),
      ]);

      // Performance analysis temporarily disabled due to missing module
      const healthOverview = {
        connectionId,
        timestamp: new Date(),
        cache: {
          hitRate: cacheAnalytics.hitRate,
          memoryUsage: cacheAnalytics.memoryUsage,
          totalRequests: cacheAnalytics.totalRequests,
          recommendations: cacheAnalytics.recommendations,
        },
        performance: {
          overallHealth: "good", // Will be updated with real data
          concerningTrends: [],
          positiveTrends: [],
          recommendations: 0,
          alerts: 0,
        },
        dependencies: {
          totalObjects: dependencyReport.summary.totalObjects,
          totalDependencies: dependencyReport.summary.totalDependencies,
          riskLevel: dependencyReport.riskAssessment.overallRisk,
          recommendations: dependencyReport.recommendations.length,
          optimizationOpportunities:
            dependencyReport.optimizationOpportunities.length,
        },
      };

      Logger.info(
        "System health overview generated",
        "getSystemHealthOverview",
        {
          connectionId,
          cacheHitRate: `${healthOverview.cache.hitRate.toFixed(2)}%`,
          performanceHealth: healthOverview.performance.overallHealth,
          dependencyRisk: healthOverview.dependencies.riskLevel,
        }
      );

      return healthOverview;
    } catch (error) {
      Logger.error("Failed to get system health overview", error as Error);
      throw error;
    }
  }

  /**
   * Dispose of all resources
   */
  async dispose(): Promise<void> {
    Logger.info("Disposing ModularSchemaManager and all components");

    // Dispose all components
    this.schemaOperations.dispose();
    this.schemaComparison.dispose();
    this.metadataManagement.dispose();
    this.dependencyAnalysis.dispose();
    this.impactAnalysis.dispose();
    this.migrationManagement.dispose();
    this.conflictResolutionService.dispose();
    this.performanceAnalysis.dispose();

    Logger.info("ModularSchemaManager disposed successfully");
  }

  // ========== GETTER METHODS FOR ACCESSING COMPONENTS ==========

  /**
   * Get schema operations component
   */
  getSchemaOperations(): SchemaOperations {
    return this.schemaOperations;
  }

  /**
   * Get schema comparison component
   */
  getSchemaComparison(): SchemaComparison {
    return this.schemaComparison;
  }

  /**
   * Get metadata management component
   */
  getMetadataManagement(): MetadataManagement {
    return this.metadataManagement;
  }

  /**
   * Get dependency analysis component
   */
  getDependencyAnalysis(): DependencyAnalysis {
    return this.dependencyAnalysis;
  }

  /**
   * Get impact analysis component
   */
  getImpactAnalysis(): ImpactAnalysis {
    return this.impactAnalysis;
  }

  /**
   * Get migration management component
   */
  getMigrationManagement(): MigrationManagement {
    return this.migrationManagement;
  }

  /**
   * Get conflict resolution component
   */
  getConflictResolution(): ConflictResolutionService {
    return this.conflictResolutionService;
  }

  /**
   * Get performance analysis component
   */
  getPerformanceAnalysis(): PerformanceAnalysis {
    return this.performanceAnalysis;
  }

}
