// Export the main schema manager

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

export { MetadataManagement } from "./MetadataManagement";
export { MigrationManagement } from "./MigrationManagement";
export { SchemaComparison } from "./SchemaComparison";
// Export classes
export { SchemaOperations } from "./SchemaOperations";
