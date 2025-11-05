// MigrationTypes.ts - Consolidated migration type definitions
// This file contains all interfaces and types used across migration modules

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
	estimatedExecutionTime: number;
	riskLevel: "low" | "medium" | "high" | "critical";
	sqlScript?: string; // Added for compatibility
}

export interface SchemaSnapshot {
	connectionId: string;
	schemaHash: string;
	objectCount: number;
	capturedAt: Date;
	objects: any[];
	relationships: any[];
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
	operation: string;
	riskLevel: "low" | "medium" | "high" | "critical";
	dependencies: string[];
	estimatedDuration: number;
	rollbackSql?: string;
	verificationQuery?: string;
	preConditions?: PreCondition[];
	postConditions?: PostCondition[];
}

export interface RollbackScript {
	isComplete: boolean;
	steps: RollbackStep[];
	estimatedRollbackTime: number;
	successRate: number;
	warnings: string[];
	limitations: string[];
}

export interface RollbackStep {
	order: number;
	description: string;
	estimatedDuration: number;
	riskLevel: "low" | "medium" | "high" | "critical";
	dependencies: string[];
	verificationSteps: string[];
}

export interface ValidationStep {
	id: string;
	name: string;
	description: string;
	automated: boolean;
	sqlQuery?: string;
	expectedResult?: any;
	type: string;
	severity: "low" | "medium" | "high" | "critical" | "info" | "error";
	category: string;
}

export interface MigrationDependency {
	fromStep: string;
	toStep: string;
	type: "schema" | "data" | "permission" | "object";
	description: string;
}

export interface MigrationMetadata {
	author?: string;
	tags?: string[];
	businessJustification?: string;
	changeType?: string;
	environment?: string;
	testingRequired?: boolean;
	documentationUpdated?: boolean;
	completedAt?: string;
	status?: "running" | "completed" | "failed" | "cancelled";
	verified?: boolean;
	startedAt?: string;
	currentPhase?: string;
	progressPercentage?: number;
	lastUpdated?: string;
	lastChecked?: string;
	isRealTime?: boolean;
	cancelledAt?: string;
	lastVerified?: string;
	executionTimeMs?: number;
	transactionId?: number;
}

export interface PreCondition {
	id: string;
	description: string;
	sqlQuery?: string;
	expectedResult?: any;
	tolerance?: number;
	severity: "low" | "medium" | "high" | "critical";
	type?: string;
}

export interface PostCondition {
	id: string;
	description: string;
	sqlQuery?: string;
	expectedResult?: any;
	tolerance?: number;
	severity: "low" | "medium" | "high" | "critical";
	type?: string;
}

export interface MigrationExecutionResult {
	scriptId: string;
	executionId: string;
	startTime: Date;
	endTime?: Date;
	status: "running" | "completed" | "failed" | "cancelled";
	completedSteps: number;
	failedSteps: number;
	executionLog: ExecutionLogEntry[];
	performanceMetrics: MigrationPerformanceMetrics;
	validationResults: ValidationResult[];
	currentStep?: number;
	success?: boolean; // Added for compatibility
	executionTime?: number; // Added for compatibility
	operationsProcessed?: number; // Added for compatibility
	errors?: string[]; // Added for compatibility
	warnings?: string[]; // Added for compatibility
	rollbackAvailable?: boolean; // Added for compatibility
}

export interface ExecutionLogEntry {
	timestamp?: Date;
	stepId?: string;
	level?: "info" | "warn" | "error" | "debug";
	message?: string;
	duration?: number;
}

export interface MigrationPerformanceMetrics {
	totalExecutionTime: number;
	averageStepTime: number;
	peakMemoryUsage: number;
	databaseLoad: number;
}

export interface ValidationResult {
	stepId?: string;
	validationId?: string;
	passed: boolean;
	actualResult?: any;
	expectedResult?: any;
	executionTime?: number;
	errorMessage?: string;
	ruleId?: string;
	ruleName?: string;
	severity?: "error" | "warning" | "info";
	message?: string;
	details?: any;
	timestamp?: Date;
	retryCount?: number;
}
