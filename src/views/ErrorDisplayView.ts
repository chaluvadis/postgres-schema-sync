import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';

export interface ErrorDisplayData {
    title: string;
    message: string;
    details?: string;
    suggestions?: string[];
    canRetry?: boolean;
    canReport?: boolean;
    timestamp: Date;
    operation?: string;
    connectionId?: string | undefined;
}

export class ErrorDisplayView {
    async showError(data: ErrorDisplayData): Promise<void> {
        try {
            Logger.info('Displaying error', { title: data.title, operation: data.operation });

            const panel = vscode.window.createWebviewPanel(
                'errorDisplay',
                `Error: ${data.title}`,
                vscode.ViewColumn.One,
                { enableScripts: true }
            );

            const errorHtml = await this.generateErrorHtml(data);
            panel.webview.html = errorHtml;

            // Handle messages from webview
            panel.webview.onDidReceiveMessage(async (message) => {
                switch (message.command) {
                    case 'retryOperation':
                        await this.handleRetryOperation(data);
                        panel.dispose();
                        break;
                    case 'reportIssue':
                        await this.handleReportIssue(data);
                        break;
                    case 'showLogs':
                        await this.handleShowLogs();
                        break;
                    case 'copyError':
                        await this.handleCopyError(data);
                        break;
                }
            });
        } catch (error) {
            Logger.error('Failed to show error display', error as Error);
            // Fallback to simple message box
            vscode.window.showErrorMessage(data.message);
        }
    }

    private async generateErrorHtml(data: ErrorDisplayData): Promise<string> {
        const suggestionsHtml = data.suggestions && data.suggestions.length > 0 ?
            `<div class="suggestions">
                <h4>💡 Suggestions</h4>
                <ul>
                    ${data.suggestions.map(suggestion => `<li>${suggestion}</li>`).join('')}
                </ul>
            </div>` : '';

        const actionsHtml = `
            <div class="actions">
                ${data.canRetry ? '<button class="btn btn-primary" onclick="retryOperation()">Retry Operation</button>' : ''}
                <button class="btn btn-secondary" onclick="showLogs()">Show Logs</button>
                <button class="btn btn-secondary" onclick="copyError()">Copy Error Details</button>
                ${data.canReport ? '<button class="btn btn-secondary" onclick="reportIssue()">Report Issue</button>' : ''}
            </div>
        `;

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Error Details</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        padding: 20px;
                        background: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                    }
                    .error-header {
                        background: var(--vscode-inputValidation-errorBackground);
                        border: 1px solid var(--vscode-inputValidation-errorBorder);
                        border-radius: 6px;
                        padding: 15px;
                        margin-bottom: 20px;
                    }
                    .error-title {
                        color: var(--vscode-inputValidation-errorForeground);
                        font-size: 18px;
                        font-weight: bold;
                        margin: 0 0 10px 0;
                    }
                    .error-message {
                        color: var(--vscode-inputValidation-errorForeground);
                        font-size: 14px;
                        margin: 0;
                    }
                    .error-meta {
                        background: var(--vscode-textBlockQuote-background);
                        border: 1px solid var(--vscode-textBlockQuote-border);
                        border-radius: 6px;
                        padding: 15px;
                        margin-bottom: 20px;
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                    }
                    .error-details {
                        background: var(--vscode-textCodeBlock-background);
                        border: 1px solid var(--vscode-textBlockQuote-border);
                        border-radius: 6px;
                        padding: 15px;
                        margin-bottom: 20px;
                        font-family: 'Courier New', monospace;
                        font-size: 12px;
                        line-height: 1.4;
                        max-height: 200px;
                        overflow-y: auto;
                        white-space: pre-wrap;
                    }
                    .suggestions {
                        background: var(--vscode-textBlockQuote-background);
                        border: 1px solid var(--vscode-textBlockQuote-border);
                        border-radius: 6px;
                        padding: 15px;
                        margin-bottom: 20px;
                    }
                    .suggestions h4 {
                        margin: 0 0 10px 0;
                        color: var(--vscode-textLink-foreground);
                    }
                    .suggestions ul {
                        margin: 0;
                        padding-left: 20px;
                    }
                    .suggestions li {
                        margin-bottom: 5px;
                    }
                    .actions {
                        display: flex;
                        gap: 10px;
                        justify-content: flex-end;
                        margin-top: 20px;
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
                    .status-message {
                        margin-top: 15px;
                        padding: 10px;
                        border-radius: 4px;
                        font-size: 12px;
                        text-align: center;
                    }
                    .status-success {
                        background: var(--vscode-notificationsInfoBackground);
                        color: var(--vscode-notificationsInfoForeground);
                    }
                </style>
            </head>
            <body>
                <div class="error-header">
                    <div class="error-title">❌ ${data.title}</div>
                    <div class="error-message">${data.message}</div>
                </div>

                <div class="error-meta">
                    <div><strong>Timestamp:</strong> ${data.timestamp.toLocaleString()}</div>
                    ${data.operation ? `<div><strong>Operation:</strong> ${data.operation}</div>` : ''}
                    ${data.connectionId ? `<div><strong>Connection:</strong> ${data.connectionId}</div>` : ''}
                </div>

                ${data.details ? `
                <h3>Technical Details</h3>
                <div class="error-details">${data.details}</div>
                ` : ''}

                ${suggestionsHtml}

                ${actionsHtml}

                <div id="statusMessage" class="status-message" style="display: none;"></div>

                <script>
                    const vscode = acquireVsCodeApi();
                    const errorData = ${JSON.stringify(data)};

                    function retryOperation() {
                        vscode.postMessage({
                            command: 'retryOperation',
                            errorData: errorData
                        });
                    }

                    function reportIssue() {
                        vscode.postMessage({
                            command: 'reportIssue',
                            errorData: errorData
                        });
                    }

                    function showLogs() {
                        vscode.postMessage({
                            command: 'showLogs'
                        });
                    }

                    function copyError() {
                        vscode.postMessage({
                            command: 'copyError',
                            errorData: errorData
                        });
                    }
                </script>
            </body>
            </html>
        `;
    }

    private async handleRetryOperation(data: ErrorDisplayData): Promise<void> {
        // This would trigger the original operation that failed
        Logger.info('Retrying operation', { operation: data.operation });

        // For now, just show a message
        vscode.window.showInformationMessage(`Retry functionality for "${data.operation}" not yet implemented`);
    }

    private async handleReportIssue(data: ErrorDisplayData): Promise<void> {
        try {
            const issueBody = `
**Error Report**

**Title:** ${data.title}
**Message:** ${data.message}
**Operation:** ${data.operation || 'Unknown'}
**Timestamp:** ${data.timestamp.toISOString()}
**Connection:** ${data.connectionId || 'None'}

**Details:**
${data.details || 'No additional details'}

**Suggestions:**
${data.suggestions ? data.suggestions.map(s => `- ${s}`).join('\n') : 'None provided'}

**Environment:**
- VSCode Extension: PostgreSQL Schema Compare & Sync
- Platform: ${process.platform}
- Node Version: ${process.version}

**Steps to Reproduce:**
1. [Please describe the steps that led to this error]

**Expected Behavior:**
[Describe what should have happened]

**Actual Behavior:**
[Describe what actually happened]
            `.trim();

            const issueTitle = `Error: ${data.title} - ${data.operation || 'Unknown Operation'}`;

            // Open GitHub issues page with pre-filled content
            const githubUrl = `https://github.com/yourusername/postgresql-schema-sync/issues/new?title=${encodeURIComponent(issueTitle)}&body=${encodeURIComponent(issueBody)}`;
            vscode.env.openExternal(vscode.Uri.parse(githubUrl));

        } catch (error) {
            Logger.error('Failed to report issue', error as Error);
            vscode.window.showErrorMessage('Failed to open issue reporter');
        }
    }

    private async handleShowLogs(): Promise<void> {
        Logger.showOutputChannel();
    }

    private async handleCopyError(data: ErrorDisplayData): Promise<void> {
        try {
            const errorText = `
PostgreSQL Schema Sync - Error Details

Title: ${data.title}
Message: ${data.message}
Operation: ${data.operation || 'Unknown'}
Timestamp: ${data.timestamp.toISOString()}
Connection: ${data.connectionId || 'None'}

Details:
${data.details || 'No additional details'}

Suggestions:
${data.suggestions ? data.suggestions.map(s => `- ${s}`).join('\n') : 'None provided'}
            `.trim();

            await vscode.env.clipboard.writeText(errorText);
            vscode.window.showInformationMessage('Error details copied to clipboard');
        } catch (error) {
            Logger.error('Failed to copy error details', error as Error);
            vscode.window.showErrorMessage('Failed to copy error details');
        }
    }
}