import * as vscode from 'vscode';
import { ConnectionManager } from '@/managers/ConnectionManager';
import { DotNetIntegrationService } from '@/services/DotNetIntegrationService';
import { ExtensionInitializer } from '@/utils/ExtensionInitializer';
import { Logger } from '@/utils/Logger';

export interface ExportJob {
    id: string;
    name: string;
    connectionId: string;
    query: string;
    format: 'csv' | 'json' | 'excel' | 'parquet' | 'sql';
    options: ExportOptions;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    progress: number;
    totalRows?: number;
    exportedRows?: number;
    filePath?: string;
    error?: string;
    startedAt?: Date;
    completedAt?: Date;
    estimatedSize?: string;
    compression?: boolean;
}

export interface ExportOptions {
    delimiter?: string;
    includeHeaders?: boolean;
    dateFormat?: string;
    nullValue?: string;
    encoding?: 'utf8' | 'utf16' | 'ascii';
    compression?: boolean;
    chunkSize?: number;
    parallelExport?: boolean;
    filterRows?: string;
    transformColumns?: ColumnTransformation[];
    schedule?: ExportSchedule;
}

export interface ColumnTransformation {
    columnName: string;
    transformation: 'uppercase' | 'lowercase' | 'trim' | 'date_format' | 'number_format' | 'custom';
    parameters?: Record<string, string>;
}

export interface ExportSchedule {
    frequency: 'once' | 'daily' | 'weekly' | 'monthly';
    time?: string;
    dayOfWeek?: number;
    dayOfMonth?: number;
    enabled: boolean;
    nextRun?: Date;
}

export interface ExportTemplate {
    id: string;
    name: string;
    description: string;
    query: string;
    format: 'csv' | 'json' | 'excel' | 'parquet' | 'sql';
    options: ExportOptions;
    createdAt: Date;
    updatedAt: Date;
    usageCount: number;
    category: string;
    tags: string[];
}

export class DataExportService {
    private context: vscode.ExtensionContext;
    private connectionManager: ConnectionManager;
    private dotNetService: DotNetIntegrationService;
    private exportJobs: Map<string, ExportJob> = new Map();
    private exportTemplates: Map<string, ExportTemplate> = new Map();
    private activeExports: Set<string> = new Set();
    private exportHistory: ExportJob[] = [];

    constructor(
        context: vscode.ExtensionContext,
        connectionManager: ConnectionManager
    ) {
        this.context = context;
        this.connectionManager = connectionManager;
        this.dotNetService = DotNetIntegrationService.getInstance();
        this.loadExportData();
    }

    private loadExportData(): void {
        try {
            // Load export templates
            const templatesData = this.context.globalState.get<string>('postgresql.exports.templates', '[]');
            const templates = JSON.parse(templatesData) as ExportTemplate[];

            this.exportTemplates.clear();
            templates.forEach(template => {
                this.exportTemplates.set(template.id, {
                    ...template,
                    createdAt: new Date(template.createdAt),
                    updatedAt: new Date(template.updatedAt)
                });
            });

            // Load export history
            const historyData = this.context.globalState.get<string>('postgresql.exports.history', '[]');
            const history = JSON.parse(historyData) as ExportJob[];

            this.exportHistory = history.map(job => ({
                ...job,
                startedAt: job.startedAt ? new Date(job.startedAt) : undefined,
                completedAt: job.completedAt ? new Date(job.completedAt) : undefined
            })).slice(0, 100); // Keep last 100 jobs

            Logger.info('Export data loaded', 'loadExportData', {
                templateCount: this.exportTemplates.size,
                historyCount: this.exportHistory.length
            });

        } catch (error) {
            Logger.error('Failed to load export data', error as Error);
            this.exportTemplates.clear();
            this.exportHistory = [];
        }
    }

    private saveExportData(): void {
        try {
            // Save export templates
            const templatesArray = Array.from(this.exportTemplates.values());
            this.context.globalState.update('postgresql.exports.templates', JSON.stringify(templatesArray));

            // Save export history
            this.context.globalState.update('postgresql.exports.history', JSON.stringify(this.exportHistory));

            Logger.info('Export data saved', 'saveExportData');

        } catch (error) {
            Logger.error('Failed to save export data', error as Error);
        }
    }

    // Export Job Management
    async createExportJob(
        name: string,
        connectionId: string,
        query: string,
        format: 'csv' | 'json' | 'excel' | 'parquet' | 'sql',
        options: ExportOptions = {}
    ): Promise<string> {
        try {
            const jobId = this.generateId();

            const exportJob: ExportJob = {
                id: jobId,
                name,
                connectionId,
                query,
                format,
                options,
                status: 'pending',
                progress: 0,
                startedAt: new Date()
            };

            this.exportJobs.set(jobId, exportJob);
            this.saveExportData();

            Logger.info('Export job created', 'createExportJob', {
                jobId,
                name,
                format,
                connectionId
            });

            return jobId;

        } catch (error) {
            Logger.error('Failed to create export job', error as Error);
            throw error;
        }
    }

    async executeExportJob(jobId: string): Promise<void> {
        try {
            const job = this.exportJobs.get(jobId);
            if (!job) {
                throw new Error(`Export job ${jobId} not found`);
            }

            if (this.activeExports.has(jobId)) {
                throw new Error(`Export job ${jobId} is already running`);
            }

            job.status = 'running';
            job.progress = 0;
            job.startedAt = new Date();
            this.exportJobs.set(jobId, job);
            this.activeExports.add(jobId);

            Logger.info('Export job started', 'executeExportJob', { jobId });

            // Start operation tracking in status bar
            const statusBarProvider = ExtensionInitializer.getStatusBarProvider();
            const operationSteps = [
                { id: 'prepare', name: 'Preparing export', status: 'pending' as const },
                { id: 'query', name: 'Executing query', status: 'pending' as const },
                { id: 'process', name: 'Processing data', status: 'pending' as const },
                { id: 'generate', name: 'Generating file', status: 'pending' as const }
            ];

            const operationIndicator = statusBarProvider.startOperation(`export-${jobId}`, `Export: ${job.name}`, {
                message: 'Starting export process...',
                cancellable: true,
                steps: operationSteps,
                estimatedDuration: 60000 // 1 minute estimated
            });

            try {
                // Step 1: Prepare
                statusBarProvider.updateOperationStep(`export-${jobId}`, 0, 'running', {
                    message: 'Preparing export...'
                });

                // Get connection and validate
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

                // Step 2: Execute query
                statusBarProvider.updateOperationStep(`export-${jobId}`, 0, 'completed');
                statusBarProvider.updateOperationStep(`export-${jobId}`, 1, 'running', {
                    message: 'Executing query...'
                });

                // Execute export via .NET service
                const result = await this.dotNetService.executeQuery(
                    dotNetConnection,
                    job.query,
                    {
                        maxRows: 1000000, // Large limit for exports
                        timeout: 300 // 5 minute timeout for exports
                    }
                );

                // Step 3: Process data
                statusBarProvider.updateOperationStep(`export-${jobId}`, 1, 'completed');
                statusBarProvider.updateOperationStep(`export-${jobId}`, 2, 'running', {
                    message: 'Processing data...'
                });

                // Check for cancellation
                if (operationIndicator.cancellationToken?.token.isCancellationRequested) {
                    job.status = 'cancelled';
                    statusBarProvider.updateOperation(`export-${jobId}`, 'cancelled');
                    return;
                }

                // Generate export file
                const filePath = await this.generateExportFile(job, result);

                // Step 4: Finalize
                statusBarProvider.updateOperationStep(`export-${jobId}`, 2, 'completed');
                statusBarProvider.updateOperationStep(`export-${jobId}`, 3, 'running', {
                    message: 'Finalizing export...'
                });

                // Check for cancellation
                if (operationIndicator.cancellationToken?.token.isCancellationRequested) {
                    job.status = 'cancelled';
                    statusBarProvider.updateOperation(`export-${jobId}`, 'cancelled');
                    return;
                }

                // Update job with results
                job.status = 'completed';
                job.progress = 100;
                job.totalRows = result.rowCount;
                job.exportedRows = result.rowCount;
                job.filePath = filePath;
                job.completedAt = new Date();
                job.estimatedSize = await this.getFileSize(filePath);

                this.exportJobs.set(jobId, job);
                this.exportHistory.unshift(job);
                this.activeExports.delete(jobId);

                // Complete the operation
                statusBarProvider.updateOperationStep(`export-${jobId}`, 3, 'completed');
                statusBarProvider.updateOperation(`export-${jobId}`, 'completed', {
                    message: `Export completed: ${job.exportedRows} rows`
                });

                // Show success message with file path
                vscode.window.showInformationMessage(
                    `Export completed: ${job.exportedRows} rows exported to ${filePath}`,
                    'Open File', 'Open Folder'
                ).then(selection => {
                    if (selection === 'Open File') {
                        vscode.workspace.openTextDocument(filePath).then(doc => {
                            vscode.window.showTextDocument(doc);
                        });
                    } else if (selection === 'Open Folder') {
                        vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(filePath));
                    }
                });

                Logger.info('Export job completed', 'executeExportJob', {
                    jobId,
                    exportedRows: job.exportedRows,
                    filePath
                });

            } catch (error) {
                job.status = 'failed';
                job.error = (error as Error).message;
                job.completedAt = new Date();
                this.exportJobs.set(jobId, job);
                this.activeExports.delete(jobId);

                // Mark operation as failed
                statusBarProvider.updateOperation(`export-${jobId}`, 'failed', {
                    message: `Export failed: ${(error as Error).message}`
                });

                Logger.error('Export job failed', error as Error);
                throw error;
            }

        } catch (error) {
            Logger.error('Failed to execute export job', error as Error);
            vscode.window.showErrorMessage(`Export failed: ${(error as Error).message}`);
        }
    }

    private async generateExportFile(job: ExportJob, result: any): Promise<string> {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const extension = job.format === 'excel' ? 'xlsx' : job.format;
            const fileName = `${job.name}_${timestamp}.${extension}`;
            const filePath = vscode.Uri.file(fileName).fsPath;

            let content: string;

            switch (job.format) {
                case 'csv':
                    content = this.generateCSV(result, job.options);
                    break;
                case 'json':
                    content = this.generateJSON(result);
                    break;
                case 'excel':
                    content = this.generateCSV(result, { delimiter: '\t' }); // Tab-delimited for Excel
                    break;
                case 'parquet':
                    // For now, export as CSV and note Parquet format
                    content = this.generateCSV(result, job.options);
                    break;
                case 'sql':
                    content = this.generateSQL(result, job.name);
                    break;
                default:
                    throw new Error(`Unsupported export format: ${job.format}`);
            }

            const fs = require('fs').promises;
            await fs.writeFile(filePath, content, 'utf8');

            return filePath;

        } catch (error) {
            Logger.error('Failed to generate export file', error as Error);
            throw error;
        }
    }

    private generateCSV(result: any, options: ExportOptions): string {
        const lines: string[] = [];
        const delimiter = options.delimiter || ',';

        // Add headers if requested
        if (options.includeHeaders !== false) {
            const headers = result.columns.map((col: any) => `"${col.name}"`).join(delimiter);
            lines.push(headers);
        }

        // Add data rows with transformations
        result.rows.forEach((row: any[]) => {
            let processedRow = [...row];

            // Apply column transformations
            if (options.transformColumns) {
                processedRow = this.applyTransformations(processedRow, result.columns, options.transformColumns);
            }

            const values = processedRow.map((cell: any) => {
                const cellStr = cell !== null ? String(cell) : (options.nullValue || '');
                // Escape quotes and wrap in quotes if contains delimiter or quotes
                return cellStr.includes(delimiter) || cellStr.includes('"')
                    ? `"${cellStr.replace(/"/g, '""')}"`
                    : cellStr;
            });

            lines.push(values.join(delimiter));
        });

        return lines.join('\n');
    }

    private generateJSON(result: any): string {
        const data = result.rows.map((row: any[]) => {
            const obj: any = {};
            result.columns.forEach((col: any, index: number) => {
                obj[col.name] = row[index];
            });
            return obj;
        });

        return JSON.stringify(data, null, 2);
    }

    private generateSQL(result: any, tableName: string): string {
        let sql = `-- Data export for table: ${tableName}\n`;
        sql += `-- Exported: ${new Date().toISOString()}\n`;
        sql += `-- Rows: ${result.rowCount}\n\n`;

        if (result.rows.length === 0) {
            return sql;
        }

        // Generate INSERT statements
        result.rows.forEach((row: any[], index: number) => {
            const values = row.map(cell => {
                if (cell === null) {
                    return 'NULL';
                }
                if (typeof cell === 'string') {
                    return `'${cell.replace(/'/g, "''")}'`;
                }
                return String(cell);
            });

            sql += `INSERT INTO ${tableName} (${result.columns.map((col: any) => col.name).join(', ')}) `;
            sql += `VALUES (${values.join(', ')});\n`;

            // Add line break every 1000 rows for readability
            if ((index + 1) % 1000 === 0) {
                sql += '\n';
            }
        });

        return sql;
    }

    private applyTransformations(
        row: any[],
        columns: any[],
        transformations: ColumnTransformation[]
    ): any[] {
        const transformedRow = [...row];

        transformations.forEach(transform => {
            const columnIndex = columns.findIndex(col => col.name === transform.columnName);
            if (columnIndex >= 0) {
                const value = transformedRow[columnIndex];

                switch (transform.transformation) {
                    case 'uppercase':
                        transformedRow[columnIndex] = String(value).toUpperCase();
                        break;
                    case 'lowercase':
                        transformedRow[columnIndex] = String(value).toLowerCase();
                        break;
                    case 'trim':
                        transformedRow[columnIndex] = String(value).trim();
                        break;
                    case 'date_format':
                        // Basic date formatting - could be enhanced
                        transformedRow[columnIndex] = value;
                        break;
                    case 'number_format':
                        // Basic number formatting - could be enhanced
                        transformedRow[columnIndex] = value;
                        break;
                }
            }
        });

        return transformedRow;
    }

    private async getFileSize(filePath: string): Promise<string> {
        try {
            const fs = require('fs').promises;
            const stats = await fs.stat(filePath);
            const bytes = stats.size;

            if (bytes < 1024) return `${bytes} B`;
            if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
            if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
            return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;

        } catch (error) {
            return 'Unknown';
        }
    }

    // Template Management
    async createExportTemplate(templateData: Omit<ExportTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>): Promise<ExportTemplate> {
        try {
            const template: ExportTemplate = {
                ...templateData,
                id: this.generateId(),
                createdAt: new Date(),
                updatedAt: new Date(),
                usageCount: 0
            };

            this.exportTemplates.set(template.id, template);
            this.saveExportData();

            Logger.info('Export template created', 'createExportTemplate', {
                templateId: template.id,
                name: template.name
            });

            return template;

        } catch (error) {
            Logger.error('Failed to create export template', error as Error);
            throw error;
        }
    }

    async useExportTemplate(templateId: string, overrides?: Partial<ExportOptions>): Promise<ExportJob> {
        try {
            const template = this.exportTemplates.get(templateId);
            if (!template) {
                throw new Error(`Export template ${templateId} not found`);
            }

            // Increment usage count
            template.usageCount++;
            this.exportTemplates.set(templateId, template);

            // Create export job from template
            const jobId = await this.createExportJob(
                `${template.name} Export`,
                '', // Connection ID will be set by user
                template.query,
                template.format,
                { ...template.options, ...overrides }
            );

            const job = this.exportJobs.get(jobId)!;
            this.saveExportData();

            Logger.info('Export template used', 'useExportTemplate', {
                templateId,
                jobId
            });

            return job;

        } catch (error) {
            Logger.error('Failed to use export template', error as Error);
            throw error;
        }
    }

    getExportTemplates(category?: string): ExportTemplate[] {
        let templates = Array.from(this.exportTemplates.values());

        if (category) {
            templates = templates.filter(t => t.category === category);
        }

        return templates.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }

    // Bulk Export Operations
    async exportTable(
        connectionId: string,
        schemaName: string,
        tableName: string,
        format: 'csv' | 'json' | 'excel' | 'parquet' | 'sql',
        options: ExportOptions = {}
    ): Promise<string> {
        try {
            const query = `SELECT * FROM "${schemaName}"."${tableName}"`;

            const jobId = await this.createExportJob(
                `Table Export: ${schemaName}.${tableName}`,
                connectionId,
                query,
                format,
                options
            );

            await this.executeExportJob(jobId);

            const job = this.exportJobs.get(jobId);
            if (!job || !job.filePath) {
                throw new Error('Export job completed but no file path available');
            }

            return job.filePath;

        } catch (error) {
            Logger.error('Failed to export table', error as Error);
            throw error;
        }
    }

    async exportSchema(
        connectionId: string,
        schemaName: string,
        format: 'csv' | 'json' | 'excel' | 'parquet' | 'sql',
        options: ExportOptions = {}
    ): Promise<string[]> {
        try {
            // Get all tables in schema
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

            const schemaObjects = await this.dotNetService.browseSchema(dotNetConnection, schemaName);
            const tables = schemaObjects.filter(obj => obj.type === 'table');

            const exportedFiles: string[] = [];

            for (const table of tables) {
                const filePath = await this.exportTable(
                    connectionId,
                    schemaName,
                    table.name,
                    format,
                    options
                );
                exportedFiles.push(filePath);
            }

            Logger.info('Schema export completed', 'exportSchema', {
                schemaName,
                tableCount: exportedFiles.length,
                files: exportedFiles
            });

            return exportedFiles;

        } catch (error) {
            Logger.error('Failed to export schema', error as Error);
            throw error;
        }
    }

    // Export Job Management
    getExportJob(jobId: string): ExportJob | undefined {
        return this.exportJobs.get(jobId);
    }

    getExportJobs(status?: ExportJob['status']): ExportJob[] {
        let jobs = Array.from(this.exportJobs.values());

        if (status) {
            jobs = jobs.filter(job => job.status === status);
        }

        return jobs.sort((a, b) => (b.startedAt?.getTime() || 0) - (a.startedAt?.getTime() || 0));
    }

    getExportHistory(limit: number = 50): ExportJob[] {
        return this.exportHistory.slice(0, limit);
    }

    async cancelExportJob(jobId: string): Promise<void> {
        try {
            const job = this.exportJobs.get(jobId);
            if (!job) {
                throw new Error(`Export job ${jobId} not found`);
            }

            if (job.status === 'running') {
                job.status = 'cancelled';
                this.exportJobs.set(jobId, job);
                this.activeExports.delete(jobId);

                Logger.info('Export job cancelled', 'cancelExportJob', { jobId });
            }

        } catch (error) {
            Logger.error('Failed to cancel export job', error as Error);
            throw error;
        }
    }

    // Utility Methods
    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    getActiveExports(): string[] {
        return Array.from(this.activeExports);
    }

    getExportStatistics(): {
        totalJobs: number;
        completedJobs: number;
        failedJobs: number;
        totalRowsExported: number;
        totalSizeExported: string;
        averageJobTime: number;
        popularFormats: { format: string; count: number }[];
    } {
        const jobs = this.exportHistory;
        const completedJobs = jobs.filter(job => job.status === 'completed');

        const totalRows = completedJobs.reduce((sum, job) => sum + (job.exportedRows || 0), 0);

        const formatCount = completedJobs.reduce((acc, job) => {
            acc[job.format] = (acc[job.format] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        return {
            totalJobs: jobs.length,
            completedJobs: completedJobs.length,
            failedJobs: jobs.filter(job => job.status === 'failed').length,
            totalRowsExported: totalRows,
            totalSizeExported: 'Unknown', // Would calculate from file sizes
            averageJobTime: completedJobs.length > 0 ?
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
        this.saveExportData();
    }
}