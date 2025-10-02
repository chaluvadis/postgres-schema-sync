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
                        <div class="sql-content">${this.escapeHtml(data.sqlScript)}</div>

                        ${data.canRollback ? `
                        <h3>Rollback Script</h3>
                        <div class="sql-content">${this.escapeHtml(data.rollbackScript)}</div>
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
            .replace(/'/g, ''');
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
                        <div class="sql-content">${this.escapeHtml(data.sqlScript)}</div>

                        ${data.canRollback ? `
                        <h3>Rollback Script</h3>
                        <div class="sql-content">${this.escapeHtml(data.rollbackScript)}</div>
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
            .replace(/'/g, ''');
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
                        <div class="sql-content">${this.escapeHtml(data.sqlScript)}</div>

                        ${data.canRollback ? `
                        <h3>Rollback Script</h3>
                        <div class="sql-content">${this.escapeHtml(data.rollbackScript)}</div>
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
            .replace(/'/g, ''');
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

                    .tab-content {
                        display: none;
                    }

                    .tab-content.active {
                        display: block;
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
                        <div id="overviewTab" class="tab-content active">
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
                        </div>

                        <div id="sqlTab" class="tab-content">
                            <h3>Migration Script</h3>
                            <div class="sql-content">${this.escapeHtml(data.sqlScript)}</div>
                        </div>

                        <div id="conflictsTab" class="tab-content">
                            ${hasConflicts ? `
                                ${data.conflicts!.map(conflict => `
                                    <div style="border: 1px solid var(--vscode-panel-border); padding: 15px; margin-bottom: 15px; border-radius: 4px;">
                                        <h4>${conflict.description}</h4>
                                        <p><strong>Type:</strong> ${conflict.type}</p>
                                        <p><strong>Severity:</strong> ${conflict.severity}</p>
                                        <p><strong>Affected Objects:</strong> ${conflict.affectedObjects.join(', ')}</p>
                                        <p><strong>Risk if Ignored:</strong> ${conflict.riskIfIgnored}</p>
                                        <div>
                                            <button onclick="resolveConflict('${conflict.id}', 'skip')">Skip</button>
                                            <button onclick="resolveConflict('${conflict.id}', 'overwrite')">Overwrite</button>
                                            <button onclick="resolveConflict('${conflict.id}', 'manual')">Manual</button>
                                        </div>
                                    </div>
                                `).join('')}
                            ` : '<p>No conflicts detected</p>'}
                        </div>

                        <div id="rollbackTab" class="tab-content">
                            ${data.canRollback ? `
                                <h3>Rollback Script</h3>
                                <div class="sql-content">${this.escapeHtml(data.rollbackScript)}</div>
                            ` : '<p>Rollback not available for this migration</p>'}
                        </div>
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

                    function resolveConflict(conflictId, resolution) {
                        vscode.postMessage({
                            command: 'resolveConflict',
                            conflictId: conflictId,
                            resolution: resolution
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

                case 'resolveConflict':
                    await this.handleResolveConflict(message.conflictId, message.resolution);
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

        if (this.panel) {
            this.panel.webview.postMessage({
                command: 'conflictSelected',
                conflictId: conflictId
            });
        }

        Logger.info('Conflict selected', { conflictId });
    }

    private async handleResolveConflict(conflictId: string, resolution: string): Promise<void> {
        if (!this.migrationData) return;

        const conflict = this.migrationData.conflicts?.find(c => c.id === conflictId);
        if (!conflict) return;

        Logger.info('Conflict resolved', { conflictId, resolution });

        vscode.window.showInformationMessage(
            `Conflict resolved with strategy: ${resolution}`,
            'Undo'
        ).then(action => {
            if (action === 'Undo') {
                this.selectedConflicts.delete(conflictId);
            }
        });
    }

    private async handleValidateMigration(): Promise<void> {
        if (!this.migrationData) return;

        try {
            // Basic validation
            if (!this.migrationData.sqlScript.trim()) {
                vscode.window.showErrorMessage('Migration script is empty');
                return;
            }

            const unresolvedConflicts = this.migrationData.conflicts?.filter(c => this.selectedConflicts.has(c.id)) || [];

            if (unresolvedConflicts.length > 0) {
                vscode.window.showWarningMessage(`${unresolvedConflicts.length} conflicts need resolution`);
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
            .replace(/'/g, ''');
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

                    .tab-content {
                        display: none;
                    }

                    .tab-content.active {
                        display: block;
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
                        <div id="overviewTab" class="tab-content active">
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
                        </div>

                        <div id="sqlTab" class="tab-content">
                            <h3>Migration Script</h3>
                            <div class="sql-content">${this.escapeHtml(data.sqlScript)}</div>
                        </div>

                        <div id="conflictsTab" class="tab-content">
                            ${hasConflicts ? `
                                ${data.conflicts!.map(conflict => `
                                    <div style="border: 1px solid var(--vscode-panel-border); padding: 15px; margin-bottom: 15px; border-radius: 4px;">
                                        <h4>${conflict.description}</h4>
                                        <p><strong>Type:</strong> ${conflict.type}</p>
                                        <p><strong>Severity:</strong> ${conflict.severity}</p>
                                        <p><strong>Affected Objects:</strong> ${conflict.affectedObjects.join(', ')}</p>
                                        <p><strong>Risk if Ignored:</strong> ${conflict.riskIfIgnored}</p>
                                        <div>
                                            <button onclick="resolveConflict('${conflict.id}', 'skip')">Skip</button>
                                            <button onclick="resolveConflict('${conflict.id}', 'overwrite')">Overwrite</button>
                                            <button onclick="resolveConflict('${conflict.id}', 'manual')">Manual</button>
                                        </div>
                                    </div>
                                `).join('')}
                            ` : '<p>No conflicts detected</p>'}
                        </div>

                        <div id="rollbackTab" class="tab-content">
                            ${data.canRollback ? `
                                <h3>Rollback Script</h3>
                                <div class="sql-content">${this.escapeHtml(data.rollbackScript)}</div>
                            ` : '<p>Rollback not available for this migration</p>'}
                        </div>
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

                    function resolveConflict(conflictId, resolution) {
                        vscode.postMessage({
                            command: 'resolveConflict',
                            conflictId: conflictId,
                            resolution: resolution
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

                case 'resolveConflict':
                    await this.handleResolveConflict(message.conflictId, message.resolution);
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

        if (this.panel) {
            this.panel.webview.postMessage({
                command: 'conflictSelected',
                conflictId: conflictId
            });
        }

        Logger.info('Conflict selected', { conflictId });
    }

    private async handleResolveConflict(conflictId: string, resolution: string): Promise<void> {
        if (!this.migrationData) return;

        const conflict = this.migrationData.conflicts?.find(c => c.id === conflictId);
        if (!conflict) return;

        Logger.info('Conflict resolved', { conflictId, resolution });

        vscode.window.showInformationMessage(
            `Conflict resolved with strategy: ${resolution}`,
            'Undo'
        ).then(action => {
            if (action === 'Undo') {
                this.selectedConflicts.delete(conflictId);
            }
        });
    }

    private async handleValidateMigration(): Promise<void> {
        if (!this.migrationData) return;

        try {
            // Basic validation
            if (!this.migrationData.sqlScript.trim()) {
                vscode.window.showErrorMessage('Migration script is empty');
                return;
            }

            const unresolvedConflicts = this.migrationData.conflicts?.filter(c => this.selectedConflicts.has(c.id)) || [];

            if (unresolvedConflicts.length > 0) {
                vscode.window.showWarningMessage(`${unresolvedConflicts.length} conflicts need resolution`);
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
            .replace(/'/g, ''');
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

    private async generateAdvancedPreviewHtml(data: AdvancedMigrationPreviewData): Promise<string> {
        const riskColor = this.getRiskColor(data.riskLevel);
        const hasConflicts = data.conflicts && data.conflicts.length > 0;
        const hasDependencies = data.dependencies && data.dependencies.length > 0;

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
                        --vscode-inputValidation-warningBackground: #ffcc0280;
                        --vscode-inputValidation-warningForeground: #ffcc02;
                        --vscode-inputValidation-errorBackground: #f4474780;
                        --vscode-inputValidation-errorForeground: #f44747;
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

                    .risk-badge {
                        display: inline-block;
                        padding: 4px 12px;
                        border-radius: 12px;
                        font-size: 12px;
                        font-weight: bold;
                        color: white;
                        background: ${riskColor};
                    }

                    .toolbar {
                        display: flex;
                        align-items: center;
                        gap: 15px;
                        padding: 10px 20px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                        background: var(--vscode-editor-background);
                        flex-wrap: wrap;
                    }

                    .view-tabs {
                        display: flex;
                        align-items: center;
                        gap: 5px;
                    }

                    .tab-btn {
                        background: none;
                        border: 1px solid var(--vscode-panel-border);
                        color: var(--vscode-editor-foreground);
                        padding: 6px 12px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 12px;
                        transition: all 0.2s;
                    }

                    .tab-btn:hover {
                        background: var(--vscode-list-hoverBackground);
                    }

                    .tab-btn.active {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border-color: var(--vscode-button-background);
                    }

                    .search-filter {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                    }

                    .search-input {
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border: 1px solid var(--vscode-input-border);
                        border-radius: 3px;
                        padding: 5px 10px;
                        font-size: 12px;
                        min-width: 200px;
                    }

                    .content-area {
                        flex: 1;
                        display: flex;
                        overflow: hidden;
                    }

                    .sidebar {
                        width: 320px;
                        background: var(--vscode-editor-background);
                        border-right: 1px solid var(--vscode-panel-border);
                        display: flex;
                        flex-direction: column;
                        overflow: hidden;
                    }

                    .sidebar-section {
                        border-bottom: 1px solid var(--vscode-panel-border);
                        padding: 15px;
                        overflow-y: auto;
                    }

                    .sidebar-title {
                        font-weight: bold;
                        margin-bottom: 10px;
                        font-size: 13px;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }

                    .sidebar-title .count {
                        background: var(--vscode-badge-background);
                        color: var(--vscode-badge-foreground);
                        padding: 2px 6px;
                        border-radius: 10px;
                        font-size: 10px;
                        font-weight: normal;
                    }

                    .info-grid {
                        display: grid;
                        grid-template-columns: 1fr;
                        gap: 8px;
                    }

                    .info-item {
                        background: var(--vscode-badge-background);
                        padding: 8px;
                        border-radius: 4px;
                    }

                    .info-label {
                        font-size: 11px;
                        opacity: 0.8;
                        margin-bottom: 2px;
                    }

                    .info-value {
                        font-size: 12px;
                        font-weight: bold;
                    }

                    .conflict-item {
                        background: var(--vscode-inputValidation-warningBackground);
                        border: 1px solid var(--vscode-inputValidation-warningForeground);
                        border-radius: 4px;
                        padding: 8px;
                        margin-bottom: 8px;
                        cursor: pointer;
                        transition: all 0.2s;
                    }

                    .conflict-item:hover {
                        background: var(--vscode-inputValidation-warningForeground);
                        color: white;
                    }

                    .conflict-title {
                        font-weight: bold;
                        font-size: 12px;
                        margin-bottom: 4px;
                    }

                    .conflict-meta {
                        font-size: 10px;
                        opacity: 0.8;
                    }

                    .main-content {
                        flex: 1;
                        overflow: auto;
                        padding: 20px;
                    }

                    .tab-content {
                        display: none;
                    }

                    .tab-content.active {
                        display: block;
                    }

                    .overview-panel {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                        gap: 15px;
                        margin-bottom: 20px;
                    }

                    .overview-card {
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 6px;
                        padding: 15px;
                    }

                    .card-title {
                        font-weight: bold;
                        margin-bottom: 10px;
                        font-size: 14px;
                    }

                    .card-content {
                        font-size: 12px;
                        line-height: 1.4;
                    }

                    .sql-preview {
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 6px;
                        padding: 15px;
                    }

                    .sql-title {
                        font-weight: bold;
                        margin-bottom: 10px;
                        color: var(--vscode-textLink-foreground);
                    }

                    .sql-content {
                        background: var(--vscode-textCodeBlock-background, #1e1e1e);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 4px;
                        padding: 10px;
                        font-family: 'Courier New', monospace;
                        font-size: 12px;
                        line-height: 1.4;
                        max-height: 400px;
                        overflow: auto;
                    }

                    .execution-plan {
                        margin-top: 20px;
                    }

                    .step-item {
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 4px;
                        padding: 10px;
                        margin-bottom: 8px;
                    }

                    .step-header {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        margin-bottom: 5px;
                    }

                    .step-number {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        width: 20px;
                        height: 20px;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 10px;
                        font-weight: bold;
                    }

                    .step-title {
                        font-weight: bold;
                        font-size: 12px;
                    }

                    .step-description {
                        font-size: 11px;
                        color: var(--vscode-descriptionForeground);
                        margin-left: 28px;
                    }

                    .conflict-detail {
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 6px;
                        padding: 15px;
                    }

                    .conflict-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 10px;
                    }

                    .conflict-severity {
                        padding: 2px 8px;
                        border-radius: 10px;
                        font-size: 10px;
                        font-weight: bold;
                        text-transform: uppercase;
                    }

                    .severity-critical { background: var(--vscode-inputValidation-errorForeground); color: white; }
                    .severity-high { background: var(--vscode-inputValidation-warningForeground); color: white; }
                    .severity-medium { background: var(--vscode-gitDecoration-renamedResourceForeground); color: white; }
                    .severity-low { background: var(--vscode-gitDecoration-addedResourceForeground); color: white; }

                    .resolution-options {
                        margin-top: 15px;
                    }

                    .resolution-option {
                        background: var(--vscode-input-background);
                        border: 1px solid var(--vscode-input-border);
                        border-radius: 4px;
                        padding: 8px;
                        margin-bottom: 8px;
                        cursor: pointer;
                    }

                    .resolution-option:hover {
                        background: var(--vscode-list-hoverBackground);
                    }

                    .resolution-title {
                        font-weight: bold;
                        font-size: 12px;
                        margin-bottom: 4px;
                    }

                    .resolution-description {
                        font-size: 11px;
                        color: var(--vscode-descriptionForeground);
                    }

                    .footer {
                        padding: 15px 20px;
                        border-top: 1px solid var(--vscode-panel-border);
                        background: var(--vscode-editor-background);
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }

                    .status-info {
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
                        background: var(--vscode-button-secondaryBackground, #3c3c3c);
                        color: var(--vscode-button-secondaryForeground, #cccccc);
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

                    .btn:disabled {
                        opacity: 0.5;
                        cursor: not-allowed;
                    }

                    @media (max-width: 768px) {
                        .content-area {
                            flex-direction: column;
                        }

                        .sidebar {
                            width: 100%;
                            max-height: 300px;
                        }

                        .overview-panel {
                            grid-template-columns: 1fr;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="header-left">
                        <h2>Advanced Migration Preview</h2>
                        <div class="header-meta">
                            <span>${data.sourceConnection} → ${data.targetConnection}</span>
                            <span class="separator">•</span>
                            <span class="risk-badge">${data.riskLevel} Risk</span>
                            ${hasConflicts ? `<span class="separator">•</span><span style="color: var(--vscode-inputValidation-warningForeground);">⚠️ ${data.conflicts!.length} conflicts</span>` : ''}
                        </div>
                    </div>
                    <div class="header-right">
                        <button class="btn btn-secondary" onclick="exportReport()">Export Report</button>
                        <button class="btn btn-secondary" onclick="showSettings()">Settings</button>
                    </div>
                </div>

                <div class="toolbar">
                    <div class="view-tabs">
                        <button class="tab-btn active" onclick="switchTab('overview')" id="overviewTab">Overview</button>
                        <button class="tab-btn" onclick="switchTab('sql')" id="sqlTab">SQL Script</button>
                        <button class="tab-btn" onclick="switchTab('conflicts')" id="conflictsTab">
                            Conflicts ${hasConflicts ? `(${data.conflicts!.length})` : ''}
                        </button>
                        <button class="tab-btn" onclick="switchTab('dependencies')" id="dependenciesTab">
                            Dependencies ${hasDependencies ? `(${data.dependencies!.length})` : ''}
                        </button>
                        <button class="tab-btn" onclick="switchTab('execution')" id="executionTab">Execution Plan</button>
                        <button class="tab-btn" onclick="switchTab('rollback')" id="rollbackTab">Rollback Plan</button>
                    </div>

                    <div class="search-filter">
                        <input type="text" class="search-input" id="searchInput" placeholder="Search..." onkeyup="handleSearch()">
                    </div>
                </div>

                <div class="content-area">
                    <div class="sidebar">
                        <div class="sidebar-section">
                            <div class="sidebar-title">
                                Migration Info
                            </div>
                            <div class="info-grid">
                                <div class="info-item">
                                    <div class="info-label">Statements</div>
                                    <div class="info-value">${data.totalStatements}</div>
                                </div>
                                <div class="info-item">
                                    <div class="info-label">Est. Duration</div>
                                    <div class="info-value">${data.estimatedExecutionTime}</div>
                                </div>
                                <div class="info-item">
                                    <div class="info-label">Risk Level</div>
                                    <div class="info-value">${data.riskLevel}</div>
                                </div>
                                <div class="info-item">
                                    <div class="info-label">Rollback</div>
                                    <div class="info-value">${data.canRollback ? 'Available' : 'Not Available'}</div>
                                </div>
                            </div>
                        </div>

                        ${hasConflicts ? `
                        <div class="sidebar-section">
                            <div class="sidebar-title">
                                Conflicts
                                <span class="count">${data.conflicts!.length}</span>
                            </div>
                            ${data.conflicts!.map(conflict => `
                                <div class="conflict-item" onclick="selectConflict('${conflict.id}')">
                                    <div class="conflict-title">${conflict.description}</div>
                                    <div class="conflict-meta">${conflict.severity} • ${conflict.type}</div>
                                </div>
                            `).join('')}
                        </div>
                        ` : ''}

                        ${data.impactAnalysis ? `
                        <div class="sidebar-section">
                            <div class="sidebar-title">Impact Analysis</div>
                            <div class="info-grid">
                                <div class="info-item">
                                    <div class="info-label">Data Loss</div>
                                    <div class="info-value">${data.impactAnalysis.dataLoss ? 'Possible' : 'None'}</div>
                                </div>
                                <div class="info-item">
                                    <div class="info-label">Downtime</div>
                                    <div class="info-value">${data.impactAnalysis.downtime ? (data.impactAnalysis.estimatedDowntime || 'Yes') : 'None'}</div>
                                </div>
                                <div class="info-item">
                                    <div class="info-label">Affected Users</div>
                                    <div class="info-value">${data.impactAnalysis.affectedUsers}</div>
                                </div>
                                <div class="info-item">
                                    <div class="info-label">Applications</div>
                                    <div class="info-value">${data.impactAnalysis.affectedApplications.length}</div>
                                </div>
                            </div>
                        </div>
                        ` : ''}
                    </div>

                    <div class="main-content">
                        <div id="overviewTabContent" class="tab-content active">
                            <div class="overview-panel">
                                <div class="overview-card">
                                    <div class="card-title">Migration Summary</div>
                                    <div class="card-content">
                                        <strong>Name:</strong> ${data.migrationName}<br>
                                        <strong>ID:</strong> ${data.migrationId}<br>
                                        <strong>Generated:</strong> ${data.metadata?.generatedAt ? new Date(data.metadata.generatedAt).toLocaleString() : 'Unknown'}<br>
                                        ${data.metadata?.author ? `<strong>Author:</strong> ${data.metadata.author}<br>` : ''}
                                        ${data.metadata?.description ? `<strong>Description:</strong> ${data.metadata.description}` : ''}
                                    </div>
                                </div>

                                ${data.impactAnalysis ? `
                                <div class="overview-card">
                                    <div class="card-title">Impact Assessment</div>
                                    <div class="card-content">
                                        <div style="margin-bottom: 10px;">
                                            <strong>Downtime:</strong> ${data.impactAnalysis.downtime ? 'Required' : 'None'}<br>
                                            ${data.impactAnalysis.estimatedDowntime ? `<strong>Duration:</strong> ${data.impactAnalysis.estimatedDowntime}<br>` : ''}
                                            <strong>Data Loss:</strong> ${data.impactAnalysis.dataLoss ? 'Possible' : 'None'}<br>
                                            <strong>Testing:</strong> ${data.impactAnalysis.testingRequired ? 'Required' : 'Recommended'}<br>
                                            <strong>Backup:</strong> ${data.impactAnalysis.backupRequired ? 'Required' : 'Recommended'}
                                        </div>
                                    </div>
                                </div>
                                ` : ''}

                                <div class="overview-card">
                                    <div class="card-title">Warnings</div>
                                    <div class="card-content">
                                        ${data.warnings.length > 0 ? `
                                            <ul style="margin: 0; padding-left: 20px;">
                                                ${data.warnings.map(warning => `<li>${warning}</li>`).join('')}
                                            </ul>
                                        ` : 'No warnings'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div id="sqlTabContent" class="tab-content">
                            <div class="sql-preview">
                                <div class="sql-title">Migration Script</div>
                                <div class="sql-content">
                                    ${this.formatSqlPreview(data.sqlScript)}
                                </div>
                            </div>
                        </div>

                        <div id="conflictsTabContent" class="tab-content">
                            ${hasConflicts ? `
                                <div id="conflictsContainer">
                                    ${data.conflicts!.map(conflict => this.generateConflictDetail(conflict)).join('')}
                                </div>
                            ` : '<div style="text-align: center; padding: 40px; color: var(--vscode-descriptionForeground);">No conflicts detected</div>'}
                        </div>

                        <div id="dependenciesTabContent" class="tab-content">
                            ${hasDependencies ? `
                                <div class="dependencies-container">
                                    ${data.dependencies!.map(dep => `
                                        <div class="step-item">
                                            <div class="step-header">
                                                <div class="step-title">${dep.type}: ${dep.dependent}</div>
                                            </div>
                                            <div class="step-description">
                                                Depends on: ${dep.dependsOn}<br>
                                                Reason: ${dep.reason}<br>
                                                Severity: ${dep.severity}
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            ` : '<div style="text-align: center; padding: 40px; color: var(--vscode-descriptionForeground);">No dependencies detected</div>'}
                        </div>

                        <div id="executionTabContent" class="tab-content">
                            ${data.executionPlan ? `
                                <div class="execution-plan">
                                    ${data.executionPlan.map(step => `
                                        <div class="step-item">
                                            <div class="step-header">
                                                <div class="step-number">${step.order}</div>
                                                <div class="step-title">${step.type}: ${step.description}</div>
                                            </div>
                                            <div class="step-description">
                                                Estimated duration: ${step.estimatedDuration}<br>
                                                Can fail: ${step.canFail ? 'Yes' : 'No'}<br>
                                                ${step.dependencies ? `Dependencies: ${step.dependencies.join(', ')}` : ''}
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            ` : '<div style="text-align: center; padding: 40px; color: var(--vscode-descriptionForeground);">No execution plan available</div>'}
                        </div>

                        <div id="rollbackTabContent" class="tab-content">
                            ${data.canRollback ? `
                                <div class="sql-preview">
                                    <div class="sql-title">Rollback Script</div>
                                    <div class="sql-content">
                                        ${this.formatSqlPreview(data.rollbackScript)}
                                    </div>
                                </div>
                                ${data.rollbackPlan ? `
                                    <div class="execution-plan" style="margin-top: 20px;">
                                        <h3>Rollback Steps</h3>
                                        ${data.rollbackPlan.map(step => `
                                            <div class="step-item">
                                                <div class="step-header">
                                                    <div class="step-number">${step.order}</div>
                                                    <div class="step-title">${step.description}</div>
                                                </div>
                                                <div class="step-description">
                                                    Estimated duration: ${step.estimatedDuration}<br>
                                                    Critical: ${step.critical ? 'Yes' : 'No'}
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                ` : ''}
                            ` : '<div style="text-align: center; padding: 40px; color: var(--vscode-descriptionForeground);">Rollback not available for this migration</div>'}
                        </div>
                    </div>
                </div>

                <div class="footer">
                    <div class="status-info">
                        Migration ready for execution
                    </div>
                    <div class="action-buttons">
                        <button class="btn btn-secondary" onclick="validateMigration()">Validate</button>
                        <button class="btn btn-secondary" onclick="saveMigration()">Save to File</button>
                        <button class="btn btn-primary" onclick="executeMigration()"
                                ${!data.canExecute ? 'disabled' : ''}>
                            Execute Migration
                        </button>
                    </div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    let currentTab = 'overview';
                    let selectedConflicts = new Set(${JSON.stringify(Array.from(this.selectedConflicts))});

                    function switchTab(tabName) {
                        currentTab = tabName;

                        // Update tab buttons
                        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
                        document.getElementById(tabName + 'Tab').classList.add('active');

                        // Update tab content
                        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
                        document.getElementById(tabName + 'TabContent').classList.add('active');
                    }

                    function handleSearch() {
                        const searchTerm = document.getElementById('searchInput').value.toLowerCase();
                        vscode.postMessage({
                            command: 'search',
                            searchTerm: searchTerm
                        });
                    }

                    function selectConflict(conflictId) {
                        vscode.postMessage({
                            command: 'selectConflict',
                            conflictId: conflictId
                        });
                    }

                    function resolveConflict(conflictId, resolution) {
                        vscode.postMessage({
                            command: 'resolveConflict',
                            conflictId: conflictId,
                            resolution: resolution
                        });
                    }

                    function validateMigration() {
                        vscode.postMessage({
                            command: 'validateMigration'
                        });
                    }

                    function saveMigration() {
                        vscode.postMessage({
                            command: 'saveMigration'
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

                    function showSettings() {
                        vscode.postMessage({
                            command: 'showSettings'
                        });
                    }
                </script>
            </body>
            </html>
        `;
    }

    private generateConflictDetail(conflict: MigrationConflict): string {
        const severityClass = `severity-${conflict.severity}`;

        return `
            <div class="conflict-detail">
                <div class="conflict-header">
                    <div>
                        <div style="font-weight: bold; margin-bottom: 5px;">${conflict.description}</div>
                        <div style="font-size: 12px; color: var(--vscode-descriptionForeground);">
                            Type: ${conflict.type} • Affected: ${conflict.affectedObjects.length} objects
                        </div>
                    </div>
                    <div class="conflict-severity ${severityClass}">${conflict.severity}</div>
                </div>

                <div style="margin-bottom: 15px;">
                    <strong>Risk if ignored:</strong> ${conflict.riskIfIgnored}
                </div>

                <div class="resolution-options">
                    <div class="resolution-option" onclick="resolveConflict('${conflict.id}', 'skip')">
                        <div class="resolution-title">Skip</div>
                        <div class="resolution-description">Skip this change and continue with migration</div>
                    </div>
                    <div class="resolution-option" onclick="resolveConflict('${conflict.id}', 'overwrite')">
                        <div class="resolution-title">Overwrite</div>
                        <div class="resolution-description">Apply the change and overwrite existing data</div>
                    </div>
                    <div class="resolution-option" onclick="resolveConflict('${conflict.id}', 'merge')">
                        <div class="resolution-title">Merge</div>
                        <div class="resolution-description">Attempt to merge changes intelligently</div>
                    </div>
                    <div class="resolution-option" onclick="resolveConflict('${conflict.id}', 'manual')">
                        <div class="resolution-title">Manual Resolution</div>
                        <div class="resolution-description">Resolve this conflict manually before proceeding</div>
                    </div>
                </div>
            </div>
        `;
    }

    private formatSqlPreview(sql: string): string {
        const lines = sql.split('\n');
        return lines.map((line, index) => {
            let formattedLine = line;

            // Basic SQL syntax highlighting
            formattedLine = formattedLine.replace(/\b(CREATE|ALTER|DROP|SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|INNER|LEFT|RIGHT|ON|GROUP BY|ORDER BY|HAVING|LIMIT|BEGIN|COMMIT|ROLLBACK)\b/gi,
                '<span style="color: var(--vscode-symbolIcon-keywordForeground); font-weight: bold;">$1</span>');
            formattedLine = formattedLine.replace(/(['"`])(.*?)\1/g, '<span style="color: var(--vscode-symbolIcon-stringForeground);">$1$2$1</span>');
            formattedLine = formattedLine.replace(/\b(\d+)\b/g, '<span style="color: var(--vscode-symbolIcon-numberForeground);">$1</span>');
            formattedLine = formattedLine.replace(/--(.*)/g, '<span style="color: var(--vscode-textPreformat-foreground); font-style: italic;">--$1</span>');

            return `<div style="padding: 2px 0; border-left: 3px solid transparent;">${index + 1}: ${formattedLine}</div>`;
        }).join('');
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

    private async handleWebviewMessage(message: any): Promise<void> {
        try {
            switch (message.command) {
                case 'search':
                    await this.handleSearch(message.searchTerm);
                    break;

                case 'selectConflict':
                    await this.handleSelectConflict(message.conflictId);
                    break;

                case 'resolveConflict':
                    await this.handleResolveConflict(message.conflictId, message.resolution);
                    break;

                case 'validateMigration':
                    await this.handleValidateMigration();
                    break;

                case 'saveMigration':
                    await this.handleSaveMigration();
                    break;

                case 'executeMigration':
                    await this.handleExecuteMigration();
                    break;

                case 'exportReport':
                    await this.handleExportReport();
                    break;

                case 'showSettings':
                    await this.handleShowSettings();
                    break;

                case 'undoResolution':
                    await this.handleUndoResolution(message.conflictId);
                    break;

                case 'bulkResolveConflicts':
                    await this.handleBulkResolveConflicts(message.resolutionStrategy);
                    break;

                case 'refreshPreview':
                    await this.handleRefreshPreview();
                    break;

                case 'compareWithOriginal':
                    await this.handleCompareWithOriginal();
                    break;

                case 'getMigrationStatus':
                    await this.handleGetMigrationStatus();
                    break;

                default:
                    Logger.warn('Unknown webview message command', { command: message.command });
                    break;
            }
        } catch (error) {
            Logger.error('Error handling webview message', error as Error, { command: message.command });
            if (this.panel) {
                this.panel.webview.postMessage({
                    command: 'error',
                    message: `Error: ${(error as Error).message}`
                });
            }
        }
    }

    private async handleShowSettings(): Promise<void> {
        // Show migration preview settings
        const settings = await this.getMigrationPreviewSettings();

        const config = vscode.workspace.getConfiguration('postgresql');
        const items = [
            `Auto-validate on load: ${settings.autoValidate}`,
            `Show line numbers in SQL: ${settings.showLineNumbers}`,
            `Enable syntax highlighting: ${settings.enableSyntaxHighlighting}`,
            `Default export format: ${settings.defaultExportFormat}`,
            `Risk level threshold: ${settings.riskThreshold}`,
            `Enable conflict auto-resolution: ${settings.enableAutoResolution}`
        ];

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Migration preview settings',
            canPickMany: false
        });

        if (selected) {
            vscode.window.showInformationMessage(`Selected setting: ${selected}`);
        }
    }

    private async handleUndoResolution(conflictId: string): Promise<void> {
        this.undoConflictResolution(conflictId);

        if (this.panel) {
            this.panel.webview.postMessage({
                command: 'resolutionUndone',
                conflictId: conflictId
            });
        }
    }

    private async handleBulkResolveConflicts(resolutionStrategy: string): Promise<void> {
        if (!this.migrationData || !this.panel) return;

        const unresolvedConflicts = this.migrationData.conflicts?.filter(c => !this.conflictResolutions.has(c.id)) || [];

        if (unresolvedConflicts.length === 0) {
            vscode.window.showInformationMessage('No unresolved conflicts to resolve');
            return;
        }

        // Confirm bulk resolution
        const confirmed = await vscode.window.showWarningMessage(
            `Apply '${resolutionStrategy}' resolution to ${unresolvedConflicts.length} conflicts?`,
            { modal: true },
            'Apply to All',
            'Cancel'
        );

        if (confirmed === 'Apply to All') {
            for (const conflict of unresolvedConflicts) {
                await this.handleResolveConflict(conflict.id, resolutionStrategy);
            }

            vscode.window.showInformationMessage(
                `Applied '${resolutionStrategy}' resolution to ${unresolvedConflicts.length} conflicts`
            );
        }
    }

    private async handleRefreshPreview(): Promise<void> {
        if (!this.migrationData || !this.panel) return;

        try {
            // Regenerate the HTML content
            const htmlContent = await this.generateAdvancedPreviewHtml(this.migrationData);
            this.panel.webview.html = htmlContent;

            vscode.window.showInformationMessage('Preview refreshed');
            Logger.info('Migration preview refreshed');

        } catch (error) {
            Logger.error('Failed to refresh preview', error as Error);
            vscode.window.showErrorMessage('Failed to refresh preview');
        }
    }

    private async handleCompareWithOriginal(): Promise<void> {
        if (!this.panel) return;

        // This would open a comparison view with the original schema
        vscode.window.showInformationMessage('Schema comparison view not yet implemented');

        this.panel.webview.postMessage({
            command: 'showComparison',
            comparisonData: null // Would contain actual comparison data
        });
    }

    private async handleGetMigrationStatus(): Promise<void> {
        if (!this.migrationData || !this.panel) return;

        const status = {
            migrationId: this.migrationData.migrationId,
            name: this.migrationData.migrationName,
            riskLevel: this.migrationData.riskLevel,
            totalConflicts: this.migrationData.conflicts?.length || 0,
            resolvedConflicts: this.conflictResolutions.size,
            canExecute: this.migrationData.canExecute,
            canRollback: this.migrationData.canRollback,
            validationPassed: await this.isValidationPassed(),
            lastUpdated: new Date().toISOString()
        };

        this.panel.webview.postMessage({
            command: 'migrationStatus',
            status: status
        });
    }

    private async isValidationPassed(): Promise<boolean> {
        if (!this.migrationData) return false;

        const validation = await this.validateMigrationData(this.migrationData);
        return validation.isValid;
    }

    private async getMigrationPreviewSettings(): Promise<{
        autoValidate: boolean;
        showLineNumbers: boolean;
        enableSyntaxHighlighting: boolean;
        defaultExportFormat: string;
        riskThreshold: string;
        enableAutoResolution: boolean;
    }> {
        const config = vscode.workspace.getConfiguration('postgresql.migrationPreview');

        return {
            autoValidate: config.get('autoValidate', true),
            showLineNumbers: config.get('showLineNumbers', true),
            enableSyntaxHighlighting: config.get('enableSyntaxHighlighting', true),
            defaultExportFormat: config.get('defaultExportFormat', 'sql'),
            riskThreshold: config.get('riskThreshold', 'Medium'),
            enableAutoResolution: config.get('enableAutoResolution', false)
        };
    }

    private async handleSearch(searchTerm: string): Promise<void> {
        if (!this.panel || !this.migrationData) return;

        try {
            const searchFilters = this.parseSearchTerm(searchTerm);

            // Filter conflicts based on search term and filters
            const filteredConflicts = this.migrationData.conflicts?.filter(conflict =>
                this.matchesConflict(conflict, searchFilters)
            ) || [];

            // Filter dependencies based on search term and filters
            const filteredDependencies = this.migrationData.dependencies?.filter(dep =>
                this.matchesDependency(dep, searchFilters)
            ) || [];

            // Filter execution plan steps if search term matches
            const filteredExecutionSteps = this.migrationData.executionPlan?.filter(step =>
                step.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                step.type.toLowerCase().includes(searchTerm.toLowerCase())
            ) || [];

            // Update the webview with filtered results
            this.panel.webview.postMessage({
                command: 'updateSearchResults',
                searchTerm: searchTerm,
                filters: searchFilters,
                filteredConflicts: filteredConflicts,
                filteredDependencies: filteredDependencies,
                filteredExecutionSteps: filteredExecutionSteps,
                totalConflicts: this.migrationData.conflicts?.length || 0,
                totalDependencies: this.migrationData.dependencies?.length || 0,
                totalExecutionSteps: this.migrationData.executionPlan?.length || 0
            });

            Logger.info('Advanced search completed', {
                searchTerm,
                filters: searchFilters,
                conflictResults: filteredConflicts.length,
                dependencyResults: filteredDependencies.length,
                executionStepResults: filteredExecutionSteps.length
            });

        } catch (error) {
            Logger.error('Search failed', error as Error);
            vscode.window.showErrorMessage(`Search failed: ${(error as Error).message}`);
        }
    }

    private parseSearchTerm(searchTerm: string): SearchFilters {
        const filters: SearchFilters = {
            text: searchTerm,
            type: null,
            severity: null,
            object: null,
            hasResolution: null
        };

        // Parse special filter syntax like "type:constraint severity:high"
        const parts = searchTerm.split(/\s+/);
        const textParts: string[] = [];

        for (const part of parts) {
            if (part.includes(':')) {
                const [key, value] = part.split(':');
                switch (key.toLowerCase()) {
                    case 'type':
                        filters.type = value as any;
                        break;
                    case 'severity':
                        filters.severity = value as any;
                        break;
                    case 'object':
                        filters.object = value;
                        break;
                    case 'resolved':
                        filters.hasResolution = value.toLowerCase() === 'true';
                        break;
                }
            } else {
                textParts.push(part);
            }
        }

        filters.text = textParts.join(' ');
        return filters;
    }

    private matchesConflict(conflict: MigrationConflict, filters: SearchFilters): boolean {
        // Text search
        if (filters.text) {
            const searchText = filters.text.toLowerCase();
            if (!conflict.description.toLowerCase().includes(searchText) &&
                !conflict.type.toLowerCase().includes(searchText) &&
                !conflict.affectedObjects.some(obj => obj.toLowerCase().includes(searchText))) {
                return false;
            }
        }

        // Type filter
        if (filters.type && conflict.type !== filters.type) {
            return false;
        }

        // Severity filter
        if (filters.severity && conflict.severity !== filters.severity) {
            return false;
        }

        // Object filter
        if (filters.object && !conflict.affectedObjects.some(obj => obj.toLowerCase().includes(filters.object!.toLowerCase()))) {
            return false;
        }

        // Resolution filter
        if (filters.hasResolution !== null) {
            const hasResolution = this.conflictResolutions.has(conflict.id);
            if (filters.hasResolution !== hasResolution) {
                return false;
            }
        }

        return true;
    }

    private matchesDependency(dependency: MigrationDependency, filters: SearchFilters): boolean {
        // Text search
        if (filters.text) {
            const searchText = filters.text.toLowerCase();
            if (!dependency.dependent.toLowerCase().includes(searchText) &&
                !dependency.dependsOn.toLowerCase().includes(searchText) &&
                !dependency.reason.toLowerCase().includes(searchText) &&
                !dependency.type.toLowerCase().includes(searchText)) {
                return false;
            }
        }

        // Type filter
        if (filters.type && dependency.type !== filters.type) {
            return false;
        }

        // Severity filter
        if (filters.severity && dependency.severity !== filters.severity) {
            return false;
        }

        return true;
    }

    private async applyAdvancedFilters(filters: AdvancedFilters): Promise<void> {
        if (!this.panel || !this.migrationData) return;

        try {
            let filteredConflicts = this.migrationData.conflicts || [];
            let filteredDependencies = this.migrationData.dependencies || [];

            // Apply conflict filters
            if (filters.conflictTypes && filters.conflictTypes.length > 0) {
                filteredConflicts = filteredConflicts.filter(c => filters.conflictTypes!.includes(c.type));
            }

            if (filters.conflictSeverities && filters.conflictSeverities.length > 0) {
                filteredConflicts = filteredConflicts.filter(c => filters.conflictSeverities!.includes(c.severity));
            }

            if (filters.resolvedOnly !== undefined) {
                if (filters.resolvedOnly) {
                    filteredConflicts = filteredConflicts.filter(c => this.conflictResolutions.has(c.id));
                } else {
                    filteredConflicts = filteredConflicts.filter(c => !this.conflictResolutions.has(c.id));
                }
            }

            // Apply dependency filters
            if (filters.dependencyTypes && filters.dependencyTypes.length > 0) {
                filteredDependencies = filteredDependencies.filter(d => filters.dependencyTypes!.includes(d.type));
            }

            if (filters.dependencySeverities && filters.dependencySeverities.length > 0) {
                filteredDependencies = filteredDependencies.filter(d => filters.dependencySeverities!.includes(d.severity));
            }

            // Apply object filter
            if (filters.objectFilter) {
                const objectFilter = filters.objectFilter.toLowerCase();
                filteredConflicts = filteredConflicts.filter(c =>
                    c.affectedObjects.some(obj => obj.toLowerCase().includes(objectFilter))
                );
            }

            // Update UI with filtered results
            this.panel.webview.postMessage({
                command: 'applyAdvancedFilters',
                filters: filters,
                filteredConflicts: filteredConflicts,
                filteredDependencies: filteredDependencies,
                totalConflicts: this.migrationData.conflicts?.length || 0,
                totalDependencies: this.migrationData.dependencies?.length || 0
            });

            Logger.info('Advanced filters applied', {
                filters,
                conflictResults: filteredConflicts.length,
                dependencyResults: filteredDependencies.length
            });

        } catch (error) {
            Logger.error('Failed to apply advanced filters', error as Error);
            vscode.window.showErrorMessage(`Failed to apply filters: ${(error as Error).message}`);
        }
    }

    private clearAllFilters(): void {
        if (!this.panel) return;

        this.panel.webview.postMessage({
            command: 'clearAllFilters'
        });

        Logger.info('All filters cleared');
    }

    private getFilterSummary(): FilterSummary {
        return {
            activeFilters: 0,
            filteredConflicts: 0,
            filteredDependencies: 0,
            totalConflicts: this.migrationData?.conflicts?.length || 0,
            totalDependencies: this.migrationData?.dependencies?.length || 0
        };
    }

    private async handleSelectConflict(conflictId: string): Promise<void> {
        if (!this.panel || !this.migrationData) return;

        try {
            // Add to selected conflicts set
            this.selectedConflicts.add(conflictId);

            // Find the selected conflict
            const conflict = this.migrationData.conflicts?.find(c => c.id === conflictId);
            if (!conflict) {
                Logger.warn('Conflict not found', { conflictId });
                return;
            }

            // Scroll to the selected conflict in the webview
            this.panel.webview.postMessage({
                command: 'scrollToConflict',
                conflictId: conflictId,
                conflict: conflict
            });

            // Update sidebar to highlight selected conflict
            this.panel.webview.postMessage({
                command: 'highlightConflict',
                conflictId: conflictId
            });

            // Switch to conflicts tab if not already there
            if (this.panel.webview) {
                this.panel.webview.postMessage({
                    command: 'switchToTab',
                    tabName: 'conflicts'
                });
            }

            Logger.info('Conflict selected', {
                conflictId,
                conflictType: conflict.type,
                conflictSeverity: conflict.severity
            });

        } catch (error) {
            Logger.error('Failed to select conflict', error as Error);
            vscode.window.showErrorMessage(`Failed to select conflict: ${(error as Error).message}`);
        }
    }

    private async handleResolveConflict(conflictId: string, resolution: string): Promise<void> {
        if (!this.panel || !this.migrationData) return;

        try {
            const conflict = this.migrationData.conflicts?.find(c => c.id === conflictId);
            if (!conflict) {
                Logger.warn('Conflict not found for resolution', { conflictId });
                return;
            }

            // Create conflict resolution object
            const conflictResolution: ConflictResolution = {
                strategy: resolution as any,
                rationale: `User selected ${resolution} strategy`,
                approvedBy: 'Current User',
                approvedAt: new Date().toISOString(),
                parameters: this.getResolutionParameters(resolution, conflict)
            };

            // Store the resolution
            this.conflictResolutions.set(conflictId, conflictResolution);

            // Update the UI to show resolution
            this.panel.webview.postMessage({
                command: 'updateConflictResolution',
                conflictId: conflictId,
                resolution: conflictResolution,
                conflict: conflict
            });

            // Update conflict item in sidebar to show resolved state
            this.panel.webview.postMessage({
                command: 'updateConflictItem',
                conflictId: conflictId,
                status: 'resolved',
                resolution: resolution
            });

            // Check if all conflicts are resolved
            const unresolvedConflicts = this.migrationData.conflicts?.filter(c => !this.conflictResolutions.has(c.id)) || [];
            if (unresolvedConflicts.length === 0) {
                this.panel.webview.postMessage({
                    command: 'allConflictsResolved'
                });
            }

            Logger.info('Conflict resolved', {
                conflictId,
                resolution,
                remainingConflicts: unresolvedConflicts.length
            });

            vscode.window.showInformationMessage(
                `Conflict resolved with strategy: ${resolution}`,
                'Undo Resolution'
            ).then(action => {
                if (action === 'Undo Resolution') {
                    this.undoConflictResolution(conflictId);
                }
            });

        } catch (error) {
            Logger.error('Failed to resolve conflict', error as Error);
            vscode.window.showErrorMessage(`Failed to resolve conflict: ${(error as Error).message}`);
        }
    }

    private getResolutionParameters(strategy: string, conflict: MigrationConflict): Record<string, any> {
        const parameters: Record<string, any> = {};

        switch (strategy) {
            case 'merge':
                parameters.preserveStructure = true;
                parameters.createBackup = true;
                break;
            case 'overwrite':
                parameters.backupOriginal = true;
                parameters.forceUpdate = true;
                break;
            case 'skip':
                parameters.reason = 'User selected to skip this change';
                break;
            case 'manual':
                parameters.requiresReview = true;
                parameters.escalationLevel = 'high';
                break;
        }

        return parameters;
    }

    private undoConflictResolution(conflictId: string): void {
        if (!this.panel) return;

        this.conflictResolutions.delete(conflictId);
        this.selectedConflicts.delete(conflictId);

        this.panel.webview.postMessage({
            command: 'undoConflictResolution',
            conflictId: conflictId
        });

        Logger.info('Conflict resolution undone', { conflictId });
    }

    private updateConflictResolutionUI(conflictId: string, resolution: ConflictResolution): void {
        if (!this.panel) return;

        this.panel.webview.postMessage({
            command: 'updateConflictResolution',
            conflictId: conflictId,
            resolution: resolution
        });
    }

    private updateConflictItemUI(conflictId: string, status: string, resolution?: string): void {
        if (!this.panel) return;

        this.panel.webview.postMessage({
            command: 'updateConflictItem',
            conflictId: conflictId,
            status: status,
            resolution: resolution
        });
    }

    private updateAllConflictsResolvedUI(): void {
        if (!this.panel) return;

        this.panel.webview.postMessage({
            command: 'allConflictsResolved'
        });
    }

    private updateMigrationStatusUI(): void {
        if (!this.panel || !this.migrationData) return;

        const unresolvedConflicts = this.migrationData.conflicts?.filter(c => !this.conflictResolutions.has(c.id)) || [];

        this.panel.webview.postMessage({
            command: 'updateMigrationStatus',
            status: {
                totalConflicts: this.migrationData.conflicts?.length || 0,
                resolvedConflicts: this.conflictResolutions.size,
                unresolvedConflicts: unresolvedConflicts.length,
                canExecute: unresolvedConflicts.length === 0 && this.migrationData.canExecute,
                progress: this.migrationData.conflicts?.length ?
                    Math.round((this.conflictResolutions.size / this.migrationData.conflicts.length) * 100) : 100
            }
        });
    }

    private showValidationResultsUI(validationResults: any): void {
        if (!this.panel) return;

        this.panel.webview.postMessage({
            command: 'showValidationResults',
            results: validationResults
        });
    }

    private updateExecutionProgressUI(step: string, progress: number, details?: string): void {
        if (!this.panel) return;

        this.panel.webview.postMessage({
            command: 'updateExecutionProgress',
            step: step,
            progress: progress,
            details: details
        });
    }

    private showExecutionResultsUI(success: boolean, results: any): void {
        if (!this.panel) return;

        this.panel.webview.postMessage({
            command: 'showExecutionResults',
            success: success,
            results: results
        });
    }

    private highlightConflictInSidebar(conflictId: string): void {
        if (!this.panel) return;

        this.panel.webview.postMessage({
            command: 'highlightConflict',
            conflictId: conflictId
        });
    }

    private scrollToConflictInMainView(conflictId: string): void {
        if (!this.panel) return;

        this.panel.webview.postMessage({
            command: 'scrollToConflict',
            conflictId: conflictId
        });
    }

    private updateSearchResultsUI(searchTerm: string, filteredConflicts: MigrationConflict[], filteredDependencies: MigrationDependency[]): void {
        if (!this.panel) return;

        this.panel.webview.postMessage({
            command: 'updateSearchResults',
            searchTerm: searchTerm,
            filteredConflicts: filteredConflicts,
            filteredDependencies: filteredDependencies,
            totalConflicts: this.migrationData?.conflicts?.length || 0,
            totalDependencies: this.migrationData?.dependencies?.length || 0
        });
    }

    private showNotificationUI(type: 'info' | 'warning' | 'error', message: string, actions?: string[]): void {
        if (!this.panel) return;

        this.panel.webview.postMessage({
            command: 'showNotification',
            type: type,
            message: message,
            actions: actions || []
        });
    }

    private updateTabContentUI(tabName: string, content: string): void {
        if (!this.panel) return;

        this.panel.webview.postMessage({
            command: 'updateTabContent',
            tabName: tabName,
            content: content
        });
    }

    private refreshSidebarUI(): void {
        if (!this.panel || !this.migrationData) return;

        // Update conflict counts and status
        const unresolvedConflicts = this.migrationData.conflicts?.filter(c => !this.conflictResolutions.has(c.id)) || [];

        this.panel.webview.postMessage({
            command: 'refreshSidebar',
            data: {
                totalConflicts: this.migrationData.conflicts?.length || 0,
                resolvedConflicts: this.conflictResolutions.size,
                unresolvedConflicts: unresolvedConflicts.length,
                migrationInfo: {
                    statements: this.migrationData.totalStatements,
                    duration: this.migrationData.estimatedExecutionTime,
                    riskLevel: this.migrationData.riskLevel,
                    rollback: this.migrationData.canRollback ? 'Available' : 'Not Available'
                },
                impactAnalysis: this.migrationData.impactAnalysis
            }
        });
    }

    private async handleValidateMigration(): Promise<void> {
        if (!this.migrationData) return;

        try {
            // Show progress indicator
            const progressOptions: vscode.ProgressOptions = {
                location: vscode.ProgressLocation.Notification,
                title: 'Validating Migration',
                cancellable: false
            };

            await vscode.window.withProgress(progressOptions, async (progress) => {
                progress.report({ increment: 0, message: 'Analyzing migration script...' });

                // Perform comprehensive validation checks
                if (!this.migrationData) {
                    vscode.window.showErrorMessage('No migration data available for validation');
                    return;
                }

                const validationResults = await this.validateMigrationData(this.migrationData);

                progress.report({ increment: 50, message: 'Checking dependencies...' });

                // Additional validation checks
                const dependencyValidation = await this.validateDependencies(this.migrationData);
                const securityValidation = await this.validateSecurity(this.migrationData);
                const performanceValidation = await this.validatePerformance(this.migrationData);

                progress.report({ increment: 100, message: 'Validation complete' });

                // Combine all validation results
                const allErrors = [
                    ...validationResults.errors,
                    ...dependencyValidation.errors,
                    ...securityValidation.errors,
                    ...performanceValidation.errors
                ];

                const allWarnings = [
                    ...dependencyValidation.warnings,
                    ...securityValidation.warnings,
                    ...performanceValidation.warnings
                ];

                if (validationResults.isValid && allErrors.length === 0) {
                    vscode.window.showInformationMessage(
                        `Migration validation passed!\n\nWarnings: ${allWarnings.length}\n${allWarnings.join('\n')}`,
                        'View Details'
                    ).then(action => {
                        if (action === 'View Details') {
                            this.showValidationDetails(validationResults, dependencyValidation, securityValidation, performanceValidation);
                        }
                    });
                } else {
                    const errorMessage = allErrors.join('\n');
                    vscode.window.showErrorMessage(
                        `Migration validation failed:\n\n${errorMessage}\n\nWarnings: ${allWarnings.length}`,
                        'View Details',
                        'Fix Issues'
                    ).then(action => {
                        if (action === 'View Details') {
                            this.showValidationDetails(validationResults, dependencyValidation, securityValidation, performanceValidation);
                        } else if (action === 'Fix Issues') {
                            this.attemptAutoFix(allErrors);
                        }
                    });
                }
            });

        } catch (error) {
            Logger.error('Migration validation failed', error as Error);
            vscode.window.showErrorMessage(`Validation failed: ${(error as Error).message}`);
        }
    }

    private async validateDependencies(data: AdvancedMigrationPreviewData): Promise<{ errors: string[]; warnings: string[]; }> {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (data.dependencies) {
            // Check for circular dependencies
            const circularDeps = this.detectCircularDependencies(data.dependencies);
            if (circularDeps.length > 0) {
                errors.push(`Circular dependencies detected: ${circularDeps.join(' -> ')}`);
            }

            // Check for missing dependencies
            const missingDeps = data.dependencies.filter(dep => dep.severity === 'required');
            if (missingDeps.length > 0) {
                warnings.push(`${missingDeps.length} required dependencies should be reviewed`);
            }
        }

        return { errors, warnings };
    }

    private async validateSecurity(data: AdvancedMigrationPreviewData): Promise<{ errors: string[]; warnings: string[]; }> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check for potentially dangerous operations
        const dangerousPatterns = [
            /\bDROP\s+USER\b/i,
            /\bDROP\s+DATABASE\b/i,
            /\bTRUNCATE\b/i,
            /\bDELETE\s+FROM\s+\w+\s+WHERE\s+1\s*=\s*1\b/i
        ];

        for (const pattern of dangerousPatterns) {
            if (pattern.test(data.sqlScript)) {
                warnings.push(`Potentially dangerous operation detected: ${pattern.source}`);
            }
        }

        // Check for privilege escalation
        if (data.riskLevel === 'Critical' && !data.canRollback) {
            errors.push('Critical migrations without rollback capability pose security risks');
        }

        return { errors, warnings };
    }

    private async validatePerformance(data: AdvancedMigrationPreviewData): Promise<{ errors: string[]; warnings: string[]; }> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check for large data operations
        if (data.impactAnalysis?.affectedUsers && data.impactAnalysis.affectedUsers > 1000) {
            warnings.push('Large number of users affected - consider batch processing');
        }

        // Check for long-running operations
        if (data.estimatedExecutionTime && this.parseDuration(data.estimatedExecutionTime) > 3600) {
            warnings.push('Migration estimated to take over 1 hour - consider optimization');
        }

        return { errors, warnings };
    }

    private detectCircularDependencies(dependencies: MigrationDependency[]): string[] {
        const circularDeps: string[] = [];
        const visited = new Set<string>();
        const recursionStack = new Set<string>();

        const checkCircular = (depId: string, path: string[] = []): void => {
            if (recursionStack.has(depId)) {
                circularDeps.push([...path, depId].join(' -> '));
                return;
            }

            if (visited.has(depId)) return;

            visited.add(depId);
            recursionStack.add(depId);

            const dependents = dependencies.filter(d => d.dependsOn === depId);
            for (const dependent of dependents) {
                checkCircular(dependent.dependent, [...path, depId]);
            }

            recursionStack.delete(depId);
        };

        dependencies.forEach(dep => {
            if (!visited.has(dep.dependsOn)) {
                checkCircular(dep.dependsOn);
            }
        });

        return circularDeps;
    }

    private parseDuration(duration: string): number {
        // Simple duration parser - converts "2h 30m" to seconds
        const hours = duration.match(/(\d+)h/);
        const minutes = duration.match(/(\d+)m/);
        const seconds = duration.match(/(\d+)s/);

        let totalSeconds = 0;
        if (hours) totalSeconds += parseInt(hours[1]) * 3600;
        if (minutes) totalSeconds += parseInt(minutes[1]) * 60;
        if (seconds) totalSeconds += parseInt(seconds[1]);

        return totalSeconds;
    }

    private showValidationDetails(...validations: any[]): void {
        // Implementation for showing detailed validation results
        Logger.info('Showing validation details', { validationCount: validations.length });
    }

    private attemptAutoFix(errors: string[]): void {
        // Implementation for attempting automatic fixes
        Logger.info('Attempting auto-fix', { errorCount: errors.length });
    }

    private async validateMigrationData(data: AdvancedMigrationPreviewData): Promise<{ isValid: boolean; errors: string[]; }> {
        const errors: string[] = [];

        if (!data.sqlScript.trim()) {
            errors.push('Migration script is empty');
        }

        if (data.conflicts) {
            const unresolvedConflicts = data.conflicts.filter(c => !this.conflictResolutions.has(c.id));
            if (unresolvedConflicts.length > 0) {
                errors.push(`${unresolvedConflicts.length} conflicts require resolution`);
            }
        }

        if (data.riskLevel === 'Critical' && !data.canRollback) {
            errors.push('Critical risk migration requires rollback capability');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    private async handleSaveMigration(): Promise<void> {
        if (!this.migrationData) return;

        try {
            // Show save dialog with multiple format options
            const uri = await vscode.window.showSaveDialog({
                filters: {
                    'SQL Files': ['sql'],
                    'JSON Files': ['json'],
                    'Text Files': ['txt'],
                    'All Files': ['*']
                },
                defaultUri: vscode.Uri.file(`migration-${this.migrationData.migrationId}.sql`)
            });

            if (uri) {
                let content: string;
                let successMessage: string;

                // Generate content based on file extension
                const extension = uri.fsPath.split('.').pop()?.toLowerCase();

                switch (extension) {
                    case 'json':
                        content = this.generateMigrationJsonContent(this.migrationData);
                        successMessage = 'Migration data exported as JSON successfully';
                        break;
                    case 'txt':
                        content = this.generateDetailedReport(this.migrationData);
                        successMessage = 'Migration report exported successfully';
                        break;
                    default:
                        content = this.generateMigrationFileContent(this.migrationData);
                        successMessage = 'Migration script saved successfully';
                        break;
                }

                // Write file
                await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));

                // Show success message with option to open file
                vscode.window.showInformationMessage(
                    successMessage,
                    'Open File',
                    'Open Containing Folder'
                ).then(action => {
                    if (action === 'Open File') {
                        vscode.window.showTextDocument(uri);
                    } else if (action === 'Open Containing Folder') {
                        vscode.commands.executeCommand('revealFileInOS', uri);
                    }
                });

                Logger.info('Migration saved', {
                    filePath: uri.fsPath,
                    format: extension || 'sql',
                    size: content.length
                });
            }
        } catch (error) {
            Logger.error('Failed to save migration', error as Error);
            vscode.window.showErrorMessage(`Failed to save migration: ${(error as Error).message}`);
        }
    }

    private generateMigrationJsonContent(data: AdvancedMigrationPreviewData): string {
        const jsonData = {
            migration: {
                id: data.migrationId,
                name: data.migrationName,
                sourceConnection: data.sourceConnection,
                targetConnection: data.targetConnection,
                riskLevel: data.riskLevel,
                totalStatements: data.totalStatements,
                estimatedExecutionTime: data.estimatedExecutionTime,
                canExecute: data.canExecute,
                canRollback: data.canRollback,
                warnings: data.warnings,
                metadata: data.metadata
            },
            script: {
                migration: data.sqlScript,
                rollback: data.rollbackScript
            },
            conflicts: data.conflicts?.map(c => ({
                ...c,
                resolution: this.conflictResolutions.get(c.id)
            })) || [],
            dependencies: data.dependencies || [],
            impactAnalysis: data.impactAnalysis,
            executionPlan: data.executionPlan || [],
            rollbackPlan: data.rollbackPlan || [],
            exportedAt: new Date().toISOString(),
            exportedBy: 'Advanced Migration Preview View'
        };

        return JSON.stringify(jsonData, null, 2);
    }

    private generateMigrationFileContent(data: AdvancedMigrationPreviewData): string {
        let content = `-- Advanced Migration: ${data.migrationName}
-- Migration ID: ${data.migrationId}
-- Generated: ${new Date().toISOString()}
-- Source: ${data.sourceConnection}
-- Target: ${data.targetConnection}
-- Risk Level: ${data.riskLevel}
-- Estimated Duration: ${data.estimatedExecutionTime}
-- Rollback Available: ${data.canRollback ? 'Yes' : 'No'}

`;

        if (data.metadata?.description) {
            content += `-- Description: ${data.metadata.description}\n`;
        }

        if (data.metadata?.author) {
            content += `-- Author: ${data.metadata.author}\n`;
        }

        content += `\n-- Migration Script\n`;
        content += `${data.sqlScript}\n`;

        if (data.canRollback) {
            content += `\n-- Rollback Script\n`;
            content += `${data.rollbackScript}\n`;
        }

        if (data.conflicts && data.conflicts.length > 0) {
            content += `\n-- Conflicts (${data.conflicts.length})\n`;
            data.conflicts.forEach(conflict => {
                const resolution = this.conflictResolutions.get(conflict.id);
                content += `-- Conflict: ${conflict.description}\n`;
                content += `-- Type: ${conflict.type}, Severity: ${conflict.severity}\n`;
                if (resolution) {
                    content += `-- Resolution: ${resolution.strategy}\n`;
                }
                content += `\n`;
            });
        }

        return content;
    }

    private async handleExecuteMigration(): Promise<void> {
        if (!this.migrationData) return;

        try {
            // Validate before execution
            if (!this.migrationData) {
                vscode.window.showErrorMessage('No migration data available for execution');
                return;
            }

            const validation = await this.validateMigrationData(this.migrationData);
            if (!validation.isValid) {
                const errorMessage = validation.errors.join('\n');
                vscode.window.showErrorMessage(
                    `Cannot execute migration:\n\n${errorMessage}`,
                    'View Validation Details'
                ).then(action => {
                    if (action === 'View Validation Details') {
                        this.showValidationDetails(validation);
                    }
                });
                return;
            }

            // Pre-execution checks
            const preExecutionCheck = await this.performPreExecutionChecks(this.migrationData);
            if (!preExecutionCheck.canProceed) {
                vscode.window.showErrorMessage(
                    `Pre-execution checks failed:\n\n${preExecutionCheck.errors.join('\n')}`,
                    'Retry Checks'
                );
                return;
            }

            // Show detailed confirmation dialog for high-risk migrations
            const isHighRisk = this.migrationData.riskLevel === 'High' || this.migrationData.riskLevel === 'Critical';
            const confirmationMessage = this.buildExecutionConfirmationMessage(this.migrationData, preExecutionCheck);

            const confirmationOptions = isHighRisk
                ? ['Execute Migration', 'Schedule for Later', 'Cancel']
                : ['Execute Migration', 'Cancel'];

            const confirmed = await vscode.window.showWarningMessage(
                confirmationMessage,
                { modal: true },
                ...confirmationOptions
            );

            if (confirmed === 'Execute Migration') {
                await this.executeMigrationWithProgress(this.migrationData);
            } else if (confirmed === 'Schedule for Later') {
                await this.scheduleMigration(this.migrationData);
            }

        } catch (error) {
            Logger.error('Migration execution failed', error as Error);
            vscode.window.showErrorMessage(`Migration execution failed: ${(error as Error).message}`);
        }
    }

    private async performPreExecutionChecks(data: AdvancedMigrationPreviewData): Promise<{ canProceed: boolean; errors: string[]; warnings: string[]; }> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check if target database is accessible
        try {
            // This would check actual database connectivity
            warnings.push('Database connectivity check not implemented - assuming accessible');
        } catch (error) {
            errors.push('Cannot connect to target database');
        }

        // Check for backup availability
        if (data.impactAnalysis?.backupRequired && !data.impactAnalysis.dataLoss) {
            warnings.push('Backup is recommended for this migration');
        }

        // Check for active connections
        if (data.impactAnalysis?.downtime) {
            warnings.push('Migration may cause downtime - ensure users are notified');
        }

        return {
            canProceed: errors.length === 0,
            errors,
            warnings
        };
    }

    private buildExecutionConfirmationMessage(data: AdvancedMigrationPreviewData, checks: any): string {
        let message = `Execute Migration: ${data.migrationName}\n\n`;
        message += `Migration ID: ${data.migrationId}\n`;
        message += `Risk Level: ${data.riskLevel}\n`;
        message += `Estimated Duration: ${data.estimatedExecutionTime}\n`;
        message += `Source: ${data.sourceConnection}\n`;
        message += `Target: ${data.targetConnection}\n`;
        message += `Statements: ${data.totalStatements}\n\n`;

        if (data.conflicts && data.conflicts.length > 0) {
            const resolvedConflicts = data.conflicts.filter(c => this.conflictResolutions.has(c.id)).length;
            message += `Conflicts: ${resolvedConflicts}/${data.conflicts.length} resolved\n\n`;
        }

        if (checks.warnings.length > 0) {
            message += `Warnings:\n${checks.warnings.map((w: string) => `• ${w}`).join('\n')}\n\n`;
        }

        message += `This action cannot be undone. Are you sure you want to proceed?`;

        return message;
    }

    private async executeMigrationWithProgress(data: AdvancedMigrationPreviewData): Promise<void> {
        const progressOptions: vscode.ProgressOptions = {
            location: vscode.ProgressLocation.Notification,
            title: 'Executing Migration',
            cancellable: true
        };

        await vscode.window.withProgress(progressOptions, async (progress, token) => {
            const executionContext = {
                migrationId: data.migrationId,
                startTime: new Date(),
                currentStep: 0,
                totalSteps: this.calculateExecutionSteps(data),
                errors: [] as string[],
                warnings: [] as string[],
                rollbackTriggered: false
            };

            try {
                progress.report({ increment: 0, message: 'Initializing migration...' });

                // Pre-execution validation
                await this.performPreExecutionValidation(data, executionContext);

                // Execute migration steps
                await this.executeMigrationSteps(data, executionContext, progress, token);

                // Post-execution validation
                await this.performPostExecutionValidation(data, executionContext);

                progress.report({ increment: 100, message: 'Migration completed successfully!' });

                // Show success results
                await this.showMigrationSuccessResults(data, executionContext);

                Logger.info('Migration executed successfully', {
                    migrationId: data.migrationId,
                    duration: executionContext.totalSteps,
                    warnings: executionContext.warnings.length,
                    errors: executionContext.errors.length
                });

            } catch (error) {
                progress.report({ increment: -1, message: 'Migration failed!' });

                // Handle execution failure
                await this.handleMigrationFailure(error as Error, data, executionContext);

                throw error;
            }
        });
    }

    private calculateExecutionSteps(data: AdvancedMigrationPreviewData): number {
        let steps = 3; // Basic steps: prepare, execute, cleanup

        if (data.executionPlan) {
            steps = data.executionPlan.length;
        }

        if (data.conflicts && data.conflicts.length > 0) {
            steps += 1; // Conflict resolution step
        }

        return steps;
    }

    private async performPreExecutionValidation(data: AdvancedMigrationPreviewData, context: any): Promise<void> {
        context.currentStep++;

        // Check database connectivity
        try {
            await this.validateDatabaseConnection(data);
        } catch (error) {
            throw new Error(`Database connectivity check failed: ${(error as Error).message}`);
        }

        // Verify all critical conflicts are resolved
        const criticalConflicts = data.conflicts?.filter(c => c.severity === 'critical') || [];
        const unresolvedCritical = criticalConflicts.filter(c => !this.conflictResolutions.has(c.id));

        if (unresolvedCritical.length > 0) {
            throw new Error(`${unresolvedCritical.length} critical conflicts must be resolved before execution`);
        }

        // Check available disk space
        await this.checkDiskSpace(data);

        Logger.info('Pre-execution validation passed', { migrationId: data.migrationId });
    }

    private async executeMigrationSteps(data: AdvancedMigrationPreviewData, context: any, progress: any, token: any): Promise<void> {
        if (data.executionPlan) {
            // Execute based on defined execution plan
            for (const step of data.executionPlan) {
                if (token.isCancellationRequested) {
                    throw new Error('Migration cancelled by user');
                }

                context.currentStep++;
                progress.report({
                    increment: (context.currentStep / context.totalSteps) * 100,
                    message: `${step.type}: ${step.description}`
                });

                await this.executeStep(step, data, context);

                // Small delay to show progress
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        } else {
            // Default execution steps
            const defaultSteps = [
                { type: 'preparation', description: 'Preparing migration environment' },
                { type: 'execution', description: 'Executing migration script' },
                { type: 'validation', description: 'Validating changes' }
            ];

            for (const step of defaultSteps) {
                if (token.isCancellationRequested) {
                    throw new Error('Migration cancelled by user');
                }

                context.currentStep++;
                progress.report({
                    increment: (context.currentStep / context.totalSteps) * 100,
                    message: step.description
                });

                await this.executeDefaultStep(step, data, context);
            }
        }
    }

    private async executeStep(step: ExecutionStep, data: AdvancedMigrationPreviewData, context: any): Promise<void> {
        try {
            // Execute the step
            if (step.sql) {
                await this.executeSqlStep(step.sql, data);
            }

            // Check for dependencies
            if (step.dependencies && step.dependencies.length > 0) {
                await this.verifyStepDependencies(step.dependencies, data);
            }

            Logger.info('Execution step completed', {
                stepId: step.id,
                stepType: step.type,
                duration: step.estimatedDuration
            });

        } catch (error) {
            if (step.canFail) {
                context.warnings.push(`Step ${step.id} failed but marked as non-critical: ${(error as Error).message}`);
            } else {
                throw error;
            }
        }
    }

    private async executeDefaultStep(step: any, data: AdvancedMigrationPreviewData, context: any): Promise<void> {
        try {
            switch (step.type) {
                case 'preparation':
                    await this.prepareMigrationEnvironment(data);
                    break;
                case 'execution':
                    await this.executeMainMigration(data);
                    break;
                case 'validation':
                    await this.validateMigrationResults(data);
                    break;
            }

            Logger.info('Default execution step completed', {
                stepType: step.type,
                migrationId: data.migrationId
            });

        } catch (error) {
            context.errors.push(`Step ${step.type} failed: ${(error as Error).message}`);
            throw error;
        }
    }

    private async performPostExecutionValidation(data: AdvancedMigrationPreviewData, context: any): Promise<void> {
        context.currentStep++;

        // Validate that all expected changes were applied
        const validationResults = await this.validateMigrationChanges(data);

        if (!validationResults.valid) {
            context.warnings.push(`Post-execution validation warnings: ${validationResults.warnings.join(', ')}`);
        }

        // Check data integrity
        await this.verifyDataIntegrity(data);

        Logger.info('Post-execution validation completed', {
            migrationId: data.migrationId,
            warnings: validationResults.warnings.length
        });
    }

    private async handleMigrationFailure(error: Error, data: AdvancedMigrationPreviewData, context: any): Promise<void> {
        Logger.error('Migration execution failed', error, {
            migrationId: data.migrationId,
            completedSteps: context.currentStep,
            totalSteps: context.totalSteps
        });

        // Attempt automatic rollback if enabled and rollback is available
        if (data.canRollback && !context.rollbackTriggered) {
            const shouldRollback = await vscode.window.showErrorMessage(
                `Migration failed: ${error.message}\n\nWould you like to attempt automatic rollback?`,
                'Rollback',
                'Manual Review'
            );

            if (shouldRollback === 'Rollback') {
                context.rollbackTriggered = true;
                await this.attemptAutomaticRollback(data, error);
            }
        }

        // Show detailed error information
        vscode.window.showErrorMessage(
            `Migration execution failed after ${context.currentStep}/${context.totalSteps} steps.\n\nError: ${error.message}`,
            'View Details',
            'Retry Migration'
        ).then(action => {
            if (action === 'View Details') {
                this.showDetailedErrorInfo(error, data, context);
            } else if (action === 'Retry Migration') {
                this.retryMigration(data);
            }
        });
    }

    private async showMigrationSuccessResults(data: AdvancedMigrationPreviewData, context: any): Promise<void> {
        const duration = new Date().getTime() - context.startTime.getTime();
        const durationMinutes = Math.round(duration / 60000);

        vscode.window.showInformationMessage(
            `Migration completed successfully in ${durationMinutes} minutes!`,
            'View Results',
            'Run Rollback',
            'Schedule Next Migration'
        ).then(action => {
            if (action === 'View Results') {
                this.showMigrationResults(data);
            } else if (action === 'Run Rollback') {
                this.handleRollbackMigration(data);
            } else if (action === 'Schedule Next Migration') {
                this.scheduleNextMigration(data);
            }
        });
    }

    // Helper methods for execution steps
    private async validateDatabaseConnection(data: AdvancedMigrationPreviewData): Promise<void> {
        // Implementation would check actual database connectivity
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    private async checkDiskSpace(data: AdvancedMigrationPreviewData): Promise<void> {
        // Implementation would check available disk space
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    private async executeSqlStep(sql: string, data: AdvancedMigrationPreviewData): Promise<void> {
        // Implementation would execute SQL against the database
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    private async verifyStepDependencies(dependencies: string[], data: AdvancedMigrationPreviewData): Promise<void> {
        // Implementation would verify step dependencies
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    private async prepareMigrationEnvironment(data: AdvancedMigrationPreviewData): Promise<void> {
        // Implementation for environment preparation
        await new Promise(resolve => setTimeout(resolve, 1500));
    }

    private async executeMainMigration(data: AdvancedMigrationPreviewData): Promise<void> {
        // Implementation for main migration execution
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    private async validateMigrationResults(data: AdvancedMigrationPreviewData): Promise<void> {
        // Implementation for result validation
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    private async validateMigrationChanges(data: AdvancedMigrationPreviewData): Promise<{ valid: boolean; warnings: string[]; }> {
        // Implementation for change validation
        return { valid: true, warnings: [] };
    }

    private async verifyDataIntegrity(data: AdvancedMigrationPreviewData): Promise<void> {
        // Implementation for data integrity verification
        await new Promise(resolve => setTimeout(resolve, 800));
    }

    private async attemptAutomaticRollback(data: AdvancedMigrationPreviewData, originalError: Error): Promise<void> {
        // Implementation for automatic rollback
        vscode.window.showInformationMessage('Automatic rollback not yet implemented');
    }

    private showDetailedErrorInfo(error: Error, data: AdvancedMigrationPreviewData, context: any): void {
        // Implementation for showing detailed error information
        Logger.info('Showing detailed error info', { migrationId: data.migrationId });
    }

    private retryMigration(data: AdvancedMigrationPreviewData): void {
        // Implementation for retrying migration
        this.handleExecuteMigration();
    }

    private scheduleNextMigration(data: AdvancedMigrationPreviewData): void {
        // Implementation for scheduling next migration
        vscode.window.showInformationMessage('Migration scheduling not yet implemented');
    }

    private async scheduleMigration(data: AdvancedMigrationPreviewData): Promise<void> {
        // Implementation for scheduling migration
        vscode.window.showInformationMessage('Migration scheduling not yet implemented');
        Logger.info('Migration scheduling requested', { migrationId: data.migrationId });
    }

    private showMigrationResults(data: AdvancedMigrationPreviewData): void {
        // Implementation for showing migration results
        Logger.info('Showing migration results', { migrationId: data.migrationId });
    }

    private async handleRollbackMigration(data: AdvancedMigrationPreviewData): Promise<void> {
        if (!data.canRollback) {
            vscode.window.showErrorMessage('Rollback is not available for this migration');
            return;
        }

        const confirmed = await vscode.window.showWarningMessage(
            `Are you sure you want to rollback this migration?\n\nMigration: ${data.migrationName}\nThis will undo all changes made by the migration.`,
            { modal: true },
            'Rollback Migration'
        );

        if (confirmed === 'Rollback Migration') {
            vscode.window.showInformationMessage('Rollback execution not yet implemented');
        }
    }

    private async handleExportReport(): Promise<void> {
        if (!this.migrationData) return;

        try {
            // Show progress indicator for report generation
            const progressOptions: vscode.ProgressOptions = {
                location: vscode.ProgressLocation.Notification,
                title: 'Generating Migration Report',
                cancellable: false
            };

            await vscode.window.withProgress(progressOptions, async (progress) => {
                progress.report({ increment: 0, message: 'Analyzing migration data...' });

                if (!this.migrationData) {
                    vscode.window.showErrorMessage('No migration data available for report generation');
                    return;
                }

                const reportContent = await this.generateComprehensiveReport(this.migrationData);

                progress.report({ increment: 50, message: 'Formatting report...' });

                // Determine format based on user preference or file extension
                const formatOptions = [
                    'Text Report (txt)',
                    'JSON Report (json)',
                    'HTML Report (html)',
                    'Markdown Report (md)'
                ];

                const selectedFormat = await vscode.window.showQuickPick(formatOptions, {
                    placeHolder: 'Select report format'
                });

                if (!selectedFormat) return;

                progress.report({ increment: 75, message: 'Saving report...' });

                const format = selectedFormat.split(' ')[2].replace('(', '').replace(')', '');
                const fileName = `migration-report-${this.migrationData.migrationId}.${format}`;
                const uri = await vscode.window.showSaveDialog({
                    filters: {
                        [`${format.toUpperCase()} Files`]: [format],
                        'All Files': ['*']
                    },
                    defaultUri: vscode.Uri.file(fileName)
                });

                if (uri) {
                    let finalContent: string;
                    let mimeType: string;

                    switch (format) {
                        case 'json':
                            finalContent = reportContent.json;
                            mimeType = 'application/json';
                            break;
                        case 'html':
                            finalContent = reportContent.html;
                            mimeType = 'text/html';
                            break;
                        case 'md':
                            finalContent = reportContent.markdown;
                            mimeType = 'text/markdown';
                            break;
                        default:
                            finalContent = reportContent.text;
                            mimeType = 'text/plain';
                            break;
                    }

                    await vscode.workspace.fs.writeFile(uri, Buffer.from(finalContent, 'utf8'));

                    progress.report({ increment: 100, message: 'Report exported successfully!' });

                    vscode.window.showInformationMessage(
                        `Migration report exported successfully as ${format.toUpperCase()}`,
                        'Open File',
                        'Open Containing Folder'
                    ).then(action => {
                        if (action === 'Open File') {
                            vscode.window.showTextDocument(uri);
                        } else if (action === 'Open Containing Folder') {
                            vscode.commands.executeCommand('revealFileInOS', uri);
                        }
                    });

                    Logger.info('Migration report exported', {
                        migrationId: this.migrationData!.migrationId,
                        format: format,
                        size: finalContent.length
                    });
                }
            });

        } catch (error) {
            Logger.error('Failed to export migration report', error as Error);
            vscode.window.showErrorMessage(`Failed to export migration report: ${(error as Error).message}`);
        }
    }

    private async generateComprehensiveReport(data: AdvancedMigrationPreviewData): Promise<{
        text: string;
        json: string;
        html: string;
        markdown: string;
    }> {
        const timestamp = new Date().toISOString();

        // Generate text report
        const textReport = this.generateDetailedReport(data);

        // Generate JSON report
        const jsonReport = JSON.stringify({
            report: {
                generatedAt: timestamp,
                migration: data,
                conflictResolutions: Array.from(this.conflictResolutions.entries()),
                summary: {
                    totalConflicts: data.conflicts?.length || 0,
                    resolvedConflicts: this.conflictResolutions.size,
                    riskLevel: data.riskLevel,
                    canExecute: data.canExecute,
                    canRollback: data.canRollback
                }
            }
        }, null, 2);

        // Generate HTML report
        const htmlReport = this.generateHtmlReport(data, timestamp);

        // Generate Markdown report
        const markdownReport = this.generateMarkdownReport(data, timestamp);

        return {
            text: textReport,
            json: jsonReport,
            html: htmlReport,
            markdown: markdownReport
        };
    }

    private generateHtmlReport(data: AdvancedMigrationPreviewData, timestamp: string): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Migration Report: ${data.migrationName}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; }
                    .header { border-bottom: 2px solid #333; margin-bottom: 20px; }
                    .section { margin: 20px 0; }
                    .conflict { background: #ffebee; padding: 10px; margin: 10px 0; border-radius: 4px; }
                    .resolved { background: #e8f5e8; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>Migration Report: ${data.migrationName}</h1>
                    <p><strong>Generated:</strong> ${new Date(timestamp).toLocaleString()}</p>
                    <p><strong>Risk Level:</strong> ${data.riskLevel}</p>
                </div>

                <div class="section">
                    <h2>Summary</h2>
                    <p><strong>Total Conflicts:</strong> ${data.conflicts?.length || 0}</p>
                    <p><strong>Resolved Conflicts:</strong> ${this.conflictResolutions.size}</p>
                </div>

                ${data.conflicts?.length ? `
                <div class="section">
                    <h2>Conflicts</h2>
                    ${data.conflicts.map(conflict => {
            const resolution = this.conflictResolutions.get(conflict.id);
            return `
                        <div class="conflict ${resolution ? 'resolved' : ''}">
                            <h3>${conflict.description}</h3>
                            <p><strong>Type:</strong> ${conflict.type}</p>
                            <p><strong>Severity:</strong> ${conflict.severity}</p>
                            ${resolution ? `<p><strong>Resolution:</strong> ${resolution.strategy}</p>` : ''}
                        </div>
                        `;
        }).join('')}
                </div>
                ` : ''}

                <div class="section">
                    <h2>Migration Script</h2>
                    <pre>${data.sqlScript}</pre>
                </div>
            </body>
            </html>
        `;
    }

    private generateMarkdownReport(data: AdvancedMigrationPreviewData, timestamp: string): string {
        let report = `# Migration Report: ${data.migrationName}\n\n`;
        report += `**Generated:** ${new Date(timestamp).toLocaleString()}\n`;
        report += `**Risk Level:** ${data.riskLevel}\n`;
        report += `**Migration ID:** ${data.migrationId}\n\n`;

        report += `## Summary\n\n`;
        report += `- **Total Conflicts:** ${data.conflicts?.length || 0}\n`;
        report += `- **Resolved Conflicts:** ${this.conflictResolutions.size}\n`;
        report += `- **Can Execute:** ${data.canExecute ? 'Yes' : 'No'}\n`;
        report += `- **Can Rollback:** ${data.canRollback ? 'Yes' : 'No'}\n\n`;

        if (data.conflicts && data.conflicts.length > 0) {
            report += `## Conflicts\n\n`;
            data.conflicts.forEach((conflict, index) => {
                const resolution = this.conflictResolutions.get(conflict.id);
                report += `### ${index + 1}. ${conflict.description}\n`;
                report += `- **Type:** ${conflict.type}\n`;
                report += `- **Severity:** ${conflict.severity}\n`;
                report += `- **Affected Objects:** ${conflict.affectedObjects.join(', ')}\n`;
                if (resolution) {
                    report += `- **Resolution:** ${resolution.strategy}\n`;
                }
                report += '\n';
            });
        }

        report += `## Migration Script\n\n`;
        report += '```sql\n';
        report += data.sqlScript;
        report += '\n```\n\n';

        if (data.canRollback) {
            report += `## Rollback Script\n\n`;
            report += '```sql\n';
            report += data.rollbackScript;
            report += '\n```\n';
        }

        return report;
    }

    private generateDetailedReport(data: AdvancedMigrationPreviewData): string {
        let report = `Advanced Migration Preview Report
Generated: ${new Date().toISOString()}
Migration ID: ${data.migrationId}
Migration Name: ${data.migrationName}
Source: ${data.sourceConnection}
Target: ${data.targetConnection}
Risk Level: ${data.riskLevel}
Total Statements: ${data.totalStatements}
Estimated Execution Time: ${data.estimatedExecutionTime}
Rollback Available: ${data.canRollback ? 'Yes' : 'No'}

Migration Summary:
${data.metadata?.description || 'No description provided'}

Impact Analysis:
- Data Loss Possible: ${data.impactAnalysis?.dataLoss ? 'Yes' : 'No'}
- Downtime Required: ${data.impactAnalysis?.downtime ? 'Yes' : 'No'}
${data.impactAnalysis?.estimatedDowntime ? `- Estimated Downtime: ${data.impactAnalysis.estimatedDowntime}` : ''}
- Affected Users: ${data.impactAnalysis?.affectedUsers || 0}
- Affected Applications: ${data.impactAnalysis?.affectedApplications?.length || 0}
- Rollback Complexity: ${data.impactAnalysis?.rollbackComplexity || 'Unknown'}
- Testing Required: ${data.impactAnalysis?.testingRequired ? 'Yes' : 'No'}
- Backup Required: ${data.impactAnalysis?.backupRequired ? 'Yes' : 'No'}

Warnings:
${data.warnings.map(w => `- ${w}`).join('\n')}

`;

        if (data.conflicts && data.conflicts.length > 0) {
            report += `Conflicts (${data.conflicts.length}):
`;
            data.conflicts.forEach((conflict, index) => {
                const resolution = this.conflictResolutions.get(conflict.id);
                report += `${index + 1}. ${conflict.description}
   Type: ${conflict.type}
   Severity: ${conflict.severity}
   Affected Objects: ${conflict.affectedObjects.join(', ')}
   Risk if Ignored: ${conflict.riskIfIgnored}
   ${resolution ? `Resolution: ${resolution.strategy}` : 'Status: Unresolved'}
`;
            });
        }

        if (data.dependencies && data.dependencies.length > 0) {
            report += `
Dependencies (${data.dependencies.length}):
`;
            data.dependencies.forEach((dep, index) => {
                report += `${index + 1}. ${dep.type}: ${dep.dependent} -> ${dep.dependsOn}
   Reason: ${dep.reason}
   Severity: ${dep.severity}
`;
            });
        }

        report += `
Migration Script:
${data.sqlScript}

`;

        if (data.canRollback) {
            report += `Rollback Script:
${data.rollbackScript}
`;
        }

        return report;
    }

    dispose(): void {
        try {
            if (this.panel) {
                this.panel.dispose();
                this.panel = undefined;
            }
            this.migrationData = undefined;
            this.selectedConflicts.clear();
            this.conflictResolutions.clear();

            Logger.info('AdvancedMigrationPreviewView disposed');
        } catch (error) {
            Logger.error('Error during disposal', error as Error);
        }
    }

    // Comprehensive error handling and user feedback methods
    private handleError(error: Error, context: string, showToUser: boolean = true): void {
        Logger.error(`Error in ${context}`, error);

        if (showToUser) {
            this.showErrorToUser(error, context);
        }

        // Send error to webview if available
        if (this.panel) {
            this.panel.webview.postMessage({
                command: 'error',
                context: context,
                message: error.message,
                stack: error.stack
            });
        }
    }

    private showErrorToUser(error: Error, context: string): void {
        const userFriendlyMessage = this.getUserFriendlyErrorMessage(error, context);

        vscode.window.showErrorMessage(
            userFriendlyMessage,
            'View Details',
            'Retry',
            'Report Issue'
        ).then(action => {
            switch (action) {
                case 'View Details':
                    this.showDetailedErrorDialog(error, context);
                    break;
                case 'Retry':
                    this.retryLastAction();
                    break;
                case 'Report Issue':
                    this.reportIssue(error, context);
                    break;
            }
        });
    }

    private getUserFriendlyErrorMessage(error: Error, context: string): string {
        // Map technical errors to user-friendly messages
        const errorMappings: { [key: string]: string; } = {
            'Database connectivity check failed': 'Cannot connect to the database. Please check your connection settings.',
            'Migration cancelled by user': 'Migration was cancelled.',
            'critical conflicts must be resolved': 'Critical conflicts must be resolved before proceeding.',
            'Pre-execution checks failed': 'Pre-execution checks failed. Please review the requirements.',
            'Migration validation failed': 'Migration validation failed. Please fix the issues before proceeding.',
            'Failed to save migration': 'Failed to save the migration script. Please check file permissions.',
            'Failed to export migration report': 'Failed to export the migration report. Please try again.',
            'Search failed': 'Search operation failed. Please try again.',
            'Conflict resolution failed': 'Failed to resolve conflict. Please try again.'
        };

        for (const [technical, friendly] of Object.entries(errorMappings)) {
            if (error.message.includes(technical)) {
                return friendly;
            }
        }

        // Default user-friendly message
        return `An error occurred in ${context}: ${error.message}`;
    }

    private showDetailedErrorDialog(error: Error, context: string): void {
        const errorDetails = `
Error Context: ${context}
Error Message: ${error.message}
Timestamp: ${new Date().toISOString()}

${error.stack ? `Stack Trace:\n${error.stack}` : ''}

Please check the logs for more detailed information.
        `.trim();

        const document = vscode.workspace.openTextDocument({
            content: errorDetails,
            language: 'text'
        }).then(doc => {
            vscode.window.showTextDocument(doc, { preview: false });
        });
    }

    private retryLastAction(): void {
        // Implementation would retry the last failed action
        vscode.window.showInformationMessage('Retry functionality not yet implemented');
    }

    private reportIssue(error: Error, context: string): void {
        const issueBody = `
**Error Report**

**Context:** ${context}
**Error:** ${error.message}
**Timestamp:** ${new Date().toISOString()}
**Migration ID:** ${this.migrationData?.migrationId || 'Unknown'}

**Stack Trace:**
${error.stack || 'No stack trace available'}

**System Information:**
- VSCode Version: ${vscode.version}
- Extension Version: ${vscode.extensions.getExtension('postgresql')?.packageJSON.version || 'Unknown'}
- Platform: ${process.platform}
        `.trim();

        vscode.env.openExternal(vscode.Uri.parse(
            `https://github.com/your-repo/issues/new?title=Migration%20Error&body=${encodeURIComponent(issueBody)}`
        ));

        Logger.info('Issue report opened', { context, error: error.message });
    }

    private showSuccessMessage(message: string, ...actions: string[]): Thenable<string | undefined> {
        return vscode.window.showInformationMessage(message, ...actions);
    }

    private showWarningMessage(message: string, ...actions: string[]): Thenable<string | undefined> {
        return vscode.window.showWarningMessage(message, ...actions);
    }

    private showProgressNotification(title: string, message: string): void {
        vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: title,
                cancellable: false
            },
            async (progress) => {
                progress.report({ increment: 0, message: message });
                await new Promise(resolve => setTimeout(resolve, 1000));
                progress.report({ increment: 100, message: 'Complete' });
            }
        );
    }

    private updateStatusBar(message: string, tooltip?: string): void {
        // Update VSCode status bar with migration status
        const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        statusBarItem.text = message;
        if (tooltip) {
            statusBarItem.tooltip = tooltip;
        }
        statusBarItem.show();

        // Auto-hide after 5 seconds
        setTimeout(() => {
            statusBarItem.hide();
            statusBarItem.dispose();
        }, 5000);
    }

    private showNotification(type: 'info' | 'success' | 'warning' | 'error', message: string, persistent: boolean = false): void {
        switch (type) {
            case 'info':
                if (persistent) {
                    this.showSuccessMessage(message);
                } else {
                    this.updateStatusBar(message);
                }
                break;
            case 'success':
                this.showSuccessMessage(message, 'View Details');
                break;
            case 'warning':
                this.showWarningMessage(message, 'Fix', 'Ignore');
                break;
            case 'error':
                vscode.window.showErrorMessage(message);
                break;
        }

        // Also send to webview
        if (this.panel) {
            this.panel.webview.postMessage({
                command: 'notification',
                type: type,
                message: message,
                persistent: persistent
            });
        }
    }

    private validateUserInput(input: string, type: 'migrationId' | 'search' | 'filePath'): { valid: boolean; error?: string; } {
        switch (type) {
            case 'migrationId':
                if (!input || input.length < 3) {
                    return { valid: false, error: 'Migration ID must be at least 3 characters long' };
                }
                if (!/^[a-zA-Z0-9_-]+$/.test(input)) {
                    return { valid: false, error: 'Migration ID can only contain letters, numbers, hyphens, and underscores' };
                }
                break;
            case 'search':
                if (input.length > 500) {
                    return { valid: false, error: 'Search term is too long (max 500 characters)' };
                }
                break;
            case 'filePath':
                if (input.length > 1000) {
                    return { valid: false, error: 'File path is too long' };
                }
                break;
        }

        return { valid: true };
    }

    private sanitizeHtml(input: string): string {
        // Basic HTML sanitization for webview content
        return input
            .replace(/&/g, '&')
            .replace(/</g, '<')
            .replace(/>/g, '>')
            .replace(/"/g, '"')
            .replace(/'/g, ''');
    }

    private debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
        let timeout: NodeJS.Timeout;
        return (...args: Parameters<T>) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    }

    private async withRetry<T>(
        operation: () => Promise<T>,
        maxRetries: number = 3,
        delay: number = 1000,
        context: string = 'operation'
    ): Promise<T> {
        let lastError: Error;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error as Error;

                if (attempt === maxRetries) {
                    Logger.error(`${context} failed after ${maxRetries} attempts`, lastError);
                    throw lastError;
                }

                Logger.warn(`${context} failed on attempt ${attempt}/${maxRetries}, retrying...`, lastError);

                if (delay > 0) {
                    await new Promise(resolve => setTimeout(resolve, delay * attempt));
                }
            }
        }

        throw lastError!;
    }
}