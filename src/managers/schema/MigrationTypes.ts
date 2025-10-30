// Enhanced Migration Script Generation Interfaces
export interface EnhancedMigrationScript {
    id: string;
    name: string;
    description: string;
    version: string;
    sourceSchema: SchemaSnapshot;
    targetSchema: SchemaSnapshot;
    migrationSteps: MigrationStep[];
    rollbackScript: RollbackScript;
    validationSteps: ValidationStep[];
    dependencies: MigrationDependency[];
    metadata: MigrationMetadata;
    generatedAt: Date;
    estimatedExecutionTime: number; // in minutes
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface SchemaSnapshot {
    connectionId: string;
    schemaHash: string;
    objectCount: number;
    capturedAt: Date;
    objects: Array<{
        type: string;
        schema: string;
        name: string;
        table?: string;
        owner?: string;
        definition: string;
    }>;
    relationships: Array<{
        type: string;
        table_schema: string;
        table_name: string;
        constraint_name: string;
        column_name: string;
        foreign_table_schema: string;
        foreign_table_name: string;
        foreign_column_name: string;
    }>;
}

export interface MigrationStep {
    id: string;
    order: number;
    name: string;
    description: string;
    sqlScript: string;
    objectType: string;
    objectName: string;
    schema: string;
    operation: 'CREATE' | 'ALTER' | 'DROP' | 'RENAME' | 'MIGRATE_DATA';
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    dependencies: string[]; // IDs of other steps this depends on
    estimatedDuration: number; // in seconds
    rollbackSql?: string;
    verificationQuery?: string;
    preConditions: PreCondition[];
    postConditions: PostCondition[];
}

export interface PreCondition {
    type: 'data_condition' | 'permission_check' | 'custom';
    description: string;
    sqlQuery?: string;
    expectedResult?: unknown;
}

export interface PostCondition {
    type: 'row_count' | 'data_integrity' | 'performance_check' | 'custom';
    description: string;
    sqlQuery?: string;
    expectedResult?: unknown;
    tolerance?: number; // Acceptable variance for checks
}

export interface RollbackScript {
    isComplete: boolean;
    steps: RollbackStep[];
    estimatedRollbackTime: number; // in minutes
    successRate: number; // percentage
    warnings: string[];
    limitations: string[];
}

export interface RollbackStep {
    order: number;
    description: string;
    estimatedDuration: number; // in minutes
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    dependencies: string[];
    verificationSteps: string[];
}

export interface ValidationStep {
    id: string;
    name: string;
    description: string;
    type: 'syntax' | 'schema' | 'data' | 'performance' | 'security';
    sqlQuery?: string;
    expectedResult?: unknown;
    severity: 'error' | 'warning' | 'info';
    automated: boolean;
}

export interface MigrationDependency {
    type: 'object' | 'data' | 'permission' | 'external';
    sourceStep: string;
    targetStep: string;
    description: string;
    critical: boolean;
}

export interface MigrationMetadata {
    author: string;
    reviewedBy?: string;
    approvedBy?: string;
    tags: string[];
    businessJustification: string;
    changeType: 'hotfix' | 'feature' | 'refactoring' | 'optimization';
    environment: 'development' | 'staging' | 'production';
    testingRequired: boolean;
    documentationUpdated: boolean;
}

export interface MigrationExecutionResult {
    scriptId: string;
    executionId: string;
    startTime: Date;
    endTime?: Date;
    status: 'running' | 'completed' | 'failed' | 'rolled_back';
    currentStep?: number;
    completedSteps: number;
    failedSteps: number;
    executionLog: ExecutionLogEntry[];
    performanceMetrics: MigrationPerformanceMetrics;
    validationResults: ValidationResult[];
}

export interface ExecutionLogEntry {
    timestamp: Date;
    stepId?: string;
    level: 'info' | 'warning' | 'error';
    message: string;
    duration?: number;
    affectedRows?: number;
}

export interface MigrationPerformanceMetrics {
    totalExecutionTime: number; // in seconds
    averageStepTime: number; // in seconds
    peakMemoryUsage: number; // in MB
    databaseLoad: number; // 0-1 scale
    rollbackTime?: number; // in seconds
}

export interface ValidationResult {
    stepId: string;
    validationId: string;
    passed: boolean;
    actualResult?: unknown;
    expectedResult?: unknown;
    executionTime: number; // in milliseconds
    errorMessage?: string;
}