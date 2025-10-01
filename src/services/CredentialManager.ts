import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';
import { EncryptionService } from './EncryptionService';
import { AuditService, AuditEventType, AuditSeverity } from './AuditService';
import { RBACService, Permission } from './RBACService';

export interface SecureCredential {
    id: string;
    name: string;
    encryptedPassword: string;
    salt: string;
    createdAt: string;
    lastUsed?: string;
}

export class CredentialManager {
    private context: vscode.ExtensionContext;
    private secrets: vscode.SecretStorage;
    private encryptionService: EncryptionService;
    private auditService: AuditService;
    private rbacService: RBACService;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.secrets = context.secrets;
        this.encryptionService = EncryptionService.getInstance();
        this.auditService = AuditService.getInstance();
        this.rbacService = RBACService.getInstance();

        // Set extension context for encryption service
        EncryptionService.setExtensionContext(context);
    }

    async storeCredential(connectionId: string, password: string): Promise<void> {
        try {
            // Check permissions
            await this.rbacService.authorize(Permission.CREATE_CONNECTION);

            // Encrypt password using the new encryption service
            const encryptedPassword = await this.encryptionService.encrypt(password);

            const credential: SecureCredential = {
                id: connectionId,
                name: `connection_${connectionId}`,
                encryptedPassword,
                salt: '', // No longer needed with new encryption service
                createdAt: new Date().toISOString(),
                lastUsed: new Date().toISOString()
            };

            // Store encrypted credential
            await this.secrets.store(`postgresql.credential.${connectionId}`, JSON.stringify(credential));

            // Audit log the operation
            await this.auditService.logEvent(
                AuditEventType.CONNECTION_CREATED,
                AuditSeverity.LOW,
                'store_credential',
                { connectionId },
                `connection:${connectionId}`,
                true,
                undefined
            );

            Logger.info('Credential stored securely', { connectionId });
        } catch (error) {
            // Audit log failed operation
            await this.auditService.logSecurityEvent(
                'credential_storage_failed',
                { connectionId, error: (error as Error).message },
                AuditSeverity.HIGH,
                false,
                (error as Error).message
            );

            Logger.error('Failed to store credential', error as Error);
            throw new Error('Failed to store database credentials securely');
        }
    }

    async retrieveCredential(connectionId: string): Promise<string | undefined> {
        try {
            // Check permissions
            await this.rbacService.authorize(Permission.READ_CONNECTION);

            const credentialData = await this.secrets.get(`postgresql.credential.${connectionId}`);
            if (!credentialData) {
                return undefined;
            }

            const credential: SecureCredential = JSON.parse(credentialData);

            // Decrypt password using the new encryption service
            const password = await this.encryptionService.decrypt(credential.encryptedPassword);

            // Update last used timestamp
            credential.lastUsed = new Date().toISOString();
            await this.secrets.store(`postgresql.credential.${connectionId}`, JSON.stringify(credential));

            // Audit log the operation
            await this.auditService.logEvent(
                AuditEventType.CONNECTION_TESTED,
                AuditSeverity.LOW,
                'retrieve_credential',
                { connectionId },
                `connection:${connectionId}`,
                true,
                undefined
            );

            Logger.debug('Credential retrieved successfully', { connectionId });
            return password;
        } catch (error) {
            // Audit log failed operation
            await this.auditService.logSecurityEvent(
                'credential_retrieval_failed',
                { connectionId, error: (error as Error).message },
                AuditSeverity.HIGH,
                false,
                (error as Error).message
            );

            Logger.error('Failed to retrieve credential', error as Error);
            return undefined;
        }
    }

    async updateCredential(connectionId: string, newPassword: string): Promise<void> {
        try {
            // Check permissions
            await this.rbacService.authorize(Permission.UPDATE_CONNECTION);

            const existingData = await this.secrets.get(`postgresql.credential.${connectionId}`);
            if (!existingData) {
                // If no existing credential, create new one
                await this.storeCredential(connectionId, newPassword);
                return;
            }

            // Encrypt new password
            const encryptedPassword = await this.encryptionService.encrypt(newPassword);

            const existing: SecureCredential = JSON.parse(existingData);
            const updatedCredential: SecureCredential = {
                ...existing,
                encryptedPassword,
                lastUsed: new Date().toISOString()
            };

            await this.secrets.store(`postgresql.credential.${connectionId}`, JSON.stringify(updatedCredential));

            // Audit log the operation
            await this.auditService.logEvent(
                AuditEventType.CONNECTION_UPDATED,
                AuditSeverity.MEDIUM,
                'update_credential',
                { connectionId },
                `connection:${connectionId}`,
                true,
                undefined
            );

            Logger.info('Credential updated securely', { connectionId });
        } catch (error) {
            // Audit log failed operation
            await this.auditService.logSecurityEvent(
                'credential_update_failed',
                { connectionId, error: (error as Error).message },
                AuditSeverity.HIGH,
                false,
                (error as Error).message
            );

            Logger.error('Failed to update credential', error as Error);
            throw new Error('Failed to update database credentials securely');
        }
    }

    async removeCredential(connectionId: string): Promise<void> {
        try {
            // Check permissions
            await this.rbacService.authorize(Permission.DELETE_CONNECTION);

            await this.secrets.delete(`postgresql.credential.${connectionId}`);

            // Audit log the operation
            await this.auditService.logEvent(
                AuditEventType.CONNECTION_DELETED,
                AuditSeverity.MEDIUM,
                'remove_credential',
                { connectionId },
                `connection:${connectionId}`,
                true,
                undefined
            );

            Logger.info('Credential removed', { connectionId });
        } catch (error) {
            // Audit log failed operation
            await this.auditService.logSecurityEvent(
                'credential_removal_failed',
                { connectionId, error: (error as Error).message },
                AuditSeverity.HIGH,
                false,
                (error as Error).message
            );

            Logger.error('Failed to remove credential', error as Error);
            throw new Error('Failed to remove database credentials');
        }
    }

    async listCredentials(): Promise<string[]> {
        try {
            // Check permissions
            await this.rbacService.authorize(Permission.READ_CONNECTION);

            // For now, return empty array as VSCode doesn't provide a direct way to list all secrets
            // In production, you might want to maintain a separate index of stored credentials
            return [];
        } catch (error) {
            Logger.error('Failed to list credentials', error as Error);
            return [];
        }
    }

    async validateCredentialStrength(password: string): Promise<{ isValid: boolean; issues: string[] }> {
        const issues: string[] = [];

        if (password.length < 8) {
            issues.push('Password must be at least 8 characters long');
        }

        if (!/[A-Z]/.test(password)) {
            issues.push('Password must contain at least one uppercase letter');
        }

        if (!/[a-z]/.test(password)) {
            issues.push('Password must contain at least one lowercase letter');
        }

        if (!/\d/.test(password)) {
            issues.push('Password must contain at least one number');
        }

        if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
            issues.push('Password must contain at least one special character');
        }

        return {
            isValid: issues.length === 0,
            issues
        };
    }

    async rotateEncryptionKey(): Promise<void> {
        try {
            // Check permissions
            await this.rbacService.authorize(Permission.ROTATE_KEYS);

            // Rotate the master key in encryption service
            await this.encryptionService.rotateMasterKey();

            // Audit log the operation
            await this.auditService.logEvent(
                AuditEventType.ENCRYPTION_KEY_ROTATED,
                AuditSeverity.CRITICAL,
                'rotate_encryption_key',
                {},
                'system:encryption',
                true,
                undefined
            );

            Logger.info('Encryption key rotated successfully');
        } catch (error) {
            // Audit log failed operation
            await this.auditService.logSecurityEvent(
                'key_rotation_failed',
                { error: (error as Error).message },
                AuditSeverity.CRITICAL,
                false,
                (error as Error).message
            );

            Logger.error('Failed to rotate encryption key', error as Error);
            throw new Error('Failed to rotate encryption key');
        }
    }

    async dispose(): Promise<void> {
        Logger.info('Disposing credential manager');
        await this.encryptionService.dispose();
        await this.auditService.dispose();
        await this.rbacService.dispose();
    }
}