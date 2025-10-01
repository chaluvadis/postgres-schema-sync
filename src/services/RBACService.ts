import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';

/**
 * User roles in the system
 */
export enum UserRole {
    ADMIN = 'ADMIN',
    DEVELOPER = 'DEVELOPER',
    ANALYST = 'ANALYST',
    VIEWER = 'VIEWER'
}

/**
 * Permissions available in the system
 */
export enum Permission {
    // Connection Management
    CREATE_CONNECTION = 'CREATE_CONNECTION',
    READ_CONNECTION = 'READ_CONNECTION',
    UPDATE_CONNECTION = 'UPDATE_CONNECTION',
    DELETE_CONNECTION = 'DELETE_CONNECTION',
    TEST_CONNECTION = 'TEST_CONNECTION',

    // Schema Operations
    BROWSE_SCHEMA = 'BROWSE_SCHEMA',
    VIEW_OBJECT_DETAILS = 'VIEW_OBJECT_DETAILS',

    // Comparison Operations
    COMPARE_SCHEMAS = 'COMPARE_SCHEMAS',

    // Migration Operations
    GENERATE_MIGRATION = 'GENERATE_MIGRATION',
    EXECUTE_MIGRATION = 'EXECUTE_MIGRATION',
    ROLLBACK_MIGRATION = 'ROLLBACK_MIGRATION',
    PREVIEW_MIGRATION = 'PREVIEW_MIGRATION',

    // Administration
    MANAGE_USERS = 'MANAGE_USERS',
    VIEW_AUDIT_LOGS = 'VIEW_AUDIT_LOGS',
    MANAGE_SETTINGS = 'MANAGE_SETTINGS',
    ROTATE_KEYS = 'ROTATE_KEYS',

    // Data Operations
    EXPORT_DATA = 'EXPORT_DATA',
    IMPORT_DATA = 'IMPORT_DATA'
}

/**
 * Resource types that can have permissions
 */
export enum ResourceType {
    CONNECTION = 'CONNECTION',
    SCHEMA = 'SCHEMA',
    DATABASE = 'DATABASE',
    WORKSPACE = 'WORKSPACE',
    SYSTEM = 'SYSTEM'
}

/**
 * User profile interface
 */
export interface UserProfile {
    id: string;
    name: string;
    email?: string;
    role: UserRole;
    permissions: Permission[];
    resourcePermissions: ResourcePermission[];
    isActive: boolean;
    lastLogin?: string;
    createdAt: string;
    updatedAt: string;
}

/**
 * Resource-specific permission
 */
export interface ResourcePermission {
    resourceType: ResourceType;
    resourceId?: string; // undefined for global permissions
    permissions: Permission[];
}

/**
 * Access request context
 */
export interface AccessContext {
    user: UserProfile;
    permission: Permission;
    resourceType: ResourceType;
    resourceId?: string;
    additionalData?: Record<string, any>;
}

/**
 * RBAC (Role-Based Access Control) service
 */
export class RBACService {
    private static instance: RBACService;
    private currentUser?: UserProfile;
    private workspaceUsers: Map<string, UserProfile> = new Map();

    // Default role permissions
    private readonly rolePermissions: Record<UserRole, Permission[]> = {
        [UserRole.ADMIN]: Object.values(Permission),
        [UserRole.DEVELOPER]: [
            Permission.CREATE_CONNECTION,
            Permission.READ_CONNECTION,
            Permission.UPDATE_CONNECTION,
            Permission.DELETE_CONNECTION,
            Permission.TEST_CONNECTION,
            Permission.BROWSE_SCHEMA,
            Permission.VIEW_OBJECT_DETAILS,
            Permission.COMPARE_SCHEMAS,
            Permission.GENERATE_MIGRATION,
            Permission.EXECUTE_MIGRATION,
            Permission.ROLLBACK_MIGRATION,
            Permission.PREVIEW_MIGRATION,
            Permission.EXPORT_DATA,
            Permission.IMPORT_DATA
        ],
        [UserRole.ANALYST]: [
            Permission.READ_CONNECTION,
            Permission.BROWSE_SCHEMA,
            Permission.VIEW_OBJECT_DETAILS,
            Permission.COMPARE_SCHEMAS,
            Permission.PREVIEW_MIGRATION,
            Permission.EXPORT_DATA
        ],
        [UserRole.VIEWER]: [
            Permission.READ_CONNECTION,
            Permission.BROWSE_SCHEMA,
            Permission.VIEW_OBJECT_DETAILS
        ]
    };

    private constructor() {
        this.initializeCurrentUser();
        this.loadWorkspaceUsers();
    }

    static getInstance(): RBACService {
        if (!RBACService.instance) {
            RBACService.instance = new RBACService();
        }
        return RBACService.instance;
    }

    /**
     * Initialize current user (in VSCode context, this would be the current user)
     */
    private initializeCurrentUser(): void {
        try {
            // In a real implementation, this would get user info from VSCode authentication
            // For now, we'll create a default developer user
            this.currentUser = {
                id: 'current_user',
                name: 'Current User',
                role: UserRole.DEVELOPER,
                permissions: this.rolePermissions[UserRole.DEVELOPER],
                resourcePermissions: [],
                isActive: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            Logger.info('Current user initialized', {
                userId: this.currentUser.id,
                role: this.currentUser.role
            });

        } catch (error) {
            Logger.error('Failed to initialize current user', error as Error);
        }
    }

    /**
     * Load workspace users from configuration
     */
    private loadWorkspaceUsers(): void {
        try {
            const config = vscode.workspace.getConfiguration('postgresql-schema-sync');
            const usersConfig = config.get<Record<string, any>>('users', {});

            Object.entries(usersConfig).forEach(([userId, userData]: [string, any]) => {
                const user: UserProfile = {
                    id: userId,
                    name: userData.name || userId,
                    email: userData.email,
                    role: userData.role || UserRole.VIEWER,
                    permissions: this.rolePermissions[(userData.role as UserRole) || UserRole.VIEWER] || [],
                    resourcePermissions: userData.resourcePermissions || [],
                    isActive: userData.isActive !== false,
                    lastLogin: userData.lastLogin,
                    createdAt: userData.createdAt || new Date().toISOString(),
                    updatedAt: userData.updatedAt || new Date().toISOString()
                };

                this.workspaceUsers.set(userId, user);
            });

            Logger.info('Workspace users loaded', { count: this.workspaceUsers.size });

        } catch (error) {
            Logger.error('Failed to load workspace users', error as Error);
        }
    }

    /**
     * Check if current user has permission for an action
     */
    async hasPermission(
        permission: Permission,
        resourceType: ResourceType = ResourceType.SYSTEM,
        resourceId?: string
    ): Promise<boolean> {
        if (!this.currentUser) {
            Logger.warn('No current user, denying permission');
            return false;
        }

        try {
            // Check if user is active
            if (!this.currentUser.isActive) {
                Logger.warn('User is not active, denying permission', { userId: this.currentUser.id });
                return false;
            }

            // Check global permissions
            if (this.currentUser.permissions.includes(permission)) {
                return true;
            }

            // Check resource-specific permissions
            const resourcePermission = this.currentUser.resourcePermissions.find(rp =>
                rp.resourceType === resourceType &&
                (!rp.resourceId || rp.resourceId === resourceId) &&
                rp.permissions.includes(permission)
            );

            if (resourcePermission) {
                return true;
            }

            Logger.debug('Permission denied', {
                userId: this.currentUser.id,
                permission,
                resourceType,
                resourceId
            });

            return false;

        } catch (error) {
            Logger.error('Permission check failed', error as Error);
            return false;
        }
    }

    /**
     * Authorize an action and throw error if not permitted
     */
    async authorize(
        permission: Permission,
        resourceType: ResourceType = ResourceType.SYSTEM,
        resourceId?: string,
        actionDescription?: string
    ): Promise<void> {
        const hasPermission = await this.hasPermission(permission, resourceType, resourceId);

        if (!hasPermission) {
            const error = new Error(
                `Access denied: ${permission} on ${resourceType}${resourceId ? ` (${resourceId})` : ''}`
            );

            Logger.warn('Authorization failed', {
                permission,
                resourceType,
                resourceId,
                actionDescription,
                userId: this.currentUser?.id
            });

            throw error;
        }
    }

    /**
     * Check if user can access a specific connection
     */
    async canAccessConnection(connectionId: string): Promise<boolean> {
        return await this.hasPermission(
            Permission.READ_CONNECTION,
            ResourceType.CONNECTION,
            connectionId
        );
    }

    /**
     * Check if user can modify a specific connection
     */
    async canModifyConnection(connectionId: string): Promise<boolean> {
        return await this.hasPermission(
            Permission.UPDATE_CONNECTION,
            ResourceType.CONNECTION,
            connectionId
        );
    }

    /**
     * Check if user can execute migrations
     */
    async canExecuteMigrations(): Promise<boolean> {
        return await this.hasPermission(Permission.EXECUTE_MIGRATION);
    }

    /**
     * Check if user can view audit logs
     */
    async canViewAuditLogs(): Promise<boolean> {
        return await this.hasPermission(Permission.VIEW_AUDIT_LOGS);
    }

    /**
     * Get current user profile
     */
    getCurrentUser(): UserProfile | undefined {
        return this.currentUser;
    }

    /**
     * Get all workspace users
     */
    getWorkspaceUsers(): UserProfile[] {
        return Array.from(this.workspaceUsers.values()).filter(user => user.isActive);
    }

    /**
     * Add or update workspace user
     */
    async addWorkspaceUser(user: Omit<UserProfile, 'permissions' | 'resourcePermissions'> & {
        role: UserRole;
        resourcePermissions?: ResourcePermission[];
    }): Promise<void> {
        try {
            // Check if current user can manage users
            await this.authorize(Permission.MANAGE_USERS, ResourceType.WORKSPACE);

            const newUser: UserProfile = {
                ...user,
                permissions: this.rolePermissions[user.role] || [],
                resourcePermissions: user.resourcePermissions || []
            };

            this.workspaceUsers.set(user.id, newUser);

            // Save to configuration
            await this.saveWorkspaceUsers();

            Logger.info('Workspace user added', { userId: user.id, role: user.role });

        } catch (error) {
            Logger.error('Failed to add workspace user', error as Error);
            throw error;
        }
    }

    /**
     * Remove workspace user
     */
    async removeWorkspaceUser(userId: string): Promise<void> {
        try {
            // Check if current user can manage users
            await this.authorize(Permission.MANAGE_USERS, ResourceType.WORKSPACE);

            if (this.workspaceUsers.has(userId)) {
                this.workspaceUsers.delete(userId);
                await this.saveWorkspaceUsers();

                Logger.info('Workspace user removed', { userId });
            }

        } catch (error) {
            Logger.error('Failed to remove workspace user', error as Error);
            throw error;
        }
    }

    /**
     * Update user role
     */
    async updateUserRole(userId: string, newRole: UserRole): Promise<void> {
        try {
            // Check if current user can manage users
            await this.authorize(Permission.MANAGE_USERS, ResourceType.WORKSPACE);

            const user = this.workspaceUsers.get(userId);
            if (user) {
                user.role = newRole;
                user.permissions = this.rolePermissions[newRole] || [];
                user.updatedAt = new Date().toISOString();

                this.workspaceUsers.set(userId, user);
                await this.saveWorkspaceUsers();

                Logger.info('User role updated', { userId, newRole });
            }

        } catch (error) {
            Logger.error('Failed to update user role', error as Error);
            throw error;
        }
    }

    /**
     * Get effective permissions for a user on a resource
     */
    getEffectivePermissions(
        user: UserProfile,
        resourceType: ResourceType,
        resourceId?: string
    ): Permission[] {
        const effectivePermissions: Permission[] = [];

        // Add global permissions
        effectivePermissions.push(...user.permissions);

        // Add resource-specific permissions
        const resourcePermissions = user.resourcePermissions.filter(rp =>
            rp.resourceType === resourceType &&
            (!rp.resourceId || rp.resourceId === resourceId)
        );

        resourcePermissions.forEach(rp => {
            effectivePermissions.push(...rp.permissions);
        });

        // Remove duplicates
        return [...new Set(effectivePermissions)];
    }

    /**
     * Save workspace users to configuration
     */
    private async saveWorkspaceUsers(): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('postgresql-schema-sync');
            const usersConfig: Record<string, any> = {};

            this.workspaceUsers.forEach((user, userId) => {
                usersConfig[userId] = {
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    resourcePermissions: user.resourcePermissions,
                    isActive: user.isActive,
                    lastLogin: user.lastLogin,
                    createdAt: user.createdAt,
                    updatedAt: user.updatedAt
                };
            });

            await config.update('users', usersConfig, vscode.ConfigurationTarget.Workspace);

        } catch (error) {
            Logger.error('Failed to save workspace users', error as Error);
            throw error;
        }
    }

    /**
     * Get permissions for a specific role
     */
    getRolePermissions(role: UserRole): Permission[] {
        return [...this.rolePermissions[role]];
    }

    /**
     * Check if current user has admin privileges
     */
    isAdmin(): boolean {
        return this.currentUser?.role === UserRole.ADMIN;
    }

    /**
     * Check if current user has developer privileges
     */
    isDeveloper(): boolean {
        return this.currentUser?.role === UserRole.ADMIN ||
               this.currentUser?.role === UserRole.DEVELOPER;
    }

    /**
     * Dispose of the RBAC service
     */
    async dispose(): Promise<void> {
        this.workspaceUsers.clear();
        Logger.info('RBAC service disposed');
    }
}