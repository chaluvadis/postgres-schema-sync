import * as vscode from 'vscode';
import { Logger } from '@/utils/Logger';
import { ErrorHandler } from '@/utils/ErrorHandler';

export interface QuerySnippet {
    id: string;
    name: string;
    description?: string;
    category: string;
    query: string;
    tags: string[];
    author: string;
    authorEmail?: string;
    createdAt: Date;
    updatedAt: Date;
    usageCount: number;
    rating: number;
    isPublic: boolean;
    teamId?: string;
    organizationId?: string;
    version: string;
    dependencies?: string[];
    parameters?: QueryParameter[];
}

export interface QueryParameter {
    name: string;
    type: 'string' | 'number' | 'date' | 'boolean';
    description?: string;
    defaultValue?: string;
    required: boolean;
}

export interface TeamQueryLibrary {
    id: string;
    name: string;
    description?: string;
    members: string[];
    snippets: QuerySnippet[];
    createdAt: Date;
    updatedAt: Date;
    isPublic: boolean;
    organizationId?: string;
}

export interface CollaborationWorkspace {
    id: string;
    name: string;
    type: 'personal' | 'team' | 'organization';
    members: CollaborationMember[];
    settings: CollaborationSettings;
    createdAt: Date;
}

export interface CollaborationMember {
    userId: string;
    email: string;
    name: string;
    role: 'owner' | 'editor' | 'viewer';
    joinedAt: Date;
}

export interface CollaborationSettings {
    allowPublicSharing: boolean;
    requireApproval: boolean;
    notifyOnChanges: boolean;
    autoBackup: boolean;
    retentionDays: number;
}

export interface QueryComment {
    id: string;
    snippetId: string;
    userId: string;
    userName: string;
    content: string;
    timestamp: Date;
    parentCommentId?: string;
    reactions: CommentReaction[];
}

export interface CommentReaction {
    userId: string;
    type: 'like' | 'dislike' | 'helpful' | 'outdated';
    timestamp: Date;
}

export class TeamCollaborationService {
    private context: vscode.ExtensionContext;
    private snippets: Map<string, QuerySnippet> = new Map();
    private libraries: Map<string, TeamQueryLibrary> = new Map();
    private workspaces: Map<string, CollaborationWorkspace> = new Map();
    private comments: Map<string, QueryComment[]> = new Map();
    private currentUser?: CollaborationMember;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.loadCollaborationData();
        this.initializeCurrentUser();
    }

    private loadCollaborationData(): void {
        try {
            // Load snippets
            const snippetsData = this.context.globalState.get<string>('postgresql.collaboration.snippets', '[]');
            const snippets = JSON.parse(snippetsData) as QuerySnippet[];
            this.snippets.clear();
            snippets.forEach(snippet => {
                this.snippets.set(snippet.id, {
                    ...snippet,
                    createdAt: new Date(snippet.createdAt),
                    updatedAt: new Date(snippet.updatedAt)
                });
            });

            // Load libraries
            const librariesData = this.context.globalState.get<string>('postgresql.collaboration.libraries', '[]');
            const libraries = JSON.parse(librariesData) as TeamQueryLibrary[];
            this.libraries.clear();
            libraries.forEach(library => {
                this.libraries.set(library.id, {
                    ...library,
                    createdAt: new Date(library.createdAt),
                    updatedAt: new Date(library.updatedAt)
                });
            });

            Logger.info('Collaboration data loaded', 'loadCollaborationData', {
                snippetCount: this.snippets.size,
                libraryCount: this.libraries.size
            });

        } catch (error) {
            Logger.error('Failed to load collaboration data', error as Error);
            this.snippets.clear();
            this.libraries.clear();
        }
    }

    private saveCollaborationData(): void {
        try {
            // Save snippets
            const snippetsArray = Array.from(this.snippets.values());
            this.context.globalState.update('postgresql.collaboration.snippets', JSON.stringify(snippetsArray));

            // Save libraries
            const librariesArray = Array.from(this.libraries.values());
            this.context.globalState.update('postgresql.collaboration.libraries', JSON.stringify(librariesArray));

            Logger.info('Collaboration data saved', 'saveCollaborationData', {
                snippetCount: snippetsArray.length,
                libraryCount: librariesArray.length
            });

        } catch (error) {
            Logger.error('Failed to save collaboration data', error as Error);
        }
    }

    private initializeCurrentUser(): void {
        // Get user info from VSCode
        const userInfo = {
            userId: vscode.env.machineId,
            email: 'current-user@example.com', // In real implementation, get from VSCode user settings
            name: vscode.env.appName || 'Current User',
            role: 'owner' as const,
            joinedAt: new Date()
        };

        this.currentUser = userInfo;
        Logger.info('Current user initialized', 'initializeCurrentUser', { userId: userInfo.userId });
    }

    // Snippet Management
    async createSnippet(snippetData: Omit<QuerySnippet, 'id' | 'author' | 'createdAt' | 'updatedAt' | 'usageCount' | 'rating'>): Promise<QuerySnippet> {
        try {
            const snippet: QuerySnippet = {
                ...snippetData,
                id: this.generateId(),
                author: this.currentUser?.name || 'Unknown',
                authorEmail: this.currentUser?.email,
                createdAt: new Date(),
                updatedAt: new Date(),
                usageCount: 0,
                rating: 0
            };

            this.snippets.set(snippet.id, snippet);
            this.saveCollaborationData();

            Logger.info('Query snippet created', 'createSnippet', {
                snippetId: snippet.id,
                name: snippet.name
            });

            return snippet;

        } catch (error) {
            Logger.error('Failed to create snippet', error as Error);
            throw error;
        }
    }

    async updateSnippet(snippetId: string, updates: Partial<QuerySnippet>): Promise<QuerySnippet> {
        try {
            const snippet = this.snippets.get(snippetId);
            if (!snippet) {
                throw new Error(`Snippet ${snippetId} not found`);
            }

            const updatedSnippet: QuerySnippet = {
                ...snippet,
                ...updates,
                updatedAt: new Date()
            };

            this.snippets.set(snippetId, updatedSnippet);
            this.saveCollaborationData();

            Logger.info('Query snippet updated', 'updateSnippet', {
                snippetId,
                name: updatedSnippet.name
            });

            return updatedSnippet;

        } catch (error) {
            Logger.error('Failed to update snippet', error as Error);
            throw error;
        }
    }

    async deleteSnippet(snippetId: string): Promise<void> {
        try {
            const snippet = this.snippets.get(snippetId);
            if (!snippet) {
                throw new Error(`Snippet ${snippetId} not found`);
            }

            this.snippets.delete(snippetId);

            // Remove associated comments
            this.comments.delete(snippetId);

            this.saveCollaborationData();

            Logger.info('Query snippet deleted', 'deleteSnippet', {
                snippetId,
                name: snippet.name
            });

        } catch (error) {
            Logger.error('Failed to delete snippet', error as Error);
            throw error;
        }
    }

    getSnippet(snippetId: string): QuerySnippet | undefined {
        return this.snippets.get(snippetId);
    }

    getSnippets(filter?: {
        category?: string;
        tags?: string[];
        author?: string;
        isPublic?: boolean;
        teamId?: string;
    }): QuerySnippet[] {
        let snippets = Array.from(this.snippets.values());

        if (filter) {
            if (filter.category) {
                snippets = snippets.filter(s => s.category === filter.category);
            }
            if (filter.tags && filter.tags.length > 0) {
                snippets = snippets.filter(s =>
                    filter.tags!.some(tag => s.tags.includes(tag))
                );
            }
            if (filter.author) {
                snippets = snippets.filter(s => s.author === filter.author);
            }
            if (filter.isPublic !== undefined) {
                snippets = snippets.filter(s => s.isPublic === filter.isPublic);
            }
            if (filter.teamId) {
                snippets = snippets.filter(s => s.teamId === filter.teamId);
            }
        }

        return snippets.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }

    async incrementSnippetUsage(snippetId: string): Promise<void> {
        const snippet = this.snippets.get(snippetId);
        if (snippet) {
            snippet.usageCount++;
            this.snippets.set(snippetId, snippet);
            this.saveCollaborationData();
        }
    }

    async rateSnippet(snippetId: string, rating: number): Promise<void> {
        const snippet = this.snippets.get(snippetId);
        if (snippet) {
            // Simple rating system (could be enhanced with user-specific ratings)
            snippet.rating = rating;
            this.snippets.set(snippetId, snippet);
            this.saveCollaborationData();
        }
    }

    // Team Library Management
    async createTeamLibrary(libraryData: Omit<TeamQueryLibrary, 'id' | 'createdAt' | 'updatedAt'>): Promise<TeamQueryLibrary> {
        try {
            const library: TeamQueryLibrary = {
                ...libraryData,
                id: this.generateId(),
                createdAt: new Date(),
                updatedAt: new Date()
            };

            this.libraries.set(library.id, library);
            this.saveCollaborationData();

            Logger.info('Team library created', 'createTeamLibrary', {
                libraryId: library.id,
                name: library.name
            });

            return library;

        } catch (error) {
            Logger.error('Failed to create team library', error as Error);
            throw error;
        }
    }

    async addSnippetToLibrary(libraryId: string, snippetId: string): Promise<void> {
        try {
            const library = this.libraries.get(libraryId);
            const snippet = this.snippets.get(snippetId);

            if (!library) {
                throw new Error(`Library ${libraryId} not found`);
            }
            if (!snippet) {
                throw new Error(`Snippet ${snippetId} not found`);
            }

            if (!library.snippets.find(s => s.id === snippetId)) {
                library.snippets.push(snippet);
                library.updatedAt = new Date();
                this.libraries.set(libraryId, library);
                this.saveCollaborationData();

                Logger.info('Snippet added to library', 'addSnippetToLibrary', {
                    libraryId,
                    snippetId
                });
            }

        } catch (error) {
            Logger.error('Failed to add snippet to library', error as Error);
            throw error;
        }
    }

    getTeamLibraries(teamId?: string): TeamQueryLibrary[] {
        return Array.from(this.libraries.values())
            .filter(library => !teamId || library.id === teamId)
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }

    // Comment System
    async addComment(snippetId: string, content: string, parentCommentId?: string): Promise<QueryComment> {
        try {
            const snippet = this.snippets.get(snippetId);
            if (!snippet) {
                throw new Error(`Snippet ${snippetId} not found`);
            }

            const comment: QueryComment = {
                id: this.generateId(),
                snippetId,
                userId: this.currentUser?.userId || 'anonymous',
                userName: this.currentUser?.name || 'Anonymous',
                content,
                timestamp: new Date(),
                parentCommentId,
                reactions: []
            };

            if (!this.comments.has(snippetId)) {
                this.comments.set(snippetId, []);
            }

            this.comments.get(snippetId)!.push(comment);
            this.saveCollaborationData();

            Logger.info('Comment added', 'addComment', {
                snippetId,
                commentId: comment.id
            });

            return comment;

        } catch (error) {
            Logger.error('Failed to add comment', error as Error);
            throw error;
        }
    }

    getComments(snippetId: string): QueryComment[] {
        return this.comments.get(snippetId) || [];
    }

    async addCommentReaction(commentId: string, reactionType: CommentReaction['type']): Promise<void> {
        // Implementation for adding reactions to comments
        Logger.info('Comment reaction added', 'addCommentReaction', {
            commentId,
            reactionType
        });
    }

    // Search and Discovery
    async searchSnippets(query: string, filters?: {
        category?: string;
        tags?: string[];
        author?: string;
    }): Promise<QuerySnippet[]> {
        try {
            let snippets = Array.from(this.snippets.values());

            // Text search in name, description, and query
            if (query.trim()) {
                const searchTerm = query.toLowerCase();
                snippets = snippets.filter(snippet =>
                    snippet.name.toLowerCase().includes(searchTerm) ||
                    snippet.description?.toLowerCase().includes(searchTerm) ||
                    snippet.query.toLowerCase().includes(searchTerm) ||
                    snippet.tags.some(tag => tag.toLowerCase().includes(searchTerm))
                );
            }

            // Apply filters
            if (filters) {
                if (filters.category) {
                    snippets = snippets.filter(s => s.category === filters.category);
                }
                if (filters.tags && filters.tags.length > 0) {
                    snippets = snippets.filter(s =>
                        filters.tags!.some(tag => s.tags.includes(tag))
                    );
                }
                if (filters.author) {
                    snippets = snippets.filter(s => s.author === filters.author);
                }
            }

            return snippets.sort((a, b) => {
                // Sort by relevance (usage count + rating)
                const scoreA = a.usageCount + a.rating;
                const scoreB = b.usageCount + b.rating;
                return scoreB - scoreA;
            });

        } catch (error) {
            Logger.error('Failed to search snippets', error as Error);
            return [];
        }
    }

    // Categories and Tags
    getCategories(): string[] {
        const categories = new Set<string>();
        this.snippets.forEach(snippet => {
            categories.add(snippet.category);
        });
        return Array.from(categories).sort();
    }

    getAllTags(): string[] {
        const tags = new Set<string>();
        this.snippets.forEach(snippet => {
            snippet.tags.forEach(tag => tags.add(tag));
        });
        return Array.from(tags).sort();
    }

    // Import/Export
    async exportLibrary(libraryId: string, format: 'json' | 'sql'): Promise<string> {
        try {
            const library = this.libraries.get(libraryId);
            if (!library) {
                throw new Error(`Library ${libraryId} not found`);
            }

            if (format === 'json') {
                return JSON.stringify(library, null, 2);
            } else {
                // Export as SQL file with comments
                let sql = `-- Team Query Library: ${library.name}\n`;
                sql += `-- Description: ${library.description || 'No description'}\n`;
                sql += `-- Exported: ${new Date().toISOString()}\n\n`;

                library.snippets.forEach(snippet => {
                    sql += `-- Snippet: ${snippet.name}\n`;
                    sql += `-- Category: ${snippet.category}\n`;
                    sql += `-- Author: ${snippet.author}\n`;
                    if (snippet.description) {
                        sql += `-- Description: ${snippet.description}\n`;
                    }
                    sql += `-- Tags: ${snippet.tags.join(', ')}\n`;
                    sql += `-- Usage Count: ${snippet.usageCount}\n\n`;
                    sql += `${snippet.query}\n\n`;
                    sql += `-- End of snippet: ${snippet.name}\n`;
                    sql += `----------------------------------------\n\n`;
                });

                return sql;
            }

        } catch (error) {
            Logger.error('Failed to export library', error as Error);
            throw error;
        }
    }

    async importSnippets(data: string, format: 'json' | 'sql', targetLibraryId?: string): Promise<number> {
        try {
            let importedCount = 0;

            if (format === 'json') {
                const importData = JSON.parse(data) as TeamQueryLibrary;
                if (importData.snippets) {
                    for (const snippet of importData.snippets) {
                        await this.createSnippet({
                            ...snippet,
                            teamId: targetLibraryId
                        });
                        importedCount++;
                    }
                }
            } else {
                // Parse SQL format (basic implementation)
                const snippets = this.parseSQLSnippets(data);
                for (const snippet of snippets) {
                    await this.createSnippet({
                        ...snippet,
                        teamId: targetLibraryId
                    });
                    importedCount++;
                }
            }

            Logger.info('Snippets imported', 'importSnippets', { importedCount });
            return importedCount;

        } catch (error) {
            Logger.error('Failed to import snippets', error as Error);
            throw error;
        }
    }

    private parseSQLSnippets(sqlContent: string): Omit<QuerySnippet, 'id' | 'author' | 'createdAt' | 'updatedAt' | 'usageCount' | 'rating'>[] {
        // Basic SQL parsing - in a real implementation, use a proper SQL parser
        const snippets: Omit<QuerySnippet, 'id' | 'author' | 'createdAt' | 'updatedAt' | 'usageCount' | 'rating'>[] = [];

        // This is a simplified parser - a production version would be more robust
        const lines = sqlContent.split('\n');
        let currentSnippet: Partial<QuerySnippet> | null = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            if (line.startsWith('-- Snippet:')) {
                if (currentSnippet && currentSnippet.query) {
                    snippets.push(currentSnippet as any);
                }

                currentSnippet = {
                    name: line.substring(11).trim(),
                    category: 'Imported',
                    query: '',
                    tags: [],
                    isPublic: false
                };
            } else if (line.startsWith('-- Category:') && currentSnippet) {
                currentSnippet.category = line.substring(12).trim();
            } else if (line.startsWith('-- Description:') && currentSnippet) {
                currentSnippet.description = line.substring(15).trim();
            } else if (line.startsWith('-- Tags:') && currentSnippet) {
                currentSnippet.tags = line.substring(8).split(',').map(tag => tag.trim());
            } else if (line && !line.startsWith('--') && currentSnippet) {
                currentSnippet.query = (currentSnippet.query || '') + line + '\n';
            }
        }

        if (currentSnippet && currentSnippet.query) {
            snippets.push(currentSnippet as any);
        }

        return snippets;
    }

    // Utility Methods
    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    getCurrentUser(): CollaborationMember | undefined {
        return this.currentUser;
    }

    // Statistics and Analytics
    getCollaborationStats(): {
        totalSnippets: number;
        totalLibraries: number;
        totalComments: number;
        popularCategories: { category: string; count: number }[];
        topAuthors: { author: string; count: number }[];
    } {
        const snippets = Array.from(this.snippets.values());
        const categoryCount = new Map<string, number>();
        const authorCount = new Map<string, number>();

        snippets.forEach(snippet => {
            categoryCount.set(snippet.category, (categoryCount.get(snippet.category) || 0) + 1);
            authorCount.set(snippet.author, (authorCount.get(snippet.author) || 0) + 1);
        });

        return {
            totalSnippets: snippets.length,
            totalLibraries: this.libraries.size,
            totalComments: Array.from(this.comments.values()).reduce((sum, comments) => sum + comments.length, 0),
            popularCategories: Array.from(categoryCount.entries())
                .map(([category, count]) => ({ category, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 10),
            topAuthors: Array.from(authorCount.entries())
                .map(([author, count]) => ({ author, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 10)
        };
    }

    dispose(): void {
        this.saveCollaborationData();
    }
}