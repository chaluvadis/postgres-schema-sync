import * as vscode from 'vscode';
import { Logger } from '@/utils/Logger';
import { DotNetIntegrationService, DotNetSchemaComparison, DotNetConnectionInfo } from '@/services/DotNetIntegrationService';
import { SchemaManager, DetailedSchemaComparisonResult, ColumnComparisonDetail, IndexComparisonDetail, ConstraintDifference, ViewDependencyNode } from '@/managers/schema';
import { ConnectionManager } from '@/managers/ConnectionManager';

export interface SchemaComparisonData {
    id: string;
    sourceConnection: DotNetConnectionInfo;
    targetConnection: DotNetConnectionInfo;
    differences: SchemaDifference[];
    comparisonOptions: ComparisonOptions;
    createdAt: string;
    executionTime: string;
}

export interface SchemaDifference {
    id: string;
    type: 'Added' | 'Removed' | 'Modified' | 'Moved';
    objectType: string;
    objectName: string;
    schema: string;
    sourceDefinition?: string | undefined;
    targetDefinition?: string | undefined;
    differenceDetails: string[];
    severity: 'low' | 'medium' | 'high' | 'critical';
    conflictResolution?: ConflictResolution;
    impactAnalysis?: ImpactAnalysis;
}

export interface ConflictResolution {
    strategy: 'source_wins' | 'target_wins' | 'merge' | 'manual' | 'skip';
    resolved: boolean;
    customScript?: string;
    notes?: string;
    resolvedBy?: string;
    resolvedAt?: Date;
}

export interface ImpactAnalysis {
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    affectedObjects: string[];
    dataLossPotential: boolean;
    breakingChanges: boolean;
    dependencies: string[];
    warnings: string[];
    recommendations: string[];
}

export interface ComparisonOptions {
    mode: 'strict' | 'lenient';
    ignoreSchemas: string[];
    includeSystemObjects: boolean;
    caseSensitive: boolean;
}

// Enhanced comparison interfaces for detailed analysis
export interface EnhancedSchemaComparisonData extends SchemaComparisonData {
    detailedComparison?: DetailedSchemaComparisonResult;
    columnComparisons?: Map<string, ColumnComparisonDetail[]>;
    indexComparisons?: Map<string, IndexComparisonDetail[]>;
    constraintComparisons?: Map<string, ConstraintDifference[]>;
    viewDependencies?: Map<string, ViewDependencyNode>;
    dependencyGraph?: any;
}

export interface ComparisonViewMode {
    type: 'basic' | 'detailed' | 'dependency' | 'performance';
    showColumnDetails: boolean;
    showIndexDetails: boolean;
    showConstraintDetails: boolean;
    showViewDependencies: boolean;
    groupByObjectType: boolean;
    showPerformanceMetrics: boolean;
}

export interface ComparisonFilter {
    objectTypes: string[];
    schemas: string[];
    severityLevels: string[];
    changeTypes: string[];
    showOnlyBreaking: boolean;
    showOnlyDataLoss: boolean;
}

export class SchemaComparisonView {
    private panel: vscode.WebviewPanel | undefined;
    private comparisonData: EnhancedSchemaComparisonData | undefined;
    private schemaManager: SchemaManager;
    private currentViewMode: ComparisonViewMode;
    private currentFilter: ComparisonFilter;

    constructor(
        private dotNetService: DotNetIntegrationService,
        private connectionManager: ConnectionManager
    ) {
        this.schemaManager = new SchemaManager(connectionManager);
        this.currentViewMode = {
            type: 'basic',
            showColumnDetails: false,
            showIndexDetails: false,
            showConstraintDetails: false,
            showViewDependencies: false,
            groupByObjectType: true,
            showPerformanceMetrics: false
        };
        this.currentFilter = {
            objectTypes: [],
            schemas: [],
            severityLevels: [],
            changeTypes: [],
            showOnlyBreaking: false,
            showOnlyDataLoss: false
        };
    }

    async showComparison(comparisonData?: SchemaComparisonData): Promise<void> {
        try {
            Logger.info('Opening enhanced schema comparison view');

            if (comparisonData) {
                this.comparisonData = comparisonData as EnhancedSchemaComparisonData;
            }

            this.panel = vscode.window.createWebviewPanel(
                'postgresqlSchemaComparison',
                'Schema Comparison',
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
                this.comparisonData = undefined;
            });

            // Generate and set HTML content
            const htmlContent = await this.generateEnhancedComparisonHtml(this.comparisonData);
            this.panel.webview.html = htmlContent;

            // Handle messages from webview
            this.panel.webview.onDidReceiveMessage(async (message) => {
                await this.handleWebviewMessage(message);
            });

        } catch (error) {
            Logger.error('Failed to show schema comparison', error as Error);
            vscode.window.showErrorMessage(
                `Failed to open schema comparison: ${(error as Error).message}`
            );
        }
    }

    async performDetailedComparison(
        sourceConnection: DotNetConnectionInfo,
        targetConnection: DotNetConnectionInfo,
        options: ComparisonOptions
    ): Promise<void> {
        try {
            Logger.info('Performing detailed schema comparison', 'performDetailedComparison', {
                source: sourceConnection.name,
                target: targetConnection.name
            });

            // Show progress indicator
            const progressOptions: vscode.ProgressOptions = {
                location: vscode.ProgressLocation.Notification,
                title: 'Performing Detailed Schema Comparison',
                cancellable: true
            };

            await vscode.window.withProgress(progressOptions, async (progress, token) => {
                progress.report({ increment: 0, message: 'Extracting detailed metadata...' });

                if (token.isCancellationRequested) {
                    throw new Error('Detailed comparison cancelled by user');
                }

                // Get connection IDs for SchemaManager
                const sourceConnectionId = sourceConnection.id;
                const targetConnectionId = targetConnection.id;

                // Perform detailed comparison using SchemaManager
                const detailedResult = await this.schemaManager.compareSchemasDetailed(
                    sourceConnectionId,
                    targetConnectionId,
                    options
                );

                progress.report({ increment: 50, message: 'Analyzing detailed differences...' });

                if (token.isCancellationRequested) {
                    throw new Error('Detailed comparison cancelled by user');
                }

                // Convert detailed result to enhanced view format
                this.comparisonData = this.convertDetailedComparison(detailedResult, sourceConnection, targetConnection, options);

                progress.report({ increment: 100, message: 'Detailed comparison complete' });

                // Update the view with enhanced results
                if (this.panel) {
                    const htmlContent = await this.generateEnhancedComparisonHtml(this.comparisonData);
                    this.panel.webview.html = htmlContent;
                }
            });

        } catch (error) {
            Logger.error('Detailed schema comparison failed', error as Error);
            vscode.window.showErrorMessage(
                `Detailed schema comparison failed: ${(error as Error).message}`
            );
            throw error;
        }
    }

    private convertDetailedComparison(
        detailedResult: DetailedSchemaComparisonResult,
        sourceConnection: DotNetConnectionInfo,
        targetConnection: DotNetConnectionInfo,
        options: ComparisonOptions
    ): EnhancedSchemaComparisonData {
        return {
            id: detailedResult.comparisonId,
            sourceConnection,
            targetConnection,
            differences: detailedResult.differences,
            comparisonOptions: options,
            createdAt: detailedResult.createdAt.toISOString(),
            executionTime: detailedResult.executionTime.toString(),
            detailedComparison: detailedResult,
            columnComparisons: detailedResult.columnComparisons,
            indexComparisons: detailedResult.indexComparisons,
            constraintComparisons: detailedResult.constraintComparisons,
            viewDependencies: detailedResult.viewDependencies,
            dependencyGraph: detailedResult.dependencyGraph
        };
    }

    private async generateEnhancedComparisonHtml(data?: EnhancedSchemaComparisonData): Promise<string> {
        if (!data) {
            return this.generateEmptyStateHtml();
        }

        const differencesByType = this.groupDifferencesByType(data.differences);
        const hasDetailedData = data.detailedComparison !== undefined;

        return `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Enhanced Schema Comparison Results</title>
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

                .comparison-info {
                    display: flex;
                    gap: 20px;
                    align-items: center;
                }

                .connection-badge {
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 11px;
                    font-weight: bold;
                }

                .source-badge {
                    background: var(--vscode-gitDecoration-addedResourceForeground);
                    color: var(--vscode-editor-background);
                }

                .target-badge {
                    background: var(--vscode-gitDecoration-deletedResourceForeground);
                    color: var(--vscode-editor-background);
                }

                .view-mode-selector {
                    display: flex;
                    gap: 10px;
                    align-items: center;
                }

                .view-mode-btn {
                    padding: 4px 12px;
                    border: 1px solid var(--vscode-panel-border);
                    background: transparent;
                    color: var(--vscode-editor-foreground);
                    border-radius: 3px;
                    cursor: pointer;
                    font-size: 11px;
                }

                .view-mode-btn.active {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border-color: var(--vscode-button-background);
                }

                .content-area {
                    flex: 1;
                    overflow: auto;
                    padding: 20px;
                }

                .summary-cards {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 15px;
                    margin-bottom: 20px;
                }

                .summary-card {
                    background: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 6px;
                    padding: 15px;
                    text-align: center;
                }

                .summary-number {
                    font-size: 24px;
                    font-weight: bold;
                    margin-bottom: 5px;
                }

                .summary-label {
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                    text-transform: uppercase;
                }

                .detailed-analysis-section {
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
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .section-title {
                    font-weight: bold;
                    font-size: 13px;
                }

                .analysis-tabs {
                    display: flex;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    background: var(--vscode-titleBar-activeBackground, #2f2f2f);
                }

                .analysis-tab {
                    background: transparent;
                    border: none;
                    padding: 8px 16px;
                    color: var(--vscode-editor-foreground);
                    cursor: pointer;
                    border-bottom: 2px solid transparent;
                    font-size: 12px;
                }

                .analysis-tab.active {
                    border-bottom-color: var(--vscode-textLink-foreground);
                    background: var(--vscode-editor-background);
                }

                .analysis-content {
                    padding: 15px;
                }

                .metrics-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                    gap: 15px;
                    margin-bottom: 20px;
                }

                .metric-item {
                    padding: 15px;
                    background: var(--vscode-textBlockQuote-background);
                    border-radius: 4px;
                    border: 1px solid var(--vscode-panel-border);
                }

                .metric-value {
                    font-size: 18px;
                    font-weight: bold;
                    margin-bottom: 5px;
                }

                .metric-label {
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                }

                .dependency-visualization {
                    background: var(--vscode-textBlockQuote-background);
                    padding: 15px;
                    border-radius: 4px;
                    margin-bottom: 15px;
                    min-height: 300px;
                    position: relative;
                }

                .dependency-node {
                    position: absolute;
                    width: 60px;
                    height: 60px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 10px;
                    font-weight: bold;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .dependency-node:hover {
                    transform: scale(1.1);
                }

                .dependency-edge {
                    position: absolute;
                    height: 2px;
                    background: var(--vscode-panel-border);
                }

                .node-table { background: var(--vscode-gitDecoration-addedResourceForeground); color: white; }
                .node-view { background: var(--vscode-gitDecoration-modifiedResourceForeground); color: white; }
                .node-index { background: var(--vscode-gitDecoration-renamedResourceForeground); color: white; }
                .node-constraint { background: var(--vscode-gitDecoration-deletedResourceForeground); color: white; }

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
            </style>
        </head>
        <body>
            <div class="header">
                <div class="comparison-info">
                    <h2>Enhanced Schema Comparison Results</h2>
                    <span class="connection-badge source-badge">Source: ${data.sourceConnection.name}</span>
                    <span class="connection-badge target-badge">Target: ${data.targetConnection.name}</span>
                </div>
                <div class="view-mode-selector">
                    <button class="view-mode-btn ${!hasDetailedData ? 'active' : ''}" onclick="switchViewMode('basic')">Basic</button>
                    <button class="view-mode-btn ${hasDetailedData ? 'active' : ''}" onclick="switchViewMode('detailed')" ${!hasDetailedData ? 'disabled' : ''}>Detailed</button>
                    <button class="view-mode-btn" onclick="switchViewMode('dependency')">Dependencies</button>
                    <button class="view-mode-btn" onclick="switchViewMode('performance')">Performance</button>
                </div>
            </div>

            <div class="content-area">
                ${hasDetailedData ? `
                    <div class="detailed-analysis-section">
                        <div class="section-header">
                            <div class="section-title">Detailed Analysis</div>
                        </div>
                        <div class="analysis-tabs">
                            <button class="analysis-tab active" onclick="showAnalysisTab('overview')">Overview</button>
                            <button class="analysis-tab" onclick="showAnalysisTab('columns')">Columns</button>
                            <button class="analysis-tab" onclick="showAnalysisTab('indexes')">Indexes</button>
                            <button class="analysis-tab" onclick="showAnalysisTab('constraints')">Constraints</button>
                            <button class="analysis-tab" onclick="showAnalysisTab('dependencies')">Dependencies</button>
                        </div>
                        <div id="analysisContent" class="analysis-content">
                            ${this.generateOverviewTab(data)}
                        </div>
                    </div>
                ` : ''}

                <div class="summary-cards">
                    <div class="summary-card">
                        <div class="summary-number" style="color: var(--vscode-gitDecoration-addedResourceForeground);">
                            ${differencesByType.Added || 0}
                        </div>
                        <div class="summary-label">Added</div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-number" style="color: var(--vscode-gitDecoration-deletedResourceForeground);">
                            ${differencesByType.Removed || 0}
                        </div>
                        <div class="summary-label">Removed</div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-number" style="color: var(--vscode-gitDecoration-modifiedResourceForeground);">
                            ${differencesByType.Modified || 0}
                        </div>
                        <div class="summary-label">Modified</div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-number">${data.differences.length}</div>
                        <div class="summary-label">Total</div>
                    </div>
                </div>
            </div>

            <div class="footer">
                <div class="info">
                    ${data.differences.length} differences found • Mode: ${data.comparisonOptions.mode}
                    ${hasDetailedData ? '• Enhanced analysis available' : ''}
                </div>
                <div class="actions">
                    <button class="btn btn-secondary" onclick="exportComparison()">Export</button>
                    <button class="btn btn-primary" onclick="generateMigration()">Generate Migration</button>
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                let currentViewMode = '${hasDetailedData ? 'detailed' : 'basic'}';

                function switchViewMode(mode) {
                    if (mode === 'basic' && !${hasDetailedData}) {
                        return; // Cannot switch to basic if no detailed data
                    }

                    currentViewMode = mode;
                    document.querySelectorAll('.view-mode-btn').forEach(btn => {
                        btn.classList.remove('active');
                    });
                    event.target.classList.add('active');

                    // Update content based on view mode
                    updateViewContent(mode);
                }

                function showAnalysisTab(tabName) {
                    document.querySelectorAll('.analysis-tab').forEach(tab => {
                        tab.classList.remove('active');
                    });
                    event.target.classList.add('active');

                    const contentDiv = document.getElementById('analysisContent');
                    const data = ${JSON.stringify(data)};

                    switch (tabName) {
                        case 'overview':
                            contentDiv.innerHTML = \`${this.generateOverviewTab(data)}\`;
                            break;
                        case 'columns':
                            contentDiv.innerHTML = generateColumnsTab(data);
                            break;
                        case 'indexes':
                            contentDiv.innerHTML = generateIndexesTab(data);
                            break;
                        case 'constraints':
                            contentDiv.innerHTML = generateConstraintsTab(data);
                            break;
                        case 'dependencies':
                            contentDiv.innerHTML = generateDependenciesTab(data);
                            break;
                    }
                }

                function generateColumnsTab(data) {
                    const columnComparisons = data.detailedComparison?.columnComparisons;
                    if (!columnComparisons || columnComparisons.size === 0) {
                        return '<div class="analysis-content">No column comparison data available</div>';
                    }

                    let html = '<div class="metrics-grid">';
                    for (const [tableName, columns] of columnComparisons) {
                        html += \`
                            <div class="metric-item">
                                <div class="metric-value">\${columns.length}</div>
                                <div class="metric-label">Column Differences in \${tableName}</div>
                            </div>
                        \`;
                    }
                    html += '</div>';
                    return html;
                }

                function generateIndexesTab(data) {
                    const indexComparisons = data.detailedComparison?.indexComparisons;
                    if (!indexComparisons || indexComparisons.size === 0) {
                        return '<div class="analysis-content">No index comparison data available</div>';
                    }

                    let html = '<div class="metrics-grid">';
                    for (const [tableName, indexes] of indexComparisons) {
                        html += \`
                            <div class="metric-item">
                                <div class="metric-value">\${indexes.length}</div>
                                <div class="metric-label">Index Differences in \${tableName}</div>
                            </div>
                        \`;
                    }
                    html += '</div>';
                    return html;
                }

                function generateConstraintsTab(data) {
                    const constraintComparisons = data.detailedComparison?.constraintComparisons;
                    if (!constraintComparisons || constraintComparisons.size === 0) {
                        return '<div class="analysis-content">No constraint comparison data available</div>';
                    }

                    let html = '<div class="metrics-grid">';
                    for (const [tableName, constraints] of constraintComparisons) {
                        html += \`
                            <div class="metric-item">
                                <div class="metric-value">\${constraints.length}</div>
                                <div class="metric-label">Constraint Differences in \${tableName}</div>
                            </div>
                        \`;
                    }
                    html += '</div>';
                    return html;
                }

                function generateDependenciesTab(data) {
                    const viewDependencies = data.detailedComparison?.viewDependencies;
                    if (!viewDependencies || viewDependencies.size === 0) {
                        return '<div class="analysis-content">No dependency data available</div>';
                    }

                    return \`
                        <div class="dependency-visualization">
                            <div style="text-align: center; color: var(--vscode-descriptionForeground);">
                                Dependency visualization would be rendered here
                                (Total views with dependencies: \${viewDependencies.size})
                            </div>
                        </div>
                    \`;
                }

                function exportComparison() {
                    vscode.postMessage({
                        command: 'exportComparison',
                        data: ${JSON.stringify(data)}
                    });
                }

                function generateMigration() {
                    vscode.postMessage({
                        command: 'generateMigration',
                        comparisonData: ${JSON.stringify(data)}
                    });
                }
            </script>
        </body>
        </html>`;
    }

    private generateOverviewTab(data: EnhancedSchemaComparisonData): string {
        const detailedComparison = data.detailedComparison;
        if (!detailedComparison) {
            return '<div class="analysis-content">No detailed comparison data available</div>';
        }

        return `
            <div class="analysis-content">
                <div class="metrics-grid">
                    <div class="metric-item">
                        <div class="metric-value">\${detailedComparison.columnComparisons?.size || 0}</div>
                        <div class="metric-label">Tables with Column Changes</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-value">\${detailedComparison.indexComparisons?.size || 0}</div>
                        <div class="metric-label">Tables with Index Changes</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-value">\${detailedComparison.constraintComparisons?.size || 0}</div>
                        <div class="metric-label">Tables with Constraint Changes</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-value">\${detailedComparison.viewDependencies?.size || 0}</div>
                        <div class="metric-label">Views with Dependencies</div>
                    </div>
                </div>

                <div class="dependency-visualization">
                    <div style="text-align: center; color: var(--vscode-descriptionForeground); padding: 50px;">
                        <div style="font-size: 48px; margin-bottom: 20px;">🔗</div>
                        <div style="font-size: 18px; margin-bottom: 10px;">Dependency Graph</div>
                        <div style="font-size: 14px;">
                            Interactive dependency visualization would be rendered here<br>
                            showing relationships between database objects
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    private async handleWebviewMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'exportComparison':
                await this.exportComparison(message.data);
                break;
            case 'generateMigration':
                await this.generateMigrationFromComparison(message.comparisonData);
                break;
            case 'startNewComparison':
                await vscode.commands.executeCommand('postgresql.compareSchemas');
                break;
        }
    }

    private async exportComparison(data: EnhancedSchemaComparisonData): Promise<void> {
        try {
            const exportContent = JSON.stringify(data, null, 2);
            const uri = await vscode.window.showSaveDialog({
                filters: {
                    'JSON Files': ['json'],
                    'All Files': ['*']
                },
                defaultUri: vscode.Uri.file(`enhanced-schema-comparison-\${new Date().toISOString().split('T')[0]}.json`)
            });

            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(exportContent, 'utf8'));
                vscode.window.showInformationMessage('Enhanced schema comparison exported successfully');
            }
        } catch (error) {
            Logger.error('Failed to export comparison', error as Error);
            vscode.window.showErrorMessage('Failed to export comparison');
        }
    }

    private async generateMigrationFromComparison(comparisonData: EnhancedSchemaComparisonData): Promise<void> {
        try {
            await vscode.commands.executeCommand('postgresql.generateMigration', comparisonData);
        } catch (error) {
            Logger.error('Failed to generate migration from comparison', error as Error);
            vscode.window.showErrorMessage('Failed to generate migration');
        }
    }
    dispose(): void {
        if (this.panel) {
            this.panel.dispose();
            this.panel = undefined;
        }
        this.comparisonData = undefined;
    }
};