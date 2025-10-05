import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';
import { ErrorHandler } from '../utils/ErrorHandler';

export interface TeamMember {
    id: string;
    name: string;
    email: string;
    role: 'admin' | 'editor' | 'viewer';
    status: 'online' | 'offline' | 'away';
    lastSeen: string;
    avatar?: string;
}

export interface CollaborationWorkspace {
    id: string;
    name: string;
    description?: string;
    owner: string;
    members: TeamMember[];
    databases: string[]; // Connection IDs
    createdAt: string;
    updatedAt: string;
    settings: WorkspaceSettings;
}

export interface WorkspaceSettings {
    allowGuestAccess: boolean;
    requireApprovalForMigrations: boolean;
    notifyOnSchemaChanges: boolean;
    autoSyncEnabled: boolean;
    conflictResolution: 'manual' | 'auto_merge' | 'last_writer_wins';
}

export interface SchemaLock {
    id: string;
    objectType: string;
    objectName: string;
    schema: string;
    lockedBy: string;
    lockedAt: string;
    expiresAt: string;
    reason?: string | undefined;
}

export interface CollaborationEvent {
    id: string;
    type: 'schema_change' | 'migration' | 'comment' | 'lock' | 'unlock' | 'member_joined' | 'member_left';
    userId: string;
    userName: string;
    workspaceId: string;
    timestamp: string;
    data: Record<string, any>;
}

export class CollaborationService {
    private static instance: CollaborationService;
    private currentWorkspace: CollaborationWorkspace | undefined;
    private activeLocks: Map<string, SchemaLock> = new Map();
    private collaborationEvents: CollaborationEvent[] = [];
    private eventEmitter: vscode.EventEmitter<CollaborationEvent> = new vscode.EventEmitter();
    private maxEvents = 1000;

    private constructor() {
        this.startEventCleanup();
    }

    static getInstance(): CollaborationService {
        if (!CollaborationService.instance) {
            CollaborationService.instance = new CollaborationService();
        }
        return CollaborationService.instance;
    }

    /**
     * Creates a new collaboration workspace
     */
    async createWorkspace(
        name: string,
        description: string,
        databases: string[]
    ): Promise<CollaborationWorkspace> {
        try {
            Logger.info('Creating collaboration workspace', 'createWorkspace', { name, databaseCount: databases.length });

            const workspace: CollaborationWorkspace = {
                id: this.generateId(),
                name,
                description,
                owner: this.getCurrentUserId(),
                members: [{
                    id: this.getCurrentUserId(),
                    name: this.getCurrentUserName(),
                    email: this.getCurrentUserEmail(),
                    role: 'admin',
                    status: 'online',
                    lastSeen: new Date().toISOString()
                }],
                databases,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                settings: {
                    allowGuestAccess: false,
                    requireApprovalForMigrations: true,
                    notifyOnSchemaChanges: true,
                    autoSyncEnabled: false,
                    conflictResolution: 'manual'
                }
            };

            this.currentWorkspace = workspace;

            const event: CollaborationEvent = {
                id: this.generateId(),
                type: 'member_joined',
                userId: workspace.owner,
                userName: workspace.members[0].name,
                workspaceId: workspace.id,
                timestamp: new Date().toISOString(),
                data: { role: 'admin', isOwner: true }
            };

            this.addEvent(event);

            Logger.info('Collaboration workspace created', 'createWorkspace', { workspaceId: workspace.id });
            return workspace;

        } catch (error) {
            Logger.error('Failed to create workspace', error as Error, 'createWorkspace');
            throw error;
        }
    }

    /**
     * Joins an existing workspace
     */
    async joinWorkspace(workspaceId: string, inviteCode?: string): Promise<CollaborationWorkspace> {
        try {
            Logger.info('Joining collaboration workspace', 'joinWorkspace', { workspaceId });

            // In a real implementation, this would validate the invite code
            // and fetch workspace data from a server

            const workspace: CollaborationWorkspace = {
                id: workspaceId,
                name: 'Shared Schema Workspace',
                owner: 'team-lead',
                members: [
                    {
                        id: 'team-lead',
                        name: 'Team Lead',
                        email: 'lead@company.com',
                        role: 'admin',
                        status: 'online',
                        lastSeen: new Date().toISOString()
                    },
                    {
                        id: this.getCurrentUserId(),
                        name: this.getCurrentUserName(),
                        email: this.getCurrentUserEmail(),
                        role: 'editor',
                        status: 'online',
                        lastSeen: new Date().toISOString()
                    }
                ],
                databases: ['connection-1', 'connection-2'],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                settings: {
                    allowGuestAccess: false,
                    requireApprovalForMigrations: true,
                    notifyOnSchemaChanges: true,
                    autoSyncEnabled: false,
                    conflictResolution: 'manual'
                }
            };

            this.currentWorkspace = workspace;

            const event: CollaborationEvent = {
                id: this.generateId(),
                type: 'member_joined',
                userId: this.getCurrentUserId(),
                userName: this.getCurrentUserName(),
                workspaceId: workspace.id,
                timestamp: new Date().toISOString(),
                data: { role: 'editor' }
            };

            this.addEvent(event);

            Logger.info('Joined collaboration workspace', 'joinWorkspace', { workspaceId });
            return workspace;

        } catch (error) {
            Logger.error('Failed to join workspace', error as Error, 'joinWorkspace');
            throw error;
        }
    }

    /**
     * Locks a schema object for editing
     */
    async lockObject(
        objectType: string,
        objectName: string,
        schema: string,
        reason?: string
    ): Promise<SchemaLock | null> {
        try {
            if (!this.currentWorkspace) {
                throw new Error('No active workspace');
            }

            const lockId = `${objectType}-${objectName}-${schema}`;
            const existingLock = this.activeLocks.get(lockId);

            if (existingLock && existingLock.expiresAt > new Date().toISOString()) {
                throw new Error(`Object is already locked by ${existingLock.lockedBy}`);
            }

            const lock: SchemaLock = {
                id: lockId,
                objectType,
                objectName,
                schema,
                lockedBy: this.getCurrentUserId(),
                lockedAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutes
                reason
            };

            this.activeLocks.set(lockId, lock);

            const event: CollaborationEvent = {
                id: this.generateId(),
                type: 'lock',
                userId: this.getCurrentUserId(),
                userName: this.getCurrentUserName(),
                workspaceId: this.currentWorkspace.id,
                timestamp: new Date().toISOString(),
                data: { objectType, objectName, schema, reason }
            };

            this.addEvent(event);

            Logger.info('Schema object locked', 'lockObject', {
                objectType, objectName, schema, lockId
            });

            return lock;

        } catch (error) {
            Logger.error('Failed to lock object', error as Error, 'lockObject');
            return null;
        }
    }

    /**
     * Unlocks a schema object
     */
    async unlockObject(
        objectType: string,
        objectName: string,
        schema: string
    ): Promise<boolean> {
        try {
            if (!this.currentWorkspace) {
                throw new Error('No active workspace');
            }

            const lockId = `${objectType}-${objectName}-${schema}`;
            const lock = this.activeLocks.get(lockId);

            if (!lock) {
                Logger.warn('Attempted to unlock non-existent lock', 'unlockObject', { lockId });
                return false;
            }

            if (lock.lockedBy !== this.getCurrentUserId()) {
                throw new Error('Can only unlock objects locked by yourself');
            }

            this.activeLocks.delete(lockId);

            const event: CollaborationEvent = {
                id: this.generateId(),
                type: 'unlock',
                userId: this.getCurrentUserId(),
                userName: this.getCurrentUserName(),
                workspaceId: this.currentWorkspace.id,
                timestamp: new Date().toISOString(),
                data: { objectType, objectName, schema }
            };

            this.addEvent(event);

            Logger.info('Schema object unlocked', 'unlockObject', {
                objectType, objectName, schema, lockId
            });

            return true;

        } catch (error) {
            Logger.error('Failed to unlock object', error as Error, 'unlockObject');
            return false;
        }
    }

    /**
     * Gets all active locks in the current workspace
     */
    getActiveLocks(): SchemaLock[] {
        const now = new Date().toISOString();
        const activeLocks: SchemaLock[] = [];

        for (const lock of this.activeLocks.values()) {
            if (lock.expiresAt > now) {
                activeLocks.push(lock);
            } else {
                // Remove expired locks
                this.activeLocks.delete(lock.id);
            }
        }

        return activeLocks;
    }

    /**
     * Checks if an object is locked
     */
    isObjectLocked(objectType: string, objectName: string, schema: string): SchemaLock | null {
        const lockId = `${objectType}-${objectName}-${schema}`;
        const lock = this.activeLocks.get(lockId);

        if (lock && lock.expiresAt > new Date().toISOString()) {
            return lock;
        }

        return null;
    }

    /**
     * Adds a collaboration event
     */
    private addEvent(event: CollaborationEvent): void {
        this.collaborationEvents.push(event);

        // Limit stored events
        if (this.collaborationEvents.length > this.maxEvents) {
            this.collaborationEvents.splice(0, this.collaborationEvents.length - this.maxEvents);
        }

        // Emit event for listeners
        this.eventEmitter.fire(event);

        Logger.debug('Collaboration event added', 'addEvent', {
            eventId: event.id,
            type: event.type,
            userId: event.userId
        });
    }

    /**
     * Gets collaboration events
     */
    getEvents(workspaceId?: string, limit?: number): CollaborationEvent[] {
        let events = workspaceId
            ? this.collaborationEvents.filter(e => e.workspaceId === workspaceId)
            : this.collaborationEvents;

        events = events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        if (limit) {
            events = events.slice(0, limit);
        }

        return events;
    }

    /**
     * Gets the current workspace
     */
    getCurrentWorkspace(): CollaborationWorkspace | undefined {
        return this.currentWorkspace;
    }

    /**
     * Gets team members in current workspace
     */
    getTeamMembers(): TeamMember[] {
        return this.currentWorkspace?.members || [];
    }

    /**
     * Updates member status
     */
    updateMemberStatus(status: TeamMember['status']): void {
        if (this.currentWorkspace) {
            const currentUser = this.currentWorkspace.members.find(m => m.id === this.getCurrentUserId());
            if (currentUser) {
                currentUser.status = status;
                currentUser.lastSeen = new Date().toISOString();

                Logger.debug('Member status updated', 'updateMemberStatus', {
                    userId: currentUser.id,
                    status
                });
            }
        }
    }

    /**
     * Leaves the current workspace
     */
    async leaveWorkspace(): Promise<void> {
        if (this.currentWorkspace) {
            const event: CollaborationEvent = {
                id: this.generateId(),
                type: 'member_left',
                userId: this.getCurrentUserId(),
                userName: this.getCurrentUserName(),
                workspaceId: this.currentWorkspace.id,
                timestamp: new Date().toISOString(),
                data: {}
            };

            this.addEvent(event);

            this.currentWorkspace = undefined;
            this.activeLocks.clear();

            Logger.info('Left collaboration workspace', 'leaveWorkspace');
        }
    }

    /**
     * Gets collaboration statistics
     */
    getCollaborationStats(): {
        activeWorkspaces: number;
        totalMembers: number;
        activeLocks: number;
        totalEvents: number;
        eventsToday: number;
    } {
        const today = new Date().toISOString().split('T')[0];
        const eventsToday = this.collaborationEvents.filter(e =>
            e.timestamp.startsWith(today)
        ).length;

        return {
            activeWorkspaces: this.currentWorkspace ? 1 : 0,
            totalMembers: this.currentWorkspace?.members.length || 0,
            activeLocks: this.activeLocks.size,
            totalEvents: this.collaborationEvents.length,
            eventsToday
        };
    }

    /**
     * Event listener for collaboration events
     */
    onCollaborationEvent(listener: (event: CollaborationEvent) => void): vscode.Disposable {
        return this.eventEmitter.event(listener);
    }

    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    private getCurrentUserId(): string {
        // In a real implementation, this would get the actual user ID
        return 'user-' + vscode.env.sessionId || 'current-user';
    }

    private getCurrentUserName(): string {
        // In a real implementation, this would get the actual user name
        return vscode.env.appName || 'Current User';
    }

    private getCurrentUserEmail(): string {
        // In a real implementation, this would get the actual user email
        return 'user@example.com';
    }

    private startEventCleanup(): void {
        // Clean up expired locks every minute
        setInterval(() => {
            const now = new Date().toISOString();
            for (const [lockId, lock] of this.activeLocks.entries()) {
                if (lock.expiresAt <= now) {
                    this.activeLocks.delete(lockId);
                    Logger.debug('Expired lock removed', 'startEventCleanup', { lockId });
                }
            }
        }, 60000);

        Logger.info('Collaboration event cleanup started', 'startEventCleanup');
    }

    dispose(): void {
        this.collaborationEvents.length = 0;
        this.activeLocks.clear();
        this.eventEmitter.dispose();
        Logger.info('CollaborationService disposed', 'dispose');
    }
}