// Export the main schema manager
export { ModularSchemaManager } from './ModularSchemaManager';

// Export core interfaces and types
export type {
    SchemaCache,
    ExtendedConnectionInfo,
    EnvironmentInfo,
    ConnectionComparisonMetadata
} from './SchemaOperations';

// Export additional interfaces from other modules
export type {
    RichMetadataObject,
    ObjectMetadata,
    ObjectStatistics,
    PermissionInfo,
    DependencyInfo,
    ChangeRecord,
    ValidationStatus,
    PerformanceMetrics,
    MetadataCacheEntry,
    CachePerformanceMetrics,
    IntelligentCacheConfig,
    CacheAnalytics,
    CacheRecommendation
} from './MetadataManagement';

export type {
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
    GraphMetadata
} from './DependencyAnalysis';

export type {
    BasicImpactAnalysis,
    AdvancedImpactAnalysis,
    BusinessImpactAssessment,
    TechnicalImpactAssessment,
    RollbackPlan,
    MigrationPath,
    RiskMitigation,
    StakeholderImpact
} from './ImpactAnalysis';

export type {
    EnhancedMigrationScript,
    SchemaSnapshot,
    MigrationStep,
    PreCondition,
    PostCondition,
    RollbackScript,
    ValidationStep,
    MigrationDependency,
    MigrationExecutionResult,
    ExecutionLogEntry,
    ValidationResult
} from './MigrationTypes';

// Export classes
export { SchemaOperations } from './SchemaOperations';
export { SchemaComparison } from './SchemaComparison';
export { MetadataManagement } from './MetadataManagement';
export { DependencyAnalysis } from './DependencyAnalysis';
export { ImpactAnalysis } from './ImpactAnalysis';
export { MigrationManagement } from './MigrationManagement';