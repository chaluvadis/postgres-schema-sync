import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';

export interface MigrationPreviewData {
    migrationId: string;
    migrationName: string;
    sourceConnection: string;
    targetConnection: string;
    sqlScript: string;
    rollbackScript: string;
    totalStatements: number;
    estimatedExecutionTime: string;
    riskLevel: 'Low' | 'Medium' | 'High';
    warnings: string[];
    canExecute: boolean;
    canRollback: boolean;
}

export class MigrationPreviewView {
    async showMigrationPreview(migrationData: MigrationPreviewData): Promise<void> {
        try {
            Logger.info('Opening migration preview', { migrationId: migrationData.migrationId });

            const panel = vscode.window.createWebviewPanel(
                'migrationPreview',
                `Migration Preview: ${migrationData.migrationName}`,
                vscode.ViewColumn.One,
                { enableScripts: true, retainContextWhenHidden: true }
            );

            const previewHtml = await this.generateMigrationPreviewHtml(migrationData);
            panel.webview.html = previewHtml;

            // Handle messages from webview
            panel.webview.onDidReceiveMessage(async (message) => {
                switch (message.command) {
                    case 'executeMigration':
                        await this.handleExecuteMigration(message.migrationData);
                        break;
                    case 'editMigration':
                        await this.handleEditMigration(message.migrationData);
                        break;
                    case 'saveMigration':
                        await this.handleSaveMigration(message.migrationData);
                        break;
                    case 'showRollbackScript':
                        await this.handleShowRollbackScript(message.migrationData);
                        break;
                }
            });
        } catch (error) {
            Logger.error('Failed to show migration preview', error as Error);
            vscode.window.showErrorMessage(
                `Failed to open migration preview: ${(error as Error).message}`
            );
        }
    }

    private async generateMigrationPreviewHtml(data: MigrationPreviewData): Promise<string> {
        const riskColor = data.riskLevel === 'High' ? '#ff4444' :
                         data.riskLevel === 'Medium' ? '#ff8800' : '#44aa44';

        const warningsHtml = data.warnings.length > 0 ?
            `<div class="warnings">
                <h4>⚠️ Warnings (${data.warnings.length})</h4>
                <ul>
                    ${data.warnings.map(warning => `<li>${warning}</li>`).join('')}
                </ul>
            </div>` : '';

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
                    .migration-info {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                        gap: 15px;
                        margin-bottom: 25px;
                    }
                    .info-card {
                        background: var(--vscode-textBlockQuote-background);
                        padding: 15px;
                        border-radius: 6px;
                        border: 1px solid var(--vscode-textBlockQuote-border);
                    }
                    .info-label {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                        margin-bottom: 5px;
                        text-transform: uppercase;
                        font-weight: bold;
                    }
                    .info-value {
                        font-size: 14px;
                        color: var(--vscode-textLink-foreground);
                        font-family: 'Courier New', monospace;
                    }
                    .risk-level {
                        display: inline-block;
                        padding: 4px 12px;
                        border-radius: 12px;
                        font-size: 12px;
                        font-weight: bold;
                        color: white;
                        background: ${riskColor};
                    }
                    .sql-preview {
                        background: var(--vscode-textCodeBlock-background);
                        border: 1px solid var(--vscode-textBlockQuote-border);
                        border-radius: 6px;
                        padding: 15px;
                        margin-bottom: 20px;
                    }
                    .sql-preview h4 {
                        margin-top: 0;
                        color: var(--vscode-textLink-foreground);
                    }
                    .sql-content {
                        max-height: 300px;
                        overflow-y: auto;
                        font-family: 'Courier New', monospace;
                        font-size: 13px;
                        line-height: 1.4;
                        background: var(--vscode-editor-background);
                        padding: 10px;
                        border-radius: 4px;
                        border: 1px solid var(--vscode-input-border);
                    }
                    .sql-line {
                        padding: 2px 0;
                        border-left: 3px solid transparent;
                    }
                    .sql-line:nth-child(odd) {
                        background: var(--vscode-list-inactiveSelectionBackground);
                    }
                    .sql-comment { color: var(--vscode-textPreformat-foreground); }
                    .sql-keyword { color: var(--vscode-symbolIcon-keywordForeground); font-weight: bold; }
                    .sql-string { color: var(--vscode-symbolIcon-stringForeground); }
                    .sql-number { color: var(--vscode-symbolIcon-numberForeground); }
                    .warnings {
                        background: var(--vscode-inputValidation-warningBackground);
                        border: 1px solid var(--vscode-inputValidation-warningBorder);
                        border-radius: 6px;
                        padding: 15px;
                        margin-bottom: 20px;
                    }
                    .warnings h4 {
                        margin-top: 0;
                        color: var(--vscode-inputValidation-warningForeground);
                    }
                    .warnings ul {
                        margin: 0;
                        padding-left: 20px;
                    }
                    .warnings li {
                        color: var(--vscode-inputValidation-warningForeground);
                        margin-bottom: 5px;
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
                        color: var(--vscode-editor-background);
                    }
                    .btn:disabled {
                        opacity: 0.5;
                        cursor: not-allowed;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div>
                        <h2>Migration Preview</h2>
                        <p>${data.sourceConnection} → ${data.targetConnection}</p>
                    </div>
                    <div class="risk-level">${data.riskLevel} Risk</div>
                </div>

                <div class="migration-info">
                    <div class="info-card">
                        <div class="info-label">Migration ID</div>
                        <div class="info-value">${data.migrationId}</div>
                    </div>
                    <div class="info-card">
                        <div class="info-label">Statements</div>
                        <div class="info-value">${data.totalStatements}</div>
                    </div>
                    <div class="info-card">
                        <div class="info-label">Est. Duration</div>
                        <div class="info-value">${data.estimatedExecutionTime}</div>
                    </div>
                    <div class="info-card">
                        <div class="info-label">Rollback Available</div>
                        <div class="info-value">${data.canRollback ? 'Yes' : 'No'}</div>
                    </div>
                </div>

                ${warningsHtml}

                <div class="sql-preview">
                    <h4>Migration Script</h4>
                    <div class="sql-content">
                        ${this.formatSqlPreview(data.sqlScript)}
                    </div>
                </div>

                ${data.canRollback ? `
                <div class="sql-preview">
                    <h4>Rollback Script</h4>
                    <div class="sql-content">
                        ${this.formatSqlPreview(data.rollbackScript)}
                    </div>
                </div>
                ` : ''}

                <div class="actions">
                    <button class="btn btn-secondary" onclick="showRollbackScript()">View Rollback</button>
                    <button class="btn btn-secondary" onclick="editMigration()">Edit Migration</button>
                    <button class="btn btn-secondary" onclick="saveMigration()">Save to File</button>
                    <button class="btn btn-success" onclick="executeMigration()"
                            ${!data.canExecute ? 'disabled' : ''}>
                        Execute Migration
                    </button>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    const migrationData = ${JSON.stringify(data)};

                    function executeMigration() {
                        if (migrationData.canExecute) {
                            vscode.postMessage({
                                command: 'executeMigration',
                                migrationData: migrationData
                            });
                        }
                    }

                    function editMigration() {
                        vscode.postMessage({
                            command: 'editMigration',
                            migrationData: migrationData
                        });
                    }

                    function saveMigration() {
                        vscode.postMessage({
                            command: 'saveMigration',
                            migrationData: migrationData
                        });
                    }

                    function showRollbackScript() {
                        vscode.postMessage({
                            command: 'showRollbackScript',
                            migrationData: migrationData
                        });
                    }
                </script>
            </body>
            </html>
        `;
    }

    private formatSqlPreview(sql: string): string {
        const lines = sql.split('\n');
        return lines.map((line, index) => {
            let formattedLine = line;

            // Basic SQL syntax highlighting
            formattedLine = formattedLine.replace(/\b(CREATE|ALTER|DROP|SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|INNER|LEFT|RIGHT|ON|GROUP BY|ORDER BY|HAVING|LIMIT)\b/gi,
                '<span class="sql-keyword">$1</span>');
            formattedLine = formattedLine.replace(/(['"`])(.*?)\1/g, '<span class="sql-string">$1$2$1</span>');
            formattedLine = formattedLine.replace(/\b(\d+)\b/g, '<span class="sql-number">$1</span>');
            formattedLine = formattedLine.replace(/--(.*)/g, '<span class="sql-comment">--$1</span>');

            return `<div class="sql-line">${index + 1}: ${formattedLine}</div>`;
        }).join('');
    }

    private async handleExecuteMigration(migrationData: MigrationPreviewData): Promise<void> {
        // This would trigger the executeMigration command
        await vscode.commands.executeCommand('postgresql.executeMigration', migrationData);
    }

    private async handleEditMigration(migrationData: MigrationPreviewData): Promise<void> {
        // Show migration editing interface
        vscode.window.showInformationMessage('Migration editing interface not yet implemented');
    }

    private async handleSaveMigration(migrationData: MigrationPreviewData): Promise<void> {
        try {
            const uri = await vscode.window.showSaveDialog({
                filters: {
                    'SQL Files': ['sql'],
                    'All Files': ['*']
                },
                defaultUri: vscode.Uri.file(`migration-${migrationData.migrationId}.sql`)
            });

            if (uri) {
                const content = `-- Migration: ${migrationData.migrationName}
-- Generated: ${new Date().toISOString()}
-- Source: ${migrationData.sourceConnection}
-- Target: ${migrationData.targetConnection}
-- Risk Level: ${migrationData.riskLevel}
-- Estimated Duration: ${migrationData.estimatedExecutionTime}

${migrationData.sqlScript}

${migrationData.canRollback ? `
-- Rollback Script
${migrationData.rollbackScript}
` : ''}
`;
                await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
                vscode.window.showInformationMessage('Migration script saved successfully');
            }
        } catch (error) {
            Logger.error('Failed to save migration', error as Error);
            vscode.window.showErrorMessage('Failed to save migration script');
        }
    }

    private async handleShowRollbackScript(migrationData: MigrationPreviewData): Promise<void> {
        const panel = vscode.window.createWebviewPanel(
            'rollbackPreview',
            `Rollback Script: ${migrationData.migrationName}`,
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        const rollbackHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Rollback Script</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        padding: 20px;
                        background: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                    }
                    .sql-content {
                        background: var(--vscode-textCodeBlock-background);
                        border: 1px solid var(--vscode-textBlockQuote-border);
                        border-radius: 6px;
                        padding: 15px;
                        font-family: 'Courier New', monospace;
                        font-size: 13px;
                        line-height: 1.4;
                        max-height: 500px;
                        overflow-y: auto;
                    }
                    .warning {
                        background: var(--vscode-inputValidation-warningBackground);
                        border: 1px solid var(--vscode-inputValidation-warningBorder);
                        border-radius: 6px;
                        padding: 15px;
                        margin-bottom: 20px;
                        color: var(--vscode-inputValidation-warningForeground);
                    }
                </style>
            </head>
            <body>
                <h2>Rollback Script</h2>
                <div class="warning">
                    ⚠️ This script will undo all changes made by the migration. Use with caution!
                </div>
                <h3>Rollback SQL</h3>
                <div class="sql-content">
                    ${this.formatSqlPreview(migrationData.rollbackScript)}
                </div>
            </body>
            </html>
        `;

        panel.webview.html = rollbackHtml;
    }
}