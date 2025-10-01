import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';

export interface SchemaComparisonData {
    comparisonId: string;
    sourceConnection: string;
    targetConnection: string;
    differences: SchemaDifference[];
    totalDifferences: number;
    comparisonMode: string;
    executionTime: string;
    createdAt: string;
}

export interface SchemaDifference {
    type: 'Added' | 'Removed' | 'Modified' | 'Moved';
    objectType: string;
    objectName: string;
    schema: string;
    sourceDefinition?: string | undefined;
    targetDefinition?: string | undefined;
    differenceDetails: string[];
    severity: 'low' | 'medium' | 'high' | 'critical';
}

export class SchemaComparisonView {
    async showComparison(comparisonData: SchemaComparisonData): Promise<void> {
        try {
            Logger.info('Opening schema comparison view', { comparisonId: comparisonData.comparisonId });

            const panel = vscode.window.createWebviewPanel(
                'schemaComparison',
                `Schema Comparison: ${comparisonData.sourceConnection} → ${comparisonData.targetConnection}`,
                vscode.ViewColumn.One,
                { enableScripts: true, retainContextWhenHidden: true }
            );

            const comparisonHtml = await this.generateComparisonHtml(comparisonData);
            panel.webview.html = comparisonHtml;

            // Handle messages from webview
            panel.webview.onDidReceiveMessage(async (message) => {
                switch (message.command) {
                    case 'generateMigration':
                        await this.handleGenerateMigration(message.selectedDifferences);
                        break;
                    case 'viewDifferenceDetails':
                        await this.handleViewDifferenceDetails(message.difference);
                        break;
                    case 'filterDifferences':
                        await this.handleFilterDifferences(panel, message.filter);
                        break;
                    case 'exportComparison':
                        await this.handleExportComparison(comparisonData);
                        break;
                }
            });
        } catch (error) {
            Logger.error('Failed to show schema comparison', error as Error);
            vscode.window.showErrorMessage(
                `Failed to open schema comparison: ${(error as Error).message}`
            );
        }
    }

    private async generateComparisonHtml(data: SchemaComparisonData): Promise<string> {
        const differencesByType = data.differences.reduce((acc, diff) => {
            if (!acc[diff.objectType]) {
                acc[diff.objectType] = [];
            }
            acc[diff.objectType].push(diff);
            return acc;
        }, {} as Record<string, SchemaDifference[]>);

        const typeSections = Object.entries(differencesByType)
            .map(([type, differences]) => this.generateTypeSection(type, differences))
            .join('');

        const stats = this.generateComparisonStats(data);

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
                        padding: 20px;
                        background: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                    }
                    .header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 20px;
                        padding-bottom: 15px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                    }
                    .search-filter {
                        margin-bottom: 20px;
                    }
                    .search-filter input {
                        width: 100%;
                        padding: 8px;
                        border: 1px solid var(--vscode-input-border);
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border-radius: 4px;
                        box-sizing: border-box;
                    }
                    .stats {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                        gap: 15px;
                        margin-bottom: 25px;
                    }
                    .stat-card {
                        background: var(--vscode-textBlockQuote-background);
                        padding: 15px;
                        border-radius: 6px;
                        border: 1px solid var(--vscode-textBlockQuote-border);
                        text-align: center;
                    }
                    .stat-value {
                        font-size: 24px;
                        font-weight: bold;
                        color: var(--vscode-textLink-foreground);
                    }
                    .stat-label {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                        margin-top: 5px;
                    }
                    .type-section {
                        margin-bottom: 25px;
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 6px;
                        overflow: hidden;
                    }
                    .type-header {
                        background: var(--vscode-titleBar-activeBackground);
                        color: var(--vscode-titleBar-activeForeground);
                        padding: 12px 15px;
                        font-weight: bold;
                        cursor: pointer;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }
                    .type-content {
                        padding: 15px;
                    }
                    .difference-item {
                        background: var(--vscode-list-inactiveSelectionBackground);
                        padding: 12px;
                        margin-bottom: 10px;
                        border-radius: 4px;
                        border: 1px solid var(--vscode-list-inactiveSelectionBackground);
                        cursor: pointer;
                        transition: all 0.1s ease;
                    }
                    .difference-item:hover {
                        background: var(--vscode-list-hoverBackground);
                        border-color: var(--vscode-list-hoverBackground);
                    }
                    .difference-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 8px;
                    }
                    .difference-title {
                        font-weight: bold;
                        color: var(--vscode-textLink-foreground);
                    }
                    .difference-type {
                        padding: 2px 8px;
                        border-radius: 12px;
                        font-size: 11px;
                        font-weight: bold;
                        text-transform: uppercase;
                    }
                    .type-added { background: var(--vscode-gitDecoration-addedResourceForeground); color: var(--vscode-gitDecoration-addedResourceForeground); }
                    .type-removed { background: var(--vscode-gitDecoration-deletedResourceForeground); color: var(--vscode-gitDecoration-deletedResourceForeground); }
                    .type-modified { background: var(--vscode-gitDecoration-modifiedResourceForeground); color: var(--vscode-gitDecoration-modifiedResourceForeground); }
                    .type-moved { background: var(--vscode-gitDecoration-renamedResourceForeground); color: var(--vscode-gitDecoration-renamedResourceForeground); }
                    .difference-meta {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                        margin-bottom: 8px;
                    }
                    .difference-details {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                    }
                    .actions {
                        margin-top: 25px;
                        display: flex;
                        gap: 10px;
                        justify-content: flex-end;
                    }
                    .btn {
                        padding: 10px 20px;
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
                    .btn-primary:hover {
                        background: var(--vscode-button-hoverBackground);
                    }
                    .btn-secondary {
                        background: var(--vscode-button-secondaryBackground);
                        color: var(--vscode-button-secondaryForeground);
                    }
                    .btn-secondary:hover {
                        background: var(--vscode-button-secondaryHoverBackground);
                    }
                    .btn-success {
                        background: var(--vscode-gitDecoration-addedResourceForeground);
                        color: var(--vscode-gitDecoration-addedResourceForeground);
                    }
                    .collapsed .type-content {
                        display: none;
                    }
                    .checkbox {
                        margin-right: 8px;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div>
                        <h2>Schema Comparison Results</h2>
                        <p>${data.sourceConnection} → ${data.targetConnection}</p>
                    </div>
                    <div>
                        <button class="btn btn-secondary" onclick="exportComparison()">Export Report</button>
                    </div>
                </div>

                <div class="search-filter">
                    <input type="text" id="filterInput" placeholder="Filter differences..." onkeyup="filterDifferences()">
                </div>

                <div class="stats">
                    <div class="stat-card">
                        <div class="stat-value">${data.totalDifferences}</div>
                        <div class="stat-label">Total Differences</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${data.comparisonMode}</div>
                        <div class="stat-label">Mode</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${data.executionTime}</div>
                        <div class="stat-label">Execution Time</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${new Date(data.createdAt).toLocaleString()}</div>
                        <div class="stat-label">Compared</div>
                    </div>
                </div>

                <div class="comparison-results">
                    ${typeSections}
                </div>

                <div class="actions">
                    <button class="btn btn-primary" onclick="generateMigration()">Generate Migration</button>
                    <button class="btn btn-secondary" onclick="selectAll()">Select All</button>
                    <button class="btn btn-secondary" onclick="selectNone()">Select None</button>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    let selectedDifferences = new Set();

                    function viewDifferenceDetails(difference) {
                        vscode.postMessage({
                            command: 'viewDifferenceDetails',
                            difference: difference
                        });
                    }

                    function toggleDifferenceSelection(differenceId, checkbox) {
                        if (checkbox.checked) {
                            selectedDifferences.add(differenceId);
                        } else {
                            selectedDifferences.delete(differenceId);
                        }
                    }

                    function generateMigration() {
                        const selectedArray = Array.from(selectedDifferences);
                        vscode.postMessage({
                            command: 'generateMigration',
                            selectedDifferences: selectedArray
                        });
                    }

                    function selectAll() {
                        document.querySelectorAll('.difference-checkbox').forEach(checkbox => {
                            checkbox.checked = true;
                            selectedDifferences.add(checkbox.dataset.differenceId);
                        });
                    }

                    function selectNone() {
                        document.querySelectorAll('.difference-checkbox').forEach(checkbox => {
                            checkbox.checked = false;
                            selectedDifferences.delete(checkbox.dataset.differenceId);
                        });
                    }

                    function filterDifferences() {
                        const searchTerm = document.getElementById('filterInput').value.toLowerCase();
                        const differenceItems = document.querySelectorAll('.difference-item');

                        differenceItems.forEach(item => {
                            const title = item.querySelector('.difference-title').textContent.toLowerCase();
                            const type = item.querySelector('.difference-type').textContent.toLowerCase();
                            const meta = item.querySelector('.difference-meta').textContent.toLowerCase();

                            if (title.includes(searchTerm) || type.includes(searchTerm) || meta.includes(searchTerm)) {
                                item.style.display = 'block';
                            } else {
                                item.style.display = 'none';
                            }
                        });
                    }

                    function exportComparison() {
                        vscode.postMessage({
                            command: 'exportComparison'
                        });
                    }

                    // Toggle type sections
                    document.querySelectorAll('.type-header').forEach(header => {
                        header.addEventListener('click', () => {
                            header.parentElement.classList.toggle('collapsed');
                        });
                    });
                </script>
            </body>
            </html>
        `;
    }

    private generateTypeSection(type: string, differences: SchemaDifference[]): string {
        const differenceItems = differences.map(diff => {
            const typeClass = `type-${diff.type.toLowerCase()}`;
            const details = diff.differenceDetails.map(detail => `<li>${detail}</li>`).join('');

            return `
                <div class="difference-item">
                    <div class="difference-header">
                        <div>
                            <span class="difference-title">${diff.objectName}</span>
                            <span class="difference-type ${typeClass}">${diff.type}</span>
                        </div>
                        <input type="checkbox" class="difference-checkbox checkbox"
                               data-difference-id="${diff.objectType}-${diff.objectName}"
                               onchange="toggleDifferenceSelection('${diff.objectType}-${diff.objectName}', this)">
                    </div>
                    <div class="difference-meta">
                        Schema: ${diff.schema} | Type: ${diff.objectType}
                    </div>
                    ${diff.differenceDetails.length > 0 ? `
                    <div class="difference-details">
                        <details>
                            <summary>Details (${diff.differenceDetails.length})</summary>
                            <ul>${details}</ul>
                        </details>
                    </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        return `
            <div class="type-section">
                <div class="type-header">
                    <span>${type} (${differences.length})</span>
                    <span>▼</span>
                </div>
                <div class="type-content">
                    ${differenceItems}
                </div>
            </div>
        `;
    }

    private generateComparisonStats(data: SchemaComparisonData): string {
        const added = data.differences.filter(d => d.type === 'Added').length;
        const removed = data.differences.filter(d => d.type === 'Removed').length;
        const modified = data.differences.filter(d => d.type === 'Modified').length;
        const moved = data.differences.filter(d => d.type === 'Moved').length;

        return `
            <div class="stat-card">
                <div class="stat-value" style="color: var(--vscode-gitDecoration-addedResourceForeground);">${added}</div>
                <div class="stat-label">Added</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color: var(--vscode-gitDecoration-deletedResourceForeground);">${removed}</div>
                <div class="stat-label">Removed</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color: var(--vscode-gitDecoration-modifiedResourceForeground);">${modified}</div>
                <div class="stat-label">Modified</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color: var(--vscode-gitDecoration-renamedResourceForeground);">${moved}</div>
                <div class="stat-label">Moved</div>
            </div>
        `;
    }

    private async handleGenerateMigration(selectedDifferences: string[]): Promise<void> {
        // This would trigger the generateMigration command
        await vscode.commands.executeCommand('postgresql.generateMigration', { selectedDifferences });
    }

    private async handleViewDifferenceDetails(difference: SchemaDifference): Promise<void> {
        // Show detailed difference view
        const panel = vscode.window.createWebviewPanel(
            'differenceDetails',
            `Difference Details: ${difference.objectName}`,
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        const detailsHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Difference Details</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        padding: 20px;
                        background: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                    }
                    .diff-container {
                        background: var(--vscode-textCodeBlock-background);
                        border: 1px solid var(--vscode-textBlockQuote-border);
                        border-radius: 6px;
                        padding: 15px;
                        font-family: 'Courier New', monospace;
                        font-size: 13px;
                        line-height: 1.4;
                    }
                    .source-line {
                        background: var(--vscode-diffEditor-removedTextBackground);
                        color: var(--vscode-diffEditor-removedTextForeground);
                        padding: 2px 4px;
                        margin: 1px 0;
                    }
                    .target-line {
                        background: var(--vscode-diffEditor-insertedTextBackground);
                        color: var(--vscode-diffEditor-insertedTextForeground);
                        padding: 2px 4px;
                        margin: 1px 0;
                    }
                    .unchanged-line {
                        background: var(--vscode-list-inactiveSelectionBackground);
                        padding: 2px 4px;
                        margin: 1px 0;
                    }
                </style>
            </head>
            <body>
                <h2>Difference Details: ${difference.objectName}</h2>
                <p><strong>Type:</strong> ${difference.type} | <strong>Object:</strong> ${difference.objectType}</p>

                ${difference.sourceDefinition || difference.targetDefinition ? `
                <h3>Definition Changes</h3>
                <div class="diff-container">
                    ${difference.sourceDefinition ? `<div class="source-line">- ${difference.sourceDefinition}</div>` : ''}
                    ${difference.targetDefinition ? `<div class="target-line">+ ${difference.targetDefinition}</div>` : ''}
                </div>
                ` : ''}

                ${difference.differenceDetails.length > 0 ? `
                <h3>Change Details</h3>
                <ul>
                    ${difference.differenceDetails.map(detail => `<li>${detail}</li>`).join('')}
                </ul>
                ` : ''}
            </body>
            </html>
        `;

        panel.webview.html = detailsHtml;
    }

    private async handleFilterDifferences(panel: vscode.WebviewPanel, filter: string): Promise<void> {
        // Filter implementation would go here
        Logger.debug('Filtering differences', { filter });
    }

    private async handleExportComparison(comparisonData: SchemaComparisonData): Promise<void> {
        try {
            const content = this.generateComparisonReport(comparisonData);
            const uri = await vscode.window.showSaveDialog({
                filters: {
                    'Text Files': ['txt'],
                    'JSON Files': ['json'],
                    'All Files': ['*']
                },
                defaultUri: vscode.Uri.file(`schema-comparison-${comparisonData.comparisonId}.txt`)
            });

            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
                vscode.window.showInformationMessage('Comparison report exported successfully');
            }
        } catch (error) {
            Logger.error('Failed to export comparison', error as Error);
            vscode.window.showErrorMessage('Failed to export comparison report');
        }
    }

    private generateComparisonReport(data: SchemaComparisonData): string {
        let report = `Schema Comparison Report
Generated: ${new Date(data.createdAt).toLocaleString()}
Comparison ID: ${data.comparisonId}
Source: ${data.sourceConnection}
Target: ${data.targetConnection}
Mode: ${data.comparisonMode}
Execution Time: ${data.executionTime}
Total Differences: ${data.totalDifferences}

Differences by Type:
`;

        const differencesByType = data.differences.reduce((acc, diff) => {
            if (!acc[diff.objectType]) {
                acc[diff.objectType] = { Added: 0, Removed: 0, Modified: 0, Moved: 0 };
            }
            acc[diff.objectType][diff.type]++;
            return acc;
        }, {} as Record<string, Record<string, number>>);

        Object.entries(differencesByType).forEach(([type, counts]) => {
            report += `\n${type}:
`;
            Object.entries(counts).forEach(([changeType, count]) => {
                if (count > 0) {
                    report += `  ${changeType}: ${count}
`;
                }
            });
        });

        report += '\nDetailed Differences:\n';
        data.differences.forEach((diff, index) => {
            report += `\n${index + 1}. ${diff.type} ${diff.objectType}: ${diff.objectName} (${diff.schema})\n`;
            if (diff.differenceDetails.length > 0) {
                diff.differenceDetails.forEach(detail => {
                    report += `   - ${detail}\n`;
                });
            }
        });

        return report;
    }
}