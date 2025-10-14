import * as vscode from 'vscode';
import { Logger } from '@/utils/Logger';
import { DataImportService, DetectedColumn, ColumnMapping, DataQualityReport } from '@/services/DataImportService';
import { ConnectionManager } from '@/managers/ConnectionManager';

export interface ImportWizardData {
    jobId: string;
    filePath: string;
    format: 'csv' | 'json' | 'excel' | 'sql' | 'parquet';
    detectedColumns: DetectedColumn[];
    previewData: any[];
    columnMappings: ColumnMapping[];
    targetTable: string;
    targetSchema: string;
    dataQualityReport?: DataQualityReport;
    validationIssues: any[];
}

export class ImportWizardView {
    private panel: vscode.WebviewPanel | undefined;
    private wizardData: ImportWizardData | undefined;
    private currentStep = 0;
    private importService: DataImportService;
    private connectionManager: ConnectionManager;

    constructor(importService: DataImportService, connectionManager: ConnectionManager) {
        this.importService = importService;
        this.connectionManager = connectionManager;
    }

    async showImportWizard(filePath?: string, format?: string): Promise<void> {
        try {
            Logger.info('Opening import wizard');

            this.panel = vscode.window.createWebviewPanel(
                'postgresqlImportWizard',
                'Import Data Wizard',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [
                        vscode.Uri.joinPath(vscode.workspace.workspaceFolders?.[0]?.uri || vscode.Uri.parse(''), 'resources')
                    ]
                }
            );

            // Handle panel disposal
            this.panel.onDidDispose(() => {
                this.panel = undefined;
                this.wizardData = undefined;
                this.currentStep = 0;
            });

            // Handle messages from webview
            this.panel.webview.onDidReceiveMessage(async (message) => {
                await this.handleWizardMessage(message);
            });

            // Show file selection if no file provided
            if (!filePath) {
                const selectedFiles = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: false,
                    filters: {
                        'Data Files': ['csv', 'json', 'xlsx', 'xls', 'sql'],
                        'All Files': ['*']
                    }
                });

                if (!selectedFiles || selectedFiles.length === 0) {
                    return;
                }

                filePath = selectedFiles[0].fsPath;
                format = this.detectFormat(filePath);
            }

            // Create import job
            const connections = this.connectionManager.getConnections();
            if (connections.length === 0) {
                vscode.window.showErrorMessage('No database connections available. Please add a connection first.');
                return;
            }

            const connectionItems = connections.map(conn => ({
                label: conn.name,
                detail: `${conn.host}:${conn.port}/${conn.database}`,
                connection: conn
            }));

            const selectedConnection = await vscode.window.showQuickPick(connectionItems, {
                placeHolder: 'Select target database connection'
            });

            if (!selectedConnection) {
                return;
            }

            const jobId = await this.importService.createImportJob(
                `Import ${new Date().toISOString()}`,
                selectedConnection.connection.id,
                filePath,
                format as any
            );

            // Analyze file
            const analysisResult = await this.importService.analyzeImportFile(jobId);

            // Create wizard data
            this.wizardData = {
                jobId,
                filePath,
                format: format as any,
                detectedColumns: analysisResult.detectedColumns,
                previewData: analysisResult.previewData,
                columnMappings: analysisResult.recommendedMappings,
                targetTable: '',
                targetSchema: 'public',
                dataQualityReport: analysisResult.dataQualityReport,
                validationIssues: analysisResult.validationIssues || []
            };

            // Show wizard
            await this.showCurrentStep();

        } catch (error) {
            Logger.error('Failed to show import wizard', error as Error);
            vscode.window.showErrorMessage(`Failed to open import wizard: ${(error as Error).message}`);
        }
    }

    private detectFormat(filePath: string): string {
        const ext = filePath.toLowerCase().split('.').pop();
        switch (ext) {
            case 'csv': return 'csv';
            case 'json': return 'json';
            case 'xlsx':
            case 'xls': return 'excel';
            case 'sql': return 'sql';
            default: return 'csv';
        }
    }

    private async showCurrentStep(): Promise<void> {
        if (!this.panel || !this.wizardData) return;

        const steps = [
            { id: 'file-analysis', title: 'File Analysis', description: 'Analyze and preview data' },
            { id: 'column-mapping', title: 'Column Mapping', description: 'Map source columns to target table' },
            { id: 'target-config', title: 'Target Configuration', description: 'Configure import settings' },
            { id: 'validation', title: 'Validation & Preview', description: 'Review and validate import' },
            { id: 'import', title: 'Import Data', description: 'Execute the import' }
        ];

        const htmlContent = this.generateWizardHtml(steps);
        this.panel.webview.html = htmlContent;
    }

    private generateWizardHtml(steps: any[]): string {
        if (!this.wizardData) return '';

        const currentStepData = steps[this.currentStep];

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Import Data Wizard</title>
                <style>
                    :root {
                        --vscode-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        --vscode-editor-background: #1e1e1e;
                        --vscode-editor-foreground: #cccccc;
                        --vscode-panel-border: #3c3c3c;
                        --vscode-textLink-foreground: #4da6ff;
                        --vscode-button-background: #0e639c;
                        --vscode-button-foreground: #ffffff;
                        --vscode-button-hoverBackground: #1177bb;
                        --vscode-input-background: #3c3c3c;
                        --vscode-input-foreground: #cccccc;
                        --vscode-list-hoverBackground: #2a2d2e;
                        --vscode-badge-background: #4d4d4d;
                        --vscode-badge-foreground: #ffffff;
                        --vscode-gitDecoration-addedResourceForeground: #4bb74a;
                        --vscode-gitDecoration-deletedResourceForeground: #f48771;
                        --vscode-gitDecoration-modifiedResourceForeground: #4da6ff;
                    }

                    body {
                        font-family: var(--vscode-font-family);
                        padding: 0;
                        margin: 0;
                        background: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                        height: 100vh;
                        display: flex;
                        flex-direction: column;
                    }

                    .wizard-header {
                        background: var(--vscode-titleBar-activeBackground, #2f2f2f);
                        padding: 15px 20px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                    }

                    .wizard-title {
                        font-size: 18px;
                        font-weight: bold;
                        margin: 0;
                    }

                    .wizard-subtitle {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                        margin: 5px 0 0 0;
                    }

                    .wizard-progress {
                        display: flex;
                        margin-top: 15px;
                    }

                    .progress-step {
                        flex: 1;
                        text-align: center;
                        padding: 8px;
                        border-bottom: 3px solid var(--vscode-panel-border);
                        font-size: 11px;
                    }

                    .progress-step.active {
                        border-bottom-color: var(--vscode-textLink-foreground);
                        color: var(--vscode-textLink-foreground);
                        font-weight: bold;
                    }

                    .progress-step.completed {
                        border-bottom-color: var(--vscode-gitDecoration-addedResourceForeground);
                    }

                    .wizard-content {
                        flex: 1;
                        overflow: auto;
                        padding: 20px;
                    }

                    .step-content {
                        max-width: 800px;
                        margin: 0 auto;
                    }

                    .form-section {
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 6px;
                        margin-bottom: 20px;
                        overflow: hidden;
                    }

                    .section-header {
                        background: var(--vscode-titleBar-activeBackground, #2f2f2f);
                        padding: 12px 15px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        font-weight: bold;
                    }

                    .section-content {
                        padding: 15px;
                    }

                    .form-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                        gap: 15px;
                        margin-bottom: 20px;
                    }

                    .form-group {
                        display: flex;
                        flex-direction: column;
                    }

                    .form-label {
                        font-size: 12px;
                        font-weight: bold;
                        margin-bottom: 5px;
                        color: var(--vscode-textLink-foreground);
                    }

                    .form-input {
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 4px;
                        padding: 8px;
                        font-size: 12px;
                    }

                    .form-input:focus {
                        outline: none;
                        border-color: var(--vscode-textLink-foreground);
                    }

                    .data-preview {
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 4px;
                        overflow: hidden;
                        margin: 15px 0;
                    }

                    .preview-header {
                        background: var(--vscode-titleBar-activeBackground, #2f2f2f);
                        padding: 8px 12px;
                        font-weight: bold;
                        font-size: 11px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                    }

                    .preview-table {
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 11px;
                    }

                    .preview-table th,
                    .preview-table td {
                        padding: 6px 8px;
                        text-align: left;
                        border-bottom: 1px solid var(--vscode-panel-border);
                    }

                    .preview-table th {
                        background: var(--vscode-textBlockQuote-background);
                        font-weight: bold;
                    }

                    .preview-table tbody tr:hover {
                        background: var(--vscode-list-hoverBackground);
                    }

                    .column-mapping {
                        display: grid;
                        grid-template-columns: 1fr 100px 1fr 100px;
                        gap: 10px;
                        align-items: center;
                        padding: 8px 0;
                        border-bottom: 1px solid var(--vscode-panel-border);
                    }

                    .column-mapping:last-child {
                        border-bottom: none;
                    }

                    .quality-score {
                        display: inline-block;
                        padding: 4px 8px;
                        border-radius: 12px;
                        font-size: 10px;
                        font-weight: bold;
                    }

                    .quality-excellent { background: var(--vscode-gitDecoration-addedResourceForeground); }
                    .quality-good { background: var(--vscode-gitDecoration-modifiedResourceForeground); }
                    .quality-poor { background: var(--vscode-gitDecoration-deletedResourceForeground); }

                    .wizard-footer {
                        padding: 15px 20px;
                        border-top: 1px solid var(--vscode-panel-border);
                        background: var(--vscode-editor-background);
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }

                    .btn {
                        padding: 8px 16px;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 12px;
                        font-weight: bold;
                        transition: background-color 0.2s;
                    }

                    .btn-primary {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                    }

                    .btn-primary:hover:not(:disabled) {
                        background: var(--vscode-button-hoverBackground);
                    }

                    .btn-secondary {
                        background: var(--vscode-button-secondaryBackground, #3c3c3c);
                        color: var(--vscode-button-secondaryForeground, #cccccc);
                    }

                    .btn-secondary:hover:not(:disabled) {
                        background: var(--vscode-list-hoverBackground);
                    }

                    .btn:disabled {
                        opacity: 0.5;
                        cursor: not-allowed;
                    }

                    .data-quality {
                        background: var(--vscode-textBlockQuote-background);
                        padding: 15px;
                        border-radius: 4px;
                        margin: 15px 0;
                    }

                    .quality-metrics {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                        gap: 15px;
                        margin: 15px 0;
                    }

                    .quality-metric {
                        background: var(--vscode-editor-background);
                        padding: 10px;
                        border-radius: 4px;
                        text-align: center;
                    }

                    .metric-value {
                        font-size: 18px;
                        font-weight: bold;
                        color: var(--vscode-textLink-foreground);
                    }

                    .metric-label {
                        font-size: 10px;
                        color: var(--vscode-descriptionForeground);
                        text-transform: uppercase;
                    }

                    .validation-issues {
                        background: var(--vscode-inputValidation-errorBackground);
                        border: 1px solid var(--vscode-inputValidation-errorBorder);
                        border-radius: 4px;
                        padding: 10px;
                        margin: 10px 0;
                    }

                    .issue-item {
                        padding: 5px 0;
                        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    }

                    .issue-item:last-child {
                        border-bottom: none;
                    }
                </style>
            </head>
            <body>
                <div class="wizard-header">
                    <h1 class="wizard-title">Import Data Wizard</h1>
                    <div class="wizard-subtitle">${currentStepData.description}</div>
                    <div class="wizard-progress">
                        ${steps.map((step, index) => `
                            <div class="progress-step ${index === this.currentStep ? 'active' : index < this.currentStep ? 'completed' : ''}">
                                ${index + 1}. ${step.title}
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="wizard-content">
                    <div class="step-content">
                        ${this.generateStepContent(currentStepData.id)}
                    </div>
                </div>

                <div class="wizard-footer">
                    <div class="wizard-info">
                        ${this.currentStep + 1} of ${steps.length}
                        ${this.wizardData.dataQualityReport ? `
                            • Quality Score: ${this.getQualityBadge(this.wizardData.dataQualityReport.overallScore)}
                        ` : ''}
                    </div>
                    <div class="wizard-actions">
                        ${this.currentStep > 0 ? `<button class="btn btn-secondary" onclick="previousStep()">Previous</button>` : ''}
                        ${this.currentStep < steps.length - 1 ?
                            `<button class="btn btn-primary" onclick="nextStep()">Next</button>` :
                            `<button class="btn btn-primary" onclick="finishWizard()">Import Data</button>`
                        }
                        <button class="btn btn-secondary" onclick="cancelWizard()">Cancel</button>
                    </div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();

                    function nextStep() {
                        vscode.postMessage({ command: 'nextStep' });
                    }

                    function previousStep() {
                        vscode.postMessage({ command: 'previousStep' });
                    }

                    function finishWizard() {
                        vscode.postMessage({ command: 'finishWizard' });
                    }

                    function cancelWizard() {
                        vscode.postMessage({ command: 'cancelWizard' });
                    }

                    function updateColumnMapping(sourceColumn, targetColumn, dataType) {
                        vscode.postMessage({
                            command: 'updateColumnMapping',
                            sourceColumn,
                            targetColumn,
                            dataType
                        });
                    }

                    function updateTargetConfig(table, schema) {
                        vscode.postMessage({
                            command: 'updateTargetConfig',
                            table,
                            schema
                        });
                    }
                </script>
            </body>
            </html>
        `;
    }

    private generateStepContent(stepId: string): string {
        if (!this.wizardData) return '';

        switch (stepId) {
            case 'file-analysis':
                return this.generateFileAnalysisStep();
            case 'column-mapping':
                return this.generateColumnMappingStep();
            case 'target-config':
                return this.generateTargetConfigStep();
            case 'validation':
                return this.generateValidationStep();
            case 'import':
                return this.generateImportStep();
            default:
                return '<div>Unknown step</div>';
        }
    }

    private generateFileAnalysisStep(): string {
        const data = this.wizardData!;

        return `
            <div class="form-section">
                <div class="section-header">File Information</div>
                <div class="section-content">
                    <div class="form-grid">
                        <div class="form-group">
                            <div class="form-label">File Path</div>
                            <div class="form-input" readonly>${data.filePath}</div>
                        </div>
                        <div class="form-group">
                            <div class="form-label">Format</div>
                            <div class="form-input" readonly>${data.format.toUpperCase()}</div>
                        </div>
                        <div class="form-group">
                            <div class="form-label">Total Rows</div>
                            <div class="form-input" readonly>${data.detectedColumns.length > 0 ? 'Analyzing...' : '0'}</div>
                        </div>
                        <div class="form-group">
                            <div class="form-label">Columns Detected</div>
                            <div class="form-input" readonly>${data.detectedColumns.length}</div>
                        </div>
                    </div>
                </div>
            </div>

            ${data.detectedColumns.length > 0 ? `
                <div class="form-section">
                    <div class="section-header">Data Preview</div>
                    <div class="section-content">
                        <div class="data-preview">
                            <div class="preview-header">Sample Data (First 5 rows)</div>
                            <table class="preview-table">
                                <thead>
                                    <tr>
                                        ${data.detectedColumns.map(col => `<th>${col.name}</th>`).join('')}
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.previewData.slice(0, 5).map(row => `
                                        <tr>
                                            ${data.detectedColumns.map(col => `<td>${row[col.name] || ''}</td>`).join('')}
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ` : ''}

            ${data.dataQualityReport ? `
                <div class="form-section">
                    <div class="section-header">Data Quality Report</div>
                    <div class="section-content">
                        <div class="data-quality">
                            <div class="quality-metrics">
                                <div class="quality-metric">
                                    <div class="metric-value">${data.dataQualityReport.overallScore.toFixed(0)}%</div>
                                    <div class="metric-label">Overall Score</div>
                                </div>
                                <div class="quality-metric">
                                    <div class="metric-value">${data.dataQualityReport.completeness[0]?.score.toFixed(0) || 0}%</div>
                                    <div class="metric-label">Completeness</div>
                                </div>
                                <div class="quality-metric">
                                    <div class="metric-value">${data.dataQualityReport.validity[0]?.score.toFixed(0) || 0}%</div>
                                    <div class="metric-label">Validity</div>
                                </div>
                                <div class="quality-metric">
                                    <div class="metric-value">${data.dataQualityReport.uniqueness[0]?.score.toFixed(0) || 0}%</div>
                                    <div class="metric-label">Uniqueness</div>
                                </div>
                            </div>

                            ${data.dataQualityReport.issues.length > 0 ? `
                                <div class="validation-issues">
                                    <h4>Data Quality Issues</h4>
                                    ${data.dataQualityReport.issues.map(issue => `
                                        <div class="issue-item">
                                            <strong>${issue.columnName}:</strong> ${issue.description}
                                        </div>
                                    `).join('')}
                                </div>
                            ` : ''}

                            ${data.dataQualityReport.recommendations.length > 0 ? `
                                <div class="recommendations">
                                    <h4>Recommendations</h4>
                                    <ul>
                                        ${data.dataQualityReport.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                                    </ul>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            ` : ''}
        `;
    }

    private generateColumnMappingStep(): string {
        const data = this.wizardData!;

        return `
            <div class="form-section">
                <div class="section-header">Column Mapping</div>
                <div class="section-content">
                    <p>Map source columns to target table columns. Adjust data types and add transformations as needed.</p>

                    <div class="column-mappings">
                        ${data.detectedColumns.map((column, index) => `
                            <div class="column-mapping">
                                <div>
                                    <div class="form-label">Source Column</div>
                                    <div class="form-input" readonly>${column.name}</div>
                                    <small style="color: var(--vscode-descriptionForeground);">
                                        Type: ${column.type} | Nullable: ${column.nullable ? 'Yes' : 'No'}
                                    </small>
                                </div>
                                <div>
                                    <div class="form-label">Target Column</div>
                                    <input type="text" class="form-input"
                                           value="${data.columnMappings[index]?.targetColumn || column.name}"
                                           onchange="updateColumnMapping('${column.name}', this.value, '${data.columnMappings[index]?.dataType || 'TEXT'}')">
                                </div>
                                <div>
                                    <div class="form-label">Data Type</div>
                                    <select class="form-input"
                                            onchange="updateColumnMapping('${column.name}', '${data.columnMappings[index]?.targetColumn || column.name}', this.value)">
                                        <option value="TEXT" ${data.columnMappings[index]?.dataType === 'TEXT' ? 'selected' : ''}>TEXT</option>
                                        <option value="VARCHAR(255)" ${data.columnMappings[index]?.dataType === 'VARCHAR(255)' ? 'selected' : ''}>VARCHAR(255)</option>
                                        <option value="INTEGER" ${data.columnMappings[index]?.dataType === 'INTEGER' ? 'selected' : ''}>INTEGER</option>
                                        <option value="NUMERIC" ${data.columnMappings[index]?.dataType === 'NUMERIC' ? 'selected' : ''}>NUMERIC</option>
                                        <option value="DATE" ${data.columnMappings[index]?.dataType === 'DATE' ? 'selected' : ''}>DATE</option>
                                        <option value="BOOLEAN" ${data.columnMappings[index]?.dataType === 'BOOLEAN' ? 'selected' : ''}>BOOLEAN</option>
                                        <option value="JSON" ${data.columnMappings[index]?.dataType === 'JSON' ? 'selected' : ''}>JSON</option>
                                    </select>
                                </div>
                                <div>
                                    <div class="form-label">Quality</div>
                                    <div class="quality-score ${this.getQualityClass(data.dataQualityReport?.validity.find(v => v.columnName === column.name)?.score || 0)}">
                                        ${data.dataQualityReport?.validity.find(v => v.columnName === column.name)?.score.toFixed(0) || 0}%
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    private generateTargetConfigStep(): string {
        return `
            <div class="form-section">
                <div class="section-header">Target Configuration</div>
                <div class="section-content">
                    <div class="form-grid">
                        <div class="form-group">
                            <div class="form-label">Target Schema</div>
                            <input type="text" class="form-input" id="targetSchema"
                                   value="${this.wizardData?.targetSchema || 'public'}"
                                   onchange="updateTargetConfig(this.value, document.getElementById('targetTable').value)">
                        </div>
                        <div class="form-group">
                            <div class="form-label">Target Table</div>
                            <input type="text" class="form-input" id="targetTable"
                                   value="${this.wizardData?.targetTable || ''}"
                                   onchange="updateTargetConfig(document.getElementById('targetSchema').value, this.value)"
                                   placeholder="Enter table name">
                        </div>
                    </div>

                    <div class="form-section">
                        <div class="section-header">Import Options</div>
                        <div class="section-content">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label>
                                        <input type="checkbox" id="createTable" ${this.wizardData?.targetTable ? '' : 'checked'}>
                                        Create table if not exists
                                    </label>
                                </div>
                                <div class="form-group">
                                    <label>
                                        <input type="checkbox" id="truncateTable">
                                        Truncate table before import
                                    </label>
                                </div>
                                <div class="form-group">
                                    <label>
                                        <input type="checkbox" id="validateData" checked>
                                        Validate data before import
                                    </label>
                                </div>
                                <div class="form-group">
                                    <label>
                                        <input type="checkbox" id="continueOnError">
                                        Continue on errors
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    private generateValidationStep(): string {
        const data = this.wizardData!;

        return `
            <div class="form-section">
                <div class="section-header">Import Validation</div>
                <div class="section-content">
                    <div class="validation-summary">
                        <h3>Import Summary</h3>
                        <div class="form-grid">
                            <div class="form-group">
                                <div class="form-label">Source File</div>
                                <div class="form-input" readonly>${data.filePath.split('/').pop()}</div>
                            </div>
                            <div class="form-group">
                                <div class="form-label">Target Table</div>
                                <div class="form-input" readonly>${data.targetSchema}.${data.targetTable}</div>
                            </div>
                            <div class="form-group">
                                <div class="form-label">Columns to Import</div>
                                <div class="form-input" readonly>${data.columnMappings.length}</div>
                            </div>
                            <div class="form-group">
                                <div class="form-label">Estimated Rows</div>
                                <div class="form-input" readonly>${data.detectedColumns.length > 0 ? '~' + data.previewData.length * 10 : '0'}</div>
                            </div>
                        </div>
                    </div>

                    <div class="validation-issues">
                        <h3>Validation Results</h3>
                        ${data.validationIssues.length > 0 ? `
                            <div style="background: var(--vscode-inputValidation-warningBackground); border: 1px solid var(--vscode-inputValidation-warningBorder); border-radius: 4px; padding: 10px; margin: 10px 0;">
                                <h4>⚠️ Validation Issues Found</h4>
                                ${data.validationIssues.map(issue => `
                                    <div style="margin: 5px 0;">
                                        <strong>${issue.columnName || 'General'}:</strong> ${issue.message}
                                    </div>
                                `).join('')}
                            </div>
                        ` : `
                            <div style="background: var(--vscode-inputValidation-infoBackground); border: 1px solid var(--vscode-inputValidation-infoBorder); border-radius: 4px; padding: 10px; margin: 10px 0;">
                                ✅ No validation issues found. Ready to import.
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `;
    }

    private generateImportStep(): string {
        return `
            <div class="form-section">
                <div class="section-header">Import Execution</div>
                <div class="section-content">
                    <div style="text-align: center; padding: 40px;">
                        <div style="font-size: 48px; margin-bottom: 20px;">🚀</div>
                        <h3>Ready to Import</h3>
                        <p>Click "Import Data" to start the import process. This may take some time depending on the data size.</p>

                        <div style="background: var(--vscode-textBlockQuote-background); padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <h4>Import Summary</h4>
                            <ul style="text-align: left;">
                                <li><strong>File:</strong> ${this.wizardData?.filePath.split('/').pop()}</li>
                                <li><strong>Target:</strong> ${this.wizardData?.targetSchema}.${this.wizardData?.targetTable}</li>
                                <li><strong>Columns:</strong> ${this.wizardData?.columnMappings.length}</li>
                                <li><strong>Format:</strong> ${this.wizardData?.format.toUpperCase()}</li>
                            </ul>
                        </div>

                        <div style="background: var(--vscode-inputValidation-infoBackground); border: 1px solid var(--vscode-inputValidation-infoBorder); border-radius: 4px; padding: 15px; margin: 20px 0;">
                            <strong>Note:</strong> The import will run in the background. You'll be notified when it completes.
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    private getQualityBadge(score: number): string {
        if (score >= 90) return `<span class="quality-score quality-excellent">${score.toFixed(0)}%</span>`;
        if (score >= 70) return `<span class="quality-score quality-good">${score.toFixed(0)}%</span>`;
        return `<span class="quality-score quality-poor">${score.toFixed(0)}%</span>`;
    }

    private getQualityClass(score: number): string {
        if (score >= 90) return 'quality-excellent';
        if (score >= 70) return 'quality-good';
        return 'quality-poor';
    }

    private async handleWizardMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'nextStep':
                await this.nextStep();
                break;
            case 'previousStep':
                await this.previousStep();
                break;
            case 'finishWizard':
                await this.finishWizard();
                break;
            case 'cancelWizard':
                this.panel?.dispose();
                break;
            case 'updateColumnMapping':
                this.updateColumnMapping(message.sourceColumn, message.targetColumn, message.dataType);
                break;
            case 'updateTargetConfig':
                this.updateTargetConfig(message.table, message.schema);
                break;
        }
    }

    private async nextStep(): Promise<void> {
        if (this.currentStep < 4) {
            this.currentStep++;
            await this.showCurrentStep();
        }
    }

    private async previousStep(): Promise<void> {
        if (this.currentStep > 0) {
            this.currentStep--;
            await this.showCurrentStep();
        }
    }

    private async finishWizard(): Promise<void> {
        if (!this.wizardData) return;

        try {
            // Get target configuration from form
            const targetSchema = 'public'; // Would get from form
            const targetTable = `imported_${Date.now()}`; // Would get from form

            // Execute import
            await this.importService.executeImportJob(
                this.wizardData.jobId,
                targetTable,
                targetSchema,
                this.wizardData.columnMappings
            );

            vscode.window.showInformationMessage('Import started successfully!');

            this.panel?.dispose();
        } catch (error) {
            Logger.error('Failed to execute import', error as Error);
            vscode.window.showErrorMessage(`Import failed: ${(error as Error).message}`);
        }
    }

    private updateColumnMapping(sourceColumn: string, targetColumn: string, dataType: string): void {
        if (!this.wizardData) return;

        const mapping = this.wizardData.columnMappings.find(m => m.sourceColumn === sourceColumn);
        if (mapping) {
            mapping.targetColumn = targetColumn;
            mapping.dataType = dataType;
        }
    }

    private updateTargetConfig(table: string, schema: string): void {
        if (!this.wizardData) return;

        this.wizardData.targetTable = table;
        this.wizardData.targetSchema = schema;
    }

    dispose(): void {
        if (this.panel) {
            this.panel.dispose();
            this.panel = undefined;
        }
        this.wizardData = undefined;
        this.currentStep = 0;
    }
}