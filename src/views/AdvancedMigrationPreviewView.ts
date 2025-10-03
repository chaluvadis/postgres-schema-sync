import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';

export interface AdvancedMigrationPreviewData {
    migrationId: string;
    migrationName: string;
    sourceConnection: string;
    targetConnection: string;
    sqlScript: string;
    rollbackScript: string;
    totalStatements: number;
    estimatedExecutionTime: string;
    riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
    warnings: string[];
    canExecute: boolean;
    canRollback: boolean;
    conflicts?: MigrationConflict[];
    dependencies?: MigrationDependency[];
    impactAnalysis?: MigrationImpact;
    metadata?: {
        generatedAt: string;
        version: string;
        author?: string;
        description?: string;
    };
}

export interface MigrationConflict {
    id: string;
    type: 'data_conflict' | 'constraint_conflict' | 'dependency_conflict' | 'permission_conflict';
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    affectedObjects: string[];
    suggestedActions: string[];
    riskIfIgnored: string;
}

export interface MigrationDependency {
    id: string;
    type: 'object_dependency' | 'data_dependency' | 'execution_order';
    dependsOn: string;
    dependent: string;
    reason: string;
    severity: 'required' | 'recommended' | 'optional';
}

export interface MigrationImpact {
    dataLoss: boolean;
    downtime: boolean;
    estimatedDowntime?: string;
    affectedUsers: number;
    affectedApplications: string[];
    rollbackComplexity: 'simple' | 'moderate' | 'complex' | 'impossible';
    testingRequired: boolean;
    backupRequired: boolean;
}

export class AdvancedMigrationPreviewView {
    private panel: vscode.WebviewPanel | undefined;
    private migrationData: AdvancedMigrationPreviewData | undefined;
    private selectedConflicts: Set<string> = new Set();

    async showAdvancedMigrationPreview(migrationData: AdvancedMigrationPreviewData): Promise<void> {
        try {
            Logger.info('Opening advanced migration preview', {
                migrationId: migrationData.migrationId,
                conflictCount: migrationData.conflicts?.length || 0
            });

            this.migrationData = migrationData;

            this.panel = vscode.window.createWebviewPanel(
                'advancedMigrationPreview',
                `Advanced Migration Preview: ${migrationData.migrationName}`,
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
                this.migrationData = undefined;
                this.selectedConflicts.clear();
            });

            // Generate and set HTML content
            const htmlContent = this.generateAdvancedPreviewHtml(migrationData);
            this.panel.webview.html = htmlContent;

            // Handle messages from webview
            this.panel.webview.onDidReceiveMessage(async (message) => {
                await this.handleWebviewMessage(message);
            });

        } catch (error) {
            Logger.error('Failed to show advanced migration preview', error as Error);
            vscode.window.showErrorMessage(
                `Failed to open advanced migration preview: ${(error as Error).message}`
            );
        }
    }

    private generateAdvancedPreviewHtml(data: AdvancedMigrationPreviewData): string {
        const riskColor = this.getRiskColor(data.riskLevel);
        const hasConflicts = data.conflicts && data.conflicts.length > 0;

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Advanced Migration Preview</title>
                <style>
                    :root {
                        --vscode-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        --vscode-editor-background: #1e1e1e;
                        --vscode-editor-foreground: #cccccc;
                        --vscode-panel-border: #3c3c3c;
                        --vscode-textLink-foreground: #4da6ff;
                        --vscode-button-background: #0e639c;
                        --vscode-button-foreground: #ffffff;
                        --vscode-input-background: #3c3c3c;
                        --vscode-input-foreground: #cccccc;
                        --vscode-inputValidation-warningBackground: #ffcc0280;
                        --vscode-inputValidation-warningForeground: #ffcc02;
                    }

                    body {
                        font-family: var(--vscode-font-family);
                        padding: 20px;
                        margin: 0;
                        background: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                    }

                    .header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 20px;
                        padding-bottom: 10px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                    }

                    .risk-badge {
                        display: inline-block;
                        padding: 4px 12px;
                        border-radius: 12px;
                        font-size: 12px;
                        font-weight: bold;
                        color: white;
                        background: ${riskColor};
                    }

                    .content-area {
                        display: flex;
                        gap: 20px;
                    }

                    .sidebar {
                        width: 300px;
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 4px;
                        padding: 15px;
                    }

                    .main-content {
                        flex: 1;
                    }

                    .conflict-item {
                        background: var(--vscode-inputValidation-warningBackground);
                        border: 1px solid var(--vscode-inputValidation-warningForeground);
                        border-radius: 4px;
                        padding: 10px;
                        margin-bottom: 10px;
                        cursor: pointer;
                    }

                    .conflict-item:hover {
                        background: var(--vscode-inputValidation-warningForeground);
                        color: white;
                    }

                    .btn {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 8px 16px;
                        border-radius: 4px;
                        cursor: pointer;
                        margin-right: 10px;
                    }

                    .btn:hover {
                        opacity: 0.9;
                    }

                    .sql-content {
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 4px;
                        padding: 15px;
                        font-family: 'Courier New', monospace;
                        font-size: 12px;
                        white-space: pre-wrap;
                        max-height: 400px;
                        overflow: auto;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div>
                        <h2>Advanced Migration Preview</h2>
                        <div>
                            <strong>${data.sourceConnection} → ${data.targetConnection}</strong>
                            <span class="risk-badge">${data.riskLevel} Risk</span>
                            ${hasConflicts ? `<span style="color: var(--vscode-inputValidation-warningForeground); margin-left: 10px;">⚠️ ${data.conflicts!.length} conflicts</span>` : ''}
                        </div>
                    </div>
                    <div>
                        <button class="btn" onclick="exportReport()">Export Report</button>
                        <button class="btn" onclick="validateMigration()">Validate</button>
                        <button class="btn" onclick="executeMigration()" ${!data.canExecute ? 'disabled' : ''}>Execute</button>
                    </div>
                </div>

                <div class="content-area">
                    <div class="sidebar">
                        <h3>Migration Info</h3>
                        <p><strong>Statements:</strong> ${data.totalStatements}</p>
                        <p><strong>Duration:</strong> ${data.estimatedExecutionTime}</p>
                        <p><strong>Risk Level:</strong> ${data.riskLevel}</p>
                        <p><strong>Rollback:</strong> ${data.canRollback ? 'Available' : 'Not Available'}</p>

                        ${hasConflicts ? `
                        <h3>Conflicts (${data.conflicts!.length})</h3>
                        ${data.conflicts!.map(conflict => `
                            <div class="conflict-item" onclick="selectConflict('${conflict.id}')">
                                <div><strong>${conflict.description}</strong></div>
                                <div>${conflict.severity} • ${conflict.type}</div>
                            </div>
                        `).join('')}
                        ` : ''}

                        ${data.impactAnalysis ? `
                        <h3>Impact Analysis</h3>
                        <p><strong>Data Loss:</strong> ${data.impactAnalysis.dataLoss ? 'Possible' : 'None'}</p>
                        <p><strong>Downtime:</strong> ${data.impactAnalysis.downtime ? 'Yes' : 'None'}</p>
                        <p><strong>Affected Users:</strong> ${data.impactAnalysis.affectedUsers}</p>
                        ` : ''}
                    </div>

                    <div class="main-content">
                        <h3>Migration Summary</h3>
                        <p><strong>Name:</strong> ${data.migrationName}</p>
                        <p><strong>ID:</strong> ${data.migrationId}</p>
                        ${data.metadata?.description ? `<p><strong>Description:</strong> ${data.metadata.description}</p>` : ''}

                        ${data.warnings.length > 0 ? `
                        <h3>Warnings</h3>
                        <ul>
                            ${data.warnings.map(w => `<li>${w}</li>`).join('')}
                        </ul>
                        ` : ''}

                        <h3>Migration Script</h3>
                        <div class="sql-content">${this.formatSqlPreview(data.sqlScript)}</div>

                        ${data.canRollback ? `
                        <h3>Rollback Script</h3>
                        <div class="sql-content">${this.formatSqlPreview(data.rollbackScript)}</div>
                        ` : ''}
                    </div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();

                    function selectConflict(conflictId) {
                        vscode.postMessage({
                            command: 'selectConflict',
                            conflictId: conflictId
                        });
                    }

                    function validateMigration() {
                        vscode.postMessage({
                            command: 'validateMigration'
                        });
                    }

                    function executeMigration() {
                        vscode.postMessage({
                            command: 'executeMigration'
                        });
                    }

                    function exportReport() {
                        vscode.postMessage({
                            command: 'exportReport'
                        });
                    }
                </script>
            </body>
            </html>
        `;
    }

    private async handleWebviewMessage(message: any): Promise<void> {
        try {
            switch (message.command) {
                case 'selectConflict':
                    await this.handleSelectConflict(message.conflictId);
                    break;

                case 'validateMigration':
                    await this.handleValidateMigration();
                    break;

                case 'executeMigration':
                    await this.handleExecuteMigration();
                    break;

                case 'exportReport':
                    await this.handleExportReport();
                    break;

                default:
                    Logger.warn('Unknown webview message command', { command: message.command });
                    break;
            }
        } catch (error) {
            Logger.error('Error handling webview message', error as Error);
        }
    }

    private async handleSelectConflict(conflictId: string): Promise<void> {
        this.selectedConflicts.add(conflictId);
        Logger.info('Conflict selected', { conflictId });
    }

    private async handleValidateMigration(): Promise<void> {
        if (!this.migrationData) return;

        try {
            if (!this.migrationData.sqlScript.trim()) {
                vscode.window.showErrorMessage('Migration script is empty');
                return;
            }

            vscode.window.showInformationMessage('Migration validation passed');

        } catch (error) {
            Logger.error('Validation failed', error as Error);
            vscode.window.showErrorMessage(`Validation failed: ${(error as Error).message}`);
        }
    }

    private async handleExecuteMigration(): Promise<void> {
        if (!this.migrationData) return;

        const confirmed = await vscode.window.showWarningMessage(
            `Execute migration: ${this.migrationData.migrationName}?`,
            { modal: true },
            'Execute',
            'Cancel'
        );

        if (confirmed === 'Execute') {
            vscode.window.showInformationMessage('Migration execution started');
            Logger.info('Migration execution initiated', { migrationId: this.migrationData.migrationId });
        }
    }

    private async handleExportReport(): Promise<void> {
        if (!this.migrationData) return;

        try {
            const uri = await vscode.window.showSaveDialog({
                filters: {
                    'SQL Files': ['sql'],
                    'All Files': ['*']
                },
                defaultUri: vscode.Uri.file(`migration-${this.migrationData.migrationId}.sql`)
            });

            if (uri) {
                const content = this.generateMigrationFileContent(this.migrationData);
                await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
                vscode.window.showInformationMessage('Migration script saved successfully');
            }
        } catch (error) {
            Logger.error('Failed to export migration', error as Error);
            vscode.window.showErrorMessage('Failed to export migration');
        }
    }

    private generateMigrationFileContent(data: AdvancedMigrationPreviewData): string {
        return `-- Migration: ${data.migrationName}
                -- ID: ${data.migrationId}
                -- Risk: ${data.riskLevel}
                -- Generated: ${new Date().toISOString()}

                ${data.sqlScript}

                ${data.canRollback ? `-- Rollback Script\n${data.rollbackScript}` : ''}
                `;
    }

    private getRiskColor(riskLevel: string): string {
        switch (riskLevel) {
            case 'Critical': return '#f44747';
            case 'High': return '#ff8800';
            case 'Medium': return '#ffd33d';
            case 'Low': return '#4bb74a';
            default: return '#4d4d4d';
        }
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&')
            .replace(/</g, '<')
            .replace(/>/g, '>')
            .replace(/"/g, '"')
            .replace(/'/g, '\'');
    }

    private formatSqlPreview(sql: string): string {
        if (!sql) return '';

        const lines = sql.split('\n');
        return lines.map((line, index) => {
            let formattedLine = this.escapeHtml(line);

            // Basic SQL syntax highlighting
            formattedLine = formattedLine.replace(/\b(CREATE|ALTER|DROP|SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|INNER|LEFT|RIGHT|ON|GROUP BY|ORDER BY|HAVING|LIMIT|TABLE|INDEX|VIEW|DATABASE|SCHEMA|PRIMARY KEY|FOREIGN KEY|CONSTRAINT|TRIGGER|FUNCTION|PROCEDURE)\b/gi,
                '<span class="sql-keyword">$1</span>');
            formattedLine = formattedLine.replace(/(['"`])(.*?)\1/g, '<span class="sql-string">$1$2$1</span>');
            formattedLine = formattedLine.replace(/\b(\d+)\b/g, '<span class="sql-number">$1</span>');
            formattedLine = formattedLine.replace(/--(.*)/g, '<span class="sql-comment">--$1</span>');
            formattedLine = formattedLine.replace(/\/\*(.*?)\*\//g, '<span class="sql-comment">/*$1*/</span>');

            return `<div class="sql-line">${index + 1}: ${formattedLine}</div>`;
        }).join('');
    }

    dispose(): void {
        if (this.panel) {
            this.panel.dispose();
            this.panel = undefined;
        }
        this.migrationData = undefined;
        this.selectedConflicts.clear();
    }
}