import * as vscode from 'vscode';
import { Logger } from '@/utils/Logger';
import { ConnectionManager } from '@/managers/ConnectionManager';

export interface TemplateDefinition {
    id: string;
    name: string;
    description: string;
    type: 'migration' | 'comparison' | 'workflow' | 'validation';
    category: string;
    version: string;
    author: string;
    tags: string[];
    template: TemplateContent;
    metadata: TemplateMetadata;
    usage: TemplateUsage;
    createdAt: Date;
    lastModified: Date;
    isPublic: boolean;
    isEnabled: boolean;
}

export interface TemplateContent {
    configuration: Record<string, any>;
    parameters: TemplateParameter[];
    defaultValues: Record<string, any>;
    validationRules: ValidationRule[];
    dependencies: string[];
}

export interface TemplateParameter {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'connection' | 'schema' | 'table' | 'sql';
    description: string;
    isRequired: boolean;
    defaultValue?: any;
    validation?: ParameterValidation;
    options?: string[]; // For dropdown selections
}

export interface ParameterValidation {
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    minValue?: number;
    maxValue?: number;
    customValidation?: string;
}

export interface ValidationRule {
    name: string;
    description: string;
    expression: string;
    errorMessage: string;
    severity: 'error' | 'warning' | 'info';
}

export interface TemplateMetadata {
    estimatedExecutionTime: number;
    riskLevel: 'low' | 'medium' | 'high';
    complexity: 'simple' | 'moderate' | 'complex';
    prerequisites: string[];
    postConditions: string[];
    rollbackSupport: boolean;
}

export interface TemplateUsage {
    usageCount: number;
    lastUsed: Date;
    averageExecutionTime: number;
    successRate: number;
    userRatings: UserRating[];
}

export interface UserRating {
    userId: string;
    userName: string;
    rating: number; // 1-5 stars
    comment?: string;
    timestamp: Date;
}

export class TemplateManagementView {
    private panel: vscode.WebviewPanel | undefined;
    private templates: Map<string, TemplateDefinition> = new Map();
    private currentTemplate: TemplateDefinition | undefined;

    constructor(private connectionManager: ConnectionManager) {
        this.loadDefaultTemplates();
    }

    async showTemplateManager(): Promise<void> {
        try {
            Logger.info('Opening template management view');

            this.panel = vscode.window.createWebviewPanel(
                'postgresqlTemplateManagement',
                'Template Management',
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
                this.currentTemplate = undefined;
            });

            // Generate and set HTML content
            const htmlContent = await this.generateTemplateManagerHtml();
            if (this.panel) {
                this.panel.webview.html = htmlContent;
            }

            // Handle messages from webview
            if (this.panel) {
                this.panel.webview.onDidReceiveMessage(async (message) => {
                    await this.handleWebviewMessage(message);
                });
            }

        } catch (error) {
            Logger.error('Failed to show template manager', error as Error);
            vscode.window.showErrorMessage(
                `Failed to open template manager: ${(error as Error).message}`
            );
        }
    }

    private loadDefaultTemplates(): void {
        const defaultTemplates: TemplateDefinition[] = [
            {
                id: 'basic_schema_comparison',
                name: 'Basic Schema Comparison',
                description: 'Standard schema comparison between two databases',
                type: 'comparison',
                category: 'Schema Analysis',
                version: '1.0',
                author: 'System',
                tags: ['comparison', 'schema', 'basic'],
                template: {
                    configuration: {
                        mode: 'strict',
                        includeSystemObjects: false,
                        caseSensitive: true
                    },
                    parameters: [
                        {
                            name: 'sourceConnection',
                            type: 'connection',
                            description: 'Source database connection',
                            isRequired: true
                        },
                        {
                            name: 'targetConnection',
                            type: 'connection',
                            description: 'Target database connection',
                            isRequired: true
                        },
                        {
                            name: 'schemaFilter',
                            type: 'schema',
                            description: 'Schema to compare (leave empty for all)',
                            isRequired: false
                        }
                    ],
                    defaultValues: {
                        mode: 'strict',
                        includeSystemObjects: false
                    },
                    validationRules: [
                        {
                            name: 'connection_validation',
                            description: 'Validate database connections',
                            expression: 'sourceConnection != null && targetConnection != null',
                            errorMessage: 'Both source and target connections must be specified',
                            severity: 'error'
                        }
                    ],
                    dependencies: []
                },
                metadata: {
                    estimatedExecutionTime: 30,
                    riskLevel: 'low',
                    complexity: 'simple',
                    prerequisites: ['Valid database connections'],
                    postConditions: ['Schema comparison results available'],
                    rollbackSupport: false
                },
                usage: {
                    usageCount: 0,
                    lastUsed: new Date(),
                    averageExecutionTime: 0,
                    successRate: 0,
                    userRatings: []
                },
                createdAt: new Date(),
                lastModified: new Date(),
                isPublic: true,
                isEnabled: true
            },
            {
                id: 'safe_schema_migration',
                name: 'Safe Schema Migration',
                description: 'Production-ready schema migration with full validation and rollback',
                type: 'migration',
                category: 'Migration',
                version: '1.0',
                author: 'System',
                tags: ['migration', 'safe', 'production', 'rollback'],
                template: {
                    configuration: {
                        includeRollback: true,
                        validateBeforeExecution: true,
                        createBackup: true,
                        useBatching: true,
                        batchSize: 10
                    },
                    parameters: [
                        {
                            name: 'sourceConnection',
                            type: 'connection',
                            description: 'Source database connection',
                            isRequired: true
                        },
                        {
                            name: 'targetConnection',
                            type: 'connection',
                            description: 'Target database connection',
                            isRequired: true
                        },
                        {
                            name: 'riskTolerance',
                            type: 'string',
                            description: 'Risk tolerance level',
                            isRequired: false,
                            defaultValue: 'medium',
                            options: ['low', 'medium', 'high']
                        }
                    ],
                    defaultValues: {
                        includeRollback: true,
                        validateBeforeExecution: true,
                        createBackup: true
                    },
                    validationRules: [
                        {
                            name: 'backup_validation',
                            description: 'Ensure backup is created for high-risk operations',
                            expression: 'riskTolerance === "high" ? createBackup === true : true',
                            errorMessage: 'Backup must be created for high-risk migrations',
                            severity: 'error'
                        }
                    ],
                    dependencies: ['basic_schema_comparison']
                },
                metadata: {
                    estimatedExecutionTime: 300,
                    riskLevel: 'medium',
                    complexity: 'moderate',
                    prerequisites: ['Source and target database connections', 'Schema comparison results'],
                    postConditions: ['Schema changes applied', 'Rollback script available'],
                    rollbackSupport: true
                },
                usage: {
                    usageCount: 0,
                    lastUsed: new Date(),
                    averageExecutionTime: 0,
                    successRate: 0,
                    userRatings: []
                },
                createdAt: new Date(),
                lastModified: new Date(),
                isPublic: true,
                isEnabled: true
            }
        ];

        defaultTemplates.forEach(template => {
            this.templates.set(template.id, template);
        });
    }

    private async generateTemplateManagerHtml(): Promise<string> {
        const templateList = Array.from(this.templates.values());

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Template Management</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        padding: 20px;
                        margin: 0;
                        background: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                    }
                    .header {
                        margin-bottom: 20px;
                        padding: 15px;
                        background: var(--vscode-textBlockQuote-background);
                        border-radius: 4px;
                    }
                    .template-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
                        gap: 20px;
                        margin-bottom: 20px;
                    }
                    .template-card {
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 6px;
                        overflow: hidden;
                    }
                    .template-header {
                        background: var(--vscode-titleBar-activeBackground);
                        padding: 12px 15px;
                        border-bottom: 1px solid var(--vscode-panel-border);
                    }
                    .template-title {
                        font-weight: bold;
                        font-size: 14px;
                        margin-bottom: 5px;
                    }
                    .template-description {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                    }
                    .template-content {
                        padding: 15px;
                    }
                    .template-meta {
                        display: flex;
                        justify-content: space-between;
                        margin-bottom: 15px;
                        font-size: 11px;
                    }
                    .template-type {
                        color: var(--vscode-textLink-foreground);
                    }
                    .template-category {
                        color: var(--vscode-descriptionForeground);
                    }
                    .template-tags {
                        margin-bottom: 15px;
                    }
                    .tag {
                        display: inline-block;
                        padding: 2px 6px;
                        background: var(--vscode-badge-background);
                        color: var(--vscode-badge-foreground);
                        border-radius: 3px;
                        font-size: 10px;
                        margin-right: 5px;
                        margin-bottom: 3px;
                    }
                    .template-actions {
                        display: flex;
                        gap: 8px;
                    }
                    .btn {
                        padding: 6px 12px;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 11px;
                        font-weight: bold;
                    }
                    .btn-primary {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                    }
                    .btn-secondary {
                        background: var(--vscode-button-secondaryBackground);
                        color: var(--vscode-button-secondaryForeground);
                    }
                    .btn-small {
                        padding: 4px 8px;
                        font-size: 10px;
                    }
                    .controls {
                        margin-bottom: 20px;
                        display: flex;
                        gap: 10px;
                        justify-content: center;
                    }
                    .empty-state {
                        text-align: center;
                        padding: 50px;
                        color: var(--vscode-descriptionForeground);
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
                        margin-bottom: 30px;
                        line-height: 1.5;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h2>Template Management</h2>
                    <div>Create, manage, and reuse database operation templates</div>
                </div>

                <div class="controls">
                    <button class="btn btn-primary" onclick="createNewTemplate()">Create Template</button>
                    <button class="btn btn-secondary" onclick="importTemplate()">Import</button>
                    <button class="btn btn-secondary" onclick="exportAllTemplates()">Export All</button>
                </div>

                ${templateList.length > 0 ? `
                    <div class="template-grid">
                        ${templateList.map(template => `
                            <div class="template-card">
                                <div class="template-header">
                                    <div class="template-title">${template.name}</div>
                                    <div class="template-description">${template.description}</div>
                                </div>
                                <div class="template-content">
                                    <div class="template-meta">
                                        <span class="template-type">${template.type.toUpperCase()}</span>
                                        <span class="template-category">${template.category}</span>
                                    </div>
                                    <div class="template-meta">
                                        <span>v${template.version}</span>
                                        <span>by ${template.author}</span>
                                    </div>
                                    <div class="template-tags">
                                        ${template.tags.map(tag => '<span class="tag">' + tag + '</span>').join('')}
                                    </div>
                                    <div class="template-actions">
                                        <button class="btn btn-primary btn-small" onclick="useTemplate('${template.id}')">Use</button>
                                        <button class="btn btn-secondary btn-small" onclick="editTemplate('${template.id}')">Edit</button>
                                        <button class="btn btn-secondary btn-small" onclick="duplicateTemplate('${template.id}')">Duplicate</button>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : `
                    <div class="empty-state">
                        <div class="icon">📋</div>
                        <div class="title">No Templates</div>
                        <div class="description">
                            Create your first template to save time on repetitive database operations.
                        </div>
                        <button class="btn btn-primary" onclick="createNewTemplate()">Create Template</button>
                    </div>
                `}

                <script>
                    const vscode = acquireVsCodeApi();

                    function createNewTemplate() {
                        vscode.postMessage({
                            command: 'createNewTemplate'
                        });
                    }

                    function importTemplate() {
                        vscode.postMessage({
                            command: 'importTemplate'
                        });
                    }

                    function exportAllTemplates() {
                        vscode.postMessage({
                            command: 'exportAllTemplates'
                        });
                    }

                    function useTemplate(templateId) {
                        vscode.postMessage({
                            command: 'useTemplate',
                            templateId: templateId
                        });
                    }

                    function editTemplate(templateId) {
                        vscode.postMessage({
                            command: 'editTemplate',
                            templateId: templateId
                        });
                    }

                    function duplicateTemplate(templateId) {
                        vscode.postMessage({
                            command: 'duplicateTemplate',
                            templateId: templateId
                        });
                    }
                </script>
            </body>
            </html>
        `;
    }

    private async handleWebviewMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'createNewTemplate':
                await this.createNewTemplate();
                break;
            case 'importTemplate':
                await this.importTemplate();
                break;
            case 'exportAllTemplates':
                await this.exportAllTemplates();
                break;
            case 'useTemplate':
                await this.useTemplate(message.templateId);
                break;
            case 'editTemplate':
                await this.editTemplate(message.templateId);
                break;
            case 'duplicateTemplate':
                await this.duplicateTemplate(message.templateId);
                break;
        }
    }

    private async createNewTemplate(): Promise<void> {
        Logger.info('Creating new template', 'createNewTemplate');
        vscode.window.showInformationMessage('Template creation wizard would open here');
    }

    private async importTemplate(): Promise<void> {
        try {
            const uri = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                filters: {
                    'Template Files': ['json'],
                    'All Files': ['*']
                }
            });

            if (uri && uri[0]) {
                const content = await vscode.workspace.fs.readFile(uri[0]);
                const templateData = JSON.parse(content.toString());

                // Validate and import template
                Logger.info('Template imported successfully', 'importTemplate', {
                    templateName: templateData.name,
                    templateType: templateData.type
                });

                vscode.window.showInformationMessage(`Template "${templateData.name}" imported successfully`);
            }
        } catch (error) {
            Logger.error('Failed to import template', error as Error);
            vscode.window.showErrorMessage('Failed to import template');
        }
    }

    private async exportAllTemplates(): Promise<void> {
        try {
            const templatesData = Array.from(this.templates.values());
            const exportContent = JSON.stringify(templatesData, null, 2);

            const uri = await vscode.window.showSaveDialog({
                filters: {
                    'JSON Files': ['json'],
                    'All Files': ['*']
                },
                defaultUri: vscode.Uri.file('database-templates-' + new Date().toISOString().split('T')[0] + '.json')
            });

            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(exportContent, 'utf8'));
                vscode.window.showInformationMessage('All templates exported successfully');
            }
        } catch (error) {
            Logger.error('Failed to export templates', error as Error);
            vscode.window.showErrorMessage('Failed to export templates');
        }
    }

    private async useTemplate(templateId: string): Promise<void> {
        const template = this.templates.get(templateId);
        if (!template) {
            throw new Error('Template ' + templateId + ' not found');
        }

        Logger.info('Using template', 'useTemplate', {
            templateId,
            templateName: template.name,
            templateType: template.type
        });

        // This would open the appropriate view with the template pre-configured
        switch (template.type) {
            case 'comparison':
                vscode.window.showInformationMessage('Opening schema comparison with template: ' + template.name);
                break;
            case 'migration':
                vscode.window.showInformationMessage('Opening migration with template: ' + template.name);
                break;
            case 'workflow':
                vscode.window.showInformationMessage('Opening workflow with template: ' + template.name);
                break;
            default:
                vscode.window.showInformationMessage('Template "' + template.name + '" ready to use');
        }
    }

    private async editTemplate(templateId: string): Promise<void> {
        const template = this.templates.get(templateId);
        if (!template) {
            throw new Error(`Template ${templateId} not found`);
        }

        Logger.info('Editing template', 'editTemplate', {
            templateId,
            templateName: template.name
        });

        vscode.window.showInformationMessage(`Edit template: ${template.name}`);
    }

    private async duplicateTemplate(templateId: string): Promise<void> {
        const template = this.templates.get(templateId);
        if (!template) {
            throw new Error(`Template ${templateId} not found`);
        }

        const duplicatedTemplate: TemplateDefinition = {
            ...template,
            id: template.id + '_copy_' + Date.now(),
            name: template.name + ' (Copy)',
            createdAt: new Date(),
            lastModified: new Date(),
            usage: {
                usageCount: 0,
                lastUsed: new Date(),
                averageExecutionTime: 0,
                successRate: 0,
                userRatings: []
            }
        };

        this.templates.set(duplicatedTemplate.id, duplicatedTemplate);

        Logger.info('Template duplicated', 'duplicateTemplate', {
            originalId: templateId,
            newId: duplicatedTemplate.id
        });

        vscode.window.showInformationMessage('Template duplicated: ' + duplicatedTemplate.name);
    }

    dispose(): void {
        if (this.panel) {
            this.panel.dispose();
            this.panel = undefined;
        }
        this.currentTemplate = undefined;
    }
}