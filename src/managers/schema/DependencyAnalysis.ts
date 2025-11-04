import {
  MetadataManagement,
  RichMetadataObject,
  DependencyInfo,
} from "./MetadataManagement";
import { Logger } from "@/utils/Logger";
export interface RichDependencyGraph {
  nodes: Map<string, RichDependencyNode>;
  edges: RichDependencyEdge[];
  metadata: GraphMetadata;
  clusters: DependencyCluster[];
  relationshipStrengths: Map<string, number>;
  lineageChains: LineageChain[];
}
export interface RichDependencyNode {
  id: string;
  name: string;
  type: string;
  schema: string;
  level: number;
  richMetadata: RichMetadataObject;
  relationshipMetrics: RelationshipMetrics;
  clusterId?: string;
  centralityScore: number;
  influenceScore: number;
  stabilityScore: number;
}
export interface RichDependencyEdge {
  id: string;
  source: string;
  target: string;
  type: "depends_on" | "referenced_by" | "parent_of" | "child_of";
  strength: number; // 0-1 scale
  relationshipType: "structural" | "functional" | "data_flow" | "control_flow";
  confidence: number; // 0-1 scale
  lastValidated?: Date;
  validationMethod: "automatic" | "manual" | "inferred";
  metadata: EdgeMetadata;
}
export interface EdgeMetadata {
  interactionFrequency?: number;
  dataVolume?: number;
  performanceImpact?: number;
  businessCriticality: "low" | "medium" | "high" | "critical";
  maintenanceCost: "low" | "medium" | "high";
}
export interface RelationshipMetrics {
  dependencyCount: number;
  dependentCount: number;
  relationshipStrength: number;
  couplingDegree: "loose" | "moderate" | "tight" | "critical";
  cohesionLevel: "low" | "medium" | "high";
  complexityScore: number;
  maintainabilityIndex: number;
}
export interface DependencyCluster {
  id: string;
  name: string;
  description: string;
  nodes: string[];
  clusterType: "functional" | "technical" | "business" | "infrastructure";
  cohesion: number; // 0-1 scale
  coupling: number; // 0-1 scale
  stability: number; // 0-1 scale
  businessValue: "low" | "medium" | "high" | "critical";
}
export interface LineageChain {
  id: string;
  name: string;
  description: string;
  objects: string[];
  chainType: "data_lineage" | "process_lineage" | "system_lineage";
  direction: "upstream" | "downstream" | "bidirectional";
  length: number;
  complexity: "simple" | "moderate" | "complex";
  businessImpact: "low" | "medium" | "high" | "critical";
}
export interface ObjectLineage {
  objectId: string;
  upstreamObjects: LineageObject[];
  downstreamObjects: LineageObject[];
  lineageDepth: number;
  confidence: number;
  lastUpdated: Date;
}
export interface LineageObject {
  objectId: string;
  objectType: string;
  relationshipType: string;
  distance: number; // hops from source object
  transformation?: string; // how data is transformed
  confidence: number;
}
export interface DependencyResolutionResult {
  resolved: boolean;
  dependencies: DependencyInfo[];
  circularDependencies: CircularDependency[];
  resolutionOrder: string[];
  estimatedComplexity: "simple" | "moderate" | "complex";
  warnings: string[];
}
export interface CircularDependency {
  tables: string[];
  constraints: string[];
  severity: "warning" | "error";
  description: string;
}
export interface DependencyAnalysisReport {
  summary: DependencySummary;
  recommendations: DependencyRecommendation[];
  riskAssessment: DependencyRiskAssessment;
  optimizationOpportunities: OptimizationOpportunity[];
  visualization: DependencyGraphVisualization;
}
export interface DependencySummary {
  totalObjects: number;
  totalDependencies: number;
  averageDependenciesPerObject: number;
  maxDependencyDepth: number;
  circularDependencyCount: number;
  stronglyConnectedComponents: number;
  orphanedObjects: number;
  overDependentObjects: number;
}
export interface DependencyRecommendation {
  type: "optimization" | "refactoring" | "warning" | "error";
  priority: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  affectedObjects: string[];
  estimatedEffort: "low" | "medium" | "high";
  potentialImpact: string;
  implementationSteps: string[];
}
export interface DependencyRiskAssessment {
  overallRisk: "low" | "medium" | "high" | "critical";
  riskFactors: RiskFactor[];
  mitigationStrategies: string[];
  monitoringRecommendations: string[];
}
export interface RiskFactor {
  type:
    | "circular_dependency"
    | "deep_dependency"
    | "over_dependence"
    | "orphaned_object";
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  affectedObjects: string[];
  potentialImpact: string;
}
export interface OptimizationOpportunity {
  type:
    | "remove_redundant"
    | "simplify_chain"
    | "consolidate_objects"
    | "optimize_order";
  title: string;
  description: string;
  affectedObjects: string[];
  estimatedBenefit: string;
  implementationComplexity: "low" | "medium" | "high";
  prerequisites: string[];
}
export interface DependencyGraphVisualization {
  nodes: DependencyGraphNode[];
  edges: DependencyGraphEdge[];
  layout: GraphLayout;
  metadata: GraphMetadata;
}
export interface DependencyGraphNode {
  id: string;
  label: string;
  type: string;
  schema: string;
  position: { x: number; y: number };
  size: number;
  color: string;
  metadata: Record<string, any>;
}
export interface DependencyGraphEdge {
  id: string;
  source: string;
  target: string;
  type: "depends_on" | "referenced_by" | "parent_of" | "child_of";
  strength: "weak" | "medium" | "strong";
  style: "solid" | "dashed" | "dotted";
  label?: string;
}
export interface GraphLayout {
  type: "hierarchical" | "circular" | "force_directed" | "grid";
  width: number;
  height: number;
  padding: number;
  nodeSpacing: number;
  levelSpacing: number;
}
export interface GraphMetadata {
  totalNodes: number;
  totalEdges: number;
  maxDepth: number;
  circularDependencies: number;
  stronglyConnectedComponents: number;
  generationTime: number;
}
export class DependencyAnalysis {
  private metadataManagement: MetadataManagement;
  constructor(metadataManagement: MetadataManagement) {
    this.metadataManagement = metadataManagement;
  }
  async buildRichDependencyGraph(
    connectionId: string,
    objectIds?: string[]
  ): Promise<RichDependencyGraph> {
    try {
      Logger.info(
        "Building rich dependency graph",
        "buildRichDependencyGraph",
        {
          connectionId,
          objectCount: objectIds?.length || "all",
        }
      );

      // Get rich metadata for objects
      const objects = objectIds
        ? await Promise.all(
            objectIds.map((id) => {
              const [objectType, schema, objectName] = id.split(":");
              return this.metadataManagement.getRichMetadataObject(
                connectionId,
                objectType,
                schema,
                objectName,
                {
                  includeDependencies: true,
                  includePerformance: true,
                }
              );
            })
          )
        : await this.getAllRichMetadataObjects(connectionId);

      if (objects.length === 0) {
        throw new Error("No objects found for dependency graph");
      }

      // Build rich dependency nodes
      const richNodes = new Map<string, RichDependencyNode>();
      for (const obj of objects) {
        const node = await this.buildRichDependencyNode(obj, objects);
        richNodes.set(obj.id, node);
      }

      // Build rich dependency edges
      const richEdges: RichDependencyEdge[] = [];
      for (const obj of objects) {
        const edges = await this.buildRichDependencyEdges(obj, objects);
        richEdges.push(...edges);
      }

      // Identify clusters
      const clusters = await this.identifyDependencyClusters(
        objects,
        richNodes,
        richEdges
      );

      // Calculate relationship strengths
      const relationshipStrengths =
        this.calculateRelationshipStrengths(richEdges);

      // Build lineage chains
      const lineageChains = await this.buildLineageChains(
        objects,
        richNodes,
        richEdges
      );

      const metadata: GraphMetadata = {
        totalNodes: richNodes.size,
        totalEdges: richEdges.length,
        maxDepth: this.calculateMaxDepthFromNodes(richNodes),
        circularDependencies: 0, // Would be calculated from cycle detection
        stronglyConnectedComponents: clusters.length,
        generationTime: Date.now(),
      };

      const richGraph: RichDependencyGraph = {
        nodes: richNodes,
        edges: richEdges,
        metadata,
        clusters,
        relationshipStrengths,
        lineageChains,
      };

      Logger.info(
        "Rich dependency graph completed",
        "buildRichDependencyGraph",
        {
          nodeCount: richNodes.size,
          edgeCount: richEdges.length,
          clusterCount: clusters.length,
          lineageChainCount: lineageChains.length,
        }
      );

      return richGraph;
    } catch (error) {
      Logger.error("Failed to build rich dependency graph", error as Error);
      throw error;
    }
  }
  async getObjectLineage(
    connectionId: string,
    objectType: string,
    schema: string,
    objectName: string,
    direction: "upstream" | "downstream" | "both" = "both",
    maxDepth: number = 5
  ): Promise<ObjectLineage> {
    try {
      Logger.info("Getting object lineage", "getObjectLineage", {
        connectionId,
        objectType,
        objectName,
        direction,
        maxDepth,
      });

      const objectId = `${connectionId}:${objectType}:${schema}:${objectName}`;

      // Get the source object with full dependency information
      const sourceObject = await this.metadataManagement.getRichMetadataObject(
        connectionId,
        objectType,
        schema,
        objectName,
        {
          includeDependencies: true,
          includePerformance: true,
        }
      );

      if (!sourceObject) {
        throw new Error(`Object ${objectName} not found`);
      }

      const upstreamObjects: LineageObject[] = [];
      const downstreamObjects: LineageObject[] = [];
      const visitedObjects = new Set<string>();

      if (direction === "upstream" || direction === "both") {
        await this.traceUpstreamLineage(
          sourceObject,
          upstreamObjects,
          visitedObjects,
          maxDepth,
          0,
          connectionId
        );
      }

      if (direction === "downstream" || direction === "both") {
        await this.traceDownstreamLineage(
          sourceObject,
          downstreamObjects,
          visitedObjects,
          maxDepth,
          0,
          connectionId
        );
      }

      // Calculate overall lineage depth
      const maxUpstreamDepth = Math.max(
        ...upstreamObjects.map((obj) => obj.distance),
        0
      );
      const maxDownstreamDepth = Math.max(
        ...downstreamObjects.map((obj) => obj.distance),
        0
      );
      const lineageDepth = Math.max(maxUpstreamDepth, maxDownstreamDepth);

      // Calculate overall confidence based on individual object confidences
      const allObjects = [...upstreamObjects, ...downstreamObjects];
      const averageConfidence =
        allObjects.length > 0
          ? allObjects.reduce((sum, obj) => sum + obj.confidence, 0) /
            allObjects.length
          : 1.0;

      const lineage: ObjectLineage = {
        objectId,
        upstreamObjects,
        downstreamObjects,
        lineageDepth,
        confidence: Math.round(averageConfidence * 100) / 100,
        lastUpdated: new Date(),
      };

      Logger.info("Object lineage retrieved", "getObjectLineage", {
        objectId,
        upstreamCount: upstreamObjects.length,
        downstreamCount: downstreamObjects.length,
        maxDepth: lineage.lineageDepth,
        averageConfidence: lineage.confidence,
      });

      return lineage;
    } catch (error) {
      Logger.error("Failed to get object lineage", error as Error);
      throw error;
    }
  }
  async resolveDependencies(
    connectionId: string,
    objectIds: string[],
    direction: "dependencies" | "dependents" | "both" = "both"
  ): Promise<DependencyResolutionResult> {
    try {
      Logger.info("Resolving dependencies", "resolveDependencies", {
        connectionId,
        objectCount: objectIds.length,
        direction,
      });

      const dependencies: DependencyInfo[] = [];
      const circularDependencies: CircularDependency[] = [];
      const resolutionOrder: string[] = [];
      const warnings: string[] = [];

      // Get rich metadata for all objects
      const richObjects = await Promise.all(
        objectIds.map((id) => {
          const [objectType, schema, objectName] = id.split(":");
          return this.metadataManagement.getRichMetadataObject(
            connectionId,
            objectType,
            schema,
            objectName,
            {
              includeDependencies: true,
              includePerformance: true,
            }
          );
        })
      );

      // Build dependency graph
      const dependencyGraph = this.buildDependencyGraph(richObjects);

      // Detect circular dependencies
      const circularDeps = this.detectCircularDependencies(dependencyGraph);
      circularDependencies.push(...circularDeps);

      if (circularDeps.length > 0) {
        warnings.push(`${circularDeps.length} circular dependencies detected`);
      }

      // Resolve dependency order using topological sort
      const resolvedOrder = this.topologicalSort(dependencyGraph);

      // Extract dependencies based on direction
      for (const objectId of objectIds) {
        if (direction === "dependencies" || direction === "both") {
          const objectDeps =
            richObjects.find((obj) => obj.id === objectId)?.dependencies || [];
          dependencies.push(...objectDeps);
        }

        if (direction === "dependents" || direction === "both") {
          const objectDependents =
            richObjects.find((obj) => obj.id === objectId)?.dependents || [];
          dependencies.push(...objectDependents);
        }
      }

      const complexity = this.assessResolutionComplexity(
        dependencies,
        circularDependencies
      );

      const result: DependencyResolutionResult = {
        resolved: circularDependencies.length === 0,
        dependencies: [...new Set(dependencies)], // Remove duplicates
        circularDependencies,
        resolutionOrder: resolvedOrder,
        estimatedComplexity: complexity,
        warnings,
      };

      Logger.info("Dependency resolution completed", "resolveDependencies", {
        connectionId,
        totalDependencies: dependencies.length,
        circularDependencies: circularDependencies.length,
        complexity,
      });

      return result;
    } catch (error) {
      Logger.error("Dependency resolution failed", error as Error);
      throw error;
    }
  }
  async generateDependencyAnalysisReport(
    connectionId: string,
    objectIds?: string[]
  ): Promise<DependencyAnalysisReport> {
    try {
      Logger.info(
        "Generating comprehensive dependency analysis report",
        "generateDependencyAnalysisReport",
        {
          connectionId,
          objectCount: objectIds?.length || "all",
        }
      );

      // Get all objects if not specified
      const objects = objectIds
        ? await Promise.all(
            objectIds.map((id) => {
              const [objectType, schema, objectName] = id.split(":");
              return this.metadataManagement.getRichMetadataObject(
                connectionId,
                objectType,
                schema,
                objectName,
                {
                  includeDependencies: true,
                  includePerformance: true,
                }
              );
            })
          )
        : await this.getAllRichMetadataObjects(connectionId);

      if (objects.length === 0) {
        throw new Error("No objects found for dependency analysis");
      }

      // Generate dependency summary
      const summary = this.generateDependencySummary(objects);

      // Generate recommendations
      const recommendations = this.generateDependencyRecommendations(
        objects,
        summary
      );

      // Assess risks
      const riskAssessment = this.assessDependencyRisks(objects, summary);

      // Find optimization opportunities
      const optimizationOpportunities = this.findOptimizationOpportunities(
        objects,
        summary
      );

      // Generate visualization
      const visualization = this.generateDependencyVisualization(objects);

      const report: DependencyAnalysisReport = {
        summary,
        recommendations,
        riskAssessment,
        optimizationOpportunities,
        visualization,
      };

      Logger.info(
        "Dependency analysis report generated",
        "generateDependencyAnalysisReport",
        {
          connectionId,
          objectCount: objects.length,
          totalDependencies: summary.totalDependencies,
          circularDependencies: summary.circularDependencyCount,
          recommendationsCount: recommendations.length,
          optimizationOpportunitiesCount: optimizationOpportunities.length,
        }
      );

      return report;
    } catch (error) {
      Logger.error(
        "Failed to generate dependency analysis report",
        error as Error
      );
      throw error;
    }
  }
  private async buildRichDependencyNode(
    obj: RichMetadataObject,
    allObjects: RichMetadataObject[]
  ): Promise<RichDependencyNode> {
    // Calculate relationship metrics
    const relationshipMetrics = this.calculateRelationshipMetrics(
      obj,
      allObjects
    );

    // Calculate centrality and influence scores
    const centralityScore = this.calculateCentralityScore(obj, allObjects);
    const influenceScore = this.calculateInfluenceScore(obj, allObjects);
    const stabilityScore = this.calculateStabilityScore(obj);

    return {
      id: obj.id,
      name: obj.name,
      type: obj.type,
      schema: obj.schema,
      level: 0, // Would be calculated from graph traversal
      richMetadata: obj,
      relationshipMetrics,
      centralityScore,
      influenceScore,
      stabilityScore,
    };
  }
  private calculateRelationshipMetrics(
    obj: RichMetadataObject,
    allObjects: RichMetadataObject[]
  ): RelationshipMetrics {
    const dependencyCount = obj.dependencies.length;
    const dependentCount = this.countDependents(obj, allObjects);

    // Calculate relationship strength (0-1 scale)
    const totalRelationships = dependencyCount + dependentCount;
    const maxPossibleRelationships = allObjects.length - 1;
    const relationshipStrength =
      maxPossibleRelationships > 0
        ? Math.min(totalRelationships / maxPossibleRelationships, 1)
        : 0;

    // Determine coupling degree
    const couplingDegree =
      relationshipStrength > 0.8
        ? "critical"
        : relationshipStrength > 0.6
        ? "tight"
        : relationshipStrength > 0.3
        ? "moderate"
        : "loose";

    // Calculate cohesion (simplified)
    const cohesionLevel =
      dependencyCount > 0 && dependentCount > 0
        ? "high"
        : dependencyCount > 0 || dependentCount > 0
        ? "medium"
        : "low";

    // Calculate complexity score
    const complexityScore = Math.min(
      dependencyCount * 0.3 + dependentCount * 0.4 + relationshipStrength * 100,
      100
    );

    // Calculate maintainability index (inverse of complexity)
    const maintainabilityIndex = Math.max(0, 100 - complexityScore);

    return {
      dependencyCount,
      dependentCount,
      relationshipStrength,
      couplingDegree,
      cohesionLevel,
      complexityScore,
      maintainabilityIndex,
    };
  }
  private countDependents(
    obj: RichMetadataObject,
    allObjects: RichMetadataObject[]
  ): number {
    return allObjects.filter((otherObj) =>
      otherObj.dependencies.some((dep) => dep.objectId === obj.id)
    ).length;
  }
  private calculateCentralityScore(
    obj: RichMetadataObject,
    allObjects: RichMetadataObject[]
  ): number {
    // Calculate how central this object is in the dependency graph
    const directConnections =
      obj.dependencies.length + this.countDependents(obj, allObjects);
    const maxConnections = allObjects.length - 1;

    return maxConnections > 0 ? directConnections / maxConnections : 0;
  }
  private calculateInfluenceScore(
    obj: RichMetadataObject,
    allObjects: RichMetadataObject[]
  ): number {
    // Calculate influence based on dependents and relationship strength
    const dependentCount = this.countDependents(obj, allObjects);
    const influence = dependentCount * 0.6 + obj.dependencies.length * 0.4;

    return Math.min(influence / 10, 1); // Normalize to 0-1 scale
  }
  private calculateStabilityScore(obj: RichMetadataObject): number {
    // Calculate stability based on object type and dependencies
    let baseStability = 0.5; // Default stability

    switch (obj.type) {
      case "table":
        baseStability = 0.8; // Tables are generally stable
        break;
      case "view":
        baseStability = 0.6; // Views depend on other objects
        break;
      case "function":
        baseStability = 0.7; // Functions are moderately stable
        break;
      case "index":
        baseStability = 0.4; // Indexes can be volatile
        break;
      default:
        baseStability = 0.5;
    }

    // Adjust based on dependency count
    const dependencyFactor = Math.max(0, 1 - obj.dependencies.length * 0.1);
    return Math.min(baseStability * dependencyFactor, 1);
  }
  private async buildRichDependencyEdges(
    obj: RichMetadataObject,
    allObjects: RichMetadataObject[]
  ): Promise<RichDependencyEdge[]> {
    const edges: RichDependencyEdge[] = [];

    // Build edges for dependencies
    for (const dep of obj.dependencies) {
      const targetObj = allObjects.find((o) => o.id === dep.objectId);
      if (targetObj) {
        const strength = this.calculateEdgeStrength(obj, targetObj, dep);
        const relationshipType = this.determineObjectRelationshipType(
          obj,
          targetObj,
          dep
        );

        edges.push({
          id: `${obj.id}_${dep.objectId}`,
          source: obj.id,
          target: dep.objectId,
          type: "depends_on",
          strength,
          relationshipType,
          confidence: 0.9, // High confidence for direct dependencies
          lastValidated: new Date(),
          validationMethod: "automatic",
          metadata: {
            businessCriticality: this.assessBusinessCriticality(obj, targetObj),
            maintenanceCost: this.assessMaintenanceCost(obj, targetObj),
          },
        });
      }
    }

    // Build edges for dependents (reverse relationships)
    for (const otherObj of allObjects) {
      if (otherObj.id === obj.id) {continue;}

      const isDependent = otherObj.dependencies.some(
        (dep) => dep.objectId === obj.id
      );
      if (isDependent) {
        const strength = this.calculateEdgeStrength(
          otherObj,
          obj,
          otherObj.dependencies.find((dep) => dep.objectId === obj.id)!
        );

        edges.push({
          id: `${otherObj.id}_${obj.id}`,
          source: otherObj.id,
          target: obj.id,
          type: "referenced_by",
          strength,
          relationshipType: "data_flow", // Dependents typically have data flow relationships
          confidence: 0.8,
          lastValidated: new Date(),
          validationMethod: "inferred",
          metadata: {
            businessCriticality: this.assessBusinessCriticality(otherObj, obj),
            maintenanceCost: this.assessMaintenanceCost(otherObj, obj),
          },
        });
      }
    }

    return edges;
  }
  private calculateEdgeStrength(
    source: RichMetadataObject,
    target: RichMetadataObject,
    dependency: DependencyInfo
  ): number {
    // Calculate relationship strength based on multiple factors
    let strength = 0.5; // Base strength

    // Impact level contributes to strength
    switch (dependency.impactLevel) {
      case "critical":
        strength += 0.3;
        break;
      case "high":
        strength += 0.2;
        break;
      case "medium":
        strength += 0.1;
        break;
      case "low":
        strength += 0;
        break;
    }

    // Dependency type contributes to strength
    if (dependency.dependencyType === "hard") {
      strength += 0.2;
    }

    // Object type compatibility affects strength
    if (this.areObjectTypesCompatible(source.type, target.type)) {
      strength += 0.1;
    }

    return Math.min(strength, 1);
  }
  private areObjectTypesCompatible(type1: string, type2: string): boolean {
    const compatiblePairs = [
      ["table", "view"],
      ["table", "index"],
      ["view", "table"],
      ["function", "table"],
      ["table", "function"],
    ];

    return compatiblePairs.some(
      ([t1, t2]) =>
        (t1 === type1 && t2 === type2) || (t1 === type2 && t2 === type1)
    );
  }
  private assessBusinessCriticality(
    source: RichMetadataObject,
    target: RichMetadataObject
  ): "low" | "medium" | "high" | "critical" {
    // Assess business criticality of the relationship
    if (source.type === "table" && target.type === "table") {
      return "high"; // Table-to-table relationships are typically critical
    }
    if (source.type === "view" && target.type === "table") {
      return "medium"; // Views depending on tables are moderately critical
    }

    return "low";
  }
  private assessMaintenanceCost(
    source: RichMetadataObject,
    target: RichMetadataObject
  ): "low" | "medium" | "high" {
    // Assess maintenance cost of the relationship
    if (source.type === "view" && target.type === "table") {
      return "medium"; // Views depending on tables require moderate maintenance
    }
    if (source.type === "function" && target.type === "table") {
      return "high"; // Functions depending on tables can be complex to maintain
    }

    return "low";
  }
  private determineObjectRelationshipType(
    source: RichMetadataObject,
    target: RichMetadataObject,
    dependency: DependencyInfo
  ): "structural" | "functional" | "data_flow" | "control_flow" {
    // Enhanced relationship type determination based on comprehensive analysis

    // First, consider the dependency type and impact level
    const baseRelationship =
      this.getBaseRelationshipFromDependencyType(dependency);
    if (baseRelationship !== "unknown") {
      return baseRelationship;
    }

    // Then analyze object type combinations for more specific classification
    const objectTypeRelationship = this.getRelationshipFromObjectTypes(
      source.type,
      target.type,
      dependency
    );
    if (objectTypeRelationship !== "unknown") {
      return objectTypeRelationship;
    }

    // Consider the nature of the dependency description and metadata
    const semanticRelationship = this.getSemanticRelationship(
      source,
      target,
      dependency
    );
    if (semanticRelationship !== "unknown") {
      return semanticRelationship;
    }

    // Fallback to intelligent defaults based on common patterns
    return this.getDefaultRelationship(source, target);
  }

  private getBaseRelationshipFromDependencyType(
    dependency: DependencyInfo
  ): "structural" | "functional" | "data_flow" | "control_flow" | "unknown" {
    // Analyze dependency type and impact to determine base relationship
    if (
      dependency.impactLevel === "critical" &&
      dependency.dependencyType === "hard"
    ) {
      return "structural";
    }

    if (
      dependency.description?.toLowerCase().includes("trigger") ||
      dependency.description?.toLowerCase().includes("constraint")
    ) {
      return "control_flow";
    }

    if (
      dependency.description?.toLowerCase().includes("view") ||
      dependency.description?.toLowerCase().includes("select")
    ) {
      return "data_flow";
    }

    return "unknown";
  }

  private getRelationshipFromObjectTypes(
    sourceType: string,
    targetType: string,
    dependency: DependencyInfo
  ): "structural" | "functional" | "data_flow" | "control_flow" | "unknown" {
    // Enhanced comprehensive object type relationship mapping for PostgreSQL objects

    // Normalize object types for comparison
    const normalizedSourceType = sourceType.toLowerCase();
    const normalizedTargetType = targetType.toLowerCase();

    // Check for foreign key relationships in table-to-table dependencies
    if (normalizedSourceType === "table" && normalizedTargetType === "table") {
      const description = (dependency.description || "").toLowerCase();
      if (
        description.includes("foreign key") ||
        description.includes("references") ||
        description.includes("fk_") ||
        description.includes("ref_")
      ) {
        return "structural";
      }
      // Check for inheritance relationships
      if (
        description.includes("inherits") ||
        description.includes("parent") ||
        description.includes("child")
      ) {
        return "structural";
      }
      // Default table-to-table relationship is data flow (joins, etc.)
      return "data_flow";
    }

    // View relationships - views typically read from other objects
    if (normalizedSourceType === "view") {
      if (normalizedTargetType === "table") {return "data_flow";}
      if (normalizedTargetType === "view") {return "data_flow";} // Chained views
      if (normalizedTargetType === "function") {return "functional";}
      if (normalizedTargetType === "index") {return "structural";} // Indexed views
    }

    // Function relationships - functions can read from or modify data
    if (normalizedSourceType === "function") {
      if (normalizedTargetType === "table") {
        // Check if function modifies table (INSERT/UPDATE/DELETE)
        const description = (dependency.description || "").toLowerCase();
        if (
          description.includes("insert") ||
          description.includes("update") ||
          description.includes("delete") ||
          description.includes("modify")
        ) {
          return "control_flow";
        }
        return "functional"; // Read-only functions
      }
      if (normalizedTargetType === "view") {return "functional";}
      if (normalizedTargetType === "function") {return "functional";} // Function calls
      if (normalizedTargetType === "type") {return "structural";} // Typed functions
    }

    // Index relationships - indexes support tables and views
    if (normalizedSourceType === "index") {
      if (normalizedTargetType === "table") {return "structural";}
      if (normalizedTargetType === "view") {return "structural";}
      if (normalizedTargetType === "column") {return "structural";}
    }

    // Constraint relationships - enforce data integrity
    if (normalizedSourceType === "constraint") {
      if (normalizedTargetType === "table") {return "structural";}
      if (normalizedTargetType === "column") {return "structural";}
      if (normalizedTargetType === "domain") {return "structural";}
    }

    // Trigger relationships - respond to table events
    if (normalizedSourceType === "trigger") {
      if (normalizedTargetType === "table") {return "control_flow";}
      if (normalizedTargetType === "function") {return "control_flow";} // Trigger functions
      if (normalizedTargetType === "view") {return "control_flow";}
    }

    // Sequence relationships - provide auto-incrementing values
    if (normalizedSourceType === "sequence") {
      if (normalizedTargetType === "table") {return "functional";}
      if (normalizedTargetType === "column") {return "functional";}
      if (normalizedTargetType === "function") {return "functional";}
    }

    // Type/Domain relationships - define data types
    if (normalizedSourceType === "type" || normalizedSourceType === "domain") {
      if (normalizedTargetType === "table") {return "structural";}
      if (normalizedTargetType === "column") {return "structural";}
      if (normalizedTargetType === "function") {return "structural";}
      if (normalizedTargetType === "domain") {return "structural";}
    }

    // Column relationships - columns are part of tables
    if (normalizedSourceType === "column") {
      if (normalizedTargetType === "table") {return "structural";}
      if (normalizedTargetType === "index") {return "structural";}
      if (normalizedTargetType === "constraint") {return "structural";}
      if (normalizedTargetType === "type") {return "structural";}
      if (normalizedTargetType === "domain") {return "structural";}
    }

    // Schema relationships - schemas contain objects
    if (normalizedSourceType === "schema") {
      if (
        [
          "table",
          "view",
          "function",
          "index",
          "constraint",
          "trigger",
          "sequence",
          "type",
          "domain",
        ].includes(normalizedTargetType)
      ) {
        return "structural";
      }
    }

    // Role/User relationships - security and permissions
    if (normalizedSourceType === "role" || normalizedSourceType === "user") {
      if (
        ["table", "view", "function", "schema", "database"].includes(
          normalizedTargetType
        )
      ) {
        return "structural";
      }
    }

    // Tablespace relationships - storage allocation
    if (normalizedSourceType === "tablespace") {
      if (["table", "index", "database"].includes(normalizedTargetType)) {
        return "structural";
      }
    }

    // Extension relationships - PostgreSQL extensions
    if (normalizedSourceType === "extension") {
      if (
        ["function", "type", "table", "schema"].includes(normalizedTargetType)
      ) {
        return "structural";
      }
    }

    // Materialized view relationships - pre-computed views
    if (normalizedSourceType === "materialized view") {
      if (normalizedTargetType === "table") {return "data_flow";}
      if (normalizedTargetType === "view") {return "data_flow";}
      if (normalizedTargetType === "function") {return "functional";}
      if (normalizedTargetType === "index") {return "structural";}
    }

    // Foreign table relationships - external data sources
    if (normalizedSourceType === "foreign table") {
      if (normalizedTargetType === "table") {return "data_flow";}
      if (normalizedTargetType === "server") {return "structural";}
      if (normalizedTargetType === "schema") {return "structural";}
    }

    // Partition relationships - table partitioning
    if (normalizedSourceType === "partition") {
      if (normalizedTargetType === "table") {return "structural";}
      if (normalizedTargetType === "index") {return "structural";}
    }

    // Policy relationships - row-level security
    if (normalizedSourceType === "policy") {
      if (normalizedTargetType === "table") {return "structural";}
      if (normalizedTargetType === "role") {return "structural";}
    }

    // Rule relationships - query rewrite rules
    if (normalizedSourceType === "rule") {
      if (normalizedTargetType === "table") {return "control_flow";}
      if (normalizedTargetType === "view") {return "control_flow";}
    }

    // Operator relationships - custom operators
    if (normalizedSourceType === "operator") {
      if (normalizedTargetType === "function") {return "functional";}
      if (normalizedTargetType === "type") {return "structural";}
    }

    // Collation relationships - text sorting rules
    if (normalizedSourceType === "collation") {
      if (normalizedTargetType === "column") {return "structural";}
      if (normalizedTargetType === "database") {return "structural";}
    }

    // Cast relationships - type conversion rules
    if (normalizedSourceType === "cast") {
      if (normalizedTargetType === "type") {return "functional";}
      if (normalizedTargetType === "function") {return "functional";}
    }

    // Aggregate relationships - aggregate functions
    if (normalizedSourceType === "aggregate") {
      if (normalizedTargetType === "function") {return "functional";}
      if (normalizedTargetType === "type") {return "structural";}
    }

    // Language relationships - procedural languages
    if (normalizedSourceType === "language") {
      if (normalizedTargetType === "function") {return "structural";}
      if (normalizedTargetType === "procedure") {return "structural";}
    }

    // Default fallback - no specific relationship identified
    return "unknown";
  }

  private getSemanticRelationship(
    source: RichMetadataObject,
    target: RichMetadataObject,
    dependency: DependencyInfo
  ): "structural" | "functional" | "data_flow" | "control_flow" | "unknown" {
    const description = (dependency.description || "").toLowerCase();

    // Control flow indicators
    if (
      description.includes("trigger") ||
      description.includes("procedure") ||
      description.includes("execute") ||
      description.includes("call")
    ) {
      return "control_flow";
    }

    // Data flow indicators
    if (
      description.includes("select") ||
      description.includes("insert") ||
      description.includes("update") ||
      description.includes("delete") ||
      description.includes("query") ||
      description.includes("view")
    ) {
      return "data_flow";
    }

    // Structural indicators
    if (
      description.includes("foreign key") ||
      description.includes("primary key") ||
      description.includes("unique") ||
      description.includes("check") ||
      description.includes("constraint") ||
      description.includes("index") ||
      description.includes("reference") ||
      description.includes("schema")
    ) {
      return "structural";
    }

    // Functional indicators
    if (
      description.includes("function") ||
      description.includes("calculate") ||
      description.includes("compute") ||
      description.includes("transform") ||
      description.includes("aggregate") ||
      description.includes("join")
    ) {
      return "functional";
    }

    // Analyze based on object names and patterns
    if (this.hasControlFlowPattern(source.name, target.name)) {
      return "control_flow";
    }

    if (this.hasDataFlowPattern(source.name, target.name)) {
      return "data_flow";
    }

    return "unknown";
  }

  private hasControlFlowPattern(
    sourceName: string,
    targetName: string
  ): boolean {
    const controlFlowPrefixes = ["trg_", "trigger_", "proc_", "sp_", "fn_"];
    const controlFlowSuffixes = ["_trigger", "_proc", "_sp", "_fn", "_handler"];

    const sourceLower = sourceName.toLowerCase();
    const targetLower = targetName.toLowerCase();

    return (
      controlFlowPrefixes.some(
        (prefix) =>
          sourceLower.startsWith(prefix) || targetLower.startsWith(prefix)
      ) ||
      controlFlowSuffixes.some(
        (suffix) => sourceLower.endsWith(suffix) || targetLower.endsWith(suffix)
      )
    );
  }

  private hasDataFlowPattern(sourceName: string, targetName: string): boolean {
    const dataFlowPrefixes = ["vw_", "view_", "qry_", "query_"];
    const dataFlowSuffixes = ["_view", "_vw", "_report", "_summary"];

    const sourceLower = sourceName.toLowerCase();
    const targetLower = targetName.toLowerCase();

    return (
      dataFlowPrefixes.some(
        (prefix) =>
          sourceLower.startsWith(prefix) || targetLower.startsWith(prefix)
      ) ||
      dataFlowSuffixes.some(
        (suffix) => sourceLower.endsWith(suffix) || targetLower.endsWith(suffix)
      )
    );
  }

  private getDefaultRelationship(
    source: RichMetadataObject,
    target: RichMetadataObject
  ): "structural" | "functional" | "data_flow" | "control_flow" {
    // Intelligent defaults based on PostgreSQL object characteristics

    // Default mappings based on common PostgreSQL patterns
    const defaultMappings: Record<
      string,
      Record<string, "structural" | "functional" | "data_flow" | "control_flow">
    > = {
      table: {
        table: "data_flow",
        view: "data_flow",
        function: "functional",
        index: "structural",
        constraint: "structural",
        trigger: "control_flow",
        sequence: "functional",
        type: "structural",
      },
      view: {
        table: "data_flow",
        view: "data_flow",
        function: "functional",
        index: "structural",
      },
      function: {
        table: "functional",
        view: "functional",
        function: "functional",
        type: "structural",
      },
      index: {
        table: "structural",
        view: "structural",
      },
      constraint: {
        table: "structural",
        column: "structural",
      },
      trigger: {
        table: "control_flow",
        function: "control_flow",
      },
    };

    const sourceDefaults = defaultMappings[source.type];
    if (sourceDefaults && sourceDefaults[target.type]) {
      return sourceDefaults[target.type];
    }

    // Final fallback based on general object type characteristics
    if (target.type === "table") {
      return "data_flow"; // Most objects interact with tables through data flow
    }

    if (source.type === "function" || target.type === "function") {
      return "functional"; // Functions typically have functional relationships
    }

    return "structural"; // Most conservative default
  }
  private async identifyDependencyClusters(
    objects: RichMetadataObject[],
    nodes: Map<string, RichDependencyNode>,
    edges: RichDependencyEdge[]
  ): Promise<DependencyCluster[]> {
    const clusters: DependencyCluster[] = [];

    try {
      const schemaGroups = new Map<string, string[]>();

      for (const obj of objects) {
        if (!schemaGroups.has(obj.schema)) {
          schemaGroups.set(obj.schema, []);
        }
        schemaGroups.get(obj.schema)!.push(obj.id);
      }

      // Create clusters for each schema
      let clusterIndex = 0;
      for (const [schema, objectIds] of schemaGroups.entries()) {
        const clusterNodes = objectIds
          .map((id) => nodes.get(id)!)
          .filter(Boolean);

        if (clusterNodes.length > 1) {
          // Only create clusters with multiple nodes
          const cohesion = this.calculateClusterCohesion(clusterNodes, edges);
          const coupling = this.calculateClusterCoupling(
            clusterNodes,
            edges,
            nodes
          );
          const stability = this.calculateClusterStability(clusterNodes);

          clusters.push({
            id: `cluster_${clusterIndex++}`,
            name: `${schema} Objects`,
            description: `Database objects in schema ${schema}`,
            nodes: objectIds,
            clusterType: "technical",
            cohesion,
            coupling,
            stability,
            businessValue: this.assessClusterBusinessValue(clusterNodes),
          });
        }
      }

      Logger.debug(
        "Dependency clusters identified",
        "identifyDependencyClusters",
        {
          clusterCount: clusters.length,
          schemaGroups: schemaGroups.size,
        }
      );
    } catch (error) {
      Logger.warn(
        "Failed to identify dependency clusters",
        "identifyDependencyClusters",
        {
          error: (error as Error).message,
        }
      );
    }

    return clusters;
  }
  private calculateClusterCohesion(
    nodes: RichDependencyNode[],
    edges: RichDependencyEdge[]
  ): number {
    // Calculate how well-connected nodes within the cluster are
    const clusterNodeIds = new Set(nodes.map((n) => n.id));
    const internalEdges = edges.filter(
      (edge) =>
        clusterNodeIds.has(edge.source) && clusterNodeIds.has(edge.target)
    );

    const maxPossibleEdges = (nodes.length * (nodes.length - 1)) / 2;
    return maxPossibleEdges > 0 ? internalEdges.length / maxPossibleEdges : 0;
  }
  private calculateClusterCoupling(
    clusterNodes: RichDependencyNode[],
    allEdges: RichDependencyEdge[],
    allNodes: Map<string, RichDependencyNode>
  ): number {
    // Calculate how much the cluster depends on external nodes
    const clusterNodeIds = new Set(clusterNodes.map((n) => n.id));
    const externalEdges = allEdges.filter(
      (edge) =>
        (clusterNodeIds.has(edge.source) && !clusterNodeIds.has(edge.target)) ||
        (!clusterNodeIds.has(edge.source) && clusterNodeIds.has(edge.target))
    );

    const maxPossibleExternalEdges =
      clusterNodes.length * (allNodes.size - clusterNodes.length);
    return maxPossibleExternalEdges > 0
      ? externalEdges.length / maxPossibleExternalEdges
      : 0;
  }
  private calculateClusterStability(nodes: RichDependencyNode[]): number {
    // Calculate average stability of nodes in the cluster
    const totalStability = nodes.reduce(
      (sum, node) => sum + node.stabilityScore,
      0
    );
    return nodes.length > 0 ? totalStability / nodes.length : 0;
  }
  private assessClusterBusinessValue(
    nodes: RichDependencyNode[]
  ): "low" | "medium" | "high" | "critical" {
    // Assess business value based on node types and relationships
    const hasTables = nodes.some((node) => node.type === "table");
    const hasViews = nodes.some((node) => node.type === "view");
    const hasFunctions = nodes.some((node) => node.type === "function");

    if (hasTables && (hasViews || hasFunctions)) {return "high";}
    if (hasTables) {return "medium";}
    return "low";
  }
  private calculateRelationshipStrengths(
    edges: RichDependencyEdge[]
  ): Map<string, number> {
    const strengths = new Map<string, number>();

    for (const edge of edges) {
      strengths.set(edge.id, edge.strength);
    }

    return strengths;
  }
  private async buildLineageChains(
    objects: RichMetadataObject[],
    nodes: Map<string, RichDependencyNode>,
    edges: RichDependencyEdge[]
  ): Promise<LineageChain[]> {
    const chains: LineageChain[] = [];

    try {
      // Use the pre-built graph structure to identify lineage patterns
      // Group edges by relationship type to identify data flow patterns
      const dataFlowEdges = edges.filter(
        (edge) => edge.relationshipType === "data_flow"
      );
      const functionalEdges = edges.filter(
        (edge) => edge.relationshipType === "functional"
      );
      const structuralEdges = edges.filter(
        (edge) => edge.relationshipType === "structural"
      );

      // Build data lineage chains using the existing graph structure
      for (const obj of objects) {
        if (obj.type === "table") {
          // Find all downstream objects connected through data flow edges
          const downstreamObjectIds = this.findDownstreamObjectsInGraph(
            obj.id,
            dataFlowEdges,
            new Set<string>(),
            5 // Max depth for lineage chains
          );

          if (downstreamObjectIds.length > 1) {
            // Assess complexity and business impact using the existing graph
            const complexity = this.assessLineageComplexity(
              downstreamObjectIds,
              edges
            );
            const businessImpact = this.assessLineageBusinessImpact(
              downstreamObjectIds,
              objects
            );

            chains.push({
              id: `lineage_${chains.length}`,
              name: `Data Lineage: ${obj.name}`,
              description: `Data flow from ${obj.name} to dependent objects`,
              objects: downstreamObjectIds,
              chainType: "data_lineage",
              direction: "downstream",
              length: downstreamObjectIds.length,
              complexity,
              businessImpact,
            });
          }
        }
      }

      // Build process lineage chains (function-based workflows)
      for (const obj of objects) {
        if (obj.type === "function") {
          const processChainIds = this.findProcessLineageInGraph(
            obj.id,
            functionalEdges,
            new Set<string>(),
            4 // Max depth for process chains
          );

          if (processChainIds.length > 1) {
            const complexity = this.assessLineageComplexity(
              processChainIds,
              edges
            );
            const businessImpact = this.assessLineageBusinessImpact(
              processChainIds,
              objects
            );

            chains.push({
              id: `lineage_${chains.length}`,
              name: `Process Lineage: ${obj.name}`,
              description: `Functional workflow involving ${obj.name}`,
              objects: processChainIds,
              chainType: "process_lineage",
              direction: "bidirectional",
              length: processChainIds.length,
              complexity,
              businessImpact,
            });
          }
        }
      }

      Logger.debug("Lineage chains built", "buildLineageChains", {
        chainCount: chains.length,
        dataFlowEdges: dataFlowEdges.length,
        functionalEdges: functionalEdges.length,
        structuralEdges: structuralEdges.length,
      });
    } catch (error) {
      Logger.warn("Failed to build lineage chains", "buildLineageChains", {
        error: (error as Error).message,
      });
    }

    return chains;
  }
  private assessLineageComplexity(
    objectIds: string[],
    edges: RichDependencyEdge[]
  ): "simple" | "moderate" | "complex" {
    if (objectIds.length <= 2) {return "simple";}
    if (objectIds.length <= 4) {return "moderate";}
    return "complex";
  }
  private assessLineageBusinessImpact(
    objectIds: string[],
    allObjects: RichMetadataObject[]
  ): "low" | "medium" | "high" | "critical" {
    const objects = objectIds
      .map((id) => allObjects.find((obj) => obj.id === id))
      .filter(Boolean);

    if (objects.some((obj) => obj?.type === "table")) {return "high";}
    if (objects.some((obj) => obj?.type === "view")) {return "medium";}
    return "low";
  }
  private calculateMaxDepthFromNodes(
    nodes: Map<string, RichDependencyNode>
  ): number {
    let maxDepth = 0;

    for (const node of nodes.values()) {
      maxDepth = Math.max(maxDepth, node.level);
    }

    return maxDepth;
  }

  private async traceUpstreamLineage(
    currentObject: RichMetadataObject,
    lineageObjects: LineageObject[],
    visited: Set<string>,
    maxDepth: number,
    currentDepth: number,
    connectionId: string
  ): Promise<void> {
    // Prevent infinite loops and respect depth limit
    if (visited.has(currentObject.id) || currentDepth >= maxDepth) {
      return;
    }

    visited.add(currentObject.id);

    // Process each dependency of the current object
    for (const dependency of currentObject.dependencies) {
      try {
        // Get the actual object information for this dependency
        const [objectType, schema, objectName] = dependency.objectId
          .split(":")
          .slice(-3);

        // Get rich metadata for the dependency to understand its type
        const dependencyObject =
          await this.metadataManagement.getRichMetadataObject(
            connectionId,
            objectType,
            schema,
            objectName,
            { includeDependencies: false, includePerformance: false }
          );

        if (dependencyObject) {
          // Determine relationship type based on object types and dependency info
          const relationshipType = this.determineObjectRelationshipType(
            currentObject,
            dependencyObject,
            dependency
          );

          // Calculate confidence based on dependency strength and type
          const confidence = this.calculateLineageConfidence(
            dependency,
            relationshipType
          );

          lineageObjects.push({
            objectId: dependency.objectId,
            objectType: dependencyObject.type,
            relationshipType,
            distance: currentDepth + 1,
            transformation: this.extractTransformationInfo(
              dependency,
              currentObject,
              dependencyObject
            ),
            confidence,
          });

          // Recursively trace further upstream if within depth limit
          if (currentDepth + 1 < maxDepth) {
            await this.traceUpstreamLineage(
              dependencyObject,
              lineageObjects,
              visited,
              maxDepth,
              currentDepth + 1,
              connectionId
            );
          }
        } else {
          // Fallback when we can't get rich metadata
          lineageObjects.push({
            objectId: dependency.objectId,
            objectType: objectType,
            relationshipType: dependency.dependencyType,
            distance: currentDepth + 1,
            confidence: 0.7, // Lower confidence for inferred object types
          });
        }
      } catch (error) {
        Logger.warn(
          "Failed to trace upstream dependency",
          "traceUpstreamLineage",
          {
            dependencyId: dependency.objectId,
            error: (error as Error).message,
          }
        );

        // Add with reduced confidence even if tracing fails
        lineageObjects.push({
          objectId: dependency.objectId,
          objectType: "unknown",
          relationshipType: dependency.dependencyType,
          distance: currentDepth + 1,
          confidence: 0.5,
        });
      }
    }
  }

  private async traceDownstreamLineage(
    currentObject: RichMetadataObject,
    lineageObjects: LineageObject[],
    visited: Set<string>,
    maxDepth: number,
    currentDepth: number,
    connectionId: string
  ): Promise<string[]> {
    // Prevent infinite loops and respect depth limit
    if (visited.has(currentObject.id) || currentDepth >= maxDepth) {
      return [currentObject.id];
    }

    visited.add(currentObject.id);
    const downstreamChain = [currentObject.id];

    try {
      // Get all objects in the database to find dependents
      const allObjects = await this.getAllRichMetadataObjects(connectionId);

      // Find objects that depend on the current object
      for (const otherObject of allObjects) {
        if (
          otherObject.id === currentObject.id ||
          visited.has(otherObject.id)
        ) {
          continue;
        }

        // Check if this object depends on our current object
        const isDependent = otherObject.dependencies.some(
          (dep) => dep.objectId === currentObject.id
        );

        if (isDependent) {
          const dependency = otherObject.dependencies.find(
            (dep) => dep.objectId === currentObject.id
          )!;

          // Determine relationship type
          const relationshipType = this.determineObjectRelationshipType(
            otherObject,
            currentObject,
            dependency
          );

          // Calculate confidence
          const confidence = this.calculateLineageConfidence(
            dependency,
            relationshipType
          );

          lineageObjects.push({
            objectId: otherObject.id,
            objectType: otherObject.type,
            relationshipType,
            distance: currentDepth + 1,
            transformation: this.extractTransformationInfo(
              dependency,
              otherObject,
              currentObject
            ),
            confidence,
          });

          // Recursively trace further downstream if within depth limit
          if (currentDepth + 1 < maxDepth) {
            const subChain = await this.traceDownstreamLineage(
              otherObject,
              lineageObjects,
              visited,
              maxDepth,
              currentDepth + 1,
              connectionId
            );
            downstreamChain.push(...subChain);
          } else {
            downstreamChain.push(otherObject.id);
          }
        }
      }
    } catch (error) {
      Logger.warn(
        "Failed to trace downstream lineage",
        "traceDownstreamLineage",
        {
          objectId: currentObject.id,
          error: (error as Error).message,
        }
      );
    }

    return downstreamChain;
  }

  private findDownstreamObjectsInGraph(
    startObjectId: string,
    edges: RichDependencyEdge[],
    visited: Set<string>,
    maxDepth: number
  ): string[] {
    // Prevent infinite loops and respect depth limit
    if (visited.has(startObjectId) || maxDepth <= 0) {
      return [startObjectId];
    }

    visited.add(startObjectId);
    const chain = [startObjectId];

    // Find all edges where this object is the source (downstream connections)
    const downstreamEdges = edges.filter(
      (edge) => edge.source === startObjectId && !visited.has(edge.target)
    );

    for (const edge of downstreamEdges) {
      if (maxDepth > 1) {
        const subChain = this.findDownstreamObjectsInGraph(
          edge.target,
          edges,
          new Set(visited),
          maxDepth - 1
        );
        chain.push(...subChain.slice(1)); // Avoid duplicating the current node
      } else {
        chain.push(edge.target);
      }
    }

    return chain;
  }

  private findProcessLineageInGraph(
    startObjectId: string,
    edges: RichDependencyEdge[],
    visited: Set<string>,
    maxDepth: number
  ): string[] {
    // Prevent infinite loops and respect depth limit
    if (visited.has(startObjectId) || maxDepth <= 0) {
      return [startObjectId];
    }

    visited.add(startObjectId);
    const chain = [startObjectId];

    // Find all connected objects through functional edges (bidirectional)
    const connectedEdges = edges.filter(
      (edge) =>
        (edge.source === startObjectId || edge.target === startObjectId) &&
        !visited.has(edge.source === startObjectId ? edge.target : edge.source)
    );

    for (const edge of connectedEdges) {
      const connectedObjectId =
        edge.source === startObjectId ? edge.target : edge.source;

      if (maxDepth > 1) {
        const subChain = this.findProcessLineageInGraph(
          connectedObjectId,
          edges,
          new Set(visited),
          maxDepth - 1
        );
        chain.push(...subChain.slice(1)); // Avoid duplicating the current node
      } else {
        chain.push(connectedObjectId);
      }
    }

    return chain;
  }

  private calculateLineageConfidence(
    dependency: DependencyInfo,
    relationshipType: string
  ): number {
    let confidence = 0.5; // Base confidence

    // Increase confidence for hard dependencies
    if (dependency.dependencyType === "hard") {
      confidence += 0.3;
    }

    // Increase confidence for higher impact levels
    switch (dependency.impactLevel) {
      case "critical":
        confidence += 0.2;
        break;
      case "high":
        confidence += 0.15;
        break;
      case "medium":
        confidence += 0.1;
        break;
      case "low":
        confidence += 0.05;
        break;
    }

    // Adjust based on relationship type clarity
    if (relationshipType !== "unknown") {
      confidence += 0.1;
    }

    // Add confidence for detailed descriptions
    if (dependency.description && dependency.description.length > 10) {
      confidence += 0.05;
    }

    return Math.min(confidence, 1.0);
  }

  private extractTransformationInfo(
    dependency: DependencyInfo,
    sourceObject: RichMetadataObject,
    targetObject: RichMetadataObject
  ): string | undefined {
    const description = (dependency.description || "").toLowerCase();

    // Check for common transformation patterns
    if (
      description.includes("join") ||
      description.includes("inner join") ||
      description.includes("left join") ||
      description.includes("right join")
    ) {
      return "JOIN operation";
    }

    if (
      description.includes("aggregate") ||
      description.includes("group by") ||
      description.includes("sum") ||
      description.includes("count") ||
      description.includes("avg") ||
      description.includes("max") ||
      description.includes("min")
    ) {
      return "Aggregation";
    }

    if (description.includes("union") || description.includes("union all")) {
      return "UNION operation";
    }

    if (
      description.includes("filter") ||
      description.includes("where") ||
      description.includes("having")
    ) {
      return "Filtering";
    }

    if (description.includes("order by") || description.includes("sort")) {
      return "Sorting";
    }

    if (description.includes("distinct") || description.includes("unique")) {
      return "Deduplication";
    }

    // Check for function-based transformations
    if (sourceObject.type === "function" || targetObject.type === "function") {
      return "Function transformation";
    }

    // Check for view-based transformations
    if (sourceObject.type === "view" || targetObject.type === "view") {
      return "View transformation";
    }

    // Return undefined if no specific transformation pattern is detected
    return undefined;
  }

  private buildDependencyGraph(
    objects: RichMetadataObject[]
  ): Map<string, DependencyInfo[]> {
    const graph = new Map<string, DependencyInfo[]>();

    for (const obj of objects) {
      graph.set(obj.id, [...obj.dependencies, ...obj.dependents]);
    }

    return graph;
  }
  private detectCircularDependencies(
    graph: Map<string, DependencyInfo[]>
  ): CircularDependency[] {
    const circularDeps: CircularDependency[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const detectCircular = (nodeId: string, path: string[]): boolean => {
      if (recursionStack.has(nodeId)) {
        // Found circular dependency
        const cycleStart = path.indexOf(nodeId);
        const cycle = path.slice(cycleStart);

        circularDeps.push({
          tables: cycle,
          constraints: [], // Would be populated with actual constraint names
          severity: "error",
          description: `Circular dependency detected: ${cycle.join(" -> ")}`,
        });

        return true;
      }

      if (visited.has(nodeId)) {
        return false;
      }

      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);

      const neighbors = graph.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (detectCircular(neighbor.objectId, [...path])) {
          return true;
        }
      }

      recursionStack.delete(nodeId);
      path.pop();

      return false;
    };

    for (const nodeId of graph.keys()) {
      if (!visited.has(nodeId)) {
        detectCircular(nodeId, []);
      }
    }

    return circularDeps;
  }
  private topologicalSort(graph: Map<string, DependencyInfo[]>): string[] {
    const visited = new Set<string>();
    const temp = new Set<string>();
    const order: string[] = [];

    const visit = (nodeId: string): boolean => {
      if (temp.has(nodeId)) {
        return false; // Cycle detected
      }

      if (visited.has(nodeId)) {
        return true;
      }

      temp.add(nodeId);

      const neighbors = graph.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (!visit(neighbor.objectId)) {
          return false;
        }
      }

      temp.delete(nodeId);
      visited.add(nodeId);
      order.unshift(nodeId); // Add to front for reverse topological order

      return true;
    };

    for (const nodeId of graph.keys()) {
      if (!visited.has(nodeId)) {
        if (!visit(nodeId)) {
          // Cycle detected, return partial order
          break;
        }
      }
    }

    return order;
  }
  private assessResolutionComplexity(
    dependencies: DependencyInfo[],
    circularDependencies: CircularDependency[]
  ): "simple" | "moderate" | "complex" {
    if (circularDependencies.length > 0) {return "complex";}
    if (dependencies.length > 20) {return "complex";}
    if (dependencies.length > 10) {return "moderate";}
    return "simple";
  }
  private generateDependencySummary(
    objects: RichMetadataObject[]
  ): DependencySummary {
    let totalDependencies = 0;
    let maxDepth = 0;
    let circularDependencyCount = 0;
    const dependencyCounts = new Map<string, number>();

    for (const obj of objects) {
      const depCount = obj.dependencies.length + obj.dependents.length;
      dependencyCounts.set(obj.id, depCount);
      totalDependencies += depCount;

      // Calculate max depth (simplified)
      const depth = this.calculateObjectDepth(obj, objects, new Set());
      maxDepth = Math.max(maxDepth, depth);
    }

    // Count orphaned and over-dependent objects
    let orphanedObjects = 0;
    let overDependentObjects = 0;

    for (const obj of objects) {
      const depCount = dependencyCounts.get(obj.id) || 0;

      if (depCount === 0) {
        orphanedObjects++;
      }

      if (depCount > 20) {
        // Arbitrary threshold for "over-dependent"
        overDependentObjects++;
      }
    }

    return {
      totalObjects: objects.length,
      totalDependencies,
      averageDependenciesPerObject:
        objects.length > 0 ? totalDependencies / objects.length : 0,
      maxDependencyDepth: maxDepth,
      circularDependencyCount,
      stronglyConnectedComponents: 0, // Would require sophisticated graph analysis
      orphanedObjects,
      overDependentObjects,
    };
  }
  private calculateObjectDepth(
    obj: RichMetadataObject,
    allObjects: RichMetadataObject[],
    visited: Set<string>
  ): number {
    if (visited.has(obj.id)) {
      return 0; // Circular reference
    }

    visited.add(obj.id);

    let maxDepth = 0;

    // Check dependencies
    for (const dep of obj.dependencies) {
      const dependentObj = allObjects.find((o) => o.id === dep.objectId);
      if (dependentObj) {
        const depth = this.calculateObjectDepth(
          dependentObj,
          allObjects,
          new Set(visited)
        );
        maxDepth = Math.max(maxDepth, depth + 1);
      }
    }

    return maxDepth;
  }
  private generateDependencyRecommendations(
    objects: RichMetadataObject[],
    summary: DependencySummary
  ): DependencyRecommendation[] {
    const recommendations: DependencyRecommendation[] = [];

    // Orphaned objects recommendation
    if (summary.orphanedObjects > 0) {
      recommendations.push({
        type: "warning",
        priority: "medium",
        title: "Review Orphaned Objects",
        description: `${summary.orphanedObjects} objects have no dependencies and may be unused`,
        affectedObjects: objects
          .filter((obj) => {
            const depCount = obj.dependencies.length + obj.dependents.length;
            return depCount === 0;
          })
          .map((obj) => obj.id),
        estimatedEffort: "low",
        potentialImpact: "May identify unused objects that can be removed",
        implementationSteps: [
          "Review each orphaned object for actual usage",
          "Check application code for references",
          "Consider archiving or removing unused objects",
        ],
      });
    }

    // Over-dependent objects recommendation
    if (summary.overDependentObjects > 0) {
      recommendations.push({
        type: "optimization",
        priority: "medium",
        title: "Simplify Complex Dependencies",
        description: `${summary.overDependentObjects} objects have many dependencies and may benefit from simplification`,
        affectedObjects: objects
          .filter((obj) => {
            const depCount = obj.dependencies.length + obj.dependents.length;
            return depCount > 20;
          })
          .map((obj) => obj.id),
        estimatedEffort: "high",
        potentialImpact: "Improved maintainability and reduced coupling",
        implementationSteps: [
          "Analyze dependency chains for simplification opportunities",
          "Consider consolidating related objects",
          "Review and remove unnecessary dependencies",
        ],
      });
    }

    // Deep dependency chains
    if (summary.maxDependencyDepth > 5) {
      recommendations.push({
        type: "refactoring",
        priority: "high",
        title: "Reduce Dependency Depth",
        description: `Maximum dependency depth of ${summary.maxDependencyDepth} levels may cause maintenance issues`,
        affectedObjects: objects.map((obj) => obj.id),
        estimatedEffort: "high",
        potentialImpact:
          "Improved system maintainability and reduced complexity",
        implementationSteps: [
          "Identify long dependency chains",
          "Consider introducing abstraction layers",
          "Review object relationships for possible consolidation",
        ],
      });
    }

    return recommendations;
  }
  private assessDependencyRisks(
    objects: RichMetadataObject[],
    summary: DependencySummary
  ): DependencyRiskAssessment {
    const riskFactors: RiskFactor[] = [];
    let overallRisk: "low" | "medium" | "high" | "critical" = "low";

    // Assess circular dependency risk
    if (summary.circularDependencyCount > 0) {
      riskFactors.push({
        type: "circular_dependency",
        severity: summary.circularDependencyCount > 3 ? "critical" : "high",
        description: `${summary.circularDependencyCount} circular dependencies detected`,
        affectedObjects: [], // Would be populated with actual object IDs
        potentialImpact: "May cause deadlocks and maintenance issues",
      });
    }

    // Assess deep dependency risk
    if (summary.maxDependencyDepth > 7) {
      riskFactors.push({
        type: "deep_dependency",
        severity: "high",
        description: `Deep dependency chain with ${summary.maxDependencyDepth} levels`,
        affectedObjects: objects.map((obj) => obj.id),
        potentialImpact: "Complex changes may have cascading effects",
      });
    }

    // Assess over-dependence risk
    if (summary.overDependentObjects > 5) {
      riskFactors.push({
        type: "over_dependence",
        severity: "medium",
        description: `${summary.overDependentObjects} objects have excessive dependencies`,
        affectedObjects: objects
          .filter((obj) => {
            const depCount = obj.dependencies.length + obj.dependents.length;
            return depCount > 20;
          })
          .map((obj) => obj.id),
        potentialImpact: "High coupling may make changes difficult",
      });
    }

    // Assess orphaned object risk
    if (summary.orphanedObjects > 10) {
      riskFactors.push({
        type: "orphaned_object",
        severity: "low",
        description: `${summary.orphanedObjects} objects appear to be unused`,
        affectedObjects: objects
          .filter((obj) => {
            const depCount = obj.dependencies.length + obj.dependents.length;
            return depCount === 0;
          })
          .map((obj) => obj.id),
        potentialImpact: "May indicate dead code or unnecessary objects",
      });
    }

    // Determine overall risk
    const criticalFactors = riskFactors.filter(
      (f) => f.severity === "critical"
    ).length;
    const highFactors = riskFactors.filter((f) => f.severity === "high").length;

    if (criticalFactors > 0) {overallRisk = "critical";}
    else if (highFactors > 1) {overallRisk = "high";}
    else if (highFactors > 0 || riskFactors.length > 3) {overallRisk = "medium";}

    return {
      overallRisk,
      riskFactors,
      mitigationStrategies: this.generateMitigationStrategies(riskFactors),
      monitoringRecommendations:
        this.generateMonitoringRecommendations(riskFactors),
    };
  }
  private generateMitigationStrategies(riskFactors: RiskFactor[]): string[] {
    const strategies: string[] = [];

    for (const factor of riskFactors) {
      switch (factor.type) {
        case "circular_dependency":
          strategies.push(
            "Implement dependency injection to break circular references"
          );
          strategies.push("Consider using events or messaging patterns");
          break;
        case "deep_dependency":
          strategies.push(
            "Introduce facade or adapter patterns to reduce depth"
          );
          strategies.push("Consider service consolidation");
          break;
        case "over_dependence":
          strategies.push("Apply interface segregation principle");
          strategies.push("Consider dependency inversion");
          break;
        case "orphaned_object":
          strategies.push("Implement regular cleanup processes");
          strategies.push("Add object lifecycle management");
          break;
      }
    }

    return [...new Set(strategies)]; // Remove duplicates
  }
  private generateMonitoringRecommendations(
    riskFactors: RiskFactor[]
  ): string[] {
    const recommendations: string[] = [];

    if (riskFactors.some((f) => f.type === "circular_dependency")) {
      recommendations.push(
        "Monitor for deadlock situations in database operations"
      );
    }

    if (riskFactors.some((f) => f.type === "deep_dependency")) {
      recommendations.push(
        "Track dependency chain length in change impact analysis"
      );
    }

    if (riskFactors.some((f) => f.type === "over_dependence")) {
      recommendations.push("Monitor coupling metrics during code reviews");
    }

    recommendations.push(
      "Regular dependency analysis as part of maintenance schedule"
    );

    return recommendations;
  }
  private findOptimizationOpportunities(
    objects: RichMetadataObject[],
    summary: DependencySummary
  ): OptimizationOpportunity[] {
    const opportunities: OptimizationOpportunity[] = [];

    // Find redundant dependencies
    opportunities.push(...this.findRedundantDependencies(objects));

    // Find simplification opportunities
    opportunities.push(...this.findSimplificationOpportunities(objects));

    // Find consolidation opportunities
    opportunities.push(...this.findConsolidationOpportunities(objects));

    return opportunities;
  }
  private findRedundantDependencies(
    objects: RichMetadataObject[]
  ): OptimizationOpportunity[] {
    const opportunities: OptimizationOpportunity[] = [];

    // Look for objects with similar dependency patterns
    const dependencyPatterns = new Map<string, RichMetadataObject[]>();

    for (const obj of objects) {
      const pattern = this.generateDependencyPattern(obj);
      if (!dependencyPatterns.has(pattern)) {
        dependencyPatterns.set(pattern, []);
      }
      dependencyPatterns.get(pattern)!.push(obj);
    }

    // Find patterns with multiple objects
    for (const [pattern, objs] of dependencyPatterns) {
      if (objs.length > 1) {
        opportunities.push({
          type: "consolidate_objects",
          title: "Consolidate Similar Objects",
          description: `${objs.length} objects have identical dependency patterns`,
          affectedObjects: objs.map((obj) => obj.id),
          estimatedBenefit:
            "Reduced maintenance overhead and improved consistency",
          implementationComplexity: "medium",
          prerequisites: [
            "Ensure objects are truly interchangeable",
            "Update all references to use consolidated object",
          ],
        });
      }
    }

    return opportunities;
  }
  private generateDependencyPattern(obj: RichMetadataObject): string {
    // Generate a simplified pattern of object dependencies
    const depTypes = obj.dependencies
      .map((d) => d.objectType)
      .sort()
      .join(",");
    const dependentTypes = obj.dependents
      .map((d) => d.objectType)
      .sort()
      .join(",");
    return `${depTypes}|${dependentTypes}`;
  }
  private findSimplificationOpportunities(
    objects: RichMetadataObject[]
  ): OptimizationOpportunity[] {
    const opportunities: OptimizationOpportunity[] = [];

    // Find objects with excessive dependencies
    const complexObjects = objects.filter((obj) => {
      const totalDeps = obj.dependencies.length + obj.dependents.length;
      return totalDeps > 15; // Threshold for "complex"
    });

    complexObjects.forEach((obj) => {
      opportunities.push({
        type: "simplify_chain",
        title: "Simplify Object Dependencies",
        description: `Object ${obj.name} has ${
          obj.dependencies.length + obj.dependents.length
        } dependencies`,
        affectedObjects: [obj.id],
        estimatedBenefit: "Improved maintainability and reduced coupling",
        implementationComplexity: "high",
        prerequisites: [
          "Analyze each dependency for necessity",
          "Consider introducing abstraction layers",
          "Update dependent code accordingly",
        ],
      });
    });

    return opportunities;
  }
  private findConsolidationOpportunities(
    objects: RichMetadataObject[]
  ): OptimizationOpportunity[] {
    const opportunities: OptimizationOpportunity[] = [];

    // Look for tables that could be consolidated
    const tables = objects.filter((obj) => obj.type === "table");

    // Group tables by schema
    const schemaGroups = new Map<string, RichMetadataObject[]>();
    for (const table of tables) {
      if (!schemaGroups.has(table.schema)) {
        schemaGroups.set(table.schema, []);
      }
      schemaGroups.get(table.schema)!.push(table);
    }

    // Find schemas with many small tables
    for (const [schema, schemaTables] of schemaGroups) {
      if (schemaTables.length > 10) {
        opportunities.push({
          type: "consolidate_objects",
          title: "Consider Table Consolidation",
          description: `Schema ${schema} has ${schemaTables.length} tables - may benefit from consolidation`,
          affectedObjects: schemaTables.map((obj) => obj.id),
          estimatedBenefit:
            "Reduced schema complexity and improved query performance",
          implementationComplexity: "high",
          prerequisites: [
            "Analyze table relationships and usage patterns",
            "Design consolidated table structure",
            "Plan data migration strategy",
          ],
        });
      }
    }

    return opportunities;
  }
  private generateDependencyVisualization(
    objects: RichMetadataObject[]
  ): DependencyGraphVisualization {
    const nodes: DependencyGraphNode[] = [];
    const edges: DependencyGraphEdge[] = [];

    // Create nodes for each object
    objects.forEach((obj, index) => {
      const nodeSize = Math.max(
        20,
        Math.min(100, (obj.dependencies.length + obj.dependents.length) * 5)
      );
      const nodeColor = this.getNodeColor(obj);

      nodes.push({
        id: obj.id,
        label: obj.name,
        type: obj.type,
        schema: obj.schema,
        position: this.calculateNodePosition(index, objects.length),
        size: nodeSize,
        color: nodeColor,
        metadata: {
          dependencyCount: obj.dependencies.length + obj.dependents.length,
          objectType: obj.type,
          schema: obj.schema,
        },
      });
    });

    // Create edges for dependencies
    objects.forEach((obj) => {
      obj.dependencies.forEach((dep) => {
        edges.push({
          id: `${obj.id}_${dep.objectId}`,
          source: obj.id,
          target: dep.objectId,
          type: "depends_on",
          strength:
            dep.impactLevel === "critical"
              ? "strong"
              : dep.impactLevel === "high"
              ? "medium"
              : "weak",
          style: dep.dependencyType === "hard" ? "solid" : "dashed",
          label: dep.description,
        });
      });

      obj.dependents.forEach((dep) => {
        edges.push({
          id: `${dep.objectId}_${obj.id}`,
          source: dep.objectId,
          target: obj.id,
          type: "referenced_by",
          strength:
            dep.impactLevel === "critical"
              ? "strong"
              : dep.impactLevel === "high"
              ? "medium"
              : "weak",
          style: dep.dependencyType === "hard" ? "solid" : "dashed",
          label: dep.description,
        });
      });
    });

    const layout: GraphLayout = {
      type: "force_directed",
      width: 1200,
      height: 800,
      padding: 50,
      nodeSpacing: 100,
      levelSpacing: 150,
    };

    const metadata: GraphMetadata = {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      maxDepth: this.calculateMaxDepth(objects),
      circularDependencies: 0, // Would be calculated from actual graph analysis
      stronglyConnectedComponents: 0,
      generationTime: Date.now(),
    };

    return {
      nodes,
      edges,
      layout,
      metadata,
    };
  }
  private getNodeColor(obj: RichMetadataObject): string {
    switch (obj.type) {
      case "table":
        return "#4CAF50"; // Green
      case "view":
        return "#2196F3"; // Blue
      case "function":
        return "#FF9800"; // Orange
      case "index":
        return "#9C27B0"; // Purple
      case "constraint":
        return "#F44336"; // Red
      default:
        return "#757575"; // Gray
    }
  }
  private calculateNodePosition(
    index: number,
    totalNodes: number
  ): { x: number; y: number } {
    // Simple circular layout for visualization
    const angle = (index / totalNodes) * 2 * Math.PI;
    const radius = 300;

    return {
      x: Math.cos(angle) * radius + 400,
      y: Math.sin(angle) * radius + 400,
    };
  }
  private calculateMaxDepth(objects: RichMetadataObject[]): number {
    let maxDepth = 0;

    for (const obj of objects) {
      const depth = this.calculateObjectDepth(obj, objects, new Set());
      maxDepth = Math.max(maxDepth, depth);
    }

    return maxDepth;
  }
  private async getAllRichMetadataObjects(
    connectionId: string
  ): Promise<RichMetadataObject[]> {
    try {
      Logger.info(
        "Retrieving all rich metadata objects for dependency analysis",
        "getAllRichMetadataObjects",
        {
          connectionId,
        }
      );

      // Get all database objects from metadata management
      const databaseObjects =
        await this.metadataManagement.getAllDatabaseObjects(connectionId);

      if (databaseObjects.length === 0) {
        Logger.warn(
          "No database objects found for dependency analysis",
          "getAllRichMetadataObjects",
          {
            connectionId,
          }
        );
        return [];
      }

      // Convert to rich metadata objects with enhanced information
      const richObjects: RichMetadataObject[] = [];

      for (const dbObject of databaseObjects) {
        try {
          // Get detailed metadata for each object
          const richMetadata =
            await this.metadataManagement.getRichMetadataObject(
              connectionId,
              dbObject.type,
              dbObject.schema,
              dbObject.name,
              {
                includeDependencies: true,
                includePerformance: true,
              }
            );

          if (richMetadata) {
            richObjects.push(richMetadata);
          }
        } catch (error) {
          Logger.warn(
            "Failed to get rich metadata for object",
            "getAllRichMetadataObjects",
            {
              connectionId,
              objectType: dbObject.type,
              objectName: dbObject.name,
              error: (error as Error).message,
            }
          );

          // Continue with other objects even if one fails
        }
      }

      Logger.info(
        "Rich metadata objects retrieved successfully",
        "getAllRichMetadataObjects",
        {
          connectionId,
          totalObjects: databaseObjects.length,
          richObjectsRetrieved: richObjects.length,
        }
      );

      return richObjects;
    } catch (error) {
      Logger.error(
        "Failed to get all rich metadata objects",
        error as Error,
        "getAllRichMetadataObjects",
        {
          connectionId,
        }
      );
      return [];
    }
  }
  dispose(): void {
    Logger.info("DependencyAnalysis disposed", "dispose");
  }
}
