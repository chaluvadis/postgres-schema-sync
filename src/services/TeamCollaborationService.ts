import * as vscode from 'vscode';
import { Logger } from '@/utils/Logger';
import { ErrorHandler } from '@/utils/ErrorHandler';

export interface QuerySnippet {
    id: string;
    name: string;
    description?: string;
    query: string;
    category: string;
    tags: string[];
    author: string;
    authorId: string;
    teamId: string;
    isPublic: boolean;
    usageCount: number;
    createdAt: Date;
    updatedAt: Date;
    comments?: QueryComment[];
}

export interface QueryComment {
    id: string;
    content: string;
    author: string;
    authorId: string;
    createdAt: Date;
}

export interface TeamQueryLibrary {
    id: string;
    name: string;
    description?: string;
    members: string[];
    snippets: QuerySnippet[];
    isPublic: boolean;
    createdAt: Date;
    updatedAt: Date;
    ownerId: string;
}

export interface TeamUser {
    userId: string;
    username: string;
    displayName: string;
    email?: string;
}

export interface CollaborationStats {
    totalSnippets: number;
    totalLibraries: number;
    totalComments: number;
    totalUsers: number;
    topAuthors: Array<{
        author: string;
        count: number;
    }>;
}

export class TeamCollaborationService {
    private libraries: Map<string, TeamQueryLibrary> = new Map();
    private snippets: Map<string, QuerySnippet> = new Map();
    private currentUser: TeamUser | null = null;
    private categories: string[] = [
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DDL', 'DML', 'Analytics',
        'Reporting', 'Maintenance', 'Monitoring', 'Security', 'Performance'
    ];

    constructor() {
        this.initializeService();
    }

    private async initializeService(): Promise<void> {
        try {
            // Initialize with current VSCode user
            const vscodeUser = vscode.env.machineId; // Using machine ID as user identifier
            this.currentUser = {
                userId: vscodeUser,
                username: vscode.env.sessionId || 'current-user',
                displayName: 'Current User',
                email: undefined
            };

            // Load some sample data for demonstration
            await this.loadSampleData();

            Logger.info('TeamCollaborationService initialized', 'initializeService', {
                userId: this.currentUser.userId,
                libraryCount: this.libraries.size
            });
        } catch (error) {
            Logger.error('Failed to initialize TeamCollaborationService', error as Error);
            ErrorHandler.handleError(error, ErrorHandler.createContext('TeamCollaborationServiceInit'));
        }
    }

    private async loadSampleData(): Promise<void> {
        // Create a sample personal library
        const personalLibrary = await this.createTeamLibrary({
            name: 'Personal Library',
            description: 'My personal query collection',
            members: [this.currentUser?.userId || 'current-user'],
            snippets: [],
            isPublic: false
        });

        // Add some sample snippets
        await this.createSnippet({
            name: 'Get Active Users',
            description: 'Retrieve all active users from the system',
            query: 'SELECT id, username, email, last_login FROM users WHERE active = true ORDER BY last_login DESC;',
            category: 'SELECT',
            tags: ['users', 'active', 'select'],
            teamId: personalLibrary.id,
            isPublic: false
        });

        await this.createSnippet({
            name: 'Update User Status',
            description: 'Update user active status',
            query: 'UPDATE users SET active = @status, updated_at = NOW() WHERE id = @userId;',
            category: 'UPDATE',
            tags: ['users', 'update', 'status'],
            teamId: personalLibrary.id,
            isPublic: false
        });
    }

    getCurrentUser(): TeamUser | null {
        return this.currentUser;
    }

    getTeamLibraries(): TeamQueryLibrary[] {
        return Array.from(this.libraries.values());
    }

    async createTeamLibrary(libraryData: {
        name: string;
        description?: string;
        members: string[];
        snippets?: QuerySnippet[];
        isPublic: boolean;
    }): Promise<TeamQueryLibrary> {
        try {
            const libraryId = `lib_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const now = new Date();

            const library: TeamQueryLibrary = {
                id: libraryId,
                name: libraryData.name,
                description: libraryData.description,
                members: libraryData.members,
                snippets: libraryData.snippets || [],
                isPublic: libraryData.isPublic,
                createdAt: now,
                updatedAt: now,
                ownerId: this.currentUser?.userId || 'current-user'
            };

            this.libraries.set(libraryId, library);

            Logger.info('Team library created', 'createTeamLibrary', {
                libraryId,
                name: libraryData.name,
                memberCount: libraryData.members.length
            });

            return library;
        } catch (error) {
            Logger.error('Failed to create team library', error as Error);
            throw error;
        }
    }

    async createSnippet(snippetData: {
        name: string;
        description?: string;
        query: string;
        category: string;
        tags: string[];
        teamId: string;
        isPublic: boolean;
    }): Promise<QuerySnippet> {
        try {
            const snippetId = `snippet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const now = new Date();

            const snippet: QuerySnippet = {
                id: snippetId,
                name: snippetData.name,
                description: snippetData.description,
                query: snippetData.query,
                category: snippetData.category,
                tags: snippetData.tags,
                author: this.currentUser?.displayName || 'Current User',
                authorId: this.currentUser?.userId || 'current-user',
                teamId: snippetData.teamId,
                isPublic: snippetData.isPublic,
                usageCount: 0,
                createdAt: now,
                updatedAt: now,
                comments: []
            };

            this.snippets.set(snippetId, snippet);

            // Add to library
            const library = this.libraries.get(snippetData.teamId);
            if (library) {
                library.snippets.push(snippet);
                library.updatedAt = now;
            }

            Logger.info('Snippet created', 'createSnippet', {
                snippetId,
                name: snippetData.name,
                teamId: snippetData.teamId
            });

            return snippet;
        } catch (error) {
            Logger.error('Failed to create snippet', error as Error);
            throw error;
        }
    }

    async updateSnippet(snippetId: string, updates: Partial<QuerySnippet>): Promise<void> {
        try {
            const snippet = this.snippets.get(snippetId);
            if (!snippet) {
                throw new Error(`Snippet ${snippetId} not found`);
            }

            // Update snippet
            Object.assign(snippet, updates, { updatedAt: new Date() });
            this.snippets.set(snippetId, snippet);

            // Update in library
            const library = this.libraries.get(snippet.teamId);
            if (library) {
                const snippetIndex = library.snippets.findIndex(s => s.id === snippetId);
                if (snippetIndex >= 0) {
                    library.snippets[snippetIndex] = snippet;
                    library.updatedAt = new Date();
                }
            }

            Logger.info('Snippet updated', 'updateSnippet', { snippetId });
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

            // Remove from snippets map
            this.snippets.delete(snippetId);

            // Remove from library
            const library = this.libraries.get(snippet.teamId);
            if (library) {
                library.snippets = library.snippets.filter(s => s.id !== snippetId);
                library.updatedAt = new Date();
            }

            Logger.info('Snippet deleted', 'deleteSnippet', { snippetId });
        } catch (error) {
            Logger.error('Failed to delete snippet', error as Error);
            throw error;
        }
    }

    getSnippet(snippetId: string): QuerySnippet | undefined {
        return this.snippets.get(snippetId);
    }

    async searchSnippets(query: string, filters: {
        category?: string;
        author?: string;
        isPublic?: boolean;
        tags?: string[];
    } = {}): Promise<QuerySnippet[]> {
        try {
            let results = Array.from(this.snippets.values());

            // Apply search query
            if (query.trim()) {
                const searchTerm = query.toLowerCase();
                results = results.filter(snippet =>
                    snippet.name.toLowerCase().includes(searchTerm) ||
                    snippet.description?.toLowerCase().includes(searchTerm) ||
                    snippet.query.toLowerCase().includes(searchTerm) ||
                    snippet.tags.some(tag => tag.toLowerCase().includes(searchTerm))
                );
            }

            // Apply filters
            if (filters.category) {
                results = results.filter(snippet => snippet.category === filters.category);
            }

            if (filters.author) {
                results = results.filter(snippet => snippet.author === filters.author);
            }

            if (filters.isPublic !== undefined) {
                results = results.filter(snippet => snippet.isPublic === filters.isPublic);
            }

            if (filters.tags && filters.tags.length > 0) {
                results = results.filter(snippet =>
                    filters.tags!.some(tag => snippet.tags.includes(tag))
                );
            }

            Logger.info('Snippets searched', 'searchSnippets', {
                query,
                filterCount: Object.keys(filters).length,
                resultCount: results.length
            });

            return results;
        } catch (error) {
            Logger.error('Failed to search snippets', error as Error);
            throw error;
        }
    }

    async importSnippets(data: string, format: 'json' | 'sql', libraryId?: string): Promise<number> {
        try {
            let importedCount = 0;

            if (format === 'json') {
                const snippetsData = JSON.parse(data) as QuerySnippet[];
                for (const snippetData of snippetsData) {
                    await this.createSnippet({
                        ...snippetData,
                        teamId: libraryId || 'default'
                    });
                    importedCount++;
                }
            } else if (format === 'sql') {
                // Basic SQL parsing - this is a simplified implementation
                const sqlSnippets = this.parseSQLToSnippets(data);
                for (const snippetData of sqlSnippets) {
                    await this.createSnippet({
                        ...snippetData,
                        teamId: libraryId || 'default'
                    });
                    importedCount++;
                }
            }

            Logger.info('Snippets imported', 'importSnippets', {
                format,
                count: importedCount,
                libraryId
            });

            return importedCount;
        } catch (error) {
            Logger.error('Failed to import snippets', error as Error);
            throw error;
        }
    }

    async exportLibrary(libraryId: string, format: 'json' | 'sql'): Promise<string> {
        try {
            const library = this.libraries.get(libraryId);
            if (!library) {
                throw new Error(`Library ${libraryId} not found`);
            }

            if (format === 'json') {
                return JSON.stringify(library.snippets, null, 2);
            } else if (format === 'sql') {
                return this.convertSnippetsToSQL(library.snippets);
            }

            throw new Error(`Unsupported export format: ${format}`);
        } catch (error) {
            Logger.error('Failed to export library', error as Error);
            throw error;
        }
    }

    async addComment(snippetId: string, content: string): Promise<void> {
        try {
            const snippet = this.snippets.get(snippetId);
            if (!snippet) {
                throw new Error(`Snippet ${snippetId} not found`);
            }

            const comment: QueryComment = {
                id: `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                content,
                author: this.currentUser?.displayName || 'Current User',
                authorId: this.currentUser?.userId || 'current-user',
                createdAt: new Date()
            };

            if (!snippet.comments) {
                snippet.comments = [];
            }
            snippet.comments.push(comment);

            Logger.info('Comment added', 'addComment', { snippetId });
        } catch (error) {
            Logger.error('Failed to add comment', error as Error);
            throw error;
        }
    }

    async incrementSnippetUsage(snippetId: string): Promise<void> {
        try {
            const snippet = this.snippets.get(snippetId);
            if (snippet) {
                snippet.usageCount++;
                snippet.updatedAt = new Date();
            }
        } catch (error) {
            Logger.error('Failed to increment snippet usage', error as Error);
        }
    }

    getCollaborationStats(): CollaborationStats {
        const snippets = Array.from(this.snippets.values());
        const libraries = Array.from(this.libraries.values());

        // Calculate author statistics
        const authorStats = new Map<string, number>();
        snippets.forEach(snippet => {
            const current = authorStats.get(snippet.author) || 0;
            authorStats.set(snippet.author, current + 1);
        });

        const topAuthors = Array.from(authorStats.entries())
            .map(([author, count]) => ({ author, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        return {
            totalSnippets: snippets.length,
            totalLibraries: libraries.length,
            totalComments: snippets.reduce((total, snippet) => total + (snippet.comments?.length || 0), 0),
            totalUsers: new Set([
                ...libraries.flatMap(lib => lib.members),
                ...snippets.map(s => s.authorId)
            ]).size,
            topAuthors
        };
    }

    getCategories(): string[] {
        return [...this.categories];
    }

    getAllTags(): string[] {
        const tags = new Set<string>();
        this.snippets.forEach(snippet => {
            snippet.tags.forEach(tag => tags.add(tag));
        });
        return Array.from(tags).sort();
    }

    private parseSQLToSnippets(sqlContent: string): Array<{
        name: string;
        query: string;
        category: string;
        tags: string[];
        isPublic: boolean;
    }> {
        // This is a very basic SQL parser for demonstration
        // In a real implementation, you'd want a more sophisticated parser
        const snippets: Array<{
            name: string;
            query: string;
            category: string;
            tags: string[];
            isPublic: boolean;
        }> = [];

        const sqlStatements = sqlContent.split(';').filter(stmt => stmt.trim().length > 0);

        sqlStatements.forEach((statement, index) => {
            const trimmed = statement.trim();
            if (trimmed.length === 0) return;

            let category = 'SELECT';
            if (trimmed.toUpperCase().includes('INSERT')) category = 'INSERT';
            else if (trimmed.toUpperCase().includes('UPDATE')) category = 'UPDATE';
            else if (trimmed.toUpperCase().includes('DELETE')) category = 'DELETE';
            else if (trimmed.toUpperCase().includes('CREATE') || trimmed.toUpperCase().includes('ALTER') || trimmed.toUpperCase().includes('DROP')) category = 'DDL';

            snippets.push({
                name: `Imported Query ${index + 1}`,
                query: trimmed,
                category,
                tags: ['imported', 'sql'],
                isPublic: false
            });
        });

        return snippets;
    }

    private convertSnippetsToSQL(snippets: QuerySnippet[]): string {
        return snippets.map(snippet => {
            const comment = snippet.description ? `-- ${snippet.description}\n` : '';
            return `${comment}${snippet.query};`;
        }).join('\n\n');
    }

    dispose(): void {
        this.libraries.clear();
        this.snippets.clear();
        Logger.info('TeamCollaborationService disposed', 'dispose');
    }
}