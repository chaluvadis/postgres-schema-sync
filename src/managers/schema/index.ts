// Schema Management Module Index
// Provides clean exports for all schema management functionality

// Main modular schema manager
export { ModularSchemaManager } from './ModularSchemaManager';

// Export as SchemaManager for backward compatibility
export { ModularSchemaManager as SchemaManager } from './ModularSchemaManager';

// Core modules
export { SchemaOperations } from './SchemaOperations';
export { SchemaComparison } from './SchemaComparison';
export { MetadataManagement } from './MetadataManagement';
export { DependencyAnalysis } from './DependencyAnalysis';
export { ImpactAnalysis } from './ImpactAnalysis';
export { MigrationManagement } from './MigrationManagement';
export { PerformanceAnalysis } from './PerformanceAnalysis';

// Re-export key interfaces for backward compatibility (selective exports to avoid conflicts)
export * from './SchemaOperations';
export * from './SchemaComparison';
export * from './MetadataManagement';

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
    GraphMetadata
} from './DependencyAnalysis';

export {
    BasicImpactAnalysis,
    AdvancedImpactAnalysis,
    BusinessImpactAssessment,
    TechnicalImpactAssessment,
    RollbackPlan,
    MigrationPath,
    RiskMitigation,
    StakeholderImpact
} from './ImpactAnalysis';

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
    ValidationResult
} from './MigrationManagement';

// TODO: ConflictResolution and PerformanceAnalysis modules need to be created
// For now, commenting out broken imports to fix compilation errors
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

// TODO: Re-enable when ConflictResolution module is created
// Export the class with a different name to avoid conflicts
// export { ConflictResolution as ConflictResolutionService } from './ConflictResolution';

// TODO: PerformanceAnalysis module needs to be created
// export {
//     PerformanceTrend,
//     DataPoint,
//     SystemPerformanceTrend,
//     PerformanceRecommendation,
//     PerformanceAlert,
//     PerformanceBaseline,
//     BaselineMetric,
//     SystemBaselineMetric
// } from './PerformanceAnalysis';