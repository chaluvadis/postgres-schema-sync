import * as vscode from 'vscode';
import { ConnectionManager } from '@/managers/ConnectionManager';
import { DotNetIntegrationService } from '@/services/DotNetIntegrationService';
import { ExtensionInitializer } from '@/utils/ExtensionInitializer';
import { Logger } from '@/utils/Logger';

export interface ImportJob {
    id: string;
    name: string;
    connectionId: string;
    filePath: string;
    format: 'csv' | 'json' | 'excel' | 'sql' | 'parquet';
    targetTable?: string;
    targetSchema?: string;
    options: ImportOptions;
    status: 'pending' | 'analyzing' | 'validating' | 'importing' | 'completed' | 'failed' | 'cancelled';
    progress: number;
    totalRows?: number;
    importedRows?: number;
    skippedRows?: number;
    errorRows?: number;
    errors: ImportError[];
    warnings: ImportWarning[];
    startedAt?: Date;
    completedAt?: Date;
    previewData?: any[];
    detectedColumns?: DetectedColumn[];
    mapping?: ColumnMapping[];
}

export interface ImportOptions {
    delimiter?: string;
    hasHeaders?: boolean;
    encoding?: 'utf8' | 'utf16' | 'ascii';
    skipRows?: number;
    maxRows?: number;
    batchSize?: number;
    continueOnError?: boolean;
    validateData?: boolean;
    transformData?: DataTransformation[];
    createTable?: boolean;
    truncateTable?: boolean;
    updateExisting?: boolean;
    conflictResolution?: 'skip' | 'update' | 'error';
    schedule?: ImportSchedule;
    advancedValidation?: AdvancedValidationOptions;
    dataQualityChecks?: DataQualityCheck[];
    previewMode?: boolean;
    dryRun?: boolean;
}

export interface AdvancedValidationOptions {
    checkDuplicates?: boolean;
    checkForeignKeys?: boolean;
    checkReferentialIntegrity?: boolean;
    validateBusinessRules?: boolean;
    customValidationRules?: CustomValidationRule[];
}

export interface CustomValidationRule {
    name: string;
    description: string;
    rule: string;
    severity: 'error' | 'warning' | 'info';
}

export interface DataQualityCheck {
    type: 'completeness' | 'uniqueness' | 'validity' | 'accuracy' | 'consistency';
    columnName: string;
    threshold: number;
    action: 'error' | 'warning' | 'log';
}

export interface DataTransformation {
    type: 'column_rename' | 'data_type_conversion' | 'value_mapping' | 'conditional_logic' | 'formula';
    sourceColumn: string;
    targetColumn?: string;
    configuration: Record<string, any>;
}

export interface ImportSchedule {
    frequency: 'once' | 'daily' | 'weekly' | 'monthly';
    time?: string;
    enabled: boolean;
    nextRun?: Date;
}

export interface ImportError {
    rowNumber: number;
    columnName?: string;
    errorType: 'validation' | 'conversion' | 'constraint' | 'duplicate' | 'format';
    message: string;
    severity: 'error' | 'warning';
}

export interface ImportWarning {
    rowNumber: number;
    columnName?: string;
    warningType: 'data_truncation' | 'type_mismatch' | 'null_value' | 'format_issue';
    message: string;
}

export interface DetectedColumn {
    name: string;
    type: 'string' | 'number' | 'date' | 'boolean' | 'unknown';
    nullable: boolean;
    sampleValues: string[];
    maxLength?: number;
    format?: string;
}

export interface ColumnMapping {
    sourceColumn: string;
    targetColumn: string;
    dataType: string;
    nullable: boolean;
    defaultValue?: string;
    transformation?: string;
}

export interface DataQualityReport {
    overallScore: number;
    completeness: ColumnQualityMetric[];
    uniqueness: ColumnQualityMetric[];
    validity: ColumnQualityMetric[];
    consistency: ColumnQualityMetric[];
    issues: DataQualityIssue[];
    recommendations: string[];
}

export interface ColumnQualityMetric {
    columnName: string;
    score: number;
    totalValues: number;
    validValues: number;
    nullValues: number;
    uniqueValues: number;
}

export interface DataQualityIssue {
    type: 'missing_data' | 'duplicate_data' | 'invalid_format' | 'inconsistent_format' | 'outlier';
    columnName: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    affectedRows: number;
    suggestion: string;
}

export interface ValidationIssue {
    type: 'error' | 'warning' | 'info';
    category: 'data_quality' | 'format' | 'constraint' | 'business_rule';
    columnName?: string;
    rowNumber?: number;
    message: string;
    suggestion?: string;
}

export interface ImportTemplate {
    id: string;
    name: string;
    description: string;
    sourceFormat: 'csv' | 'json' | 'excel' | 'sql' | 'parquet';
    targetTable: string;
    targetSchema: string;
    options: ImportOptions;
    columnMapping: ColumnMapping[];
    createdAt: Date;
    updatedAt: Date;
    usageCount: number;
    category: string;
    tags: string[];
}

export class DataImportService {
    private context: vscode.ExtensionContext;
    private connectionManager: ConnectionManager;
    private dotNetService: DotNetIntegrationService;
    private importJobs: Map<string, ImportJob> = new Map();
    private importTemplates: Map<string, ImportTemplate> = new Map();
    private activeImports: Set<string> = new Set();
    private importHistory: ImportJob[] = [];

    constructor(
        context: vscode.ExtensionContext,
        connectionManager: ConnectionManager
    ) {
        this.context = context;
        this.connectionManager = connectionManager;
        this.dotNetService = DotNetIntegrationService.getInstance();
        this.loadImportData();
    }

    private loadImportData(): void {
        try {
            // Load import templates
            const templatesData = this.context.globalState.get<string>('postgresql.imports.templates', '[]');
            const templates = JSON.parse(templatesData) as ImportTemplate[];

            this.importTemplates.clear();
            templates.forEach(template => {
                this.importTemplates.set(template.id, {
                    ...template,
                    createdAt: new Date(template.createdAt),
                    updatedAt: new Date(template.updatedAt)
                });
            });

            // Load import history
            const historyData = this.context.globalState.get<string>('postgresql.imports.history', '[]');
            const history = JSON.parse(historyData) as ImportJob[];

            this.importHistory = history.map(job => ({
                ...job,
                startedAt: job.startedAt ? new Date(job.startedAt) : undefined,
                completedAt: job.completedAt ? new Date(job.completedAt) : undefined
            })).slice(0, 100);

            Logger.info('Import data loaded', 'loadImportData', {
                templateCount: this.importTemplates.size,
                historyCount: this.importHistory.length
            });

        } catch (error) {
            Logger.error('Failed to load import data', error as Error);
            this.importTemplates.clear();
            this.importHistory = [];
        }
    }

    private saveImportData(): void {
        try {
            // Save import templates
            const templatesArray = Array.from(this.importTemplates.values());
            this.context.globalState.update('postgresql.imports.templates', JSON.stringify(templatesArray));

            // Save import history
            this.context.globalState.update('postgresql.imports.history', JSON.stringify(this.importHistory));

            Logger.info('Import data saved', 'saveImportData');

        } catch (error) {
            Logger.error('Failed to save import data', error as Error);
        }
    }

    // Import Job Management
    async createImportJob(
        name: string,
        connectionId: string,
        filePath: string,
        format: 'csv' | 'json' | 'excel' | 'sql' | 'parquet',
        options: ImportOptions = {}
    ): Promise<string> {
        try {
            const jobId = this.generateId();

            const importJob: ImportJob = {
                id: jobId,
                name,
                connectionId,
                filePath,
                format,
                options,
                status: 'pending',
                progress: 0,
                errors: [],
                warnings: [],
                startedAt: new Date()
            };

            this.importJobs.set(jobId, importJob);
            this.saveImportData();

            Logger.info('Import job created', 'createImportJob', {
                jobId,
                name,
                format,
                filePath
            });

            return jobId;

        } catch (error) {
            Logger.error('Failed to create import job', error as Error);
            throw error;
        }
    }

    async analyzeImportFile(jobId: string): Promise<{
        detectedColumns: DetectedColumn[];
        totalRows: number;
        previewData: any[];
        recommendedMappings: ColumnMapping[];
        dataQualityReport?: DataQualityReport;
        validationIssues?: ValidationIssue[];
    }> {
        try {
            const job = this.importJobs.get(jobId);
            if (!job) {
                throw new Error(`Import job ${jobId} not found`);
            }

            job.status = 'analyzing';
            job.progress = 10;
            this.importJobs.set(jobId, job);

            Logger.info('Analyzing import file', 'analyzeImportFile', { jobId });

            // Read and analyze file
            const fs = require('fs').promises;
            const fileContent = await fs.readFile(job.filePath, 'utf8');

            let detectedColumns: DetectedColumn[] = [];
            let previewData: any[] = [];
            let totalRows = 0;

            switch (job.format) {
                case 'csv':
                    const csvResult = await this.analyzeCSV(fileContent, job.options);
                    detectedColumns = csvResult.columns;
                    previewData = csvResult.preview;
                    totalRows = csvResult.totalRows;
                    break;

                case 'json':
                    const jsonResult = await this.analyzeJSON(fileContent);
                    detectedColumns = jsonResult.columns;
                    previewData = jsonResult.preview;
                    totalRows = jsonResult.totalRows;
                    break;

                case 'excel':
                    const excelResult = await this.analyzeExcel(fileContent);
                    detectedColumns = excelResult.columns;
                    previewData = excelResult.preview;
                    totalRows = excelResult.totalRows;
                    break;

                case 'sql':
                    const sqlResult = await this.analyzeSQL(fileContent);
                    detectedColumns = sqlResult.columns;
                    previewData = sqlResult.preview;
                    totalRows = sqlResult.totalRows;
                    break;

                default:
                    throw new Error(`Unsupported import format: ${job.format}`);
            }

            // Update job with analysis results
            job.detectedColumns = detectedColumns;
            job.previewData = previewData;
            job.totalRows = totalRows;
            job.progress = 25;
            this.importJobs.set(jobId, job);

            // Generate recommended column mappings
            const recommendedMappings = this.generateRecommendedMappings(detectedColumns);

            // Perform data quality analysis if enabled
            let dataQualityReport: DataQualityReport | undefined;
            let validationIssues: ValidationIssue[] = [];

            if (job.options.validateData !== false) {
                const qualityResult = await this.performDataQualityAnalysis(previewData, detectedColumns);
                dataQualityReport = qualityResult.report;
                validationIssues = qualityResult.issues;
            }

            Logger.info('Import file analyzed', 'analyzeImportFile', {
                jobId,
                columnCount: detectedColumns.length,
                totalRows,
                previewRows: previewData.length,
                qualityScore: dataQualityReport?.overallScore
            });

            return {
                detectedColumns,
                totalRows,
                previewData,
                recommendedMappings,
                dataQualityReport,
                validationIssues
            };

        } catch (error) {
            Logger.error('Failed to analyze import file', error as Error);
            throw error;
        }
    }

    private async analyzeCSV(content: string, options: ImportOptions): Promise<{
        columns: DetectedColumn[];
        preview: any[];
        totalRows: number;
    }> {
        const lines = content.split('\n').filter(line => line.trim());
        const delimiter = options.delimiter || ',';

        if (lines.length === 0) {
            return { columns: [], preview: [], totalRows: 0 };
        }

        // Detect headers
        let startRow = 0;
        if (options.hasHeaders !== false) {
            startRow = options.skipRows || 0;
        }

        // Parse header row
        const headerLine = lines[startRow] || lines[0];
        const headers = headerLine.split(delimiter).map(header => header.trim().replace(/"/g, ''));

        // Detect column types from sample data
        const sampleSize = Math.min(100, lines.length - startRow - 1);
        const sampleLines = lines.slice(startRow + 1, startRow + 1 + sampleSize);

        const columns: DetectedColumn[] = headers.map(header => {
            const sampleValues = sampleLines
                .map(line => {
                    const values = line.split(delimiter).map(val => val.trim().replace(/"/g, ''));
                    const index = headers.indexOf(header);
                    return index >= 0 ? values[index] : '';
                })
                .filter(val => val !== '');

            return this.detectColumnType(header, sampleValues);
        });

        // Generate preview data
        const previewSize = Math.min(10, sampleLines.length);
        const preview = sampleLines.slice(0, previewSize).map(line => {
            const values = line.split(delimiter).map(val => val.trim().replace(/"/g, ''));
            const row: any = {};
            headers.forEach((header, index) => {
                row[header] = values[index] || null;
            });
            return row;
        });

        return {
            columns,
            preview,
            totalRows: lines.length - startRow - 1
        };
    }

    private async analyzeJSON(content: string): Promise<{
        columns: DetectedColumn[];
        preview: any[];
        totalRows: number;
    }> {
        const data = JSON.parse(content);

        if (!Array.isArray(data) || data.length === 0) {
            return { columns: [], preview: [], totalRows: 0 };
        }

        // Get all unique keys from all objects
        const allKeys = new Set<string>();
        data.forEach((item: any) => {
            Object.keys(item).forEach(key => allKeys.add(key));
        });

        const headers = Array.from(allKeys);

        // Detect column types
        const columns: DetectedColumn[] = headers.map(header => {
            const sampleValues = data
                .slice(0, 100)
                .map((item: any) => item[header])
                .filter(val => val !== undefined && val !== null);

            return this.detectColumnType(header, sampleValues);
        });

        // Generate preview
        const previewSize = Math.min(10, data.length);
        const preview = data.slice(0, previewSize);

        return {
            columns,
            preview,
            totalRows: data.length
        };
    }

    private async analyzeExcel(content: string): Promise<{
        columns: DetectedColumn[];
        preview: any[];
        totalRows: number;
    }> {
        // For now, treat as tab-delimited CSV
        return this.analyzeCSV(content, { delimiter: '\t', hasHeaders: true });
    }

    private async analyzeSQL(content: string): Promise<{
        columns: DetectedColumn[];
        preview: any[];
        totalRows: number;
    }> {
        // Basic SQL INSERT parsing - in production, use a proper SQL parser
        const insertRegex = /INSERT INTO (\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/gi;
        const columns: DetectedColumn[] = [];
        const preview: any[] = [];
        let match;

        while ((match = insertRegex.exec(content)) !== null) {
            const tableName = match[1];
            const columnList = match[2];
            const valueList = match[3];

            // Parse columns
            const cols = columnList.split(',').map(col => col.trim().replace(/"/g, ''));

            if (columns.length === 0) {
                columns.push(...cols.map(col => ({
                    name: col,
                    type: 'string' as const,
                    nullable: true,
                    sampleValues: []
                })));
            }

            // Parse values
            const values = valueList.split(',').map(val => val.trim().replace(/['"]/g, ''));

            if (values.length === cols.length) {
                const row: any = {};
                cols.forEach((col, index) => {
                    row[col] = values[index];
                });
                preview.push(row);
            }
        }

        return {
            columns,
            preview,
            totalRows: preview.length
        };
    }

    private detectColumnType(columnName: string, sampleValues: string[]): DetectedColumn {
        if (sampleValues.length === 0) {
            return {
                name: columnName,
                type: 'string',
                nullable: true,
                sampleValues: []
            };
        }

        // Check for null values
        const nonNullValues = sampleValues.filter(val => val !== null && val !== undefined && val !== '');

        // Detect data type
        let detectedType: DetectedColumn['type'] = 'string';
        let maxLength = 0;

        if (nonNullValues.length > 0) {
            // Check if all values are numbers
            const allNumbers = nonNullValues.every(val => !isNaN(Number(val)));
            if (allNumbers) {
                detectedType = 'number';
                maxLength = Math.max(...nonNullValues.map(val => String(val).length));
            } else {
                // Check if all values are dates
                const datePattern = /^\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|\d{2}-\d{2}-\d{4}$/;
                const allDates = nonNullValues.every(val => datePattern.test(val));
                if (allDates) {
                    detectedType = 'date';
                } else {
                    // Check if all values are booleans
                    const booleanValues = ['true', 'false', '1', '0', 'yes', 'no'];
                    const allBooleans = nonNullValues.every(val =>
                        booleanValues.includes(val.toLowerCase())
                    );
                    if (allBooleans) {
                        detectedType = 'boolean';
                    } else {
                        detectedType = 'string';
                        maxLength = Math.max(...nonNullValues.map(val => val.length));
                    }
                }
            }
        }

        return {
            name: columnName,
            type: detectedType,
            nullable: nonNullValues.length < sampleValues.length,
            sampleValues: sampleValues.slice(0, 5),
            maxLength,
            format: detectedType === 'date' ? 'YYYY-MM-DD' : undefined
        };
    }

    private generateRecommendedMappings(columns: DetectedColumn[]): ColumnMapping[] {
        return columns.map(col => ({
            sourceColumn: col.name,
            targetColumn: col.name,
            dataType: this.mapDetectedTypeToSQL(col.type),
            nullable: col.nullable,
            transformation: undefined
        }));
    }

    private mapDetectedTypeToSQL(detectedType: DetectedColumn['type']): string {
        switch (detectedType) {
            case 'string': return 'VARCHAR(255)';
            case 'number': return 'NUMERIC';
            case 'date': return 'DATE';
            case 'boolean': return 'BOOLEAN';
            default: return 'TEXT';
        }
    }

    private async performDataQualityAnalysis(
        previewData: any[],
        columns: DetectedColumn[]
    ): Promise<{
        report: DataQualityReport;
        issues: ValidationIssue[];
    }> {
        const issues: ValidationIssue[] = [];
        const completeness: ColumnQualityMetric[] = [];
        const uniqueness: ColumnQualityMetric[] = [];
        const validity: ColumnQualityMetric[] = [];
        const consistency: ColumnQualityMetric[] = [];

        // Analyze each column
        columns.forEach(column => {
            const columnValues = previewData.map(row => row[column.name]).filter(val => val !== null && val !== undefined);

            // Completeness analysis
            const nullCount = previewData.length - columnValues.length;
            const completenessScore = previewData.length > 0 ? ((previewData.length - nullCount) / previewData.length) * 100 : 0;

            completeness.push({
                columnName: column.name,
                score: completenessScore,
                totalValues: previewData.length,
                validValues: columnValues.length,
                nullValues: nullCount,
                uniqueValues: new Set(columnValues.map(String)).size
            });

            // Uniqueness analysis
            const uniqueValues = new Set(columnValues.map(String));
            const uniquenessScore = columnValues.length > 0 ? (uniqueValues.size / columnValues.length) * 100 : 0;

            uniqueness.push({
                columnName: column.name,
                score: uniquenessScore,
                totalValues: columnValues.length,
                validValues: uniqueValues.size,
                nullValues: 0,
                uniqueValues: uniqueValues.size
            });

            // Validity analysis based on detected type
            let validCount = 0;
            columnValues.forEach(value => {
                if (this.isValidValue(value, column.type)) {
                    validCount++;
                }
            });

            const validityScore = columnValues.length > 0 ? (validCount / columnValues.length) * 100 : 0;

            validity.push({
                columnName: column.name,
                score: validityScore,
                totalValues: columnValues.length,
                validValues: validCount,
                nullValues: 0,
                uniqueValues: 0
            });

            // Consistency analysis (format consistency for strings)
            let formatConsistency = 100;
            if (column.type === 'string' && columnValues.length > 1) {
                const formats = columnValues.map(val => this.detectValueFormat(String(val)));
                const mostCommonFormat = formats.reduce((acc, format) => {
                    acc[format] = (acc[format] || 0) + 1;
                    return acc;
                }, {} as Record<string, number>);

                const maxFormatCount = Math.max(...Object.values(mostCommonFormat));
                formatConsistency = (maxFormatCount / columnValues.length) * 100;
            }

            consistency.push({
                columnName: column.name,
                score: formatConsistency,
                totalValues: columnValues.length,
                validValues: columnValues.length,
                nullValues: 0,
                uniqueValues: 0
            });

            // Generate issues based on quality scores
            if (completenessScore < 80) {
                issues.push({
                    type: 'warning',
                    category: 'data_quality',
                    columnName: column.name,
                    message: `Low completeness: ${completenessScore.toFixed(1)}% of values are present`,
                    suggestion: 'Consider reviewing data source for missing values'
                });
            }

            if (uniquenessScore < 50 && column.name.toLowerCase().includes('id')) {
                issues.push({
                    type: 'warning',
                    category: 'data_quality',
                    columnName: column.name,
                    message: `Potential duplicate IDs detected: ${uniquenessScore.toFixed(1)}% uniqueness`,
                    suggestion: 'Check for duplicate primary key values'
                });
            }

            if (validityScore < 90) {
                issues.push({
                    type: 'error',
                    category: 'data_quality',
                    columnName: column.name,
                    message: `Data type validation failed: ${validityScore.toFixed(1)}% valid values`,
                    suggestion: 'Review data types and formats in the source file'
                });
            }
        });

        // Calculate overall score
        const overallScore = [
            ...completeness.map(c => c.score),
            ...uniqueness.map(u => u.score),
            ...validity.map(v => v.score),
            ...consistency.map(c => c.score)
        ].reduce((sum, score) => sum + score, 0) / (completeness.length * 4);

        // Generate recommendations
        const recommendations: string[] = [];
        if (overallScore < 70) {
            recommendations.push('Data quality is below acceptable threshold. Consider data cleansing.');
        }
        if (issues.some(i => i.type === 'error')) {
            recommendations.push('Fix data type and format errors before importing.');
        }
        if (issues.some(i => i.category === 'data_quality')) {
            recommendations.push('Review data quality issues and consider preprocessing the data.');
        }

        const report: DataQualityReport = {
            overallScore,
            completeness,
            uniqueness,
            validity,
            consistency,
            issues: issues.map(issue => ({
                type: issue.category === 'data_quality' ? 'missing_data' : 'invalid_format',
                columnName: issue.columnName || 'unknown',
                severity: issue.type === 'error' ? 'high' : issue.type === 'warning' ? 'medium' : 'low',
                description: issue.message,
                affectedRows: 0, // Would need row-level analysis
                suggestion: issue.suggestion || 'Review data quality'
            })),
            recommendations
        };

        return { report, issues };
    }

    private isValidValue(value: any, type: DetectedColumn['type']): boolean {
        if (value === null || value === undefined || value === '') {
            return true; // Null values are considered valid
        }

        switch (type) {
            case 'number':
                return !isNaN(Number(value));
            case 'date':
                const date = new Date(value);
                return !isNaN(date.getTime());
            case 'boolean':
                const lowerValue = String(value).toLowerCase();
                return ['true', 'false', '1', '0', 'yes', 'no'].includes(lowerValue);
            case 'string':
            default:
                return typeof value === 'string' || value.toString();
        }
    }

    private detectValueFormat(value: string): string {
        // Simple format detection
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date-yyyy-mm-dd';
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return 'date-mm/dd/yyyy';
        if (/^\d{2}-\d{2}-\d{4}$/.test(value)) return 'date-mm-dd-yyyy';
        if (/^\d+\.\d+$/.test(value)) return 'decimal';
        if (/^\d+$/.test(value)) return 'integer';
        if (/^[A-Z\s]+$/.test(value)) return 'uppercase';
        if (/^[a-z\s]+$/.test(value)) return 'lowercase';
        return 'mixed';
    }

    async executeImportJob(
        jobId: string,
        targetTable: string,
        targetSchema: string,
        columnMapping: ColumnMapping[]
    ): Promise<void> {
        try {
            const job = this.importJobs.get(jobId);
            if (!job) {
                throw new Error(`Import job ${jobId} not found`);
            }

            if (this.activeImports.has(jobId)) {
                throw new Error(`Import job ${jobId} is already running`);
            }

            job.status = 'validating';
            job.progress = 30;
            job.targetTable = targetTable;
            job.targetSchema = targetSchema;
            job.mapping = columnMapping;
            this.importJobs.set(jobId, job);
            this.activeImports.add(jobId);

            Logger.info('Import job started', 'executeImportJob', { jobId });

            // Start operation tracking in status bar
            const statusBarProvider = ExtensionInitializer.getStatusBarProvider();
            const operationSteps = [
                { id: 'validate', name: 'Validating data', status: 'pending' as const },
                { id: 'import', name: 'Importing data', status: 'pending' as const },
                { id: 'finalize', name: 'Finalizing import', status: 'pending' as const }
            ];

            const operationIndicator = statusBarProvider.startOperation(`import-${jobId}`, `Import: ${job.name}`, {
                message: 'Starting import process...',
                cancellable: true,
                steps: operationSteps,
                estimatedDuration: 90000 // 1.5 minutes estimated
            });

            try {
                // Step 1: Validate data
                statusBarProvider.updateOperationStep(`import-${jobId}`, 0, 'running', {
                    message: 'Validating data...'
                });

                // Check for cancellation
                if (operationIndicator.cancellationToken?.token.isCancellationRequested) {
                    job.status = 'cancelled';
                    statusBarProvider.updateOperation(`import-${jobId}`, 'cancelled');
                    return;
                }

                const validationResult = await this.validateImportData(job, columnMapping);
                if (!validationResult.valid) {
                    job.status = 'failed';
                    job.errors.push(...validationResult.errors);
                    job.warnings.push(...validationResult.warnings);
                    statusBarProvider.updateOperation(`import-${jobId}`, 'failed', {
                        message: `Validation failed: ${validationResult.errors.length} errors found`
                    });
                    throw new Error(`Validation failed: ${validationResult.errors.length} errors found`);
                }

                statusBarProvider.updateOperationStep(`import-${jobId}`, 0, 'completed');

                // Step 2: Import data
                statusBarProvider.updateOperationStep(`import-${jobId}`, 1, 'running', {
                    message: 'Importing data...'
                });

                job.status = 'importing';
                job.progress = 50;
                this.importJobs.set(jobId, job);

                // Check for cancellation
                if (operationIndicator.cancellationToken?.token.isCancellationRequested) {
                    job.status = 'cancelled';
                    statusBarProvider.updateOperation(`import-${jobId}`, 'cancelled');
                    return;
                }

                // Execute import via .NET service
                const result = await this.performImport(job, columnMapping, operationIndicator.cancellationToken?.token);

                // Step 3: Finalize
                statusBarProvider.updateOperationStep(`import-${jobId}`, 1, 'completed');
                statusBarProvider.updateOperationStep(`import-${jobId}`, 2, 'running', {
                    message: 'Finalizing import...'
                });

                // Update job with results
                job.status = 'completed';
                job.progress = 100;
                job.importedRows = result.importedRows;
                job.skippedRows = result.skippedRows;
                job.errorRows = result.errorRows;
                job.completedAt = new Date();

                this.importJobs.set(jobId, job);
                this.importHistory.unshift(job);
                this.activeImports.delete(jobId);

                // Complete the operation
                statusBarProvider.updateOperationStep(`import-${jobId}`, 2, 'completed');
                statusBarProvider.updateOperation(`import-${jobId}`, 'completed', {
                    message: `Import completed: ${job.importedRows} rows`
                });

                // Show success message
                vscode.window.showInformationMessage(
                    `Import completed: ${job.importedRows} rows imported, ${job.errorRows} errors`,
                    'View Details', 'View Errors'
                ).then(selection => {
                    if (selection === 'View Details') {
                        this.showImportDetails(jobId);
                    } else if (selection === 'View Errors' && job.errors.length > 0) {
                        this.showImportErrors(jobId);
                    }
                });

                Logger.info('Import job completed', 'executeImportJob', {
                    jobId,
                    importedRows: job.importedRows,
                    errorRows: job.errorRows
                });

            } catch (error) {
                job.status = 'failed';
                job.errors.push({
                    rowNumber: 0,
                    errorType: 'format',
                    message: (error as Error).message,
                    severity: 'error'
                });
                job.completedAt = new Date();
                this.importJobs.set(jobId, job);
                this.activeImports.delete(jobId);

                // Mark operation as failed
                statusBarProvider.updateOperation(`import-${jobId}`, 'failed', {
                    message: `Import failed: ${(error as Error).message}`
                });

                Logger.error('Import job failed', error as Error);
                throw error;
            }

        } catch (error) {
            Logger.error('Failed to execute import job', error as Error);
            vscode.window.showErrorMessage(`Import failed: ${(error as Error).message}`);
        }
    }

    private async validateImportData(
        job: ImportJob,
        columnMapping: ColumnMapping[]
    ): Promise<{
        valid: boolean;
        errors: ImportError[];
        warnings: ImportWarning[];
    }> {
        const errors: ImportError[] = [];
        const warnings: ImportWarning[] = [];

        try {
            // Read file for validation
            const fs = require('fs').promises;
            const fileContent = await fs.readFile(job.filePath, 'utf8');

            let rows: any[] = [];

            switch (job.format) {
                case 'csv':
                    rows = this.parseCSV(fileContent, job.options);
                    break;
                case 'json':
                    rows = JSON.parse(fileContent);
                    break;
                default:
                    throw new Error(`Validation not implemented for format: ${job.format}`);
            }

            // Validate each row
            rows.forEach((row, index) => {
                const rowNumber = index + 1;

                columnMapping.forEach(mapping => {
                    const value = row[mapping.sourceColumn];

                    // Check required fields
                    if (!mapping.nullable && (value === null || value === undefined || value === '')) {
                        errors.push({
                            rowNumber,
                            columnName: mapping.sourceColumn,
                            errorType: 'validation',
                            message: `Required field '${mapping.sourceColumn}' is empty`,
                            severity: 'error'
                        });
                    }

                    // Validate data type
                    if (value !== null && value !== undefined && value !== '') {
                        const typeError = this.validateDataType(value, mapping.dataType);
                        if (typeError) {
                            errors.push({
                                rowNumber,
                                columnName: mapping.sourceColumn,
                                errorType: 'conversion',
                                message: typeError,
                                severity: 'error'
                            });
                        }
                    }
                });
            });

            return {
                valid: errors.length === 0,
                errors,
                warnings
            };

        } catch (error) {
            return {
                valid: false,
                errors: [{
                    rowNumber: 0,
                    errorType: 'format',
                    message: `Failed to parse file: ${(error as Error).message}`,
                    severity: 'error'
                }],
                warnings: []
            };
        }
    }

    private parseCSV(content: string, options: ImportOptions): any[] {
        const lines = content.split('\n').filter(line => line.trim());
        const delimiter = options.delimiter || ',';

        if (lines.length === 0) return [];

        let startRow = 0;
        if (options.hasHeaders !== false) {
            startRow = options.skipRows || 0;
        }

        const headers = lines[startRow].split(delimiter).map(header => header.trim().replace(/"/g, ''));

        return lines.slice(startRow + 1).map((line) => {
            const values = line.split(delimiter).map(val => val.trim().replace(/"/g, ''));
            const row: any = {};

            headers.forEach((header, headerIndex) => {
                row[header] = values[headerIndex] || null;
            });

            return row;
        });
    }

    private validateDataType(value: string, targetType: string): string | null {
        switch (targetType.toLowerCase()) {
            case 'integer':
            case 'bigint':
            case 'smallint':
                if (isNaN(Number(value))) {
                    return `Value '${value}' is not a valid number`;
                }
                break;

            case 'numeric':
            case 'decimal':
                if (isNaN(Number(value))) {
                    return `Value '${value}' is not a valid decimal number`;
                }
                break;

            case 'date':
                const dateValue = new Date(value);
                if (isNaN(dateValue.getTime())) {
                    return `Value '${value}' is not a valid date`;
                }
                break;

            case 'boolean':
                const lowerValue = value.toLowerCase();
                if (!['true', 'false', '1', '0', 'yes', 'no'].includes(lowerValue)) {
                    return `Value '${value}' is not a valid boolean`;
                }
                break;
        }

        return null;
    }

    private async performImport(
        job: ImportJob,
        columnMapping: ColumnMapping[],
        token: any
    ): Promise<{
        importedRows: number;
        skippedRows: number;
        errorRows: number;
    }> {
        try {
            // Get connection for import
            const connection = this.connectionManager.getConnection(job.connectionId);
            if (!connection) {
                throw new Error(`Connection ${job.connectionId} not found`);
            }

            const password = await this.connectionManager.getConnectionPassword(job.connectionId);
            if (!password) {
                throw new Error('Connection password not found');
            }

            // Create .NET connection info
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

            // Read and process file in batches
            const fs = require('fs').promises;
            const fileContent = await fs.readFile(job.filePath, 'utf8');

            let rows: any[] = [];
            const batchSize = job.options.batchSize || 1000;

            switch (job.format) {
                case 'csv':
                    rows = this.parseCSV(fileContent, job.options);
                    break;
                case 'json':
                    rows = JSON.parse(fileContent);
                    break;
                default:
                    throw new Error(`Import not implemented for format: ${job.format}`);
            }

            // Apply row limit
            if (job.options.maxRows) {
                rows = rows.slice(0, job.options.maxRows);
            }

            let importedRows = 0;
            let skippedRows = 0;
            let errorRows = 0;

            // Process in batches
            for (let i = 0; i < rows.length; i += batchSize) {
                if (token.isCancellationRequested) {
                    break;
                }

                const batch = rows.slice(i, i + batchSize);
                const batchNumber = Math.floor(i / batchSize) + 1;

                try {
                    // Transform batch data according to mapping
                    const transformedBatch = this.transformBatchData(batch, columnMapping);

                    // Generate SQL for batch
                    const sql = this.generateBatchInsertSQL(
                        job.targetTable!,
                        job.targetSchema!,
                        columnMapping,
                        transformedBatch
                    );

                    // Execute batch via .NET service
                    const result = await this.dotNetService.executeQuery(
                        dotNetConnection,
                        sql,
                        { timeout: 60 }
                    );

                    importedRows += batch.length;

                    // Update progress
                    const progress = 50 + ((i / rows.length) * 40);
                    job.progress = Math.round(progress);
                    this.importJobs.set(job.id, job);

                } catch (batchError) {
                    errorRows += batch.length;

                    if (!job.options.continueOnError) {
                        throw batchError;
                    }

                    Logger.warn('Batch import failed, continuing with next batch');
                }
            }

            return {
                importedRows,
                skippedRows,
                errorRows
            };

        } catch (error) {
            Logger.error('Failed to perform import', error as Error);
            throw error;
        }
    }

    private transformBatchData(batch: any[], columnMapping: ColumnMapping[]): any[] {
        return batch.map(row => {
            const transformedRow: any = {};

            columnMapping.forEach(mapping => {
                let value = row[mapping.sourceColumn];

                // Apply transformations
                if (mapping.transformation) {
                    value = this.applyTransformation(value, mapping.transformation);
                }

                transformedRow[mapping.targetColumn] = value;
            });

            return transformedRow;
        });
    }

    private applyTransformation(value: any, transformation: string): any {
        if (value === null || value === undefined) return value;

        switch (transformation) {
            case 'uppercase':
                return String(value).toUpperCase();
            case 'lowercase':
                return String(value).toLowerCase();
            case 'trim':
                return String(value).trim();
            default:
                return value;
        }
    }

    private generateBatchInsertSQL(
        tableName: string,
        schemaName: string,
        columnMapping: ColumnMapping[],
        data: any[]
    ): string {
        if (data.length === 0) return '';

        const columns = columnMapping.map(m => m.targetColumn);
        const columnList = columns.join(', ');

        const values = data.map(row => {
            const rowValues = columns.map(col => {
                const value = row[col];
                if (value === null || value === undefined) {
                    return 'NULL';
                }
                if (typeof value === 'string') {
                    return `'${value.replace(/'/g, "''")}'`;
                }
                return String(value);
            });
            return `(${rowValues.join(', ')})`;
        });

        return `INSERT INTO "${schemaName}"."${tableName}" (${columnList}) VALUES ${values.join(', ')};`;
    }

    private showImportDetails(jobId: string): void {
        const job = this.importJobs.get(jobId);
        if (!job) return;

        const panel = vscode.window.createWebviewPanel(
            'importDetails',
            `Import Details: ${job.name}`,
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        panel.webview.html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Import Details</title>
                <style>
                    body { font-family: var(--vscode-font-family); padding: 20px; }
                    .summary { background: var(--vscode-textBlockQuote-background); padding: 20px; margin: 20px 0; border-radius: 8px; }
                    .metric { display: inline-block; margin: 10px; text-align: center; }
                    .metric-value { font-size: 1.5em; font-weight: bold; color: var(--vscode-textLink-foreground); }
                    .metric-label { color: var(--vscode-descriptionForeground); }
                </style>
            </head>
            <body>
                <h1>Import Details: ${job.name}</h1>

                <div class="summary">
                    <h2>Summary</h2>
                    <div class="metric">
                        <div class="metric-value">${job.importedRows || 0}</div>
                        <div class="metric-label">Imported Rows</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value">${job.skippedRows || 0}</div>
                        <div class="metric-label">Skipped Rows</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value">${job.errorRows || 0}</div>
                        <div class="metric-label">Error Rows</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value">${job.totalRows || 0}</div>
                        <div class="metric-label">Total Rows</div>
                    </div>
                </div>

                ${job.errors.length > 0 ? `
                    <h2>Errors (${job.errors.length})</h2>
                    <ul>
                        ${job.errors.map(error => `
                            <li><strong>Row ${error.rowNumber}:</strong> ${error.message}</li>
                        `).join('')}
                    </ul>
                ` : ''}

                ${job.warnings.length > 0 ? `
                    <h2>Warnings (${job.warnings.length})</h2>
                    <ul>
                        ${job.warnings.map(warning => `
                            <li><strong>Row ${warning.rowNumber}:</strong> ${warning.message}</li>
                        `).join('')}
                    </ul>
                ` : ''}
            </body>
            </html>
        `;
    }

    private showImportErrors(jobId: string): void {
        const job = this.importJobs.get(jobId);
        if (!job || job.errors.length === 0) return;

        const panel = vscode.window.createWebviewPanel(
            'importErrors',
            `Import Errors: ${job.name}`,
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        panel.webview.html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Import Errors</title>
                <style>
                    body { font-family: var(--vscode-font-family); padding: 20px; }
                    .error { background: var(--vscode-inputValidation-errorBackground); color: var(--vscode-inputValidation-errorForeground); padding: 10px; margin: 5px 0; border-radius: 4px; border-left: 4px solid var(--vscode-errorForeground); }
                </style>
            </head>
            <body>
                <h1>Import Errors: ${job.name}</h1>
                <p>Total Errors: ${job.errors.length}</p>

                ${job.errors.map(error => `
                    <div class="error">
                        <strong>Row ${error.rowNumber}${error.columnName ? `, Column ${error.columnName}` : ''}:</strong><br>
                        ${error.message}<br>
                        <small>Type: ${error.errorType} | Severity: ${error.severity}</small>
                    </div>
                `).join('')}
            </body>
            </html>
        `;
    }

    async createImportTemplate(templateData: Omit<ImportTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>): Promise<ImportTemplate> {
        try {
            const template: ImportTemplate = {
                ...templateData,
                id: this.generateId(),
                createdAt: new Date(),
                updatedAt: new Date(),
                usageCount: 0
            };

            this.importTemplates.set(template.id, template);
            this.saveImportData();

            Logger.info('Import template created', 'createImportTemplate', {
                templateId: template.id,
                name: template.name
            });

            return template;

        } catch (error) {
            Logger.error('Failed to create import template', error as Error);
            throw error;
        }
    }

    getImportTemplates(category?: string): ImportTemplate[] {
        let templates = Array.from(this.importTemplates.values());

        if (category) {
            templates = templates.filter(t => t.category === category);
        }

        return templates.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }

    // Import Job Management
    getImportJob(jobId: string): ImportJob | undefined {
        return this.importJobs.get(jobId);
    }

    getImportJobs(status?: ImportJob['status']): ImportJob[] {
        let jobs = Array.from(this.importJobs.values());

        if (status) {
            jobs = jobs.filter(job => job.status === status);
        }

        return jobs.sort((a, b) => (b.startedAt?.getTime() || 0) - (a.startedAt?.getTime() || 0));
    }

    getImportHistory(limit: number = 50): ImportJob[] {
        return this.importHistory.slice(0, limit);
    }

    async cancelImportJob(jobId: string): Promise<void> {
        try {
            const job = this.importJobs.get(jobId);
            if (!job) {
                throw new Error(`Import job ${jobId} not found`);
            }

            if (job.status === 'importing' || job.status === 'validating') {
                job.status = 'cancelled';
                this.importJobs.set(jobId, job);
                this.activeImports.delete(jobId);

                Logger.info('Import job cancelled', 'cancelImportJob', { jobId });
            }

        } catch (error) {
            Logger.error('Failed to cancel import job', error as Error);
            throw error;
        }
    }

    // Utility Methods
    private generateId(): string {
        return crypto.randomUUID();
    }

    getActiveImports(): string[] {
        return Array.from(this.activeImports);
    }

    getImportStatistics(): {
        totalJobs: number;
        completedJobs: number;
        failedJobs: number;
        totalRowsImported: number;
        averageImportTime: number;
        popularFormats: { format: string; count: number; }[];
    } {
        const jobs = this.importHistory;
        const completedJobs = jobs.filter(job => job.status === 'completed');

        const totalRows = completedJobs.reduce((sum, job) => sum + (job.importedRows || 0), 0);

        const formatCount = completedJobs.reduce((acc, job) => {
            acc[job.format] = (acc[job.format] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        return {
            totalJobs: jobs.length,
            completedJobs: completedJobs.length,
            failedJobs: jobs.filter(job => job.status === 'failed').length,
            totalRowsImported: totalRows,
            averageImportTime: completedJobs.length > 0 ?
                completedJobs.reduce((sum, job) => {
                    if (job.startedAt && job.completedAt) {
                        return sum + (job.completedAt.getTime() - job.startedAt.getTime());
                    }
                    return sum;
                }, 0) / completedJobs.length : 0,
            popularFormats: Object.entries(formatCount)
                .map(([format, count]) => ({ format, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 5)
        };
    }

    dispose(): void {
        this.saveImportData();
    }
}