import * as vscode from 'vscode';
import { Logger } from '@/utils/Logger';
import { DotNetMigrationScript, DotNetConnectionInfo } from '@/services/PostgreSqlConnectionManager';
export interface MigrationPreviewData {
    id: string;
    migrationScript: DotNetMigrationScript;
    targetConnection: DotNetConnectionInfo;
    previewOptions: MigrationPreviewOptions;
    riskAssessment: RiskAssessment;
    executionPlan: ExecutionStep[];
    createdAt: string;
}

export interface MigrationPreviewOptions {
    dryRun: boolean;
    stopOnError: boolean;
    transactionMode: 'all_or_nothing' | 'continue_on_error';
    backupBeforeExecution: boolean;
    parallelExecution: boolean;
    maxExecutionTime: number; // in seconds
}

export interface RiskAssessment {
    overallRisk: 'low' | 'medium' | 'high' | 'critical';
    riskFactors: RiskFactor[];
    estimatedDowntime: string;
    rollbackComplexity: 'simple' | 'moderate' | 'complex';
    dataLossPotential: 'none' | 'minimal' | 'moderate' | 'high';
}

export interface RiskFactor {
    type: 'data_loss' | 'downtime' | 'dependency' | 'performance' | 'security';
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    mitigation?: string;
}

export interface ExecutionStep {
    id: string;
    order: number;
    type: 'backup' | 'pre_migration' | 'migration' | 'verification' | 'cleanup';
    description: string;
    estimatedDuration: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    sql?: string;
    rollbackSql?: string;
}

export class MigrationPreviewView {
    private panel: vscode.WebviewPanel | undefined;
    private previewData: MigrationPreviewData | undefined;

    constructor() { }

    async showPreview(migrationScript?: DotNetMigrationScript, targetConnection?: DotNetConnectionInfo): Promise<void> {
        try {
            Logger.info('Opening migration preview view');

            if (migrationScript && targetConnection) {
                await this.generatePreview(migrationScript, targetConnection, {
                    dryRun: true,
                    stopOnError: true,
                    transactionMode: 'all_or_nothing',
                    backupBeforeExecution: true,
                    parallelExecution: false,
                    maxExecutionTime: 300
                });
            }

            this.panel = vscode.window.createWebviewPanel(
                'postgresqlMigrationPreview',
                'Migration Preview',
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
                this.previewData = undefined;
            });

            // Generate and set HTML content
            const htmlContent = await this.generatePreviewHtml(this.previewData);
            if (this.panel) {
                this.panel.webview.html = htmlContent;
            }

            // Handle messages from webview
            if (this.panel) {
                this.panel.webview.onDidReceiveMessage(async (message) => {
                    await this.handleWebviewMessage(message);
                });
            }

        } catch (error) {
            Logger.error('Failed to show migration preview', error as Error, 'showPreview');
            vscode.window.showErrorMessage(
                `Failed to open migration preview: ${(error as Error).message}`
            );
        }
    }

    async generatePreview(
        migrationScript: DotNetMigrationScript,
        targetConnection: DotNetConnectionInfo,
        options: MigrationPreviewOptions
    ): Promise<void> {
        try {
            Logger.info('Generating migration preview', 'generatePreview', {
                migrationId: migrationScript.id,
                targetConnection: targetConnection.name
            });

            // Show progress indicator
            const progressOptions: vscode.ProgressOptions = {
                location: vscode.ProgressLocation.Notification,
                title: 'Generating Migration Preview',
                cancellable: true
            };

            await vscode.window.withProgress(progressOptions, async (progress, token) => {
                progress.report({ increment: 0, message: 'Analyzing migration script...' });

                if (token.isCancellationRequested) {
                    throw new Error('Preview generation cancelled by user');
                }

                // Generate preview data
                this.previewData = await this.generatePreviewData(migrationScript, targetConnection, options);

                progress.report({ increment: 50, message: 'Assessing risks...' });

                if (token.isCancellationRequested) {
                    throw new Error('Preview generation cancelled by user');
                }

                // Perform risk assessment
                await this.performRiskAssessment(this.previewData);

                progress.report({ increment: 100, message: 'Preview complete' });

                // Update the view with results
                if (this.panel) {
                    const htmlContent = await this.generatePreviewHtml(this.previewData);
                    this.panel.webview.html = htmlContent;
                }
            });

        } catch (error) {
            Logger.error('Migration preview generation failed', error as Error, 'generatePreview');
            vscode.window.showErrorMessage(
                `Migration preview generation failed: ${(error as Error).message}`
            );
            throw error;
        }
    }

    private async generatePreviewData(
        migrationScript: DotNetMigrationScript,
        targetConnection: DotNetConnectionInfo,
        options?: MigrationPreviewOptions
    ): Promise<MigrationPreviewData> {
        const defaultOptions: MigrationPreviewOptions = {
            dryRun: true,
            stopOnError: true,
            transactionMode: 'all_or_nothing',
            backupBeforeExecution: true,
            parallelExecution: false,
            maxExecutionTime: 300
        };

        const previewOptions = options || defaultOptions;

        // Parse SQL script to generate execution plan
        const executionPlan = this.parseExecutionPlan(migrationScript.sqlScript);

        // Generate risk assessment
        const riskAssessment = this.assessMigrationRisk(migrationScript, executionPlan);

        return {
            id: `preview-${Date.now()}`,
            migrationScript,
            targetConnection,
            previewOptions,
            riskAssessment,
            executionPlan,
            createdAt: new Date().toISOString()
        };
    }

    private generateUniqueId(prefix: string): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        return `${prefix}-${timestamp}-${random}`;
    }

    private parseExecutionPlan(sqlScript: string): ExecutionStep[] {
        const steps: ExecutionStep[] = [];
        const sqlStatements = sqlScript.split(';').filter(stmt => stmt.trim().length > 0);

        // Backup step
        steps.push({
            id: this.generateUniqueId('backup'),
            order: 1,
            type: 'backup',
            description: 'Create database backup before migration',
            estimatedDuration: '30s - 2m',
            status: 'pending'
        });

        // Migration steps
        sqlStatements.forEach((statement, index) => {
            const trimmedStmt = statement.trim().toLowerCase();

            let stepType: ExecutionStep['type'] = 'migration';
            let description = 'Execute SQL statement';

            if (trimmedStmt.includes('create') && trimmedStmt.includes('table')) {
                description = 'Create new table';
            } else if (trimmedStmt.includes('alter') && trimmedStmt.includes('table')) {
                description = 'Modify existing table';
            } else if (trimmedStmt.includes('drop')) {
                description = 'Drop database object';
            } else if (trimmedStmt.includes('insert') || trimmedStmt.includes('update')) {
                description = 'Modify data';
                stepType = 'migration';
            }

            steps.push({
                id: `migration-${index + 2}`,
                order: index + 2,
                type: stepType,
                description,
                estimatedDuration: this.estimateStepDuration(statement),
                status: 'pending',
                sql: statement.trim()
            });
        });

        // Verification step
        steps.push({
            id: this.generateUniqueId('verification'),
            order: steps.length + 1,
            type: 'verification',
            description: 'Verify migration completed successfully',
            estimatedDuration: '15s',
            status: 'pending'
        });

        return steps;
    }

    private estimateStepDuration(sqlStatement: string): string {
        const trimmed = sqlStatement.trim().toLowerCase();

        if (trimmed.includes('create index')) {
            return '1m - 5m';
        } else if (trimmed.includes('alter table') && trimmed.includes('add column')) {
            return '30s - 2m';
        } else if (trimmed.includes('drop')) {
            return '5s - 30s';
        } else if (trimmed.includes('create table')) {
            return '15s - 1m';
        } else {
            return '5s - 30s';
        }
    }

    private assessMigrationRisk(migrationScript: DotNetMigrationScript, executionPlan: ExecutionStep[]): RiskAssessment {
        const riskFactors: RiskFactor[] = [];
        let overallRisk: RiskAssessment['overallRisk'] = 'low';

        // Analyze SQL script for risk factors
        const sqlLower = migrationScript.sqlScript.toLowerCase();

        // Check for data-dropping operations
        if (sqlLower.includes('drop table') || sqlLower.includes('truncate')) {
            riskFactors.push({
                type: 'data_loss',
                severity: 'critical',
                description: 'Migration contains operations that may result in data loss',
                mitigation: 'Ensure backup is created before execution and verify data integrity after migration'
            });
            overallRisk = 'critical';
        }

        // Check for large data modifications
        if (sqlLower.includes('update') || sqlLower.includes('delete')) {
            riskFactors.push({
                type: 'data_loss',
                severity: 'high',
                description: 'Migration modifies existing data',
                mitigation: 'Review all UPDATE and DELETE statements carefully'
            });
            if (overallRisk !== 'critical') { overallRisk = 'high'; }
        }

        // Check for schema changes that might cause downtime
        if (sqlLower.includes('alter table') && (sqlLower.includes('drop column') || sqlLower.includes('alter column'))) {
            riskFactors.push({
                type: 'downtime',
                severity: 'medium',
                description: 'Schema changes may require brief downtime',
                mitigation: 'Execute during maintenance window if possible'
            });
            if (overallRisk === 'low') { overallRisk = 'medium'; }
        }

        // Check for dependency risks
        if (executionPlan.length > 10) {
            riskFactors.push({
                type: 'dependency',
                severity: 'medium',
                description: 'Complex migration with many steps increases failure risk',
                mitigation: 'Test migration thoroughly in staging environment first'
            });
            if (overallRisk === 'low') { overallRisk = 'medium'; }
        }

        // Estimate downtime
        const estimatedDowntime = this.estimateDowntime(executionPlan);

        // Assess rollback complexity
        const rollbackComplexity = this.assessRollbackComplexity(migrationScript);

        return {
            overallRisk,
            riskFactors,
            estimatedDowntime,
            rollbackComplexity,
            dataLossPotential: riskFactors.some(f => f.type === 'data_loss' && f.severity === 'critical') ? 'high' : 'minimal'
        };
    }

    private estimateDowntime(executionPlan: ExecutionStep[]): string {
        const totalSteps = executionPlan.filter(s => s.type === 'migration').length;
        if (totalSteps <= 3) { return '< 1 minute'; }
        if (totalSteps <= 10) { return '1-5 minutes'; }
        return '5-15 minutes';
    }

    private assessRollbackComplexity(migrationScript: DotNetMigrationScript): 'simple' | 'moderate' | 'complex' {
        if (!migrationScript.rollbackScript || migrationScript.rollbackScript.trim().length === 0) {
            return 'complex';
        }

        const rollbackStatements = migrationScript.rollbackScript.split(';').length;
        if (rollbackStatements <= 3) { return 'simple'; }
        if (rollbackStatements <= 10) { return 'moderate'; }
        return 'complex';
    }

    private async performRiskAssessment(previewData: MigrationPreviewData): Promise<void> {
        // Additional risk assessment logic can be added here
        // For now, we rely on the basic assessment in generatePreviewData
        Logger.info('Risk assessment completed', 'performRiskAssessment', {
            overallRisk: previewData.riskAssessment.overallRisk,
            riskFactorCount: previewData.riskAssessment.riskFactors.length
        });
    }

    private async generatePreviewHtml(data?: MigrationPreviewData): Promise<string> {
        if (!data) {
            return this.generateEmptyStateHtml();
        }

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Migration Preview</title>
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
                        --vscode-gitDecoration-renamedResourceForeground: #ffd33d;
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

                    .header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 15px 20px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        background: var(--vscode-editor-background);
                    }

                    .migration-info {
                        display: flex;
                        gap: 20px;
                        align-items: center;
                    }

                    .risk-badge {
                        padding: 4px 12px;
                        border-radius: 12px;
                        font-size: 11px;
                        font-weight: bold;
                        text-transform: uppercase;
                    }

                    .risk-low { background: var(--vscode-gitDecoration-addedResourceForeground); color: var(--vscode-editor-background); }
                    .risk-medium { background: var(--vscode-gitDecoration-renamedResourceForeground); color: var(--vscode-editor-background); }
                    .risk-high { background: var(--vscode-gitDecoration-modifiedResourceForeground); color: var(--vscode-editor-background); }
                    .risk-critical { background: var(--vscode-gitDecoration-deletedResourceForeground); color: var(--vscode-editor-background); }

                    .content-area {
                        flex: 1;
                        overflow: auto;
                        padding: 20px;
                    }

                    .preview-grid {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 20px;
                        margin-bottom: 20px;
                    }

                    .preview-card {
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 6px;
                        overflow: hidden;
                    }

                    .card-header {
                        background: var(--vscode-titleBar-activeBackground, #2f2f2f);
                        padding: 12px 15px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                    }

                    .card-title {
                        font-weight: bold;
                        font-size: 13px;
                    }

                    .card-content {
                        padding: 15px;
                    }

                    .execution-plan {
                        max-height: 300px;
                        overflow-y: auto;
                    }

                    .execution-step {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 8px 0;
                        border-bottom: 1px solid var(--vscode-panel-border);
                    }

                    .execution-step:last-child {
                        border-bottom: none;
                    }

                    .step-number {
                        width: 24px;
                        height: 24px;
                        border-radius: 50%;
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 11px;
                        font-weight: bold;
                        flex-shrink: 0;
                    }

                    .step-content {
                        flex: 1;
                    }

                    .step-title {
                        font-weight: bold;
                        font-size: 12px;
                        margin-bottom: 2px;
                    }

                    .step-meta {
                        font-size: 11px;
                        color: var(--vscode-descriptionForeground);
                    }

                    .step-duration {
                        font-size: 11px;
                        color: var(--vscode-textLink-foreground);
                    }

                    .risk-factors {
                        max-height: 200px;
                        overflow-y: auto;
                    }

                    .risk-factor {
                        display: flex;
                        gap: 10px;
                        padding: 8px 0;
                        border-bottom: 1px solid var(--vscode-panel-border);
                    }

                    .risk-factor:last-child {
                        border-bottom: none;
                    }

                    .risk-indicator {
                        width: 12px;
                        height: 12px;
                        border-radius: 50%;
                        flex-shrink: 0;
                        margin-top: 2px;
                    }

                    .risk-critical { background: var(--vscode-gitDecoration-deletedResourceForeground); }
                    .risk-high { background: var(--vscode-gitDecoration-modifiedResourceForeground); }
                    .risk-medium { background: var(--vscode-gitDecoration-renamedResourceForeground); }
                    .risk-low { background: var(--vscode-gitDecoration-addedResourceForeground); }

                    .risk-content {
                        flex: 1;
                    }

                    .risk-description {
                        font-size: 12px;
                        margin-bottom: 4px;
                    }

                    .risk-mitigation {
                        font-size: 11px;
                        color: var(--vscode-descriptionForeground);
                        font-style: italic;
                    }

                    .sql-preview {
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 4px;
                        padding: 15px;
                        font-family: 'Consolas', 'Courier New', monospace;
                        font-size: 12px;
                        white-space: pre-wrap;
                        max-height: 300px;
                        overflow-y: auto;
                    }

                    .footer {
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

                    .btn-primary:hover {
                        background: var(--vscode-button-hoverBackground);
                    }

                    .btn-secondary {
                        background: var(--vscode-button-secondaryBackground, #3c3c3c);
                        color: var(--vscode-button-secondaryForeground, #cccccc);
                    }

                    .btn-secondary:hover {
                        background: var(--vscode-list-hoverBackground);
                    }

                    .btn-danger {
                        background: var(--vscode-gitDecoration-deletedResourceForeground);
                        color: var(--vscode-editor-background);
                    }

                    .btn-danger:hover {
                        opacity: 0.9;
                    }

                    .options-toggle {
                        margin-bottom: 15px;
                    }

                    .toggle-btn {
                        background: transparent;
                        border: 1px solid var(--vscode-panel-border);
                        color: var(--vscode-editor-foreground);
                        padding: 6px 12px;
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 11px;
                    }

                    .toggle-btn.active {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                    }

                    @media (max-width: 768px) {
                        .preview-grid {
                            grid-template-columns: 1fr;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="migration-info">
                        <h2>Migration Preview</h2>
                        <span class="risk-badge risk-${data.riskAssessment.overallRisk}">
                            ${data.riskAssessment.overallRisk.toUpperCase()} RISK
                        </span>
                    </div>
                    <div class="migration-meta">
                        <small>Generated: ${new Date(data.createdAt).toLocaleString()}</small>
                    </div>
                </div>

                <div class="content-area">
                    <!-- Risk Assessment Summary -->
                    <div class="preview-card" style="margin-bottom: 20px;">
                        <div class="card-header">
                            <div class="card-title">Risk Assessment</div>
                        </div>
                        <div class="card-content">
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 15px;">
                                <div>
                                    <div style="font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 5px;">Overall Risk</div>
                                    <div style="font-size: 18px; font-weight: bold; color: var(--vscode-gitDecoration-${data.riskAssessment.overallRisk === 'critical' ? 'deletedResource' : data.riskAssessment.overallRisk === 'high' ? 'modifiedResource' : data.riskAssessment.overallRisk === 'medium' ? 'renamedResource' : 'addedResource'}Foreground);">
                                        ${data.riskAssessment.overallRisk.toUpperCase()}
                                    </div>
                                </div>
                                <div>
                                    <div style="font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 5px;">Estimated Downtime</div>
                                    <div style="font-size: 18px; font-weight: bold;">${data.riskAssessment.estimatedDowntime}</div>
                                </div>
                                <div>
                                    <div style="font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 5px;">Rollback Complexity</div>
                                    <div style="font-size: 18px; font-weight: bold; color: ${data.riskAssessment.rollbackComplexity === 'simple' ? 'var(--vscode-gitDecoration-addedResourceForeground)' : data.riskAssessment.rollbackComplexity === 'moderate' ? 'var(--vscode-gitDecoration-renamedResourceForeground)' : 'var(--vscode-gitDecoration-deletedResourceForeground)'};">${data.riskAssessment.rollbackComplexity.toUpperCase()}</div>
                                </div>
                                <div>
                                    <div style="font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 5px;">Data Loss Risk</div>
                                    <div style="font-size: 18px; font-weight: bold;">${data.riskAssessment.dataLossPotential.toUpperCase()}</div>
                                </div>
                            </div>

                            ${data.riskAssessment.riskFactors.length > 0 ? `
                                <div>
                                    <div style="font-size: 12px; font-weight: bold; margin-bottom: 10px;">Risk Factors</div>
                                    <div class="risk-factors">
                                        ${data.riskAssessment.riskFactors.map(factor => `
                                            <div class="risk-factor">
                                                <div class="risk-indicator risk-${factor.severity}"></div>
                                                <div class="risk-content">
                                                    <div class="risk-description">${factor.description}</div>
                                                    ${factor.mitigation ? `<div class="risk-mitigation">Mitigation: ${factor.mitigation}</div>` : ''}
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    </div>

                    <div class="preview-grid">
                        <!-- Execution Plan -->
                        <div class="preview-card">
                            <div class="card-header">
                                <div class="card-title">Execution Plan</div>
                            </div>
                            <div class="card-content">
                                <div class="execution-plan">
                                    ${data.executionPlan.map(step => `
                                        <div class="execution-step">
                                            <div class="step-number">${step.order}</div>
                                            <div class="step-content">
                                                <div class="step-title">${step.description}</div>
                                                <div class="step-meta">
                                                    <span class="step-duration">Duration: ${step.estimatedDuration}</span>
                                                    <span style="margin-left: 10px;">Status: ${step.status}</span>
                                                </div>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        </div>

                        <!-- SQL Preview -->
                        <div class="preview-card">
                            <div class="card-header">
                                <div class="card-title">SQL Preview</div>
                                <div class="options-toggle">
                                    <button class="toggle-btn" onclick="toggleSqlView('migration')">Migration</button>
                                    <button class="toggle-btn" onclick="toggleSqlView('rollback')">Rollback</button>
                                </div>
                            </div>
                            <div class="card-content">
                                <div id="sqlContainer" class="sql-preview">
                                    ${data.migrationScript.sqlScript}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="footer">
                    <div class="info">
                        Target: ${data.targetConnection.name} • ${data.executionPlan.length} steps • ${data.previewOptions.dryRun ? 'Dry Run' : 'Live Execution'}
                        ${data.migrationScript.rollbackScript && data.migrationScript.rollbackScript.trim().length > 0 ? '• ✅ Rollback Available' : '• ❌ No Rollback'}
                    </div>
                    <div class="actions">
                        <button class="btn btn-secondary" onclick="exportPreview()">Export</button>
                        <button class="btn btn-primary" onclick="proceedWithMigration()">Execute Migration</button>
                        ${data.migrationScript.rollbackScript && data.migrationScript.rollbackScript.trim().length > 0 ? `<button class="btn btn-danger" onclick="rollbackMigration()">Rollback Migration</button>` : ''}
                    </div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    let currentSqlView = 'migration';

                    function toggleSqlView(type) {
                        const container = document.getElementById('sqlContainer');
                        const migrationScript = ${JSON.stringify(data.migrationScript)};

                        if (type === 'migration') {
                            container.textContent = migrationScript.sqlScript;
                            currentSqlView = 'migration';
                        } else {
                            container.textContent = migrationScript.rollbackScript;
                            currentSqlView = 'rollback';
                        }

                        // Update button states
                        document.querySelectorAll('.toggle-btn').forEach(btn => {
                            btn.classList.remove('active');
                        });
                        event.target.classList.add('active');
                    }

                    function exportPreview() {
                        vscode.postMessage({
                            command: 'exportPreview',
                            data: ${JSON.stringify(data)}
                        });
                    }

                    function proceedWithMigration() {
                        vscode.postMessage({
                            command: 'proceedWithMigration',
                            previewData: ${JSON.stringify(data)}
                        });
                    }

                    function rollbackMigration() {
                        vscode.postMessage({
                            command: 'rollbackMigration',
                            migrationScript: ${JSON.stringify(data.migrationScript)}
                        });
                    }
                </script>
            </body>
            </html>
        `;
    }

    private generateEmptyStateHtml(): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Migration Preview</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        padding: 40px;
                        margin: 0;
                        background: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        height: 100vh;
                        text-align: center;
                    }
                    .empty-state {
                        max-width: 500px;
                    }
                    .icon {
                        font-size: 48px;
                        margin-bottom: 20px;
                    }
                    .title {
                        font-size: 24px;
                        font-weight: bold;
                        margin-bottom: 10px;
                    }
                    .description {
                        color: var(--vscode-descriptionForeground);
                        margin-bottom: 30px;
                        line-height: 1.5;
                    }
                    .btn {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 12px 24px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: bold;
                    }
                    .btn:hover {
                        background: var(--vscode-button-hoverBackground);
                    }
                </style>
            </head>
            <body>
                <div class="empty-state">
                    <div class="icon">📋</div>
                    <div class="title">No Migration Preview</div>
                    <div class="description">
                        Generate a migration script first, then preview it here to see the execution plan and risk assessment.
                    </div>
                    <button class="btn" onclick="generateNewMigration()">Generate Migration</button>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    function generateNewMigration() {
                        vscode.postMessage({
                            command: 'generateNewMigration'
                        });
                    }
                </script>
            </body>
            </html>
        `;
    }

    private async handleWebviewMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'exportPreview':
                await this.exportPreview(message.data);
                break;
            case 'proceedWithMigration':
                await this.proceedWithMigration(message.previewData);
                break;
            case 'rollbackMigration':
                await this.rollbackMigration(message.migrationScript);
                break;
            case 'generateNewMigration':
                await vscode.commands.executeCommand('postgresql.generateMigration');
                break;
        }
    }

    private async exportPreview(data: MigrationPreviewData): Promise<void> {
        try {
            const exportContent = this.generateExportContent(data);
            const uri = await vscode.window.showSaveDialog({
                filters: {
                    'JSON Files': ['json'],
                    'Text Files': ['txt'],
                    'All Files': ['*']
                },
                defaultUri: vscode.Uri.file(`migration-preview-${new Date().toISOString().split('T')[0]}.json`)
            });

            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(exportContent, 'utf8'));
                vscode.window.showInformationMessage('Migration preview exported successfully');
            }
        } catch (error) {
            Logger.error('Failed to export migration preview', error as Error, 'exportPreview');
            vscode.window.showErrorMessage('Failed to export migration preview');
        }
    }

    private generateExportContent(data: MigrationPreviewData): string {
        return JSON.stringify({
            migrationPreview: {
                id: data.id,
                createdAt: data.createdAt,
                targetConnection: data.targetConnection.name,
                options: data.previewOptions,
                riskAssessment: data.riskAssessment,
                executionPlan: data.executionPlan,
                sqlScript: data.migrationScript.sqlScript,
                rollbackScript: data.migrationScript.rollbackScript
            }
        }, null, 2);
    }

    private async proceedWithMigration(previewData: MigrationPreviewData): Promise<void> {
        try {
            // Show confirmation dialog for high-risk migrations
            if (previewData.riskAssessment.overallRisk === 'critical' || previewData.riskAssessment.overallRisk === 'high') {
                const confirmed = await vscode.window.showWarningMessage(
                    `This migration has been assessed as ${previewData.riskAssessment.overallRisk} risk. Do you want to proceed?`,
                    'Proceed Anyway',
                    'Cancel'
                );

                if (confirmed !== 'Proceed Anyway') {
                    return;
                }
            }

            await vscode.commands.executeCommand('postgresql.executeMigration', previewData.migrationScript);
        } catch (error) {
            Logger.error('Failed to proceed with migration', error as Error, 'proceedWithMigration');
            vscode.window.showErrorMessage('Failed to execute migration');
        }
    }

    private async rollbackMigration(migrationScript: DotNetMigrationScript): Promise<void> {
        try {
            // Show confirmation dialog for rollback
            const confirmed = await vscode.window.showWarningMessage(
                `Are you sure you want to rollback this migration?\n\nMigration: ${migrationScript.id}\nThis action cannot be undone!`,
                'Rollback Migration',
                'Cancel'
            );

            if (confirmed !== 'Rollback Migration') {
                return;
            }

            await vscode.commands.executeCommand('postgresql.rollbackMigration', migrationScript);
        } catch (error) {
            Logger.error('Failed to initiate rollback', error as Error, 'rollbackMigration');
            vscode.window.showErrorMessage('Failed to rollback migration');
        }
    }

    dispose(): void {
        if (this.panel) {
            this.panel.dispose();
            this.panel = undefined;
        }
        this.previewData = undefined;
    }
}