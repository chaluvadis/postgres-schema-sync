import * as vscode from 'vscode';
import { ConnectionManager } from '@/managers/ConnectionManager';
import { DotNetIntegrationService } from '@/services/DotNetIntegrationService';
import { Logger } from '@/utils/Logger';

export interface ValidationRule {
    id: string;
    name: string;
    description: string;
    type: 'format' | 'constraint' | 'business' | 'custom';
    severity: 'error' | 'warning' | 'info';
    enabled: boolean;
    configuration: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}

export interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
    summary: {
        totalRows: number;
        validRows: number;
        errorRows: number;
        warningRows: number;
        processingTime: number;
    };
    recommendations: string[];
}

export interface ValidationError {
    rowNumber: number;
    columnName?: string;
    ruleId: string;
    ruleName: string;
    message: string;
    severity: 'error' | 'warning';
    suggestedFix?: string;
}

export interface ValidationWarning {
    rowNumber: number;
    columnName?: string;
    ruleId: string;
    ruleName: string;
    message: string;
    severity: 'warning' | 'info';
}

export interface DataQualityReport {
    id: string;
    name: string;
    tableName: string;
    schemaName: string;
    connectionId: string;
    generatedAt: Date;
    summary: {
        totalRows: number;
        totalColumns: number;
        completeness: number;
        accuracy: number;
        consistency: number;
        validity: number;
        uniqueness: number;
        timeliness: number;
        overallScore: number;
    };
    columnAnalysis: ColumnQualityMetrics[];
    issues: DataQualityIssue[];
    recommendations: string[];
}

export interface ColumnQualityMetrics {
    columnName: string;
    dataType: string;
    completeness: number; // Percentage of non-null values
    uniqueness: number; // Percentage of unique values
    validity: number; // Percentage of values passing validation rules
    consistency: number; // Consistency with expected patterns
    minLength?: number;
    maxLength?: number;
    averageLength?: number;
    distinctValues?: number;
    nullCount: number;
    emptyCount: number;
    sampleValues: string[];
}

export interface DataQualityIssue {
    type: 'completeness' | 'accuracy' | 'consistency' | 'validity' | 'uniqueness' | 'timeliness';
    severity: 'low' | 'medium' | 'high' | 'critical';
    columnName?: string;
    description: string;
    affectedRows: number;
    suggestedAction: string;
}

export class DataValidationService {
    private context: vscode.ExtensionContext;
    private connectionManager: ConnectionManager;
    private dotNetService: DotNetIntegrationService;
    private validationRules: Map<string, ValidationRule> = new Map();
    private validationHistory: Map<string, ValidationResult> = new Map();

    constructor(
        context: vscode.ExtensionContext,
        connectionManager: ConnectionManager
    ) {
        this.context = context;
        this.connectionManager = connectionManager;
        this.dotNetService = DotNetIntegrationService.getInstance();
        this.loadValidationRules();
    }

    private loadValidationRules(): void {
        try {
            // Load validation rules
            const rulesData = this.context.globalState.get<string>('postgresql.validation.rules', '[]');
            const rules = JSON.parse(rulesData) as ValidationRule[];

            this.validationRules.clear();
            rules.forEach(rule => {
                this.validationRules.set(rule.id, {
                    ...rule,
                    createdAt: new Date(rule.createdAt),
                    updatedAt: new Date(rule.updatedAt)
                });
            });

            // Create default validation rules if none exist
            if (this.validationRules.size === 0) {
                this.createDefaultValidationRules();
            }

            Logger.info('Validation rules loaded', 'loadValidationRules', {
                ruleCount: this.validationRules.size
            });

        } catch (error) {
            Logger.error('Failed to load validation rules', error as Error);
            this.createDefaultValidationRules();
        }
    }

    private createDefaultValidationRules(): void {
        const defaultRules: Omit<ValidationRule, 'id' | 'createdAt' | 'updatedAt'>[] = [
            {
                name: 'Required Field Check',
                description: 'Ensure required fields are not null or empty',
                type: 'constraint',
                severity: 'error',
                enabled: true,
                configuration: {
                    requiredColumns: []
                }
            },
            {
                name: 'Data Type Validation',
                description: 'Validate data types match expected formats',
                type: 'format',
                severity: 'error',
                enabled: true,
                configuration: {
                    typeMappings: {}
                }
            },
            {
                name: 'Email Format Check',
                description: 'Validate email addresses have correct format',
                type: 'format',
                severity: 'warning',
                enabled: true,
                configuration: {
                    emailColumns: []
                }
            },
            {
                name: 'Phone Number Format',
                description: 'Validate phone numbers have correct format',
                type: 'format',
                severity: 'warning',
                enabled: true,
                configuration: {
                    phoneColumns: [],
                    formatPattern: '^\\+?[1-9]\\d{1,14}$'
                }
            },
            {
                name: 'Duplicate Detection',
                description: 'Identify duplicate records',
                type: 'business',
                severity: 'warning',
                enabled: true,
                configuration: {
                    duplicateColumns: []
                }
            },
            {
                name: 'Date Range Validation',
                description: 'Ensure dates fall within acceptable ranges',
                type: 'constraint',
                severity: 'error',
                enabled: true,
                configuration: {
                    dateColumns: [],
                    minDate: '1900-01-01',
                    maxDate: '2100-12-31'
                }
            }
        ];

        defaultRules.forEach(ruleData => {
            const rule: ValidationRule = {
                ...ruleData,
                id: this.generateId(),
                createdAt: new Date(),
                updatedAt: new Date()
            };
            this.validationRules.set(rule.id, rule);
        });

        this.saveValidationRules();
        Logger.info('Default validation rules created', 'createDefaultValidationRules');
    }

    private saveValidationRules(): void {
        try {
            const rulesArray = Array.from(this.validationRules.values());
            this.context.globalState.update('postgresql.validation.rules', JSON.stringify(rulesArray));
            Logger.info('Validation rules saved', 'saveValidationRules');
        } catch (error) {
            Logger.error('Failed to save validation rules', error as Error);
        }
    }

    // Validation Rule Management
    async createValidationRule(ruleData: Omit<ValidationRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<ValidationRule> {
        try {
            const rule: ValidationRule = {
                ...ruleData,
                id: this.generateId(),
                createdAt: new Date(),
                updatedAt: new Date()
            };

            this.validationRules.set(rule.id, rule);
            this.saveValidationRules();

            Logger.info('Validation rule created', 'createValidationRule', {
                ruleId: rule.id,
                name: rule.name
            });

            return rule;

        } catch (error) {
            Logger.error('Failed to create validation rule', error as Error);
            throw error;
        }
    }

    async updateValidationRule(ruleId: string, updates: Partial<ValidationRule>): Promise<ValidationRule> {
        try {
            const rule = this.validationRules.get(ruleId);
            if (!rule) {
                throw new Error(`Validation rule ${ruleId} not found`);
            }

            const updatedRule: ValidationRule = {
                ...rule,
                ...updates,
                updatedAt: new Date()
            };

            this.validationRules.set(ruleId, updatedRule);
            this.saveValidationRules();

            Logger.info('Validation rule updated', 'updateValidationRule', {
                ruleId,
                name: updatedRule.name
            });

            return updatedRule;

        } catch (error) {
            Logger.error('Failed to update validation rule', error as Error);
            throw error;
        }
    }

    async deleteValidationRule(ruleId: string): Promise<void> {
        try {
            const rule = this.validationRules.get(ruleId);
            if (!rule) {
                throw new Error(`Validation rule ${ruleId} not found`);
            }

            this.validationRules.delete(ruleId);
            this.saveValidationRules();

            Logger.info('Validation rule deleted', 'deleteValidationRule', {
                ruleId,
                name: rule.name
            });

        } catch (error) {
            Logger.error('Failed to delete validation rule', error as Error);
            throw error;
        }
    }

    getValidationRules(type?: ValidationRule['type']): ValidationRule[] {
        let rules = Array.from(this.validationRules.values());

        if (type) {
            rules = rules.filter(rule => rule.type === type);
        }

        return rules.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }

    // Data Validation
    async validateImportData(
        connectionId: string,
        filePath: string,
        format: 'csv' | 'json' | 'excel',
        options: {
            delimiter?: string;
            hasHeaders?: boolean;
            maxRows?: number;
        } = {}
    ): Promise<ValidationResult> {
        const startTime = Date.now();

        try {
            Logger.info('Starting data validation', 'validateImportData', {
                connectionId,
                filePath,
                format
            });

            // Read file content
            const fs = require('fs').promises;
            const fileContent = await fs.readFile(filePath, 'utf8');

            let rows: any[] = [];
            let totalRows = 0;

            // Parse file based on format
            switch (format) {
                case 'csv':
                    const csvResult = this.parseCSVForValidation(fileContent, options);
                    rows = csvResult.rows;
                    totalRows = csvResult.totalRows;
                    break;

                case 'json':
                    rows = JSON.parse(fileContent);
                    totalRows = rows.length;
                    break;

                case 'excel':
                    // For now, treat as tab-delimited CSV
                    const excelResult = this.parseCSVForValidation(fileContent, { ...options, delimiter: '\t' });
                    rows = excelResult.rows;
                    totalRows = excelResult.totalRows;
                    break;

                default:
                    throw new Error(`Validation not supported for format: ${format}`);
            }

            // Apply row limit for validation
            if (options.maxRows) {
                rows = rows.slice(0, options.maxRows);
            }

            // Run validation rules
            const errors: ValidationError[] = [];
            const warnings: ValidationWarning[] = [];
            const enabledRules = this.getValidationRules().filter(rule => rule.enabled);

            for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
                const row = rows[rowIndex];
                const rowNumber = rowIndex + 1;

                for (const rule of enabledRules) {
                    const ruleResults = await this.applyValidationRule(rule, row, rowNumber);
                    errors.push(...ruleResults.errors);
                    warnings.push(...ruleResults.warnings);
                }
            }

            const processingTime = Date.now() - startTime;

            const result: ValidationResult = {
                isValid: errors.length === 0,
                errors,
                warnings,
                summary: {
                    totalRows,
                    validRows: rows.length - errors.length,
                    errorRows: errors.length,
                    warningRows: warnings.length,
                    processingTime
                },
                recommendations: this.generateValidationRecommendations(errors, warnings)
            };

            // Store validation result
            this.validationHistory.set(this.generateId(), result);

            Logger.info('Data validation completed', 'validateImportData', {
                totalRows,
                validRows: result.summary.validRows,
                errorCount: errors.length,
                warningCount: warnings.length,
                processingTime
            });

            return result;

        } catch (error) {
            Logger.error('Failed to validate import data', error as Error);
            throw error;
        }
    }

    private parseCSVForValidation(content: string, options: { delimiter?: string; hasHeaders?: boolean }): {
        rows: any[];
        totalRows: number;
    } {
        const lines = content.split('\n').filter(line => line.trim());
        const delimiter = options.delimiter || ',';

        if (lines.length === 0) {
            return { rows: [], totalRows: 0 };
        }

        let startRow = 0;
        if (options.hasHeaders !== false) {
            startRow = 0; // Headers are in first row
        }

        const headers = lines[startRow].split(delimiter).map(header => header.trim().replace(/"/g, ''));

        const rows = lines.slice(startRow + 1).map((line) => {
            const values = line.split(delimiter).map(val => val.trim().replace(/"/g, ''));
            const row: any = {};

            headers.forEach((header, headerIndex) => {
                row[header] = values[headerIndex] || null;
            });

            return row;
        });

        return {
            rows,
            totalRows: lines.length - startRow - 1
        };
    }

    private async applyValidationRule(
        rule: ValidationRule,
        row: any,
        rowNumber: number
    ): Promise<{
        errors: ValidationError[];
        warnings: ValidationWarning[];
    }> {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        try {
            switch (rule.type) {
                case 'constraint':
                    if (rule.name.includes('Required Field')) {
                        const requiredColumns = rule.configuration.requiredColumns || [];
                        requiredColumns.forEach((columnName: string) => {
                            const value = row[columnName];
                            if (value === null || value === undefined || value === '') {
                                errors.push({
                                    rowNumber,
                                    columnName,
                                    ruleId: rule.id,
                                    ruleName: rule.name,
                                    message: `Required field '${columnName}' is empty`,
                                    severity: 'error',
                                    suggestedFix: `Provide a value for '${columnName}'`
                                });
                            }
                        });
                    }
                    break;

                case 'format':
                    if (rule.name.includes('Email')) {
                        const emailColumns = rule.configuration.emailColumns || [];
                        emailColumns.forEach((columnName: string) => {
                            const value = row[columnName];
                            if (value && !this.isValidEmail(value)) {
                                warnings.push({
                                    rowNumber,
                                    columnName,
                                    ruleId: rule.id,
                                    ruleName: rule.name,
                                    message: `Invalid email format: ${value}`,
                                    severity: 'warning'
                                });
                            }
                        });
                    } else if (rule.name.includes('Phone')) {
                        const phoneColumns = rule.configuration.phoneColumns || [];
                        const pattern = new RegExp(rule.configuration.formatPattern || '^\\+?[1-9]\\d{1,14}$');

                        phoneColumns.forEach((columnName: string) => {
                            const value = row[columnName];
                            if (value && !pattern.test(value)) {
                                warnings.push({
                                    rowNumber,
                                    columnName,
                                    ruleId: rule.id,
                                    ruleName: rule.name,
                                    message: `Invalid phone number format: ${value}`,
                                    severity: 'warning'
                                });
                            }
                        });
                    }
                    break;

                case 'business':
                    if (rule.name.includes('Duplicate')) {
                        // This would require analyzing the entire dataset
                        // For now, we'll skip this complex validation
                    }
                    break;
            }

        } catch (error) {
            Logger.error('Error applying validation rule', error as Error);
        }

        return { errors, warnings };
    }

    private isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    private generateValidationRecommendations(
        errors: ValidationError[],
        warnings: ValidationWarning[]
    ): string[] {
        const recommendations: string[] = [];

        if (errors.length > 0) {
            recommendations.push(`Fix ${errors.length} validation errors before importing`);
        }

        if (warnings.length > 0) {
            recommendations.push(`Review ${warnings.length} warnings that may affect data quality`);
        }

        // Analyze error patterns
        const errorColumns = errors.reduce((acc, error) => {
            if (error.columnName) {
                acc[error.columnName] = (acc[error.columnName] || 0) + 1;
            }
            return acc;
        }, {} as Record<string, number>);

        Object.entries(errorColumns).forEach(([column, count]) => {
            if (count > 10) {
                recommendations.push(`Column '${column}' has ${count} errors - consider reviewing data type or format`);
            }
        });

        return recommendations;
    }

    // Data Quality Analysis
    async analyzeDataQuality(
        connectionId: string,
        schemaName: string,
        tableName: string,
        sampleSize: number = 1000
    ): Promise<DataQualityReport> {
        try {
            Logger.info('Starting data quality analysis', 'analyzeDataQuality', {
                connectionId,
                schemaName,
                tableName,
                sampleSize
            });

            // Get connection and sample data
            const connection = this.connectionManager.getConnection(connectionId);
            if (!connection) {
                throw new Error(`Connection ${connectionId} not found`);
            }

            const password = await this.connectionManager.getConnectionPassword(connectionId);
            if (!password) {
                throw new Error('Connection password not found');
            }

            const dotNetConnection = {
                id: connection.id,
                name: connection.name,
                host: connection.host,
                port: connection.port,
                database: connection.database,
                username: connection.username,
                password: password,
                createdDate: new Date().toISOString()
            };

            // Get table structure and sample data
            const query = `SELECT * FROM "${schemaName}"."${tableName}" LIMIT ${sampleSize}`;
            const result = await this.dotNetService.executeQuery(dotNetConnection, query, {
                maxRows: sampleSize,
                timeout: 60
            });

            // Analyze each column
            const columnAnalysis: ColumnQualityMetrics[] = result.columns.map(col => {
                const columnValues = result.rows.map(row => row[result.columns.indexOf(col)]);

                return this.analyzeColumnQuality(col.name, columnValues);
            });

            // Generate overall quality scores
            const summary = this.calculateOverallQualityScore(columnAnalysis, result.rowCount);

            // Identify issues and recommendations
            const issues = this.identifyDataQualityIssues(columnAnalysis);
            const recommendations = this.generateQualityRecommendations(issues);

            const report: DataQualityReport = {
                id: this.generateId(),
                name: `Data Quality Report: ${schemaName}.${tableName}`,
                tableName,
                schemaName,
                connectionId,
                generatedAt: new Date(),
                summary,
                columnAnalysis,
                issues,
                recommendations
            };

            Logger.info('Data quality analysis completed', 'analyzeDataQuality', {
                reportId: report.id,
                overallScore: summary.overallScore,
                issueCount: issues.length
            });

            return report;

        } catch (error) {
            Logger.error('Failed to analyze data quality', error as Error);
            throw error;
        }
    }

    private analyzeColumnQuality(columnName: string, values: any[]): ColumnQualityMetrics {
        const totalValues = values.length;
        const nullCount = values.filter(val => val === null || val === undefined).length;
        const emptyCount = values.filter(val => val === '').length;
        const nonEmptyValues = values.filter(val => val !== null && val !== undefined && val !== '');

        // Calculate completeness
        const completeness = totalValues > 0 ? ((totalValues - nullCount - emptyCount) / totalValues) * 100 : 0;

        // Calculate uniqueness
        const uniqueValues = new Set(nonEmptyValues.map(val => String(val)));
        const uniqueness = nonEmptyValues.length > 0 ? (uniqueValues.size / nonEmptyValues.length) * 100 : 0;

        // Calculate validity (basic check)
        const validValues = nonEmptyValues.filter(val => {
            const strVal = String(val);
            return strVal.length > 0 && strVal.length < 1000; // Basic validity check
        });
        const validity = nonEmptyValues.length > 0 ? (validValues.length / nonEmptyValues.length) * 100 : 0;

        // Calculate consistency (check for consistent data types)
        const stringValues = nonEmptyValues.filter(val => typeof val === 'string').length;
        const numberValues = nonEmptyValues.filter(val => typeof val === 'number').length;
        const consistency = nonEmptyValues.length > 0 ?
            Math.max(stringValues, numberValues) / nonEmptyValues.length * 100 : 0;

        // Calculate length statistics for strings
        const stringLengths = nonEmptyValues
            .filter(val => typeof val === 'string')
            .map(val => String(val).length);

        return {
            columnName,
            dataType: this.inferDataType(nonEmptyValues),
            completeness,
            uniqueness,
            validity,
            consistency,
            minLength: stringLengths.length > 0 ? Math.min(...stringLengths) : undefined,
            maxLength: stringLengths.length > 0 ? Math.max(...stringLengths) : undefined,
            averageLength: stringLengths.length > 0 ?
                stringLengths.reduce((sum, len) => sum + len, 0) / stringLengths.length : undefined,
            distinctValues: uniqueValues.size,
            nullCount,
            emptyCount,
            sampleValues: nonEmptyValues.slice(0, 5).map(val => String(val))
        };
    }

    private inferDataType(values: any[]): string {
        if (values.length === 0) return 'unknown';

        const stringCount = values.filter(val => typeof val === 'string').length;
        const numberCount = values.filter(val => typeof val === 'number' && !isNaN(val)).length;
        const dateCount = values.filter(val => {
            const date = new Date(val);
            return !isNaN(date.getTime());
        }).length;

        if (numberCount > stringCount && numberCount > dateCount) return 'number';
        if (dateCount > stringCount && dateCount > numberCount) return 'date';
        return 'string';
    }

    private calculateOverallQualityScore(
        columnAnalysis: ColumnQualityMetrics[],
        totalRows: number
    ): DataQualityReport['summary'] {
        const avgCompleteness = columnAnalysis.reduce((sum, col) => sum + col.completeness, 0) / columnAnalysis.length;
        const avgValidity = columnAnalysis.reduce((sum, col) => sum + col.validity, 0) / columnAnalysis.length;
        const avgConsistency = columnAnalysis.reduce((sum, col) => sum + col.consistency, 0) / columnAnalysis.length;
        const avgUniqueness = columnAnalysis.reduce((sum, col) => sum + col.uniqueness, 0) / columnAnalysis.length;

        // Weighted overall score
        const overallScore = (
            avgCompleteness * 0.3 +
            avgValidity * 0.25 +
            avgConsistency * 0.2 +
            avgUniqueness * 0.15 +
            100 * 0.1 // Timeliness (assume current data is timely)
        );

        return {
            totalRows,
            totalColumns: columnAnalysis.length,
            completeness: avgCompleteness,
            accuracy: avgValidity, // Using validity as proxy for accuracy
            consistency: avgConsistency,
            validity: avgValidity,
            uniqueness: avgUniqueness,
            timeliness: 100, // Assume current data is timely
            overallScore
        };
    }

    private identifyDataQualityIssues(columnAnalysis: ColumnQualityMetrics[]): DataQualityIssue[] {
        const issues: DataQualityIssue[] = [];

        columnAnalysis.forEach(col => {
            // Completeness issues
            if (col.completeness < 80) {
                issues.push({
                    type: 'completeness',
                    severity: col.completeness < 50 ? 'high' : 'medium',
                    columnName: col.columnName,
                    description: `Column '${col.columnName}' has low completeness (${col.completeness.toFixed(1)}%)`,
                    affectedRows: Math.round((1 - col.completeness / 100) * 1000), // Estimate
                    suggestedAction: 'Review data collection process or consider making column nullable'
                });
            }

            // Validity issues
            if (col.validity < 90) {
                issues.push({
                    type: 'validity',
                    severity: col.validity < 70 ? 'high' : 'medium',
                    columnName: col.columnName,
                    description: `Column '${col.columnName}' has low validity (${col.validity.toFixed(1)}%)`,
                    affectedRows: Math.round((1 - col.validity / 100) * 1000),
                    suggestedAction: 'Review data validation rules and data entry processes'
                });
            }

            // Consistency issues
            if (col.consistency < 80) {
                issues.push({
                    type: 'consistency',
                    severity: 'medium',
                    columnName: col.columnName,
                    description: `Column '${col.columnName}' has inconsistent data types`,
                    affectedRows: Math.round((1 - col.consistency / 100) * 1000),
                    suggestedAction: 'Standardize data entry format or add data type constraints'
                });
            }
        });

        return issues;
    }

    private generateQualityRecommendations(issues: DataQualityIssue[]): string[] {
        const recommendations: string[] = [];

        const completenessIssues = issues.filter(issue => issue.type === 'completeness');
        if (completenessIssues.length > 0) {
            recommendations.push(`Address data completeness issues in ${completenessIssues.length} columns`);
        }

        const validityIssues = issues.filter(issue => issue.type === 'validity');
        if (validityIssues.length > 0) {
            recommendations.push(`Improve data validation for ${validityIssues.length} columns`);
        }

        const highSeverityIssues = issues.filter(issue => issue.severity === 'high' || issue.severity === 'critical');
        if (highSeverityIssues.length > 0) {
            recommendations.push(`Prioritize fixing ${highSeverityIssues.length} high-severity data quality issues`);
        }

        return recommendations;
    }

    // Export Validation
    async validateExportData(
        connectionId: string,
        query: string,
        format: 'csv' | 'json' | 'excel',
        options: {
            maxRows?: number;
            sampleSize?: number;
        } = {}
    ): Promise<ValidationResult> {
        try {
            Logger.info('Starting export data validation', 'validateExportData', {
                connectionId,
                format,
                queryLength: query.length
            });

            // Get sample data for validation
            const connection = this.connectionManager.getConnection(connectionId);
            if (!connection) {
                throw new Error(`Connection ${connectionId} not found`);
            }

            const password = await this.connectionManager.getConnectionPassword(connectionId);
            if (!password) {
                throw new Error('Connection password not found');
            }

            const dotNetConnection = {
                id: connection.id,
                name: connection.name,
                host: connection.host,
                port: connection.port,
                database: connection.database,
                username: connection.username,
                password: password,
                createdDate: new Date().toISOString()
            };

            // Get sample data
            const sampleQuery = options.sampleSize ?
                `${query} LIMIT ${options.sampleSize}` : query;

            const queryResult = await this.dotNetService.executeQuery(dotNetConnection, sampleQuery, {
                maxRows: options.sampleSize || 1000,
                timeout: 60
            });

            // Validate export format compatibility
            const errors: ValidationError[] = [];
            const warnings: ValidationWarning[] = [];

            // Check for data that might cause export issues
            queryResult.rows.forEach((row, index) => {
                const rowNumber = index + 1;

                queryResult.columns.forEach((col, colIndex) => {
                    const value = row[colIndex];

                    // Check for very long values that might cause issues
                    if (value && String(value).length > 10000) {
                        warnings.push({
                            rowNumber,
                            columnName: col.name,
                            ruleId: 'export-length-check',
                            ruleName: 'Export Length Check',
                            message: `Very long value (${String(value).length} characters) may cause export issues`,
                            severity: 'warning'
                        });
                    }

                    // Check for special characters that might need escaping
                    if (value && String(value).includes('\n')) {
                        warnings.push({
                            rowNumber,
                            columnName: col.name,
                            ruleId: 'export-newline-check',
                            ruleName: 'Export Newline Check',
                            message: 'Value contains newline characters',
                            severity: 'info'
                        });
                    }
                });
            });

            const validationResult: ValidationResult = {
                isValid: errors.length === 0,
                errors,
                warnings,
                summary: {
                    totalRows: queryResult.rowCount,
                    validRows: queryResult.rowCount - errors.length,
                    errorRows: errors.length,
                    warningRows: warnings.length,
                    processingTime: 0 // Would be calculated
                },
                recommendations: this.generateExportRecommendations(errors, warnings, format)
            };

            Logger.info('Export data validation completed', 'validateExportData', {
                totalRows: validationResult.summary.totalRows,
                errorCount: errors.length,
                warningCount: warnings.length
            });

            return validationResult;

        } catch (error) {
            Logger.error('Failed to validate export data', error as Error);
            throw error;
        }
    }

    private generateExportRecommendations(
        errors: ValidationError[],
        warnings: ValidationWarning[],
        format: string
    ): string[] {
        const recommendations: string[] = [];

        if (errors.length > 0) {
            recommendations.push(`Fix ${errors.length} validation errors before exporting`);
        }

        if (warnings.length > 0) {
            recommendations.push(`Review ${warnings.length} warnings that may affect export quality`);
        }

        // Format-specific recommendations
        if (format === 'csv') {
            const newlineWarnings = warnings.filter(w => w.ruleName === 'Export Newline Check');
            if (newlineWarnings.length > 0) {
                recommendations.push('CSV export: Consider cleaning newline characters or use quoted fields');
            }
        }

        return recommendations;
    }

    // Utility Methods
    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    getValidationHistory(limit: number = 50): ValidationResult[] {
        return Array.from(this.validationHistory.values()).slice(0, limit);
    }

    dispose(): void {
        this.saveValidationRules();
    }
}