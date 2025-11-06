import { QueryExecutionService } from "@/services/QueryExecutionService";
import { ValidationFramework } from "../../core/ValidationFramework";
import { ConnectionManager } from "../ConnectionManager";
import { SchemaComparison } from "./SchemaComparison";
import { SchemaOperations } from "./SchemaOperations";
export {
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
export {
	AdvancedImpactAnalysis,
	BasicImpactAnalysis,
	BusinessImpactAssessment,
	MigrationPath,
	RiskMitigation,
	RollbackPlan,
	StakeholderImpact,
	TechnicalImpactAssessment,
} from "./ImpactAnalysis";
export * from "./MetadataManagement";
export {
	EnhancedMigrationScript,
	ExecutionLogEntry,
	MigrationDependency,
	MigrationExecutionResult,
	MigrationStep,
	PostCondition,
	PreCondition,
	RollbackScript,
	SchemaSnapshot,
	ValidationResult,
	ValidationStep,
} from "./MigrationTypes";

export * from "./SchemaComparison";
export class ModularSchemaManager {
	private connectionManager: ConnectionManager;
	private queryService: QueryExecutionService;
	private validationFramework: ValidationFramework;

	// Modular components
	private schemaOperations: SchemaOperations;
	private schemaComparison: SchemaComparison;
	constructor(
		connectionManager: ConnectionManager,
		queryService: QueryExecutionService,
		validationFramework: ValidationFramework,
	) {
		this.connectionManager = connectionManager;
		this.queryService = queryService;
		this.validationFramework = validationFramework;
		this.schemaOperations = new SchemaOperations(connectionManager);
		this.schemaComparison = new SchemaComparison(this.schemaOperations);
	}
	async getDatabaseObjects(connectionId: string, schemaFilter?: string) {
		return await this.schemaOperations.getDatabaseObjects(connectionId, schemaFilter);
	}

	async compareSchemasDetailed(sourceConnectionId: string, targetConnectionId: string, options?: any) {
		return this.schemaComparison.compareSchemasDetailed(sourceConnectionId, targetConnectionId, options);
	}
}
