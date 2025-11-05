// Export the main schema manager

export type {
	DependencyAnalysisReport,
	DependencyCluster,
	DependencyGraphNode,
	DependencyGraphVisualization,
	DependencyRecommendation,
	DependencyRiskAssessment,
	DependencySummary,
	GraphLayout,
	GraphMetadata,
	LineageChain,
	ObjectLineage,
	OptimizationOpportunity,
	RelationshipMetrics,
	RichDependencyEdge,
	RichDependencyGraph,
	RichDependencyNode,
	RiskFactor,
} from "./DependencyAnalysis";
export type {
	AdvancedImpactAnalysis,
	BasicImpactAnalysis,
	BusinessImpactAssessment,
	MigrationPath,
	RiskMitigation,
	RollbackPlan,
	StakeholderImpact,
	TechnicalImpactAssessment,
} from "./ImpactAnalysis";

// Export additional interfaces from other modules
export type {
	CacheAnalytics,
	CachePerformanceMetrics,
	CacheRecommendation,
	ChangeRecord,
	DependencyInfo,
	IntelligentCacheConfig,
	MetadataCacheEntry,
	ObjectMetadata,
	ObjectStatistics,
	PerformanceMetrics,
	PermissionInfo,
	RichMetadataObject,
	ValidationStatus,
} from "./MetadataManagement";
export { ModularSchemaManager } from "./ModularSchemaManager";
// Export core interfaces and types
export type {
	ConnectionComparisonMetadata,
	EnvironmentInfo,
	ExtendedConnectionInfo,
	SchemaCache,
} from "./SchemaOperations";

// Migration types are now defined inline in their respective modules
// to reduce complexity and improve maintainability

export { DependencyAnalysis } from "./DependencyAnalysis";
export { ImpactAnalysis } from "./ImpactAnalysis";
export { MetadataManagement } from "./MetadataManagement";
export { MigrationManagement } from "./MigrationManagement";
export { SchemaComparison } from "./SchemaComparison";
// Export classes
export { SchemaOperations } from "./SchemaOperations";
