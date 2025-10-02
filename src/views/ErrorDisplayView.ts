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
    retryProgress?: {
        currentAttempt: number;
        maxAttempts: number;
        operationName: string;
        isRetrying: boolean;
    };
    actionableGuidance?: ActionableGuidance[];
}

export interface ActionableGuidance {
    id: string;
    title: string;
    description: string;
    action: string;
    category: 'immediate' | 'configuration' | 'diagnostic' | 'preventive';
    priority: 'high' | 'medium' | 'low';
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
                    case 'executeGuidance':
                        await this.handleExecuteGuidance(message.guidanceId, data);
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
        // Generate suggestions HTML
        const suggestionsHtml = data.suggestions && data.suggestions.length > 0 ?
            `<div class="suggestions">
                <h4>💡 Suggestions</h4>
                <ul>
                    ${data.suggestions.map(suggestion => `<li>${suggestion}</li>`).join('')}
                </ul>
            </div>` : '';

        // Generate retry progress HTML
        const retryProgressHtml = data.retryProgress ?
            `<div class="retry-progress ${data.retryProgress.isRetrying ? 'active' : ''}">
                <h4>🔄 Retry Progress</h4>
                <div class="progress-container">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${Math.round((data.retryProgress.currentAttempt / data.retryProgress.maxAttempts) * 100)}%"></div>
                    </div>
                    <div class="progress-text">
                        Attempt ${data.retryProgress.currentAttempt}/${data.retryProgress.maxAttempts}
                    </div>
                </div>
                <div class="retry-status">
                    ${data.retryProgress.isRetrying ? '⏳ Retrying operation...' : '✅ Retry completed'}
                </div>
            </div>` : '';

        // Generate actionable guidance HTML
        const guidanceHtml = data.actionableGuidance && data.actionableGuidance.length > 0 ?
            `<div class="actionable-guidance">
                <h4>🎯 Actionable Guidance</h4>
                <div class="guidance-cards">
                    ${data.actionableGuidance.map(guidance => `
                        <div class="guidance-card priority-${guidance.priority} category-${guidance.category}">
                            <div class="guidance-header">
                                <span class="guidance-title">${guidance.title}</span>
                                <span class="guidance-priority">${guidance.priority.toUpperCase()}</span>
                            </div>
                            <div class="guidance-description">${guidance.description}</div>
                            <button class="btn btn-action" onclick="executeGuidance('${guidance.id}')">
                                ${guidance.action}
                            </button>
                        </div>
                    `).join('')}
                </div>
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
                    .retry-progress {
                        background: var(--vscode-textBlockQuote-background);
                        border: 1px solid var(--vscode-textBlockQuote-border);
                        border-radius: 6px;
                        padding: 15px;
                        margin-bottom: 20px;
                    }
                    .retry-progress.active {
                        border-color: var(--vscode-progressBar-background);
                    }
                    .progress-container {
                        margin: 10px 0;
                    }
                    .progress-bar {
                        width: 100%;
                        height: 8px;
                        background: var(--vscode-progressBar-background);
                        border-radius: 4px;
                        overflow: hidden;
                        margin-bottom: 5px;
                    }
                    .progress-fill {
                        height: 100%;
                        background: var(--vscode-progressBar-foreground);
                        transition: width 0.3s ease;
                    }
                    .progress-text {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                        text-align: center;
                    }
                    .retry-status {
                        font-size: 12px;
                        font-style: italic;
                        color: var(--vscode-descriptionForeground);
                    }
                    .actionable-guidance {
                        background: var(--vscode-textBlockQuote-background);
                        border: 1px solid var(--vscode-textBlockQuote-border);
                        border-radius: 6px;
                        padding: 15px;
                        margin-bottom: 20px;
                    }
                    .guidance-cards {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                        gap: 15px;
                        margin-top: 10px;
                    }
                    .guidance-card {
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 6px;
                        padding: 12px;
                    }
                    .guidance-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 8px;
                    }
                    .guidance-title {
                        font-weight: bold;
                        color: var(--vscode-textLink-foreground);
                    }
                    .guidance-priority {
                        font-size: 10px;
                        padding: 2px 6px;
                        border-radius: 3px;
                        text-transform: uppercase;
                        font-weight: bold;
                    }
                    .priority-high {
                        background: var(--vscode-inputValidation-errorBackground);
                        color: var(--vscode-inputValidation-errorForeground);
                    }
                    .priority-medium {
                        background: var(--vscode-inputValidation-warningBackground);
                        color: var(--vscode-inputValidation-warningForeground);
                    }
                    .priority-low {
                        background: var(--vscode-inputValidation-infoBackground);
                        color: var(--vscode-inputValidation-infoForeground);
                    }
                    .guidance-description {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                        margin-bottom: 10px;
                        line-height: 1.4;
                    }
                    .btn-action {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        font-size: 11px;
                        padding: 6px 12px;
                    }
                    .category-immediate {
                        border-left: 3px solid var(--vscode-inputValidation-errorBorder);
                    }
                    .category-configuration {
                        border-left: 3px solid var(--vscode-inputValidation-warningBorder);
                    }
                    .category-diagnostic {
                        border-left: 3px solid var(--vscode-inputValidation-infoBorder);
                    }
                    .category-preventive {
                        border-left: 3px solid var(--vscode-textLink-foreground);
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

                ${retryProgressHtml}

                ${suggestionsHtml}

                ${guidanceHtml}

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

                    function executeGuidance(guidanceId) {
                        vscode.postMessage({
                            command: 'executeGuidance',
                            guidanceId: guidanceId,
                            errorData: errorData
                        });
                    }

                    // Function to update retry progress (called from extension)
                    function updateRetryProgress(currentAttempt, maxAttempts, isRetrying) {
                        const progressFill = document.querySelector('.progress-fill');
                        const progressText = document.querySelector('.progress-text');
                        const retryStatus = document.querySelector('.retry-status');

                        if (progressFill) {
                            progressFill.style.width = Math.round((currentAttempt / maxAttempts) * 100) + '%';
                        }
                        if (progressText) {
                            progressText.textContent = 'Attempt ' + currentAttempt + '/' + maxAttempts;
                        }
                        if (retryStatus) {
                            retryStatus.textContent = isRetrying ? '\u23F3 Retrying operation...' : '\u2705 Retry completed';
                        }
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

    private async handleExecuteGuidance(guidanceId: string, data: ErrorDisplayData): Promise<void> {
        try {
            Logger.info('Executing guidance action', { guidanceId, operation: data.operation });

            // Handle different guidance actions based on ID
            switch (guidanceId) {
                case 'check-connection':
                    vscode.commands.executeCommand('postgresql.connection.test');
                    break;
                case 'view-logs':
                    Logger.showOutputChannel();
                    break;
                case 'reset-circuit-breakers':
                    vscode.commands.executeCommand('postgresql.service.resetCircuitBreakers');
                    break;
                case 'validate-configuration':
                    vscode.commands.executeCommand('postgresql.settings.validate');
                    break;
                case 'retry-operation':
                    await this.handleRetryOperation(data);
                    break;
                default:
                    vscode.window.showInformationMessage(`Guidance action "${guidanceId}" not implemented yet`);
            }
        } catch (error) {
            Logger.error('Failed to execute guidance', error as Error);
            vscode.window.showErrorMessage('Failed to execute guidance action');
        }
    }

    /**
     * Update error display with retry progress
     */
    updateRetryProgress(panel: vscode.WebviewPanel, currentAttempt: number, maxAttempts: number, isRetrying: boolean): void {
        panel.webview.postMessage({
            command: 'updateRetryProgress',
            currentAttempt,
            maxAttempts,
            isRetrying
        });
    }

    /**
     * Generate actionable guidance based on error context
     */
    private generateActionableGuidance(errorMessage: string, operation: string): ActionableGuidance[] {
        const guidance: ActionableGuidance[] = [];

        // Connection-related guidance
        if (operation.includes('connection') || operation.includes('Connection')) {
            guidance.push({
                id: 'check-connection',
                title: 'Test Database Connection',
                description: 'Verify that the database connection settings are correct and the server is accessible.',
                action: 'Test Connection',
                category: 'diagnostic',
                priority: 'high'
            });

            if (errorMessage.toLowerCase().includes('authentication') || errorMessage.toLowerCase().includes('password')) {
                guidance.push({
                    id: 'validate-configuration',
                    title: 'Review Connection Settings',
                    description: 'Check your username, password, and database credentials in the connection configuration.',
                    action: 'Open Settings',
                    category: 'configuration',
                    priority: 'high'
                });
            }
        }

        // Schema-related guidance
        if (operation.includes('schema') || operation.includes('Schema')) {
            guidance.push({
                id: 'check-connection',
                title: 'Verify Database Access',
                description: 'Ensure you have read permissions on the database and schema objects.',
                action: 'Test Connection',
                category: 'diagnostic',
                priority: 'high'
            });
        }

        // Migration-related guidance
        if (operation.includes('migration') || operation.includes('Migration')) {
            guidance.push({
                id: 'validate-configuration',
                title: 'Review Migration Script',
                description: 'Check the migration script for syntax errors and ensure all referenced objects exist.',
                action: 'Validate Script',
                category: 'diagnostic',
                priority: 'high'
            });
        }

        // Generic guidance
        guidance.push({
            id: 'view-logs',
            title: 'Check Extension Logs',
            description: 'View detailed logs for additional error information and troubleshooting steps.',
            action: 'Show Logs',
            category: 'diagnostic',
            priority: 'medium'
        });

        if (errorMessage.toLowerCase().includes('circuit') || errorMessage.toLowerCase().includes('service unavailable')) {
            guidance.push({
                id: 'reset-circuit-breakers',
                title: 'Reset Service Circuit Breakers',
                description: 'Reset circuit breakers if services are in an open state due to repeated failures.',
                action: 'Reset Services',
                category: 'immediate',
                priority: 'high'
            });
        }

        return guidance;
    }
}