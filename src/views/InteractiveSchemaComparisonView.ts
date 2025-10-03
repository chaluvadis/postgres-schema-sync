import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';

export interface InteractiveComparisonData {
    comparisonId: string;
    sourceConnection: string;
    targetConnection: string;
    differences: InteractiveDifference[];
    totalDifferences: number;
    comparisonMode: 'structure' | 'data' | 'full';
    executionTime: string;
    createdAt: string;
    metadata?: {
        sourceDbSize?: string;
        targetDbSize?: string;
        sourceObjectCount?: number;
        targetObjectCount?: number;
        comparisonDepth?: 'shallow' | 'deep';
    };
}

export interface InteractiveDifference {
    id: string;
    type: 'Added' | 'Removed' | 'Modified' | 'Moved' | 'Renamed';
    objectType: string;
    objectName: string;
    schema: string;
    sourceDefinition?: string;
    targetDefinition?: string;
    differenceDetails: string[];
    severity: 'low' | 'medium' | 'high' | 'critical';
    dependencies?: string[];
    dependents?: string[];
    impact?: 'safe' | 'warning' | 'dangerous';
    resolution?: 'auto' | 'manual' | 'skip';
    conflictLevel?: number;
    estimatedMigrationTime?: string;
    breakingChange?: boolean;
    tags?: string[];
}

export interface ComparisonFilter {
    objectTypes?: string[];
    severities?: string[];
    impact?: string[];
    tags?: string[];
    searchTerm?: string;
    showOnlyBreaking?: boolean;
    showOnlyConflicts?: boolean;
}

export class InteractiveSchemaComparisonView {
    private panel: vscode.WebviewPanel | undefined;
    private comparisonData: InteractiveComparisonData | undefined;
    private filters: ComparisonFilter = {};
    private viewMode: 'list' | 'tree' | 'graph' = 'list';

    constructor() { }

    async showComparison(comparisonData: InteractiveComparisonData): Promise<void> {
        try {
            Logger.info('Opening interactive schema comparison view', {
                comparisonId: comparisonData.comparisonId,
                totalDifferences: comparisonData.totalDifferences
            });

            this.comparisonData = comparisonData;

            this.panel = vscode.window.createWebviewPanel(
                'interactiveSchemaComparison',
                `Interactive Schema Comparison: ${comparisonData.sourceConnection} → ${comparisonData.targetConnection}`,
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
            const htmlContent = await this.generateInteractiveHtml(comparisonData);
            this.panel.webview.html = htmlContent;

            // Handle messages from webview
            this.panel.webview.onDidReceiveMessage(async (message) => {
                await this.handleWebviewMessage(message);
            });

            // Track performance - simplified for now
            // this.performanceMonitor.recordOperation('schema-comparison-view-opened', {
            //     comparisonId: comparisonData.comparisonId,
            //     differenceCount: comparisonData.totalDifferences
            // });

        } catch (error) {
            Logger.error('Failed to show interactive schema comparison', error as Error);
            vscode.window.showErrorMessage(
                `Failed to open interactive schema comparison: ${(error as Error).message}`
            );
        }
    }

    private async generateInteractiveHtml(data: InteractiveComparisonData): Promise<string> {
        const filteredDifferences = this.applyFilters(data.differences);
        const sortedDifferences = this.sortDifferences(filteredDifferences);

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Interactive Schema Comparison</title>
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
                        --vscode-input-border: #3c3c3c;
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

                    .header-left {
                        display: flex;
                        align-items: center;
                        gap: 15px;
                    }

                    .header-right {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                    }

                    .toolbar {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 10px 20px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        background: var(--vscode-editor-background);
                        flex-wrap: wrap;
                    }

                    .search-box {
                        display: flex;
                        align-items: center;
                        background: var(--vscode-input-background);
                        border: 1px solid var(--vscode-input-border);
                        border-radius: 4px;
                        padding: 5px 10px;
                        min-width: 250px;
                    }

                    .search-input {
                        background: none;
                        border: none;
                        color: var(--vscode-input-foreground);
                        outline: none;
                        flex: 1;
                        font-size: 13px;
                    }

                    .filter-controls {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        flex-wrap: wrap;
                    }

                    .filter-group {
                        display: flex;
                        align-items: center;
                        gap: 5px;
                    }

                    .filter-select {
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border: 1px solid var(--vscode-input-border);
                        border-radius: 3px;
                        padding: 4px 8px;
                        font-size: 12px;
                    }

                    .view-controls {
                        display: flex;
                        align-items: center;
                        gap: 5px;
                    }

                    .view-btn {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        border-radius: 3px;
                        padding: 6px 12px;
                        font-size: 12px;
                        cursor: pointer;
                        transition: background-color 0.2s;
                    }

                    .view-btn:hover {
                        background: var(--vscode-button-hoverBackground);
                    }

                    .view-btn.active {
                        background: var(--vscode-button-hoverBackground);
                    }

                    .content-area {
                        flex: 1;
                        display: flex;
                        overflow: hidden;
                    }

                    .sidebar {
                        width: 280px;
                        background: var(--vscode-editor-background);
                        border-right: 1px solid var(--vscode-panel-border);
                        display: flex;
                        flex-direction: column;
                        overflow: hidden;
                    }

                    .sidebar-section {
                        border-bottom: 1px solid var(--vscode-panel-border);
                        padding: 15px;
                    }

                    .sidebar-title {
                        font-weight: bold;
                        margin-bottom: 10px;
                        font-size: 13px;
                    }

                    .stats-grid {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 8px;
                    }

                    .stat-item {
                        background: var(--vscode-badge-background);
                        padding: 8px;
                        border-radius: 4px;
                        text-align: center;
                    }

                    .stat-value {
                        font-size: 16px;
                        font-weight: bold;
                        color: var(--vscode-textLink-foreground);
                    }

                    .stat-label {
                        font-size: 11px;
                        color: var(--vscode-badge-foreground);
                        opacity: 0.8;
                    }

                    .filter-options {
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                    }

                    .filter-option {
                        display: flex;
                        align-items: center;
                        gap: 5px;
                        font-size: 12px;
                    }

                    .filter-checkbox {
                        margin: 0;
                    }

                    .main-content {
                        flex: 1;
                        overflow: auto;
                        padding: 20px;
                    }

                    .differences-container {
                        display: flex;
                        flex-direction: column;
                        gap: 15px;
                    }

                    .difference-card {
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 6px;
                        overflow: hidden;
                        transition: all 0.2s ease;
                    }

                    .difference-card:hover {
                        border-color: var(--vscode-textLink-foreground);
                        box-shadow: 0 2px 8px rgba(77, 166, 255, 0.1);
                    }

                    .difference-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 12px 15px;
                        background: var(--vscode-titleBar-activeBackground, '#2f2f2f');
                        cursor: pointer;
                    }

                    .difference-main {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                    }

                    .difference-icon {
                        width: 16px;
                        height: 16px;
                        border-radius: 50%;
                    }

                    .icon-added { background: var(--vscode-gitDecoration-addedResourceForeground); }
                    .icon-removed { background: var(--vscode-gitDecoration-deletedResourceForeground); }
                    .icon-modified { background: var(--vscode-gitDecoration-modifiedResourceForeground); }
                    .icon-moved { background: var(--vscode-gitDecoration-renamedResourceForeground); }

                    .difference-title {
                        font-weight: bold;
                        color: var(--vscode-textLink-foreground);
                    }

                    .difference-badge {
                        background: var(--vscode-badge-background);
                        color: var(--vscode-badge-foreground);
                        padding: 2px 6px;
                        border-radius: 10px;
                        font-size: 10px;
                        font-weight: bold;
                        text-transform: uppercase;
                    }

                    .difference-meta {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground, '#cccccc80');
                    }

                    .difference-actions {
                        display: flex;
                        align-items: center;
                        gap: 5px;
                    }

                    .action-btn {
                        background: none;
                        border: none;
                        color: var(--vscode-textLink-foreground);
                        cursor: pointer;
                        padding: 4px;
                        border-radius: 3px;
                        font-size: 12px;
                    }

                    .action-btn:hover {
                        background: var(--vscode-list-hoverBackground);
                    }

                    .difference-content {
                        padding: 15px;
                        border-top: 1px solid var(--vscode-panel-border);
                    }

                    .difference-details {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 15px;
                        margin-bottom: 15px;
                    }

                    .definition-panel {
                        background: var(--vscode-textCodeBlock-background, '#1e1e1e');
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 4px;
                        padding: 10px;
                    }

                    .panel-title {
                        font-weight: bold;
                        margin-bottom: 8px;
                        font-size: 12px;
                        color: var(--vscode-textLink-foreground);
                    }

                    .definition-content {
                        font-family: 'Courier New', monospace;
                        font-size: 12px;
                        line-height: 1.4;
                        max-height: 200px;
                        overflow: auto;
                    }

                    .details-list {
                        list-style: none;
                        padding: 0;
                        margin: 0;
                    }

                    .detail-item {
                        padding: 5px 0;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        font-size: 12px;
                    }

                    .detail-item:last-child {
                        border-bottom: none;
                    }

                    .tags-container {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 5px;
                        margin-top: 10px;
                    }

                    .tag {
                        background: var(--vscode-badge-background);
                        color: var(--vscode-badge-foreground);
                        padding: 2px 6px;
                        border-radius: 8px;
                        font-size: 10px;
                    }

                    .footer {
                        padding: 15px 20px;
                        border-top: 1px solid var(--vscode-panel-border);
                        background: var(--vscode-editor-background);
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }

                    .selection-info {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                    }

                    .action-buttons {
                        display: flex;
                        gap: 10px;
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
                        background: var(--vscode-button-secondaryBackground, '#3c3c3c');
                        color: var(--vscode-button-secondaryForeground, '#cccccc');
                    }

                    .btn-secondary:hover {
                        background: var(--vscode-list-hoverBackground);
                    }

                    .btn-danger {
                        background: var(--vscode-gitDecoration-deletedResourceForeground);
                        color: white;
                    }

                    .btn-danger:hover {
                        opacity: 0.8;
                    }

                    .loading {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        height: 200px;
                        color: var(--vscode-descriptionForeground);
                    }

                    .hidden {
                        display: none !important;
                    }

                    .tree-group {
                        margin-bottom: 20px;
                    }

                    .tree-group-header {
                        background: var(--vscode-titleBar-activeBackground, '#2f2f2f');
                        padding: 8px 12px;
                        font-size: 12px;
                        font-weight: bold;
                        border-radius: 4px 4px 0 0;
                        border: 1px solid var(--vscode-panel-border);
                        border-bottom: none;
                    }

                    .tree-group-items {
                        border: 1px solid var(--vscode-panel-border);
                        border-top: none;
                        border-radius: 0 0 4px 4px;
                    }

                    .graph-container {
                        padding: 20px;
                        min-height: 400px;
                    }

                    .graph-legend {
                        display: flex;
                        gap: 20px;
                        margin-bottom: 20px;
                        font-size: 12px;
                    }

                    .legend-item {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }

                    .legend-color {
                        width: 12px;
                        height: 12px;
                        border-radius: 50%;
                    }

                    .graph-nodes {
                        display: grid;
                        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
                        gap: 15px;
                    }

                    .graph-node {
                        padding: 10px;
                        border-radius: 6px;
                        text-align: center;
                        cursor: pointer;
                        font-size: 12px;
                        font-weight: bold;
                        border: 2px solid transparent;
                        transition: all 0.2s ease;
                    }

                    .graph-node:hover {
                        border-color: var(--vscode-textLink-foreground);
                        transform: translateY(-2px);
                    }

                    .graph-node.severity-critical {
                        background: rgba(244, 135, 113, 0.2);
                        border-color: var(--vscode-gitDecoration-deletedResourceForeground);
                    }

                    .graph-node.severity-high {
                        background: rgba(255, 107, 53, 0.2);
                        border-color: #ff6b35;
                    }

                    .graph-node.severity-medium {
                        background: rgba(77, 166, 255, 0.2);
                        border-color: var(--vscode-gitDecoration-modifiedResourceForeground);
                    }

                    .graph-node.severity-low {
                        background: rgba(75, 183, 74, 0.2);
                        border-color: var(--vscode-gitDecoration-addedResourceForeground);
                    }

                    @media (max-width: 768px) {
                        .content-area {
                            flex-direction: column;
                        }

                        .sidebar {
                            width: 100%;
                            max-height: 300px;
                        }

                        .difference-details {
                            grid-template-columns: 1fr;
                        }

                        .graph-nodes {
                            grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
                        }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="header-left">
                        <h2>Interactive Schema Comparison</h2>
                        <div class="header-meta">
                            <span>${data.sourceConnection} → ${data.targetConnection}</span>
                            <span class="separator">•</span>
                            <span>${data.totalDifferences} differences</span>
                            <span class="separator">•</span>
                            <span>${data.executionTime}</span>
                        </div>
                    </div>
                    <div class="header-right">
                        <button class="btn btn-secondary" onclick="exportReport()">Export Report</button>
                        <button class="btn btn-secondary" onclick="showSettings()">Settings</button>
                    </div>
                </div>

                <div class="toolbar">
                    <div class="search-box">
                        <svg width="14" height="14" viewBox="0 0 16 16" style="margin-right: 8px; opacity: 0.6;">
                            <path fill="currentColor" d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
                        </svg>
                        <input type="text" class="search-input" id="searchInput" placeholder="Search differences..." onkeyup="handleSearch()">
                    </div>

                    <div class="filter-controls">
                        <div class="filter-group">
                            <label>Severity:</label>
                            <select class="filter-select" id="severityFilter" onchange="handleFilter()">
                                <option value="">All</option>
                                <option value="critical">Critical</option>
                                <option value="high">High</option>
                                <option value="medium">Medium</option>
                                <option value="low">Low</option>
                            </select>
                        </div>

                        <div class="filter-group">
                            <label>Type:</label>
                            <select class="filter-select" id="typeFilter" onchange="handleFilter()">
                                <option value="">All</option>
                                <option value="Added">Added</option>
                                <option value="Removed">Removed</option>
                                <option value="Modified">Modified</option>
                                <option value="Moved">Moved</option>
                            </select>
                        </div>

                        <div class="filter-group">
                            <label>Impact:</label>
                            <select class="filter-select" id="impactFilter" onchange="handleFilter()">
                                <option value="">All</option>
                                <option value="safe">Safe</option>
                                <option value="warning">Warning</option>
                                <option value="dangerous">Dangerous</option>
                            </select>
                        </div>
                    </div>

                    <div class="view-controls">
                        <button class="view-btn" onclick="setViewMode('list')" id="listViewBtn">List</button>
                        <button class="view-btn" onclick="setViewMode('tree')" id="treeViewBtn">Tree</button>
                        <button class="view-btn" onclick="setViewMode('graph')" id="graphViewBtn">Graph</button>
                    </div>
                </div>

                <div class="content-area">
                    <div class="sidebar">
                        <div class="sidebar-section">
                            <div class="sidebar-title">Comparison Statistics</div>
                            <div class="stats-grid">
                                <div class="stat-item">
                                    <div class="stat-value">${data.differences.filter(d => d.type === 'Added').length}</div>
                                    <div class="stat-label">Added</div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-value">${data.differences.filter(d => d.type === 'Removed').length}</div>
                                    <div class="stat-label">Removed</div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-value">${data.differences.filter(d => d.type === 'Modified').length}</div>
                                    <div class="stat-label">Modified</div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-value">${data.differences.filter(d => d.type === 'Moved').length}</div>
                                    <div class="stat-label">Moved</div>
                                </div>
                            </div>
                        </div>

                        <div class="sidebar-section">
                            <div class="sidebar-title">Filter Options</div>
                            <div class="filter-options">
                                <label class="filter-option">
                                    <input type="checkbox" class="filter-checkbox" id="breakingOnly" onchange="handleFilter()">
                                    Show only breaking changes
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" class="filter-checkbox" id="conflictsOnly" onchange="handleFilter()">
                                    Show only conflicts
                                </label>
                                <label class="filter-option">
                                    <input type="checkbox" class="filter-checkbox" id="dependenciesOnly" onchange="handleFilter()">
                                    Show only with dependencies
                                </label>
                            </div>
                        </div>

                        ${data.metadata ? `
                        <div class="sidebar-section">
                            <div class="sidebar-title">Database Info</div>
                            <div style="font-size: 11px; color: var(--vscode-descriptionForeground);">
                                <div>Source: ${data.metadata.sourceDbSize || 'Unknown'} (${data.metadata.sourceObjectCount || 0} objects)</div>
                                <div>Target: ${data.metadata.targetDbSize || 'Unknown'} (${data.metadata.targetObjectCount || 0} objects)</div>
                                <div>Mode: ${data.comparisonMode}</div>
                            </div>
                        </div>
                        ` : ''}
                    </div>

                    <div class="main-content">
                        <div id="differencesContainer" class="differences-container">
                            ${this.renderViewMode(sortedDifferences)}
                        </div>

                        ${sortedDifferences.length === 0 ? `
                        <div class="loading">
                            No differences found matching current filters
                        </div>
                        ` : ''}
                    </div>
                </div>

                <div class="footer">
                    <div class="selection-info">
                        <span id="selectionCount">0</span> of ${data.differences.length} differences selected
                    </div>
                    <div class="action-buttons">
                        <button class="btn btn-secondary" onclick="selectAll()">Select All</button>
                        <button class="btn btn-secondary" onclick="selectNone()">Select None</button>
                        <button class="btn btn-primary" onclick="generateMigration()">Generate Migration</button>
                        <button class="btn btn-danger" onclick="showConflictResolver()">Resolve Conflicts</button>
                    </div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    let selectedDifferences = new Set();
                    let currentFilters = ${JSON.stringify(this.filters)};
                    let currentViewMode = '${this.viewMode}';

                    function handleSearch() {
                        const searchTerm = document.getElementById('searchInput').value;
                        vscode.postMessage({
                            command: 'search',
                            searchTerm: searchTerm
                        });
                    }

                    function handleFilter() {
                        const filters = {
                            severity: document.getElementById('severityFilter').value,
                            type: document.getElementById('typeFilter').value,
                            impact: document.getElementById('impactFilter').value,
                            breakingOnly: document.getElementById('breakingOnly').checked,
                            conflictsOnly: document.getElementById('conflictsOnly').checked,
                            dependenciesOnly: document.getElementById('dependenciesOnly').checked
                        };

                        vscode.postMessage({
                            command: 'filter',
                            filters: filters
                        });
                    }

                    function setViewMode(mode) {
                        currentViewMode = mode;
                        document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
                        document.getElementById(mode + 'ViewBtn').classList.add('active');

                        vscode.postMessage({
                            command: 'setViewMode',
                            mode: mode
                        });
                    }

                    function toggleDifferenceSelection(differenceId, checkbox) {
                        if (checkbox.checked) {
                            selectedDifferences.add(differenceId);
                        } else {
                            selectedDifferences.delete(differenceId);
                        }

                        updateSelectionCount();
                        vscode.postMessage({
                            command: 'toggleSelection',
                            differenceId: differenceId,
                            selected: checkbox.checked
                        });
                    }

                    function selectAll() {
                        vscode.postMessage({
                            command: 'selectAll'
                        });
                    }

                    function selectNone() {
                        vscode.postMessage({
                            command: 'selectNone'
                        });
                    }

                    function generateMigration() {
                        vscode.postMessage({
                            command: 'generateMigration',
                            selectedDifferences: Array.from(selectedDifferences)
                        });
                    }

                    function showConflictResolver() {
                        vscode.postMessage({
                            command: 'showConflictResolver'
                        });
                    }

                    function exportReport() {
                        vscode.postMessage({
                            command: 'exportReport'
                        });
                    }

                    function showSettings() {
                        vscode.postMessage({
                            command: 'showSettings'
                        });
                    }

                    function viewDifferenceDetails(differenceId) {
                        vscode.postMessage({
                            command: 'viewDifferenceDetails',
                            differenceId: differenceId
                        });
                    }

                    function updateSelectionCount() {
                        document.getElementById('selectionCount').textContent = selectedDifferences.size;
                    }

                    // Initialize view mode
                    document.getElementById(currentViewMode + 'ViewBtn').classList.add('active');
                </script>
            </body>
            </html>
        `;
    }

    private generateDifferenceCard(diff: InteractiveDifference): string {
        const typeClass = `icon-${diff.type.toLowerCase()}`;

        return `
            <div class="difference-card">
                <div class="difference-header" onclick="toggleCardExpansion('${diff.id}')">
                    <div class="difference-main">
                        <div class="difference-icon ${typeClass}"></div>
                        <div class="difference-info">
                            <div class="difference-title">${diff.objectName}</div>
                            <div class="difference-meta">
                                <span>${diff.objectType}</span>
                                <span>•</span>
                                <span>${diff.schema}</span>
                                <span>•</span>
                                <span class="difference-badge">${diff.severity}</span>
                                ${diff.impact ? `<span class="difference-badge impact-${diff.impact}">${diff.impact}</span>` : ''}
                                ${diff.breakingChange ? '<span class="difference-badge breaking">Breaking</span>' : ''}
                            </div>
                        </div>
                    </div>
                    <div class="difference-actions">
                        <input type="checkbox" class="action-btn"
                                id="checkbox-${diff.id}"
                                onchange="toggleDifferenceSelection('${diff.id}', this)">
                        <button class="action-btn" onclick="viewDifferenceDetails('${diff.id}')" title="View Details">👁</button>
                    </div>
                </div>
                <div class="difference-content" id="content-${diff.id}">
                    <div class="difference-details">
                        ${diff.sourceDefinition || diff.targetDefinition ? `
                        <div class="definition-panel">
                            <div class="panel-title">Definition Changes</div>
                            <div class="definition-content">
                                ${diff.sourceDefinition ? `<div style="color: var(--vscode-gitDecoration-deletedResourceForeground);">- ${diff.sourceDefinition.replace(/</g, '<')}</div>` : ''}
                                ${diff.targetDefinition ? `<div style="color: var(--vscode-gitDecoration-addedResourceForeground);">+ ${diff.targetDefinition.replace(/</g, '<')}</div>` : ''}
                            </div>
                        </div>
                        ` : ''}

                        ${diff.differenceDetails.length > 0 ? `
                        <div class="definition-panel">
                            <div class="panel-title">Change Details</div>
                            <ul class="details-list">
                                ${diff.differenceDetails.map(detail => `<li class="detail-item">${detail}</li>`).join('')}
                            </ul>
                        </div>
                        ` : ''}
                    </div>

                    ${diff.dependencies || diff.dependents ? `
                    <div class="dependency-info">
                        ${diff.dependencies && diff.dependencies.length > 0 ? `
                        <div class="panel-title">Dependencies (${diff.dependencies.length})</div>
                        <div>${diff.dependencies.join(', ')}</div>
                        ` : ''}

                        ${diff.dependents && diff.dependents.length > 0 ? `
                        <div class="panel-title">Dependents (${diff.dependents.length})</div>
                        <div>${diff.dependents.join(', ')}</div>
                        ` : ''}
                    </div>
                    ` : ''}

                    ${diff.tags && diff.tags.length > 0 ? `
                    <div class="tags-container">
                        ${diff.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    private applyFilters(differences: InteractiveDifference[]): InteractiveDifference[] {
        return differences.filter(diff => {
            if (this.filters.searchTerm) {
                const searchLower = this.filters.searchTerm.toLowerCase();
                if (!diff.objectName.toLowerCase().includes(searchLower) &&
                    !diff.objectType.toLowerCase().includes(searchLower) &&
                    !diff.schema.toLowerCase().includes(searchLower)) {
                    return false;
                }
            }

            if (this.filters.severities && this.filters.severities.length > 0) {
                if (!this.filters.severities.includes(diff.severity)) {
                    return false;
                }
            }

            if (this.filters.objectTypes && this.filters.objectTypes.length > 0) {
                if (!this.filters.objectTypes.includes(diff.objectType)) {
                    return false;
                }
            }

            if (this.filters.impact && this.filters.impact.length > 0) {
                if (!diff.impact || !this.filters.impact.includes(diff.impact)) {
                    return false;
                }
            }

            if (this.filters.showOnlyBreaking && !diff.breakingChange) {
                return false;
            }

            if (this.filters.showOnlyConflicts && (!diff.conflictLevel || diff.conflictLevel === 0)) {
                return false;
            }

            return true;
        });
    }

    private sortDifferences(differences: InteractiveDifference[]): InteractiveDifference[] {
        return differences.sort((a, b) => {
            // Sort by severity first (critical > high > medium > low)
            const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
            const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];

            if (severityDiff !== 0) {
                return severityDiff;
            }

            // Then by type
            const typeDiff = a.type.localeCompare(b.type);
            if (typeDiff !== 0) {
                return typeDiff;
            }

            // Finally by name
            return a.objectName.localeCompare(b.objectName);
        });
    }

    private async handleWebviewMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'search':
                this.filters.searchTerm = message.searchTerm;
                await this.refreshView();
                break;

            case 'filter':
                this.filters = message.filters;
                await this.refreshView();
                break;

            case 'setViewMode':
                this.viewMode = message.mode;
                await this.refreshView();
                break;

            case 'toggleSelection':
                // Selection state is managed by webview - no server-side tracking needed
                break;

            case 'selectAll':
            case 'selectNone':
                // Selection state is managed by webview - no server-side tracking needed
                break;

            case 'generateMigration':
                await this.handleGenerateMigration(message.selectedDifferences);
                break;

            case 'viewDifferenceDetails':
                await this.handleViewDifferenceDetails(message.differenceId);
                break;

            case 'exportReport':
                await this.handleExportReport();
                break;

            case 'showConflictResolver':
                await this.handleShowConflictResolver();
                break;

            case 'applyAutoResolution':
                await this.handleApplyAutoResolution(message.differenceId);
                break;

            case 'markAsReviewed':
                await this.handleMarkAsReviewed(message.differenceId);
                break;
        }
    }

    private async refreshView(): Promise<void> {
        if (this.panel && this.comparisonData) {
            const htmlContent = await this.generateInteractiveHtml(this.comparisonData);
            this.panel.webview.html = htmlContent;
        }
    }

    private renderViewMode(differences: InteractiveDifference[]): string {
        switch (this.viewMode) {
            case 'tree':
                return this.renderTreeView(differences);
            case 'graph':
                return this.renderGraphView(differences);
            default:
                return differences.map(diff => this.generateDifferenceCard(diff)).join('');
        }
    }

    private renderTreeView(differences: InteractiveDifference[]): string {
        // Group differences by object type and schema for tree view
        const grouped = differences.reduce((acc, diff) => {
            const key = `${diff.objectType}:${diff.schema}`;
            if (!acc[key]) {
                acc[key] = [];
            }
            acc[key].push(diff);
            return acc;
        }, {} as Record<string, InteractiveDifference[]>);

        return Object.entries(grouped).map(([groupKey, groupDifferences]) => {
            const [objectType] = groupKey.split(':');
            return `
                <div class="tree-group">
                    <div class="tree-group-header">
                        <strong>${objectType}</strong> (${groupDifferences.length} differences)
                    </div>
                    <div class="tree-group-items">
                        ${groupDifferences.map(diff => this.generateDifferenceCard(diff)).join('')}
                    </div>
                </div>
            `;
        }).join('');
    }

    private renderGraphView(differences: InteractiveDifference[]): string {
        // Simple graph representation showing relationships
        const nodes = differences.map(diff => ({
            id: diff.id,
            label: diff.objectName,
            type: diff.objectType,
            severity: diff.severity,
            impact: diff.impact
        }));

        return `
            <div class="graph-container">
                <div class="graph-legend">
                    <div class="legend-item">
                        <span class="legend-color" style="background: var(--vscode-gitDecoration-addedResourceForeground);"></span>
                        Safe Changes
                    </div>
                    <div class="legend-item">
                        <span class="legend-color" style="background: var(--vscode-gitDecoration-renamedResourceForeground);"></span>
                        Warning Changes
                    </div>
                    <div class="legend-item">
                        <span class="legend-color" style="background: var(--vscode-gitDecoration-deletedResourceForeground);"></span>
                        Dangerous Changes
                    </div>
                </div>
                <div class="graph-nodes">
                    ${nodes.map(node => `
                        <div class="graph-node severity-${node.severity} impact-${node.impact || 'safe'}"
                             onclick="viewDifferenceDetails('${node.id}')"
                             title="${node.label} (${node.type})">
                            ${node.label}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    private async handleGenerateMigration(selectedDifferences: string[]): Promise<void> {
        Logger.info('Generating migration for selected differences', { count: selectedDifferences.length });

        await vscode.commands.executeCommand('postgresql.generateMigration', {
            comparisonId: this.comparisonData?.comparisonId,
            selectedDifferences: selectedDifferences
        });
    }

    private async handleViewDifferenceDetails(differenceId: string): Promise<void> {
        const difference = this.comparisonData?.differences.find(d => d.id === differenceId);
        if (!difference) return;

        const panel = vscode.window.createWebviewPanel(
            'differenceDetails',
            `Difference Details: ${difference.objectName}`,
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        const detailsHtml = this.generateDetailedDifferenceView(difference);
        panel.webview.html = detailsHtml;
    }

    private generateDetailedDifferenceView(diff: InteractiveDifference): string {
        const impactColor = {
            'dangerous': 'var(--vscode-gitDecoration-deletedResourceForeground)',
            'warning': 'var(--vscode-gitDecoration-renamedResourceForeground)',
            'safe': 'var(--vscode-gitDecoration-addedResourceForeground)'
        };

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Difference Details: ${diff.objectName}</title>
                <style>
                    :root {
                        --vscode-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        --vscode-editor-background: #1e1e1e;
                        --vscode-editor-foreground: #cccccc;
                        --vscode-panel-border: #3c3c3c;
                        --vscode-textLink-foreground: #4da6ff;
                        --vscode-button-background: #0e639c;
                        --vscode-button-foreground: #ffffff;
                        --vscode-gitDecoration-addedResourceForeground: #4bb74a;
                        --vscode-gitDecoration-deletedResourceForeground: #f48771;
                        --vscode-gitDecoration-modifiedResourceForeground: #4da6ff;
                    }

                    body {
                        font-family: var(--vscode-font-family);
                        padding: 20px;
                        background: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                        line-height: 1.5;
                    }

                    .detail-container {
                        max-width: 900px;
                        margin: 0 auto;
                    }

                    .detail-header {
                        margin-bottom: 25px;
                        padding: 20px;
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 6px;
                    }

                    .detail-title {
                        font-size: 24px;
                        font-weight: bold;
                        margin-bottom: 15px;
                        color: var(--vscode-textLink-foreground);
                    }

                    .detail-meta {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                        gap: 15px;
                        font-size: 14px;
                    }

                    .meta-item {
                        display: flex;
                        flex-direction: column;
                        gap: 5px;
                    }

                    .meta-label {
                        font-weight: bold;
                        color: var(--vscode-textLink-foreground);
                        font-size: 12px;
                        text-transform: uppercase;
                    }

                    .meta-value {
                        padding: 8px 12px;
                        background: var(--vscode-badge-background);
                        border-radius: 4px;
                        font-family: 'Courier New', monospace;
                    }

                    .severity-critical { background: var(--vscode-gitDecoration-deletedResourceForeground); color: white; }
                    .severity-high { background: #ff6b35; color: white; }
                    .severity-medium { background: var(--vscode-gitDecoration-renamedResourceForeground); color: white; }
                    .severity-low { background: var(--vscode-gitDecoration-addedResourceForeground); color: white; }

                    .impact-dangerous { color: var(--vscode-gitDecoration-deletedResourceForeground); }
                    .impact-warning { color: var(--vscode-gitDecoration-renamedResourceForeground); }
                    .impact-safe { color: var(--vscode-gitDecoration-addedResourceForeground); }

                    .detail-section {
                        margin-bottom: 25px;
                        padding: 20px;
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 6px;
                    }

                    .section-title {
                        font-size: 16px;
                        font-weight: bold;
                        margin-bottom: 15px;
                        color: var(--vscode-textLink-foreground);
                        border-bottom: 1px solid var(--vscode-panel-border);
                        padding-bottom: 8px;
                    }

                    .definition-diff {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 20px;
                        margin-bottom: 20px;
                    }

                    .definition-panel {
                        background: var(--vscode-textCodeBlock-background, '#1e1e1e');
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 4px;
                        padding: 15px;
                    }

                    .definition-panel.source {
                        border-left: 3px solid var(--vscode-gitDecoration-deletedResourceForeground);
                    }

                    .definition-panel.target {
                        border-left: 3px solid var(--vscode-gitDecoration-addedResourceForeground);
                    }

                    .panel-title {
                        font-weight: bold;
                        margin-bottom: 10px;
                        font-size: 13px;
                        color: var(--vscode-textLink-foreground);
                    }

                    .definition-content {
                        font-family: 'Courier New', monospace;
                        font-size: 12px;
                        line-height: 1.4;
                        max-height: 300px;
                        overflow: auto;
                        white-space: pre-wrap;
                    }

                    .details-list {
                        list-style: none;
                        padding: 0;
                        margin: 0;
                    }

                    .detail-item {
                        padding: 8px 0;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        font-size: 13px;
                    }

                    .detail-item:last-child {
                        border-bottom: none;
                    }

                    .tags-container {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 8px;
                        margin-top: 15px;
                    }

                    .tag {
                        background: var(--vscode-badge-background);
                        color: var(--vscode-badge-foreground);
                        padding: 4px 10px;
                        border-radius: 12px;
                        font-size: 11px;
                    }

                    .dependency-info {
                        background: var(--vscode-textBlockQuote-background);
                        border: 1px solid var(--vscode-textBlockQuote-border);
                        border-radius: 4px;
                        padding: 15px;
                        margin-top: 15px;
                    }

                    .dependency-item {
                        margin-bottom: 10px;
                    }

                    .dependency-title {
                        font-weight: bold;
                        color: var(--vscode-textLink-foreground);
                        margin-bottom: 5px;
                    }

                    .dependency-list {
                        font-family: 'Courier New', monospace;
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                    }

                    .actions {
                        margin-top: 25px;
                        padding: 15px;
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 6px;
                        display: flex;
                        justify-content: flex-end;
                        gap: 10px;
                    }

                    .btn {
                        padding: 8px 16px;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 13px;
                        font-weight: bold;
                    }

                    .btn-primary {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                    }

                    .btn-secondary {
                        background: var(--vscode-button-secondaryBackground, '#3c3c3c');
                        color: var(--vscode-button-secondaryForeground, '#cccccc');
                    }
                </style>
            </head>
            <body>
                <div class="detail-container">
                    <div class="detail-header">
                        <div class="detail-title">${diff.objectName}</div>
                        <div class="detail-meta">
                            <div class="meta-item">
                                <div class="meta-label">Change Type</div>
                                <div class="meta-value">${diff.type}</div>
                            </div>
                            <div class="meta-item">
                                <div class="meta-label">Object Type</div>
                                <div class="meta-value">${diff.objectType}</div>
                            </div>
                            <div class="meta-item">
                                <div class="meta-label">Schema</div>
                                <div class="meta-value">${diff.schema}</div>
                            </div>
                            <div class="meta-item">
                                <div class="meta-label">Severity</div>
                                <div class="meta-value severity-${diff.severity}">${diff.severity.toUpperCase()}</div>
                            </div>
                            ${diff.impact ? `
                            <div class="meta-item">
                                <div class="meta-label">Impact</div>
                                <div class="meta-value impact-${diff.impact}">${diff.impact.toUpperCase()}</div>
                            </div>
                            ` : ''}
                            ${diff.breakingChange ? `
                            <div class="meta-item">
                                <div class="meta-label">Status</div>
                                <div class="meta-value" style="background: var(--vscode-gitDecoration-deletedResourceForeground); color: white;">BREAKING CHANGE</div>
                            </div>
                            ` : ''}
                        </div>
                    </div>

                    ${diff.sourceDefinition || diff.targetDefinition ? `
                    <div class="detail-section">
                        <div class="section-title">Definition Changes</div>
                        <div class="definition-diff">
                            ${diff.sourceDefinition ? `
                            <div class="definition-panel source">
                                <div class="panel-title">Source Definition</div>
                                <div class="definition-content">${diff.sourceDefinition.replace(/</g, '<').replace(/>/g, '>')}</div>
                            </div>
                            ` : ''}
                            ${diff.targetDefinition ? `
                            <div class="definition-panel target">
                                <div class="panel-title">Target Definition</div>
                                <div class="definition-content">${diff.targetDefinition.replace(/</g, '<').replace(/>/g, '>')}</div>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                    ` : ''}

                    ${diff.differenceDetails.length > 0 ? `
                    <div class="detail-section">
                        <div class="section-title">Change Details</div>
                        <ul class="details-list">
                            ${diff.differenceDetails.map(detail => `<li class="detail-item">${detail}</li>`).join('')}
                        </ul>
                    </div>
                    ` : ''}

                    ${diff.dependencies || diff.dependents ? `
                    <div class="detail-section">
                        <div class="section-title">Dependencies & Dependents</div>
                        <div class="dependency-info">
                            ${diff.dependencies && diff.dependencies.length > 0 ? `
                            <div class="dependency-item">
                                <div class="dependency-title">Dependencies (${diff.dependencies.length})</div>
                                <div class="dependency-list">${diff.dependencies.join(', ')}</div>
                            </div>
                            ` : ''}

                            ${diff.dependents && diff.dependents.length > 0 ? `
                            <div class="dependency-item">
                                <div class="dependency-title">Dependents (${diff.dependents.length})</div>
                                <div class="dependency-list">${diff.dependents.join(', ')}</div>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                    ` : ''}

                    ${diff.estimatedMigrationTime ? `
                    <div class="detail-section">
                        <div class="section-title">Migration Information</div>
                        <div style="font-size: 14px;">
                            <div><strong>Estimated Migration Time:</strong> ${diff.estimatedMigrationTime}</div>
                            ${diff.conflictLevel ? `<div><strong>Conflict Level:</strong> ${diff.conflictLevel}/10</div>` : ''}
                        </div>
                    </div>
                    ` : ''}

                    ${diff.tags && diff.tags.length > 0 ? `
                    <div class="detail-section">
                        <div class="section-title">Tags</div>
                        <div class="tags-container">
                            ${diff.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                        </div>
                    </div>
                    ` : ''}

                    <div class="actions">
                        <button class="btn btn-secondary" onclick="window.close()">Close</button>
                        ${diff.resolution === 'auto' ? `<button class="btn btn-primary" onclick="applyAutoResolution()">Apply Auto Resolution</button>` : ''}
                        <button class="btn btn-primary" onclick="markAsReviewed()">Mark as Reviewed</button>
                    </div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();

                    function applyAutoResolution() {
                        vscode.postMessage({
                            command: 'applyAutoResolution',
                            differenceId: '${diff.id}'
                        });
                    }

                    function markAsReviewed() {
                        vscode.postMessage({
                            command: 'markAsReviewed',
                            differenceId: '${diff.id}'
                        });
                    }
                </script>
            </body>
            </html>
        `;
    }

    private async handleExportReport(): Promise<void> {
        if (!this.comparisonData) return;

        try {
            const reportContent = this.generateComparisonReport(this.comparisonData);
            const uri = await vscode.window.showSaveDialog({
                filters: {
                    'Text Files': ['txt'],
                    'JSON Files': ['json'],
                    'All Files': ['*']
                },
                defaultUri: vscode.Uri.file(`schema-comparison-${this.comparisonData.comparisonId}.txt`)
            });

            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(reportContent, 'utf8'));
                vscode.window.showInformationMessage('Comparison report exported successfully');
            }
        } catch (error) {
            Logger.error('Failed to export comparison report', error as Error);
            vscode.window.showErrorMessage('Failed to export comparison report');
        }
    }

    private generateComparisonReport(data: InteractiveComparisonData): string {
        let report = `Interactive Schema Comparison Report
                    Generated: ${new Date(data.createdAt).toLocaleString()}
                    Comparison ID: ${data.comparisonId}
                    Source: ${data.sourceConnection}
                    Target: ${data.targetConnection}
                    Mode: ${data.comparisonMode}
                    Execution Time: ${data.executionTime}
                    Total Differences: ${data.totalDifferences}

                    Summary:
                    - Added: ${data.differences.filter(d => d.type === 'Added').length}
                    - Removed: ${data.differences.filter(d => d.type === 'Removed').length}
                    - Modified: ${data.differences.filter(d => d.type === 'Modified').length}
                    - Moved: ${data.differences.filter(d => d.type === 'Moved').length}

                    Differences by Severity:
                    `;

        const bySeverity = data.differences.reduce((acc, diff) => {
            acc[diff.severity] = (acc[diff.severity] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        Object.entries(bySeverity).forEach(([severity, count]) => {
            report += `- ${severity}: ${count}\n`;
        });

        report += '\nDetailed Differences:\n';
        data.differences.forEach((diff, index) => {
            report += `\n${index + 1}. ${diff.type} ${diff.objectType}: ${diff.objectName} (${diff.schema})\n`;
            report += `   Severity: ${diff.severity}\n`;
            if (diff.impact) report += `   Impact: ${diff.impact}\n`;
            if (diff.breakingChange) report += `   ⚠️  Breaking Change\n`;
            if (diff.differenceDetails.length > 0) {
                diff.differenceDetails.forEach(detail => {
                    report += `   - ${detail}\n`;
                });
            }
        });

        return report;
    }

    private async handleShowConflictResolver(): Promise<void> {
        if (!this.comparisonData) return;

        const conflicts = this.comparisonData.differences.filter(d => d.conflictLevel && d.conflictLevel > 0);

        if (conflicts.length === 0) {
            vscode.window.showInformationMessage('No conflicts found in the comparison');
            return;
        }

        // Show conflict resolution dialog
        const conflictItems = conflicts.map(conflict => ({
            label: `${conflict.objectName} (${conflict.objectType})`,
            detail: `Severity: ${conflict.severity}, Impact: ${conflict.impact || 'unknown'}`,
            data: conflict
        }));

        const selectedConflict = await vscode.window.showQuickPick(conflictItems, {
            placeHolder: 'Select a conflict to resolve'
        });

        if (selectedConflict) {
            // Handle conflict resolution
            Logger.info('Opening conflict resolver for', { differenceId: selectedConflict.data.id });
            // This would open a specialized conflict resolution view
        }
    }

    private async handleApplyAutoResolution(differenceId: string): Promise<void> {
        const difference = this.comparisonData?.differences.find(d => d.id === differenceId);
        if (!difference) return;

        try {
            Logger.info('Applying auto resolution for difference', { differenceId, objectName: difference.objectName });

            // Mark the difference as resolved
            difference.resolution = 'auto';

            vscode.window.showInformationMessage(
                `Auto resolution applied for ${difference.objectName}`,
                'Undo', 'View Details'
            ).then(selection => {
                if (selection === 'Undo') {
                    difference.resolution = 'manual';
                } else if (selection === 'View Details') {
                    this.handleViewDifferenceDetails(differenceId);
                }
            });

        } catch (error) {
            Logger.error('Failed to apply auto resolution', error as Error);
            vscode.window.showErrorMessage('Failed to apply auto resolution');
        }
    }

    private async handleMarkAsReviewed(differenceId: string): Promise<void> {
        const difference = this.comparisonData?.differences.find(d => d.id === differenceId);
        if (!difference) return;

        try {
            Logger.info('Marking difference as reviewed', { differenceId, objectName: difference.objectName });

            // Add a reviewed tag to track that this has been manually reviewed
            if (!difference.tags) {
                difference.tags = [];
            }
            difference.tags.push('reviewed');

            vscode.window.showInformationMessage(`Marked ${difference.objectName} as reviewed`);

        } catch (error) {
            Logger.error('Failed to mark difference as reviewed', error as Error);
            vscode.window.showErrorMessage('Failed to mark difference as reviewed');
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