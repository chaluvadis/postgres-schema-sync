import * as vscode from 'vscode';
import { Logger } from '@/utils/Logger';
import { DotNetIntegrationService, DotNetSchemaComparison, DotNetConnectionInfo } from '@/services/DotNetIntegrationService';
import { SchemaManager, DetailedSchemaComparisonResult, ColumnComparisonDetail, IndexComparisonDetail, ConstraintDifference, ViewDependencyNode } from '@/managers/SchemaManager';
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

        return `
            <!DOCTYPE html>
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
            </html>
        `;
    }

    private generateOverviewTab(data: EnhancedSchemaComparisonData): string {
        const detailedComparison = data.detailedComparison;
        if (!detailedComparison) {
            return '<div class="analysis-content">No detailed comparison data available</div>';
        }

        return \`
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
        \`;
    }

    private generateEmptyStateHtml(): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Schema Comparison</title>
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
                    <div class="icon">🔍</div>
                    <div class="title">No Comparison Data</div>
                    <div class="description">
                        Select two database connections and run a schema comparison to see the differences here.
                    </div>
                    <button class="btn" onclick="startNewComparison()">Start New Comparison</button>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    function startNewComparison() {
                        vscode.postMessage({
                            command: 'startNewComparison'
                        });
                    }
                </script>
            </body>
            </html>
        `;
    }

    private groupDifferencesByType(differences: SchemaDifference[]): Record<string, number> {
        return differences.reduce((acc, diff) => {
            acc[diff.type] = (acc[diff.type] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
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
                defaultUri: vscode.Uri.file(\`enhanced-schema-comparison-\${new Date().toISOString().split('T')[0]}.json\`)
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

        return `
            <!DOCTYPE html>
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
            </html>
        `;
    }

    private generateOverviewTab(data: EnhancedSchemaComparisonData): string {
        const detailedComparison = data.detailedComparison;
        if (!detailedComparison) {
            return '<div class="analysis-content">No detailed comparison data available</div>';
        }

        return \`
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
        \`;
    }

    private generateEmptyStateHtml(): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Schema Comparison</title>
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
                    <div class="icon">🔍</div>
                    <div class="title">No Comparison Data</div>
                    <div class="description">
                        Select two database connections and run a schema comparison to see the differences here.
                    </div>
                    <button class="btn" onclick="startNewComparison()">Start New Comparison</button>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    function startNewComparison() {
                        vscode.postMessage({
                            command: 'startNewComparison'
                        });
                    }
                </script>
            </body>
            </html>
        `;
    }

    private groupDifferencesByType(differences: SchemaDifference[]): Record<string, number> {
        return differences.reduce((acc, diff) => {
            acc[diff.type] = (acc[diff.type] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
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
                defaultUri: vscode.Uri.file(\`enhanced-schema-comparison-\${new Date().toISOString().split('T')[0]}.json\`)
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

        return `
            <!DOCTYPE html>
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
            </html>
        `;
    }

    private generateOverviewTab(data: EnhancedSchemaComparisonData): string {
        const detailedComparison = data.detailedComparison;
        if (!detailedComparison) {
            return '<div class="analysis-content">No detailed comparison data available</div>';
        }

        return \`
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
        \`;
    }

    private generateEmptyStateHtml(): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Schema Comparison</title>
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
                    <div class="icon">🔍</div>
                    <div class="title">No Comparison Data</div>
                    <div class="description">
                        Select two database connections and run a schema comparison to see the differences here.
                    </div>
                    <button class="btn" onclick="startNewComparison()">Start New Comparison</button>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    function startNewComparison() {
                        vscode.postMessage({
                            command: 'startNewComparison'
                        });
                    }
                </script>
            </body>
            </html>
        `;
    }

    private groupDifferencesByType(differences: SchemaDifference[]): Record<string, number> {
        return differences.reduce((acc, diff) => {
            acc[diff.type] = (acc[diff.type] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
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
                defaultUri: vscode.Uri.file(\`enhanced-schema-comparison-\${new Date().toISOString().split('T')[0]}.json\`)
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

        return `
            <!DOCTYPE html>
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
            </html>
        `;
    }

    private generateOverviewTab(data: EnhancedSchemaComparisonData): string {
        const detailedComparison = data.detailedComparison;
        if (!detailedComparison) {
            return '<div class="analysis-content">No detailed comparison data available</div>';
        }

        return \`
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
        \`;
    }

    private generateEmptyStateHtml(): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Schema Comparison</title>
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
                    <div class="icon">🔍</div>
                    <div class="title">No Comparison Data</div>
                    <div class="description">
                        Select two database connections and run a schema comparison to see the differences here.
                    </div>
                    <button class="btn" onclick="startNewComparison()">Start New Comparison</button>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    function startNewComparison() {
                        vscode.postMessage({
                            command: 'startNewComparison'
                        });
                    }
                </script>
            </body>
            </html>
        `;
    }

    private groupDifferencesByType(differences: SchemaDifference[]): Record<string, number> {
        return differences.reduce((acc, diff) => {
            acc[diff.type] = (acc[diff.type] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
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
                defaultUri: vscode.Uri.file(`enhanced-schema-comparison-${new Date().toISOString().split('T')[0]}.json`)
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

        return `
            <!DOCTYPE html>
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
            </html>
        `;
    }

    private generateOverviewTab(data: EnhancedSchemaComparisonData): string {
        const detailedComparison = data.detailedComparison;
        if (!detailedComparison) {
            return '<div class="analysis-content">No detailed comparison data available</div>';
        }

        return \`
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
        \`;
    }

    private generateEmptyStateHtml(): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Schema Comparison</title>
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
                    <div class="icon">🔍</div>
                    <div class="title">No Comparison Data</div>
                    <div class="description">
                        Select two database connections and run a schema comparison to see the differences here.
                    </div>
                    <button class="btn" onclick="startNewComparison()">Start New Comparison</button>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    function startNewComparison() {
                        vscode.postMessage({
                            command: 'startNewComparison'
                        });
                    }
                </script>
            </body>
            </html>
        `;
    }

    private groupDifferencesByType(differences: SchemaDifference[]): Record<string, number> {
        return differences.reduce((acc, diff) => {
            acc[diff.type] = (acc[diff.type] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
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
                defaultUri: vscode.Uri.file(`enhanced-schema-comparison-${new Date().toISOString().split('T')[0]}.json`)
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
}

    async showComparison(comparisonData?: SchemaComparisonData): Promise<void> {
        try {
            Logger.info('Opening schema comparison view');

            if (comparisonData) {
                this.comparisonData = comparisonData;
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
            const htmlContent = await this.generateComparisonHtml(this.comparisonData);
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

    async performComparison(
        sourceConnection: DotNetConnectionInfo,
        targetConnection: DotNetConnectionInfo,
        options: ComparisonOptions
    ): Promise<void> {
        try {
            Logger.info('Performing schema comparison', 'SchemaComparisonView', {
                source: sourceConnection.name,
                target: targetConnection.name
            });

            // Show progress indicator
            const progressOptions: vscode.ProgressOptions = {
                location: vscode.ProgressLocation.Notification,
                title: 'Comparing Schemas',
                cancellable: true
            };

            await vscode.window.withProgress(progressOptions, async (progress, token) => {
                progress.report({ increment: 0, message: 'Connecting to databases...' });

                if (token.isCancellationRequested) {
                    throw new Error('Comparison cancelled by user');
                }

                // Perform the actual comparison via .NET service
                const dotNetComparison = await this.dotNetService.compareSchemas(
                    sourceConnection,
                    targetConnection,
                    options
                );

                progress.report({ increment: 50, message: 'Analyzing differences...' });

                if (token.isCancellationRequested) {
                    throw new Error('Comparison cancelled by user');
                }

                // Convert .NET comparison to view format
                this.comparisonData = this.convertDotNetComparison(dotNetComparison, options);

                progress.report({ increment: 100, message: 'Comparison complete' });

                // Update the view with results
                if (this.panel) {
                    const htmlContent = await this.generateComparisonHtml(this.comparisonData);
                    this.panel.webview.html = htmlContent;
                }
            });

        } catch (error) {
            Logger.error('Schema comparison failed', error as Error);
            vscode.window.showErrorMessage(
                `Schema comparison failed: ${(error as Error).message}`
            );
            throw error;
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
        try {
            Logger.info('Performing schema comparison', 'SchemaComparisonView', {
                source: sourceConnection.name,
                target: targetConnection.name
            });

            // Show progress indicator
            const progressOptions: vscode.ProgressOptions = {
                location: vscode.ProgressLocation.Notification,
                title: 'Comparing Schemas',
                cancellable: true
            };

            await vscode.window.withProgress(progressOptions, async (progress, token) => {
                progress.report({ increment: 0, message: 'Connecting to databases...' });

                if (token.isCancellationRequested) {
                    throw new Error('Comparison cancelled by user');
                }

                // Perform the actual comparison via .NET service
                const dotNetComparison = await this.dotNetService.compareSchemas(
                    sourceConnection,
                    targetConnection,
                    options
                );

                progress.report({ increment: 50, message: 'Analyzing differences...' });

                if (token.isCancellationRequested) {
                    throw new Error('Comparison cancelled by user');
                }

                // Convert .NET comparison to view format
                this.comparisonData = this.convertDotNetComparison(dotNetComparison, options);

                progress.report({ increment: 100, message: 'Comparison complete' });

                // Update the view with results
                if (this.panel) {
                    const htmlContent = await this.generateComparisonHtml(this.comparisonData);
                    this.panel.webview.html = htmlContent;
                }
            });

        } catch (error) {
            Logger.error('Schema comparison failed', error as Error);
            vscode.window.showErrorMessage(
                `Schema comparison failed: ${(error as Error).message}`
            );
            throw error;
        }
    }

    private convertDotNetComparison(
        dotNetComparison: DotNetSchemaComparison,
        options: ComparisonOptions
    ): SchemaComparisonData {
        return {
            id: dotNetComparison.id,
            sourceConnection: dotNetComparison.sourceConnection,
            targetConnection: dotNetComparison.targetConnection,
            differences: dotNetComparison.differences.map(diff => ({
                id: `${diff.type}-${diff.objectType}-${diff.objectName}-${diff.schema}`,
                type: diff.type,
                objectType: diff.objectType,
                objectName: diff.objectName,
                schema: diff.schema,
                sourceDefinition: diff.sourceDefinition,
                targetDefinition: diff.targetDefinition,
                differenceDetails: diff.differenceDetails,
                severity: this.calculateSeverity(diff),
                conflictResolution: {
                    strategy: 'manual',
                    resolved: false
                },
                impactAnalysis: this.performImpactAnalysis(diff)
            })),
            comparisonOptions: options,
            createdAt: dotNetComparison.createdAt,
            executionTime: dotNetComparison.executionTime
        };
    }

    private calculateSeverity(difference: any): 'low' | 'medium' | 'high' | 'critical' {
        // Calculate severity based on difference type and object type
        if (difference.type === 'Removed') {
            return 'critical';
        } else if (difference.type === 'Modified' && difference.objectType === 'table') {
            return 'high';
        } else if (difference.type === 'Added') {
            return 'medium';
        } else {
            return 'low';
        }
    }

    private performImpactAnalysis(difference: any): ImpactAnalysis {
        const warnings: string[] = [];
        const recommendations: string[] = [];
        let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
        let dataLossPotential = false;
        let breakingChanges = false;

        // Analyze based on difference type and object type
        if (difference.type === 'Removed') {
            riskLevel = 'critical';
            dataLossPotential = true;
            breakingChanges = true;
            warnings.push('Object removal may cause data loss');
            warnings.push('Check for dependencies before proceeding');
            recommendations.push('Review all dependent objects');
            recommendations.push('Consider backing up data before removal');
        } else if (difference.type === 'Modified') {
            if (difference.objectType === 'table') {
                riskLevel = 'high';
                breakingChanges = true;
                warnings.push('Table modification may affect existing queries');
                recommendations.push('Review all queries using this table');
                recommendations.push('Check application compatibility');
            } else {
                riskLevel = 'medium';
                warnings.push('Object modification may affect functionality');
            }
        } else if (difference.type === 'Added') {
            riskLevel = 'low';
            recommendations.push('Review new object for consistency');
        }

        return {
            riskLevel,
            affectedObjects: [], // Would be populated by dependency analysis
            dataLossPotential,
            breakingChanges,
            dependencies: [], // Would be populated by dependency analysis
            warnings,
            recommendations
        };
    }

    private async generateComparisonHtml(data?: SchemaComparisonData): Promise<string> {
        if (!data) {
            return this.generateEmptyStateHtml();
        }

        const differencesByType = this.groupDifferencesByType(data.differences);

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Schema Comparison Results</title>
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

                    .differences-section {
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 6px;
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

                    .filter-controls {
                        display: flex;
                        gap: 10px;
                        align-items: center;
                    }

                    .filter-btn {
                        padding: 4px 8px;
                        border: 1px solid var(--vscode-panel-border);
                        background: transparent;
                        color: var(--vscode-editor-foreground);
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 11px;
                    }

                    .filter-btn.active {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border-color: var(--vscode-button-background);
                    }

                    .differences-list {
                        max-height: 400px;
                        overflow-y: auto;
                    }

                    .difference-item {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 10px 15px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        cursor: pointer;
                        transition: background-color 0.2s;
                    }

                    .difference-item:hover {
                        background: var(--vscode-list-hoverBackground);
                    }

                    .difference-icon {
                        width: 12px;
                        height: 12px;
                        border-radius: 50%;
                        flex-shrink: 0;
                    }

                    .diff-added { background: var(--vscode-gitDecoration-addedResourceForeground); }
                    .diff-removed { background: var(--vscode-gitDecoration-deletedResourceForeground); }
                    .diff-modified { background: var(--vscode-gitDecoration-modifiedResourceForeground); }
                    .diff-moved { background: var(--vscode-gitDecoration-renamedResourceForeground); }

                    .difference-content {
                        flex: 1;
                    }

                    .difference-title {
                        font-weight: bold;
                        margin-bottom: 2px;
                    }

                    .difference-meta {
                        font-size: 11px;
                        color: var(--vscode-descriptionForeground);
                    }

                    .severity-badge {
                        padding: 2px 6px;
                        border-radius: 3px;
                        font-size: 10px;
                        font-weight: bold;
                        text-transform: uppercase;
                    }

                    .severity-critical { background: var(--vscode-gitDecoration-deletedResourceForeground); }
                    .severity-high { background: var(--vscode-gitDecoration-modifiedResourceForeground); }
                    .severity-medium { background: var(--vscode-gitDecoration-renamedResourceForeground); }
                    .severity-low { background: var(--vscode-panel-border); }

                    .diff-details {
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 4px;
                        margin-top: 10px;
                    }

                    .details-tabs {
                        display: flex;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        background: var(--vscode-titleBar-activeBackground, #2f2f2f);
                    }

                    .tab-btn {
                        background: transparent;
                        border: none;
                        padding: 8px 16px;
                        color: var(--vscode-editor-foreground);
                        cursor: pointer;
                        border-bottom: 2px solid transparent;
                        font-size: 12px;
                    }

                    .tab-btn.active {
                        border-bottom-color: var(--vscode-textLink-foreground);
                        background: var(--vscode-editor-background);
                    }

                    .tab-btn:hover {
                        background: var(--vscode-list-hoverBackground);
                    }

                    .tab-content {
                        padding: 15px;
                        font-family: 'Consolas', 'Courier New', monospace;
                        font-size: 12px;
                    }

                    .diff-viewer {
                        display: flex;
                        gap: 10px;
                        height: 400px;
                    }

                    .diff-panel {
                        flex: 1;
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 4px;
                        overflow: hidden;
                        display: flex;
                        flex-direction: column;
                    }

                    .diff-panel-header {
                        background: var(--vscode-titleBar-activeBackground, #2f2f2f);
                        padding: 8px 12px;
                        font-weight: bold;
                        font-size: 11px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                    }

                    .diff-panel-content {
                        flex: 1;
                        overflow: auto;
                        padding: 10px;
                        background: var(--vscode-editor-background);
                    }

                    .line {
                        display: flex;
                        align-items: center;
                        padding: 2px 0;
                        font-family: 'Consolas', 'Courier New', monospace;
                    }

                    .line-number {
                        width: 40px;
                        text-align: right;
                        color: var(--vscode-descriptionForeground);
                        font-size: 10px;
                        padding-right: 10px;
                        border-right: 1px solid var(--vscode-panel-border);
                        margin-right: 10px;
                    }

                    .line-content {
                        flex: 1;
                        white-space: pre;
                    }

                    .line-added {
                        background: rgba(76, 183, 74, 0.2);
                        border-left: 3px solid var(--vscode-gitDecoration-addedResourceForeground);
                    }

                    .line-removed {
                        background: rgba(244, 135, 113, 0.2);
                        border-left: 3px solid var(--vscode-gitDecoration-deletedResourceForeground);
                    }

                    .line-modified {
                        background: rgba(77, 166, 255, 0.2);
                        border-left: 3px solid var(--vscode-gitDecoration-modifiedResourceForeground);
                    }

                    .impact-analysis {
                        background: var(--vscode-textBlockQuote-background);
                        padding: 15px;
                        border-radius: 4px;
                        margin-bottom: 15px;
                    }

                    .risk-badge {
                        display: inline-block;
                        padding: 4px 8px;
                        border-radius: 12px;
                        font-size: 10px;
                        font-weight: bold;
                        text-transform: uppercase;
                    }

                    .risk-low { background: var(--vscode-gitDecoration-addedResourceForeground); color: var(--vscode-editor-background); }
                    .risk-medium { background: var(--vscode-gitDecoration-renamedResourceForeground); color: var(--vscode-editor-background); }
                    .risk-high { background: var(--vscode-gitDecoration-modifiedResourceForeground); color: var(--vscode-editor-background); }
                    .risk-critical { background: var(--vscode-gitDecoration-deletedResourceForeground); color: var(--vscode-editor-background); }

                    .conflict-resolution {
                        background: var(--vscode-textBlockQuote-background);
                        padding: 15px;
                        border-radius: 4px;
                    }

                    .resolution-options {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                        gap: 10px;
                        margin: 15px 0;
                    }

                    .resolution-option {
                        padding: 10px;
                        border: 2px solid var(--vscode-panel-border);
                        border-radius: 4px;
                        cursor: pointer;
                        text-align: center;
                        transition: all 0.2s;
                    }

                    .resolution-option.selected {
                        border-color: var(--vscode-textLink-foreground);
                        background: rgba(77, 166, 255, 0.1);
                    }

                    .resolution-option:hover {
                        border-color: var(--vscode-textLink-foreground);
                    }

                    .custom-script {
                        margin-top: 15px;
                    }

                    .custom-script textarea {
                        width: 100%;
                        min-height: 100px;
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 4px;
                        padding: 8px;
                        font-family: 'Consolas', 'Courier New', monospace;
                        resize: vertical;
                    }

                    .warning-list {
                        background: rgba(244, 135, 113, 0.1);
                        border: 1px solid var(--vscode-gitDecoration-deletedResourceForeground);
                        border-radius: 4px;
                        padding: 10px;
                        margin: 10px 0;
                    }

                    .warning-list h5 {
                        margin: 0 0 10px 0;
                        color: var(--vscode-gitDecoration-deletedResourceForeground);
                    }

                    .recommendation-list {
                        background: rgba bluish( bluish, 166, 255, 0.1);
                        border: 1px solid var(--vscode-gitDecoration-modifiedResourceForeground);
                        border-radius: 4px;
                        padding: 10px;
                        margin: 10px 0;
                    }

                    .recommendation-list h5 {
                        margin: 0 0 10px 0;
                        color: var(--vscode-gitDecoration-modifiedResourceForeground);
                    }

                    .overview-content {
                        padding: 15px;
                    }

                    .overview-row {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                        gap: 15px;
                        margin-bottom: 20px;
                        padding: 15px;
                        background: var(--vscode-textBlockQuote-background);
                        border-radius: 4px;
                    }

                    .overview-details {
                        margin-bottom: 20px;
                    }

                    .definition-section {
                        margin-top: 15px;
                    }

                    .definition-section h5 {
                        margin-bottom: 8px;
                        color: var(--vscode-textLink-foreground);
                    }

                    .definition-content {
                        background: var(--vscode-input-background);
                        padding: 10px;
                        border-radius: 4px;
                        border: 1px solid var(--vscode-panel-border);
                        overflow-x: auto;
                        font-size: 11px;
                        line-height: 1.4;
                    }

                    .impact-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 15px;
                    }

                    .impact-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                        gap: 15px;
                        margin-bottom: 20px;
                    }

                    .impact-item {
                        padding: 10px;
                        background: var(--vscode-editor-background);
                        border-radius: 4px;
                        border: 1px solid var(--vscode-panel-border);
                    }

                    .resolution-actions {
                        margin-top: 20px;
                        display: flex;
                        gap: 10px;
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
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="comparison-info">
                        <h2>Schema Comparison Results</h2>
                        <span class="connection-badge source-badge">Source: ${data.sourceConnection.name}</span>
                        <span class="connection-badge target-badge">Target: ${data.targetConnection.name}</span>
                    </div>
                    <div class="comparison-meta">
                        <small>Completed in ${data.executionTime} • ${new Date(data.createdAt).toLocaleString()}</small>
                    </div>
                </div>

                <div class="content-area">
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
                            <div class="summary-number" style="color: var(--vscode-gitDecoration-renamedResourceForeground);">
                                ${differencesByType.Moved || 0}
                            </div>
                            <div class="summary-label">Moved</div>
                        </div>
                        <div class="summary-card">
                            <div class="summary-number">${data.differences.length}</div>
                            <div class="summary-label">Total</div>
                        </div>
                    </div>

                    <div class="differences-section">
                        <div class="section-header">
                            <div class="section-title">Differences</div>
                            <div class="filter-controls">
                                <button class="filter-btn active" onclick="filterDifferences('all')">All</button>
                                <button class="filter-btn" onclick="filterDifferences('critical')">Critical</button>
                                <button class="filter-btn" onclick="filterDifferences('high')">High</button>
                                <button class="filter-btn" onclick="filterDifferences('medium')">Medium</button>
                                <button class="filter-btn" onclick="filterDifferences('low')">Low</button>
                            </div>
                        </div>
                        <div class="differences-list" id="differencesList">
                            ${data.differences.map(diff => `
                                <div class="difference-item" data-severity="${diff.severity}" onclick="showDifferenceDetails('${diff.id}')">
                                    <div class="difference-icon diff-${diff.type.toLowerCase()}"></div>
                                    <div class="difference-content">
                                        <div class="difference-title">
                                            ${diff.objectName} (${diff.objectType})
                                            <span class="severity-badge severity-${diff.severity}">${diff.severity}</span>
                                        </div>
                                        <div class="difference-meta">
                                            Schema: ${diff.schema} • Type: ${diff.type}
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <div id="differenceDetails" class="diff-details" style="display: none;">
                        <div class="details-tabs">
                            <button class="tab-btn active" onclick="showTab('overview')">Overview</button>
                            <button class="tab-btn" onclick="showTab('visual-diff')">Visual Diff</button>
                            <button class="tab-btn" onclick="showTab('impact')">Impact Analysis</button>
                            <button class="tab-btn" onclick="showTab('resolution')">Conflict Resolution</button>
                        </div>
                        <div id="detailsContent" class="tab-content"></div>
                    </div>
                </div>

                <div class="footer">
                    <div class="info">
                        ${data.differences.length} differences found • Mode: ${data.comparisonOptions.mode}
                    </div>
                    <div class="actions">
                        <button class="btn btn-secondary" onclick="exportComparison()">Export</button>
                        <button class="btn btn-primary" onclick="generateMigration()">Generate Migration</button>
                    </div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    let currentFilter = 'all';

                    function filterDifferences(severity) {
                        currentFilter = severity;
                        const items = document.querySelectorAll('.difference-item');

                        items.forEach(item => {
                            const itemSeverity = item.getAttribute('data-severity');
                            if (severity === 'all' || itemSeverity === severity) {
                                item.style.display = 'flex';
                            } else {
                                item.style.display = 'none';
                            }
                        });

                        // Update filter button states
                        document.querySelectorAll('.filter-btn').forEach(btn => {
                            btn.classList.remove('active');
                        });
                        event.target.classList.add('active');
                    }

                    function showDifferenceDetails(diffId) {
                        const detailsDiv = document.getElementById('differenceDetails');
                        const contentDiv = document.getElementById('detailsContent');

                        // Find the difference data
                        const differences = ${JSON.stringify(data.differences)};
                        const diff = differences.find(d => d.id === diffId);

                        if (diff) {
                            // Show overview tab by default
                            showTab('overview', diff);
                            detailsDiv.style.display = 'block';
                        }
                    }

                    function showTab(tabName, diff = null) {
                        const contentDiv = document.getElementById('detailsContent');
                        const differences = ${JSON.stringify(data.differences)};
                        const currentDiff = diff || differences.find(d => d.id === currentDiffId);

                        // Update tab buttons
                        document.querySelectorAll('.tab-btn').forEach(btn => {
                            btn.classList.remove('active');
                        });
                        event.target.classList.add('active');

                        // Generate tab content
                        switch (tabName) {
                            case 'overview':
                                contentDiv.innerHTML = generateOverviewTab(currentDiff);
                                break;
                            case 'visual-diff':
                                contentDiv.innerHTML = generateVisualDiffTab(currentDiff);
                                break;
                            case 'impact':
                                contentDiv.innerHTML = generateImpactTab(currentDiff);
                                break;
                            case 'resolution':
                                contentDiv.innerHTML = generateResolutionTab(currentDiff);
                                break;
                        }
                    }

                    function generateOverviewTab(diff) {
                        return \`
                            <div class="overview-content">
                                <div class="overview-row">
                                    <div><strong>Type:</strong> \${diff.type}</div>
                                    <div><strong>Object:</strong> \${diff.objectName} (\${diff.objectType})</div>
                                    <div><strong>Schema:</strong> \${diff.schema}</div>
                                    <div><strong>Severity:</strong> <span class="severity-badge severity-\${diff.severity}">\${diff.severity}</span></div>
                                </div>
                                <div class="overview-details">
                                    <h5>Change Details:</h5>
                                    <ul>
                                        \${diff.differenceDetails.map(detail => \`<li>\${detail}</li>\`).join('')}
                                    </ul>
                                </div>
                                \${diff.sourceDefinition ? \`
                                    <div class="definition-section">
                                        <h5>Source Definition:</h5>
                                        <pre class="definition-content">\${diff.sourceDefinition}</pre>
                                    </div>
                                \` : ''}
                                \${diff.targetDefinition ? \`
                                    <div class="definition-section">
                                        <h5>Target Definition:</h5>
                                        <pre class="definition-content">\${diff.targetDefinition}</pre>
                                    </div>
                                \` : ''}
                            </div>
                        \`;
                    }

                    function generateVisualDiffTab(diff) {
                        if (diff.type === 'Added') {
                            return \`
                                <div class="diff-viewer">
                                    <div class="diff-panel">
                                        <div class="diff-panel-header">Source (Not Present)</div>
                                        <div class="diff-panel-content">
                                            <div class="line">
                                                <div class="line-content" style="color: var(--vscode-descriptionForeground);">
                                                    Object does not exist in source
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="diff-panel">
                                        <div class="diff-panel-header">Target (Added)</div>
                                        <div class="diff-panel-content">
                                            \${generateDiffLines(diff.targetDefinition, 'added')}
                                        </div>
                                    </div>
                                </div>
                            \`;
                        } else if (diff.type === 'Removed') {
                            return \`
                                <div class="diff-viewer">
                                    <div class="diff-panel">
                                        <div class="diff-panel-header">Source (Removed)</div>
                                        <div class="diff-panel-content">
                                            \${generateDiffLines(diff.sourceDefinition, 'removed')}
                                        </div>
                                    </div>
                                    <div class="diff-panel">
                                        <div class="diff-panel-header">Target (Not Present)</div>
                                        <div class="diff-panel-content">
                                            <div class="line">
                                                <div class="line-content" style="color: var(--vscode-descriptionForeground);">
                                                    Object does not exist in target
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            \`;
                        } else if (diff.type === 'Modified') {
                            return \`
                                <div class="diff-viewer">
                                    <div class="diff-panel">
                                        <div class="diff-panel-header">Source</div>
                                        <div class="diff-panel-content">
                                            \${generateDiffLines(diff.sourceDefinition)}
                                        </div>
                                    </div>
                                    <div class="diff-panel">
                                        <div class="diff-panel-header">Target</div>
                                        <div class="diff-panel-content">
                                            \${generateDiffLines(diff.targetDefinition)}
                                        </div>
                                    </div>
                                </div>
                            \`;
                        }
                        return '<div class="diff-viewer">Visual diff not available for this change type</div>';
                    }

                    function generateDiffLines(content, type = 'unchanged') {
                        if (!content) return '';

                        const lines = content.split('\\n');
                        return lines.map((line, index) => \`
                            <div class="line line-\${type}">
                                <div class="line-number">\${index + 1}</div>
                                <div class="line-content">\${escapeHtml(line)}</div>
                            </div>
                        \`).join('');
                    }

                    function generateImpactTab(diff) {
                        const impact = diff.impactAnalysis || {};
                        return \`
                            <div class="impact-analysis">
                                <div class="impact-header">
                                    <h4>Impact Analysis</h4>
                                    <span class="risk-badge risk-\${impact.riskLevel || 'low'}">\${impact.riskLevel || 'low'} Risk</span>
                                </div>

                                <div class="impact-grid">
                                    <div class="impact-item">
                                        <strong>Data Loss Potential:</strong>
                                        <span class="risk-badge risk-\${impact.dataLossPotential ? 'critical' : 'low'}">
                                            \${impact.dataLossPotential ? 'Yes' : 'No'}
                                        </span>
                                    </div>
                                    <div class="impact-item">
                                        <strong>Breaking Changes:</strong>
                                        <span class="risk-badge risk-\${impact.breakingChanges ? 'high' : 'low'}">
                                            \${impact.breakingChanges ? 'Yes' : 'No'}
                                        </span>
                                    </div>
                                </div>

                                \${impact.warnings && impact.warnings.length > 0 ? \`
                                    <div class="warning-list">
                                        <h5>⚠️ Warnings</h5>
                                        <ul>
                                            \${impact.warnings.map(w => \`<li>\${w}</li>\`).join('')}
                                        </ul>
                                    </div>
                                \` : ''}

                                \${impact.recommendations && impact.recommendations.length > 0 ? \`
                                    <div class="recommendation-list">
                                        <h5>💡 Recommendations</h5>
                                        <ul>
                                            \${impact.recommendations.map(r => \`<li>\${r}</li>\`).join('')}
                                        </ul>
                                    </div>
                                \` : ''}
                            </div>
                        \`;
                    }

                    function generateResolutionTab(diff) {
                        const resolution = diff.conflictResolution || { strategy: 'manual', resolved: false };
                        return \`
                            <div class="conflict-resolution">
                                <h4>Conflict Resolution</h4>

                                <div class="resolution-options">
                                    <div class="resolution-option \${resolution.strategy === 'source_wins' ? 'selected' : ''}"
                                         onclick="selectResolutionStrategy('source_wins', '\${diff.id}')">
                                        <div class="option-title">Source Wins</div>
                                        <div class="option-desc">Use source definition</div>
                                    </div>
                                    <div class="resolution-option \${resolution.strategy === 'target_wins' ? 'selected' : ''}"
                                         onclick="selectResolutionStrategy('target_wins', '\${diff.id}')">
                                        <div class="option-title">Target Wins</div>
                                        <div class="option-desc">Use target definition</div>
                                    </div>
                                    <div class="resolution-option \${resolution.strategy === 'merge' ? 'selected' : ''}"
                                         onclick="selectResolutionStrategy('merge', '\${diff.id}')">
                                        <div class="option-title">Merge</div>
                                        <div class="option-desc">Merge both definitions</div>
                                    </div>
                                    <div class="resolution-option \${resolution.strategy === 'manual' ? 'selected' : ''}"
                                         onclick="selectResolutionStrategy('manual', '\${diff.id}')">
                                        <div class="option-title">Manual</div>
                                        <div class="option-desc">Custom resolution</div>
                                    </div>
                                    <div class="resolution-option \${resolution.strategy === 'skip' ? 'selected' : ''}"
                                         onclick="selectResolutionStrategy('skip', '\${diff.id}')">
                                        <div class="option-title">Skip</div>
                                        <div class="option-desc">Skip this change</div>
                                    </div>
                                </div>

                                <div class="custom-script" id="customScript_\${diff.id}" style="display: \${resolution.strategy === 'manual' ? 'block' : 'none'};">
                                    <h5>Custom Resolution Script:</h5>
                                    <textarea placeholder="Enter custom SQL script for this resolution...">\${resolution.customScript || ''}</textarea>
                                </div>

                                <div class="resolution-actions">
                                    <button class="btn btn-primary" onclick="applyResolution('\${diff.id}')">Apply Resolution</button>
                                    <button class="btn btn-secondary" onclick="resetResolution('\${diff.id}')">Reset</button>
                                </div>
                            </div>
                        \`;
                    }

                    function selectResolutionStrategy(strategy, diffId) {
                        // Update UI
                        document.querySelectorAll('.resolution-option').forEach(opt => {
                            opt.classList.remove('selected');
                        });
                        event.target.closest('.resolution-option').classList.add('selected');

                        // Update data (would be sent to extension)
                        console.log('Resolution strategy selected:', strategy, 'for diff:', diffId);
                    }

                    function applyResolution(diffId) {
                        vscode.postMessage({
                            command: 'applyResolution',
                            diffId: diffId,
                            resolution: getCurrentResolution(diffId)
                        });
                    }

                    function getCurrentResolution(diffId) {
                        const scriptElement = document.getElementById(\`customScript_\${diffId}\`);
                        return {
                            strategy: document.querySelector('.resolution-option.selected')?.textContent.trim() || 'manual',
                            customScript: scriptElement ? scriptElement.querySelector('textarea').value : ''
                        };
                    }

                    function escapeHtml(text) {
                        const div = document.createElement('div');
                        div.textContent = text;
                        return div.innerHTML;
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
                <title>Schema Comparison</title>
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
                    <div class="icon">🔍</div>
                    <div class="title">No Comparison Data</div>
                    <div class="description">
                        Select two database connections and run a schema comparison to see the differences here.
                    </div>
                    <button class="btn" onclick="startNewComparison()">Start New Comparison</button>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    function startNewComparison() {
                        vscode.postMessage({
                            command: 'startNewComparison'
                        });
                    }
                </script>
            </body>
            </html>
        `;
    }

    private groupDifferencesByType(differences: SchemaDifference[]): Record<string, number> {
        return differences.reduce((acc, diff) => {
            acc[diff.type] = (acc[diff.type] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
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
            case 'applyResolution':
                await this.applyConflictResolution(message.diffId, message.resolution);
                break;
            case 'resetResolution':
                await this.resetConflictResolution(message.diffId);
                break;
        }
    }

    private async exportComparison(data: SchemaComparisonData): Promise<void> {
        try {
            const exportContent = this.generateExportContent(data);
            const uri = await vscode.window.showSaveDialog({
                filters: {
                    'JSON Files': ['json'],
                    'Text Files': ['txt'],
                    'All Files': ['*']
                },
                defaultUri: vscode.Uri.file(`schema-comparison-${new Date().toISOString().split('T')[0]}.json`)
            });

            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(exportContent, 'utf8'));
                vscode.window.showInformationMessage('Schema comparison exported successfully');
            }
        } catch (error) {
            Logger.error('Failed to export comparison', error as Error);
            vscode.window.showErrorMessage('Failed to export comparison');
        }
    }

    private generateExportContent(data: SchemaComparisonData): string {
        return JSON.stringify(data, null, 2);
    }

    private async generateMigrationFromComparison(comparisonData: SchemaComparisonData): Promise<void> {
        try {
            await vscode.commands.executeCommand('postgresql.generateMigration', comparisonData);
        } catch (error) {
            Logger.error('Failed to generate migration from comparison', error as Error);
            vscode.window.showErrorMessage('Failed to generate migration');
        }
    }

    private async applyConflictResolution(diffId: string, resolution: any): Promise<void> {
        try {
            Logger.info('Applying conflict resolution', 'applyConflictResolution', { diffId, resolution });

            // Update the comparison data with the resolution
            if (this.comparisonData) {
                const diff = this.comparisonData.differences.find(d => d.id === diffId);
                if (diff) {
                    diff.conflictResolution = {
                        strategy: resolution.strategy,
                        resolved: true,
                        customScript: resolution.customScript,
                        resolvedBy: 'Current User', // Would get from VSCode user
                        resolvedAt: new Date()
                    };

                    // Update the UI
                    if (this.panel) {
                        const htmlContent = await this.generateComparisonHtml(this.comparisonData);
                        this.panel.webview.html = htmlContent;
                    }

                    vscode.window.showInformationMessage(`Resolution applied for ${diff.objectName}`);
                }
            }
        } catch (error) {
            Logger.error('Failed to apply conflict resolution', error as Error);
            vscode.window.showErrorMessage('Failed to apply resolution');
        }
    }

    private async resetConflictResolution(diffId: string): Promise<void> {
        try {
            Logger.info('Resetting conflict resolution', 'resetConflictResolution', { diffId });

            // Reset the resolution in comparison data
            if (this.comparisonData) {
                const diff = this.comparisonData.differences.find(d => d.id === diffId);
                if (diff) {
                    diff.conflictResolution = {
                        strategy: 'manual',
                        resolved: false
                    };

                    // Update the UI
                    if (this.panel) {
                        const htmlContent = await this.generateComparisonHtml(this.comparisonData);
                        this.panel.webview.html = htmlContent;
                    }
                }
            }
        } catch (error) {
            Logger.error('Failed to reset conflict resolution', error as Error);
            vscode.window.showErrorMessage('Failed to reset resolution');
        }
    }

    dispose(): void {
        if (this.panel) {
            this.panel.dispose();
            this.panel = undefined;
        }
        this.comparisonData = undefined;
    }
}