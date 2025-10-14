import * as vscode from 'vscode';
import { Logger } from '@/utils/Logger';

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
    isOnline?: boolean;
    activeUsers?: string[];
    lastActivity?: Date;
}

export interface RealTimeSession {
    id: string;
    workspaceId: string;
    sessionType: 'schema_editing' | 'query_collaboration' | 'migration_review' | 'data_analysis';
    participants: SessionParticipant[];
    startTime: Date;
    endTime?: Date;
    isActive: boolean;
    sharedResources: SharedResource[];
    chatMessages: ChatMessage[];
    activityLog: ActivityLogEntry[];
}

export interface SessionParticipant {
    userId: string;
    userName: string;
    role: 'host' | 'editor' | 'viewer';
    joinedAt: Date;
    lastSeen: Date;
    cursor?: CursorPosition;
    isOnline: boolean;
}

export interface CursorPosition {
    line: number;
    column: number;
    filePath?: string;
    selection?: { start: number; end: number };
}

export interface SharedResource {
    id: string;
    type: 'query' | 'schema' | 'migration' | 'document';
    name: string;
    content: string;
    ownerId: string;
    lockedBy?: string;
    lockTime?: Date;
    version: number;
    lastModified: Date;
}

export interface ChatMessage {
    id: string;
    userId: string;
    userName: string;
    message: string;
    timestamp: Date;
    type: 'text' | 'system' | 'file_share' | 'resource_update';
    metadata?: Record<string, any>;
}

export interface ActivityLogEntry {
    id: string;
    userId: string;
    userName: string;
    action: string;
    resourceType: string;
    resourceId: string;
    timestamp: Date;
    details?: Record<string, any>;
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
    private activeSessions: Map<string, RealTimeSession> = new Map();
    private sessionParticipants: Map<string, SessionParticipant[]> = new Map();
    private sharedResources: Map<string, SharedResource> = new Map();
    private chatMessages: Map<string, ChatMessage[]> = new Map();
    private activityLogs: Map<string, ActivityLogEntry[]> = new Map();
    private presenceCallbacks: Map<string, (participants: SessionParticipant[]) => void> = new Map();

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

    // Real-Time Collaboration Features
    async createRealTimeSession(
        workspaceId: string,
        sessionType: RealTimeSession['sessionType'],
        resourceName: string,
        resourceContent: string
    ): Promise<RealTimeSession> {
        try {
            const sessionId = this.generateId();
            const session: RealTimeSession = {
                id: sessionId,
                workspaceId,
                sessionType,
                participants: [{
                    userId: this.currentUser?.userId || 'anonymous',
                    userName: this.currentUser?.name || 'Anonymous',
                    role: 'host',
                    joinedAt: new Date(),
                    lastSeen: new Date(),
                    isOnline: true
                }],
                startTime: new Date(),
                isActive: true,
                sharedResources: [{
                    id: this.generateId(),
                    type: sessionType === 'query_collaboration' ? 'query' : 'schema',
                    name: resourceName,
                    content: resourceContent,
                    ownerId: this.currentUser?.userId || 'anonymous',
                    version: 1,
                    lastModified: new Date()
                }],
                chatMessages: [],
                activityLog: []
            };

            this.activeSessions.set(sessionId, session);
            this.sessionParticipants.set(sessionId, session.participants);
            this.chatMessages.set(sessionId, []);
            this.activityLogs.set(sessionId, []);

            Logger.info('Real-time session created', 'createRealTimeSession', {
                sessionId,
                sessionType,
                workspaceId
            });

            return session;

        } catch (error) {
            Logger.error('Failed to create real-time session', error as Error);
            throw error;
        }
    }

    async joinSession(sessionId: string, userRole: 'editor' | 'viewer' = 'viewer'): Promise<boolean> {
        try {
            const session = this.activeSessions.get(sessionId);
            if (!session) {
                throw new Error(`Session ${sessionId} not found`);
            }

            if (!session.isActive) {
                throw new Error(`Session ${sessionId} is not active`);
            }

            const participant: SessionParticipant = {
                userId: this.currentUser?.userId || 'anonymous',
                userName: this.currentUser?.name || 'Anonymous',
                role: userRole,
                joinedAt: new Date(),
                lastSeen: new Date(),
                isOnline: true
            };

            const participants = this.sessionParticipants.get(sessionId) || [];
            participants.push(participant);
            this.sessionParticipants.set(sessionId, participants);

            // Add system message
            await this.addChatMessage(sessionId, '', 'System', `User ${participant.userName} joined the session`, 'system');

            // Log activity
            this.logActivity(sessionId, participant.userId, 'joined_session', 'session', sessionId);

            // Notify other participants
            this.notifyParticipants(sessionId, 'participant_joined', { participant });

            Logger.info('User joined session', 'joinSession', {
                sessionId,
                userId: participant.userId,
                role: userRole
            });

            return true;

        } catch (error) {
            Logger.error('Failed to join session', error as Error);
            return false;
        }
    }

    async leaveSession(sessionId: string): Promise<void> {
        try {
            const participants = this.sessionParticipants.get(sessionId) || [];
            const currentUserId = this.currentUser?.userId || 'anonymous';

            const updatedParticipants = participants.filter(p => p.userId !== currentUserId);
            this.sessionParticipants.set(sessionId, updatedParticipants);

            // Add system message
            const userName = this.currentUser?.name || 'Anonymous';
            await this.addChatMessage(sessionId, '', 'System', `User ${userName} left the session`, 'system');

            // Log activity
            this.logActivity(sessionId, currentUserId, 'left_session', 'session', sessionId);

            // If no participants left, end the session
            if (updatedParticipants.length === 0) {
                await this.endSession(sessionId);
            } else {
                // Notify remaining participants
                this.notifyParticipants(sessionId, 'participant_left', { userId: currentUserId });
            }

            Logger.info('User left session', 'leaveSession', { sessionId, userId: currentUserId });

        } catch (error) {
            Logger.error('Failed to leave session', error as Error);
        }
    }

    async updateResource(
        sessionId: string,
        resourceId: string,
        newContent: string,
        cursorPosition?: CursorPosition
    ): Promise<void> {
        try {
            const resource = this.sharedResources.get(resourceId);
            if (!resource) {
                throw new Error(`Resource ${resourceId} not found`);
            }

            // Check if resource is locked by someone else
            if (resource.lockedBy && resource.lockedBy !== this.currentUser?.userId) {
                throw new Error('Resource is locked by another user');
            }

            // Lock resource for current user
            resource.lockedBy = this.currentUser?.userId;
            resource.lockTime = new Date();
            resource.content = newContent;
            resource.version++;
            resource.lastModified = new Date();

            this.sharedResources.set(resourceId, resource);

            // Update participant cursor if provided
            if (cursorPosition) {
                await this.updateCursorPosition(sessionId, cursorPosition);
            }

            // Log activity
            this.logActivity(sessionId, this.currentUser?.userId || 'anonymous', 'updated_resource', resource.type, resourceId);

            // Notify other participants
            this.notifyParticipants(sessionId, 'resource_updated', {
                resourceId,
                updatedBy: this.currentUser?.userId,
                version: resource.version
            });

            Logger.info('Resource updated', 'updateResource', {
                sessionId,
                resourceId,
                version: resource.version
            });

        } catch (error) {
            Logger.error('Failed to update resource', error as Error);
            throw error;
        }
    }

    async addChatMessage(
        sessionId: string,
        resourceId: string,
        userName: string,
        message: string,
        type: ChatMessage['type'] = 'text'
    ): Promise<void> {
        try {
            const chatMessage: ChatMessage = {
                id: this.generateId(),
                userId: this.currentUser?.userId || 'anonymous',
                userName,
                message,
                timestamp: new Date(),
                type,
                metadata: { resourceId }
            };

            const messages = this.chatMessages.get(sessionId) || [];
            messages.push(chatMessage);
            this.chatMessages.set(sessionId, messages);

            // Log activity
            this.logActivity(sessionId, chatMessage.userId, 'sent_message', 'chat', chatMessage.id);

            // Notify participants
            this.notifyParticipants(sessionId, 'new_message', { message: chatMessage });

            Logger.debug('Chat message added', 'addChatMessage', {
                sessionId,
                messageId: chatMessage.id
            });

        } catch (error) {
            Logger.error('Failed to add chat message', error as Error);
        }
    }

    async lockResource(sessionId: string, resourceId: string): Promise<boolean> {
        try {
            const resource = this.sharedResources.get(resourceId);
            if (!resource) {
                throw new Error(`Resource ${resourceId} not found`);
            }

            // Check if already locked
            if (resource.lockedBy && resource.lockedBy !== this.currentUser?.userId) {
                return false; // Already locked by someone else
            }

            resource.lockedBy = this.currentUser?.userId;
            resource.lockTime = new Date();
            this.sharedResources.set(resourceId, resource);

            // Log activity
            this.logActivity(sessionId, this.currentUser?.userId || 'anonymous', 'locked_resource', resource.type, resourceId);

            // Notify participants
            this.notifyParticipants(sessionId, 'resource_locked', {
                resourceId,
                lockedBy: this.currentUser?.userId
            });

            Logger.info('Resource locked', 'lockResource', {
                sessionId,
                resourceId,
                userId: this.currentUser?.userId
            });

            return true;

        } catch (error) {
            Logger.error('Failed to lock resource', error as Error);
            return false;
        }
    }

    async unlockResource(sessionId: string, resourceId: string): Promise<void> {
        try {
            const resource = this.sharedResources.get(resourceId);
            if (!resource) {
                throw new Error(`Resource ${resourceId} not found`);
            }

            // Only allow unlocking by the user who locked it
            if (resource.lockedBy !== this.currentUser?.userId) {
                throw new Error('Only the user who locked the resource can unlock it');
            }

            resource.lockedBy = undefined;
            resource.lockTime = undefined;
            this.sharedResources.set(resourceId, resource);

            // Log activity
            this.logActivity(sessionId, this.currentUser?.userId || 'anonymous', 'unlocked_resource', resource.type, resourceId);

            // Notify participants
            this.notifyParticipants(sessionId, 'resource_unlocked', {
                resourceId,
                unlockedBy: this.currentUser?.userId
            });

            Logger.info('Resource unlocked', 'unlockResource', {
                sessionId,
                resourceId,
                userId: this.currentUser?.userId
            });

        } catch (error) {
            Logger.error('Failed to unlock resource', error as Error);
            throw error;
        }
    }

    async updateCursorPosition(sessionId: string, position: CursorPosition): Promise<void> {
        try {
            const participants = this.sessionParticipants.get(sessionId) || [];
            const currentUserId = this.currentUser?.userId || 'anonymous';

            const participant = participants.find(p => p.userId === currentUserId);
            if (participant) {
                participant.cursor = position;
                participant.lastSeen = new Date();
                this.sessionParticipants.set(sessionId, participants);

                // Notify other participants about cursor movement
                this.notifyParticipants(sessionId, 'cursor_updated', {
                    userId: currentUserId,
                    position
                });
            }

        } catch (error) {
            Logger.error('Failed to update cursor position', error as Error);
        }
    }

    private async endSession(sessionId: string): Promise<void> {
        try {
            const session = this.activeSessions.get(sessionId);
            if (session) {
                session.isActive = false;
                session.endTime = new Date();
                this.activeSessions.set(sessionId, session);

                // Notify all participants
                this.notifyParticipants(sessionId, 'session_ended', {
                    sessionId,
                    endedBy: 'system',
                    endTime: session.endTime
                });

                Logger.info('Session ended', 'endSession', { sessionId });
            }

        } catch (error) {
            Logger.error('Failed to end session', error as Error);
        }
    }

    private logActivity(
        sessionId: string,
        userId: string,
        action: string,
        resourceType: string,
        resourceId: string,
        details?: Record<string, any>
    ): void {
        const activity: ActivityLogEntry = {
            id: this.generateId(),
            userId,
            userName: this.currentUser?.name || 'Anonymous',
            action,
            resourceType,
            resourceId,
            timestamp: new Date(),
            details
        };

        const activities = this.activityLogs.get(sessionId) || [];
        activities.push(activity);
        this.activityLogs.set(sessionId, activities);
    }

    private notifyParticipants(sessionId: string, _eventType: string, _data: any): void {
        // In a real implementation, this would use WebSockets or VSCode's presence API
        // For now, we'll use a callback system
        const callback = this.presenceCallbacks.get(sessionId);
        if (callback) {
            const participants = this.sessionParticipants.get(sessionId) || [];
            callback(participants);
        }
    }

    // Public API for real-time features
    onParticipantsChanged(sessionId: string, callback: (participants: SessionParticipant[]) => void): void {
        this.presenceCallbacks.set(sessionId, callback);
    }

    getActiveSession(sessionId: string): RealTimeSession | undefined {
        return this.activeSessions.get(sessionId);
    }

    getSessionParticipants(sessionId: string): SessionParticipant[] {
        return this.sessionParticipants.get(sessionId) || [];
    }

    getSharedResource(resourceId: string): SharedResource | undefined {
        return this.sharedResources.get(resourceId);
    }

    getChatMessages(sessionId: string): ChatMessage[] {
        return this.chatMessages.get(sessionId) || [];
    }

    getActivityLog(sessionId: string): ActivityLogEntry[] {
        return this.activityLogs.get(sessionId) || [];
    }

    // Statistics and Analytics
    getCollaborationStats(): {
        totalSnippets: number;
        totalLibraries: number;
        totalComments: number;
        popularCategories: { category: string; count: number }[];
        topAuthors: { author: string; count: number }[];
        activeSessions: number;
        totalParticipants: number;
    } {
        const snippets = Array.from(this.snippets.values());
        const categoryCount = new Map<string, number>();
        const authorCount = new Map<string, number>();

        snippets.forEach(snippet => {
            categoryCount.set(snippet.category, (categoryCount.get(snippet.category) || 0) + 1);
            authorCount.set(snippet.author, (authorCount.get(snippet.author) || 0) + 1);
        });

        const activeSessions = Array.from(this.activeSessions.values()).filter(s => s.isActive).length;
        const totalParticipants = Array.from(this.sessionParticipants.values())
            .reduce((sum, participants) => sum + participants.length, 0);

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
                .slice(0, 10),
            activeSessions,
            totalParticipants
        };
    }

    dispose(): void {
        this.saveCollaborationData();
    }
}