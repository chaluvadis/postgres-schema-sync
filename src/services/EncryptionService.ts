import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { Logger } from '../utils/Logger';

/**
 * Encryption service for secure credential and sensitive data storage
 * Uses AES-256-GCM encryption with unique IVs for each encryption operation
 */
export class EncryptionService {
    private static instance: EncryptionService;
    private readonly algorithm = 'aes-256-gcm';
    private readonly keyLength = 32; // 256 bits
    private readonly ivLength = 16;  // 128 bits
    private readonly tagLength = 16; // 128 bits
    private masterKey?: Buffer | undefined;

    private constructor() {
        this.initializeMasterKey();
    }

    static getInstance(): EncryptionService {
        if (!EncryptionService.instance) {
            EncryptionService.instance = new EncryptionService();
        }
        return EncryptionService.instance;
    }

    /**
     * Initialize or retrieve the master encryption key
     */
    private async initializeMasterKey(): Promise<void> {
        try {
            const context = this.getExtensionContext();
            if (!context) {
                throw new Error('Extension context not available for encryption service');
            }

            // Try to get existing master key from secrets
            const storedKey = await context.secrets.get('postgresql.encryption.masterKey');

            if (storedKey) {
                // Derive key from stored value using PBKDF2
                this.masterKey = await this.deriveKeyFromPassword(storedKey);
                Logger.debug('Master encryption key loaded from secrets');
            } else {
                // Generate new master key and store it
                const newKey = this.generateMasterKey();
                const keyString = newKey.toString('hex');

                await context.secrets.store('postgresql.encryption.masterKey', keyString);
                this.masterKey = newKey;

                Logger.info('New master encryption key generated and stored');
            }
        } catch (error) {
            Logger.error('Failed to initialize master encryption key', error as Error);
            throw new Error(`Encryption service initialization failed: ${(error as Error).message}`);
        }
    }

    /**
     * Generate a cryptographically secure master key
     */
    private generateMasterKey(): Buffer {
        return crypto.randomBytes(this.keyLength);
    }

    /**
     * Derive encryption key from password using PBKDF2
     */
    private async deriveKeyFromPassword(password: string): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const salt = Buffer.from('postgresql-schema-sync-salt'); // Fixed salt for consistency

            crypto.pbkdf2(password, salt, 100000, this.keyLength, 'sha256', (err, derivedKey) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(derivedKey);
                }
            });
        });
    }

    /**
     * Encrypt sensitive data using AES-256-GCM
     */
    async encrypt(data: string): Promise<string> {
        if (!this.masterKey) {
            throw new Error('Master key not initialized');
        }

        try {
            // Generate unique IV for each encryption
            const iv = crypto.randomBytes(this.ivLength);

            // Create cipher
            const cipher = crypto.createCipher(this.algorithm, this.masterKey);
            cipher.setAAD(Buffer.from('postgresql-schema-sync')); // Additional authenticated data

            // Encrypt data
            let encrypted = cipher.update(data, 'utf8', 'hex');
            encrypted += cipher.final('hex');

            // Get authentication tag
            const tag = cipher.getAuthTag();

            // Combine IV, tag, and encrypted data
            const result = Buffer.concat([iv, tag, Buffer.from(encrypted, 'hex')]);

            Logger.debug('Data encrypted successfully');
            return result.toString('base64');
        } catch (error) {
            Logger.error('Encryption failed', error as Error);
            throw new Error(`Encryption failed: ${(error as Error).message}`);
        }
    }

    /**
     * Decrypt sensitive data using AES-256-GCM
     */
    async decrypt(encryptedData: string): Promise<string> {
        if (!this.masterKey) {
            throw new Error('Master key not initialized');
        }

        try {
            // Decode from base64
            const buffer = Buffer.from(encryptedData, 'base64');

            if (buffer.length < this.ivLength + this.tagLength) {
                throw new Error('Invalid encrypted data format');
            }

            // Extract IV, tag, and encrypted content
            const iv = buffer.subarray(0, this.ivLength);
            const tag = buffer.subarray(this.ivLength, this.ivLength + this.tagLength);
            const encrypted = buffer.subarray(this.ivLength + this.tagLength);

            // Create decipher
            const decipher = crypto.createDecipher(this.algorithm, this.masterKey);
            decipher.setAuthTag(tag);
            decipher.setAAD(Buffer.from('postgresql-schema-sync'));

            // Decrypt data
            let decrypted = decipher.update(encrypted.toString('hex'), 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            Logger.debug('Data decrypted successfully');
            return decrypted;
        } catch (error) {
            Logger.error('Decryption failed', error as Error);
            throw new Error(`Decryption failed: ${(error as Error).message}`);
        }
    }

    /**
     * Generate a secure hash for non-reversible data (like password validation)
     */
    async generateHash(data: string, salt?: string): Promise<string> {
        const saltValue = salt || crypto.randomBytes(32).toString('hex');

        return new Promise((resolve, reject) => {
            crypto.pbkdf2(data, saltValue, 100000, 64, 'sha256', (err, derivedKey) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(`${saltValue}:${derivedKey.toString('hex')}`);
                }
            });
        });
    }

    /**
     * Verify data against a hash
     */
    async verifyHash(data: string, hash: string): Promise<boolean> {
        try {
            const [salt, originalHash] = hash.split(':');
            const testHash = await this.generateHash(data, salt);
            return crypto.timingSafeEqual(
                Buffer.from(testHash.split(':')[1]),
                Buffer.from(originalHash)
            );
        } catch (error) {
            Logger.error('Hash verification failed', error as Error);
            return false;
        }
    }

    /**
     * Generate a cryptographically secure random string
     */
    generateSecureToken(length: number = 32): string {
        return crypto.randomBytes(length).toString('base64')
            .replace(/[^a-zA-Z0-9]/g, '')
            .substring(0, length);
    }

    /**
     * Rotate the master encryption key (for security maintenance)
     */
    async rotateMasterKey(): Promise<void> {
        try {
            const context = this.getExtensionContext();
            if (!context) {
                throw new Error('Extension context not available');
            }

            // Generate new master key
            const newKey = this.generateMasterKey();
            const keyString = newKey.toString('hex');

            // Store new key
            await context.secrets.store('postgresql.encryption.masterKey', keyString);
            this.masterKey = newKey;

            Logger.info('Master encryption key rotated successfully');
        } catch (error) {
            Logger.error('Master key rotation failed', error as Error);
            throw new Error(`Key rotation failed: ${(error as Error).message}`);
        }
    }

    /**
     * Get extension context (helper method)
     */
    private getExtensionContext(): vscode.ExtensionContext | undefined {
        // This is a workaround since we can't directly access the extension context
        // In a real implementation, this would be passed in or accessed through a service locator
        return (global as any).postgresqlExtensionContext;
    }

    /**
     * Set extension context (to be called during extension activation)
     */
    static setExtensionContext(context: vscode.ExtensionContext): void {
        (global as any).postgresqlExtensionContext = context;
    }

    /**
     * Dispose of the encryption service
     */
    async dispose(): Promise<void> {
        this.masterKey = undefined;
        Logger.info('Encryption service disposed');
    }
}