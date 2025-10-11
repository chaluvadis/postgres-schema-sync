import * as vscode from 'vscode';
import { ConnectionManager } from '@/managers/ConnectionManager';
import { DotNetIntegrationService, DotNetConnectionInfo } from '@/services/DotNetIntegrationService';
import { Logger } from '@/utils/Logger';

export interface MigrationValidationRequest {
    id: string;
    migrationScript: string;
    targetConnection: DotNetConnectionInfo;
    options: ValidationOptions;
    createdAt: Date;
}

export interface ValidationOptions {
    checkDataLoss?: boolean;
    checkDependencies?: boolean;
    checkPermissions?: boolean;
    dryRun?: boolean;
    sampleSize?: number;
    timeout?: number;
}

export interface ValidationResult {
    validationId: string;
    requestId: string;
    status: 'passed' | 'failed' | 'warning' | 'error';
    executionTime: number;
    summary: ValidationSummary;
    issues: ValidationIssue[];
    recommendations: string[];
    details: ValidationDetails;
}

export interface ValidationSummary {
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
    warningChecks: number;
    criticalIssues: number;
    dataLossRisk: boolean;
    breakingChanges: boolean;
}

export interface ValidationIssue {
    type: 'error' | 'warning' | 'info';
    category: 'data_loss' | 'dependency' | 'permission' | 'syntax' | 'performance' | 'security';
    severity: 'low' | 'medium' | 'high' | 'critical';
    objectName?: string;
    objectType?: string;
    schema?: string;
    message: string;
    details?: string;
    suggestion?: string;
    lineNumber?: number;
    columnNumber?: number;
}

export interface ValidationDetails {
    syntaxValidation: SyntaxValidation;
    dependencyAnalysis: DependencyAnalysis;
    dataImpactAnalysis: DataImpactAnalysis;
    permissionAnalysis: PermissionAnalysis;
    performanceImpact: PerformanceImpact;
}

export interface SyntaxValidation {
    valid: boolean;
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
}

export interface DependencyAnalysis {
    affectedObjects: string[];
    brokenDependencies: string[];
    newDependencies: string[];
    circularDependencies: string[];
    issues: ValidationIssue[];
}

export interface DataImpactAnalysis {
    tablesAffected: number;
    rowsAffected: number;
    dataLossPotential: boolean;
    dataTypeChanges: DataTypeChange[];
    constraintViolations: string[];
    issues: ValidationIssue[];
}

export interface DataTypeChange {
    tableName: string;
    columnName: string;
    oldType: string;
    newType: string;
    conversionRisk: 'low' | 'medium' | 'high';
}

export interface PermissionAnalysis {
    requiredPermissions: string[];
    missingPermissions: string[];
    excessivePermissions: string[];
    issues: ValidationIssue[];
}

export interface PerformanceImpact {
    estimatedDuration: number;
    cpuImpact: 'low' | 'medium' | 'high';
    ioImpact: 'low' | 'medium' | 'high';
    memoryImpact: 'low' | 'medium' | 'high';
    indexRebuilds: number;
    lockDuration: number;
    issues: ValidationIssue[];
}

export class MigrationValidationService {
    private connectionManager: ConnectionManager;
    private dotNetService: DotNetIntegrationService;
    private activeValidations: Map<string, MigrationValidationRequest> = new Map();
    private validationHistory: ValidationResult[] = [];

    constructor(connectionManager: ConnectionManager) {
        this.connectionManager = connectionManager;
        this.dotNetService = DotNetIntegrationService.getInstance();
    }

    async validateMigration(
        migrationScript: string,
        targetConnectionId: string,
        options: ValidationOptions = {}
    ): Promise<ValidationResult> {
        const validationId = this.generateId();
        const requestId = this.generateId();

        try {
            Logger.info('Starting migration validation', 'validateMigration', {
                validationId,
                targetConnectionId
            });

            // Get connection details
            const connection = this.connectionManager.getConnection(targetConnectionId);
            if (!connection) {
                throw new Error(`Connection ${targetConnectionId} not found`);
            }

            const password = await this.connectionManager.getConnectionPassword(targetConnectionId);
            if (!password) {
                throw new Error('Connection password not found');
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

            // Create validation request
            const request: MigrationValidationRequest = {
                id: requestId,
                migrationScript,
                targetConnection: dotNetConnection,
                options: {
                    checkDataLoss: options.checkDataLoss ?? true,
                    checkDependencies: options.checkDependencies ?? true,
                    checkPermissions: options.checkPermissions ?? true,
                    dryRun: options.dryRun ?? true,
                    sampleSize: options.sampleSize ?? 1000,
                    timeout: options.timeout ?? 30
                },
                createdAt: new Date()
            };

            this.activeValidations.set(validationId, request);

            // Show progress
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Validating Migration',
                cancellable: true
            }, async (progress, token) => {
                progress.report({ increment: 0, message: 'Analyzing migration script...' });

                if (token.isCancellationRequested) {
                    throw new Error('Validation cancelled by user');
                }

                // Perform comprehensive validation
                const result = await this.performValidation(request, token);

                progress.report({ increment: 100, message: 'Validation complete' });

                // Store result
                this.validationHistory.unshift(result);

                // Clean up active validation
                this.activeValidations.delete(validationId);

                // Show results
                this.showValidationResults(result);

                return result;
            });

            Logger.info('Migration validation completed', 'validateMigration', {
                validationId,
                status: 'completed'
            });

            return this.validationHistory[0];

        } catch (error) {
            Logger.error('Migration validation failed', error as Error);

            // Clean up on error
            this.activeValidations.delete(validationId);

            // Create error result
            const errorResult: ValidationResult = {
                validationId,
                requestId,
                status: 'error',
                executionTime: 0,
                summary: {
                    totalChecks: 0,
                    passedChecks: 0,
                    failedChecks: 1,
                    warningChecks: 0,
                    criticalIssues: 1,
                    dataLossRisk: false,
                    breakingChanges: false
                },
                issues: [{
                    type: 'error',
                    category: 'syntax',
                    severity: 'critical',
                    message: (error as Error).message,
                    suggestion: 'Please check the migration script syntax and try again'
                }],
                recommendations: ['Review the error message and fix the migration script'],
                details: this.createEmptyValidationDetails()
            };

            this.showValidationResults(errorResult);
            return errorResult;
        }
    }

    private async performValidation(
        request: MigrationValidationRequest,
        token: any
    ): Promise<ValidationResult> {
        const startTime = Date.now();
        const issues: ValidationIssue[] = [];
        const recommendations: string[] = [];

        try {
            // 1. Syntax Validation
            const syntaxResult = await this.validateSyntax(request.migrationScript, request.targetConnection);
            issues.push(...syntaxResult.errors, ...syntaxResult.warnings);

            if (token.isCancellationRequested) {
                throw new Error('Validation cancelled');
            }

            // 2. Dependency Analysis
            const dependencyResult = await this.analyzeDependencies(request.migrationScript, request.targetConnection);
            issues.push(...dependencyResult.issues);

            if (token.isCancellationRequested) {
                throw new Error('Validation cancelled');
            }

            // 3. Data Impact Analysis
            const dataImpactResult = await this.analyzeDataImpact(request.migrationScript, request.targetConnection, request.options);
            issues.push(...dataImpactResult.issues);

            if (token.isCancellationRequested) {
                throw new Error('Validation cancelled');
            }

            // 4. Permission Analysis
            const permissionResult = await this.analyzePermissions(request.migrationScript, request.targetConnection);
            issues.push(...permissionResult.issues);

            if (token.isCancellationRequested) {
                throw new Error('Validation cancelled');
            }

            // 5. Performance Impact Analysis
            const performanceResult = await this.analyzePerformanceImpact(request.migrationScript, request.targetConnection);
            issues.push(...performanceResult.issues);

            // Generate recommendations
            recommendations.push(...this.generateRecommendations(issues, syntaxResult, dependencyResult, dataImpactResult, permissionResult, performanceResult));

            // Calculate summary
            const summary = this.calculateValidationSummary(issues);

            const executionTime = Date.now() - startTime;

            return {
                validationId: this.generateId(),
                requestId: request.id,
                status: summary.failedChecks > 0 ? 'failed' : summary.warningChecks > 0 ? 'warning' : 'passed',
                executionTime,
                summary,
                issues,
                recommendations,
                details: {
                    syntaxValidation: syntaxResult,
                    dependencyAnalysis: dependencyResult,
                    dataImpactAnalysis: dataImpactResult,
                    permissionAnalysis: permissionResult,
                    performanceImpact: performanceResult
                }
            };

        } catch (error) {
            Logger.error('Error during validation execution', error as Error);
            throw error;
        }
    }

    private async validateSyntax(script: string, _connection: DotNetConnectionInfo): Promise<SyntaxValidation> {
        const errors: ValidationIssue[] = [];
        const warnings: ValidationIssue[] = [];

        try {
            // Basic syntax checks
            if (!script || script.trim().length === 0) {
                errors.push({
                    type: 'error',
                    category: 'syntax',
                    severity: 'critical',
                    message: 'Migration script is empty',
                    suggestion: 'Please provide a valid migration script'
                });
                return { valid: false, errors, warnings };
            }

            // Check for dangerous operations
            const dangerousPatterns = [
                { pattern: /DROP\s+DATABASE/i, message: 'Database drop operation detected', severity: 'critical' as const },
                { pattern: /DROP\s+TABLE/i, message: 'Table drop operation detected', severity: 'high' as const },
                { pattern: /TRUNCATE\s+TABLE/i, message: 'Table truncate operation detected', severity: 'high' as const },
                { pattern: /DELETE\s+FROM\s+\w+\s+WHERE\s+1\s*=\s*1/i, message: 'Potential mass delete operation', severity: 'critical' as const }
            ];

            dangerousPatterns.forEach(({ pattern, message, severity }) => {
                if (pattern.test(script)) {
                    errors.push({
                        type: 'warning',
                        category: 'syntax',
                        severity,
                        message,
                        suggestion: 'Review this operation carefully before proceeding'
                    });
                }
            });

            // Check for incomplete statements
            const openBrackets = (script.match(/\(/g) || []).length - (script.match(/\)/g) || []).length;
            const openQuotes = script.split('"').length % 2 === 0 ? 0 : 1;

            if (openBrackets > 0) {
                warnings.push({
                    type: 'warning',
                    category: 'syntax',
                    severity: 'medium',
                    message: 'Possibly unmatched opening brackets',
                    suggestion: 'Check for balanced brackets in the script'
                });
            }

            if (openQuotes > 0) {
                errors.push({
                    type: 'error',
                    category: 'syntax',
                    severity: 'high',
                    message: 'Unmatched quotes in script',
                    suggestion: 'Check for balanced quotes in the script'
                });
            }

            return {
                valid: errors.length === 0,
                errors,
                warnings
            };

        } catch (error) {
            errors.push({
                type: 'error',
                category: 'syntax',
                severity: 'critical',
                message: `Syntax validation error: ${(error as Error).message}`,
                suggestion: 'Please check the script syntax'
            });

            return { valid: false, errors, warnings };
        }
    }

    private async analyzeDependencies(script: string, _connection: DotNetConnectionInfo): Promise<DependencyAnalysis> {
        const issues: ValidationIssue[] = [];
        const affectedObjects: string[] = [];
        const brokenDependencies: string[] = [];
        const newDependencies: string[] = [];
        const circularDependencies: string[] = [];

        try {
            // Extract object names from script (simplified parsing)
            const objectPatterns = [
                { pattern: /CREATE\s+TABLE\s+(\w+)/gi, type: 'table' },
                { pattern: /ALTER\s+TABLE\s+(\w+)/gi, type: 'table' },
                { pattern: /DROP\s+TABLE\s+(\w+)/gi, type: 'table' },
                { pattern: /CREATE\s+VIEW\s+(\w+)/gi, type: 'view' },
                { pattern: /CREATE\s+INDEX\s+(\w+)/gi, type: 'index' },
                { pattern: /CREATE\s+FUNCTION\s+(\w+)/gi, type: 'function' }
            ];

            objectPatterns.forEach(({ pattern, type }) => {
                let match;
                while ((match = pattern.exec(script)) !== null) {
                    affectedObjects.push(`${type}:${match[1]}`);
                }
            });

            // Check for potential dependency issues
            if (script.includes('DROP TABLE') && script.includes('FOREIGN KEY')) {
                issues.push({
                    type: 'warning',
                    category: 'dependency',
                    severity: 'high',
                    message: 'Dropping tables with foreign key relationships may cause dependency issues',
                    suggestion: 'Check foreign key constraints before dropping tables'
                });
            }

            // Check for circular dependencies (simplified)
            const createMatches = script.match(/CREATE\s+\w+/g) || [];
            const alterMatches = script.match(/ALTER\s+\w+/g) || [];

            if (createMatches.length > 10 || alterMatches.length > 20) {
                issues.push({
                    type: 'info',
                    category: 'dependency',
                    severity: 'low',
                    message: 'Large number of object modifications detected',
                    suggestion: 'Consider breaking the migration into smaller chunks'
                });
            }

            return {
                affectedObjects,
                brokenDependencies,
                newDependencies,
                circularDependencies,
                issues
            };

        } catch (error) {
            issues.push({
                type: 'error',
                category: 'dependency',
                severity: 'medium',
                message: `Dependency analysis error: ${(error as Error).message}`,
                suggestion: 'Manual review of dependencies may be required'
            });

            return {
                affectedObjects,
                brokenDependencies,
                newDependencies,
                circularDependencies,
                issues
            };
        }
    }

    private async analyzeDataImpact(
        script: string,
        _connection: DotNetConnectionInfo,
        _options: ValidationOptions
    ): Promise<DataImpactAnalysis> {
        const issues: ValidationIssue[] = [];
        let dataLossPotential = false;
        const dataTypeChanges: DataTypeChange[] = [];
        const constraintViolations: string[] = [];

        try {
            // Check for data loss operations
            if (script.match(/DROP\s+TABLE|TRUNCATE\s+TABLE|DELETE\s+FROM\s+\w+\s*$/i)) {
                dataLossPotential = true;
                issues.push({
                    type: 'warning',
                    category: 'data_loss',
                    severity: 'critical',
                    message: 'Migration script contains operations that may cause data loss',
                    suggestion: 'Ensure you have a backup before proceeding'
                });
            }

            // Check for data type changes
            const typeChangePatterns = [
                /ALTER\s+COLUMN\s+(\w+)\s+TYPE\s+(\w+)/gi,
                /MODIFY\s+COLUMN\s+(\w+)\s+(\w+)/gi
            ];

            typeChangePatterns.forEach(pattern => {
                let match;
                while ((match = pattern.exec(script)) !== null) {
                    dataTypeChanges.push({
                        tableName: 'unknown', // Would need better parsing
                        columnName: match[1],
                        oldType: 'unknown',
                        newType: match[2],
                        conversionRisk: 'medium'
                    });
                }
            });

            // Check for constraint violations
            if (script.includes('NOT NULL') && !script.includes('DEFAULT')) {
                issues.push({
                    type: 'warning',
                    category: 'data_loss',
                    severity: 'high',
                    message: 'Adding NOT NULL constraint without DEFAULT may fail on existing data',
                    suggestion: 'Add appropriate DEFAULT values or update existing NULL values first'
                });
            }

            return {
                tablesAffected: (script.match(/TABLE\s+\w+/gi) || []).length,
                rowsAffected: 0, // Would need query analysis
                dataLossPotential,
                dataTypeChanges,
                constraintViolations,
                issues
            };

        } catch (error) {
            issues.push({
                type: 'error',
                category: 'data_loss',
                severity: 'medium',
                message: `Data impact analysis error: ${(error as Error).message}`,
                suggestion: 'Manual review of data impact may be required'
            });

            return {
                tablesAffected: 0,
                rowsAffected: 0,
                dataLossPotential: false,
                dataTypeChanges: [],
                constraintViolations: [],
                issues
            };
        }
    }

    private async analyzePermissions(script: string, _connection: DotNetConnectionInfo): Promise<PermissionAnalysis> {
        const issues: ValidationIssue[] = [];
        const requiredPermissions: string[] = [];
        const missingPermissions: string[] = [];
        const excessivePermissions: string[] = [];

        try {
            // Analyze required permissions based on operations
            if (script.match(/CREATE\s+TABLE|DROP\s+TABLE|ALTER\s+TABLE/i)) {
                requiredPermissions.push('CREATE', 'DROP', 'ALTER');
            }

            if (script.match(/CREATE\s+DATABASE|DROP\s+DATABASE/i)) {
                requiredPermissions.push('SUPERUSER');
                issues.push({
                    type: 'warning',
                    category: 'permission',
                    severity: 'high',
                    message: 'Database-level operations require superuser privileges',
                    suggestion: 'Ensure the connection user has appropriate superuser privileges'
                });
            }

            if (script.match(/CREATE\s+USER|DROP\s+USER|ALTER\s+USER/i)) {
                requiredPermissions.push('CREATEROLE');
            }

            return {
                requiredPermissions,
                missingPermissions,
                excessivePermissions,
                issues
            };

        } catch (error) {
            issues.push({
                type: 'error',
                category: 'permission',
                severity: 'medium',
                message: `Permission analysis error: ${(error as Error).message}`,
                suggestion: 'Manual review of required permissions may be required'
            });

            return {
                requiredPermissions: [],
                missingPermissions: [],
                excessivePermissions: [],
                issues
            };
        }
    }

    private async analyzePerformanceImpact(script: string, _connection: DotNetConnectionInfo): Promise<PerformanceImpact> {
        const issues: ValidationIssue[] = [];

        try {
            let estimatedDuration = 0;
            let indexRebuilds = 0;
            let lockDuration = 0;

            // Estimate duration based on operations
            if (script.match(/CREATE\s+INDEX|DROP\s+INDEX/gi)) {
                indexRebuilds = (script.match(/CREATE\s+INDEX|DROP\s+INDEX/gi) || []).length;
                estimatedDuration += indexRebuilds * 30; // 30 seconds per index
                lockDuration += indexRebuilds * 10; // 10 seconds lock per index
            }

            if (script.match(/ALTER\s+TABLE.*ADD\s+COLUMN/gi)) {
                estimatedDuration += 60; // 1 minute for adding columns
                lockDuration += 30; // 30 seconds lock
            }

            if (script.match(/DROP\s+TABLE/gi)) {
                estimatedDuration += 10; // 10 seconds for table drop
            }

            // Determine impact levels
            const cpuImpact = estimatedDuration > 300 ? 'high' : estimatedDuration > 60 ? 'medium' : 'low';
            const ioImpact = indexRebuilds > 5 ? 'high' : indexRebuilds > 2 ? 'medium' : 'low';
            const memoryImpact = script.length > 10000 ? 'high' : script.length > 5000 ? 'medium' : 'low';

            if (estimatedDuration > 300) {
                issues.push({
                    type: 'warning',
                    category: 'performance',
                    severity: 'medium',
                    message: `Migration estimated to take ${Math.round(estimatedDuration / 60)} minutes`,
                    suggestion: 'Consider running during maintenance window'
                });
            }

            return {
                estimatedDuration,
                cpuImpact,
                ioImpact,
                memoryImpact,
                indexRebuilds,
                lockDuration,
                issues
            };

        } catch (error) {
            issues.push({
                type: 'error',
                category: 'performance',
                severity: 'medium',
                message: `Performance analysis error: ${(error as Error).message}`,
                suggestion: 'Manual review of performance impact may be required'
            });

            return {
                estimatedDuration: 0,
                cpuImpact: 'low',
                ioImpact: 'low',
                memoryImpact: 'low',
                indexRebuilds: 0,
                lockDuration: 0,
                issues
            };
        }
    }

    private generateRecommendations(
        issues: ValidationIssue[],
        _syntax: SyntaxValidation,
        dependencies: DependencyAnalysis,
        dataImpact: DataImpactAnalysis,
        permissions: PermissionAnalysis,
        performance: PerformanceImpact
    ): string[] {
        const recommendations: string[] = [];

        // Critical issues
        const criticalIssues = issues.filter(i => i.severity === 'critical');
        if (criticalIssues.length > 0) {
            recommendations.push('⚠️ Address all critical issues before proceeding');
        }

        // Data loss warnings
        if (dataImpact.dataLossPotential) {
            recommendations.push('💾 Ensure you have a recent backup before proceeding');
            recommendations.push('🔍 Review all data loss warnings carefully');
        }

        // Performance recommendations
        if (performance.estimatedDuration > 300) {
            recommendations.push('⏰ Consider running during maintenance window');
        }

        if (performance.indexRebuilds > 0) {
            recommendations.push('🔧 Index rebuilds detected - expect table locks');
        }

        // Permission recommendations
        if (permissions.missingPermissions.length > 0) {
            recommendations.push('🔐 Ensure user has required permissions: ' + permissions.missingPermissions.join(', '));
        }

        // Dependency recommendations
        if (dependencies.brokenDependencies.length > 0) {
            recommendations.push('🔗 Review broken dependencies: ' + dependencies.brokenDependencies.join(', '));
        }

        // General recommendations
        if (issues.length > 10) {
            recommendations.push('📋 Consider breaking migration into smaller chunks');
        }

        recommendations.push('✅ Run in dry-run mode first to verify results');

        return recommendations;
    }

    private calculateValidationSummary(issues: ValidationIssue[]): ValidationSummary {
        const totalChecks = issues.length;
        const failedChecks = issues.filter(i => i.type === 'error').length;
        const warningChecks = issues.filter(i => i.type === 'warning').length;
        const passedChecks = totalChecks - failedChecks - warningChecks;
        const criticalIssues = issues.filter(i => i.severity === 'critical').length;

        return {
            totalChecks,
            passedChecks,
            failedChecks,
            warningChecks,
            criticalIssues,
            dataLossRisk: issues.some(i => i.category === 'data_loss'),
            breakingChanges: issues.some(i => i.category === 'dependency' && i.severity === 'high')
        };
    }

    private createEmptyValidationDetails(): ValidationDetails {
        return {
            syntaxValidation: { valid: false, errors: [], warnings: [] },
            dependencyAnalysis: { affectedObjects: [], brokenDependencies: [], newDependencies: [], circularDependencies: [], issues: [] },
            dataImpactAnalysis: { tablesAffected: 0, rowsAffected: 0, dataLossPotential: false, dataTypeChanges: [], constraintViolations: [], issues: [] },
            permissionAnalysis: { requiredPermissions: [], missingPermissions: [], excessivePermissions: [], issues: [] },
            performanceImpact: { estimatedDuration: 0, cpuImpact: 'low', ioImpact: 'low', memoryImpact: 'low', indexRebuilds: 0, lockDuration: 0, issues: [] }
        };
    }

    private showValidationResults(result: ValidationResult): void {
        const statusIcon = result.status === 'passed' ? '✅' :
                          result.status === 'warning' ? '⚠️' : '❌';

        let message = `${statusIcon} Migration validation ${result.status}`;

        if (result.summary.criticalIssues > 0) {
            message += ` (${result.summary.criticalIssues} critical issues)`;
        }

        vscode.window.showInformationMessage(message, 'View Details', 'Export Report').then(selection => {
            if (selection === 'View Details') {
                this.showValidationDetails(result);
            } else if (selection === 'Export Report') {
                this.exportValidationReport(result);
            }
        });
    }

    private showValidationDetails(result: ValidationResult): void {
        const panel = vscode.window.createWebviewPanel(
            'migrationValidation',
            'Migration Validation Results',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        panel.webview.html = this.generateValidationHtml(result);
    }

    private generateValidationHtml(result: ValidationResult): string {
        const issuesByCategory = this.groupIssuesByCategory(result.issues);

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Migration Validation Results</title>
                <style>
                    body { font-family: var(--vscode-font-family); padding: 20px; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); }
                    .header { background: var(--vscode-textBlockQuote-background); padding: 15px; border-radius: 4px; margin-bottom: 20px; }
                    .status { font-size: 18px; font-weight: bold; margin-bottom: 10px; }
                    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin: 20px 0; }
                    .summary-card { background: var(--vscode-editor-background); padding: 15px; border-radius: 4px; text-align: center; border: 1px solid var(--vscode-panel-border); }
                    .summary-number { font-size: 24px; font-weight: bold; }
                    .issues-section { background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; margin: 20px 0; }
                    .section-header { background: var(--vscode-titleBar-activeBackground); padding: 12px 15px; border-bottom: 1px solid var(--vscode-panel-border); font-weight: bold; }
                    .issue-item { padding: 10px 15px; border-bottom: 1px solid var(--vscode-panel-border); }
                    .issue-item:last-child { border-bottom: none; }
                    .issue-severity { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: bold; text-transform: uppercase; }
                    .severity-critical { background: var(--vscode-gitDecoration-deletedResourceForeground); }
                    .severity-high { background: var(--vscode-gitDecoration-modifiedResourceForeground); }
                    .severity-medium { background: var(--vscode-gitDecoration-renamedResourceForeground); }
                    .severity-low { background: var(--vscode-panel-border); }
                    .recommendations { background: var(--vscode-textBlockQuote-background); padding: 15px; border-radius: 4px; margin-top: 20px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="status">${result.status === 'passed' ? '✅' : result.status === 'warning' ? '⚠️' : '❌'} Validation ${result.status}</div>
                    <div>Completed in ${result.executionTime}ms • ${result.summary.totalChecks} checks performed</div>
                </div>

                <div class="summary">
                    <div class="summary-card">
                        <div class="summary-number" style="color: var(--vscode-gitDecoration-addedResourceForeground);">${result.summary.passedChecks}</div>
                        <div>Passed</div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-number" style="color: var(--vscode-gitDecoration-renamedResourceForeground);">${result.summary.warningChecks}</div>
                        <div>Warnings</div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-number" style="color: var(--vscode-gitDecoration-deletedResourceForeground);">${result.summary.failedChecks}</div>
                        <div>Failed</div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-number">${result.summary.criticalIssues}</div>
                        <div>Critical</div>
                    </div>
                </div>

                ${Object.keys(issuesByCategory).length > 0 ? `
                    <div class="issues-section">
                        <div class="section-header">Issues Found</div>
                        ${Object.entries(issuesByCategory).map(([category, categoryIssues]) => `
                            <div class="category-section">
                                <h4>${category}</h4>
                                ${categoryIssues.map(issue => `
                                    <div class="issue-item">
                                        <div class="issue-severity severity-${issue.severity}">${issue.severity}</div>
                                        <div class="issue-message">${issue.message}</div>
                                        ${issue.suggestion ? `<div class="issue-suggestion">💡 ${issue.suggestion}</div>` : ''}
                                    </div>
                                `).join('')}
                            </div>
                        `).join('')}
                    </div>
                ` : ''}

                ${result.recommendations.length > 0 ? `
                    <div class="recommendations">
                        <h3>Recommendations</h3>
                        <ul>
                            ${result.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
            </body>
            </html>
        `;
    }

    private groupIssuesByCategory(issues: ValidationIssue[]): Record<string, ValidationIssue[]> {
        return issues.reduce((acc, issue) => {
            if (!acc[issue.category]) {
                acc[issue.category] = [];
            }
            acc[issue.category].push(issue);
            return acc;
        }, {} as Record<string, ValidationIssue[]>);
    }

    private async exportValidationReport(result: ValidationResult): Promise<void> {
        try {
            const report = {
                validationId: result.validationId,
                timestamp: new Date().toISOString(),
                status: result.status,
                executionTime: result.executionTime,
                summary: result.summary,
                issues: result.issues,
                recommendations: result.recommendations,
                details: result.details
            };

            const uri = await vscode.window.showSaveDialog({
                filters: {
                    'JSON Files': ['json'],
                    'All Files': ['*']
                },
                defaultUri: vscode.Uri.file(`migration-validation-${new Date().toISOString().split('T')[0]}.json`)
            });

            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(report, null, 2), 'utf8'));
                vscode.window.showInformationMessage('Validation report exported successfully');
            }
        } catch (error) {
            Logger.error('Failed to export validation report', error as Error);
            vscode.window.showErrorMessage('Failed to export validation report');
        }
    }

    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    getActiveValidations(): string[] {
        return Array.from(this.activeValidations.keys());
    }

    getValidationHistory(limit: number = 50): ValidationResult[] {
        return this.validationHistory.slice(0, limit);
    }

    dispose(): void {
        this.activeValidations.clear();
        this.validationHistory = [];
    }
}