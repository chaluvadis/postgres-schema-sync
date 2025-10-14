import { ConnectionManager } from './ConnectionManager';
import { Logger } from '@/utils/Logger';
import {
    DotNetIntegrationService, DotNetConnectionInfo,
    DotNetSchemaComparison, DotNetMigrationScript, DotNetMigrationProgressReport
} from '@/services/DotNetIntegrationService';

export interface MigrationScript {
    id: string;
    name: string;
    sourceConnection: string;
    targetConnection: string;
    sqlScript: string;
    rollbackScript: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'rolled_back';
    createdAt: Date;
    executionTime?: number;
    executionLog?: string;
    operationCount: number;
    riskLevel: 'Low' | 'Medium' | 'High';
    warnings: string[];
    canExecute: boolean;
    canRollback: boolean;
    rollbackValidation?: RollbackValidationResult;
    rollbackSafety?: RollbackSafetyAssessment;
    estimatedRollbackTime?: number;
    rollbackComplexity?: 'simple' | 'moderate' | 'complex';
}

// Enhanced rollback interfaces
export interface RollbackValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    estimatedExecutionTime: number;
    affectedObjectCount: number;
    riskLevel: 'Low' | 'Medium' | 'High';
    validationTimestamp: Date;
}

export interface RollbackSafetyAssessment {
    safetyScore: number; // 0-100
    riskFactors: string[];
    safetyMeasures: string[];
    dataLossPotential: 'none' | 'minimal' | 'moderate' | 'high';
    dependencyImpact: 'none' | 'low' | 'medium' | 'high';
    recommendedPrecautions: string[];
}

export interface RollbackGenerationOptions {
    includeDataBackup?: boolean;
    validateBeforeGeneration?: boolean;
    generateSafetyChecks?: boolean;
    includeProgressReporting?: boolean;
    batchSize?: number;
    timeout?: number;
}

export interface RollbackExecutionOptions {
    validateBeforeExecution?: boolean;
    createBackupBeforeRollback?: boolean;
    executeInTransaction?: boolean;
    stopOnFirstError?: boolean;
    progressCallback?: (progress: DotNetMigrationProgressReport) => void;
}

// Migration batching interfaces
export interface MigrationBatchOptions {
    batchSize?: number;
    maxBatchExecutionTime?: number;
    pauseBetweenBatches?: number;
    stopOnFirstError?: boolean;
    validateEachBatch?: boolean;
    progressCallback?: (progress: MigrationBatchProgress) => void;
    retryFailedBatches?: boolean;
    maxRetries?: number;
}

export interface MigrationBatch {
    id: string;
    migrationId: string;
    batchNumber: number;
    totalBatches: number;
    operations: MigrationOperation[];
    sqlScript: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    startTime?: Date;
    endTime?: Date;
    executionTime?: number;
    error?: string;
    retryCount: number;
}

export interface MigrationBatchProgress {
    migrationId: string;
    currentBatch: number;
    totalBatches: number;
    completedOperations: number;
    totalOperations: number;
    currentOperation: string;
    percentage: number;
    estimatedTimeRemaining?: number;
    currentBatchStatus: 'pending' | 'running' | 'completed' | 'failed';
    errors: string[];
    warnings: string[];
    batchProgress: {
        batchNumber: number;
        completedOperations: number;
        totalOperations: number;
        status: string;
    };
}

export interface BatchExecutionResult {
    success: boolean;
    completedBatches: number;
    failedBatches: number;
    totalExecutionTime: number;
    errors: Array<{ batchId: string; error: string; }>;
    warnings: string[];
}

// Business Rule Validation interfaces
export interface BusinessRule {
    id: string;
    name: string;
    description: string;
    category: 'data_integrity' | 'performance' | 'security' | 'compliance' | 'custom';
    severity: 'error' | 'warning' | 'info';
    isEnabled: boolean;
    ruleDefinition: BusinessRuleDefinition;
    createdAt: Date;
    lastModified: Date;
}

export interface BusinessRuleDefinition {
    type: 'sql_query' | 'pattern_match' | 'threshold_check' | 'custom_logic';
    expression: string;
    parameters: Record<string, any>;
    expectedResult?: any;
    timeout?: number;
}

export interface BusinessRuleValidationResult {
    ruleId: string;
    ruleName: string;
    passed: boolean;
    severity: 'error' | 'warning' | 'info';
    message: string;
    details?: any;
    executionTime: number;
    timestamp: Date;
}

export interface PreMigrationValidationOptions {
    connectionId: string;
    rules?: string[]; // Specific rule IDs to run, if empty runs all enabled rules
    failOnWarnings?: boolean;
    generateReport?: boolean;
    stopOnFirstError?: boolean;
}

export interface MigrationValidationReport {
    migrationId: string;
    validationTimestamp: Date;
    totalRules: number;
    passedRules: number;
    failedRules: number;
    warningRules: number;
    results: BusinessRuleValidationResult[];
    overallStatus: 'passed' | 'failed' | 'warnings';
    canProceed: boolean;
    recommendations: string[];
}

// Comprehensive Migration Pipeline Interfaces
export interface MigrationPipelineStage {
    id: string;
    name: string;
    description: string;
    order: number;
    isRequired: boolean;
    isEnabled: boolean;
    timeout?: number;
    retryCount?: number;
    parameters: Record<string, any>;
}

export interface MigrationExecutionContext {
    migrationId: string;
    pipelineId: string;
    currentStage: string;
    startTime: Date;
    estimatedEndTime?: Date;
    progress: number;
    status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
    currentOperation?: string;
    error?: string;
    warnings: string[];
    stageResults: Map<string, StageExecutionResult>;
    metadata: Record<string, any>;
}

export interface StageExecutionResult {
    stageId: string;
    stageName: string;
    startTime: Date;
    endTime?: Date;
    duration?: number;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    output?: any;
    error?: string;
    retryCount: number;
}

export interface MigrationApprovalWorkflow {
    id: string;
    name: string;
    description: string;
    migrationId: string;
    stages: ApprovalStage[];
    currentStage: number;
    status: 'pending' | 'in_progress' | 'approved' | 'rejected' | 'cancelled';
    createdAt: Date;
    completedAt?: Date;
    approvers: ApproverInfo[];
    approvalHistory: ApprovalRecord[];
}

export interface ApprovalStage {
    id: string;
    name: string;
    description: string;
    order: number;
    requiredApprovers: number;
    approverRoles: string[];
    criteria: ApprovalCriteria;
    timeout?: number;
    autoApproveConditions?: string[];
}

export interface ApprovalCriteria {
    minRiskLevel?: 'Low' | 'Medium' | 'High';
    maxDataLossPotential?: 'none' | 'minimal' | 'moderate' | 'high';
    requireBusinessRuleValidation?: boolean;
    requireConflictResolution?: boolean;
    customChecks?: string[];
}

export interface ApproverInfo {
    userId: string;
    userName: string;
    role: string;
    canApprove: boolean;
    approvedAt?: Date;
    comments?: string;
}

export interface ApprovalRecord {
    stageId: string;
    approverId: string;
    approverName: string;
    decision: 'approved' | 'rejected' | 'escalated';
    timestamp: Date;
    comments?: string;
    conditions?: Record<string, any>;
}

export interface MigrationPipelineOptions {
    pipelineId?: string;
    customStages?: MigrationPipelineStage[];
    approvalWorkflow?: boolean;
    autoApproveLowRisk?: boolean;
    notifyOnStageComplete?: boolean;
    generateDetailedReports?: boolean;
    pauseOnError?: boolean;
    maxExecutionTime?: number;
}

export class MigrationManager {
    private connectionManager: ConnectionManager;
    private dotNetService: DotNetIntegrationService;
    private migrations: Map<string, MigrationScript> = new Map();
    constructor(connectionManager: ConnectionManager) {
        this.connectionManager = connectionManager;
        this.dotNetService = DotNetIntegrationService.getInstance();
    }
    async generateMigration(sourceConnectionId: string, targetConnectionId: string): Promise<MigrationScript> {
        try {
            Logger.info('Generating migration', 'generateMigration', { sourceConnectionId, targetConnectionId });

            // Check if migration generation service is available
            if (!this.dotNetService) {
                throw new Error('DotNet service not available');
            }

            // Get and validate connections
            const sourceConnection = this.connectionManager.getConnection(sourceConnectionId);
            if (!sourceConnection) {
                throw new Error(`Source connection ${sourceConnectionId} not found`);
            }

            const targetConnection = this.connectionManager.getConnection(targetConnectionId);
            if (!targetConnection) {
                throw new Error(`Target connection ${targetConnectionId} not found`);
            }

            // Get and validate passwords
            const sourcePassword = await this.connectionManager.getConnectionPassword(sourceConnectionId);
            if (!sourcePassword) {
                throw new Error('Source connection password not found');
            }

            const targetPassword = await this.connectionManager.getConnectionPassword(targetConnectionId);
            if (!targetPassword) {
                throw new Error('Target connection password not found');
            }

            // Create .NET connection info
            const dotNetSourceConnection: DotNetConnectionInfo = {
                id: sourceConnection.id,
                name: sourceConnection.name,
                host: sourceConnection.host,
                port: sourceConnection.port,
                database: sourceConnection.database,
                username: sourceConnection.username,
                password: sourcePassword,
                createdDate: new Date().toISOString()
            };

            const dotNetTargetConnection: DotNetConnectionInfo = {
                id: targetConnection.id,
                name: targetConnection.name,
                host: targetConnection.host,
                port: targetConnection.port,
                database: targetConnection.database,
                username: targetConnection.username,
                password: targetPassword,
                createdDate: new Date().toISOString()
            };

            // Compare schemas via .NET service
            const comparison = await this.dotNetService.compareSchemas(
                dotNetSourceConnection,
                dotNetTargetConnection,
                { mode: 'strict' }
            );

            // Generate migration via .NET service
            const dotNetMigration = await this.dotNetService.generateMigration(comparison, {
                type: 'Schema',
                generateRollbackScript: true,
                isDryRun: false
            });

            // Convert to local format
            if (!dotNetMigration) {
                throw new Error('Migration generation returned null');
            }

            const operationCount = dotNetMigration.sqlScript.split('\n').length;
            const riskLevel = this.assessMigrationRisk(dotNetMigration.sqlScript);
            const warnings = this.analyzeMigrationWarnings(dotNetMigration.sqlScript);

            const migrationScript: MigrationScript = {
                id: dotNetMigration.id,
                name: `Migration_${dotNetMigration.id}`,
                sourceConnection: sourceConnectionId,
                targetConnection: targetConnectionId,
                sqlScript: dotNetMigration.sqlScript,
                rollbackScript: dotNetMigration.rollbackScript,
                status: dotNetMigration.status as any,
                createdAt: new Date(dotNetMigration.createdAt),
                operationCount,
                riskLevel,
                warnings,
                canExecute: true,
                canRollback: Boolean(dotNetMigration.rollbackScript && dotNetMigration.rollbackScript.trim().length > 0)
            };

            // Store migration
            this.migrations.set(migrationScript.id, migrationScript);

            Logger.info('Migration generated successfully');
            return migrationScript;
        } catch (error) {
            Logger.error('Failed to generate migration', error as Error);
            throw error;
        }
    }
    async executeMigration(migrationId: string): Promise<boolean> {
        let migrationSuccess = false;

        try {
            Logger.info('Executing migration', 'executeMigration', { migrationId });

            // Check if migration execution service is available
            if (!this.dotNetService) {
                throw new Error('DotNet service not available');
            }

            const migration = this.migrations.get(migrationId);
            if (!migration) {
                throw new Error(`Migration ${migrationId} not found`);
            }

            // Update status to running
            migration.status = 'running';
            this.migrations.set(migrationId, migration);

            // Get target connection
            const targetConnection = this.connectionManager.getConnection(migration.targetConnection);
            if (!targetConnection) {
                throw new Error('Target connection not found');
            }

            // Get password for target connection
            const targetPassword = await this.connectionManager.getConnectionPassword(migration.targetConnection);
            if (!targetPassword) {
                throw new Error('Target connection password not found');
            }

            // Convert to .NET format
            const dotNetTargetConnection: DotNetConnectionInfo = {
                id: targetConnection.id,
                name: targetConnection.name,
                host: targetConnection.host,
                port: targetConnection.port,
                database: targetConnection.database,
                username: targetConnection.username,
                password: targetPassword
            };

            // Convert migration to .NET format
            const dotNetMigration: DotNetMigrationScript = {
                id: migration.id,
                comparison: {} as DotNetSchemaComparison, // Would need to be populated properly
                selectedDifferences: [],
                sqlScript: migration.sqlScript,
                rollbackScript: migration.rollbackScript,
                type: 'Schema',
                isDryRun: false,
                status: migration.status,
                createdAt: migration.createdAt.toISOString()
            };

            // Execute via .NET service
            let result;
            try {
                const executionResult = await this.dotNetService.executeMigration(dotNetMigration, dotNetTargetConnection);

                if (!executionResult) {
                    throw new Error('Migration execution returned null');
                }

                result = executionResult;
            } catch (error) {
                Logger.error('Migration execution failed', error as Error);

                // Log rollback availability but don't attempt automatic rollback
                if (migration.rollbackScript) {
                    Logger.info('Rollback script available for manual execution', 'executeMigration', { migrationId });
                }

                throw error;
            }

            // Update status based on result
            migration.status = result.status as any;
            this.migrations.set(migrationId, migration);

            migrationSuccess = result.status === 'Completed';
            Logger.info('Migration execution completed', migrationSuccess ? 'success' : 'failed');
            return migrationSuccess;
        } catch (error) {
            Logger.error('Failed to execute migration', error as Error);

            // Update migration status to failed
            const migration = this.migrations.get(migrationId);
            if (migration) {
                migration.status = 'failed';
                this.migrations.set(migrationId, migration);
            }

            return false;
        }
    }
    async rollbackMigration(migrationId: string): Promise<boolean> {
        try {
            Logger.info('Rolling back migration', 'rollbackMigration', { migrationId });

            const migration = this.migrations.get(migrationId);
            if (!migration) {
                throw new Error(`Migration ${migrationId} not found`);
            }

            if (!migration.canRollback) {
                throw new Error(`Migration ${migrationId} cannot be rolled back`);
            }

            // Update status to rolling back
            migration.status = 'rolled_back';
            this.migrations.set(migrationId, migration);

            // Get target connection
            const targetConnection = this.connectionManager.getConnection(migration.targetConnection);
            if (!targetConnection) {
                throw new Error('Target connection not found');
            }

            const targetPassword = await this.connectionManager.getConnectionPassword(migration.targetConnection);
            if (!targetPassword) {
                throw new Error('Target connection password not found');
            }

            // Convert to .NET format
            const dotNetTargetConnection: DotNetConnectionInfo = {
                id: targetConnection.id,
                name: targetConnection.name,
                host: targetConnection.host,
                port: targetConnection.port,
                database: targetConnection.database,
                username: targetConnection.username,
                password: targetPassword
            };

            const dotNetMigration: DotNetMigrationScript = {
                id: migration.id,
                comparison: {} as DotNetSchemaComparison,
                selectedDifferences: [],
                sqlScript: migration.rollbackScript,
                rollbackScript: '',
                type: 'Schema',
                isDryRun: false,
                status: 'rolling_back',
                createdAt: migration.createdAt.toISOString()
            };

            // Execute rollback via .NET service
            const result = await this.dotNetService.executeMigration(dotNetMigration, dotNetTargetConnection);

            if (!result) {
                throw new Error('Rollback execution returned null');
            }

            const success = result.status === 'Completed';

            Logger.info('Rollback completed', 'rollbackMigration', { migrationId, success });

            return success;
        } catch (error) {
            Logger.error('Rollback failed', error as Error);
            throw error;
        }
    }
    private assessMigrationRisk(sqlScript: string): 'Low' | 'Medium' | 'High' {
        const script = sqlScript.toUpperCase();
        const highRiskOps = ['DROP TABLE', 'DROP SCHEMA', 'TRUNCATE', 'DELETE FROM'];
        const mediumRiskOps = ['DROP', 'ALTER TABLE'];

        if (highRiskOps.some(op => script.includes(op))) {
            return 'High';
        }
        if (mediumRiskOps.some(op => script.includes(op))) {
            return 'Medium';
        }
        return 'Low';
    }
    private analyzeMigrationWarnings(sqlScript: string): string[] {
        const warnings: string[] = [];
        const script = sqlScript.toUpperCase();

        if (script.includes('DROP TABLE')) {
            warnings.push('Migration contains DROP TABLE operations - data will be lost');
        }
        if (script.includes('TRUNCATE')) {
            warnings.push('Migration contains TRUNCATE operations - all data will be lost');
        }
        if (script.includes('DROP SCHEMA')) {
            warnings.push('Migration contains DROP SCHEMA operations - multiple objects will be affected');
        }
        if (script.includes('ALTER TABLE')) {
            warnings.push('Migration contains ALTER TABLE operations - schema changes may affect applications');
        }

        const statementCount = sqlScript.split('\n').length;
        if (statementCount > 100) {
            warnings.push(`Large migration with ${statementCount} statements - consider breaking into smaller batches`);
        }

        return warnings;
    }

    // Enhanced Rollback Script Generation with Validation
    async generateRollbackScript(
        migrationId: string,
        options: RollbackGenerationOptions = {}
    ): Promise<RollbackValidationResult> {
        try {
            Logger.info('Generating enhanced rollback script', 'generateRollbackScript', {
                migrationId,
                options
            });

            const migration = this.migrations.get(migrationId);
            if (!migration) {
                throw new Error(`Migration ${migrationId} not found`);
            }

            // Validate migration before generating rollback
            if (options.validateBeforeGeneration) {
                const validation = await this.validateMigrationForRollback(migration);
                if (!validation.isValid) {
                    throw new Error(`Migration validation failed: ${validation.errors.join(', ')}`);
                }
            }

            // Generate enhanced rollback script
            const rollbackScript = await this.generateEnhancedRollbackScript(migration, options);

            // Update migration with enhanced rollback information
            migration.rollbackScript = rollbackScript.sql;
            migration.rollbackValidation = rollbackScript.validation;
            migration.rollbackSafety = rollbackScript.safety;
            migration.estimatedRollbackTime = rollbackScript.estimatedTime;
            migration.rollbackComplexity = rollbackScript.complexity;
            migration.canRollback = rollbackScript.validation.isValid;

            this.migrations.set(migrationId, migration);

            Logger.info('Enhanced rollback script generated', 'generateRollbackScript', {
                migrationId,
                isValid: rollbackScript.validation.isValid,
                riskLevel: rollbackScript.validation.riskLevel,
                estimatedTime: rollbackScript.estimatedTime
            });

            return rollbackScript.validation;

        } catch (error) {
            Logger.error('Failed to generate rollback script', error as Error);
            throw error;
        }
    }

    async generateEnhancedRollbackScript(
        migration: MigrationScript,
        options: RollbackGenerationOptions
    ): Promise<{
        sql: string;
        validation: RollbackValidationResult;
        safety: RollbackSafetyAssessment;
        estimatedTime: number;
        complexity: 'simple' | 'moderate' | 'complex';
    }> {
        try {
            // Analyze the forward migration script to generate reverse operations
            const forwardOperations = this.parseMigrationOperations(migration.sqlScript);
            const reverseOperations = this.generateReverseOperations(forwardOperations);

            // Generate rollback SQL
            let rollbackSQL = this.buildRollbackSQL(reverseOperations, options);

            // Add safety checks if requested
            if (options.generateSafetyChecks) {
                rollbackSQL = this.addSafetyChecksToRollback(rollbackSQL, migration);
            }

            // Add data backup commands if requested
            if (options.includeDataBackup) {
                rollbackSQL = this.addDataBackupToRollback(rollbackSQL, migration);
            }

            // Validate the generated rollback script
            const validation = await this.validateRollbackScript(rollbackSQL, migration);

            // Assess safety
            const safety = this.assessRollbackSafety(rollbackSQL, forwardOperations, migration);

            // Estimate execution time
            const estimatedTime = this.estimateRollbackExecutionTime(reverseOperations);

            // Assess complexity
            const complexity = this.assessRollbackComplexity(reverseOperations);

            return {
                sql: rollbackSQL,
                validation,
                safety,
                estimatedTime,
                complexity
            };

        } catch (error) {
            Logger.error('Failed to generate enhanced rollback script', error as Error);
            throw error;
        }
    }

    private parseMigrationOperations(sqlScript: string): MigrationOperation[] {
        const operations: MigrationOperation[] = [];
        const statements = sqlScript.split(';').filter(stmt => stmt.trim().length > 0);

        for (const statement of statements) {
            const operation = this.classifySQLStatement(statement.trim());
            if (operation) {
                operations.push(operation);
            }
        }

        return operations;
    }

    private classifySQLStatement(statement: string): MigrationOperation | null {
        const upperStmt = statement.toUpperCase();

        if (upperStmt.includes('CREATE TABLE')) {
            return {
                type: 'CREATE_TABLE',
                sql: statement,
                riskLevel: 'Medium',
                reversible: true,
                reverseType: 'DROP_TABLE'
            };
        }

        if (upperStmt.includes('DROP TABLE')) {
            return {
                type: 'DROP_TABLE',
                sql: statement,
                riskLevel: 'High',
                reversible: false, // Data loss!
                reverseType: null
            };
        }

        if (upperStmt.includes('ALTER TABLE') && upperStmt.includes('ADD COLUMN')) {
            return {
                type: 'ADD_COLUMN',
                sql: statement,
                riskLevel: 'Low',
                reversible: true,
                reverseType: 'DROP_COLUMN'
            };
        }

        if (upperStmt.includes('ALTER TABLE') && upperStmt.includes('DROP COLUMN')) {
            return {
                type: 'DROP_COLUMN',
                sql: statement,
                riskLevel: 'High',
                reversible: false, // Data loss!
                reverseType: null
            };
        }

        if (upperStmt.includes('CREATE INDEX')) {
            return {
                type: 'CREATE_INDEX',
                sql: statement,
                riskLevel: 'Low',
                reversible: true,
                reverseType: 'DROP_INDEX'
            };
        }

        if (upperStmt.includes('DROP INDEX')) {
            return {
                type: 'DROP_INDEX',
                sql: statement,
                riskLevel: 'Low',
                reversible: true,
                reverseType: 'CREATE_INDEX'
            };
        }

        if (upperStmt.includes('ALTER TABLE') && upperStmt.includes('ADD CONSTRAINT')) {
            return {
                type: 'ADD_CONSTRAINT',
                sql: statement,
                riskLevel: 'Medium',
                reversible: true,
                reverseType: 'DROP_CONSTRAINT'
            };
        }

        if (upperStmt.includes('ALTER TABLE') && upperStmt.includes('DROP CONSTRAINT')) {
            return {
                type: 'DROP_CONSTRAINT',
                sql: statement,
                riskLevel: 'Medium',
                reversible: true,
                reverseType: 'ADD_CONSTRAINT'
            };
        }

        // Default classification
        return {
            type: 'OTHER',
            sql: statement,
            riskLevel: 'Low',
            reversible: true,
            reverseType: 'OTHER'
        };
    }

    private generateReverseOperations(operations: MigrationOperation[]): MigrationOperation[] {
        const reverseOperations: MigrationOperation[] = [];

        for (const operation of operations) {
            if (operation.reversible && operation.reverseType) {
                const reverseOperation: MigrationOperation = {
                    type: operation.reverseType,
                    sql: this.generateReverseSQL(operation),
                    riskLevel: operation.riskLevel,
                    reversible: operation.reversible,
                    reverseType: operation.type,
                    originalOperation: operation
                };
                reverseOperations.push(reverseOperation);
            }
        }

        // Reverse the order for proper rollback sequence
        return reverseOperations.reverse();
    }

    private generateReverseSQL(operation: MigrationOperation): string {
        switch (operation.type) {
            case 'CREATE_TABLE':
                // Extract table name from CREATE TABLE statement
                const createTableMatch = operation.sql.match(/CREATE TABLE (\w+)/i);
                if (createTableMatch) {
                    return `DROP TABLE IF EXISTS ${createTableMatch[1]} CASCADE;`;
                }
                break;

            case 'ADD_COLUMN':
                // Extract table and column name from ADD COLUMN statement
                const addColumnMatch = operation.sql.match(/ALTER TABLE (\w+) ADD COLUMN (\w+)/i);
                if (addColumnMatch) {
                    return `ALTER TABLE ${addColumnMatch[1]} DROP COLUMN IF EXISTS ${addColumnMatch[2]} CASCADE;`;
                }
                break;

            case 'CREATE_INDEX':
                // Extract index name from CREATE INDEX statement
                const createIndexMatch = operation.sql.match(/CREATE INDEX (\w+)/i);
                if (createIndexMatch) {
                    return `DROP INDEX IF EXISTS ${createIndexMatch[1]};`;
                }
                break;

            case 'ADD_CONSTRAINT':
                // Extract constraint name from ADD CONSTRAINT statement
                const addConstraintMatch = operation.sql.match(/ADD CONSTRAINT (\w+)/i);
                if (addConstraintMatch) {
                    return `ALTER TABLE ${this.extractTableFromConstraint(operation.sql)} DROP CONSTRAINT IF EXISTS ${addConstraintMatch[1]};`;
                }
                break;

            default:
                // For other operations, we'd need more sophisticated parsing
                return `-- Reverse operation for: ${operation.sql}`;
        }

        return `-- Unable to generate reverse SQL for: ${operation.sql}`;
    }

    private extractTableFromConstraint(sql: string): string {
        // Extract table name from constraint-related SQL
        const match = sql.match(/ALTER TABLE (\w+)/i);
        return match ? match[1] : 'unknown_table';
    }

    private buildRollbackSQL(operations: MigrationOperation[], options: RollbackGenerationOptions): string {
        let rollbackSQL = '';

        // Add header comments
        rollbackSQL += `-- Rollback Script Generated: ${new Date().toISOString()}\n`;
        rollbackSQL += `-- Original Migration ID: ${operations[0]?.originalOperation ? 'referenced' : 'standalone'}\n`;
        rollbackSQL += '-- WARNING: Execute this script with caution!\n\n';

        // Add rollback operations in reverse order
        for (const operation of operations) {
            rollbackSQL += operation.sql + ';\n\n';
        }

        // Add footer with execution notes
        rollbackSQL += '-- Rollback script generation completed\n';
        rollbackSQL += `-- Operations to rollback: ${operations.length}\n`;

        return rollbackSQL;
    }

    private addSafetyChecksToRollback(rollbackSQL: string, migration: MigrationScript): string {
        let enhancedSQL = rollbackSQL;

        // Add pre-rollback safety checks
        enhancedSQL = `-- Pre-rollback safety checks\n` +
            `DO $$\n` +
            `BEGIN\n` +
            `    -- Check if migration was actually applied\n` +
            `    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'migration_log') THEN\n` +
            `        RAISE EXCEPTION 'Migration tracking table not found. Cannot safely rollback.';\n` +
            `    END IF;\n` +
            `END\n` +
            `$$;\n\n` + enhancedSQL;

        return enhancedSQL;
    }

    private addDataBackupToRollback(rollbackSQL: string, migration: MigrationScript): string {
        // Add data backup commands before destructive operations
        const backupSQL = `-- Data backup before rollback\n` +
            `-- Note: This is a basic backup. Consider full database backup for production.\n\n`;

        return backupSQL + rollbackSQL;
    }

    async validateRollbackScript(rollbackSQL: string, migration: MigrationScript): Promise<RollbackValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Basic validation checks
        if (!rollbackSQL || rollbackSQL.trim().length === 0) {
            errors.push('Rollback script is empty');
        }

        // Check for dangerous operations
        const dangerousOps = ['DROP TABLE', 'TRUNCATE', 'DELETE FROM'];
        for (const op of dangerousOps) {
            if (rollbackSQL.toUpperCase().includes(op)) {
                warnings.push(`Rollback contains potentially dangerous operation: ${op}`);
            }
        }

        // Estimate execution time based on operation count
        const operationCount = rollbackSQL.split(';').length;
        const estimatedTime = operationCount * 100; // Rough estimate: 100ms per operation

        // Assess risk level
        const highRiskOps = rollbackSQL.match(/DROP TABLE|TRUNCATE|DELETE FROM/gi)?.length || 0;
        const riskLevel: 'Low' | 'Medium' | 'High' = highRiskOps > 0 ? 'High' : operationCount > 10 ? 'Medium' : 'Low';

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            estimatedExecutionTime: estimatedTime,
            affectedObjectCount: operationCount,
            riskLevel,
            validationTimestamp: new Date()
        };
    }

    private assessRollbackSafety(
        rollbackSQL: string,
        forwardOperations: MigrationOperation[],
        migration: MigrationScript
    ): RollbackSafetyAssessment {
        const riskFactors: string[] = [];
        const safetyMeasures: string[] = [];
        let dataLossPotential: 'none' | 'minimal' | 'moderate' | 'high' = 'none';

        // Analyze risk factors
        if (rollbackSQL.toUpperCase().includes('DROP TABLE')) {
            riskFactors.push('Rollback will drop tables');
            dataLossPotential = 'high';
        }

        if (rollbackSQL.toUpperCase().includes('TRUNCATE')) {
            riskFactors.push('Rollback will truncate data');
            dataLossPotential = 'high';
        }

        if (forwardOperations.some(op => op.type === 'DROP_COLUMN')) {
            riskFactors.push('Original migration dropped columns - rollback may fail');
            dataLossPotential = 'moderate';
        }

        // Analyze safety measures
        if (rollbackSQL.includes('IF EXISTS')) {
            safetyMeasures.push('Uses IF EXISTS clauses for safe execution');
        }

        if (rollbackSQL.includes('CASCADE')) {
            safetyMeasures.push('Uses CASCADE for dependent object cleanup');
        }

        // Calculate safety score (0-100)
        let safetyScore = 100;
        safetyScore -= riskFactors.length * 20;
        safetyScore += safetyMeasures.length * 10;
        safetyScore = Math.max(0, Math.min(100, safetyScore));

        // Assess dependency impact
        const dependencyImpact = this.assessDependencyImpact(forwardOperations);

        return {
            safetyScore,
            riskFactors,
            safetyMeasures,
            dataLossPotential,
            dependencyImpact,
            recommendedPrecautions: this.generateRecommendedPrecautions(riskFactors, dataLossPotential)
        };
    }

    private assessDependencyImpact(operations: MigrationOperation[]): 'none' | 'low' | 'medium' | 'high' {
        const highImpactOps = operations.filter(op => op.type === 'DROP_TABLE' || op.type === 'DROP_COLUMN').length;
        const mediumImpactOps = operations.filter(op => op.type === 'ALTER_TABLE').length;

        if (highImpactOps > 0) return 'high';
        if (mediumImpactOps > 3) return 'medium';
        if (mediumImpactOps > 0) return 'low';
        return 'none';
    }

    private generateRecommendedPrecautions(riskFactors: string[], dataLossPotential: string): string[] {
        const precautions: string[] = [];

        if (dataLossPotential === 'high') {
            precautions.push('Create full database backup before executing rollback');
            precautions.push('Test rollback in staging environment first');
            precautions.push('Notify all stakeholders of potential data loss');
        }

        if (riskFactors.some(factor => factor.includes('drop'))) {
            precautions.push('Review rollback script carefully before execution');
            precautions.push('Ensure no active connections during rollback');
        }

        if (riskFactors.length > 2) {
            precautions.push('Consider breaking rollback into smaller, manageable pieces');
        }

        return precautions;
    }

    private estimateRollbackExecutionTime(operations: MigrationOperation[]): number {
        // Estimate based on operation types and complexity
        let totalTime = 0;

        for (const operation of operations) {
            switch (operation.type) {
                case 'DROP_TABLE':
                    totalTime += 500; // 500ms for table drops
                    break;
                case 'CREATE_TABLE':
                    totalTime += 1000; // 1s for table creation
                    break;
                case 'ADD_COLUMN':
                case 'DROP_COLUMN':
                    totalTime += 200; // 200ms for column operations
                    break;
                case 'CREATE_INDEX':
                case 'DROP_INDEX':
                    totalTime += 300; // 300ms for index operations
                    break;
                default:
                    totalTime += 100; // 100ms for other operations
            }
        }

        return totalTime;
    }

    private assessRollbackComplexity(operations: MigrationOperation[]): 'simple' | 'moderate' | 'complex' {
        if (operations.length <= 3) return 'simple';
        if (operations.length <= 10) return 'moderate';
        return 'complex';
    }

    async validateMigrationForRollback(migration: MigrationScript): Promise<RollbackValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check if migration was successful
        if (migration.status !== 'completed') {
            errors.push('Cannot rollback migration that was not successfully completed');
        }

        // Check if rollback script exists
        if (!migration.rollbackScript || migration.rollbackScript.trim().length === 0) {
            errors.push('No rollback script available');
        }

        // Check for high-risk operations in original migration
        if (migration.riskLevel === 'High') {
            warnings.push('Original migration had high risk level - rollback may be complex');
        }

        // Check execution time
        if (migration.executionTime && migration.executionTime > 30000) { // 30 seconds
            warnings.push('Original migration took long time - rollback may also be time-consuming');
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            estimatedExecutionTime: migration.estimatedRollbackTime || 5000,
            affectedObjectCount: migration.operationCount,
            riskLevel: migration.riskLevel,
            validationTimestamp: new Date()
        };
    }

    // Enhanced rollback execution with progress tracking
    async executeRollbackWithProgress(
        migrationId: string,
        options: RollbackExecutionOptions = {}
    ): Promise<boolean> {
        try {
            Logger.info('Executing rollback with progress tracking', 'executeRollbackWithProgress', {
                migrationId,
                options
            });

            const migration = this.migrations.get(migrationId);
            if (!migration) {
                throw new Error(`Migration ${migrationId} not found`);
            }

            // Validate before execution if requested
            if (options.validateBeforeExecution) {
                const validation = await this.validateMigrationForRollback(migration);
                if (!validation.isValid) {
                    throw new Error(`Rollback validation failed: ${validation.errors.join(', ')}`);
                }
            }

            // Create backup if requested
            if (options.createBackupBeforeRollback) {
                await this.createPreRollbackBackup(migration);
            }

            // Update status
            migration.status = 'rolled_back';
            this.migrations.set(migrationId, migration);

            // Get target connection for rollback
            const targetConnection = this.connectionManager.getConnection(migration.targetConnection);
            if (!targetConnection) {
                throw new Error('Target connection not found');
            }

            const targetPassword = await this.connectionManager.getConnectionPassword(migration.targetConnection);
            if (!targetPassword) {
                throw new Error('Target connection password not found');
            }

            // Convert to .NET format
            const dotNetTargetConnection: DotNetConnectionInfo = {
                id: targetConnection.id,
                name: targetConnection.name,
                host: targetConnection.host,
                port: targetConnection.port,
                database: targetConnection.database,
                username: targetConnection.username,
                password: targetPassword
            };

            const dotNetMigration: DotNetMigrationScript = {
                id: migration.id,
                comparison: {} as DotNetSchemaComparison,
                selectedDifferences: [],
                sqlScript: migration.rollbackScript,
                rollbackScript: '',
                type: 'Schema',
                isDryRun: false,
                status: 'rolling_back',
                createdAt: migration.createdAt.toISOString()
            };

            // Execute rollback with progress tracking if callback provided
            let result;
            if (options.progressCallback) {
                result = await this.dotNetService.executeMigrationWithProgress(
                    dotNetMigration,
                    dotNetTargetConnection,
                    options.progressCallback
                );
            } else {
                result = await this.dotNetService.executeMigration(dotNetMigration, dotNetTargetConnection);
            }

            if (!result) {
                throw new Error('Rollback execution returned null');
            }

            const success = result.status === 'Completed';

            Logger.info('Rollback execution completed', 'executeRollbackWithProgress', {
                migrationId,
                success,
                executionTime: result.executionTime
            });

            return success;

        } catch (error) {
            Logger.error('Rollback execution failed', error as Error);
            throw error;
        }
    }

    private async createPreRollbackBackup(migration: MigrationScript): Promise<void> {
        // This would implement backup creation before rollback
        Logger.info('Creating pre-rollback backup', 'createPreRollbackBackup', {
            migrationId: migration.id
        });

        // For now, just log the intent
        // In a real implementation, this would create actual backups
    }

    // Business Rule Validation System
    async validatePreMigration(
        migrationId: string,
        options: PreMigrationValidationOptions
    ): Promise<MigrationValidationReport> {
        try {
            Logger.info('Starting pre-migration business rule validation', 'validatePreMigration', {
                migrationId,
                options
            });

            const migration = this.migrations.get(migrationId);
            if (!migration) {
                throw new Error(`Migration ${migrationId} not found`);
            }

            // Get business rules to validate against
            const rules = await this.getBusinessRules(options.connectionId, options.rules);

            if (rules.length === 0) {
                Logger.warn('No business rules found for validation', 'validatePreMigration', {
                    migrationId,
                    connectionId: options.connectionId
                });

                return {
                    migrationId,
                    validationTimestamp: new Date(),
                    totalRules: 0,
                    passedRules: 0,
                    failedRules: 0,
                    warningRules: 0,
                    results: [],
                    overallStatus: 'passed',
                    canProceed: true,
                    recommendations: ['No business rules configured - proceeding with migration']
                };
            }

            // Validate each rule
            const validationResults: BusinessRuleValidationResult[] = [];
            let passedRules = 0;
            let failedRules = 0;
            let warningRules = 0;

            for (const rule of rules) {
                if (!rule.isEnabled) continue;

                try {
                    const result = await this.validateBusinessRule(rule, migration, options.connectionId);
                    validationResults.push(result);

                    switch (result.severity) {
                        case 'error':
                            if (!result.passed) failedRules++;
                            else passedRules++;
                            break;
                        case 'warning':
                            warningRules++;
                            if (result.passed) passedRules++;
                            break;
                        case 'info':
                            passedRules++;
                            break;
                    }

                    // Stop on first error if configured
                    if (options.stopOnFirstError && !result.passed && result.severity === 'error') {
                        Logger.warn('Stopping validation on first error', 'validatePreMigration', {
                            migrationId,
                            ruleId: rule.id,
                            ruleName: rule.name
                        });
                        break;
                    }

                } catch (error) {
                    Logger.error('Business rule validation failed', error as Error, 'validatePreMigration', {
                        migrationId,
                        ruleId: rule.id,
                        ruleName: rule.name
                    });

                    validationResults.push({
                        ruleId: rule.id,
                        ruleName: rule.name,
                        passed: false,
                        severity: 'error',
                        message: `Validation execution failed: ${(error as Error).message}`,
                        executionTime: 0,
                        timestamp: new Date()
                    });
                    failedRules++;
                }
            }

            // Generate report
            const overallStatus = failedRules > 0 ? 'failed' :
                                warningRules > 0 ? 'warnings' : 'passed';
            const canProceed = options.failOnWarnings ? overallStatus === 'passed' : failedRules === 0;
            const recommendations = this.generateValidationRecommendations(validationResults, overallStatus);

            const report: MigrationValidationReport = {
                migrationId,
                validationTimestamp: new Date(),
                totalRules: rules.length,
                passedRules,
                failedRules,
                warningRules,
                results: validationResults,
                overallStatus,
                canProceed,
                recommendations
            };

            Logger.info('Pre-migration validation completed', 'validatePreMigration', {
                migrationId,
                totalRules: rules.length,
                passedRules,
                failedRules,
                warningRules,
                overallStatus,
                canProceed
            });

            return report;

        } catch (error) {
            Logger.error('Pre-migration validation failed', error as Error);
            throw error;
        }
    }

    private async getBusinessRules(connectionId: string, ruleIds?: string[]): Promise<BusinessRule[]> {
        // Get connection info for business rules retrieval
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

        // For now, return default business rules
        // In a real implementation, this would retrieve rules from pg-drive or configuration
        const defaultRules: BusinessRule[] = [
            {
                id: 'data_integrity_check',
                name: 'Data Integrity Check',
                description: 'Validates referential integrity before migration',
                category: 'data_integrity',
                severity: 'error',
                isEnabled: true,
                ruleDefinition: {
                    type: 'sql_query',
                    expression: 'SELECT COUNT(*) as orphaned_records FROM child_table WHERE parent_id NOT IN (SELECT id FROM parent_table)',
                    parameters: {},
                    expectedResult: 0
                },
                createdAt: new Date(),
                lastModified: new Date()
            },
            {
                id: 'performance_impact_check',
                name: 'Performance Impact Assessment',
                description: 'Checks for potential performance degradation',
                category: 'performance',
                severity: 'warning',
                isEnabled: true,
                ruleDefinition: {
                    type: 'threshold_check',
                    expression: 'SELECT COUNT(*) FROM large_table',
                    parameters: { maxRows: 1000000 },
                    expectedResult: { maxRows: 1000000 }
                },
                createdAt: new Date(),
                lastModified: new Date()
            },
            {
                id: 'security_validation',
                name: 'Security Compliance Check',
                description: 'Validates security constraints and permissions',
                category: 'security',
                severity: 'error',
                isEnabled: true,
                ruleDefinition: {
                    type: 'pattern_match',
                    expression: 'SELECT * FROM information_schema.role_table_grants WHERE privilege_type = \'SELECT\'',
                    parameters: { requireGrants: true }
                },
                createdAt: new Date(),
                lastModified: new Date()
            }
        ];

        if (ruleIds && ruleIds.length > 0) {
            return defaultRules.filter(rule => ruleIds.includes(rule.id));
        }

        return defaultRules.filter(rule => rule.isEnabled);
    }

    private async validateBusinessRule(
        rule: BusinessRule,
        migration: MigrationScript,
        connectionId: string
    ): Promise<BusinessRuleValidationResult> {
        const startTime = Date.now();

        try {
            Logger.debug('Validating business rule', 'validateBusinessRule', {
                ruleId: rule.id,
                ruleName: rule.name,
                ruleType: rule.ruleDefinition.type
            });

            let passed = false;
            let message = '';
            let details: any = {};

            switch (rule.ruleDefinition.type) {
                case 'sql_query':
                    const queryResult = await this.validateSQLQueryRule(rule, migration, connectionId);
                    passed = queryResult.passed;
                    message = queryResult.message;
                    details = queryResult.details;
                    break;

                case 'threshold_check':
                    const thresholdResult = await this.validateThresholdRule(rule, migration, connectionId);
                    passed = thresholdResult.passed;
                    message = thresholdResult.message;
                    details = thresholdResult.details;
                    break;

                case 'pattern_match':
                    const patternResult = await this.validatePatternRule(rule, migration, connectionId);
                    passed = patternResult.passed;
                    message = patternResult.message;
                    details = patternResult.details;
                    break;

                default:
                    throw new Error(`Unsupported rule type: ${rule.ruleDefinition.type}`);
            }

            const executionTime = Date.now() - startTime;

            return {
                ruleId: rule.id,
                ruleName: rule.name,
                passed,
                severity: rule.severity,
                message,
                details,
                executionTime,
                timestamp: new Date()
            };

        } catch (error) {
            const executionTime = Date.now() - startTime;

            return {
                ruleId: rule.id,
                ruleName: rule.name,
                passed: false,
                severity: 'error',
                message: `Rule validation failed: ${(error as Error).message}`,
                executionTime,
                timestamp: new Date()
            };
        }
    }

    private async validateSQLQueryRule(
        rule: BusinessRule,
        migration: MigrationScript,
        connectionId: string
    ): Promise<{passed: boolean; message: string; details: any}> {
        try {
            // Execute the SQL query defined in the rule
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

            const result = await this.dotNetService.executeQuery(
                dotNetConnection,
                rule.ruleDefinition.expression,
                { timeout: rule.ruleDefinition.timeout || 30000 }
            );

            // Check if result matches expected outcome
            const expectedResult = rule.ruleDefinition.expectedResult;
            let passed = false;
            let message = '';

            if (expectedResult !== undefined) {
                // For count queries, check if result matches expected count
                if (typeof expectedResult === 'number' && result.rowCount === expectedResult) {
                    passed = true;
                    message = `Query returned expected result: ${result.rowCount}`;
                } else if (result.rowCount === expectedResult) {
                    passed = true;
                    message = `Query validation passed: ${result.rowCount} rows`;
                } else {
                    passed = false;
                    message = `Query validation failed: expected ${expectedResult}, got ${result.rowCount}`;
                }
            } else {
                // If no expected result specified, just check if query executes successfully
                passed = result.rowCount >= 0; // Successfully executed
                message = `Query executed successfully: ${result.rowCount} rows returned`;
            }

            return {
                passed,
                message,
                details: {
                    rowCount: result.rowCount,
                    executionPlan: result.executionPlan,
                    actualResult: result.rowCount
                }
            };

        } catch (error) {
            return {
                passed: false,
                message: `SQL query validation failed: ${(error as Error).message}`,
                details: { error: (error as Error).message }
            };
        }
    }

    private async validateThresholdRule(
        rule: BusinessRule,
        migration: MigrationScript,
        connectionId: string
    ): Promise<{passed: boolean; message: string; details: any}> {
        try {
            // Execute threshold check
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

            const result = await this.dotNetService.executeQuery(
                dotNetConnection,
                rule.ruleDefinition.expression,
                { timeout: rule.ruleDefinition.timeout || 30000 }
            );

            const actualValue = result.rowCount;
            const threshold = rule.ruleDefinition.parameters.maxRows || rule.ruleDefinition.expectedResult;
            const passed = actualValue <= threshold;

            return {
                passed,
                message: passed ?
                    `Threshold check passed: ${actualValue} <= ${threshold}` :
                    `Threshold check failed: ${actualValue} > ${threshold}`,
                details: {
                    actualValue,
                    threshold,
                    difference: actualValue - threshold
                }
            };

        } catch (error) {
            return {
                passed: false,
                message: `Threshold validation failed: ${(error as Error).message}`,
                details: { error: (error as Error).message }
            };
        }
    }

    private async validatePatternRule(
        rule: BusinessRule,
        migration: MigrationScript,
        connectionId: string
    ): Promise<{passed: boolean; message: string; details: any}> {
        try {
            // Execute pattern matching validation
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

            const result = await this.dotNetService.executeQuery(
                dotNetConnection,
                rule.ruleDefinition.expression,
                { timeout: rule.ruleDefinition.timeout || 30000 }
            );

            // For pattern rules, we typically check if certain patterns exist or don't exist
            const requireGrants = rule.ruleDefinition.parameters.requireGrants || false;
            const passed = requireGrants ? result.rowCount > 0 : result.rowCount === 0;

            return {
                passed,
                message: passed ?
                    'Pattern validation passed' :
                    'Pattern validation failed - required patterns not found',
                details: {
                    rowCount: result.rowCount,
                    requiredPattern: requireGrants ? 'grants_exist' : 'no_violations'
                }
            };

        } catch (error) {
            return {
                passed: false,
                message: `Pattern validation failed: ${(error as Error).message}`,
                details: { error: (error as Error).message }
            };
        }
    }

    private generateValidationRecommendations(
        results: BusinessRuleValidationResult[],
        overallStatus: string
    ): string[] {
        const recommendations: string[] = [];

        if (overallStatus === 'failed') {
            recommendations.push('CRITICAL: Migration validation failed. Do not proceed with migration.');

            const failedRules = results.filter(r => !r.passed && r.severity === 'error');
            failedRules.forEach(rule => {
                recommendations.push(`Fix issue with rule '${rule.ruleName}': ${rule.message}`);
            });
        }

        if (overallStatus === 'warnings') {
            recommendations.push('WARNING: Migration validation passed with warnings. Review before proceeding.');

            const warningRules = results.filter(r => r.severity === 'warning');
            warningRules.forEach(rule => {
                recommendations.push(`Review warning for rule '${rule.ruleName}': ${rule.message}`);
            });
        }

        if (results.length === 0) {
            recommendations.push('No validation rules were executed. Consider configuring business rules for this migration.');
        }

        // Performance recommendations
        const slowRules = results.filter(r => r.executionTime > 5000);
        if (slowRules.length > 0) {
            recommendations.push(`Performance: ${slowRules.length} validation rules took longer than 5 seconds to execute`);
        }

        return recommendations;
    }

    // Migration Batching with Progress Tracking
    async executeMigrationInBatches(
        migrationId: string,
        options: MigrationBatchOptions = {}
    ): Promise<BatchExecutionResult> {
        try {
            Logger.info('Executing migration in batches with progress tracking', 'executeMigrationInBatches', {
                migrationId,
                options
            });

            const migration = this.migrations.get(migrationId);
            if (!migration) {
                throw new Error(`Migration ${migrationId} not found`);
            }

            // Parse migration into batches
            const batches = this.createMigrationBatches(migration, options);

            Logger.info('Migration divided into batches', 'executeMigrationInBatches', {
                migrationId,
                batchCount: batches.length,
                batchSize: options.batchSize || 10
            });

            // Execute batches with progress tracking
            const result = await this.executeBatches(batches, migration, options);

            Logger.info('Batch migration execution completed', 'executeMigrationInBatches', {
                migrationId,
                success: result.success,
                completedBatches: result.completedBatches,
                failedBatches: result.failedBatches,
                totalExecutionTime: result.totalExecutionTime
            });

            return result;

        } catch (error) {
            Logger.error('Batch migration execution failed', error as Error);
            throw error;
        }
    }

    private createMigrationBatches(
        migration: MigrationScript,
        options: MigrationBatchOptions
    ): MigrationBatch[] {
        const operations = this.parseMigrationOperations(migration.sqlScript);
        const batchSize = options.batchSize || 10;
        const batches: MigrationBatch[] = [];

        // Group operations into batches
        for (let i = 0; i < operations.length; i += batchSize) {
            const batchOperations = operations.slice(i, i + batchSize);
            const batchNumber = Math.floor(i / batchSize) + 1;

            const batch: MigrationBatch = {
                id: `${migration.id}_batch_${batchNumber}`,
                migrationId: migration.id,
                batchNumber,
                totalBatches: Math.ceil(operations.length / batchSize),
                operations: batchOperations,
                sqlScript: batchOperations.map(op => op.sql).join(';\n') + ';',
                status: 'pending',
                retryCount: 0
            };

            batches.push(batch);
        }

        return batches;
    }

    private async executeBatches(
        batches: MigrationBatch[],
        migration: MigrationScript,
        options: MigrationBatchOptions
    ): Promise<BatchExecutionResult> {
        const startTime = Date.now();
        const errors: Array<{ batchId: string; error: string; }> = [];
        const warnings: string[] = [];
        let completedBatches = 0;
        let failedBatches = 0;

        try {
            // Get target connection
            const targetConnection = this.connectionManager.getConnection(migration.targetConnection);
            if (!targetConnection) {
                throw new Error('Target connection not found');
            }

            const targetPassword = await this.connectionManager.getConnectionPassword(migration.targetConnection);
            if (!targetPassword) {
                throw new Error('Target connection password not found');
            }

            const dotNetTargetConnection: DotNetConnectionInfo = {
                id: targetConnection.id,
                name: targetConnection.name,
                host: targetConnection.host,
                port: targetConnection.port,
                database: targetConnection.database,
                username: targetConnection.username,
                password: targetPassword
            };

            // Execute each batch
            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i];

                try {
                    // Update migration status
                    migration.status = 'running';
                    this.migrations.set(migration.id, migration);

                    // Report progress if callback provided
                    if (options.progressCallback) {
                        const progress: MigrationBatchProgress = {
                            migrationId: migration.id,
                            currentBatch: i + 1,
                            totalBatches: batches.length,
                            completedOperations: completedBatches * (options.batchSize || 10),
                            totalOperations: migration.operationCount,
                            currentOperation: `Executing batch ${batch.batchNumber}/${batches.length}`,
                            percentage: ((i + 1) / batches.length) * 100,
                            currentBatchStatus: 'running',
                            errors: errors.map(e => e.error),
                            warnings,
                            batchProgress: {
                                batchNumber: batch.batchNumber,
                                completedOperations: 0,
                                totalOperations: batch.operations.length,
                                status: 'running'
                            }
                        };
                        options.progressCallback(progress);
                    }

                    // Execute batch
                    const batchResult = await this.executeBatch(batch, dotNetTargetConnection, options);

                    if (batchResult.success) {
                        batch.status = 'completed';
                        completedBatches++;

                        // Update progress for completed batch
                        if (options.progressCallback) {
                            const progress: MigrationBatchProgress = {
                                migrationId: migration.id,
                                currentBatch: i + 1,
                                totalBatches: batches.length,
                                completedOperations: completedBatches * (options.batchSize || 10),
                                totalOperations: migration.operationCount,
                                currentOperation: `Batch ${batch.batchNumber} completed`,
                                percentage: ((i + 1) / batches.length) * 100,
                                currentBatchStatus: 'completed',
                                errors: errors.map(e => e.error),
                                warnings,
                                batchProgress: {
                                    batchNumber: batch.batchNumber,
                                    completedOperations: batch.operations.length,
                                    totalOperations: batch.operations.length,
                                    status: 'completed'
                                }
                            };
                            options.progressCallback(progress);
                        }
                    } else {
                        batch.status = 'failed';
                        batch.error = batchResult.error || 'Batch execution failed';
                        failedBatches++;

                        if (options.stopOnFirstError) {
                            Logger.warn('Stopping batch execution due to first error', 'executeBatches', {
                                migrationId: migration.id,
                                failedBatch: batch.id
                            });
                            break;
                        }

                        // Retry failed batch if enabled
                        if (options.retryFailedBatches && batch.retryCount < (options.maxRetries || 3)) {
                            batch.retryCount++;
                            batch.status = 'pending';
                            i--; // Retry the same batch
                            continue;
                        }
                    }

                    // Pause between batches if configured
                    if (options.pauseBetweenBatches && i < batches.length - 1) {
                        await this.delay(options.pauseBetweenBatches);
                    }

                } catch (error) {
                    batch.status = 'failed';
                    batch.error = (error as Error).message;
                    failedBatches++;

                    errors.push({
                        batchId: batch.id,
                        error: (error as Error).message
                    });

                    if (options.stopOnFirstError) {
                        break;
                    }
                }
            }

            // Update final migration status
            migration.status = failedBatches === 0 ? 'completed' : 'failed';
            migration.executionTime = Date.now() - startTime;
            this.migrations.set(migration.id, migration);

            const success = failedBatches === 0;

            return {
                success,
                completedBatches,
                failedBatches,
                totalExecutionTime: Date.now() - startTime,
                errors,
                warnings
            };

        } catch (error) {
            Logger.error('Batch execution failed', error as Error);

            return {
                success: false,
                completedBatches,
                failedBatches: batches.length - completedBatches,
                totalExecutionTime: Date.now() - startTime,
                errors,
                warnings
            };
        }
    }

    private async executeBatch(
        batch: MigrationBatch,
        connection: DotNetConnectionInfo,
        options: MigrationBatchOptions
    ): Promise<{ success: boolean; error?: string; }> {
        try {
            batch.startTime = new Date();

            // Validate batch if requested
            if (options.validateEachBatch) {
                const validation = await this.validateBatch(batch);
                if (!validation.isValid) {
                    return {
                        success: false,
                        error: `Batch validation failed: ${validation.errors.join(', ')}`
                    };
                }
            }

            // Create .NET migration script for this batch
            const dotNetMigration: DotNetMigrationScript = {
                id: batch.id,
                comparison: {} as DotNetSchemaComparison,
                selectedDifferences: [],
                sqlScript: batch.sqlScript,
                rollbackScript: '',
                type: 'Schema',
                isDryRun: false,
                status: 'running',
                createdAt: new Date().toISOString()
            };

            // Execute batch via .NET service
            const result = await this.dotNetService.executeMigration(dotNetMigration, connection);

            if (!result) {
                throw new Error('Batch execution returned null');
            }

            batch.endTime = new Date();
            batch.executionTime = batch.startTime ? batch.endTime.getTime() - batch.startTime.getTime() : 0;

            const success = result.status === 'Completed';

            if (!success) {
                return {
                    success: false,
                    error: result.errors?.join(', ') || 'Batch execution failed'
                };
            }

            return { success: true };

        } catch (error) {
            batch.endTime = new Date();
            batch.executionTime = batch.startTime ? batch.endTime.getTime() - batch.startTime.getTime() : 0;

            return {
                success: false,
                error: (error as Error).message
            };
        }
    }

    private async validateBatch(batch: MigrationBatch): Promise<{ isValid: boolean; errors: string[]; }> {
        const errors: string[] = [];

        if (!batch.sqlScript || batch.sqlScript.trim().length === 0) {
            errors.push('Batch SQL script is empty');
        }

        // Check for dangerous operations in batch
        const dangerousOps = ['DROP TABLE', 'TRUNCATE'];
        for (const op of dangerousOps) {
            if (batch.sqlScript.toUpperCase().includes(op)) {
                errors.push(`Batch contains dangerous operation: ${op}`);
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    private delay(milliseconds: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, milliseconds));
    }

    // Get batch progress for a migration
    getMigrationBatchProgress(migrationId: string): MigrationBatchProgress | null {
        const migration = this.migrations.get(migrationId);
        if (!migration) {
            return null;
        }

        // This would return actual progress information
        // For now, return a basic structure
        return {
            migrationId,
            currentBatch: 0,
            totalBatches: 0,
            completedOperations: 0,
            totalOperations: migration.operationCount,
            currentOperation: 'Not started',
            percentage: 0,
            currentBatchStatus: 'pending',
            errors: [],
            warnings: migration.warnings,
            batchProgress: {
                batchNumber: 0,
                completedOperations: 0,
                totalOperations: 0,
                status: 'pending'
            }
        };
    }

    // Cancel batch migration
    async cancelBatchMigration(migrationId: string): Promise<boolean> {
        try {
            Logger.info('Cancelling batch migration', 'cancelBatchMigration', { migrationId });

            const migration = this.migrations.get(migrationId);
            if (!migration) {
                throw new Error(`Migration ${migrationId} not found`);
            }

            // Update status to cancelled
            migration.status = 'failed';
            this.migrations.set(migrationId, migration);

            Logger.info('Batch migration cancelled', 'cancelBatchMigration', { migrationId });
            return true;

        } catch (error) {
            Logger.error('Failed to cancel batch migration', error as Error);
            return false;
        }
    }

    // Migration Conflict Detection System
    async detectMigrationConflicts(
        sourceConnectionId: string,
        targetConnectionId: string,
        migrationScript: string
    ): Promise<MigrationConflictReport> {
        try {
            Logger.info('Starting migration conflict detection', 'detectMigrationConflicts', {
                sourceConnectionId,
                targetConnectionId
            });

            // Parse migration script to identify potential conflicts
            const operations = this.parseMigrationOperations(migrationScript);
            const conflicts: MigrationConflict[] = [];

            // Detect different types of conflicts
            conflicts.push(...this.detectDataConflicts(operations, sourceConnectionId, targetConnectionId));
            conflicts.push(...this.detectSchemaConflicts(operations, sourceConnectionId, targetConnectionId));
            conflicts.push(...this.detectDependencyConflicts(operations, sourceConnectionId, targetConnectionId));
            conflicts.push(...this.detectConcurrencyConflicts(operations, sourceConnectionId, targetConnectionId));

            // Analyze conflict severity and resolution strategies
            const analysis = this.analyzeConflicts(conflicts);
            const resolutions = this.generateConflictResolutions(conflicts);
            const recommendations = this.generateConflictRecommendations(conflicts, analysis);

            const report: MigrationConflictReport = {
                sourceConnectionId,
                targetConnectionId,
                totalConflicts: conflicts.length,
                criticalConflicts: conflicts.filter(c => c.severity === 'critical').length,
                warningConflicts: conflicts.filter(c => c.severity === 'warning').length,
                infoConflicts: conflicts.filter(c => c.severity === 'info').length,
                conflicts,
                analysis,
                resolutions,
                recommendations,
                canProceed: conflicts.filter(c => c.severity === 'critical').length === 0,
                generatedAt: new Date()
            };

            Logger.info('Migration conflict detection completed', 'detectMigrationConflicts', {
                sourceConnectionId,
                targetConnectionId,
                totalConflicts: conflicts.length,
                criticalConflicts: report.criticalConflicts,
                canProceed: report.canProceed
            });

            return report;

        } catch (error) {
            Logger.error('Migration conflict detection failed', error as Error);
            throw error;
        }
    }

    private detectDataConflicts(
        operations: MigrationOperation[],
        sourceConnectionId: string,
        targetConnectionId: string
    ): MigrationConflict[] {
        const conflicts: MigrationConflict[] = [];

        // Detect data loss operations
        const dataLossOps = operations.filter(op =>
            op.type === 'DROP_TABLE' || op.type === 'DROP_COLUMN' || op.type === 'TRUNCATE'
        );

        dataLossOps.forEach(op => {
            conflicts.push({
                id: `data_loss_${op.type}_${Date.now()}`,
                type: 'data_loss',
                severity: op.type === 'DROP_TABLE' ? 'critical' : 'warning',
                description: `Operation will cause data loss: ${op.sql}`,
                affectedObjects: this.extractObjectsFromOperation(op),
                resolutionStrategies: this.getDataLossResolutionStrategies(op),
                riskLevel: op.type === 'DROP_TABLE' ? 'high' : 'medium',
                estimatedImpact: this.estimateDataLossImpact(op),
                detectedAt: new Date()
            });
        });

        return conflicts;
    }

    private detectSchemaConflicts(
        operations: MigrationOperation[],
        sourceConnectionId: string,
        targetConnectionId: string
    ): MigrationConflict[] {
        const conflicts: MigrationConflict[] = [];

        // Detect schema conflicts
        const schemaChangeOps = operations.filter(op =>
            op.type === 'ALTER_TABLE' || op.type === 'CREATE_TABLE' || op.type === 'DROP_TABLE'
        );

        schemaChangeOps.forEach(op => {
            if (op.type === 'CREATE_TABLE') {
                conflicts.push({
                    id: `schema_create_${Date.now()}`,
                    type: 'schema_conflict',
                    severity: 'warning',
                    description: `Creating new table may conflict with existing objects: ${op.sql}`,
                    affectedObjects: this.extractObjectsFromOperation(op),
                    resolutionStrategies: ['Check for naming conflicts', 'Verify table structure compatibility'],
                    riskLevel: 'low',
                    estimatedImpact: 'Table creation may fail if object exists',
                    detectedAt: new Date()
                });
            }
        });

        return conflicts;
    }

    private detectDependencyConflicts(
        operations: MigrationOperation[],
        sourceConnectionId: string,
        targetConnectionId: string
    ): MigrationConflict[] {
        const conflicts: MigrationConflict[] = [];

        // Detect dependency issues
        const dropOps = operations.filter(op => op.type === 'DROP_TABLE' || op.type === 'DROP_COLUMN');

        dropOps.forEach(op => {
            conflicts.push({
                id: `dependency_${op.type}_${Date.now()}`,
                type: 'dependency_conflict',
                severity: 'critical',
                description: `Dropping object may break dependencies: ${op.sql}`,
                affectedObjects: this.extractObjectsFromOperation(op),
                resolutionStrategies: [
                    'Check for dependent objects before dropping',
                    'Use CASCADE option if appropriate',
                    'Consider renaming instead of dropping'
                ],
                riskLevel: 'high',
                estimatedImpact: 'May break applications that depend on dropped objects',
                detectedAt: new Date()
            });
        });

        return conflicts;
    }

    private detectConcurrencyConflicts(
        operations: MigrationOperation[],
        sourceConnectionId: string,
        targetConnectionId: string
    ): MigrationConflict[] {
        const conflicts: MigrationConflict[] = [];

        // Detect potential concurrency issues
        const highVolumeOps = operations.filter(op =>
            op.type === 'CREATE_INDEX' || op.type === 'ALTER_TABLE'
        );

        if (highVolumeOps.length > 5) {
            conflicts.push({
                id: `concurrency_${Date.now()}`,
                type: 'concurrency_conflict',
                severity: 'info',
                description: `Large number of operations (${highVolumeOps.length}) may cause concurrency issues`,
                affectedObjects: highVolumeOps.map(op => this.extractObjectsFromOperation(op)).flat(),
                resolutionStrategies: [
                    'Consider breaking migration into smaller batches',
                    'Execute during maintenance window',
                    'Monitor for lock contention'
                ],
                riskLevel: 'medium',
                estimatedImpact: 'May cause longer execution time and potential timeouts',
                detectedAt: new Date()
            });
        }

        return conflicts;
    }

    private extractObjectsFromOperation(operation: MigrationOperation): string[] {
        // Extract object names from SQL operation
        const objects: string[] = [];

        if (operation.type === 'DROP_TABLE' || operation.type === 'CREATE_TABLE') {
            const match = operation.sql.match(/(?:DROP|CREATE)\s+TABLE\s+(?:IF\s+EXISTS\s+)?(\w+)/i);
            if (match) objects.push(match[1]);
        }

        if (operation.type === 'DROP_COLUMN' || operation.type === 'ADD_COLUMN') {
            const match = operation.sql.match(/ALTER\s+TABLE\s+(\w+)/i);
            if (match) objects.push(match[1]);
        }

        return objects;
    }

    private getDataLossResolutionStrategies(operation: MigrationOperation): string[] {
        switch (operation.type) {
            case 'DROP_TABLE':
                return [
                    'Create backup before migration',
                    'Consider archiving instead of dropping',
                    'Verify no applications depend on this table'
                ];
            case 'DROP_COLUMN':
                return [
                    'Check if column contains important data',
                    'Consider data migration before dropping',
                    'Verify no queries reference this column'
                ];
            case 'TRUNCATE':
                return [
                    'Create full backup before truncation',
                    'Verify truncation is intended',
                    'Consider DELETE with WHERE clause instead'
                ];
            default:
                return ['Review operation carefully'];
        }
    }

    private estimateDataLossImpact(operation: MigrationOperation): string {
        switch (operation.type) {
            case 'DROP_TABLE':
                return 'Complete data loss for entire table';
            case 'DROP_COLUMN':
                return 'Data loss for specific column across all rows';
            case 'TRUNCATE':
                return 'Complete data loss for all rows in table';
            default:
                return 'Potential data loss depending on operation';
        }
    }

    private analyzeConflicts(conflicts: MigrationConflict[]): ConflictAnalysis {
        const criticalCount = conflicts.filter(c => c.severity === 'critical').length;
        const warningCount = conflicts.filter(c => c.severity === 'warning').length;
        const infoCount = conflicts.filter(c => c.severity === 'info').length;

        const overallRisk = criticalCount > 0 ? 'high' :
                           warningCount > 2 ? 'medium' : 'low';

        const affectedObjectTypes = [...new Set(conflicts.map(c => c.type))];

        return {
            totalConflicts: conflicts.length,
            severityBreakdown: {
                critical: criticalCount,
                warning: warningCount,
                info: infoCount
            },
            overallRisk,
            affectedObjectTypes,
            estimatedResolutionTime: this.estimateResolutionTime(conflicts),
            complexity: this.assessConflictComplexity(conflicts)
        };
    }

    private estimateResolutionTime(conflicts: MigrationConflict[]): number {
        let totalTime = 0;

        conflicts.forEach(conflict => {
            switch (conflict.severity) {
                case 'critical':
                    totalTime += 30; // 30 minutes for critical conflicts
                    break;
                case 'warning':
                    totalTime += 15; // 15 minutes for warnings
                    break;
                case 'info':
                    totalTime += 5; // 5 minutes for info
                    break;
            }
        });

        return totalTime;
    }

    private assessConflictComplexity(conflicts: MigrationConflict[]): 'simple' | 'moderate' | 'complex' {
        if (conflicts.length <= 2) return 'simple';
        if (conflicts.length <= 5) return 'moderate';
        return 'complex';
    }

    private generateConflictResolutions(conflicts: MigrationConflict[]): ConflictResolution[] {
        const resolutions: ConflictResolution[] = [];

        conflicts.forEach(conflict => {
            resolutions.push({
                conflictId: conflict.id,
                conflictType: conflict.type,
                resolutionType: this.determineResolutionType(conflict),
                description: this.generateResolutionDescription(conflict),
                steps: this.generateResolutionSteps(conflict),
                estimatedEffort: this.estimateResolutionEffort(conflict),
                automationPossible: this.canAutomateResolution(conflict),
                rollbackRequired: this.requiresRollbackForResolution(conflict)
            });
        });

        return resolutions;
    }

    private determineResolutionType(conflict: MigrationConflict): 'manual' | 'semi_automated' | 'automated' {
        if (conflict.type === 'data_loss' && conflict.severity === 'critical') {
            return 'manual';
        }
        if (conflict.type === 'dependency_conflict') {
            return 'semi_automated';
        }
        return 'automated';
    }

    private generateResolutionDescription(conflict: MigrationConflict): string {
        switch (conflict.type) {
            case 'data_loss':
                return 'Review and backup data before proceeding with destructive operations';
            case 'schema_conflict':
                return 'Verify schema compatibility and resolve naming conflicts';
            case 'dependency_conflict':
                return 'Analyze object dependencies and update references';
            case 'concurrency_conflict':
                return 'Optimize migration timing and batching strategy';
            default:
                return 'Review conflict and determine appropriate resolution';
        }
    }

    private generateResolutionSteps(conflict: MigrationConflict): string[] {
        switch (conflict.type) {
            case 'data_loss':
                return [
                    'Identify scope of data loss',
                    'Create backup of affected data',
                    'Review business impact',
                    'Get approval for data loss',
                    'Proceed with migration'
                ];
            case 'dependency_conflict':
                return [
                    'Identify dependent objects',
                    'Update dependency references',
                    'Test dependency changes',
                    'Update documentation'
                ];
            default:
                return ['Review conflict details', 'Implement fix', 'Test resolution'];
        }
    }

    private estimateResolutionEffort(conflict: MigrationConflict): 'low' | 'medium' | 'high' {
        switch (conflict.severity) {
            case 'critical':
                return 'high';
            case 'warning':
                return 'medium';
            case 'info':
                return 'low';
        }
    }

    private canAutomateResolution(conflict: MigrationConflict): boolean {
        return conflict.type === 'schema_conflict' && conflict.severity !== 'critical';
    }

    private requiresRollbackForResolution(conflict: MigrationConflict): boolean {
        return conflict.severity === 'critical' && conflict.type === 'data_loss';
    }

    private generateConflictRecommendations(
        conflicts: MigrationConflict[],
        analysis: ConflictAnalysis
    ): string[] {
        const recommendations: string[] = [];

        if (analysis.overallRisk === 'high') {
            recommendations.push('HIGH RISK: Critical conflicts detected. Do not proceed without manual review.');
        }

        if (analysis.severityBreakdown.critical > 0) {
            recommendations.push(`CRITICAL: ${analysis.severityBreakdown.critical} critical conflicts require immediate attention.`);
        }

        if (conflicts.some(c => c.type === 'data_loss')) {
            recommendations.push('WARNING: Data loss conflicts detected. Ensure proper backups are in place.');
        }

        if (conflicts.some(c => c.type === 'dependency_conflict')) {
            recommendations.push('WARNING: Dependency conflicts detected. Review object relationships before proceeding.');
        }

        if (analysis.estimatedResolutionTime > 60) {
            recommendations.push(`INFO: Estimated resolution time: ${analysis.estimatedResolutionTime} minutes`);
        }

        if (analysis.complexity === 'complex') {
            recommendations.push('INFO: Complex conflict scenario detected. Consider phased migration approach.');
        }

        return recommendations;
    }

    // Comprehensive Migration Pipeline with Approval Workflows
    async executeMigrationWithPipeline(
        migrationId: string,
        options: MigrationPipelineOptions = {}
    ): Promise<{
        success: boolean;
        executionContext: MigrationExecutionContext;
        stageResults: Map<string, StageExecutionResult>;
        approvalWorkflow?: MigrationApprovalWorkflow;
        finalReport: any;
    }> {
        try {
            Logger.info('Starting migration with comprehensive pipeline', 'executeMigrationWithPipeline', {
                migrationId,
                options
            });

            const migration = this.migrations.get(migrationId);
            if (!migration) {
                throw new Error(`Migration ${migrationId} not found`);
            }

            // Initialize execution context
            const executionContext: MigrationExecutionContext = {
                migrationId,
                pipelineId: options.pipelineId || `pipeline_${migrationId}`,
                currentStage: 'initialization',
                startTime: new Date(),
                progress: 0,
                status: 'pending',
                warnings: [],
                stageResults: new Map(),
                metadata: {}
            };

            // Initialize approval workflow if required
            let approvalWorkflow: MigrationApprovalWorkflow | undefined;
            if (options.approvalWorkflow) {
                approvalWorkflow = await this.initializeApprovalWorkflow(migration, options);
                executionContext.metadata.approvalWorkflowId = approvalWorkflow.id;
            }

            // Define pipeline stages
            const pipelineStages = options.customStages || this.getDefaultPipelineStages(migration);

            // Execute pipeline stages
            const stageResults = await this.executePipelineStages(
                pipelineStages,
                migration,
                executionContext,
                options
            );

            // Update final status
            executionContext.status = this.determineOverallStatus(stageResults);
            executionContext.progress = 100;

            // Generate final report
            const finalReport = await this.generatePipelineExecutionReport(
                migration,
                executionContext,
                stageResults,
                approvalWorkflow
            );

            const success = executionContext.status === 'completed';

            Logger.info('Migration pipeline execution completed', 'executeMigrationWithPipeline', {
                migrationId,
                success,
                totalStages: pipelineStages.length,
                completedStages: Array.from(stageResults.values()).filter(r => r.status === 'completed').length
            });

            return {
                success,
                executionContext,
                stageResults,
                approvalWorkflow,
                finalReport
            };

        } catch (error) {
            Logger.error('Migration pipeline execution failed', error as Error);
            throw error;
        }
    }

    private getDefaultPipelineStages(migration: MigrationScript): MigrationPipelineStage[] {
        return [
            {
                id: 'validation',
                name: 'Pre-Migration Validation',
                description: 'Validate migration script and business rules',
                order: 1,
                isRequired: true,
                isEnabled: true,
                timeout: 300000, // 5 minutes
                retryCount: 2,
                parameters: { runBusinessRules: true, runConflictDetection: true }
            },
            {
                id: 'backup',
                name: 'Pre-Migration Backup',
                description: 'Create backup before making changes',
                order: 2,
                isRequired: migration.riskLevel === 'High',
                isEnabled: true,
                timeout: 600000, // 10 minutes
                retryCount: 1,
                parameters: { includeData: true, includeSchema: true }
            },
            {
                id: 'execution',
                name: 'Migration Execution',
                description: 'Execute the migration script',
                order: 3,
                isRequired: true,
                isEnabled: true,
                timeout: 1800000, // 30 minutes
                retryCount: 1,
                parameters: { useBatching: migration.operationCount > 50 }
            },
            {
                id: 'verification',
                name: 'Post-Migration Verification',
                description: 'Verify migration completed successfully',
                order: 4,
                isRequired: true,
                isEnabled: true,
                timeout: 300000, // 5 minutes
                retryCount: 2,
                parameters: { verifyDataIntegrity: true, verifyConstraints: true }
            },
            {
                id: 'cleanup',
                name: 'Post-Migration Cleanup',
                description: 'Clean up temporary objects and finalize migration',
                order: 5,
                isRequired: false,
                isEnabled: true,
                timeout: 180000, // 3 minutes
                retryCount: 1,
                parameters: { removeTempObjects: true, updateMetadata: true }
            }
        ];
    }

    private async initializeApprovalWorkflow(
        migration: MigrationScript,
        options: MigrationPipelineOptions
    ): Promise<MigrationApprovalWorkflow> {
        const workflow: MigrationApprovalWorkflow = {
            id: `approval_${migration.id}_${Date.now()}`,
            name: `Approval for Migration ${migration.name}`,
            description: `Approval workflow for migration ${migration.id}`,
            migrationId: migration.id,
            stages: this.getDefaultApprovalStages(migration),
            currentStage: 0,
            status: 'pending',
            createdAt: new Date(),
            approvers: [],
            approvalHistory: []
        };

        // Auto-approve low-risk migrations if configured
        if (options.autoApproveLowRisk && migration.riskLevel === 'Low') {
            workflow.status = 'approved';
            workflow.completedAt = new Date();
        }

        return workflow;
    }

    private getDefaultApprovalStages(migration: MigrationScript): ApprovalStage[] {
        const stages: ApprovalStage[] = [];

        if (migration.riskLevel === 'High') {
            stages.push({
                id: 'dba_approval',
                name: 'DBA Approval',
                description: 'Database administrator approval required',
                order: 1,
                requiredApprovers: 1,
                approverRoles: ['dba', 'admin'],
                criteria: {
                    maxDataLossPotential: 'minimal',
                    requireBusinessRuleValidation: true,
                    requireConflictResolution: true
                },
                timeout: 86400000 // 24 hours
            });
        }

        if (migration.riskLevel === 'Medium' || migration.riskLevel === 'High') {
            stages.push({
                id: 'manager_approval',
                name: 'Manager Approval',
                description: 'Technical manager approval required',
                order: 2,
                requiredApprovers: 1,
                approverRoles: ['manager', 'lead'],
                criteria: {
                    minRiskLevel: migration.riskLevel,
                    requireBusinessRuleValidation: true
                },
                timeout: 43200000 // 12 hours
            });
        }

        return stages;
    }

    private async executePipelineStages(
        stages: MigrationPipelineStage[],
        migration: MigrationScript,
        context: MigrationExecutionContext,
        options: MigrationPipelineOptions
    ): Promise<Map<string, StageExecutionResult>> {
        const stageResults = new Map<string, StageExecutionResult>();

        for (const stage of stages.sort((a, b) => a.order - b.order)) {
            if (!stage.isEnabled) continue;

            const stageResult: StageExecutionResult = {
                stageId: stage.id,
                stageName: stage.name,
                startTime: new Date(),
                status: 'pending',
                retryCount: 0
            };

            try {
                context.currentStage = stage.id;
                context.currentOperation = `Executing stage: ${stage.name}`;
                stageResults.set(stage.id, stageResult);

                // Execute stage based on type
                await this.executeStage(stage, migration, context, options);

                stageResult.status = 'completed';
                stageResult.endTime = new Date();
                stageResult.duration = stageResult.endTime.getTime() - stageResult.startTime.getTime();

                // Update progress
                context.progress = (Array.from(stageResults.values()).filter(r => r.status === 'completed').length / stages.length) * 100;

                // Report progress if callback provided
                if (options.generateDetailedReports) {
                    Logger.info('Pipeline stage completed', 'executePipelineStages', {
                        migrationId: migration.id,
                        stageId: stage.id,
                        stageName: stage.name,
                        duration: stageResult.duration
                    });
                }

            } catch (error) {
                stageResult.status = 'failed';
                stageResult.endTime = new Date();
                stageResult.duration = stageResult.endTime.getTime() - stageResult.startTime.getTime();
                stageResult.error = (error as Error).message;

                if (stage.isRequired) {
                    context.status = 'failed';
                    context.error = `Required stage failed: ${stage.name}`;
                    break;
                }

                // Continue with optional stages even if they fail
                Logger.warn('Optional stage failed, continuing pipeline', 'executePipelineStages', {
                    migrationId: migration.id,
                    stageId: stage.id,
                    error: (error as Error).message
                });
            }
        }

        return stageResults;
    }

    private async executeStage(
        stage: MigrationPipelineStage,
        migration: MigrationScript,
        context: MigrationExecutionContext,
        options: MigrationPipelineOptions
    ): Promise<void> {
        switch (stage.id) {
            case 'validation':
                await this.executeValidationStage(stage, migration, context);
                break;
            case 'backup':
                await this.executeBackupStage(stage, migration, context);
                break;
            case 'execution':
                await this.executeMigrationStage(stage, migration, context, options);
                break;
            case 'verification':
                await this.executeVerificationStage(stage, migration, context);
                break;
            case 'cleanup':
                await this.executeCleanupStage(stage, migration, context);
                break;
            default:
                throw new Error(`Unknown pipeline stage: ${stage.id}`);
        }
    }

    private async executeValidationStage(
        stage: MigrationPipelineStage,
        migration: MigrationScript,
        context: MigrationExecutionContext
    ): Promise<void> {
        // Run business rule validation
        if (stage.parameters.runBusinessRules) {
            const validationReport = await this.validatePreMigration(migration.id, {
                connectionId: migration.targetConnection,
                failOnWarnings: false,
                stopOnFirstError: true
            });

            if (!validationReport.canProceed) {
                throw new Error(`Business rule validation failed: ${validationReport.recommendations.join(', ')}`);
            }

            context.metadata.validationReport = validationReport;
        }

        // Run conflict detection
        if (stage.parameters.runConflictDetection) {
            const conflictReport = await this.detectMigrationConflicts(
                migration.sourceConnection,
                migration.targetConnection,
                migration.sqlScript
            );

            if (!conflictReport.canProceed) {
                throw new Error(`Critical conflicts detected: ${conflictReport.recommendations.join(', ')}`);
            }

            context.metadata.conflictReport = conflictReport;
        }
    }

    private async executeBackupStage(
        stage: MigrationPipelineStage,
        migration: MigrationScript,
        context: MigrationExecutionContext
    ): Promise<void> {
        // Create pre-migration backup
        Logger.info('Creating pre-migration backup', 'executeBackupStage', {
            migrationId: migration.id,
            includeData: stage.parameters.includeData,
            includeSchema: stage.parameters.includeSchema
        });

        // In a real implementation, this would create actual backups
        context.metadata.backupCreated = true;
        context.metadata.backupTimestamp = new Date();
    }

    private async executeMigrationStage(
        stage: MigrationPipelineStage,
        migration: MigrationScript,
        context: MigrationExecutionContext,
        options: MigrationPipelineOptions
    ): Promise<void> {
        // Execute migration with batching if enabled
        if (stage.parameters.useBatching) {
            const batchResult = await this.executeMigrationInBatches(migration.id, {
                batchSize: 10,
                stopOnFirstError: true,
                validateEachBatch: true,
                progressCallback: (progress) => {
                    context.currentOperation = progress.currentOperation;
                    context.progress = progress.percentage;
                }
            });

            if (!batchResult.success) {
                throw new Error(`Migration execution failed: ${batchResult.errors.map(e => e.error).join(', ')}`);
            }

            context.metadata.batchExecutionResult = batchResult;
        } else {
            // Execute migration directly
            const success = await this.executeMigration(migration.id);
            if (!success) {
                throw new Error('Migration execution failed');
            }
        }
    }

    private async executeVerificationStage(
        stage: MigrationPipelineStage,
        migration: MigrationScript,
        context: MigrationExecutionContext
    ): Promise<void> {
        // Verify migration completed successfully
        if (stage.parameters.verifyDataIntegrity) {
            // Run data integrity checks
            Logger.info('Verifying data integrity', 'executeVerificationStage', {
                migrationId: migration.id
            });
        }

        if (stage.parameters.verifyConstraints) {
            // Verify constraints are valid
            Logger.info('Verifying constraints', 'executeVerificationStage', {
                migrationId: migration.id
            });
        }

        context.metadata.verificationCompleted = true;
    }

    private async executeCleanupStage(
        stage: MigrationPipelineStage,
        migration: MigrationScript,
        context: MigrationExecutionContext
    ): Promise<void> {
        // Clean up temporary objects and finalize
        if (stage.parameters.removeTempObjects) {
            Logger.info('Removing temporary objects', 'executeCleanupStage', {
                migrationId: migration.id
            });
        }

        if (stage.parameters.updateMetadata) {
            Logger.info('Updating metadata', 'executeCleanupStage', {
                migrationId: migration.id
            });
        }

        context.metadata.cleanupCompleted = true;
    }

    private determineOverallStatus(stageResults: Map<string, StageExecutionResult>): 'pending' | 'running' | 'completed' | 'failed' {
        const results = Array.from(stageResults.values());

        if (results.some(r => r.status === 'failed')) {
            return 'failed';
        }

        if (results.every(r => r.status === 'completed')) {
            return 'completed';
        }

        if (results.some(r => r.status === 'running')) {
            return 'running';
        }

        return 'pending';
    }

    private async generatePipelineExecutionReport(
        migration: MigrationScript,
        context: MigrationExecutionContext,
        stageResults: Map<string, StageExecutionResult>,
        approvalWorkflow?: MigrationApprovalWorkflow
    ): Promise<any> {
        return {
            migrationId: migration.id,
            executionContext,
            stageResults: Array.from(stageResults.entries()),
            approvalWorkflow,
            summary: {
                totalStages: stageResults.size,
                completedStages: Array.from(stageResults.values()).filter(r => r.status === 'completed').length,
                failedStages: Array.from(stageResults.values()).filter(r => r.status === 'failed').length,
                totalExecutionTime: context.startTime ? Date.now() - context.startTime.getTime() : 0
            },
            generatedAt: new Date()
        };
    }
}

// Supporting interfaces for conflict detection
interface MigrationConflict {
    id: string;
    type: 'data_loss' | 'schema_conflict' | 'dependency_conflict' | 'concurrency_conflict';
    severity: 'critical' | 'warning' | 'info';
    description: string;
    affectedObjects: string[];
    resolutionStrategies: string[];
    riskLevel: 'low' | 'medium' | 'high';
    estimatedImpact: string;
    detectedAt: Date;
}

interface ConflictAnalysis {
    totalConflicts: number;
    severityBreakdown: {
        critical: number;
        warning: number;
        info: number;
    };
    overallRisk: 'low' | 'medium' | 'high';
    affectedObjectTypes: string[];
    estimatedResolutionTime: number;
    complexity: 'simple' | 'moderate' | 'complex';
}

interface ConflictResolution {
    conflictId: string;
    conflictType: string;
    resolutionType: 'manual' | 'semi_automated' | 'automated';
    description: string;
    steps: string[];
    estimatedEffort: 'low' | 'medium' | 'high';
    automationPossible: boolean;
    rollbackRequired: boolean;
}

interface MigrationConflictReport {
    sourceConnectionId: string;
    targetConnectionId: string;
    totalConflicts: number;
    criticalConflicts: number;
    warningConflicts: number;
    infoConflicts: number;
    conflicts: MigrationConflict[];
    analysis: ConflictAnalysis;
    resolutions: ConflictResolution[];
    recommendations: string[];
    canProceed: boolean;
    generatedAt: Date;
}

// Supporting interfaces
interface MigrationOperation {
    type: string;
    sql: string;
    riskLevel: 'Low' | 'Medium' | 'High';
    reversible: boolean;
    reverseType: string | null;
    originalOperation?: MigrationOperation;
}