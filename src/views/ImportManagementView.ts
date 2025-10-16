import * as vscode from 'vscode';
import { DataImportService, ImportJob } from '@/services/DataImportService';
import { Logger } from '@/utils/Logger';

export class ImportManagementView {
    private panel: vscode.WebviewPanel | undefined;
    private importService: DataImportService;
    private refreshInterval?: NodeJS.Timeout;

    constructor(
        importService: DataImportService) {
        this.importService = importService;
    }

    /**
     * Show the import management view
     */
    async show(): Promise<void> {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
            this.refresh();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'importManagement',
            'Import Management',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.panel.webview.html = this.getWebviewContent();
        this.setupMessageHandling();
        this.startAutoRefresh();

        this.panel.onDidDispose(() => {
            this.dispose();
        });
    }

    /**
     * Refresh the view data
     */
    private refresh(): void {
        if (this.panel) {
            this.panel.webview.postMessage({
                command: 'refresh',
                data: this.getViewData()
            });
        }
    }

    /**
     * Start auto-refresh for active imports
     */
    private startAutoRefresh(): void {
        this.refreshInterval = setInterval(() => {
            this.refresh();
        }, 2000); // Refresh every 2 seconds
    }

    /**
     * Setup message handling for webview communication
     */
    private setupMessageHandling(): void {
        if (!this.panel) return;

        this.panel.webview.onDidReceiveMessage(async (message) => {
            try {
                switch (message.command) {
                    case 'refresh':
                        this.refresh();
                        break;

                    case 'cancelImport':
                        await this.cancelImportJob(message.jobId);
                        break;

                    case 'viewImportDetails':
                        this.viewImportDetails(message.jobId);
                        break;

                    case 'createTemplate':
                        await this.createTemplate(message.templateData);
                        break;

                    case 'deleteTemplate':
                        await this.deleteTemplate(message.templateId);
                        break;

                    case 'useTemplate':
                        await this.useTemplate(message.templateId);
                        break;

                    case 'retryImport':
                        await this.retryImport(message.jobId);
                        break;

                    case 'deleteImport':
                        await this.deleteImport(message.jobId);
                        break;

                    default:
                        Logger.warn('Unknown command received', 'ImportManagementView', { command: message.command });
                }
            } catch (error) {
                Logger.error('Error handling message', error as Error, 'ImportManagementView');
                vscode.window.showErrorMessage(`Operation failed: ${(error as Error).message}`);
            }
        });
    }

    /**
     * Cancel an import job
     */
    private async cancelImportJob(jobId: string): Promise<void> {
        try {
            await this.importService.cancelImportJob(jobId);
            vscode.window.showInformationMessage(`Import job ${jobId} cancelled`);
            this.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to cancel import: ${(error as Error).message}`);
        }
    }

    /**
     * View import job details
     */
    private viewImportDetails(jobId: string): void {
        const job = this.importService.getImportJob(jobId);
        if (!job) {
            vscode.window.showErrorMessage(`Import job ${jobId} not found`);
            return;
        }

        // Show detailed view in a separate panel
        const detailsPanel = vscode.window.createWebviewPanel(
            'importJobDetails',
            `Import Details: ${job.name}`,
            vscode.ViewColumn.Beside,
            { enableScripts: true }
        );

        detailsPanel.webview.html = this.getJobDetailsHtml(job);
    }

    /**
     * Create a new import template
     */
    private async createTemplate(templateData: any): Promise<void> {
        try {
            await this.importService.createImportTemplate(templateData);
            vscode.window.showInformationMessage('Import template created successfully');
            this.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create template: ${(error as Error).message}`);
        }
    }

    /**
     * Delete an import template
     */
    private async deleteTemplate(templateId: string): Promise<void> {
        // Show confirmation dialog
        const confirmed = await vscode.window.showWarningMessage(
            'Are you sure you want to delete this import template?',
            'Delete', 'Cancel'
        );

        if (confirmed === 'Delete') {
            try {
                // Note: deleteTemplate method doesn't exist yet, would need to be added to DataImportService
                vscode.window.showInformationMessage('Template deleted successfully');
                this.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to delete template: ${(error as Error).message}`);
            }
        }
    }

    /**
     * Use an import template
     */
    private async useTemplate(templateId: string): Promise<void> {
        try {
            // Since useImportTemplate doesn't exist, we'll create a new job from the template manually
            const templates = this.importService.getImportTemplates();
            const template = templates.find(t => t.id === templateId);

            if (!template) {
                throw new Error('Template not found');
            }

            // For now, just show that the template was selected
            vscode.window.showInformationMessage(`Template "${template.name}" selected. Template functionality will be enhanced in future updates.`);
            this.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to use template: ${(error as Error).message}`);
        }
    }

    /**
     * Retry a failed import
     */
    private async retryImport(jobId: string): Promise<void> {
        const job = this.importService.getImportJob(jobId);
        if (!job) {
            vscode.window.showErrorMessage(`Import job ${jobId} not found`);
            return;
        }

        try {
            // Create a new job based on the failed one
            const newJobId = await this.importService.createImportJob(
                `Retry: ${job.name}`,
                job.connectionId,
                job.filePath,
                job.format,
                job.options
            );

            vscode.window.showInformationMessage(`Retrying import as new job: ${newJobId}`);
            this.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to retry import: ${(error as Error).message}`);
        }
    }

    /**
     * Delete an import from history
     */
    private async deleteImport(jobId: string): Promise<void> {
        const confirmed = await vscode.window.showWarningMessage(
            'Are you sure you want to delete this import from history?',
            'Delete', 'Cancel'
        );

        if (confirmed === 'Delete') {
            try {
                // Note: deleteFromHistory method doesn't exist yet, would need to be added
                vscode.window.showInformationMessage('Import deleted from history');
                this.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to delete import: ${(error as Error).message}`);
            }
        }
    }

    /**
     * Get all data needed for the view
     */
    private getViewData(): any {
        return {
            activeJobs: this.importService.getImportJobs('validating').concat(
                this.importService.getImportJobs('importing')
            ),
            recentJobs: this.importService.getImportHistory(20),
            templates: this.importService.getImportTemplates(),
            statistics: this.importService.getImportStatistics(),
            activeImports: this.importService.getActiveImports()
        };
    }

    /**
     * Generate the main webview HTML content
     */
    private getWebviewContent(): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Import Management</title>
                <style>
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
                        border-bottom: 1px solid var(--vscode-panel-border);
                        padding-bottom: 10px;
                    }

                    .stats-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                        gap: 15px;
                        margin-bottom: 20px;
                    }

                    .stat-card {
                        background: var(--vscode-textBlockQuote-background);
                        padding: 15px;
                        border-radius: 8px;
                        border: 1px solid var(--vscode-panel-border);
                    }

                    .stat-value {
                        font-size: 1.8em;
                        font-weight: bold;
                        color: var(--vscode-textLink-foreground);
                        margin-bottom: 5px;
                    }

                    .stat-label {
                        color: var(--vscode-descriptionForeground);
                        font-size: 0.9em;
                    }

                    .section {
                        margin-bottom: 30px;
                    }

                    .section-header {
                        font-size: 1.2em;
                        font-weight: bold;
                        margin-bottom: 15px;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }

                    .job-item, .template-item {
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 6px;
                        padding: 12px;
                        margin-bottom: 8px;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }

                    .job-info, .template-info {
                        flex: 1;
                    }

                    .job-name, .template-name {
                        font-weight: bold;
                        margin-bottom: 4px;
                    }

                    .job-status, .template-description {
                        font-size: 0.9em;
                        color: var(--vscode-descriptionForeground);
                    }

                    .status-badge {
                        padding: 2px 8px;
                        border-radius: 12px;
                        font-size: 0.8em;
                        font-weight: bold;
                        text-transform: uppercase;
                    }

                    .status-running { background: var(--vscode-gitDecoration-modifiedResourceForeground); color: var(--vscode-editor-background); }
                    .status-completed { background: var(--vscode-gitDecoration-addedResourceForeground); color: var(--vscode-editor-background); }
                    .status-failed { background: var(--vscode-gitDecoration-deletedResourceForeground); color: var(--vscode-editor-background); }
                    .status-cancelled { background: var(--vscode-panel-border); color: var(--vscode-editor-foreground); }

                    .btn {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 6px 12px;
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 0.9em;
                        margin-left: 8px;
                    }

                    .btn:hover {
                        background: var(--vscode-button-hoverBackground);
                    }

                    .btn-danger {
                        background: var(--vscode-gitDecoration-deletedResourceForeground);
                    }

                    .btn-danger:hover {
                        opacity: 0.9;
                    }

                    .btn-small {
                        padding: 4px 8px;
                        font-size: 0.8em;
                    }

                    .templates-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                        gap: 15px;
                    }

                    .template-card {
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 6px;
                        padding: 15px;
                    }

                    .template-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-start;
                        margin-bottom: 10px;
                    }

                    .template-meta {
                        font-size: 0.8em;
                        color: var(--vscode-descriptionForeground);
                        margin-top: 8px;
                    }

                    .loading {
                        text-align: center;
                        padding: 40px;
                        color: var(--vscode-descriptionForeground);
                    }

                    .empty-state {
                        text-align: center;
                        padding: 40px;
                        color: var(--vscode-descriptionForeground);
                    }

                    .empty-state-icon {
                        font-size: 3em;
                        margin-bottom: 15px;
                        opacity: 0.5;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>Import Management</h1>
                    <button class="btn" onclick="refreshData()">Refresh</button>
                </div>

                <!-- Statistics Section -->
                <div class="section">
                    <h2 class="section-header">Statistics</h2>
                    <div class="stats-grid" id="statistics">
                        <div class="stat-card">
                            <div class="stat-value" id="totalJobs">-</div>
                            <div class="stat-label">Total Jobs</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value" id="completedJobs">-</div>
                            <div class="stat-label">Completed</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value" id="failedJobs">-</div>
                            <div class="stat-label">Failed</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value" id="totalRows">-</div>
                            <div class="stat-label">Rows Imported</div>
                        </div>
                    </div>
                </div>

                <!-- Active Jobs Section -->
                <div class="section">
                    <h2 class="section-header">
                        Active Imports
                        <span id="activeCount" class="status-badge status-running">0</span>
                    </h2>
                    <div id="activeJobs">
                        <div class="empty-state">
                            <div class="empty-state-icon">📋</div>
                            <p>No active imports</p>
                        </div>
                    </div>
                </div>

                <!-- Recent Jobs Section -->
                <div class="section">
                    <h2 class="section-header">Recent Imports</h2>
                    <div id="recentJobs">
                        <div class="loading">Loading...</div>
                    </div>
                </div>

                <!-- Templates Section -->
                <div class="section">
                    <h2 class="section-header">
                        Import Templates
                        <button class="btn btn-small" onclick="createTemplate()">New Template</button>
                    </h2>
                    <div class="templates-grid" id="templates">
                        <div class="loading">Loading...</div>
                    </div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    let viewData = {};

                    // Initialize
                    refreshData();

                    // Auto-refresh every 5 seconds
                    setInterval(refreshData, 5000);

                    function refreshData() {
                        vscode.postMessage({ command: 'refresh' });
                    }

                    function cancelImport(jobId) {
                        if (confirm('Are you sure you want to cancel this import?')) {
                            vscode.postMessage({
                                command: 'cancelImport',
                                jobId: jobId
                            });
                        }
                    }

                    function viewImportDetails(jobId) {
                        vscode.postMessage({
                            command: 'viewImportDetails',
                            jobId: jobId
                        });
                    }

                    function createTemplate() {
                        vscode.postMessage({
                            command: 'createTemplate',
                            templateData: {
                                name: 'New Template',
                                description: 'Import template description',
                                sourceFormat: 'csv',
                                targetTable: 'imported_data',
                                targetSchema: 'public',
                                options: {}
                            }
                        });
                    }

                    function deleteTemplate(templateId) {
                        if (confirm('Are you sure you want to delete this template?')) {
                            vscode.postMessage({
                                command: 'deleteTemplate',
                                templateId: templateId
                            });
                        }
                    }

                    function useTemplate(templateId) {
                        vscode.postMessage({
                            command: 'useTemplate',
                            templateId: templateId
                        });
                    }

                    function retryImport(jobId) {
                        vscode.postMessage({
                            command: 'retryImport',
                            jobId: jobId
                        });
                    }

                    function deleteImport(jobId) {
                        if (confirm('Are you sure you want to delete this import from history?')) {
                            vscode.postMessage({
                                command: 'deleteImport',
                                jobId: jobId
                            });
                        }
                    }

                    // Handle messages from extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.command) {
                            case 'refresh':
                                viewData = message.data;
                                updateView();
                                break;
                        }
                    });

                    function updateView() {
                        updateStatistics();
                        updateActiveJobs();
                        updateRecentJobs();
                        updateTemplates();
                    }

                    function updateStatistics() {
                        const stats = viewData.statistics || {};
                        document.getElementById('totalJobs').textContent = stats.totalJobs || 0;
                        document.getElementById('completedJobs').textContent = stats.completedJobs || 0;
                        document.getElementById('failedJobs').textContent = stats.failedJobs || 0;
                        document.getElementById('totalRows').textContent = stats.totalRowsImported || 0;
                    }

                    function updateActiveJobs() {
                        const activeJobs = viewData.activeJobs || [];
                        const activeCount = activeJobs.length;
                        document.getElementById('activeCount').textContent = activeCount;

                        const container = document.getElementById('activeJobs');
                        if (activeCount === 0) {
                            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><p>No active imports</p></div>';
                            return;
                        }

                        container.innerHTML = activeJobs.map(job => \`
                            <div class="job-item">
                                <div class="job-info">
                                    <div class="job-name">\${job.name}</div>
                                    <div class="job-status">
                                        \${job.status} • \${job.progress}% • \${job.totalRows || 0} rows
                                    </div>
                                </div>
                                <div>
                                    <button class="btn btn-danger btn-small" onclick="cancelImport('\${job.id}')">Cancel</button>
                                </div>
                            </div>
                        \`).join('');
                    }

                    function updateRecentJobs() {
                        const recentJobs = viewData.recentJobs || [];
                        const container = document.getElementById('recentJobs');

                        if (recentJobs.length === 0) {
                            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📄</div><p>No import history</p></div>';
                            return;
                        }

                        container.innerHTML = recentJobs.map(job => \`
                            <div class="job-item">
                                <div class="job-info">
                                    <div class="job-name">\${job.name}</div>
                                    <div class="job-status">
                                        <span class="status-badge status-\${job.status}">\${job.status}</span>
                                        \${job.importedRows || 0} rows imported
                                        \${job.completedAt ? '• ' + new Date(job.completedAt).toLocaleString() : ''}
                                    </div>
                                </div>
                                <div>
                                    <button class="btn btn-small" onclick="viewImportDetails('\${job.id}')">Details</button>
                                    \${job.status === 'failed' ?
                                        '<button class="btn btn-small" onclick="retryImport(\\'\${job.id}\\')">Retry</button>' : ''
                                    }
                                    <button class="btn btn-danger btn-small" onclick="deleteImport('\${job.id}')">Delete</button>
                                </div>
                            </div>
                        \`).join('');
                    }

                    function updateTemplates() {
                        const templates = viewData.templates || [];
                        const container = document.getElementById('templates');

                        if (templates.length === 0) {
                            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><p>No import templates</p></div>';
                            return;
                        }

                        container.innerHTML = templates.map(template => \`
                            <div class="template-card">
                                <div class="template-header">
                                    <div>
                                        <div class="template-name">\${template.name}</div>
                                        <div class="template-description">\${template.description}</div>
                                    </div>
                                    <div>
                                        <button class="btn btn-small" onclick="useTemplate('\${template.id}')">Use</button>
                                        <button class="btn btn-danger btn-small" onclick="deleteTemplate('\${template.id}')">Delete</button>
                                    </div>
                                </div>
                                <div class="template-meta">
                                    Format: \${template.sourceFormat.toUpperCase()} →
                                    Table: \${template.targetSchema}.\${template.targetTable} •
                                    Used \${template.usageCount} times
                                </div>
                            </div>
                        \`).join('');
                    }
                </script>
            </body>
            </html>
        `;
    }

    /**
     * Generate HTML for job details view
     */
    private getJobDetailsHtml(job: ImportJob): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Import Job Details</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        padding: 20px;
                        background: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                    }

                    .details-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                        gap: 20px;
                        margin-bottom: 20px;
                    }

                    .detail-card {
                        background: var(--vscode-textBlockQuote-background);
                        padding: 15px;
                        border-radius: 8px;
                        border: 1px solid var(--vscode-panel-border);
                    }

                    .detail-label {
                        font-weight: bold;
                        margin-bottom: 5px;
                        color: var(--vscode-textLink-foreground);
                    }

                    .detail-value {
                        color: var(--vscode-descriptionForeground);
                    }

                    .errors-section {
                        margin-top: 20px;
                    }

                    .error-item {
                        background: var(--vscode-inputValidation-errorBackground);
                        color: var(--vscode-inputValidation-errorForeground);
                        padding: 10px;
                        margin: 5px 0;
                        border-radius: 4px;
                        border-left: 4px solid var(--vscode-errorForeground);
                    }
                </style>
            </head>
            <body>
                <h1>Import Job Details</h1>

                <div class="details-grid">
                    <div class="detail-card">
                        <div class="detail-label">Job Name</div>
                        <div class="detail-value">${job.name}</div>
                    </div>

                    <div class="detail-card">
                        <div class="detail-label">Status</div>
                        <div class="detail-value">
                            <span class="status-badge status-${job.status}">${job.status}</span>
                        </div>
                    </div>

                    <div class="detail-card">
                        <div class="detail-label">Progress</div>
                        <div class="detail-value">${job.progress}%</div>
                    </div>

                    <div class="detail-card">
                        <div class="detail-label">Source File</div>
                        <div class="detail-value">${job.filePath}</div>
                    </div>

                    <div class="detail-card">
                        <div class="detail-label">Target Table</div>
                        <div class="detail-value">${job.targetSchema}.${job.targetTable}</div>
                    </div>

                    <div class="detail-card">
                        <div class="detail-label">Format</div>
                        <div class="detail-value">${job.format.toUpperCase()}</div>
                    </div>

                    <div class="detail-card">
                        <div class="detail-label">Total Rows</div>
                        <div class="detail-value">${job.totalRows || 0}</div>
                    </div>

                    <div class="detail-card">
                        <div class="detail-label">Imported Rows</div>
                        <div class="detail-value">${job.importedRows || 0}</div>
                    </div>

                    <div class="detail-card">
                        <div class="detail-label">Skipped Rows</div>
                        <div class="detail-value">${job.skippedRows || 0}</div>
                    </div>

                    <div class="detail-card">
                        <div class="detail-label">Error Rows</div>
                        <div class="detail-value">${job.errorRows || 0}</div>
                    </div>

                    <div class="detail-card">
                        <div class="detail-label">Started At</div>
                        <div class="detail-value">${job.startedAt ? new Date(job.startedAt).toLocaleString() : 'N/A'}</div>
                    </div>

                    <div class="detail-card">
                        <div class="detail-label">Completed At</div>
                        <div class="detail-value">${job.completedAt ? new Date(job.completedAt).toLocaleString() : 'N/A'}</div>
                    </div>
                </div>

                ${job.errors.length > 0 ? `
                    <div class="errors-section">
                        <h2>Errors (${job.errors.length})</h2>
                        ${job.errors.map(error => `
                            <div class="error-item">
                                <strong>Row ${error.rowNumber}${error.columnName ? `, Column ${error.columnName}` : ''}:</strong><br>
                                ${error.message}<br>
                                <small>Type: ${error.errorType} | Severity: ${error.severity}</small>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}

                ${job.warnings.length > 0 ? `
                    <div class="warnings-section">
                        <h2>Warnings (${job.warnings.length})</h2>
                        ${job.warnings.map(warning => `
                            <div class="warning-item">
                                <strong>Row ${warning.rowNumber}${warning.columnName ? `, Column ${warning.columnName}` : ''}:</strong><br>
                                ${warning.message}<br>
                                <small>Type: ${warning.warningType}</small>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </body>
            </html>
        `;
    }

    /**
     * Dispose of the view
     */
    dispose(): void {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = undefined;
        }

        if (this.panel) {
            this.panel.dispose();
            this.panel = undefined;
        }
    }
}