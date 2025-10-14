import { ConnectionManager } from './ConnectionManager';
import { Logger } from '@/utils/Logger';
import { DotNetIntegrationService, DotNetConnectionInfo, DotNetColumnMetadata, DotNetIndexMetadata, DotNetConstraintMetadata, DotNetViewMetadata } from '@/services/DotNetIntegrationService';
import { ExtensionInitializer } from '@/utils/ExtensionInitializer';

export interface DatabaseObject {
    id: string;
    name: string;
    type: string;
    schema: string;
    database: string;
    owner?: string;
    sizeInBytes?: number;
    definition?: string;
    createdAt?: string;
    modifiedAt?: string;
    dependencies?: string[];
    dependents?: string[];
    properties?: Record<string, any>;
}

export interface SchemaCache {
    connectionId: string;
    objects: DatabaseObject[];
    lastUpdated: Date;
    isStale: boolean;
}

export interface SchemaComparisonOptions {
    mode: 'strict' | 'lenient';
    ignoreSchemas?: string[];
    objectTypes?: string[];
    includeSystemObjects?: boolean;
}

// Enhanced interfaces for detailed schema analysis
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
    differenceType: 'Added' | 'Removed' | 'Modified';
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
    complexity?: 'simple' | 'moderate' | 'complex';
}

export interface ViewDependency {
    type: 'table' | 'view' | 'function';
    name: string;
    schema: string;
}

export interface DetailedSchemaComparisonResult extends SchemaComparisonResult {
    columnComparisons: Map<string, ColumnComparisonDetail[]>;
    indexComparisons: Map<string, IndexComparisonDetail[]>;
    constraintComparisons: Map<string, ConstraintDifference[]>;
    viewDependencies: Map<string, ViewDependencyNode>;
    dependencyGraph: DependencyGraph;
}

export interface DependencyGraph {
    nodes: Map<string, DependencyNode>;
    edges: DependencyEdge[];
}

export interface DependencyNode {
    id: string;
    name: string;
    type: string;
    schema: string;
    level: number;
}

export interface DependencyEdge {
    from: string;
    to: string;
    type: 'depends_on' | 'referenced_by';
}

// Enhanced metadata handling interfaces
export interface RichMetadataObject {
    id: string;
    name: string;
    type: string;
    schema: string;
    database: string;
    owner?: string;
    sizeInBytes?: number;
    definition?: string;
    createdAt?: string;
    modifiedAt?: string;
    metadata: ObjectMetadata;
    dependencies: DependencyInfo[];
    dependents: DependencyInfo[];
    changeHistory?: ChangeRecord[];
    validationStatus: ValidationStatus;
    performanceMetrics?: PerformanceMetrics;
}

export interface ObjectMetadata {
    properties: Record<string, any>;
    statistics?: ObjectStatistics;
    permissions: PermissionInfo[];
    tags: string[];
    customProperties: Record<string, any>;
    metadataVersion: string;
    lastMetadataUpdate: Date;
}

export interface ObjectStatistics {
    rowCount?: number;
    sizeInBytes: number;
    indexSizeInBytes?: number;
    lastVacuum?: Date;
    lastAnalyze?: Date;
    accessFrequency?: number;
}

export interface PermissionInfo {
    role: string;
    privileges: string[];
    grantedBy: string;
    grantedAt: Date;
}

export interface DependencyInfo {
    objectId: string;
    objectName: string;
    objectType: string;
    schema: string;
    dependencyType: 'hard' | 'soft';
    description: string;
    impactLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface ChangeRecord {
    changeId: string;
    changeType: 'created' | 'modified' | 'dropped';
    timestamp: Date;
    user: string;
    description: string;
    previousVersion?: string;
    newVersion?: string;
}

export interface ValidationStatus {
    isValid: boolean;
    lastValidated: Date;
    validationErrors: string[];
    validationWarnings: string[];
    validationRules: string[];
}

export interface PerformanceMetrics {
    averageQueryTime?: number;
    cacheHitRatio?: number;
    lockWaitTime?: number;
    lastAccessTime?: Date;
    accessCount: number;
}

export interface IncrementalUpdateOptions {
    detectChangesOnly?: boolean;
    updateDependencies?: boolean;
    validateAfterUpdate?: boolean;
    generateChangeReport?: boolean;
    forceFullRefresh?: boolean;
}

export interface MetadataCacheEntry {
    object: RichMetadataObject;
    cachedAt: Date;
    expiresAt: Date;
    accessCount: number;
    lastAccessed: Date;
    isDirty: boolean;
}

export interface DependencyResolutionResult {
    resolved: boolean;
    dependencies: DependencyInfo[];
    circularDependencies: CircularDependency[];
    resolutionOrder: string[];
    estimatedComplexity: 'simple' | 'moderate' | 'complex';
    warnings: string[];
}

// Enhanced Dependency Management and Visualization Interfaces
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
    type: 'depends_on' | 'referenced_by' | 'parent_of' | 'child_of';
    strength: 'weak' | 'medium' | 'strong';
    style: 'solid' | 'dashed' | 'dotted';
    label?: string;
}

export interface GraphLayout {
    type: 'hierarchical' | 'circular' | 'force_directed' | 'grid';
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
    type: 'optimization' | 'refactoring' | 'warning' | 'error';
    priority: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description: string;
    affectedObjects: string[];
    estimatedEffort: 'low' | 'medium' | 'high';
    potentialImpact: string;
    implementationSteps: string[];
}

export interface DependencyRiskAssessment {
    overallRisk: 'low' | 'medium' | 'high' | 'critical';
    riskFactors: RiskFactor[];
    mitigationStrategies: string[];
    monitoringRecommendations: string[];
}

export interface RiskFactor {
    type: 'circular_dependency' | 'deep_dependency' | 'over_dependence' | 'orphaned_object';
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    affectedObjects: string[];
    potentialImpact: string;
}

export interface OptimizationOpportunity {
    type: 'remove_redundant' | 'simplify_chain' | 'consolidate_objects' | 'optimize_order';
    title: string;
    description: string;
    affectedObjects: string[];
    estimatedBenefit: string;
    implementationComplexity: 'low' | 'medium' | 'high';
    prerequisites: string[];
}

export interface IndexPerformanceAnalysis {
    sourceIndexCount: number;
    targetIndexCount: number;
    performanceDifferences: IndexPerformanceDifference[];
    unusedIndexes: string[];
    missingIndexes: string[];
    redundantIndexes: Array<{sourceIndex: string; targetIndex: string; reason: string}>;
}

export interface IndexPerformanceDifference {
    indexName: string;
    sourceStats: IndexStatistics;
    targetStats: IndexStatistics;
    sizeDifference: number;
    scanDifference: number;
    impact: 'low' | 'medium' | 'high';
}

// Constraint Dependency Analysis Interfaces
export interface ConstraintDependencyAnalysis {
    primaryKeyDependencies: PrimaryKeyDependency[];
    foreignKeyDependencies: ForeignKeyDependency[];
    checkConstraintDependencies: CheckConstraintDependency[];
    circularDependencies: CircularDependency[];
    cascadePaths: CascadePath[];
}

export interface PrimaryKeyDependency {
    tableName: string;
    schema: string;
    sourceColumns: string[];
    targetColumns: string[];
    impact: 'structure_changed' | 'removed' | 'added';
    dependentObjects: string[];
}

export interface ForeignKeyDependency {
    constraintName: string;
    sourceTable: string;
    targetTable: string;
    sourceColumns: string[];
    targetColumns: string[];
    relationshipType: string;
    cascadeBehavior: string;
}

export interface CheckConstraintDependency {
    constraintName: string;
    tableName: string;
    schema: string;
    sourceDefinition: string;
    targetDefinition: string;
    complexity: 'simple' | 'moderate' | 'complex';
    dependentColumns: string[];
}

export interface CircularDependency {
    tables: string[];
    constraints: string[];
    severity: 'warning' | 'error';
    description: string;
}

export interface CascadePath {
    startTable: string;
    endTable: string;
    path: string[];
    cascadeType: 'delete' | 'update';
    length: number;
}

export interface IntegrityImpactAssessment {
    riskLevel: 'low' | 'medium' | 'high';
    highImpactChanges: number;
    mediumImpactChanges: number;
    lowImpactChanges: number;
    affectedTables: string[];
    dataLossRisk: boolean;
    consistencyRisk: boolean;
}

// View Dependency Analysis Interfaces
export interface ViewImpactAnalysis {
    affectedViews: string[];
    dependencyChains: DependencyChain[];
    riskLevel: 'low' | 'medium' | 'high';
    estimatedImpact: 'minimal' | 'moderate' | 'significant';
    cascadingChanges: CascadingChange[];
}

export interface ColumnDependency {
    viewColumn: string;
    sourceColumns: string[];
    expression: string;
    complexity: 'simple' | 'moderate' | 'complex';
}

export interface DependencyChain {
    startView: string;
    endView: string;
    views: string[];
    length: number;
    complexity: 'simple' | 'moderate' | 'complex';
}

export interface CascadingChange {
    sourceView: string;
    affectedViews: string[];
    changeType: 'structure' | 'data' | 'permission';
    severity: 'low' | 'medium' | 'high';
    description: string;
}

export class SchemaManager {
    private connectionManager: ConnectionManager;
    private dotNetService: DotNetIntegrationService;
    private schemaCache: Map<string, SchemaCache> = new Map();
    private metadataCache: Map<string, MetadataCacheEntry> = new Map();
    private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
    private readonly METADATA_CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

    constructor(connectionManager: ConnectionManager) {
        this.connectionManager = connectionManager;
        this.dotNetService = DotNetIntegrationService.getInstance();
    }

    async getDatabaseObjects(connectionId: string, schemaFilter?: string): Promise<DatabaseObject[]> {
        const operationId = `schema-load-${connectionId}-${Date.now()}`;

        try {
            Logger.info('Getting database objects', 'getDatabaseObjects', { connectionId });

            // Start operation tracking
            const statusBarProvider = ExtensionInitializer.getStatusBarProvider();
            const operationSteps = [
                { id: 'connect', name: 'Connecting to database', status: 'pending' as const },
                { id: 'query', name: 'Querying schema objects', status: 'pending' as const },
                { id: 'process', name: 'Processing objects', status: 'pending' as const }
            ];

            const operationIndicator = statusBarProvider.startOperation(operationId, `Load Schema: ${connectionId}`, {
                message: 'Loading database schema...',
                cancellable: true,
                steps: operationSteps,
                estimatedDuration: 15000 // 15 seconds estimated
            });

            // Step 1: Connect
            statusBarProvider.updateOperationStep(operationId, 0, 'running', {
                message: 'Connecting to database...'
            });

            // Get connection and password directly
            const connection = this.connectionManager.getConnection(connectionId);
            if (!connection) {
                throw new Error(`Connection ${connectionId} not found`);
            }

            const password = await this.connectionManager.getConnectionPassword(connectionId);
            if (!password) {
                throw new Error('Password not found for connection');
            }

            // Step 2: Query
            statusBarProvider.updateOperationStep(operationId, 0, 'completed');
            statusBarProvider.updateOperationStep(operationId, 1, 'running', {
                message: 'Querying schema objects...'
            });

            // Create .NET connection info
            const dotNetConnection: DotNetConnectionInfo = {
                id: connection.id,
                name: connection.name,
                host: connection.host,
                port: connection.port,
                database: connection.database,
                username: connection.username,
                password: password,
                createdDate: new Date().toISOString()
            };

            // Get objects via .NET service
            const dotNetObjects = await this.dotNetService.browseSchema(dotNetConnection, schemaFilter || undefined);

            // Step 3: Process
            statusBarProvider.updateOperationStep(operationId, 1, 'completed');
            statusBarProvider.updateOperationStep(operationId, 2, 'running', {
                message: 'Processing objects...'
            });

            if (!dotNetObjects || dotNetObjects.length === 0) {
                Logger.warn('No objects found in schema', 'getDatabaseObjects', { connectionId });
                statusBarProvider.updateOperation(operationId, 'completed', {
                    message: 'Schema loaded (0 objects)'
                });
                return [];
            }

            // Convert from .NET format to local format with simplified mapping
            const objects: DatabaseObject[] = dotNetObjects.map(dotNetObj => ({
                id: dotNetObj.id,
                name: dotNetObj.name,
                type: this.mapDotNetTypeToLocal(dotNetObj.type),
                schema: dotNetObj.schema,
                database: dotNetObj.database
            }));

            // Complete operation
            statusBarProvider.updateOperationStep(operationId, 2, 'completed');
            statusBarProvider.updateOperation(operationId, 'completed', {
                message: `Schema loaded (${objects.length} objects)`
            });

            Logger.info('Database objects retrieved', 'getDatabaseObjects', {
                connectionId,
                objectCount: objects.length
            });

            return objects;
        } catch (error) {
            // Mark operation as failed
            const statusBarProvider = ExtensionInitializer.getStatusBarProvider();
            statusBarProvider.updateOperation(operationId, 'failed', {
                message: `Schema load failed: ${(error as Error).message}`
            });

            Logger.error('Failed to get database objects', error as Error);
            throw error;
        }
    }

    async getObjectDetails(connectionId: string, objectType: string, schema: string, objectName: string): Promise<any> {
        try {
            Logger.info('Getting object details', 'getObjectDetails', { connectionId, objectType, schema, objectName });

            // Get connection and password directly
            const connection = this.connectionManager.getConnection(connectionId);
            if (!connection) {
                throw new Error(`Connection ${connectionId} not found`);
            }

            const password = await this.connectionManager.getConnectionPassword(connectionId);
            if (!password) {
                throw new Error('Password not found for connection');
            }

            // Create .NET connection info
            const dotNetConnection: DotNetConnectionInfo = {
                id: connection.id,
                name: connection.name,
                host: connection.host,
                port: connection.port,
                database: connection.database,
                username: connection.username,
                password: password,
                createdDate: new Date().toISOString()
            };

            // Get object details via .NET service
            const details = await this.dotNetService.getObjectDetails(
                dotNetConnection,
                objectType,
                schema,
                objectName
            );

            if (!details) {
                throw new Error('Object details returned null or undefined');
            }

            Logger.info('Object details retrieved', 'getObjectDetails', {
                connectionId,
                objectType,
                objectName
            });

            return details;
        } catch (error) {
            Logger.error('Failed to get object details', error as Error);
            throw error;
        }
    }

    private mapDotNetTypeToLocal(dotNetType: string): string {
        const typeMap: { [key: string]: string; } = {
            'table': 'table', 'view': 'view', 'function': 'function',
            'procedure': 'procedure', 'sequence': 'sequence', 'type': 'type',
            'domain': 'domain', 'index': 'index', 'trigger': 'trigger',
            'constraint': 'constraint', 'column': 'column', 'schema': 'schema'
        };
        return typeMap[dotNetType.toLowerCase()] || 'unknown';
    }

    // Enhanced schema operations with caching
    async getDatabaseObjectsWithCache(connectionId: string, schemaFilter?: string): Promise<DatabaseObject[]> {
        const cacheKey = `${connectionId}:${schemaFilter || 'all'}`;

        // Check cache first
        const cached = this.schemaCache.get(cacheKey);
        if (cached && !this.isCacheStale(cached)) {
            Logger.debug('Returning cached schema objects', 'getDatabaseObjectsWithCache', {
                connectionId,
                objectCount: cached.objects.length
            });
            return cached.objects;
        }

        // Fetch fresh data
        const objects = await this.getDatabaseObjects(connectionId, schemaFilter);

        // Update cache
        this.schemaCache.set(cacheKey, {
            connectionId,
            objects,
            lastUpdated: new Date(),
            isStale: false
        });

        return objects;
    }

    private isCacheStale(cache: SchemaCache): boolean {
        const age = Date.now() - cache.lastUpdated.getTime();
        return age > this.CACHE_DURATION;
    }


    async compareSchemas(
        sourceConnectionId: string,
        targetConnectionId: string,
        options: SchemaComparisonOptions = { mode: 'strict' }
    ): Promise<SchemaComparisonResult> {
        try {
            Logger.info('Comparing schemas', 'compareSchemas', {
                sourceConnectionId,
                targetConnectionId,
                mode: options.mode
            });

            // Get objects from both connections
            const [sourceObjects, targetObjects] = await Promise.all([
                this.getDatabaseObjectsWithCache(sourceConnectionId),
                this.getDatabaseObjectsWithCache(targetConnectionId)
            ]);

            // Filter objects based on options
            const filteredSource = this.filterObjects(sourceObjects, options);
            const filteredTarget = this.filterObjects(targetObjects, options);

            // Perform comparison
            const differences = this.compareObjectArrays(filteredSource, filteredTarget, options.mode);

            const result: SchemaComparisonResult = {
                comparisonId: this.generateId(),
                sourceConnectionId,
                targetConnectionId,
                sourceObjectCount: filteredSource.length,
                targetObjectCount: filteredTarget.length,
                differences,
                comparisonMode: options.mode,
                createdAt: new Date(),
                executionTime: Date.now() - Date.now() // Will be updated when comparison completes
            };

            Logger.info('Schema comparison completed', 'compareSchemas', {
                comparisonId: result.comparisonId,
                differenceCount: differences.length
            });

            return result;
        } catch (error) {
            Logger.error('Schema comparison failed', error as Error);
            throw error;
        }
    }

    private filterObjects(objects: DatabaseObject[], options: SchemaComparisonOptions): DatabaseObject[] {
        let filtered = objects;

        // Filter by schemas to ignore
        if (options.ignoreSchemas && options.ignoreSchemas.length > 0) {
            filtered = filtered.filter(obj => !options.ignoreSchemas!.includes(obj.schema));
        }

        // Filter by object types
        if (options.objectTypes && options.objectTypes.length > 0) {
            filtered = filtered.filter(obj => options.objectTypes!.includes(obj.type));
        }

        // Filter system objects
        if (!options.includeSystemObjects) {
            const systemSchemas = ['information_schema', 'pg_catalog', 'pg_toast'];
            filtered = filtered.filter(obj => !systemSchemas.includes(obj.schema));
        }

        return filtered;
    }

    private compareObjectArrays(
        source: DatabaseObject[],
        target: DatabaseObject[],
        mode: 'strict' | 'lenient'
    ): SchemaDifference[] {
        const differences: SchemaDifference[] = [];

        // Create lookup maps for efficient comparison
        const sourceMap = new Map<string, DatabaseObject>();
        const targetMap = new Map<string, DatabaseObject>();

        source.forEach(obj => {
            const key = `${obj.type}:${obj.schema}:${obj.name}`;
            sourceMap.set(key, obj);
        });

        target.forEach(obj => {
            const key = `${obj.type}:${obj.schema}:${obj.name}`;
            targetMap.set(key, obj);
        });

        // Find added, removed, and modified objects
        for (const [key, sourceObj] of Array.from(sourceMap)) {
            const targetObj = targetMap.get(key);

            if (!targetObj) {
                differences.push({
                    type: 'Removed',
                    objectType: sourceObj.type,
                    objectName: sourceObj.name,
                    schema: sourceObj.schema,
                    sourceDefinition: sourceObj.definition || undefined,
                    differenceDetails: ['Object exists in source but not in target']
                });
            } else if (this.objectsDiffer(sourceObj, targetObj, mode)) {
                differences.push({
                    type: 'Modified',
                    objectType: sourceObj.type,
                    objectName: sourceObj.name,
                    schema: sourceObj.schema,
                    sourceDefinition: sourceObj.definition || undefined,
                    targetDefinition: targetObj.definition || undefined,
                    differenceDetails: this.getDifferenceDetails(sourceObj, targetObj, mode)
                });
            }
        }

        // Find added objects
        for (const [key, targetObj] of Array.from(targetMap)) {
            if (!sourceMap.has(key)) {
                differences.push({
                    type: 'Added',
                    objectType: targetObj.type,
                    objectName: targetObj.name,
                    schema: targetObj.schema,
                    targetDefinition: targetObj.definition || undefined,
                    differenceDetails: ['Object exists in target but not in source']
                });
            }
        }

        return differences;
    }

    private objectsDiffer(source: DatabaseObject, target: DatabaseObject, mode: 'strict' | 'lenient'): boolean {
        if (mode === 'strict') {
            return source.definition !== target.definition ||
                source.owner !== target.owner ||
                source.sizeInBytes !== target.sizeInBytes;
        } else {
            // Lenient mode: ignore formatting and whitespace differences
            const sourceDef = this.normalizeDefinition(source.definition || '');
            const targetDef = this.normalizeDefinition(target.definition || '');
            return sourceDef !== targetDef;
        }
    }

    private normalizeDefinition(definition: string): string {
        return definition
            .replace(/\s+/g, ' ') // Normalize whitespace
            .replace(/;\s*$/, '') // Remove trailing semicolon
            .trim()
            .toLowerCase();
    }

    private getDifferenceDetails(
        source: DatabaseObject,
        target: DatabaseObject,
        _mode: 'strict' | 'lenient'
    ): string[] {
        const details: string[] = [];

        if (source.definition !== target.definition) {
            details.push('Definition differs');
        }
        if (source.owner !== target.owner) {
            details.push(`Owner differs: ${source.owner} vs ${target.owner}`);
        }
        if (source.sizeInBytes !== target.sizeInBytes) {
            details.push(`Size differs: ${source.sizeInBytes} vs ${target.sizeInBytes} bytes`);
        }
        return details;
    }
    private generateId(): string {
        return crypto.randomUUID();
    }

    // Enhanced detailed schema comparison with metadata extraction
    async compareSchemasDetailed(
        sourceConnectionId: string,
        targetConnectionId: string,
        options: SchemaComparisonOptions = { mode: 'strict' }
    ): Promise<DetailedSchemaComparisonResult> {
        try {
            Logger.info('Starting detailed schema comparison', 'compareSchemasDetailed', {
                sourceConnectionId,
                targetConnectionId,
                mode: options.mode
            });

            // Get basic comparison first
            const basicResult = await this.compareSchemas(sourceConnectionId, targetConnectionId, options);

            // Get connection info for metadata extraction
            const sourceConnection = this.connectionManager.getConnection(sourceConnectionId);
            const targetConnection = this.connectionManager.getConnection(targetConnectionId);

            if (!sourceConnection || !targetConnection) {
                throw new Error('Source or target connection not found');
            }

            const sourcePassword = await this.connectionManager.getConnectionPassword(sourceConnectionId);
            const targetPassword = await this.connectionManager.getConnectionPassword(targetConnectionId);

            if (!sourcePassword || !targetPassword) {
                throw new Error('Password not found for source or target connection');
            }

            const sourceDotNetConnection: DotNetConnectionInfo = {
                id: sourceConnection.id,
                name: sourceConnection.name,
                host: sourceConnection.host,
                port: sourceConnection.port,
                database: sourceConnection.database,
                username: sourceConnection.username,
                password: sourcePassword,
                createdDate: new Date().toISOString()
            };

            const targetDotNetConnection: DotNetConnectionInfo = {
                id: targetConnection.id,
                name: targetConnection.name,
                host: targetConnection.host,
                port: targetConnection.port,
                database: targetConnection.database,
                username: targetConnection.username,
                password: targetPassword,
                createdDate: new Date().toISOString()
            };

            // Extract detailed metadata for all tables
            const columnComparisons = new Map<string, ColumnComparisonDetail[]>();
            const indexComparisons = new Map<string, IndexComparisonDetail[]>();
            const constraintComparisons = new Map<string, ConstraintDifference[]>();
            const viewDependencies = new Map<string, ViewDependencyNode>();
            const dependencyGraph: DependencyGraph = {
                nodes: new Map(),
                edges: []
            };

            // Get all tables for detailed comparison
            const sourceTables = await this.getDatabaseObjects(sourceConnectionId, undefined);
            const targetTables = await this.getDatabaseObjects(targetConnectionId, undefined);

            const allTableNames = new Set([
                ...sourceTables.filter(obj => obj.type === 'table').map(obj => `${obj.schema}.${obj.name}`),
                ...targetTables.filter(obj => obj.type === 'table').map(obj => `${obj.schema}.${obj.name}`)
            ]);

            // Perform detailed comparison for each table
            for (const tableIdentifier of allTableNames) {
                const [schema, tableName] = tableIdentifier.split('.');

                try {
                    // Extract column metadata
                    const [sourceColumns, targetColumns] = await Promise.all([
                        this.dotNetService.extractColumnMetadata(sourceDotNetConnection, tableName, schema)
                            .catch(() => []),
                        this.dotNetService.extractColumnMetadata(targetDotNetConnection, tableName, schema)
                            .catch(() => [])
                    ]);

                    const columnComparison = this.compareColumnsDetailed(sourceColumns, targetColumns);
                    if (columnComparison.length > 0) {
                        columnComparisons.set(tableIdentifier, columnComparison);
                    }

                    // Extract index metadata
                    const [sourceIndexes, targetIndexes] = await Promise.all([
                        this.dotNetService.extractIndexMetadata(sourceDotNetConnection, tableName, schema)
                            .catch(() => []),
                        this.dotNetService.extractIndexMetadata(targetDotNetConnection, tableName, schema)
                            .catch(() => [])
                    ]);

                    const indexComparison = this.compareIndexesDetailed(sourceIndexes, targetIndexes);
                    if (indexComparison.length > 0) {
                        indexComparisons.set(tableIdentifier, indexComparison);
                    }

                    // Extract constraint metadata
                    const [sourceConstraints, targetConstraints] = await Promise.all([
                        this.dotNetService.extractConstraintMetadata(sourceDotNetConnection, tableName, schema)
                            .catch(() => []),
                        this.dotNetService.extractConstraintMetadata(targetDotNetConnection, tableName, schema)
                            .catch(() => [])
                    ]);

                    const constraintComparison = this.compareConstraintsDetailed(sourceConstraints, targetConstraints);
                    if (constraintComparison.length > 0) {
                        constraintComparisons.set(tableIdentifier, constraintComparison);
                    }

                } catch (error) {
                    Logger.warn('Failed to extract detailed metadata for table', 'compareSchemasDetailed', {
                        tableIdentifier,
                        sourceConnectionId,
                        targetConnectionId,
                        error: (error as Error).message
                    });
                }
            }

            // Extract view dependencies
            const allViews = new Set([
                ...sourceTables.filter(obj => obj.type === 'view').map(obj => `${obj.schema}.${obj.name}`),
                ...targetTables.filter(obj => obj.type === 'view').map(obj => `${obj.schema}.${obj.name}`)
            ]);

            for (const viewIdentifier of allViews) {
                const [schema, viewName] = viewIdentifier.split('.');

                try {
                    const [sourceViewMetadata, targetViewMetadata] = await Promise.all([
                        this.dotNetService.extractViewMetadata(sourceDotNetConnection, viewName, schema)
                            .catch(() => []),
                        this.dotNetService.extractViewMetadata(targetDotNetConnection, viewName, schema)
                            .catch(() => [])
                    ]);

                    const viewDependency = this.analyzeViewDependencies(sourceViewMetadata, targetViewMetadata);
                    if (viewDependency) {
                        viewDependencies.set(viewIdentifier, viewDependency);
                    }

                } catch (error) {
                    Logger.warn('Failed to extract view metadata', 'compareSchemasDetailed', {
                        viewIdentifier,
                        sourceConnectionId,
                        targetConnectionId,
                        error: (error as Error).message
                    });
                }
            }

            const detailedResult: DetailedSchemaComparisonResult = {
                ...basicResult,
                columnComparisons,
                indexComparisons,
                constraintComparisons,
                viewDependencies,
                dependencyGraph
            };

            Logger.info('Detailed schema comparison completed', 'compareSchemasDetailed', {
                comparisonId: detailedResult.comparisonId,
                tableCount: allTableNames.size,
                columnComparisonCount: columnComparisons.size,
                indexComparisonCount: indexComparisons.size,
                constraintComparisonCount: constraintComparisons.size,
                viewDependencyCount: viewDependencies.size
            });

            return detailedResult;

        } catch (error) {
            Logger.error('Detailed schema comparison failed', error as Error);
            throw error;
        }
    }

    private compareColumnsDetailed(
        sourceColumns: DotNetColumnMetadata[],
        targetColumns: DotNetColumnMetadata[]
    ): ColumnComparisonDetail[] {
        const differences: ColumnComparisonDetail[] = [];

        // Create lookup maps
        const sourceMap = new Map(sourceColumns.map(col => [col.name, col]));
        const targetMap = new Map(targetColumns.map(col => [col.name, col]));

        // Check all columns from both sides
        const allColumnNames = new Set([...sourceMap.keys(), ...targetMap.keys()]);

        for (const columnName of allColumnNames) {
            const sourceColumn = sourceMap.get(columnName);
            const targetColumn = targetMap.get(columnName);

            const columnDiff: ColumnComparisonDetail = {
                columnName,
                constraintDifferences: []
            };

            let hasDifferences = false;

            // Compare data types
            if (sourceColumn && targetColumn) {
                if (sourceColumn.dataType !== targetColumn.dataType) {
                    columnDiff.dataTypeDifference = {
                        sourceType: sourceColumn.dataType,
                        targetType: targetColumn.dataType,
                        isCompatible: this.areDataTypesCompatible(sourceColumn.dataType, targetColumn.dataType)
                    };
                    hasDifferences = true;
                }

                // Compare nullability
                if (sourceColumn.isNullable !== targetColumn.isNullable) {
                    columnDiff.nullabilityDifference = {
                        sourceNullable: sourceColumn.isNullable,
                        targetNullable: targetColumn.isNullable
                    };
                    hasDifferences = true;
                }

                // Compare default values
                if (sourceColumn.defaultValue !== targetColumn.defaultValue) {
                    columnDiff.defaultValueDifference = {
                        sourceDefault: sourceColumn.defaultValue,
                        targetDefault: targetColumn.defaultValue
                    };
                    hasDifferences = true;
                }

                // Compare constraints
                const constraintDiffs = this.compareColumnConstraints(sourceColumn.constraints, targetColumn.constraints);
                if (constraintDiffs.length > 0) {
                    columnDiff.constraintDifferences = constraintDiffs;
                    hasDifferences = true;
                }

                // Compare statistics if available
                if (sourceColumn.statistics && targetColumn.statistics) {
                    if (sourceColumn.statistics.distinctValues !== targetColumn.statistics.distinctValues ||
                        sourceColumn.statistics.nullCount !== targetColumn.statistics.nullCount) {
                        columnDiff.statisticsDifference = {
                            sourceStats: sourceColumn.statistics,
                            targetStats: targetColumn.statistics
                        };
                        hasDifferences = true;
                    }
                }
            } else if (sourceColumn && !targetColumn) {
                // Column removed
                columnDiff.constraintDifferences = sourceColumn.constraints.map(c => ({
                    constraintName: c.name,
                    constraintType: c.type,
                    differenceType: 'Removed' as const,
                    details: ['Column constraint removed']
                }));
                hasDifferences = true;
            } else if (!sourceColumn && targetColumn) {
                // Column added
                columnDiff.constraintDifferences = targetColumn.constraints.map(c => ({
                    constraintName: c.name,
                    constraintType: c.type,
                    differenceType: 'Added' as const,
                    details: ['Column constraint added']
                }));
                hasDifferences = true;
            }

            if (hasDifferences) {
                differences.push(columnDiff);
            }
        }

        return differences;
    }

    private compareColumnConstraints(
        sourceConstraints: any[],
        targetConstraints: any[]
    ): ConstraintDifference[] {
        const differences: ConstraintDifference[] = [];

        const sourceMap = new Map(sourceConstraints.map(c => [c.name, c]));
        const targetMap = new Map(targetConstraints.map(c => [c.name, c]));

        // Check all constraints
        const allConstraintNames = new Set([...sourceMap.keys(), ...targetMap.keys()]);

        for (const constraintName of allConstraintNames) {
            const sourceConstraint = sourceMap.get(constraintName);
            const targetConstraint = targetMap.get(constraintName);

            if (sourceConstraint && targetConstraint) {
                if (sourceConstraint.definition !== targetConstraint.definition) {
                    differences.push({
                        constraintName,
                        constraintType: sourceConstraint.type,
                        differenceType: 'Modified',
                        details: ['Constraint definition differs']
                    });
                }
            } else if (sourceConstraint && !targetConstraint) {
                differences.push({
                    constraintName,
                    constraintType: sourceConstraint.type,
                    differenceType: 'Removed',
                    details: ['Constraint removed']
                });
            } else if (!sourceConstraint && targetConstraint) {
                differences.push({
                    constraintName,
                    constraintType: targetConstraint.type,
                    differenceType: 'Added',
                    details: ['Constraint added']
                });
            }
        }

        return differences;
    }

    private compareIndexesDetailed(
        sourceIndexes: DotNetIndexMetadata[],
        targetIndexes: DotNetIndexMetadata[]
    ): IndexComparisonDetail[] {
        const differences: IndexComparisonDetail[] = [];

        const sourceMap = new Map(sourceIndexes.map(idx => [idx.name, idx]));
        const targetMap = new Map(targetIndexes.map(idx => [idx.name, idx]));

        const allIndexNames = new Set([...sourceMap.keys(), ...targetMap.keys()]);

        for (const indexName of allIndexNames) {
            const sourceIndex = sourceMap.get(indexName);
            const targetIndex = targetMap.get(indexName);

            const indexDiff: IndexComparisonDetail = {
                indexName
            };

            let hasDifferences = false;

            if (sourceIndex && targetIndex) {
                // Compare uniqueness
                if (sourceIndex.isUnique !== targetIndex.isUnique) {
                    indexDiff.uniquenessDifference = {
                        sourceUnique: sourceIndex.isUnique,
                        targetUnique: targetIndex.isUnique
                    };
                    hasDifferences = true;
                }

                // Compare columns
                if (JSON.stringify(sourceIndex.columnNames) !== JSON.stringify(targetIndex.columnNames)) {
                    indexDiff.columnDifference = {
                        sourceColumns: sourceIndex.columnNames,
                        targetColumns: targetIndex.columnNames
                    };
                    hasDifferences = true;
                }

                // Compare statistics if available
                if (sourceIndex.statistics && targetIndex.statistics) {
                    if (sourceIndex.statistics.sizeInBytes !== targetIndex.statistics.sizeInBytes ||
                        sourceIndex.statistics.indexScans !== targetIndex.statistics.indexScans) {
                        indexDiff.performanceDifference = {
                            sourceStats: sourceIndex.statistics,
                            targetStats: targetIndex.statistics
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

    // Enhanced Index Comparison with Performance Analysis
    async compareIndexesWithPerformance(
        sourceConnectionId: string,
        targetConnectionId: string,
        tableName?: string,
        schema?: string
    ): Promise<{
        indexComparisons: Map<string, IndexComparisonDetail[]>;
        performanceAnalysis: IndexPerformanceAnalysis;
        recommendations: string[];
    }> {
        try {
            Logger.info('Starting detailed index comparison with performance analysis', 'compareIndexesWithPerformance', {
                sourceConnectionId,
                targetConnectionId,
                tableName,
                schema
            });

            // Get connection info for metadata extraction
            const sourceConnection = this.connectionManager.getConnection(sourceConnectionId);
            const targetConnection = this.connectionManager.getConnection(targetConnectionId);

            if (!sourceConnection || !targetConnection) {
                throw new Error('Source or target connection not found');
            }

            const sourcePassword = await this.connectionManager.getConnectionPassword(sourceConnectionId);
            const targetPassword = await this.connectionManager.getConnectionPassword(targetConnectionId);

            if (!sourcePassword || !targetPassword) {
                throw new Error('Password not found for source or target connection');
            }

            const sourceDotNetConnection: DotNetConnectionInfo = {
                id: sourceConnection.id,
                name: sourceConnection.name,
                host: sourceConnection.host,
                port: sourceConnection.port,
                database: sourceConnection.database,
                username: sourceConnection.username,
                password: sourcePassword,
                createdDate: new Date().toISOString()
            };

            const targetDotNetConnection: DotNetConnectionInfo = {
                id: targetConnection.id,
                name: targetConnection.name,
                host: targetConnection.host,
                port: targetConnection.port,
                database: targetConnection.database,
                username: targetConnection.username,
                password: targetPassword,
                createdDate: new Date().toISOString()
            };

            // Extract index metadata
            const [sourceIndexes, targetIndexes] = await Promise.all([
                this.dotNetService.extractIndexMetadata(sourceDotNetConnection, tableName, schema)
                    .catch(() => []),
                this.dotNetService.extractIndexMetadata(targetDotNetConnection, tableName, schema)
                    .catch(() => [])
            ]);

            const indexComparisons = new Map<string, IndexComparisonDetail[]>();
            const performanceAnalysis: IndexPerformanceAnalysis = {
                sourceIndexCount: sourceIndexes.length,
                targetIndexCount: targetIndexes.length,
                performanceDifferences: [],
                unusedIndexes: [],
                missingIndexes: [],
                redundantIndexes: []
            };

            // Perform detailed index comparison
            const indexComparison = this.compareIndexesDetailed(sourceIndexes, targetIndexes);
            if (indexComparison.length > 0 && tableName && schema) {
                indexComparisons.set(`${schema}.${tableName}`, indexComparison);
            }

            // Analyze performance differences
            performanceAnalysis.performanceDifferences = this.analyzeIndexPerformanceDifferences(sourceIndexes, targetIndexes);

            // Identify unused and missing indexes
            performanceAnalysis.unusedIndexes = this.identifyUnusedIndexes(sourceIndexes);
            performanceAnalysis.missingIndexes = this.identifyMissingIndexes(sourceIndexes, targetIndexes);
            performanceAnalysis.redundantIndexes = this.identifyRedundantIndexes(sourceIndexes, targetIndexes);

            // Generate recommendations
            const recommendations = this.generateIndexRecommendations(performanceAnalysis);

            const result = {
                indexComparisons,
                performanceAnalysis,
                recommendations
            };

            Logger.info('Index comparison with performance analysis completed', 'compareIndexesWithPerformance', {
                sourceIndexCount: sourceIndexes.length,
                targetIndexCount: targetIndexes.length,
                performanceDifferences: performanceAnalysis.performanceDifferences.length,
                recommendationsCount: recommendations.length
            });

            return result;

        } catch (error) {
            Logger.error('Index comparison with performance analysis failed', error as Error);
            throw error;
        }
    }

    private analyzeIndexPerformanceDifferences(
        sourceIndexes: DotNetIndexMetadata[],
        targetIndexes: DotNetIndexMetadata[]
    ): IndexPerformanceDifference[] {
        const differences: IndexPerformanceDifference[] = [];

        const sourceMap = new Map(sourceIndexes.map(idx => [idx.name, idx]));
        const targetMap = new Map(targetIndexes.map(idx => [idx.name, idx]));

        // Compare performance statistics for matching indexes
        for (const [indexName, sourceIndex] of sourceMap) {
            const targetIndex = targetMap.get(indexName);

            if (targetIndex && sourceIndex.statistics && targetIndex.statistics) {
                const sourceStats = sourceIndex.statistics;
                const targetStats = targetIndex.statistics;

                // Calculate performance metrics
                const sizeDifference = Math.abs(sourceStats.sizeInBytes - targetStats.sizeInBytes);
                const scanDifference = Math.abs(sourceStats.indexScans - targetStats.indexScans);

                if (sizeDifference > 1024 * 1024 || scanDifference > 100) { // Significant differences
                    differences.push({
                        indexName,
                        sourceStats,
                        targetStats,
                        sizeDifference,
                        scanDifference,
                        impact: this.calculatePerformanceImpact(sizeDifference, scanDifference)
                    });
                }
            }
        }

        return differences;
    }

    private identifyUnusedIndexes(indexes: DotNetIndexMetadata[]): string[] {
        // Identify indexes with low scan counts (potential unused indexes)
        return indexes
            .filter(idx => idx.statistics && idx.statistics.indexScans < 10)
            .map(idx => idx.name);
    }

    private identifyMissingIndexes(
        sourceIndexes: DotNetIndexMetadata[],
        targetIndexes: DotNetIndexMetadata[]
    ): string[] {
        // This would require more sophisticated analysis of query patterns
        // For now, return empty array as this needs query analysis
        return [];
    }

    private identifyRedundantIndexes(
        sourceIndexes: DotNetIndexMetadata[],
        targetIndexes: DotNetIndexMetadata[]
    ): Array<{sourceIndex: string; targetIndex: string; reason: string}> {
        const redundant: Array<{sourceIndex: string; targetIndex: string; reason: string}> = [];

        // Look for indexes with similar column patterns
        for (const sourceIndex of sourceIndexes) {
            for (const targetIndex of targetIndexes) {
                if (this.areIndexesRedundant(sourceIndex, targetIndex)) {
                    redundant.push({
                        sourceIndex: sourceIndex.name,
                        targetIndex: targetIndex.name,
                        reason: 'Similar column patterns detected'
                    });
                }
            }
        }

        return redundant;
    }

    private areIndexesRedundant(index1: DotNetIndexMetadata, index2: DotNetIndexMetadata): boolean {
        // Check if indexes have the same columns in the same order
        if (index1.columnNames.length === index2.columnNames.length) {
            return index1.columnNames.every((col, idx) => col === index2.columnNames[idx]);
        }
        return false;
    }

    private calculatePerformanceImpact(sizeDifference: number, scanDifference: number): 'low' | 'medium' | 'high' {
        const sizeImpact = sizeDifference / (1024 * 1024); // Size difference in MB
        const scanImpact = scanDifference;

        if (sizeImpact > 100 || scanImpact > 1000) {
            return 'high';
        } else if (sizeImpact > 10 || scanImpact > 100) {
            return 'medium';
        }
        return 'low';
    }

    private generateIndexRecommendations(analysis: IndexPerformanceAnalysis): string[] {
        const recommendations: string[] = [];

        // Recommendations based on unused indexes
        if (analysis.unusedIndexes.length > 0) {
            recommendations.push(`Consider dropping unused indexes: ${analysis.unusedIndexes.join(', ')}`);
        }

        // Recommendations based on performance differences
        analysis.performanceDifferences.forEach(diff => {
            if (diff.impact === 'high') {
                recommendations.push(`Review index '${diff.indexName}' - significant performance difference detected`);
            }
        });

        // Recommendations based on redundant indexes
        analysis.redundantIndexes.forEach(redundant => {
            recommendations.push(`Potential redundant index pair: '${redundant.sourceIndex}' and '${redundant.targetIndex}'`);
        });

        return recommendations;
    }

    private compareConstraintsDetailed(
        sourceConstraints: DotNetConstraintMetadata[],
        targetConstraints: DotNetConstraintMetadata[]
    ): ConstraintDifference[] {
        const differences: ConstraintDifference[] = [];

        const sourceMap = new Map(sourceConstraints.map(c => [c.name, c]));
        const targetMap = new Map(targetConstraints.map(c => [c.name, c]));

        const allConstraintNames = new Set([...sourceMap.keys(), ...targetMap.keys()]);

        for (const constraintName of allConstraintNames) {
            const sourceConstraint = sourceMap.get(constraintName);
            const targetConstraint = targetMap.get(constraintName);

            if (sourceConstraint && targetConstraint) {
                if (sourceConstraint.definition !== targetConstraint.definition ||
                    sourceConstraint.isEnabled !== targetConstraint.isEnabled) {
                    differences.push({
                        constraintName,
                        constraintType: sourceConstraint.type,
                        differenceType: 'Modified',
                        details: ['Constraint definition or enabled state differs']
                    });
                }
            } else if (sourceConstraint && !targetConstraint) {
                differences.push({
                    constraintName,
                    constraintType: sourceConstraint.type,
                    differenceType: 'Removed',
                    details: ['Constraint removed']
                });
            } else if (!sourceConstraint && targetConstraint) {
                differences.push({
                    constraintName,
                    constraintType: targetConstraint.type,
                    differenceType: 'Added',
                    details: ['Constraint added']
                });
            }
        }

        return differences;
    }

    // Enhanced Constraint Analysis with Dependency Tracking
    async analyzeConstraintsWithDependencies(
        sourceConnectionId: string,
        targetConnectionId: string,
        tableName?: string,
        schema?: string
    ): Promise<{
        constraintComparisons: Map<string, ConstraintDifference[]>;
        dependencyAnalysis: ConstraintDependencyAnalysis;
        integrityImpact: IntegrityImpactAssessment;
        recommendations: string[];
    }> {
        try {
            Logger.info('Starting constraint analysis with dependency tracking', 'analyzeConstraintsWithDependencies', {
                sourceConnectionId,
                targetConnectionId,
                tableName,
                schema
            });

            // Get connection info for metadata extraction
            const sourceConnection = this.connectionManager.getConnection(sourceConnectionId);
            const targetConnection = this.connectionManager.getConnection(targetConnectionId);

            if (!sourceConnection || !targetConnection) {
                throw new Error('Source or target connection not found');
            }

            const sourcePassword = await this.connectionManager.getConnectionPassword(sourceConnectionId);
            const targetPassword = await this.connectionManager.getConnectionPassword(targetConnectionId);

            if (!sourcePassword || !targetPassword) {
                throw new Error('Password not found for source or target connection');
            }

            const sourceDotNetConnection: DotNetConnectionInfo = {
                id: sourceConnection.id,
                name: sourceConnection.name,
                host: sourceConnection.host,
                port: sourceConnection.port,
                database: sourceConnection.database,
                username: sourceConnection.username,
                password: sourcePassword,
                createdDate: new Date().toISOString()
            };

            const targetDotNetConnection: DotNetConnectionInfo = {
                id: targetConnection.id,
                name: targetConnection.name,
                host: targetConnection.host,
                port: targetConnection.port,
                database: targetConnection.database,
                username: targetConnection.username,
                password: targetPassword,
                createdDate: new Date().toISOString()
            };

            // Extract constraint metadata
            const [sourceConstraints, targetConstraints] = await Promise.all([
                this.dotNetService.extractConstraintMetadata(sourceDotNetConnection, tableName, schema)
                    .catch(() => []),
                this.dotNetService.extractConstraintMetadata(targetDotNetConnection, tableName, schema)
                    .catch(() => [])
            ]);

            const constraintComparisons = new Map<string, ConstraintDifference[]>();
            const dependencyAnalysis: ConstraintDependencyAnalysis = {
                primaryKeyDependencies: [],
                foreignKeyDependencies: [],
                checkConstraintDependencies: [],
                circularDependencies: [],
                cascadePaths: []
            };

            // Perform detailed constraint comparison
            const constraintComparison = this.compareConstraintsDetailed(sourceConstraints, targetConstraints);
            if (constraintComparison.length > 0 && tableName && schema) {
                constraintComparisons.set(`${schema}.${tableName}`, constraintComparison);
            }

            // Analyze constraint dependencies
            dependencyAnalysis.primaryKeyDependencies = this.analyzePrimaryKeyDependencies(sourceConstraints, targetConstraints);
            dependencyAnalysis.foreignKeyDependencies = this.analyzeForeignKeyDependencies(sourceConstraints, targetConstraints);
            dependencyAnalysis.checkConstraintDependencies = this.analyzeCheckConstraintDependencies(sourceConstraints, targetConstraints);
            dependencyAnalysis.circularDependencies = this.identifyCircularDependencies(sourceConstraints, targetConstraints);
            dependencyAnalysis.cascadePaths = this.analyzeCascadePaths(sourceConstraints, targetConstraints);

            // Assess integrity impact
            const integrityImpact = this.assessIntegrityImpact(constraintComparison, dependencyAnalysis);

            // Generate recommendations
            const recommendations = this.generateConstraintRecommendations(constraintComparison, dependencyAnalysis, integrityImpact);

            const result = {
                constraintComparisons,
                dependencyAnalysis,
                integrityImpact,
                recommendations
            };

            Logger.info('Constraint analysis with dependency tracking completed', 'analyzeConstraintsWithDependencies', {
                sourceConstraintCount: sourceConstraints.length,
                targetConstraintCount: targetConstraints.length,
                primaryKeyDependencies: dependencyAnalysis.primaryKeyDependencies.length,
                foreignKeyDependencies: dependencyAnalysis.foreignKeyDependencies.length,
                circularDependencies: dependencyAnalysis.circularDependencies.length,
                recommendationsCount: recommendations.length
            });

            return result;

        } catch (error) {
            Logger.error('Constraint analysis with dependency tracking failed', error as Error);
            throw error;
        }
    }

    private analyzePrimaryKeyDependencies(
        sourceConstraints: DotNetConstraintMetadata[],
        targetConstraints: DotNetConstraintMetadata[]
    ): PrimaryKeyDependency[] {
        const dependencies: PrimaryKeyDependency[] = [];

        const sourcePKs = sourceConstraints.filter(c => c.type === 'PRIMARY KEY');
        const targetPKs = targetConstraints.filter(c => c.type === 'PRIMARY KEY');

        // Analyze primary key relationships and dependencies
        for (const sourcePK of sourcePKs) {
            const targetPK = targetPKs.find(pk => pk.name === sourcePK.name);

            if (targetPK) {
                // Check if primary key structure changed
                if (sourcePK.columns.length !== targetPK.columns.length ||
                    !sourcePK.columns.every((col, idx) => col === targetPK.columns[idx])) {
                    dependencies.push({
                        tableName: sourcePK.tableName,
                        schema: sourcePK.schema,
                        sourceColumns: sourcePK.columns,
                        targetColumns: targetPK.columns,
                        impact: 'structure_changed',
                        dependentObjects: this.identifyDependentObjects(sourcePK)
                    });
                }
            } else {
                // Primary key removed - high impact
                dependencies.push({
                    tableName: sourcePK.tableName,
                    schema: sourcePK.schema,
                    sourceColumns: sourcePK.columns,
                    targetColumns: [],
                    impact: 'removed',
                    dependentObjects: this.identifyDependentObjects(sourcePK)
                });
            }
        }

        return dependencies;
    }

    private analyzeForeignKeyDependencies(
        sourceConstraints: DotNetConstraintMetadata[],
        targetConstraints: DotNetConstraintMetadata[]
    ): ForeignKeyDependency[] {
        const dependencies: ForeignKeyDependency[] = [];

        const sourceFKs = sourceConstraints.filter(c => c.type === 'FOREIGN KEY');
        const targetFKs = targetConstraints.filter(c => c.type === 'FOREIGN KEY');

        // Analyze foreign key relationships
        for (const sourceFK of sourceFKs) {
            const targetFK = targetFKs.find(fk => fk.name === sourceFK.name);

            if (targetFK) {
                // Check if foreign key references changed
                if (sourceFK.referencedTable !== targetFK.referencedTable ||
                    JSON.stringify(sourceFK.referencedColumns) !== JSON.stringify(targetFK.referencedColumns)) {
                    dependencies.push({
                        constraintName: sourceFK.name,
                        sourceTable: sourceFK.tableName,
                        targetTable: targetFK.referencedTable || '',
                        sourceColumns: sourceFK.columns,
                        targetColumns: targetFK.referencedColumns || [],
                        relationshipType: this.determineRelationshipType(sourceFK, targetFK),
                        cascadeBehavior: this.analyzeCascadeBehavior(sourceFK, targetFK)
                    });
                }
            } else {
                // Foreign key removed - potential data integrity issue
                dependencies.push({
                    constraintName: sourceFK.name,
                    sourceTable: sourceFK.tableName,
                    targetTable: sourceFK.referencedTable || '',
                    sourceColumns: sourceFK.columns,
                    targetColumns: sourceFK.referencedColumns || [],
                    relationshipType: 'removed',
                    cascadeBehavior: 'restrict'
                });
            }
        }

        return dependencies;
    }

    private analyzeCheckConstraintDependencies(
        sourceConstraints: DotNetConstraintMetadata[],
        targetConstraints: DotNetConstraintMetadata[]
    ): CheckConstraintDependency[] {
        const dependencies: CheckConstraintDependency[] = [];

        const sourceChecks = sourceConstraints.filter(c => c.type === 'CHECK');
        const targetChecks = targetConstraints.filter(c => c.type === 'CHECK');

        // Analyze check constraint dependencies
        for (const sourceCheck of sourceChecks) {
            const targetCheck = targetChecks.find(check => check.name === sourceCheck.name);

            if (targetCheck) {
                if (sourceCheck.definition !== targetCheck.definition) {
                    dependencies.push({
                        constraintName: sourceCheck.name,
                        tableName: sourceCheck.tableName,
                        schema: sourceCheck.schema,
                        sourceDefinition: sourceCheck.definition,
                        targetDefinition: targetCheck.definition,
                        complexity: this.assessCheckConstraintComplexity(sourceCheck.definition),
                        dependentColumns: this.extractColumnsFromCheckConstraint(sourceCheck.definition)
                    });
                }
            } else {
                // Check constraint removed
                dependencies.push({
                    constraintName: sourceCheck.name,
                    tableName: sourceCheck.tableName,
                    schema: sourceCheck.schema,
                    sourceDefinition: sourceCheck.definition,
                    targetDefinition: '',
                    complexity: this.assessCheckConstraintComplexity(sourceCheck.definition),
                    dependentColumns: this.extractColumnsFromCheckConstraint(sourceCheck.definition)
                });
            }
        }

        return dependencies;
    }

    private identifyCircularDependencies(
        sourceConstraints: DotNetConstraintMetadata[],
        targetConstraints: DotNetConstraintMetadata[]
    ): CircularDependency[] {
        const circularDeps: CircularDependency[] = [];

        // This would implement sophisticated circular dependency detection
        // For now, return empty array as this requires graph analysis
        return circularDeps;
    }

    private analyzeCascadePaths(
        sourceConstraints: DotNetConstraintMetadata[],
        targetConstraints: DotNetConstraintMetadata[]
    ): CascadePath[] {
        const cascadePaths: CascadePath[] = [];

        // Analyze cascade delete/update paths
        const foreignKeys = [...sourceConstraints, ...targetConstraints]
            .filter(c => c.type === 'FOREIGN KEY');

        // This would implement cascade path analysis
        // For now, return empty array as this requires complex relationship analysis
        return cascadePaths;
    }

    private assessIntegrityImpact(
        constraintDifferences: ConstraintDifference[],
        dependencyAnalysis: ConstraintDependencyAnalysis
    ): IntegrityImpactAssessment {
        const highImpactChanges = constraintDifferences.filter(diff =>
            diff.differenceType === 'Removed' && diff.constraintType === 'PRIMARY KEY'
        ).length;

        const mediumImpactChanges = constraintDifferences.filter(diff =>
            diff.differenceType === 'Removed' && diff.constraintType === 'FOREIGN KEY'
        ).length;

        const riskLevel = highImpactChanges > 0 ? 'high' :
                         mediumImpactChanges > 0 ? 'medium' : 'low';

        return {
            riskLevel,
            highImpactChanges,
            mediumImpactChanges,
            lowImpactChanges: constraintDifferences.length - highImpactChanges - mediumImpactChanges,
            affectedTables: this.extractAffectedTables(constraintDifferences),
            dataLossRisk: highImpactChanges > 0 || mediumImpactChanges > 2,
            consistencyRisk: mediumImpactChanges > 0
        };
    }

    private generateConstraintRecommendations(
        constraintDifferences: ConstraintDifference[],
        dependencyAnalysis: ConstraintDependencyAnalysis,
        integrityImpact: IntegrityImpactAssessment
    ): string[] {
        const recommendations: string[] = [];

        if (integrityImpact.riskLevel === 'high') {
            recommendations.push('HIGH RISK: Primary key changes detected. Review data integrity impact before proceeding.');
        }

        if (integrityImpact.dataLossRisk) {
            recommendations.push('WARNING: Foreign key changes may cause data loss. Consider backup before migration.');
        }

        if (dependencyAnalysis.circularDependencies.length > 0) {
            recommendations.push('WARNING: Circular dependencies detected. Review constraint relationships carefully.');
        }

        constraintDifferences.forEach(diff => {
            if (diff.differenceType === 'Removed' && diff.constraintType === 'CHECK') {
                recommendations.push(`Review removal of check constraint '${diff.constraintName}' - may affect data validation.`);
            }
        });

        return recommendations;
    }

    private identifyDependentObjects(constraint: DotNetConstraintMetadata): string[] {
        // Identify objects that depend on this constraint
        // This would require more sophisticated dependency analysis
        return [];
    }

    private determineRelationshipType(sourceFK: DotNetConstraintMetadata, targetFK: DotNetConstraintMetadata): string {
        // Determine the type of relationship (one-to-one, one-to-many, etc.)
        return 'unknown';
    }

    private analyzeCascadeBehavior(sourceFK: DotNetConstraintMetadata, targetFK: DotNetConstraintMetadata): string {
        // Analyze cascade delete/update behavior
        return 'restrict';
    }

    private assessCheckConstraintComplexity(definition: string): 'simple' | 'moderate' | 'complex' {
        const complexityIndicators = ['SUBQUERY', 'EXISTS', 'IN (', 'CASE WHEN'];
        const complexCount = complexityIndicators.filter(indicator =>
            definition.toUpperCase().includes(indicator)
        ).length;

        if (complexCount > 2) return 'complex';
        if (complexCount > 0) return 'moderate';
        return 'simple';
    }

    private extractColumnsFromCheckConstraint(definition: string): string[] {
        // Extract column names from check constraint definition
        // This is a simplified implementation
        const columnRegex = /(\w+)\s*(>|<|=|>=|<=|<>|LIKE|ILIKE)/g;
        const columns: string[] = [];
        let match;

        while ((match = columnRegex.exec(definition)) !== null) {
            columns.push(match[1]);
        }

        return [...new Set(columns)]; // Remove duplicates
    }

    private extractAffectedTables(constraintDifferences: ConstraintDifference[]): string[] {
        const tables = new Set<string>();

        constraintDifferences.forEach(diff => {
            if (diff.constraintName.includes('.')) {
                tables.add(diff.constraintName.split('.')[0]);
            }
        });

        return Array.from(tables);
    }

    // Enhanced View Dependency Analysis with Impact Assessment
    async analyzeViewDependenciesWithImpact(
        sourceConnectionId: string,
        targetConnectionId: string,
        viewName?: string,
        schema?: string
    ): Promise<{
        viewDependencies: Map<string, ViewDependencyNode>;
        dependencyGraph: DependencyGraph;
        impactAnalysis: ViewImpactAnalysis;
        recommendations: string[];
    }> {
        try {
            Logger.info('Starting view dependency analysis with impact assessment', 'analyzeViewDependenciesWithImpact', {
                sourceConnectionId,
                targetConnectionId,
                viewName,
                schema
            });

            // Get connection info for metadata extraction
            const sourceConnection = this.connectionManager.getConnection(sourceConnectionId);
            const targetConnection = this.connectionManager.getConnection(targetConnectionId);

            if (!sourceConnection || !targetConnection) {
                throw new Error('Source or target connection not found');
            }

            const sourcePassword = await this.connectionManager.getConnectionPassword(sourceConnectionId);
            const targetPassword = await this.connectionManager.getConnectionPassword(targetConnectionId);

            if (!sourcePassword || !targetPassword) {
                throw new Error('Password not found for source or target connection');
            }

            const sourceDotNetConnection: DotNetConnectionInfo = {
                id: sourceConnection.id,
                name: sourceConnection.name,
                host: sourceConnection.host,
                port: sourceConnection.port,
                database: sourceConnection.database,
                username: sourceConnection.username,
                password: sourcePassword,
                createdDate: new Date().toISOString()
            };

            const targetDotNetConnection: DotNetConnectionInfo = {
                id: targetConnection.id,
                name: targetConnection.name,
                host: targetConnection.host,
                port: targetConnection.port,
                database: targetConnection.database,
                username: targetConnection.username,
                password: targetPassword,
                createdDate: new Date().toISOString()
            };

            // Extract view metadata
            const [sourceViewMetadata, targetViewMetadata] = await Promise.all([
                this.dotNetService.extractViewMetadata(sourceDotNetConnection, viewName, schema)
                    .catch(() => []),
                this.dotNetService.extractViewMetadata(targetDotNetConnection, viewName, schema)
                    .catch(() => [])
            ]);

            const viewDependencies = new Map<string, ViewDependencyNode>();
            const dependencyGraph: DependencyGraph = {
                nodes: new Map(),
                edges: []
            };

            const impactAnalysis: ViewImpactAnalysis = {
                affectedViews: [],
                dependencyChains: [],
                riskLevel: 'low',
                estimatedImpact: 'minimal',
                cascadingChanges: []
            };

            // Analyze each view's dependencies
            const allViews = new Set([
                ...sourceViewMetadata.map(v => `${v.schema}.${v.name}`),
                ...targetViewMetadata.map(v => `${v.schema}.${v.name}`)
            ]);

            for (const viewIdentifier of allViews) {
                const [viewSchema, viewViewName] = viewIdentifier.split('.');

                const [sourceView, targetView] = await Promise.all([
                    sourceViewMetadata.find(v => v.name === viewViewName && v.schema === viewSchema),
                    targetViewMetadata.find(v => v.name === viewViewName && v.schema === viewSchema)
                ]);

                if (sourceView || targetView) {
                    const dependencyNode = this.buildViewDependencyNode(sourceView, targetView);
                    if (dependencyNode) {
                        viewDependencies.set(viewIdentifier, dependencyNode);

                        // Add to dependency graph
                        this.addViewToDependencyGraph(dependencyNode, dependencyGraph);
                    }
                }
            }

            // Analyze dependency chains and impact
            impactAnalysis.dependencyChains = this.analyzeDependencyChains(dependencyGraph);
            impactAnalysis.affectedViews = this.identifyAffectedViews(viewDependencies, dependencyGraph);
            impactAnalysis.riskLevel = this.assessViewDependencyRisk(impactAnalysis.dependencyChains);
            impactAnalysis.estimatedImpact = this.estimateViewImpact(impactAnalysis.riskLevel, impactAnalysis.affectedViews.length);
            impactAnalysis.cascadingChanges = this.identifyCascadingChanges(dependencyGraph);

            // Generate recommendations
            const recommendations = this.generateViewDependencyRecommendations(impactAnalysis, dependencyGraph);

            const result = {
                viewDependencies,
                dependencyGraph,
                impactAnalysis,
                recommendations
            };

            Logger.info('View dependency analysis with impact assessment completed', 'analyzeViewDependenciesWithImpact', {
                viewCount: allViews.size,
                dependencyChains: impactAnalysis.dependencyChains.length,
                affectedViews: impactAnalysis.affectedViews.length,
                riskLevel: impactAnalysis.riskLevel,
                recommendationsCount: recommendations.length
            });

            return result;

        } catch (error) {
            Logger.error('View dependency analysis with impact assessment failed', error as Error);
            throw error;
        }
    }

    private buildViewDependencyNode(
        sourceView?: DotNetViewMetadata,
        targetView?: DotNetViewMetadata
    ): ViewDependencyNode | null {
        if (!sourceView && !targetView) return null;

        const view = sourceView || targetView!;
        const dependencies = view.dependencies || [];

        // Analyze dependency levels and relationships
        const dependencyLevels = this.calculateDependencyLevels(dependencies);

        return {
            viewName: view.name,
            schema: view.schema,
            dependencies: dependencies,
            dependents: [], // Would be populated from reverse dependency analysis
            level: dependencyLevels.maxLevel,
            isMaterialized: view.isMaterialized,
            columnDependencies: this.analyzeColumnDependencies(view),
            hasCircularDependency: dependencyLevels.hasCircular,
            complexity: this.assessViewComplexity(view)
        };
    }

    private calculateDependencyLevels(dependencies: ViewDependency[]): { maxLevel: number; hasCircular: boolean } {
        let maxLevel = 0;
        let hasCircular = false;

        // Simple dependency level calculation
        // In a real implementation, this would use graph traversal algorithms
        for (const dep of dependencies) {
            if (dep.type === 'view') {
                maxLevel = Math.max(maxLevel, 1); // Views add one level
            }
        }

        return { maxLevel, hasCircular };
    }

    private analyzeColumnDependencies(view: DotNetViewMetadata): ColumnDependency[] {
        const columnDependencies: ColumnDependency[] = [];

        // Analyze which columns depend on which source columns
        view.columns.forEach(col => {
            const sourceColumns = this.extractSourceColumns(col.sourceExpression);
            if (sourceColumns.length > 0) {
                columnDependencies.push({
                    viewColumn: col.name,
                    sourceColumns: sourceColumns,
                    expression: col.sourceExpression,
                    complexity: this.assessExpressionComplexity(col.sourceExpression)
                });
            }
        });

        return columnDependencies;
    }

    private extractSourceColumns(expression: string): string[] {
        // Extract column names from SQL expression
        // This is a simplified implementation
        const columnRegex = /(\w+)\.(\w+)|\b(\w+)\b/g;
        const columns: string[] = [];
        let match;

        while ((match = columnRegex.exec(expression)) !== null) {
            // Skip SQL keywords and functions
            const potentialColumn = match[2] || match[3];
            if (potentialColumn && !this.isSQLKeyword(potentialColumn)) {
                columns.push(potentialColumn);
            }
        }

        return [...new Set(columns)]; // Remove duplicates
    }

    private isSQLKeyword(word: string): boolean {
        const sqlKeywords = ['SELECT', 'FROM', 'WHERE', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'ON', 'GROUP', 'ORDER', 'BY', 'HAVING', 'COUNT', 'SUM', 'AVG', 'MAX', 'MIN'];
        return sqlKeywords.includes(word.toUpperCase());
    }

    private assessExpressionComplexity(expression: string): 'simple' | 'moderate' | 'complex' {
        const complexityIndicators = ['CASE', 'WHEN', 'SUBQUERY', 'EXISTS', 'IN (', 'WINDOW'];
        const complexCount = complexityIndicators.filter(indicator =>
            expression.toUpperCase().includes(indicator)
        ).length;

        if (complexCount > 2) return 'complex';
        if (complexCount > 0) return 'moderate';
        return 'simple';
    }

    private assessViewComplexity(view: DotNetViewMetadata): 'simple' | 'moderate' | 'complex' {
        let complexity = 'simple';

        // Check for materialized view
        if (view.isMaterialized) {
            complexity = 'moderate';
        }

        // Check column complexity
        const complexColumns = view.columns.filter(col =>
            this.assessExpressionComplexity(col.sourceExpression) === 'complex'
        ).length;

        if (complexColumns > view.columns.length / 2) {
            complexity = 'complex';
        } else if (complexColumns > 0) {
            complexity = 'moderate';
        }

        // Check dependency complexity
        const viewDependencies = view.dependencies.filter(dep => dep.type === 'view').length;
        if (viewDependencies > 3) {
            complexity = 'complex';
        } else if (viewDependencies > 1) {
            complexity = 'moderate';
        }

        return complexity as 'simple' | 'moderate' | 'complex';
    }

    private addViewToDependencyGraph(node: ViewDependencyNode, graph: DependencyGraph): void {
        // Add view as a node
        const nodeId = `${node.schema}.${node.viewName}`;
        graph.nodes.set(nodeId, {
            id: nodeId,
            name: node.viewName,
            type: 'view',
            schema: node.schema,
            level: node.level
        });

        // Add dependency edges
        node.dependencies.forEach(dep => {
            const depId = `${dep.schema}.${dep.name}`;
            graph.edges.push({
                from: nodeId,
                to: depId,
                type: 'depends_on'
            });
        });
    }

    private analyzeDependencyChains(graph: DependencyGraph): DependencyChain[] {
        const chains: DependencyChain[] = [];

        // Find all dependency chains in the graph
        // This would implement sophisticated graph traversal
        for (const [nodeId, node] of graph.nodes) {
            const chain = this.traceDependencyChain(nodeId, graph);
            if (chain.length > 1) { // Only include chains with dependencies
                chains.push({
                    startView: nodeId,
                    endView: chain[chain.length - 1],
                    views: chain,
                    length: chain.length,
                    complexity: this.assessChainComplexity(chain, graph)
                });
            }
        }

        return chains;
    }

    private traceDependencyChain(startNodeId: string, graph: DependencyGraph): string[] {
        const chain: string[] = [startNodeId];
        const visited = new Set<string>();

        // Simple dependency tracing (would be more sophisticated in real implementation)
        const edges = graph.edges.filter(edge => edge.from === startNodeId);
        for (const edge of edges) {
            if (!visited.has(edge.to)) {
                visited.add(edge.to);
                chain.push(edge.to);
            }
        }

        return chain;
    }

    private assessChainComplexity(chain: string[], graph: DependencyGraph): 'simple' | 'moderate' | 'complex' {
        if (chain.length <= 2) return 'simple';
        if (chain.length <= 4) return 'moderate';
        return 'complex';
    }

    private identifyAffectedViews(
        viewDependencies: Map<string, ViewDependencyNode>,
        graph: DependencyGraph
    ): string[] {
        // Identify views that would be affected by changes
        const affected: string[] = [];

        for (const [viewId, node] of viewDependencies) {
            if (node.hasCircularDependency || node.level > 2) {
                affected.push(viewId);
            }
        }

        return affected;
    }

    private assessViewDependencyRisk(chains: DependencyChain[]): 'low' | 'medium' | 'high' {
        const complexChains = chains.filter(chain => chain.complexity === 'complex').length;
        const longChains = chains.filter(chain => chain.length > 3).length;

        if (complexChains > 0 || longChains > 2) return 'high';
        if (longChains > 0) return 'medium';
        return 'low';
    }

    private estimateViewImpact(riskLevel: string, affectedViewCount: number): 'minimal' | 'moderate' | 'significant' {
        if (riskLevel === 'high' || affectedViewCount > 5) return 'significant';
        if (riskLevel === 'medium' || affectedViewCount > 2) return 'moderate';
        return 'minimal';
    }

    private identifyCascadingChanges(graph: DependencyGraph): CascadingChange[] {
        const cascadingChanges: CascadingChange[] = [];

        // Identify changes that would cascade through dependencies
        // This would implement sophisticated cascade analysis
        return cascadingChanges;
    }

    private generateViewDependencyRecommendations(
        impactAnalysis: ViewImpactAnalysis,
        graph: DependencyGraph
    ): string[] {
        const recommendations: string[] = [];

        if (impactAnalysis.riskLevel === 'high') {
            recommendations.push('HIGH RISK: Complex view dependencies detected. Consider testing view changes in staging environment first.');
        }

        if (impactAnalysis.affectedViews.length > 0) {
            recommendations.push(`Review affected views: ${impactAnalysis.affectedViews.join(', ')}`);
        }

        if (impactAnalysis.cascadingChanges.length > 0) {
            recommendations.push('WARNING: Cascading changes detected. Changes may affect multiple dependent views.');
        }

        const complexViews = Array.from(graph.nodes.values()).filter(node => node.level > 2);
        if (complexViews.length > 0) {
            recommendations.push(`Consider simplifying complex views: ${complexViews.map(n => n.name).join(', ')}`);
        }

        return recommendations;
    }

    private analyzeViewDependencies(
        sourceViewMetadata: DotNetViewMetadata[],
        targetViewMetadata: DotNetViewMetadata[]
    ): ViewDependencyNode | null {
        // For now, return a basic dependency node
        // This would be enhanced with more sophisticated dependency analysis
        if (sourceViewMetadata.length > 0 || targetViewMetadata.length > 0) {
            const viewMeta = sourceViewMetadata[0] || targetViewMetadata[0];
            return {
                viewName: viewMeta.name,
                schema: viewMeta.schema,
                dependencies: viewMeta.dependencies,
                dependents: [],
                level: 0
            };
        }
        return null;
    }

    private areDataTypesCompatible(sourceType: string, targetType: string): boolean {
        // Basic compatibility check - could be enhanced with more sophisticated type mapping
        const compatibleTypes = new Map([
            ['integer', ['bigint', 'numeric', 'real', 'double precision']],
            ['bigint', ['numeric']],
            ['numeric', ['real', 'double precision']],
            ['varchar', ['text', 'character varying']],
            ['text', ['varchar', 'character varying']]
        ]);

        const compatible = compatibleTypes.get(sourceType.toLowerCase());
        return compatible?.includes(targetType.toLowerCase()) || false;
    }

    // Enhanced Rich Metadata Handling Methods

    async getRichMetadataObject(
        connectionId: string,
        objectType: string,
        schema: string,
        objectName: string,
        options: { includeDependencies?: boolean; includePerformance?: boolean } = {}
    ): Promise<RichMetadataObject> {
        try {
            Logger.info('Getting rich metadata object', 'getRichMetadataObject', {
                connectionId,
                objectType,
                schema,
                objectName,
                options
            });

            // Check metadata cache first
            const cacheKey = `${connectionId}:${objectType}:${schema}:${objectName}`;
            const cached = this.metadataCache.get(cacheKey);

            if (cached && !this.isMetadataCacheExpired(cached) && !cached.isDirty) {
                Logger.debug('Returning cached rich metadata object', 'getRichMetadataObject', {
                    connectionId,
                    objectName,
                    cacheAge: Date.now() - cached.cachedAt.getTime()
                });
                cached.accessCount++;
                cached.lastAccessed = new Date();
                return cached.object;
            }

            // Get basic object details
            const basicDetails = await this.getObjectDetails(connectionId, objectType, schema, objectName);

            // Get connection info for enhanced metadata extraction
            const connection = this.connectionManager.getConnection(connectionId);
            if (!connection) {
                throw new Error(`Connection ${connectionId} not found`);
            }

            const password = await this.connectionManager.getConnectionPassword(connectionId);
            if (!password) {
                throw new Error('Password not found for connection');
            }

            const dotNetConnection: DotNetConnectionInfo = {
                id: connection.id,
                name: connection.name,
                host: connection.host,
                port: connection.port,
                database: connection.database,
                username: connection.username,
                password: password,
                createdDate: new Date().toISOString()
            };

            // Extract comprehensive metadata based on object type
            const metadata = await this.extractComprehensiveMetadata(
                dotNetConnection,
                objectType,
                schema,
                objectName,
                options
            );

            // Build rich metadata object
            const richObject: RichMetadataObject = {
                id: `${connectionId}:${objectType}:${schema}:${objectName}`,
                name: objectName,
                type: objectType,
                schema: schema,
                database: connection.database,
                owner: metadata.owner,
                sizeInBytes: metadata.sizeInBytes,
                definition: metadata.definition,
                createdAt: metadata.createdAt,
                modifiedAt: metadata.modifiedAt,
                metadata: metadata.objectMetadata,
                dependencies: metadata.dependencies,
                dependents: metadata.dependents,
                changeHistory: metadata.changeHistory,
                validationStatus: metadata.validationStatus,
                performanceMetrics: metadata.performanceMetrics
            };

            // Cache the rich metadata object
            this.metadataCache.set(cacheKey, {
                object: richObject,
                cachedAt: new Date(),
                expiresAt: new Date(Date.now() + this.METADATA_CACHE_DURATION),
                accessCount: 1,
                lastAccessed: new Date(),
                isDirty: false
            });

            Logger.info('Rich metadata object retrieved and cached', 'getRichMetadataObject', {
                connectionId,
                objectType,
                objectName,
                dependencyCount: richObject.dependencies.length,
                cacheSize: this.metadataCache.size
            });

            return richObject;

        } catch (error) {
            Logger.error('Failed to get rich metadata object', error as Error);
            throw error;
        }
    }

    private async extractComprehensiveMetadata(
        connection: DotNetConnectionInfo,
        objectType: string,
        schema: string,
        objectName: string,
        options: { includeDependencies?: boolean; includePerformance?: boolean }
    ): Promise<{
        owner: string;
        sizeInBytes: number;
        definition: string;
        createdAt: string;
        modifiedAt?: string;
        objectMetadata: ObjectMetadata;
        dependencies: DependencyInfo[];
        dependents: DependencyInfo[];
        changeHistory?: ChangeRecord[];
        validationStatus: ValidationStatus;
        performanceMetrics?: PerformanceMetrics;
    }> {
        try {
            // Extract metadata based on object type using appropriate extractors
            let metadata: any = {};
            let dependencies: DependencyInfo[] = [];
            let dependents: DependencyInfo[] = [];
            let performanceMetrics: PerformanceMetrics | undefined;

            switch (objectType.toLowerCase()) {
                case 'table':
                    metadata = await this.extractTableMetadata(connection, schema, objectName, options);
                    dependencies = await this.extractTableDependencies(connection, schema, objectName);
                    dependents = await this.extractTableDependents(connection, schema, objectName);
                    if (options.includePerformance) {
                        performanceMetrics = await this.extractTablePerformanceMetrics(connection, schema, objectName);
                    }
                    break;

                case 'view':
                    metadata = await this.extractViewMetadata(connection, schema, objectName, options);
                    dependencies = await this.extractViewDependencies(connection, schema, objectName);
                    dependents = await this.extractViewDependents(connection, schema, objectName);
                    break;

                case 'function':
                case 'procedure':
                    metadata = await this.extractFunctionMetadata(connection, schema, objectName, options);
                    dependencies = await this.extractFunctionDependencies(connection, schema, objectName);
                    dependents = await this.extractFunctionDependents(connection, schema, objectName);
                    break;

                default:
                    // Use generic metadata extraction
                    metadata = await this.dotNetService.getObjectDetails(connection, objectType, schema, objectName);
            }

            // Build object metadata
            const objectMetadata: ObjectMetadata = {
                properties: metadata.properties || {},
                statistics: metadata.statistics,
                permissions: metadata.permissions || [],
                tags: metadata.tags || [],
                customProperties: metadata.customProperties || {},
                metadataVersion: '1.0',
                lastMetadataUpdate: new Date()
            };

            // Validate object
            const validationStatus = await this.validateObjectMetadata(objectMetadata, objectType);

            return {
                owner: metadata.owner || 'unknown',
                sizeInBytes: metadata.sizeInBytes || 0,
                definition: metadata.definition || '',
                createdAt: metadata.createdAt || new Date().toISOString(),
                modifiedAt: metadata.modifiedAt,
                objectMetadata,
                dependencies,
                dependents,
                changeHistory: metadata.changeHistory,
                validationStatus,
                performanceMetrics
            };

        } catch (error) {
            Logger.error('Failed to extract comprehensive metadata', error as Error);
            throw error;
        }
    }

    private async extractTableMetadata(
        connection: DotNetConnectionInfo,
        schema: string,
        tableName: string,
        options: { includeDependencies?: boolean; includePerformance?: boolean }
    ): Promise<any> {
        // Extract table metadata using column, index, and constraint extractors
        const [columnMetadata, indexMetadata, constraintMetadata] = await Promise.all([
            this.dotNetService.extractColumnMetadata(connection, tableName, schema),
            this.dotNetService.extractIndexMetadata(connection, tableName, schema),
            this.dotNetService.extractConstraintMetadata(connection, tableName, schema)
        ]);

        return {
            owner: 'postgres', // Would be extracted from actual metadata
            sizeInBytes: 0, // Would be calculated from actual table size
            definition: `Table: ${schema}.${tableName}`,
            createdAt: new Date().toISOString(),
            properties: {
                columnCount: columnMetadata.length,
                indexCount: indexMetadata.length,
                constraintCount: constraintMetadata.length
            },
            statistics: {
                sizeInBytes: 0 // Would be extracted from pg_stat_user_tables
            },
            permissions: [], // Would be extracted from information_schema
            tags: ['table']
        };
    }

    private async extractTableDependencies(
        connection: DotNetConnectionInfo,
        schema: string,
        tableName: string
    ): Promise<DependencyInfo[]> {
        // Extract table dependencies from foreign keys and views
        const dependencies: DependencyInfo[] = [];

        try {
            const constraints = await this.dotNetService.extractConstraintMetadata(connection, tableName, schema);
            const foreignKeys = constraints.filter(c => c.type === 'FOREIGN KEY');

            for (const fk of foreignKeys) {
                if (fk.referencedTable) {
                    dependencies.push({
                        objectId: `${schema}.${fk.referencedTable}`,
                        objectName: fk.referencedTable,
                        objectType: 'table',
                        schema: schema,
                        dependencyType: 'hard',
                        description: `Foreign key reference to ${fk.referencedTable}`,
                        impactLevel: 'high'
                    });
                }
            }

            // Check for view dependencies
            const views = await this.dotNetService.extractViewMetadata(connection, undefined, schema);
            for (const view of views) {
                if (view.dependencies.some(dep => dep.name === tableName && dep.type === 'table')) {
                    dependencies.push({
                        objectId: `${schema}.${view.name}`,
                        objectName: view.name,
                        objectType: 'view',
                        schema: schema,
                        dependencyType: 'soft',
                        description: `View ${view.name} depends on table ${tableName}`,
                        impactLevel: 'medium'
                    });
                }
            }

        } catch (error) {
            Logger.warn('Failed to extract table dependencies', 'extractTableDependencies', {
                schema,
                tableName,
                error: (error as Error).message
            });
        }

        return dependencies;
    }

    private async extractTableDependents(
        connection: DotNetConnectionInfo,
        schema: string,
        tableName: string
    ): Promise<DependencyInfo[]> {
        // Extract objects that depend on this table
        const dependents: DependencyInfo[] = [];

        try {
            // This would analyze the dependency graph to find dependents
            // For now, return empty array as this requires sophisticated analysis
        } catch (error) {
            Logger.warn('Failed to extract table dependents', 'extractTableDependents', {
                schema,
                tableName,
                error: (error as Error).message
            });
        }

        return dependents;
    }

    private async extractTablePerformanceMetrics(
        connection: DotNetConnectionInfo,
        schema: string,
        tableName: string
    ): Promise<PerformanceMetrics> {
        // Extract performance metrics for table
        return {
            averageQueryTime: 0, // Would be extracted from pg_stat_user_tables
            cacheHitRatio: 0,
            lockWaitTime: 0,
            lastAccessTime: new Date(),
            accessCount: 0
        };
    }

    private async extractViewMetadata(
        connection: DotNetConnectionInfo,
        schema: string,
        viewName: string,
        options: { includeDependencies?: boolean; includePerformance?: boolean }
    ): Promise<any> {
        const viewMetadata = await this.dotNetService.extractViewMetadata(connection, viewName, schema);

        if (viewMetadata.length === 0) {
            throw new Error(`View ${schema}.${viewName} not found`);
        }

        const view = viewMetadata[0];
        return {
            owner: 'postgres',
            sizeInBytes: 0,
            definition: view.definition,
            createdAt: new Date().toISOString(),
            properties: {
                isMaterialized: view.isMaterialized,
                columnCount: view.columns.length
            },
            statistics: view.statistics
        };
    }

    private async extractViewDependencies(
        connection: DotNetConnectionInfo,
        schema: string,
        viewName: string
    ): Promise<DependencyInfo[]> {
        const dependencies: DependencyInfo[] = [];

        try {
            const viewMetadata = await this.dotNetService.extractViewMetadata(connection, viewName, schema);

            if (viewMetadata.length > 0) {
                const view = viewMetadata[0];

                for (const dep of view.dependencies) {
                    dependencies.push({
                        objectId: `${dep.schema}.${dep.name}`,
                        objectName: dep.name,
                        objectType: dep.type,
                        schema: dep.schema,
                        dependencyType: 'hard',
                        description: `View ${viewName} depends on ${dep.type} ${dep.name}`,
                        impactLevel: 'high'
                    });
                }
            }

        } catch (error) {
            Logger.warn('Failed to extract view dependencies', 'extractViewDependencies', {
                schema,
                viewName,
                error: (error as Error).message
            });
        }

        return dependencies;
    }

    private async extractViewDependents(
        connection: DotNetConnectionInfo,
        schema: string,
        viewName: string
    ): Promise<DependencyInfo[]> {
        // Extract objects that depend on this view
        const dependents: DependencyInfo[] = [];

        try {
            // This would analyze other views and functions that depend on this view
            // For now, return empty array
        } catch (error) {
            Logger.warn('Failed to extract view dependents', 'extractViewDependents', {
                schema,
                viewName,
                error: (error as Error).message
            });
        }

        return dependents;
    }

    private async extractFunctionMetadata(
        connection: DotNetConnectionInfo,
        schema: string,
        functionName: string,
        options: { includeDependencies?: boolean; includePerformance?: boolean }
    ): Promise<any> {
        const functionMetadata = await this.dotNetService.extractFunctionMetadata(connection, functionName, schema);

        if (functionMetadata.length === 0) {
            throw new Error(`Function ${schema}.${functionName} not found`);
        }

        const func = functionMetadata[0];
        return {
            owner: 'postgres',
            sizeInBytes: 0,
            definition: func.definition,
            createdAt: new Date().toISOString(),
            properties: {
                isProcedure: false // Would be determined from metadata
            }
        };
    }

    private async extractFunctionDependencies(
        connection: DotNetConnectionInfo,
        schema: string,
        functionName: string
    ): Promise<DependencyInfo[]> {
        // Extract function dependencies from its definition
        const dependencies: DependencyInfo[] = [];

        try {
            const functionMetadata = await this.dotNetService.extractFunctionMetadata(connection, functionName, schema);

            if (functionMetadata.length > 0) {
                // Analyze function definition for dependencies
                // This would require SQL parsing to find table/view references
            }

        } catch (error) {
            Logger.warn('Failed to extract function dependencies', 'extractFunctionDependencies', {
                schema,
                functionName,
                error: (error as Error).message
            });
        }

        return dependencies;
    }

    private async extractFunctionDependents(
        connection: DotNetConnectionInfo,
        schema: string,
        functionName: string
    ): Promise<DependencyInfo[]> {
        // Extract objects that depend on this function
        const dependents: DependencyInfo[] = [];

        try {
            // This would analyze views and other functions that call this function
            // For now, return empty array
        } catch (error) {
            Logger.warn('Failed to extract function dependents', 'extractFunctionDependents', {
                schema,
                functionName,
                error: (error as Error).message
            });
        }

        return dependents;
    }

    private async validateObjectMetadata(metadata: ObjectMetadata, objectType: string): Promise<ValidationStatus> {
        const errors: string[] = [];
        const warnings: string[] = [];
        const rules: string[] = [];

        // Basic validation rules
        if (!metadata.properties) {
            errors.push('Object properties are missing');
        }

        if (metadata.permissions.length === 0) {
            warnings.push('No permissions defined for object');
        }

        rules.push('metadata_structure_check');
        rules.push('permission_validation');

        return {
            isValid: errors.length === 0,
            lastValidated: new Date(),
            validationErrors: errors,
            validationWarnings: warnings,
            validationRules: rules
        };
    }

    private isMetadataCacheExpired(entry: MetadataCacheEntry): boolean {
        return Date.now() > entry.expiresAt.getTime();
    }

    // Enhanced dependency resolution with circular dependency detection
    async resolveDependencies(
        connectionId: string,
        objectIds: string[],
        direction: 'dependencies' | 'dependents' | 'both' = 'both'
    ): Promise<DependencyResolutionResult> {
        try {
            Logger.info('Resolving dependencies', 'resolveDependencies', {
                connectionId,
                objectCount: objectIds.length,
                direction
            });

            const dependencies: DependencyInfo[] = [];
            const circularDependencies: CircularDependency[] = [];
            const resolutionOrder: string[] = [];
            const warnings: string[] = [];

            // Get rich metadata for all objects
            const richObjects = await Promise.all(
                objectIds.map(id => {
                    const [objectType, schema, objectName] = id.split(':');
                    return this.getRichMetadataObject(connectionId, objectType, schema, objectName);
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
                if (direction === 'dependencies' || direction === 'both') {
                    const objectDeps = richObjects.find(obj => obj.id === objectId)?.dependencies || [];
                    dependencies.push(...objectDeps);
                }

                if (direction === 'dependents' || direction === 'both') {
                    const objectDependents = richObjects.find(obj => obj.id === objectId)?.dependents || [];
                    dependencies.push(...objectDependents);
                }
            }

            const complexity = this.assessResolutionComplexity(dependencies, circularDependencies);

            const result: DependencyResolutionResult = {
                resolved: circularDependencies.length === 0,
                dependencies: [...new Set(dependencies)], // Remove duplicates
                circularDependencies,
                resolutionOrder: resolvedOrder,
                estimatedComplexity: complexity,
                warnings
            };

            Logger.info('Dependency resolution completed', 'resolveDependencies', {
                connectionId,
                totalDependencies: dependencies.length,
                circularDependencies: circularDependencies.length,
                complexity
            });

            return result;

        } catch (error) {
            Logger.error('Dependency resolution failed', error as Error);
            throw error;
        }
    }

    private buildDependencyGraph(objects: RichMetadataObject[]): Map<string, DependencyInfo[]> {
        const graph = new Map<string, DependencyInfo[]>();

        for (const obj of objects) {
            graph.set(obj.id, [...obj.dependencies, ...obj.dependents]);
        }

        return graph;
    }

    private detectCircularDependencies(graph: Map<string, DependencyInfo[]>): CircularDependency[] {
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
                    severity: 'error',
                    description: `Circular dependency detected: ${cycle.join(' -> ')}`
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
    ): 'simple' | 'moderate' | 'complex' {
        if (circularDependencies.length > 0) return 'complex';
        if (dependencies.length > 20) return 'complex';
        if (dependencies.length > 10) return 'moderate';
        return 'simple';
    }

    // Incremental update support
    async updateSchemaIncrementally(
        connectionId: string,
        options: IncrementalUpdateOptions = {}
    ): Promise<{
        updatedObjects: number;
        changeReport?: any;
        validationErrors: string[];
    }> {
        try {
            Logger.info('Starting incremental schema update', 'updateSchemaIncrementally', {
                connectionId,
                options
            });

            let updatedObjects = 0;
            const validationErrors: string[] = [];

            if (options.forceFullRefresh) {
                // Force full refresh of all cached metadata
                this.clearMetadataCache();
                Logger.info('Forced full refresh of metadata cache', 'updateSchemaIncrementally', {
                    connectionId,
                    cacheSize: this.metadataCache.size
                });
            }

            // Get current schema objects
            const currentObjects = await this.getDatabaseObjects(connectionId);

            // Check each object for updates
            for (const obj of currentObjects) {
                try {
                    const cacheKey = `${connectionId}:${obj.type}:${obj.schema}:${obj.name}`;
                    const cached = this.metadataCache.get(cacheKey);

                    if (options.detectChangesOnly && cached && !this.isMetadataCacheExpired(cached)) {
                        // Check if object has actually changed
                        const hasChanged = await this.hasObjectChanged(connectionId, obj, cached.object);

                        if (!hasChanged) {
                            continue; // Skip unchanged objects
                        }
                    }

                    // Update object metadata
                    await this.getRichMetadataObject(connectionId, obj.type, obj.schema, obj.name, {
                        includeDependencies: options.updateDependencies,
                        includePerformance: true
                    });

                    updatedObjects++;

                    // Mark related objects as dirty if dependencies are being updated
                    if (options.updateDependencies) {
                        this.markDependentObjectsDirty(cacheKey);
                    }

                } catch (error) {
                    Logger.error('Failed to update object metadata', error as Error, 'updateSchemaIncrementally', {
                        connectionId,
                        objectType: obj.type,
                        objectName: obj.name
                    });

                    validationErrors.push(`Failed to update ${obj.type} ${obj.name}: ${(error as Error).message}`);
                }
            }

            // Validate updated metadata if requested
            if (options.validateAfterUpdate) {
                const validationResults = await this.validateAllMetadata(connectionId);
                validationErrors.push(...validationResults.errors);
            }

            // Generate change report if requested
            let changeReport;
            if (options.generateChangeReport) {
                changeReport = await this.generateChangeReport(connectionId, currentObjects);
            }

            Logger.info('Incremental schema update completed', 'updateSchemaIncrementally', {
                connectionId,
                updatedObjects,
                validationErrors: validationErrors.length,
                changeReportGenerated: !!changeReport
            });

            return {
                updatedObjects,
                changeReport,
                validationErrors
            };

        } catch (error) {
            Logger.error('Incremental schema update failed', error as Error);
            throw error;
        }
    }

    private async hasObjectChanged(
        connectionId: string,
        currentObject: DatabaseObject,
        cachedObject: RichMetadataObject
    ): Promise<boolean> {
        // Compare current object with cached version to detect changes
        if (currentObject.modifiedAt && cachedObject.modifiedAt) {
            const currentTime = new Date(currentObject.modifiedAt).getTime();
            const cachedTime = new Date(cachedObject.modifiedAt).getTime();

            return currentTime > cachedTime;
        }

        // If modification time is not available, compare definition
        if (currentObject.definition !== cachedObject.definition) {
            return true;
        }

        return false;
    }

    private markDependentObjectsDirty(objectId: string): void {
        // Mark all objects that depend on the given object as dirty
        for (const [key, entry] of this.metadataCache) {
            if (entry.object.dependencies.some(dep => dep.objectId === objectId) ||
                entry.object.dependents.some(dep => dep.objectId === objectId)) {
                entry.isDirty = true;
            }
        }
    }

    private async validateAllMetadata(connectionId: string): Promise<{errors: string[]}> {
        const errors: string[] = [];

        for (const [key, entry] of this.metadataCache) {
            if (entry.object.validationStatus && !entry.object.validationStatus.isValid) {
                errors.push(`Validation failed for ${entry.object.type} ${entry.object.name}: ${entry.object.validationStatus.validationErrors.join(', ')}`);
            }
        }

        return { errors };
    }

    private async generateChangeReport(connectionId: string, currentObjects: DatabaseObject[]): Promise<any> {
        // Generate a report of changes detected during incremental update
        const report = {
            connectionId,
            generatedAt: new Date(),
            totalObjects: currentObjects.length,
            updatedObjects: 0,
            newObjects: 0,
            removedObjects: 0,
            changes: []
        };

        // This would contain detailed change information
        return report;
    }

    private clearMetadataCache(): void {
        this.metadataCache.clear();
        Logger.info('Metadata cache cleared', 'clearMetadataCache');
    }

    // Enhanced Dependency Management and Visualization
    async generateDependencyAnalysisReport(
        connectionId: string,
        objectIds?: string[]
    ): Promise<DependencyAnalysisReport> {
        try {
            Logger.info('Generating comprehensive dependency analysis report', 'generateDependencyAnalysisReport', {
                connectionId,
                objectCount: objectIds?.length || 'all'
            });

            // Get all objects if not specified
            const objects = objectIds ?
                await Promise.all(objectIds.map(id => {
                    const [objectType, schema, objectName] = id.split(':');
                    return this.getRichMetadataObject(connectionId, objectType, schema, objectName);
                })) :
                await this.getAllRichMetadataObjects(connectionId);

            if (objects.length === 0) {
                throw new Error('No objects found for dependency analysis');
            }

            // Generate dependency summary
            const summary = this.generateDependencySummary(objects);

            // Generate recommendations
            const recommendations = this.generateDependencyRecommendations(objects, summary);

            // Assess risks
            const riskAssessment = this.assessDependencyRisks(objects, summary);

            // Find optimization opportunities
            const optimizationOpportunities = this.findOptimizationOpportunities(objects, summary);

            // Generate visualization
            const visualization = this.generateDependencyVisualization(objects);

            const report: DependencyAnalysisReport = {
                summary,
                recommendations,
                riskAssessment,
                optimizationOpportunities,
                visualization
            };

            Logger.info('Dependency analysis report generated', 'generateDependencyAnalysisReport', {
                connectionId,
                objectCount: objects.length,
                totalDependencies: summary.totalDependencies,
                circularDependencies: summary.circularDependencyCount,
                recommendationsCount: recommendations.length,
                optimizationOpportunitiesCount: optimizationOpportunities.length
            });

            return report;

        } catch (error) {
            Logger.error('Failed to generate dependency analysis report', error as Error);
            throw error;
        }
    }

    private async getAllRichMetadataObjects(connectionId: string): Promise<RichMetadataObject[]> {
        const basicObjects = await this.getDatabaseObjects(connectionId);
        const richObjects: RichMetadataObject[] = [];

        // Convert basic objects to rich metadata objects
        for (const obj of basicObjects) {
            try {
                const richObj = await this.getRichMetadataObject(
                    connectionId,
                    obj.type,
                    obj.schema,
                    obj.name,
                    { includeDependencies: true, includePerformance: true }
                );
                richObjects.push(richObj);
            } catch (error) {
                Logger.warn('Failed to get rich metadata for object', 'getAllRichMetadataObjects', {
                    connectionId,
                    objectType: obj.type,
                    objectName: obj.name,
                    error: (error as Error).message
                });
            }
        }

        return richObjects;
    }

    private generateDependencySummary(objects: RichMetadataObject[]): DependencySummary {
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

            if (depCount > 20) { // Arbitrary threshold for "over-dependent"
                overDependentObjects++;
            }
        }

        return {
            totalObjects: objects.length,
            totalDependencies,
            averageDependenciesPerObject: objects.length > 0 ? totalDependencies / objects.length : 0,
            maxDependencyDepth: maxDepth,
            circularDependencyCount,
            stronglyConnectedComponents: 0, // Would require sophisticated graph analysis
            orphanedObjects,
            overDependentObjects
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
            const dependentObj = allObjects.find(o => o.id === dep.objectId);
            if (dependentObj) {
                const depth = this.calculateObjectDepth(dependentObj, allObjects, new Set(visited));
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
                type: 'warning',
                priority: 'medium',
                title: 'Review Orphaned Objects',
                description: `${summary.orphanedObjects} objects have no dependencies and may be unused`,
                affectedObjects: objects.filter(obj => {
                    const depCount = obj.dependencies.length + obj.dependents.length;
                    return depCount === 0;
                }).map(obj => obj.id),
                estimatedEffort: 'low',
                potentialImpact: 'May identify unused objects that can be removed',
                implementationSteps: [
                    'Review each orphaned object for actual usage',
                    'Check application code for references',
                    'Consider archiving or removing unused objects'
                ]
            });
        }

        // Over-dependent objects recommendation
        if (summary.overDependentObjects > 0) {
            recommendations.push({
                type: 'optimization',
                priority: 'medium',
                title: 'Simplify Complex Dependencies',
                description: `${summary.overDependentObjects} objects have many dependencies and may benefit from simplification`,
                affectedObjects: objects.filter(obj => {
                    const depCount = obj.dependencies.length + obj.dependents.length;
                    return depCount > 20;
                }).map(obj => obj.id),
                estimatedEffort: 'high',
                potentialImpact: 'Improved maintainability and reduced coupling',
                implementationSteps: [
                    'Analyze dependency chains for simplification opportunities',
                    'Consider consolidating related objects',
                    'Review and remove unnecessary dependencies'
                ]
            });
        }

        // Deep dependency chains
        if (summary.maxDependencyDepth > 5) {
            recommendations.push({
                type: 'refactoring',
                priority: 'high',
                title: 'Reduce Dependency Depth',
                description: `Maximum dependency depth of ${summary.maxDependencyDepth} levels may cause maintenance issues`,
                affectedObjects: objects.map(obj => obj.id),
                estimatedEffort: 'high',
                potentialImpact: 'Improved system maintainability and reduced complexity',
                implementationSteps: [
                    'Identify long dependency chains',
                    'Consider introducing abstraction layers',
                    'Review object relationships for possible consolidation'
                ]
            });
        }

        return recommendations;
    }

    private assessDependencyRisks(
        objects: RichMetadataObject[],
        summary: DependencySummary
    ): DependencyRiskAssessment {
        const riskFactors: RiskFactor[] = [];
        let overallRisk: 'low' | 'medium' | 'high' | 'critical' = 'low';

        // Assess circular dependency risk
        if (summary.circularDependencyCount > 0) {
            riskFactors.push({
                type: 'circular_dependency',
                severity: summary.circularDependencyCount > 3 ? 'critical' : 'high',
                description: `${summary.circularDependencyCount} circular dependencies detected`,
                affectedObjects: [], // Would be populated with actual object IDs
                potentialImpact: 'May cause deadlocks and maintenance issues'
            });
        }

        // Assess deep dependency risk
        if (summary.maxDependencyDepth > 7) {
            riskFactors.push({
                type: 'deep_dependency',
                severity: 'high',
                description: `Deep dependency chain with ${summary.maxDependencyDepth} levels`,
                affectedObjects: objects.map(obj => obj.id),
                potentialImpact: 'Complex changes may have cascading effects'
            });
        }

        // Assess over-dependence risk
        if (summary.overDependentObjects > 5) {
            riskFactors.push({
                type: 'over_dependence',
                severity: 'medium',
                description: `${summary.overDependentObjects} objects have excessive dependencies`,
                affectedObjects: objects.filter(obj => {
                    const depCount = obj.dependencies.length + obj.dependents.length;
                    return depCount > 20;
                }).map(obj => obj.id),
                potentialImpact: 'High coupling may make changes difficult'
            });
        }

        // Assess orphaned object risk
        if (summary.orphanedObjects > 10) {
            riskFactors.push({
                type: 'orphaned_object',
                severity: 'low',
                description: `${summary.orphanedObjects} objects appear to be unused`,
                affectedObjects: objects.filter(obj => {
                    const depCount = obj.dependencies.length + obj.dependents.length;
                    return depCount === 0;
                }).map(obj => obj.id),
                potentialImpact: 'May indicate dead code or unnecessary objects'
            });
        }

        // Determine overall risk
        const criticalFactors = riskFactors.filter(f => f.severity === 'critical').length;
        const highFactors = riskFactors.filter(f => f.severity === 'high').length;

        if (criticalFactors > 0) overallRisk = 'critical';
        else if (highFactors > 1) overallRisk = 'high';
        else if (highFactors > 0 || riskFactors.length > 3) overallRisk = 'medium';

        return {
            overallRisk,
            riskFactors,
            mitigationStrategies: this.generateMitigationStrategies(riskFactors),
            monitoringRecommendations: this.generateMonitoringRecommendations(riskFactors)
        };
    }

    private generateMitigationStrategies(riskFactors: RiskFactor[]): string[] {
        const strategies: string[] = [];

        for (const factor of riskFactors) {
            switch (factor.type) {
                case 'circular_dependency':
                    strategies.push('Implement dependency injection to break circular references');
                    strategies.push('Consider using events or messaging patterns');
                    break;
                case 'deep_dependency':
                    strategies.push('Introduce facade or adapter patterns to reduce depth');
                    strategies.push('Consider service consolidation');
                    break;
                case 'over_dependence':
                    strategies.push('Apply interface segregation principle');
                    strategies.push('Consider dependency inversion');
                    break;
                case 'orphaned_object':
                    strategies.push('Implement regular cleanup processes');
                    strategies.push('Add object lifecycle management');
                    break;
            }
        }

        return [...new Set(strategies)]; // Remove duplicates
    }

    private generateMonitoringRecommendations(riskFactors: RiskFactor[]): string[] {
        const recommendations: string[] = [];

        if (riskFactors.some(f => f.type === 'circular_dependency')) {
            recommendations.push('Monitor for deadlock situations in database operations');
        }

        if (riskFactors.some(f => f.type === 'deep_dependency')) {
            recommendations.push('Track dependency chain length in change impact analysis');
        }

        if (riskFactors.some(f => f.type === 'over_dependence')) {
            recommendations.push('Monitor coupling metrics during code reviews');
        }

        recommendations.push('Regular dependency analysis as part of maintenance schedule');

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

    private findRedundantDependencies(objects: RichMetadataObject[]): OptimizationOpportunity[] {
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
                    type: 'consolidate_objects',
                    title: 'Consolidate Similar Objects',
                    description: `${objs.length} objects have identical dependency patterns`,
                    affectedObjects: objs.map(obj => obj.id),
                    estimatedBenefit: 'Reduced maintenance overhead and improved consistency',
                    implementationComplexity: 'medium',
                    prerequisites: [
                        'Ensure objects are truly interchangeable',
                        'Update all references to use consolidated object'
                    ]
                });
            }
        }

        return opportunities;
    }

    private generateDependencyPattern(obj: RichMetadataObject): string {
        // Generate a simplified pattern of object dependencies
        const depTypes = obj.dependencies.map(d => d.objectType).sort().join(',');
        const dependentTypes = obj.dependents.map(d => d.objectType).sort().join(',');
        return `${depTypes}|${dependentTypes}`;
    }

    private findSimplificationOpportunities(objects: RichMetadataObject[]): OptimizationOpportunity[] {
        const opportunities: OptimizationOpportunity[] = [];

        // Find objects with excessive dependencies
        const complexObjects = objects.filter(obj => {
            const totalDeps = obj.dependencies.length + obj.dependents.length;
            return totalDeps > 15; // Threshold for "complex"
        });

        complexObjects.forEach(obj => {
            opportunities.push({
                type: 'simplify_chain',
                title: 'Simplify Object Dependencies',
                description: `Object ${obj.name} has ${obj.dependencies.length + obj.dependents.length} dependencies`,
                affectedObjects: [obj.id],
                estimatedBenefit: 'Improved maintainability and reduced coupling',
                implementationComplexity: 'high',
                prerequisites: [
                    'Analyze each dependency for necessity',
                    'Consider introducing abstraction layers',
                    'Update dependent code accordingly'
                ]
            });
        });

        return opportunities;
    }

    private findConsolidationOpportunities(objects: RichMetadataObject[]): OptimizationOpportunity[] {
        const opportunities: OptimizationOpportunity[] = [];

        // Look for tables that could be consolidated
        const tables = objects.filter(obj => obj.type === 'table');

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
                    type: 'consolidate_objects',
                    title: 'Consider Table Consolidation',
                    description: `Schema ${schema} has ${schemaTables.length} tables - may benefit from consolidation`,
                    affectedObjects: schemaTables.map(obj => obj.id),
                    estimatedBenefit: 'Reduced schema complexity and improved query performance',
                    implementationComplexity: 'high',
                    prerequisites: [
                        'Analyze table relationships and usage patterns',
                        'Design consolidated table structure',
                        'Plan data migration strategy'
                    ]
                });
            }
        }

        return opportunities;
    }

    private generateDependencyVisualization(objects: RichMetadataObject[]): DependencyGraphVisualization {
        const nodes: DependencyGraphNode[] = [];
        const edges: DependencyGraphEdge[] = [];

        // Create nodes for each object
        objects.forEach((obj, index) => {
            const nodeSize = Math.max(20, Math.min(100, (obj.dependencies.length + obj.dependents.length) * 5));
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
                    schema: obj.schema
                }
            });
        });

        // Create edges for dependencies
        objects.forEach(obj => {
            obj.dependencies.forEach(dep => {
                edges.push({
                    id: `${obj.id}_${dep.objectId}`,
                    source: obj.id,
                    target: dep.objectId,
                    type: 'depends_on',
                    strength: dep.impactLevel === 'critical' ? 'strong' : dep.impactLevel === 'high' ? 'medium' : 'weak',
                    style: dep.dependencyType === 'hard' ? 'solid' : 'dashed',
                    label: dep.description
                });
            });

            obj.dependents.forEach(dep => {
                edges.push({
                    id: `${dep.objectId}_${obj.id}`,
                    source: dep.objectId,
                    target: obj.id,
                    type: 'referenced_by',
                    strength: dep.impactLevel === 'critical' ? 'strong' : dep.impactLevel === 'high' ? 'medium' : 'weak',
                    style: dep.dependencyType === 'hard' ? 'solid' : 'dashed',
                    label: dep.description
                });
            });
        });

        const layout: GraphLayout = {
            type: 'force_directed',
            width: 1200,
            height: 800,
            padding: 50,
            nodeSpacing: 100,
            levelSpacing: 150
        };

        const metadata: GraphMetadata = {
            totalNodes: nodes.length,
            totalEdges: edges.length,
            maxDepth: this.calculateMaxDepth(objects),
            circularDependencies: 0, // Would be calculated from actual graph analysis
            stronglyConnectedComponents: 0,
            generationTime: Date.now()
        };

        return {
            nodes,
            edges,
            layout,
            metadata
        };
    }

    private getNodeColor(obj: RichMetadataObject): string {
        switch (obj.type) {
            case 'table': return '#4CAF50'; // Green
            case 'view': return '#2196F3'; // Blue
            case 'function': return '#FF9800'; // Orange
            case 'index': return '#9C27B0'; // Purple
            case 'constraint': return '#F44336'; // Red
            default: return '#757575'; // Gray
        }
    }

    private calculateNodePosition(index: number, totalNodes: number): { x: number; y: number } {
        // Simple circular layout for visualization
        const angle = (index / totalNodes) * 2 * Math.PI;
        const radius = 300;

        return {
            x: Math.cos(angle) * radius + 400,
            y: Math.sin(angle) * radius + 400
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

    async dispose(): Promise<void> {
        Logger.info('Disposing SchemaManager');
        this.schemaCache.clear();
        this.metadataCache.clear();
    }
}

export interface SchemaComparisonResult {
    comparisonId: string;
    sourceConnectionId: string;
    targetConnectionId: string;
    sourceObjectCount: number;
    targetObjectCount: number;
    differences: SchemaDifference[];
    comparisonMode: 'strict' | 'lenient';
    createdAt: Date;
    executionTime: number;
}

export interface SchemaDifference {
    type: 'Added' | 'Removed' | 'Modified';
    objectType: string;
    objectName: string;
    schema: string;
    sourceDefinition?: string | undefined;
    targetDefinition?: string | undefined;
    differenceDetails: string[];
}