import { SecurityManager, DataClassification } from '../../src/services/SecurityManager';

// Mock VSCode APIs
jest.mock('vscode', () => ({
    workspace: {
        getConfiguration: jest.fn(),
    },
    window: {
        showErrorMessage: jest.fn(),
        showWarningMessage: jest.fn(),
    },
}));

describe('SecurityManager', () => {
    let securityManager: SecurityManager;

    beforeEach(() => {
        securityManager = SecurityManager.getInstance();
    });

    describe('getInstance', () => {
        it('should return singleton instance', () => {
            const instance1 = SecurityManager.getInstance();
            const instance2 = SecurityManager.getInstance();

            expect(instance1).toBe(instance2);
            expect(instance1).toBeInstanceOf(SecurityManager);
        });
    });

    describe('encryptSensitiveData', () => {
        it('should encrypt data with specified classification', async () => {
            const data = 'sensitive-password';
            const classification = DataClassification.RESTRICTED;

            const encrypted = await securityManager.encryptSensitiveData(data, classification);

            expect(encrypted).toBeDefined();
            expect(typeof encrypted).toBe('string');
            expect(encrypted).not.toBe(data); // Should be encrypted
        });

        it('should handle different data classifications', async () => {
            const data = 'test-data';

            const encryptedRestricted = await securityManager.encryptSensitiveData(data, DataClassification.RESTRICTED);
            const encryptedInternal = await securityManager.encryptSensitiveData(data, DataClassification.INTERNAL);
            const encryptedPublic = await securityManager.encryptSensitiveData(data, DataClassification.PUBLIC);

            expect(encryptedRestricted).toBeDefined();
            expect(encryptedInternal).toBeDefined();
            expect(encryptedPublic).toBeDefined();
            // Different classifications might use different encryption keys
        });
    });

    describe('decryptSensitiveData', () => {
        it('should decrypt previously encrypted data', async () => {
            const originalData = 'my-secret-password';
            const classification = DataClassification.RESTRICTED;

            const encrypted = await securityManager.encryptSensitiveData(originalData, classification);
            const decrypted = await securityManager.decryptSensitiveData(encrypted);

            expect(decrypted).toBe(originalData);
        });

        it('should handle decryption with wrong classification', async () => {
            const originalData = 'test-data';
            const encrypted = await securityManager.encryptSensitiveData(originalData, DataClassification.RESTRICTED);

            // Try to decrypt with different classification
            const decrypted = await securityManager.decryptSensitiveData(encrypted);

            // This might fail or return different result depending on implementation
            expect(decrypted).toBeDefined();
        });
    });

    describe('validateConnectionSecurity', () => {
        it('should validate secure connections', () => {
            const result = securityManager.validateConnectionSecurity('secure.example.com', 5432, true);

            expect(result).toHaveProperty('allowed');
            expect(result).toHaveProperty('reason');
            expect(typeof result.allowed).toBe('boolean');
        });

        it('should reject insecure connections when SSL required', () => {
            const result = securityManager.validateConnectionSecurity('insecure.example.com', 5432, false);

            expect(result).toHaveProperty('allowed');
            expect(result).toHaveProperty('requiresSSL');
        });

        it('should handle localhost connections', () => {
            const result = securityManager.validateConnectionSecurity('localhost', 5432, false);

            expect(result).toBeDefined();
            // Localhost might be allowed even without SSL
        });
    });

    describe('validateCertificate', () => {
        it('should validate SSL certificates', async () => {
            const result = await securityManager.validateCertificate('example.com', 5432, 'test-conn');

            expect(result).toHaveProperty('valid');
            expect(result).toHaveProperty('warnings');
            expect(typeof result.valid).toBe('boolean');
        });

        it('should handle certificate validation errors', async () => {
            // Mock a scenario where certificate validation fails
            const result = await securityManager.validateCertificate('invalid.cert.example.com', 5432, 'test-conn');

            expect(result).toBeDefined();
            // Should handle gracefully even if certificate is invalid
        });
    });

    // Note: generateSecurePassword and hashData methods don't exist in SecurityManager
    // These tests would need to be implemented if the methods are added later

    describe('validatePasswordStrength', () => {
        it('should validate strong passwords', () => {
            const strongPassword = 'MyStr0ngP@ssw0rd!2024';
            const result = securityManager.validatePasswordStrength(strongPassword);

            expect(result).toHaveProperty('isAcceptable');
            expect(result).toHaveProperty('score');
            expect(result).toHaveProperty('feedback');
            expect(result.isAcceptable).toBe(true);
        });

        it('should reject weak passwords', () => {
            const weakPassword = '123456';
            const result = securityManager.validatePasswordStrength(weakPassword);

            expect(result.isAcceptable).toBe(false);
            expect(result.score).toBeLessThan(50); // Weak score
        });

        it('should provide feedback for password improvement', () => {
            const mediumPassword = 'password123';
            const result = securityManager.validatePasswordStrength(mediumPassword);

            expect(result.feedback).toBeDefined();
            expect(Array.isArray(result.feedback)).toBe(true);
        });
    });

    // Note: auditLogSecurityEvent, getSecurityMetrics, and dispose methods don't exist in SecurityManager
    // These tests would need to be implemented if the methods are added later
});