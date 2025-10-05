import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';
import { DotNetIntegrationService, DotNetSchemaComparison, DotNetConnectionInfo } from '../services/DotNetIntegrationService';

export interface InteractiveComparisonData {
    id: string;
    sourceConnection: DotNetConnectionInfo;
    targetConnection: DotNetConnectionInfo;
    differences: InteractiveDifference[];
    comparisonOptions: ComparisonOptions;
    createdAt: string;
    executionTime: string;
    userSelections: UserSelection[];
}

export interface InteractiveDifference {
    id: string;
    type: 'Added' | 'Removed' | 'Modified' | 'Moved';
    objectType: string;
    objectName: string;
    schema: string;
    sourceDefinition?: string | undefined;
    targetDefinition?: string | undefined;
    differenceDetails: string[];
    severity: 'low' | 'medium' | 'high' | 'critical';
    selected: boolean;
    userNotes?: string;
    resolution?: 'include' | 'exclude' | 'modify';
}

export interface ComparisonOptions {
    mode: 'strict' | 'lenient';
    ignoreSchemas: string[];
    includeSystemObjects: boolean;
    caseSensitive: boolean;
    autoResolveConflicts: boolean;
}

export interface UserSelection {
    differenceId: string;
    action: 'include' | 'exclude' | 'modify';
    customScript?: string;
    notes?: string;
    timestamp: string;
}

export class InteractiveSchemaComparisonView {
    private panel: vscode.WebviewPanel | undefined;
    private comparisonData: InteractiveComparisonData | undefined;

    constructor(
        private dotNetService: DotNetIntegrationService
    ) { }

    async showComparison(comparisonData?: InteractiveComparisonData): Promise<void> {
        try {
            Logger.info('Opening interactive schema comparison view');

            if (comparisonData) {
                this.comparisonData = comparisonData;
            }

            this.panel = vscode.window.createWebviewPanel(
                'postgresqlInteractiveComparison',
                'Interactive Schema Comparison',
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
            const htmlContent = await this.generateInteractiveComparisonHtml(this.comparisonData);
            this.panel.webview.html = htmlContent;

            // Handle messages from webview
            this.panel.webview.onDidReceiveMessage(async (message) => {
                await this.handleWebviewMessage(message);
            });

        } catch (error) {
            Logger.error('Failed to show interactive schema comparison', error as Error, 'showComparison');
            vscode.window.showErrorMessage(
                `Failed to open interactive schema comparison: ${(error as Error).message}`
            );
        }
    }

    async performInteractiveComparison(
        sourceConnection: DotNetConnectionInfo,
        targetConnection: DotNetConnectionInfo,
        options: ComparisonOptions
    ): Promise<void> {
        try {
            Logger.info('Performing interactive schema comparison', 'performInteractiveComparison', {
                source: sourceConnection.name,
                target: targetConnection.name
            });

            // Show progress indicator
            const progressOptions: vscode.ProgressOptions = {
                location: vscode.ProgressLocation.Notification,
                title: 'Performing Interactive Schema Comparison',
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

                // Convert .NET comparison to interactive format
                this.comparisonData = this.convertToInteractiveComparison(dotNetComparison, options);

                progress.report({ increment: 100, message: 'Comparison complete' });

                // Update the view with results
                if (this.panel) {
                    const htmlContent = await this.generateInteractiveComparisonHtml(this.comparisonData);
                    this.panel.webview.html = htmlContent;
                }
            });

        } catch (error) {
            Logger.error('Interactive schema comparison failed', error as Error, 'performInteractiveComparison');
            vscode.window.showErrorMessage(
                `Interactive schema comparison failed: ${(error as Error).message}`
            );
            throw error;
        }
    }

    private convertToInteractiveComparison(
        dotNetComparison: DotNetSchemaComparison,
        options: ComparisonOptions
    ): InteractiveComparisonData {
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
                selected: this.shouldAutoSelect(diff),
                resolution: 'include'
            })),
            comparisonOptions: options,
            createdAt: dotNetComparison.createdAt,
            executionTime: dotNetComparison.executionTime,
            userSelections: []
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

    private shouldAutoSelect(difference: any): boolean {
        // Auto-select non-critical differences for inclusion
        return difference.type === 'Added' || (difference.type === 'Modified' && difference.severity !== 'critical');
    }

    private async generateInteractiveComparisonHtml(data?: InteractiveComparisonData): Promise<string> {
        if (!data) {
            return this.generateEmptyStateHtml();
        }

        const differencesByType = this.groupDifferencesByType(data.differences);
        const differencesBySeverity = this.groupDifferencesBySeverity(data.differences);
        const selectedCount = data.differences.filter(d => d.selected).length;

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

                    .selection-summary {
                        background: var(--vscode-panel-border);
                        padding: 8px 12px;
                        border-radius: 4px;
                        font-size: 12px;
                    }

                    .content-area {
                        flex: 1;
                        overflow: auto;
                        padding: 20px;
                    }

                    .toolbar {
                        display: flex;
                        gap: 10px;
                        margin-bottom: 20px;
                        padding: 15px;
                        background: var(--vscode-panel-border);
                        border-radius: 6px;
                    }

                    .toolbar-btn {
                        padding: 8px 16px;
                        border: 1px solid var(--vscode-panel-border);
                        background: transparent;
                        color: var(--vscode-editor-foreground);
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 12px;
                    }

                    .toolbar-btn:hover {
                        background: var(--vscode-list-hoverBackground);
                    }

                    .toolbar-btn.primary {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border-color: var(--vscode-button-background);
                    }

                    .toolbar-btn.danger {
                        background: var(--vscode-gitDecoration-deletedResourceForeground);
                        color: var(--vscode-editor-background);
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
                        align-items: flex-start;
                        gap: 10px;
                        padding: 12px 15px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        cursor: pointer;
                        transition: background-color 0.2s;
                    }

                    .difference-item:hover {
                        background: var(--vscode-list-hoverBackground);
                    }

                    .difference-item.selected {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                    }

                    .difference-checkbox {
                        margin-top: 2px;
                        flex-shrink: 0;
                    }

                    .difference-icon {
                        width: 12px;
                        height: 12px;
                        border-radius: 50%;
                        flex-shrink: 0;
                        margin-top: 2px;
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
                        margin-bottom: 4px;
                        display: flex;
                        gap: 8px;
                        align-items: center;
                    }

                    .difference-meta {
                        font-size: 11px;
                        color: var(--vscode-descriptionForeground);
                        margin-bottom: 4px;
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

                    .difference-actions {
                        display: flex;
                        gap: 5px;
                        margin-top: 8px;
                    }

                    .action-btn {
                        padding: 4px 8px;
                        border: 1px solid var(--vscode-panel-border);
                        background: transparent;
                        color: var(--vscode-editor-foreground);
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 10px;
                    }

                    .action-btn:hover {
                        background: var(--vscode-list-hoverBackground);
                    }

                    .diff-details {
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 4px;
                        padding: 15px;
                        margin-top: 10px;
                        font-family: 'Consolas', 'Courier New', monospace;
                        font-size: 12px;
                        white-space: pre-wrap;
                    }

                    .notes-section {
                        margin-top: 10px;
                    }

                    .notes-input {
                        width: 100%;
                        min-height: 60px;
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 3px;
                        padding: 8px;
                        font-size: 11px;
                        resize: vertical;
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

                    .stats {
                        display: flex;
                        gap: 15px;
                        font-size: 11px;
                    }

                    .stat-item {
                        display: flex;
                        align-items: center;
                        gap: 5px;
                    }

                    .stat-dot {
                        width: 8px;
                        height: 8px;
                        border-radius: 50%;
                    }

                    .dot-added { background: var(--vscode-gitDecoration-addedResourceForeground); }
                    .dot-removed { background: var(--vscode-gitDecoration-deletedResourceForeground); }
                    .dot-modified { background: var(--vscode-gitDecoration-modifiedResourceForeground); }
                    .dot-moved { background: var(--vscode-gitDecoration-renamedResourceForeground); }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="comparison-info">
                        <h2>Interactive Schema Comparison</h2>
                        <span class="connection-badge source-badge">Source: ${data.sourceConnection.name}</span>
                        <span class="connection-badge target-badge">Target: ${data.targetConnection.name}</span>
                    </div>
                    <div class="selection-summary">
                        ${selectedCount}/${data.differences.length} differences selected
                    </div>
                </div>

                <div class="content-area">
                    <!-- Toolbar -->
                    <div class="toolbar">
                        <button class="toolbar-btn primary" onclick="selectAll()">Select All</button>
                        <button class="toolbar-btn" onclick="selectNone()">Select None</button>
                        <button class="toolbar-btn" onclick="selectBySeverity('critical')">Select Critical</button>
                        <button class="toolbar-btn" onclick="selectBySeverity('high')">Select High</button>
                        <button class="toolbar-btn" onclick="autoResolve()">Auto-Resolve</button>
                        <button class="toolbar-btn primary" onclick="generateSelectedMigration()">Generate Migration</button>
                    </div>

                    <!-- Differences Section -->
                    <div class="differences-section">
                        <div class="section-header">
                            <div class="section-title">Differences (${data.differences.length})</div>
                            <div class="filter-controls">
                                <button class="filter-btn active" onclick="filterDifferences('all')">All</button>
                                <button class="filter-btn" onclick="filterDifferences('selected')">Selected</button>
                                <button class="filter-btn" onclick="filterDifferences('critical')">Critical</button>
                                <button class="filter-btn" onclick="filterDifferences('high')">High</button>
                            </div>
                        </div>
                        <div class="differences-list" id="differencesList">
                            ${data.differences.map((diff, index) => `
                                <div class="difference-item ${diff.selected ? 'selected' : ''}" data-severity="${diff.severity}" data-index="${index}">
                                    <input type="checkbox" class="difference-checkbox"
                                           ${diff.selected ? 'checked' : ''}
                                           onchange="toggleDifference(${index})">
                                    <div class="difference-icon diff-${diff.type.toLowerCase()}"></div>
                                    <div class="difference-content">
                                        <div class="difference-title">
                                            <span>${diff.objectName} (${diff.objectType})</span>
                                            <span class="severity-badge severity-${diff.severity}">${diff.severity}</span>
                                        </div>
                                        <div class="difference-meta">
                                            Schema: ${diff.schema} • Type: ${diff.type}
                                        </div>
                                        <div class="difference-actions">
                                            <button class="action-btn" onclick="setResolution(${index}, 'include')">Include</button>
                                            <button class="action-btn" onclick="setResolution(${index}, 'exclude')">Exclude</button>
                                            <button class="action-btn" onclick="setResolution(${index}, 'modify')">Modify</button>
                                        </div>
                                        <div class="notes-section">
                                            <textarea class="notes-input"
                                                      placeholder="Add notes for this difference..."
                                                      oninput="updateNotes(${index}, this.value)">${diff.userNotes || ''}</textarea>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Difference Details (shown when item is clicked) -->
                    <div id="differenceDetails" class="diff-details" style="display: none;">
                        <h4>Difference Details</h4>
                        <div id="detailsContent"></div>
                    </div>
                </div>

                <div class="footer">
                    <div class="stats">
                        <div class="stat-item">
                            <div class="stat-dot dot-added"></div>
                            <span>Added: ${differencesByType.Added || 0}</span>
                        </div>
                        <div class="stat-item">
                            <div class="stat-dot dot-removed"></div>
                            <span>Removed: ${differencesByType.Removed || 0}</span>
                        </div>
                        <div class="stat-item">
                            <div class="stat-dot dot-modified"></div>
                            <span>Modified: ${differencesByType.Modified || 0}</span>
                        </div>
                        <div class="stat-item">
                            <div class="stat-dot dot-moved"></div>
                            <span>Moved: ${differencesByType.Moved || 0}</span>
                        </div>
                    </div>
                    <div class="actions">
                        <button class="btn btn-secondary" onclick="exportComparison()">Export</button>
                        <button class="btn btn-primary" onclick="generateSelectedMigration()">Generate Migration</button>
                    </div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    const differences = ${JSON.stringify(data.differences)};
                    let currentFilter = 'all';

                    function toggleDifference(index) {
                        differences[index].selected = !differences[index].selected;
                        updateSelectionSummary();
                        vscode.postMessage({
                            command: 'updateSelection',
                            differenceId: differences[index].id,
                            selected: differences[index].selected
                        });
                    }

                    function setResolution(index, resolution) {
                        differences[index].resolution = resolution;
                        vscode.postMessage({
                            command: 'setResolution',
                            differenceId: differences[index].id,
                            resolution: resolution
                        });
                    }

                    function updateNotes(index, notes) {
                        differences[index].userNotes = notes;
                        vscode.postMessage({
                            command: 'updateNotes',
                            differenceId: differences[index].id,
                            notes: notes
                        });
                    }

                    function selectAll() {
                        differences.forEach(diff => diff.selected = true);
                        updateUI();
                        vscode.postMessage({
                            command: 'selectAll'
                        });
                    }

                    function selectNone() {
                        differences.forEach(diff => diff.selected = false);
                        updateUI();
                        vscode.postMessage({
                            command: 'selectNone'
                        });
                    }

                    function selectBySeverity(severity) {
                        differences.forEach(diff => {
                            diff.selected = diff.severity === severity || (severity === 'high' && diff.severity === 'critical');
                        });
                        updateUI();
                        vscode.postMessage({
                            command: 'selectBySeverity',
                            severity: severity
                        });
                    }

                    function autoResolve() {
                        differences.forEach(diff => {
                            if (diff.type === 'Added' || (diff.type === 'Modified' && diff.severity !== 'critical')) {
                                diff.selected = true;
                                diff.resolution = 'include';
                            }
                        });
                        updateUI();
                        vscode.postMessage({
                            command: 'autoResolve'
                        });
                    }

                    function filterDifferences(filter) {
                        currentFilter = filter;
                        const items = document.querySelectorAll('.difference-item');

                        items.forEach((item, index) => {
                            const diff = differences[index];
                            let shouldShow = false;

                            switch (filter) {
                                case 'all':
                                    shouldShow = true;
                                    break;
                                case 'selected':
                                    shouldShow = diff.selected;
                                    break;
                                case 'critical':
                                    shouldShow = diff.severity === 'critical';
                                    break;
                                case 'high':
                                    shouldShow = diff.severity === 'high' || diff.severity === 'critical';
                                    break;
                            }

                            item.style.display = shouldShow ? 'flex' : 'none';
                        });

                        // Update filter button states
                        document.querySelectorAll('.filter-btn').forEach(btn => {
                            btn.classList.remove('active');
                        });
                        event.target.classList.add('active');
                    }

                    function updateUI() {
                        const items = document.querySelectorAll('.difference-item');
                        items.forEach((item, index) => {
                            const diff = differences[index];
                            item.classList.toggle('selected', diff.selected);
                            const checkbox = item.querySelector('.difference-checkbox');
                            if (checkbox) {
                                checkbox.checked = diff.selected;
                            }
                        });
                        updateSelectionSummary();
                    }

                    function updateSelectionSummary() {
                        const selectedCount = differences.filter(d => d.selected).length;
                        document.querySelector('.selection-summary').textContent =
                            \`\${selectedCount}/\${differences.length} differences selected\`;
                    }

                    function generateSelectedMigration() {
                        const selectedDifferences = differences.filter(d => d.selected);
                        vscode.postMessage({
                            command: 'generateSelectedMigration',
                            selectedDifferences: selectedDifferences
                        });
                    }

                    function exportComparison() {
                        vscode.postMessage({
                            command: 'exportComparison',
                            data: ${JSON.stringify(data)}
                        });
                    }

                    // Initialize UI
                    updateSelectionSummary();
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
                <title>Interactive Schema Comparison</title>
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
                    <div class="icon">⚖️</div>
                    <div class="title">Interactive Schema Comparison</div>
                    <div class="description">
                        Compare database schemas interactively. Select which differences to include in migration, add notes, and resolve conflicts before generating migration scripts.
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

    private groupDifferencesByType(differences: InteractiveDifference[]): Record<string, number> {
        return differences.reduce((acc, diff) => {
            acc[diff.type] = (acc[diff.type] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
    }

    private groupDifferencesBySeverity(differences: InteractiveDifference[]): Record<string, number> {
        return differences.reduce((acc, diff) => {
            acc[diff.severity] = (acc[diff.severity] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
    }

    private async handleWebviewMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'updateSelection':
                if (this.comparisonData) {
                    const diff = this.comparisonData.differences.find(d => d.id === message.differenceId);
                    if (diff) {
                        diff.selected = message.selected;
                    }
                }
                break;
            case 'setResolution':
                if (this.comparisonData) {
                    const diff = this.comparisonData.differences.find(d => d.id === message.differenceId);
                    if (diff) {
                        diff.resolution = message.resolution;
                    }
                }
                break;
            case 'updateNotes':
                if (this.comparisonData) {
                    const diff = this.comparisonData.differences.find(d => d.id === message.differenceId);
                    if (diff) {
                        diff.userNotes = message.notes;
                    }
                }
                break;
            case 'generateSelectedMigration':
                await this.generateSelectedMigration(message.selectedDifferences);
                break;
            case 'exportComparison':
                await this.exportComparison(message.data);
                break;
            case 'startNewComparison':
                await vscode.commands.executeCommand('postgresql.compareSchemas');
                break;
        }
    }

    private async generateSelectedMigration(selectedDifferences: InteractiveDifference[]): Promise<void> {
        try {
            // Create a mock comparison with only selected differences
            const mockComparison = {
                ...this.comparisonData!,
                differences: selectedDifferences.map(diff => ({
                    type: diff.type,
                    objectType: diff.objectType,
                    objectName: diff.objectName,
                    schema: diff.schema,
                    sourceDefinition: diff.sourceDefinition,
                    targetDefinition: diff.targetDefinition,
                    differenceDetails: diff.differenceDetails
                }))
            };

            await vscode.commands.executeCommand('postgresql.generateMigration', mockComparison);
        } catch (error) {
            Logger.error('Failed to generate selected migration', error as Error, 'generateSelectedMigration');
            vscode.window.showErrorMessage('Failed to generate migration from selected differences');
        }
    }

    private async exportComparison(data: InteractiveComparisonData): Promise<void> {
        try {
            const exportContent = JSON.stringify(data, null, 2);
            const uri = await vscode.window.showSaveDialog({
                filters: {
                    'JSON Files': ['json'],
                    'Text Files': ['txt'],
                    'All Files': ['*']
                },
                defaultUri: vscode.Uri.file(`interactive-comparison-${new Date().toISOString().split('T')[0]}.json`)
            });

            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(exportContent, 'utf8'));
                vscode.window.showInformationMessage('Interactive comparison exported successfully');
            }
        } catch (error) {
            Logger.error('Failed to export interactive comparison', error as Error, 'exportComparison');
            vscode.window.showErrorMessage('Failed to export interactive comparison');
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