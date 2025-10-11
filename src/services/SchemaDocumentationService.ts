import * as vscode from 'vscode';
import { Logger } from '@/utils/Logger';

export interface SchemaDocumentation {
    id: string;
    objectType: 'table' | 'column' | 'view' | 'function' | 'procedure' | 'schema' | 'database';
    objectName: string;
    schemaName: string;
    databaseName: string;
    title: string;
    description: string;
    usage: string;
    examples: string[];
    tags: string[];
    author: string;
    authorEmail?: string;
    createdAt: Date;
    updatedAt: Date;
    version: string;
    status: 'draft' | 'review' | 'approved' | 'deprecated';
    visibility: 'private' | 'team' | 'public';
    relatedObjects: string[];
    businessContext?: string;
    dataClassification?: 'public' | 'internal' | 'confidential' | 'restricted';
    complianceNotes?: string;
}

export interface DocumentationComment {
    id: string;
    documentationId: string;
    userId: string;
    userName: string;
    content: string;
    timestamp: Date;
    type: 'comment' | 'question' | 'suggestion' | 'correction';
    resolved: boolean;
    parentCommentId?: string;
    reactions: CommentReaction[];
}

export interface CommentReaction {
    userId: string;
    type: 'like' | 'helpful' | 'outdated' | 'agree' | 'disagree';
    timestamp: Date;
}

export interface DocumentationTemplate {
    id: string;
    name: string;
    description: string;
    objectType: string;
    sections: TemplateSection[];
    createdAt: Date;
    updatedAt: Date;
    isPublic: boolean;
    usageCount: number;
}

export interface TemplateSection {
    id: string;
    title: string;
    type: 'text' | 'textarea' | 'select' | 'multiselect' | 'checkbox';
    required: boolean;
    placeholder?: string;
    options?: string[]; // For select/multiselect
    defaultValue?: string;
    order: number;
}

export interface DocumentationSearchResult {
    documentation: SchemaDocumentation;
    relevance: number;
    highlights: string[];
}

export class SchemaDocumentationService {
    private context: vscode.ExtensionContext;
    private documentation: Map<string, SchemaDocumentation> = new Map();
    private comments: Map<string, DocumentationComment[]> = new Map();
    private templates: Map<string, DocumentationTemplate> = new Map();
    private currentUser?: { id: string; name: string; email?: string };

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.loadDocumentationData();
        this.initializeCurrentUser();
    }

    private loadDocumentationData(): void {
        try {
            // Load documentation
            const docsData = this.context.globalState.get<string>('postgresql.documentation.docs', '[]');
            const docs = JSON.parse(docsData) as SchemaDocumentation[];

            this.documentation.clear();
            docs.forEach(doc => {
                this.documentation.set(doc.id, {
                    ...doc,
                    createdAt: new Date(doc.createdAt),
                    updatedAt: new Date(doc.updatedAt)
                });
            });

            // Load comments
            const commentsData = this.context.globalState.get<string>('postgresql.documentation.comments', '[]');
            const comments = JSON.parse(commentsData) as DocumentationComment[];

            this.comments.clear();
            comments.forEach(comment => {
                if (!this.comments.has(comment.documentationId)) {
                    this.comments.set(comment.documentationId, []);
                }
                this.comments.get(comment.documentationId)!.push({
                    ...comment,
                    timestamp: new Date(comment.timestamp)
                });
            });

            // Load templates
            const templatesData = this.context.globalState.get<string>('postgresql.documentation.templates', '[]');
            const templates = JSON.parse(templatesData) as DocumentationTemplate[];

            this.templates.clear();
            templates.forEach(template => {
                this.templates.set(template.id, {
                    ...template,
                    createdAt: new Date(template.createdAt),
                    updatedAt: new Date(template.updatedAt)
                });
            });

            Logger.info('Documentation data loaded', 'loadDocumentationData', {
                docCount: this.documentation.size,
                commentCount: comments.length,
                templateCount: this.templates.size
            });

        } catch (error) {
            Logger.error('Failed to load documentation data', error as Error);
            this.documentation.clear();
            this.comments.clear();
            this.templates.clear();
        }
    }

    private saveDocumentationData(): void {
        try {
            // Save documentation
            const docsArray = Array.from(this.documentation.values());
            this.context.globalState.update('postgresql.documentation.docs', JSON.stringify(docsArray));

            // Save comments
            const commentsArray: DocumentationComment[] = [];
            this.comments.forEach(comments => {
                commentsArray.push(...comments);
            });
            this.context.globalState.update('postgresql.documentation.comments', JSON.stringify(commentsArray));

            // Save templates
            const templatesArray = Array.from(this.templates.values());
            this.context.globalState.update('postgresql.documentation.templates', JSON.stringify(templatesArray));

            Logger.info('Documentation data saved', 'saveDocumentationData');

        } catch (error) {
            Logger.error('Failed to save documentation data', error as Error);
        }
    }

    private initializeCurrentUser(): void {
        this.currentUser = {
            id: vscode.env.machineId,
            name: vscode.env.appName || 'Current User',
            email: 'current-user@example.com'
        };
    }

    // Documentation Management
    async createDocumentation(
        objectInfo: {
            objectType: SchemaDocumentation['objectType'];
            objectName: string;
            schemaName: string;
            databaseName: string;
        },
        docData: Omit<SchemaDocumentation, 'id' | 'objectType' | 'objectName' | 'schemaName' | 'databaseName' | 'author' | 'createdAt' | 'updatedAt' | 'version'>
    ): Promise<SchemaDocumentation> {
        try {
            const documentation: SchemaDocumentation = {
                ...objectInfo,
                ...docData,
                id: this.generateId(),
                author: this.currentUser?.name || 'Unknown',
                authorEmail: this.currentUser?.email,
                createdAt: new Date(),
                updatedAt: new Date(),
                version: '1.0.0'
            };

            this.documentation.set(documentation.id, documentation);
            this.saveDocumentationData();

            Logger.info('Schema documentation created', 'createDocumentation', {
                docId: documentation.id,
                objectName: documentation.objectName,
                objectType: documentation.objectType
            });

            return documentation;

        } catch (error) {
            Logger.error('Failed to create documentation', error as Error);
            throw error;
        }
    }

    async updateDocumentation(
        docId: string,
        updates: Partial<SchemaDocumentation>
    ): Promise<SchemaDocumentation> {
        try {
            const doc = this.documentation.get(docId);
            if (!doc) {
                throw new Error(`Documentation ${docId} not found`);
            }

            const updatedDoc: SchemaDocumentation = {
                ...doc,
                ...updates,
                updatedAt: new Date(),
                version: this.incrementVersion(doc.version)
            };

            this.documentation.set(docId, updatedDoc);
            this.saveDocumentationData();

            Logger.info('Schema documentation updated', 'updateDocumentation', {
                docId,
                objectName: updatedDoc.objectName
            });

            return updatedDoc;

        } catch (error) {
            Logger.error('Failed to update documentation', error as Error);
            throw error;
        }
    }

    async deleteDocumentation(docId: string): Promise<void> {
        try {
            const doc = this.documentation.get(docId);
            if (!doc) {
                throw new Error(`Documentation ${docId} not found`);
            }

            this.documentation.delete(docId);

            // Remove associated comments
            this.comments.delete(docId);

            this.saveDocumentationData();

            Logger.info('Schema documentation deleted', 'deleteDocumentation', {
                docId,
                objectName: doc.objectName
            });

        } catch (error) {
            Logger.error('Failed to delete documentation', error as Error);
            throw error;
        }
    }

    getDocumentation(docId: string): SchemaDocumentation | undefined {
        return this.documentation.get(docId);
    }

    getDocumentationForObject(
        objectType: SchemaDocumentation['objectType'],
        objectName: string,
        schemaName: string,
        databaseName: string
    ): SchemaDocumentation | undefined {
        return Array.from(this.documentation.values()).find(doc =>
            doc.objectType === objectType &&
            doc.objectName === objectName &&
            doc.schemaName === schemaName &&
            doc.databaseName === databaseName
        );
    }

    getDocumentationList(filter?: {
        objectType?: SchemaDocumentation['objectType'];
        schemaName?: string;
        databaseName?: string;
        status?: SchemaDocumentation['status'];
        visibility?: SchemaDocumentation['visibility'];
        tags?: string[];
        author?: string;
    }): SchemaDocumentation[] {
        let docs = Array.from(this.documentation.values());

        if (filter) {
            if (filter.objectType) {
                docs = docs.filter(d => d.objectType === filter.objectType);
            }
            if (filter.schemaName) {
                docs = docs.filter(d => d.schemaName === filter.schemaName);
            }
            if (filter.databaseName) {
                docs = docs.filter(d => d.databaseName === filter.databaseName);
            }
            if (filter.status) {
                docs = docs.filter(d => d.status === filter.status);
            }
            if (filter.visibility) {
                docs = docs.filter(d => d.visibility === filter.visibility);
            }
            if (filter.tags && filter.tags.length > 0) {
                docs = docs.filter(d =>
                    filter.tags!.some(tag => d.tags.includes(tag))
                );
            }
            if (filter.author) {
                docs = docs.filter(d => d.author === filter.author);
            }
        }

        return docs.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }

    // Comment System
    async addComment(
        docId: string,
        content: string,
        type: DocumentationComment['type'] = 'comment',
        parentCommentId?: string
    ): Promise<DocumentationComment> {
        try {
            const doc = this.documentation.get(docId);
            if (!doc) {
                throw new Error(`Documentation ${docId} not found`);
            }

            const comment: DocumentationComment = {
                id: this.generateId(),
                documentationId: docId,
                userId: this.currentUser?.id || 'anonymous',
                userName: this.currentUser?.name || 'Anonymous',
                content,
                timestamp: new Date(),
                type,
                resolved: false,
                parentCommentId,
                reactions: []
            };

            if (!this.comments.has(docId)) {
                this.comments.set(docId, []);
            }

            this.comments.get(docId)!.push(comment);
            this.saveDocumentationData();

            Logger.info('Documentation comment added', 'addComment', {
                docId,
                commentId: comment.id,
                type: comment.type
            });

            return comment;

        } catch (error) {
            Logger.error('Failed to add comment', error as Error);
            throw error;
        }
    }

    getComments(docId: string): DocumentationComment[] {
        return this.comments.get(docId) || [];
    }

    async resolveComment(commentId: string): Promise<void> {
        // Find and resolve comment across all documentation
        for (const comments of this.comments.values()) {
            const comment = comments.find(c => c.id === commentId);
            if (comment) {
                comment.resolved = true;
                this.saveDocumentationData();
                return;
            }
        }
        throw new Error(`Comment ${commentId} not found`);
    }

    // Template Management
    async createTemplate(templateData: Omit<DocumentationTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>): Promise<DocumentationTemplate> {
        try {
            const template: DocumentationTemplate = {
                ...templateData,
                id: this.generateId(),
                createdAt: new Date(),
                updatedAt: new Date(),
                usageCount: 0
            };

            this.templates.set(template.id, template);
            this.saveDocumentationData();

            Logger.info('Documentation template created', 'createTemplate', {
                templateId: template.id,
                name: template.name
            });

            return template;

        } catch (error) {
            Logger.error('Failed to create template', error as Error);
            throw error;
        }
    }

    getTemplates(objectType?: string): DocumentationTemplate[] {
        let templates = Array.from(this.templates.values());

        if (objectType) {
            templates = templates.filter(t => t.objectType === objectType || t.objectType === 'all');
        }

        return templates.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }

    async useTemplate(templateId: string, objectInfo: {
        objectType: string;
        objectName: string;
        schemaName: string;
        databaseName: string;
    }): Promise<Partial<SchemaDocumentation>> {
        try {
            const template = this.templates.get(templateId);
            if (!template) {
                throw new Error(`Template ${templateId} not found`);
            }

            // Increment usage count
            template.usageCount++;
            this.templates.set(templateId, template);

            // Generate documentation structure from template
            const docData: Partial<SchemaDocumentation> = {
                title: `${objectInfo.objectType} ${objectInfo.objectName}`,
                description: '',
                usage: '',
                examples: [],
                tags: [],
                status: 'draft',
                visibility: 'private'
            };

            // Pre-fill with template sections
            template.sections.forEach(section => {
                if (section.defaultValue) {
                    switch (section.title.toLowerCase()) {
                        case 'description':
                            docData.description = section.defaultValue;
                            break;
                        case 'usage':
                            docData.usage = section.defaultValue;
                            break;
                        case 'tags':
                            docData.tags = section.defaultValue.split(',').map(tag => tag.trim());
                            break;
                    }
                }
            });

            this.saveDocumentationData();

            Logger.info('Template used for documentation', 'useTemplate', {
                templateId,
                objectName: objectInfo.objectName
            });

            return docData;

        } catch (error) {
            Logger.error('Failed to use template', error as Error);
            throw error;
        }
    }

    // Search and Discovery
    async searchDocumentation(query: string, filters?: {
        objectType?: SchemaDocumentation['objectType'];
        tags?: string[];
        status?: SchemaDocumentation['status'];
        author?: string;
    }): Promise<DocumentationSearchResult[]> {
        try {
            let docs = Array.from(this.documentation.values());

            // Apply filters
            if (filters) {
                if (filters.objectType) {
                    docs = docs.filter(d => d.objectType === filters.objectType);
                }
                if (filters.tags && filters.tags.length > 0) {
                    docs = docs.filter(d =>
                        filters.tags!.some(tag => d.tags.includes(tag))
                    );
                }
                if (filters.status) {
                    docs = docs.filter(d => d.status === filters.status);
                }
                if (filters.author) {
                    docs = docs.filter(d => d.author === filters.author);
                }
            }

            // Search in title, description, usage, and tags
            const results: DocumentationSearchResult[] = [];
            const searchTerm = query.toLowerCase();

            docs.forEach(doc => {
                let relevance = 0;
                const highlights: string[] = [];

                // Search in different fields with different weights
                if (doc.title.toLowerCase().includes(searchTerm)) {
                    relevance += 10;
                    highlights.push(doc.title);
                }
                if (doc.description.toLowerCase().includes(searchTerm)) {
                    relevance += 5;
                    highlights.push(doc.description);
                }
                if (doc.usage.toLowerCase().includes(searchTerm)) {
                    relevance += 3;
                    highlights.push(doc.usage);
                }
                if (doc.tags.some(tag => tag.toLowerCase().includes(searchTerm))) {
                    relevance += 2;
                    highlights.push(...doc.tags.filter(tag => tag.toLowerCase().includes(searchTerm)));
                }

                if (relevance > 0) {
                    results.push({
                        documentation: doc,
                        relevance,
                        highlights
                    });
                }
            });

            return results.sort((a, b) => b.relevance - a.relevance);

        } catch (error) {
            Logger.error('Failed to search documentation', error as Error);
            return [];
        }
    }

    // Export/Import
    async exportDocumentation(format: 'json' | 'markdown' | 'html'): Promise<string> {
        try {
            const docs = Array.from(this.documentation.values());

            switch (format) {
                case 'json':
                    return JSON.stringify(docs, null, 2);

                case 'markdown':
                    return this.generateMarkdownDocumentation(docs);

                case 'html':
                    return this.generateHTMLDocumentation(docs);

                default:
                    throw new Error(`Unsupported export format: ${format}`);
            }

        } catch (error) {
            Logger.error('Failed to export documentation', error as Error);
            throw error;
        }
    }

    private generateMarkdownDocumentation(docs: SchemaDocumentation[]): string {
        let markdown = '# Database Schema Documentation\n\n';
        markdown += `Generated: ${new Date().toISOString()}\n\n`;

        // Group by object type
        const docsByType = new Map<SchemaDocumentation['objectType'], SchemaDocumentation[]>();
        docs.forEach(doc => {
            if (!docsByType.has(doc.objectType)) {
                docsByType.set(doc.objectType, []);
            }
            docsByType.get(doc.objectType)!.push(doc);
        });

        docsByType.forEach((typeDocs, objectType) => {
            markdown += `## ${objectType.charAt(0).toUpperCase() + objectType.slice(1)}s\n\n`;

            typeDocs.forEach(doc => {
                markdown += `### ${doc.title}\n\n`;
                markdown += `**Schema:** ${doc.schemaName} | **Database:** ${doc.databaseName}\n\n`;

                if (doc.description) {
                    markdown += `**Description:**\n${doc.description}\n\n`;
                }

                if (doc.usage) {
                    markdown += `**Usage:**\n${doc.usage}\n\n`;
                }

                if (doc.examples.length > 0) {
                    markdown += `**Examples:**\n`;
                    doc.examples.forEach(example => {
                        markdown += `- ${example}\n`;
                    });
                    markdown += '\n';
                }

                if (doc.tags.length > 0) {
                    markdown += `**Tags:** ${doc.tags.join(', ')}\n\n`;
                }

                markdown += `**Author:** ${doc.author} | **Version:** ${doc.version} | **Status:** ${doc.status}\n\n`;
                markdown += `---\n\n`;
            });
        });

        return markdown;
    }

    private generateHTMLDocumentation(docs: SchemaDocumentation[]): string {
        // Similar to markdown but in HTML format
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Database Schema Documentation</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
                    .object-type { margin: 40px 0 20px 0; border-bottom: 2px solid #333; }
                    .doc-item { margin: 30px 0; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
                    .doc-title { color: #2c3e50; margin-bottom: 10px; }
                    .doc-meta { color: #7f8c8d; font-size: 0.9em; margin-bottom: 15px; }
                    .doc-description { margin-bottom: 15px; }
                    .doc-usage { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0; }
                    .doc-examples { margin: 15px 0; }
                    .doc-example { background: #e9ecef; padding: 10px; margin: 5px 0; border-radius: 3px; }
                    .doc-tags { margin: 15px 0; }
                    .tag { display: inline-block; background: #007bff; color: white; padding: 3px 8px; margin: 2px; border-radius: 12px; font-size: 0.8em; }
                </style>
            </head>
            <body>
                <h1>Database Schema Documentation</h1>
                <p>Generated: ${new Date().toISOString()}</p>

                ${Array.from(new Set(docs.map(d => d.objectType))).map(objectType => {
                    const typeDocs = docs.filter(d => d.objectType === objectType);
                    return `
                        <div class="object-type">
                            <h2>${objectType.charAt(0).toUpperCase() + objectType.slice(1)}s</h2>
                            ${typeDocs.map(doc => `
                                <div class="doc-item">
                                    <h3 class="doc-title">${doc.title}</h3>
                                    <div class="doc-meta">
                                        Schema: ${doc.schemaName} | Database: ${doc.databaseName} |
                                        Author: ${doc.author} | Version: ${doc.version} | Status: ${doc.status}
                                    </div>

                                    ${doc.description ? `<div class="doc-description"><strong>Description:</strong><br>${doc.description}</div>` : ''}

                                    ${doc.usage ? `<div class="doc-usage"><strong>Usage:</strong><br>${doc.usage}</div>` : ''}

                                    ${doc.examples.length > 0 ? `
                                        <div class="doc-examples">
                                            <strong>Examples:</strong>
                                            ${doc.examples.map(example => `<div class="doc-example">${example}</div>`).join('')}
                                        </div>
                                    ` : ''}

                                    ${doc.tags.length > 0 ? `
                                        <div class="doc-tags">
                                            <strong>Tags:</strong>
                                            ${doc.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                                        </div>
                                    ` : ''}
                                </div>
                            `).join('')}
                        </div>
                    `;
                }).join('')}
            </body>
            </html>
        `;
    }

    // Statistics and Analytics
    getDocumentationStats(): {
        totalDocumentation: number;
        totalComments: number;
        totalTemplates: number;
        docsByType: Record<string, number>;
        docsByStatus: Record<string, number>;
        topAuthors: { author: string; count: number }[];
        recentActivity: { date: string; count: number }[];
    } {
        const docs = Array.from(this.documentation.values());
        const comments = Array.from(this.comments.values()).flat();

        const docsByType = docs.reduce((acc, doc) => {
            acc[doc.objectType] = (acc[doc.objectType] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const docsByStatus = docs.reduce((acc, doc) => {
            acc[doc.status] = (acc[doc.status] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const authorCount = docs.reduce((acc, doc) => {
            acc[doc.author] = (acc[doc.author] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        // Recent activity (last 30 days)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const recentActivity = new Map<string, number>();

        docs.filter(d => d.updatedAt >= thirtyDaysAgo).forEach(doc => {
            const dateKey = doc.updatedAt.toISOString().split('T')[0];
            recentActivity.set(dateKey, (recentActivity.get(dateKey) || 0) + 1);
        });

        return {
            totalDocumentation: docs.length,
            totalComments: comments.length,
            totalTemplates: this.templates.size,
            docsByType,
            docsByStatus,
            topAuthors: Object.entries(authorCount)
                .map(([author, count]) => ({ author, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 10),
            recentActivity: Array.from(recentActivity.entries())
                .map(([date, count]) => ({ date, count }))
                .sort((a, b) => a.date.localeCompare(b.date))
        };
    }

    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    private incrementVersion(version: string): string {
        const parts = version.split('.').map(Number);
        parts[parts.length - 1]++;
        return parts.join('.');
    }

    dispose(): void {
        this.saveDocumentationData();
    }
}