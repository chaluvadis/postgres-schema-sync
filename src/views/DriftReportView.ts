import * as vscode from 'vscode';
import { ReportingService, ComparisonHistoryEntry, SanitizedDifference } from '@/services/ReportingService';
import { Logger } from '@/utils/Logger';

export class DriftReportView {
    private panel: vscode.WebviewPanel | undefined;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly reportingService: ReportingService
    ) { }

    async showReport(focusComparisonId?: string): Promise<void> {
        try {
            if (this.panel) {
                this.panel.reveal(vscode.ViewColumn.One);
            } else {
                this.panel = vscode.window.createWebviewPanel(
                    'postgresqlDriftReport',
                    'Schema Drift Report',
                    vscode.ViewColumn.One,
                    {
                        enableScripts: true,
                        retainContextWhenHidden: true
                    }
                );

                this.panel.onDidDispose(() => {
                    this.panel = undefined;
                });

                this.panel.webview.onDidReceiveMessage(async message => {
                    switch (message.command) {
                        case 'refresh':
                            await this.render(message.focusComparisonId);
                            break;
                        case 'clearHistory':
                            await this.reportingService.clearComparisonHistory();
                            await this.render();
                            vscode.window.showInformationMessage('Schema comparison history cleared');
                            break;
                        case 'requestDetails':
                            await this.handleDetailRequest(message.comparisonId);
                            break;
                        default:
                            Logger.warn('Unknown message received in drift report view', 'DriftReportView.onDidReceiveMessage', message);
                    }
                });
            }

            await this.render(focusComparisonId);
        } catch (error) {
            Logger.error('Failed to render drift report view', error as Error);
            vscode.window.showErrorMessage(`Unable to show schema drift report: ${(error as Error).message}`);
        }
    }

    private async render(focusComparisonId?: string): Promise<void> {
        if (!this.panel) {
            return;
        }

        const history = await this.reportingService.getComparisonHistory();
        const html = this.generateHtml(history, focusComparisonId);
        this.panel.webview.html = html;
    }

    private async handleDetailRequest(comparisonId: string): Promise<void> {
        if (!this.panel) {
            return;
        }

        try {
            const details = await this.reportingService.getComparisonDetails(comparisonId);
            this.panel.webview.postMessage({
                command: 'renderDetails',
                comparisonId,
                details
            });
        } catch (error) {
            Logger.error('Failed to load comparison details', error as Error, 'DriftReportView.handleDetailRequest', { comparisonId });
            vscode.window.showErrorMessage(`Failed to load comparison details: ${(error as Error).message}`);
        }
    }

    private generateHtml(history: ComparisonHistoryEntry[], focusComparisonId?: string): string {
        const nonce = this.getNonce();
        const totalComparisons = history.length;
        const latest = history[0];

        const aggregateSummary = history.reduce(
            (acc, entry) => {
                acc.totalDifferences += entry.differenceCount;
                Object.entries(entry.differenceSummary).forEach(([key, value]) => {
                    acc.byType[key] = (acc.byType[key] || 0) + value;
                });
                return acc;
            },
            { totalDifferences: 0, byType: {} as Record<string, number> }
        );

        const focusedId = focusComparisonId || latest?.id || '';

        const historyRows = history.map(entry => {
            const isFocused = entry.id === focusedId;
            return `
                <tr class="history-row ${isFocused ? 'focused' : ''}" data-comparison-id="${entry.id}">
                    <td>
                        <div class="connection-names">
                            <span class="source">${entry.sourceName}</span>
                            <span class="arrow">→</span>
                            <span class="target">${entry.targetName}</span>
                        </div>
                        <div class="secondary">${new Date(entry.createdAt).toLocaleString()}</div>
                    </td>
                    <td>
                        <span class="badge difference">${entry.differenceCount}</span>
                    </td>
                    <td>
                        <div class="highlights">
                            ${entry.highlights.map(highlight => `<div class="highlight">${highlight}</div>`).join('')}
                        </div>
                    </td>
                    <td>
                        <button class="details-button" data-comparison-id="${entry.id}">
                            View Details
                        </button>
                    </td>
                </tr>
            `;
        }).join('') || '<tr><td colspan="4" class="empty">No schema comparisons recorded yet.</td></tr>';

        const latestSummary = latest ? this.renderLatestSummary(latest) : '<p class="empty">Run a schema comparison to populate this report.</p>';

        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src vscode-resource: https:; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}' 'unsafe-inline';">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Schema Drift Report</title>
                <style nonce="${nonce}">
                    body {
                        font-family: var(--vscode-font-family);
                        background: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                        margin: 0;
                        padding: 0;
                        height: 100vh;
                        display: flex;
                        flex-direction: column;
                    }
                    .header {
                        padding: 16px 24px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }
                    .header .title {
                        font-size: 18px;
                        font-weight: bold;
                    }
                    .header .meta {
                        color: var(--vscode-descriptionForeground);
                        font-size: 12px;
                    }
                    .header button {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 6px 12px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 12px;
                    }
                    .content {
                        padding: 20px 24px;
                        overflow-y: auto;
                        flex: 1;
                        display: flex;
                        flex-direction: column;
                        gap: 24px;
                    }
                    .summary-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                        gap: 16px;
                    }
                    .summary-card {
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 8px;
                        padding: 16px;
                        background: color-mix(in srgb, var(--vscode-editor-background) 95%, var(--vscode-panel-border));
                    }
                    .summary-card h3 {
                        margin: 0 0 8px 0;
                        font-size: 13px;
                        text-transform: uppercase;
                        color: var(--vscode-descriptionForeground);
                    }
                    .summary-card .value {
                        font-size: 24px;
                        font-weight: bold;
                    }
                    .latest-report {
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 8px;
                        padding: 16px;
                        background: color-mix(in srgb, var(--vscode-editor-background) 90%, var(--vscode-panel-border));
                    }
                    .latest-report h2 {
                        margin-top: 0;
                        font-size: 16px;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 8px;
                        overflow: hidden;
                    }
                    thead {
                        background: color-mix(in srgb, var(--vscode-editor-background) 80%, var(--vscode-panel-border));
                        text-transform: uppercase;
                        font-size: 11px;
                        letter-spacing: 0.05em;
                    }
                    th, td {
                        padding: 12px 16px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        vertical-align: top;
                    }
                    .history-row.focused {
                        background: color-mix(in srgb, var(--vscode-editor-background) 70%, var(--vscode-button-background) 10%);
                    }
                    .connection-names {
                        font-weight: 600;
                    }
                    .connection-names .source {
                        color: var(--vscode-gitDecoration-addedResourceForeground);
                    }
                    .connection-names .target {
                        color: var(--vscode-gitDecoration-deletedResourceForeground);
                    }
                    .connection-names .arrow {
                        margin: 0 4px;
                        color: var(--vscode-descriptionForeground);
                    }
                    .secondary {
                        color: var(--vscode-descriptionForeground);
                        font-size: 11px;
                        margin-top: 4px;
                    }
                    .badge.difference {
                        display: inline-block;
                        padding: 4px 10px;
                        border-radius: 999px;
                        background: var(--vscode-gitDecoration-modifiedResourceForeground);
                        color: var(--vscode-editor-background);
                        font-weight: bold;
                        font-size: 12px;
                    }
                    .highlights {
                        display: flex;
                        flex-direction: column;
                        gap: 4px;
                    }
                    .highlight {
                        background: color-mix(in srgb, var(--vscode-editor-background) 70%, var(--vscode-button-background) 15%);
                        border-left: 3px solid var(--vscode-button-background);
                        padding: 6px 8px;
                        border-radius: 4px;
                        font-size: 12px;
                    }
                    .details-button {
                        background: transparent;
                        color: var(--vscode-textLink-foreground);
                        border: 1px solid var(--vscode-textLink-foreground);
                        border-radius: 4px;
                        padding: 4px 10px;
                        cursor: pointer;
                        font-size: 12px;
                    }
                    .details-panel {
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 8px;
                        padding: 16px;
                        margin-top: 16px;
                        background: color-mix(in srgb, var(--vscode-editor-background) 85%, var(--vscode-panel-border));
                    }
                    .difference-item {
                        border-bottom: 1px solid var(--vscode-panel-border);
                        padding: 8px 0;
                    }
                    .difference-item:last-child {
                        border-bottom: none;
                    }
                    .difference-meta {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                    }
                    .empty {
                        text-align: center;
                        padding: 24px;
                        color: var(--vscode-descriptionForeground);
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div>
                        <div class="title">Schema Drift Report</div>
                        <div class="meta">${totalComparisons} comparison${totalComparisons === 1 ? '' : 's'} tracked · ${aggregateSummary.totalDifferences} differences recorded</div>
                    </div>
                    <div>
                        <button id="refresh">Refresh</button>
                        <button id="clear">Clear History</button>
                    </div>
                </div>
                <div class="content">
                    <div class="summary-grid">
                        <div class="summary-card">
                            <h3>Total Comparisons</h3>
                            <div class="value">${totalComparisons}</div>
                        </div>
                        <div class="summary-card">
                            <h3>Total Differences</h3>
                            <div class="value">${aggregateSummary.totalDifferences}</div>
                        </div>
                        <div class="summary-card">
                            <h3>Added Objects</h3>
                            <div class="value">${aggregateSummary.byType['added'] || 0}</div>
                        </div>
                        <div class="summary-card">
                            <h3>Removed Objects</h3>
                            <div class="value">${aggregateSummary.byType['removed'] || 0}</div>
                        </div>
                        <div class="summary-card">
                            <h3>Modified Objects</h3>
                            <div class="value">${aggregateSummary.byType['modified'] || 0}</div>
                        </div>
                    </div>

                    <div class="latest-report">
                        <h2>Latest Comparison</h2>
                        ${latestSummary}
                    </div>

                    <div>
                        <h2>Comparison History</h2>
                        <table>
                            <thead>
                                <tr>
                                    <th>Environment Pair</th>
                                    <th>Differences</th>
                                    <th>Highlights</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                ${historyRows}
                            </tbody>
                        </table>
                        <div id="details" class="details-panel" hidden>
                            <h3 id="details-title">Comparison Details</h3>
                            <div id="details-body"></div>
                        </div>
                    </div>
                </div>
                <script nonce="${nonce}">
                    const vscode = acquireVsCodeApi();

                    const handleSelection = (comparisonId) => {
                        vscode.postMessage({ command: 'requestDetails', comparisonId });
                        const rows = document.querySelectorAll('.history-row');
                        rows.forEach(row => {
                            row.classList.toggle('focused', row.dataset.comparisonId === comparisonId);
                        });
                    };

                    document.getElementById('refresh')?.addEventListener('click', () => {
                        vscode.postMessage({ command: 'refresh', focusComparisonId: '${focusedId}' });
                    });

                    document.getElementById('clear')?.addEventListener('click', () => {
                        vscode.postMessage({ command: 'clearHistory' });
                    });

                    document.querySelectorAll('.details-button').forEach(button => {
                        button.addEventListener('click', () => {
                            handleSelection(button.dataset.comparisonId);
                        });
                    });

                    window.addEventListener('message', event => {
                        const message = event.data;
                        if (message.command === 'renderDetails') {
                            const container = document.getElementById('details');
                            const body = document.getElementById('details-body');
                            const title = document.getElementById('details-title');

                            title.textContent = 'Comparison Details';

                            if (!message.details || message.details.length === 0) {
                                body.innerHTML = '<p class="empty">No detailed differences stored for this comparison. Run a new comparison to capture fresh results.</p>';
                            } else {
                                body.innerHTML = message.details.map(diff => {
                                    const detailLines = (diff.differenceDetails || [])
                                        .map(detail => '<div>' + detail + '</div>')
                                        .join('');

                                    return '<div class="difference-item">'
                                        + '<div><strong>' + diff.type + '</strong> · ' + diff.objectType + '</div>'
                                        + '<div class="difference-meta">' + diff.schema + '.' + diff.objectName + '</div>'
                                        + detailLines
                                        + '</div>';
                                }).join('');
                            }

                            container.hidden = false;
                        }
                    });

                    const defaultFocus = '${focusedId}';
                    if (defaultFocus) {
                        handleSelection(defaultFocus);
                    }
                </script>
            </body>
            </html>
        `;
    }

    private renderLatestSummary(entry: ComparisonHistoryEntry): string {
        return `
            <div class="latest-summary">
                <div class="connection-names">
                    <span class="source">${entry.sourceName}</span>
                    <span class="arrow">→</span>
                    <span class="target">${entry.targetName}</span>
                </div>
                <div class="secondary">Run ${new Date(entry.createdAt).toLocaleString()} · ${entry.differenceCount} differences</div>
                <div class="highlights" style="margin-top: 12px;">
                    ${entry.highlights.map(highlight => `<div class="highlight">${highlight}</div>`).join('')}
                </div>
            </div>
        `;
    }

    private getNonce(): string {
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        return Array.from({ length: 16 }, () => possible.charAt(Math.floor(Math.random() * possible.length))).join('');
    }
}
