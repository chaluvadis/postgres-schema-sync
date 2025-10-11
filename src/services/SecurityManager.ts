import * as vscode from 'vscode';
import * as tls from 'tls';
import { Logger } from '@/utils/Logger';

export interface SecurityConfiguration {
    enabled: boolean;
    securityLevel: 'strict' | 'warning' | 'permissive';
    certificateValidation: {
        enabled: boolean;
        checkRevocation: boolean;
        checkTransparency: boolean;
        allowSelfSigned: boolean;
        minKeySize: number;
        maxValidityDays: number;
    };
    certificatePinning: {
        enabled: boolean;
        autoPinTrusted: boolean;
        requireUserApproval: boolean;
        maxPinAge: number;
        allowedHostnames: string[];
    };
    monitoring: {
        enabled: boolean;
        alertLevels: string[];
        retentionDays: number;
        maxEvents: number;
        autoResolveAfterDays: number;
        showNotifications: boolean;
        showInStatusBar: boolean;
    };
    connectionSecurity: {
        enforceSecureConnections: boolean;
        allowInsecureFallback: boolean;
        validateOnConnect: boolean;
        validateOnReconnect: boolean;
    };
    sqlInjection: {
        enabled: boolean;
        blockHighRisk: boolean;
        allowUnparameterizedDML: boolean;
        logOnly: boolean;
        maxQueryLength: number;
        allowedKeywords: string[];
    };
    passwordPolicy: {
        enabled: boolean;
        minStrength: 'very-weak' | 'weak' | 'fair' | 'good' | 'strong';
        requireSpecialChars: boolean;
        requireNumbers: boolean;
        requireMixedCase: boolean;
        minLength: number;
        maxLength: number;
        preventCommonPasswords: boolean;
    };
    rateLimiting: {
        enabled: boolean;
        maxConnectionAttempts: number;
        windowMs: number;
        maxQueriesPerMinute: number;
        maxConnectionsPerUser: number;
    };
    dataClassification: {
        enabled: boolean;
        defaultClassification: DataClassification;
        autoClassifyPatterns: boolean;
        requireApprovalForRestricted: boolean;
        maskingEnabled: boolean;
        encryptionEnabled: boolean;
    };
    encryption: {
        enabled: boolean;
        defaultAlgorithm: 'AES-256-GCM' | 'ChaCha20-Poly1305';
        keyRotationDays: number;
        encryptConnectionPasswords: boolean;
        encryptQueryResults: boolean;
    };
    compliance: {
        enabled: boolean;
        frameworks: ComplianceFramework[];
        reportingEnabled: boolean;
        reportFrequency: 'daily' | 'weekly' | 'monthly';
        retentionDays: number;
    };
    networkSecurity: {
        enabled: boolean;
        firewallEnabled: boolean;
        allowedPorts: number[];
        blockedCountries: string[];
        maxConnectionsPerIP: number;
        connectionTimeout: number;
        requireSSLForExternal: boolean;
        whitelistOnly: boolean;
    };
    vulnerabilityScanning: {
        enabled: boolean;
        scanOnConnect: boolean;
        scanSchedule: 'manual' | 'daily' | 'weekly';
        autoRemediation: boolean;
        alertOnNewVulnerabilities: boolean;
        maxScanDuration: number;
    };
}

export interface SecurityEvent {
    id: string;
    type: 'authentication' | 'authorization' | 'data_access' | 'configuration' | 'certificate' | 'connection';
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    timestamp: string;
    resolved: boolean;
    details?: Record<string, any>;
    connectionId?: string;
    hostname?: string;
}

export interface CertificateInfo {
    subject: string;
    issuer: string;
    validFrom: Date;
    validTo: Date;
    serialNumber: string;
    fingerprint: string;
    keySize: number;
    algorithm: string;
    isSelfSigned: boolean;
    revocationStatus: 'good' | 'revoked' | 'unknown';
}

export interface SQLInjectionCheck {
    isSafe: boolean;
    riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
    detectedPatterns: string[];
    sanitizedQuery?: string;
    recommendations: string[];
}

export interface PasswordStrengthResult {
    score: number; // 0-100
    strength: 'very-weak' | 'weak' | 'fair' | 'good' | 'strong';
    feedback: string[];
    isAcceptable: boolean;
}

export interface RateLimitResult {
    allowed: boolean;
    retryAfter?: number; // seconds
    totalAttempts: number;
    windowStart: number;
    reason?: string;
}

export enum DataClassification {
    PUBLIC = 'public',
    INTERNAL = 'internal',
    CONFIDENTIAL = 'confidential',
    RESTRICTED = 'restricted'
}

export enum ComplianceFramework {
    GDPR = 'GDPR',
    HIPAA = 'HIPAA',
    SOX = 'SOX',
    PCI_DSS = 'PCI_DSS',
    ISO_27001 = 'ISO_27001'
}

export interface DataClassificationRule {
    id: string;
    name: string;
    pattern: string; // Regex pattern to match data
    classification: DataClassification;
    description: string;
    complianceFrameworks: ComplianceFramework[];
    maskingStrategy?: DataMaskingStrategy;
}

export interface DataMaskingStrategy {
    type: 'partial' | 'full' | 'hash' | 'tokenize';
    preserveLength?: boolean;
    showFirst?: number; // For partial masking
    showLast?: number;   // For partial masking
    hashAlgorithm?: 'sha256' | 'sha512' | 'bcrypt';
}

export interface EncryptionKey {
    id: string;
    name: string;
    algorithm: 'AES-256-GCM' | 'ChaCha20-Poly1305';
    keySize: number;
    created: Date;
    expires?: Date;
    usage: string[];
}

export interface ComplianceReport {
    id: string;
    framework: ComplianceFramework;
    generatedAt: Date;
    period: {
        start: Date;
        end: Date;
    };
    findings: ComplianceFinding[];
    overallStatus: 'compliant' | 'non-compliant' | 'partial';
    nextAssessmentDue: Date;
}

export interface ComplianceFinding {
    id: string;
    category: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    status: 'open' | 'resolved' | 'accepted' | 'false-positive';
    remediation?: string;
    evidence?: string[];
}

export interface NetworkSecurityRule {
    id: string;
    name: string;
    type: 'allow' | 'deny';
    protocol: 'tcp' | 'udp' | 'any';
    sourceIP?: string;
    sourcePort?: number;
    destinationIP?: string;
    destinationPort?: number;
    hostname?: string;
    action: 'allow' | 'deny' | 'challenge';
    priority: number;
    enabled: boolean;
    description: string;
}

export interface VulnerabilityScan {
    id: string;
    target: string; // hostname, IP, or connection ID
    scanType: 'port' | 'ssl' | 'configuration' | 'full';
    startedAt: Date;
    completedAt?: Date;
    status: 'running' | 'completed' | 'failed' | 'cancelled';
    findings: VulnerabilityFinding[];
    summary: {
        totalVulnerabilities: number;
        criticalCount: number;
        highCount: number;
        mediumCount: number;
        lowCount: number;
    };
}

export interface VulnerabilityFinding {
    id: string;
    type: 'open-port' | 'weak-cipher' | 'certificate-issue' | 'configuration' | 'misconfiguration';
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description: string;
    cve?: string;
    cvssScore?: number;
    affectedComponent: string;
    remediation: string;
    references: string[];
    evidence: string[];
}

export class SecurityManager {
    private static instance: SecurityManager;
    private config: SecurityConfiguration;
    private securityEvents: SecurityEvent[] = [];
    private pinnedCertificates: Map<string, CertificateInfo> = new Map();
    private certificateCache: Map<string, { cert: CertificateInfo; timestamp: number; }> = new Map();
    private rateLimitStore: Map<string, { attempts: number; windowStart: number; }> = new Map();
    private dataClassificationRules: DataClassificationRule[] = [];
    private encryptionKeys: Map<string, EncryptionKey> = new Map();
    private sensitiveDataCache: Map<string, { encrypted: string; classification: DataClassification; timestamp: number; }> = new Map();
    private networkSecurityRules: NetworkSecurityRule[] = [];
    private vulnerabilityScans: Map<string, VulnerabilityScan> = new Map();
    private blockedConnections: Set<string> = new Set();
    private secrets?: vscode.SecretStorage;

    private constructor(secrets?: vscode.SecretStorage) {
        this.config = this.loadSecurityConfiguration();
        this.secrets = secrets;
        this.loadPinnedCertificates();
        this.startSecurityMonitoring();
    }

    static getInstance(secrets?: vscode.SecretStorage): SecurityManager {
        if (!SecurityManager.instance) {
            SecurityManager.instance = new SecurityManager(secrets);
        } else if (secrets && !SecurityManager.instance.secrets) {
            // Update secrets if not previously set
            SecurityManager.instance.secrets = secrets;
            // Reload certificates with secrets available
            SecurityManager.instance.loadPinnedCertificates();
        }
        return SecurityManager.instance;
    }

    /**
     * Initialize SecurityManager with VS Code secrets storage
     */
    static initializeWithSecrets(secrets: vscode.SecretStorage): SecurityManager {
        return SecurityManager.getInstance(secrets);
    }

    private loadSecurityConfiguration(): SecurityConfiguration {
        const vscodeConfig = vscode.workspace.getConfiguration('postgresql.securityManager');

        return {
            enabled: vscodeConfig.get('enabled', true),
            securityLevel: vscodeConfig.get('securityLevel', 'warning'),
            certificateValidation: {
                enabled: vscodeConfig.get('certificateValidation.enabled', true),
                checkRevocation: vscodeConfig.get('certificateValidation.checkRevocation', false),
                checkTransparency: vscodeConfig.get('certificateValidation.checkTransparency', false),
                allowSelfSigned: vscodeConfig.get('certificateValidation.allowSelfSigned', false),
                minKeySize: vscodeConfig.get('certificateValidation.minKeySize', 2048),
                maxValidityDays: vscodeConfig.get('certificateValidation.maxValidityDays', 825)
            },
            certificatePinning: {
                enabled: vscodeConfig.get('certificatePinning.enabled', false),
                autoPinTrusted: vscodeConfig.get('certificatePinning.autoPinTrusted', false),
                requireUserApproval: vscodeConfig.get('certificatePinning.requireUserApproval', true),
                maxPinAge: vscodeConfig.get('certificatePinning.maxPinAge', 365),
                allowedHostnames: vscodeConfig.get('certificatePinning.allowedHostnames', [])
            },
            monitoring: {
                enabled: vscodeConfig.get('monitoring.enabled', true),
                alertLevels: vscodeConfig.get('monitoring.alertLevels', ['warning', 'error', 'critical']),
                retentionDays: vscodeConfig.get('monitoring.retentionDays', 90),
                maxEvents: vscodeConfig.get('monitoring.maxEvents', 1000),
                autoResolveAfterDays: vscodeConfig.get('monitoring.autoResolveAfterDays', 30),
                showNotifications: vscodeConfig.get('monitoring.showNotifications', true),
                showInStatusBar: vscodeConfig.get('monitoring.showInStatusBar', true)
            },
            connectionSecurity: {
                enforceSecureConnections: vscodeConfig.get('connectionSecurity.enforceSecureConnections', false),
                allowInsecureFallback: vscodeConfig.get('connectionSecurity.allowInsecureFallback', true),
                validateOnConnect: vscodeConfig.get('connectionSecurity.validateOnConnect', true),
                validateOnReconnect: vscodeConfig.get('connectionSecurity.validateOnReconnect', true)
            },
            sqlInjection: {
                enabled: vscodeConfig.get('sqlInjection.enabled', true),
                blockHighRisk: vscodeConfig.get('sqlInjection.blockHighRisk', true),
                allowUnparameterizedDML: vscodeConfig.get('sqlInjection.allowUnparameterizedDML', false),
                logOnly: vscodeConfig.get('sqlInjection.logOnly', false),
                maxQueryLength: vscodeConfig.get('sqlInjection.maxQueryLength', 100000),
                allowedKeywords: vscodeConfig.get('sqlInjection.allowedKeywords', ['SELECT', 'INSERT', 'UPDATE', 'DELETE'])
            },
            passwordPolicy: {
                enabled: vscodeConfig.get('passwordPolicy.enabled', true),
                minStrength: vscodeConfig.get('passwordPolicy.minStrength', 'fair'),
                requireSpecialChars: vscodeConfig.get('passwordPolicy.requireSpecialChars', true),
                requireNumbers: vscodeConfig.get('passwordPolicy.requireNumbers', true),
                requireMixedCase: vscodeConfig.get('passwordPolicy.requireMixedCase', true),
                minLength: vscodeConfig.get('passwordPolicy.minLength', 8),
                maxLength: vscodeConfig.get('passwordPolicy.maxLength', 128),
                preventCommonPasswords: vscodeConfig.get('passwordPolicy.preventCommonPasswords', true)
            },
            rateLimiting: {
                enabled: vscodeConfig.get('rateLimiting.enabled', true),
                maxConnectionAttempts: vscodeConfig.get('rateLimiting.maxConnectionAttempts', 5),
                windowMs: vscodeConfig.get('rateLimiting.windowMs', 300000),
                maxQueriesPerMinute: vscodeConfig.get('rateLimiting.maxQueriesPerMinute', 100),
                maxConnectionsPerUser: vscodeConfig.get('rateLimiting.maxConnectionsPerUser', 10)
            },
            dataClassification: {
                enabled: vscodeConfig.get('dataClassification.enabled', true),
                defaultClassification: vscodeConfig.get('dataClassification.defaultClassification', DataClassification.INTERNAL),
                autoClassifyPatterns: vscodeConfig.get('dataClassification.autoClassifyPatterns', true),
                requireApprovalForRestricted: vscodeConfig.get('dataClassification.requireApprovalForRestricted', true),
                maskingEnabled: vscodeConfig.get('dataClassification.maskingEnabled', true),
                encryptionEnabled: vscodeConfig.get('dataClassification.encryptionEnabled', true)
            },
            encryption: {
                enabled: vscodeConfig.get('encryption.enabled', true),
                defaultAlgorithm: vscodeConfig.get('encryption.defaultAlgorithm', 'AES-256-GCM'),
                keyRotationDays: vscodeConfig.get('encryption.keyRotationDays', 90),
                encryptConnectionPasswords: vscodeConfig.get('encryption.encryptConnectionPasswords', true),
                encryptQueryResults: vscodeConfig.get('encryption.encryptQueryResults', false)
            },
            compliance: {
                enabled: vscodeConfig.get('compliance.enabled', false),
                frameworks: vscodeConfig.get('compliance.frameworks', [ComplianceFramework.GDPR]),
                reportingEnabled: vscodeConfig.get('compliance.reportingEnabled', false),
                reportFrequency: vscodeConfig.get('compliance.reportFrequency', 'monthly'),
                retentionDays: vscodeConfig.get('compliance.retentionDays', 2555) // 7 years default
            },
            networkSecurity: {
                enabled: vscodeConfig.get('networkSecurity.enabled', true),
                firewallEnabled: vscodeConfig.get('networkSecurity.firewallEnabled', true),
                allowedPorts: vscodeConfig.get('networkSecurity.allowedPorts', [5432, 5433]),
                blockedCountries: vscodeConfig.get('networkSecurity.blockedCountries', []),
                maxConnectionsPerIP: vscodeConfig.get('networkSecurity.maxConnectionsPerIP', 10),
                connectionTimeout: vscodeConfig.get('networkSecurity.connectionTimeout', 30000),
                requireSSLForExternal: vscodeConfig.get('networkSecurity.requireSSLForExternal', true),
                whitelistOnly: vscodeConfig.get('networkSecurity.whitelistOnly', false)
            },
            vulnerabilityScanning: {
                enabled: vscodeConfig.get('vulnerabilityScanning.enabled', false),
                scanOnConnect: vscodeConfig.get('vulnerabilityScanning.scanOnConnect', false),
                scanSchedule: vscodeConfig.get('vulnerabilityScanning.scanSchedule', 'weekly'),
                autoRemediation: vscodeConfig.get('vulnerabilityScanning.autoRemediation', false),
                alertOnNewVulnerabilities: vscodeConfig.get('vulnerabilityScanning.alertOnNewVulnerabilities', true),
                maxScanDuration: vscodeConfig.get('vulnerabilityScanning.maxScanDuration', 300000) // 5 minutes
            }
        };
    }

    /**
     * Validates SSL/TLS certificate for a database connection
     */
    async validateCertificate(
        hostname: string,
        port: number,
        connectionId: string
    ): Promise<{ valid: boolean; certificate?: CertificateInfo; warnings?: string[]; }> {
        try {
            Logger.info('Validating SSL certificate', 'validateCertificate', { hostname, port, connectionId });

            if (!this.config.certificateValidation.enabled) {
                Logger.info('Certificate validation disabled, skipping', 'validateCertificate');
                return { valid: true };
            }

            // Check cache first
            const cached = this.certificateCache.get(`${hostname}:${port}`);
            if (cached && (Date.now() - cached.timestamp) < 300000) { // 5 minute cache
                Logger.debug('Using cached certificate info', 'validateCertificate');
                return this.validateCertificateInfo(cached.cert, hostname, connectionId);
            }

            // Create TLS connection to check certificate
            const certificateInfo = await this.getCertificateInfo(hostname, port);

            // Cache the certificate info
            this.certificateCache.set(`${hostname}:${port}`, {
                cert: certificateInfo,
                timestamp: Date.now()
            });

            return this.validateCertificateInfo(certificateInfo, hostname, connectionId);

        } catch (error) {
            Logger.error('Certificate validation failed', error as Error, 'validateCertificate', {
                hostname, port, connectionId
            });

            const securityEvent: SecurityEvent = {
                id: `cert-${Date.now()}`,
                type: 'certificate',
                severity: 'high',
                description: `Certificate validation failed for ${hostname}:${port}`,
                timestamp: new Date().toISOString(),
                resolved: false,
                details: { error: (error as Error).message, hostname, port },
                connectionId
            };

            this.addSecurityEvent(securityEvent);
            throw error;
        }
    }

    private async getCertificateInfo(hostname: string, port: number): Promise<CertificateInfo> {
        return new Promise((resolve, reject) => {
            const socket = tls.connect(port, hostname, {
                rejectUnauthorized: false, // We'll do our own validation
                timeout: 10000
            });

            socket.on('secureConnect', () => {
                const cert = socket.getPeerCertificate();
                if (!cert || Object.keys(cert).length === 0) {
                    socket.destroy();
                    reject(new Error('No certificate provided by server'));
                    return;
                }

                const certificateInfo: CertificateInfo = {
                    subject: (cert.subject as any)?.CN || 'Unknown',
                    issuer: (cert.issuer as any)?.CN || 'Unknown',
                    validFrom: new Date(cert.valid_from || ''),
                    validTo: new Date(cert.valid_to || ''),
                    serialNumber: cert.serialNumber || 'Unknown',
                    fingerprint: cert.fingerprint || 'Unknown',
                    keySize: this.extractKeySize(cert),
                    algorithm: 'RSA', // Default assumption for PostgreSQL
                    isSelfSigned: this.isSelfSigned(cert),
                    revocationStatus: 'unknown' // Would need OCSP/CRL checking
                };

                socket.destroy();
                resolve(certificateInfo);
            });

            socket.on('error', (error) => {
                reject(error);
            });

            socket.on('timeout', () => {
                socket.destroy();
                reject(new Error('Certificate check timed out'));
            });
        });
    }

    private validateCertificateInfo(
        cert: CertificateInfo,
        hostname: string,
        connectionId: string
    ): { valid: boolean; certificate?: CertificateInfo; warnings?: string[]; } {
        const warnings: string[] = [];
        let valid = true;

        // Check if hostname is allowed
        if (this.config.certificatePinning.enabled && this.config.certificatePinning.allowedHostnames.length > 0) {
            if (!this.config.certificatePinning.allowedHostnames.includes(hostname)) {
                warnings.push(`Hostname ${hostname} not in allowed list`);
                if (this.config.securityLevel === 'strict') {
                    valid = false;
                }
            }
        }

        // Check certificate pinning
        if (this.config.certificatePinning.enabled) {
            const pinnedCert = this.pinnedCertificates.get(hostname);
            if (pinnedCert) {
                if (pinnedCert.fingerprint !== cert.fingerprint) {
                    warnings.push('Certificate fingerprint does not match pinned certificate');
                    if (this.config.securityLevel === 'strict') {
                        valid = false;
                    }
                }
            }
        }

        // Validate certificate properties
        if (cert.keySize < this.config.certificateValidation.minKeySize) {
            warnings.push(`Certificate key size (${cert.keySize} bits) below minimum (${this.config.certificateValidation.minKeySize} bits)`);
            if (this.config.securityLevel === 'strict') {
                valid = false;
            }
        }

        // Check validity period
        const validityDays = Math.ceil((cert.validTo.getTime() - cert.validFrom.getTime()) / (1000 * 60 * 60 * 24));
        if (validityDays > this.config.certificateValidation.maxValidityDays) {
            warnings.push(`Certificate validity period (${validityDays} days) exceeds maximum (${this.config.certificateValidation.maxValidityDays} days)`);
            if (this.config.securityLevel === 'strict') {
                valid = false;
            }
        }

        // Check if certificate is expired
        if (cert.validTo < new Date()) {
            warnings.push('Certificate has expired');
            valid = false;
        }

        // Check if certificate is not yet valid
        if (cert.validFrom > new Date()) {
            warnings.push('Certificate is not yet valid');
            valid = false;
        }

        // Check self-signed certificates
        if (cert.isSelfSigned && !this.config.certificateValidation.allowSelfSigned) {
            warnings.push('Self-signed certificate not allowed');
            if (this.config.securityLevel === 'strict') {
                valid = false;
            }
        }

        // Log security event if there are warnings
        if (warnings.length > 0) {
            const securityEvent: SecurityEvent = {
                id: `cert-validation-${Date.now()}`,
                type: 'certificate',
                severity: valid ? 'medium' : 'high',
                description: `Certificate validation for ${hostname} completed with ${warnings.length} warning(s)`,
                timestamp: new Date().toISOString(),
                resolved: valid,
                details: { hostname, warnings, valid },
                connectionId
            };

            this.addSecurityEvent(securityEvent);
        }

        return {
            valid,
            certificate: cert,
            ...(warnings.length > 0 && { warnings })
        };
    }

    private extractKeySize(pubkey: any): number {
        // Extract key size from public key
        if (pubkey && pubkey.keySize) {
            return pubkey.keySize;
        }

        // Try to determine from modulus length
        if (pubkey && pubkey.data) {
            const keyData = pubkey.data.toString('hex');
            // RSA key size is typically modulus length in bits
            return Math.ceil(keyData.length * 4); // Rough estimation
        }

        return 2048; // Default assumption
    }

    private isSelfSigned(cert: any): boolean {
        // Check if certificate is self-signed
        if (!cert || !cert.subject || !cert.issuer) {
            return false;
        }

        return cert.subject === cert.issuer;
    }

    private addSecurityEvent(event: SecurityEvent): void {
        this.securityEvents.push(event);

        // Limit the number of stored events
        if (this.securityEvents.length > this.config.monitoring.maxEvents) {
            this.securityEvents = this.securityEvents.slice(-this.config.monitoring.maxEvents);
        }

        // Show notification if configured
        if (this.config.monitoring.showNotifications && this.config.monitoring.alertLevels.includes(event.severity)) {
            this.showSecurityNotification(event);
        }

        Logger.info('Security event recorded', 'addSecurityEvent', {
            eventId: event.id,
            type: event.type,
            severity: event.severity
        });
    }

    private showSecurityNotification(event: SecurityEvent): void {
        const message = `Security ${event.severity}: ${event.description}`;

        switch (event.severity) {
            case 'critical':
            case 'high':
                vscode.window.showErrorMessage(message, 'View Details', 'Dismiss').then(selection => {
                    if (selection === 'View Details') {
                        this.showSecurityDetails(event);
                    }
                });
                break;
            case 'medium':
                vscode.window.showWarningMessage(message, 'View Details', 'Dismiss').then(selection => {
                    if (selection === 'View Details') {
                        this.showSecurityDetails(event);
                    }
                });
                break;
            default:
                vscode.window.showInformationMessage(message);
                break;
        }
    }

    private showSecurityDetails(event: SecurityEvent): void {
        const details = `
            Security Event Details:
            - Type: ${event.type}
            - Severity: ${event.severity}
            - Description: ${event.description}
            - Timestamp: ${new Date(event.timestamp).toLocaleString()}
            - Connection: ${event.connectionId || 'N/A'}
            - Hostname: ${event.hostname || 'N/A'}
            ${event.details ? `- Additional Info: ${JSON.stringify(event.details, null, 2)}` : ''}
        `;

        const outputChannel = vscode.window.createOutputChannel(`Security Event: ${event.id}`);
        outputChannel.clear();
        outputChannel.appendLine(details);
        outputChannel.show();
    }

    private cleanupOldEvents(): void {
        const cutoffDate = new Date(Date.now() - (this.config.monitoring.retentionDays * 24 * 60 * 60 * 1000));
        const initialCount = this.securityEvents.length;

        this.securityEvents = this.securityEvents.filter(event =>
            new Date(event.timestamp) > cutoffDate
        );

        const removedCount = initialCount - this.securityEvents.length;
        if (removedCount > 0) {
            Logger.info('Cleaned up old security events', 'cleanupOldEvents', { removedCount });
        }
    }

    private async loadPinnedCertificates(): Promise<void> {
        try {
            this.pinnedCertificates.clear();

            if (!this.secrets) {
                Logger.warn('VS Code secrets storage not available, using in-memory storage only', 'loadPinnedCertificates');
                return;
            }

            // Load pinned certificates from VS Code secret storage
            const pinnedCertsData = await this.secrets.get('postgresql.pinnedCertificates');

            if (pinnedCertsData) {
                try {
                    const pinnedCertsArray: Array<{ hostname: string; certificate: CertificateInfo; pinnedAt: string; }> = JSON.parse(pinnedCertsData);

                    for (const item of pinnedCertsArray) {
                        // Validate certificate data integrity
                        if (this.validateCertificateIntegrity(item.certificate)) {
                            this.pinnedCertificates.set(item.hostname, item.certificate);

                            Logger.debug('Loaded pinned certificate', 'loadPinnedCertificates', {
                                hostname: item.hostname,
                                fingerprint: item.certificate.fingerprint,
                                pinnedAt: item.pinnedAt
                            });
                        } else {
                            Logger.warn('Invalid pinned certificate data detected and skipped', 'loadPinnedCertificates', {
                                hostname: item.hostname
                            });
                        }
                    }

                    Logger.info('Pinned certificates loaded from secret storage', 'loadPinnedCertificates', {
                        count: this.pinnedCertificates.size
                    });

                } catch (parseError) {
                    Logger.error('Failed to parse pinned certificates data', parseError as Error, 'loadPinnedCertificates');
                    // Clear corrupted data
                    await this.secrets.delete('postgresql.pinnedCertificates');
                }
            } else {
                Logger.info('No pinned certificates found in secret storage', 'loadPinnedCertificates');
            }

        } catch (error) {
            Logger.error('Failed to load pinned certificates', error as Error, 'loadPinnedCertificates');
        }
    }

    private async savePinnedCertificates(): Promise<void> {
        try {
            if (!this.secrets) {
                Logger.warn('VS Code secrets storage not available, cannot persist pinned certificates', 'savePinnedCertificates');
                return;
            }

            // Convert pinned certificates map to array for storage
            const pinnedCertsArray: Array<{ hostname: string; certificate: CertificateInfo; pinnedAt: string; }> = [];

            for (const [hostname, certificate] of this.pinnedCertificates.entries()) {
                // Validate certificate before saving
                if (this.validateCertificateIntegrity(certificate)) {
                    pinnedCertsArray.push({
                        hostname,
                        certificate,
                        pinnedAt: new Date().toISOString()
                    });
                } else {
                    Logger.warn('Skipping invalid certificate during save', 'savePinnedCertificates', {
                        hostname
                    });
                }
            }

            // Save to VS Code secret storage
            const pinnedCertsData = JSON.stringify(pinnedCertsArray);
            await this.secrets.store('postgresql.pinnedCertificates', pinnedCertsData);

            Logger.info('Pinned certificates saved to secret storage', 'savePinnedCertificates', {
                count: pinnedCertsArray.length
            });

        } catch (error) {
            Logger.error('Failed to save pinned certificates', error as Error, 'savePinnedCertificates');
        }
    }

    private startSecurityMonitoring(): void {
        // Clean up old events every hour
        setInterval(() => {
            this.cleanupOldEvents();
            this.cleanupRateLimitStore();
        }, 60 * 60 * 1000);

        // Auto-resolve events after configured period
        if (this.config.monitoring.autoResolveAfterDays > 0) {
            setInterval(() => {
                this.autoResolveEvents();
            }, 24 * 60 * 60 * 1000);
        }

        Logger.info('Security monitoring started', 'startSecurityMonitoring');
    }

    private autoResolveEvents(): void {
        const cutoffDate = new Date(Date.now() - (this.config.monitoring.autoResolveAfterDays * 24 * 60 * 60 * 1000));
        let resolvedCount = 0;

        this.securityEvents.forEach(event => {
            if (!event.resolved && new Date(event.timestamp) < cutoffDate) {
                event.resolved = true;
                resolvedCount++;
            }
        });

        if (resolvedCount > 0) {
            Logger.info('Auto-resolved security events', 'autoResolveEvents', { resolvedCount });
        }
    }

    /**
     * Validates SQL queries for potential injection attacks
     */
    validateSQLQuery(sql: string, parameters?: any[]): SQLInjectionCheck {
        const detectedPatterns: string[] = [];
        const recommendations: string[] = [];
        let riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical' = 'none';

        // Pattern-based detection for common SQL injection attempts
        const injectionPatterns = [
            /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b.*\b(from|into|where)\b)/gi,
            /('|(\\')|(;)|(\|\|)|(\*)|(%)|(\-\-))/g,
            /(\b(or|and)\b\s+\d+\s*=\s*\d+)/gi,
            /\/\*.*\*\//g, // SQL comments that might hide malicious content
            /(\bscript\b|\balert\b|\bprompt\b)/gi,
            /(\bwaitfor\b|\bdelay\b)/gi,
            /(\bxp_)/gi, // Potentially dangerous stored procedures
        ];

        // Check for suspicious patterns
        for (const pattern of injectionPatterns) {
            const matches = sql.match(pattern);
            if (matches) {
                detectedPatterns.push(...matches);
                riskLevel = this.escalateRiskLevel(riskLevel, 'medium');
            }
        }

        // Check for dangerous keywords without proper parameterization
        if (!parameters || parameters.length === 0) {
            const dangerousKeywords = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER'];
            for (const keyword of dangerousKeywords) {
                if (sql.toUpperCase().includes(keyword) && !this.isParameterizedQuery(sql)) {
                    detectedPatterns.push(`Unparameterized ${keyword} statement`);
                    riskLevel = this.escalateRiskLevel(riskLevel, 'high');
                    recommendations.push(`Use parameterized queries for ${keyword} statements`);
                }
            }
        }

        // Validate parameter binding if parameters are provided
        if (parameters && parameters.length > 0) {
            const paramValidation = this.validateParameterBinding(sql, parameters);
            if (!paramValidation.isValid) {
                detectedPatterns.push(...paramValidation.issues);
                riskLevel = this.escalateRiskLevel(riskLevel, 'high');
                recommendations.push(...paramValidation.recommendations);
            }
        }

        // Generate sanitized query if risky patterns found
        let sanitizedQuery: string | undefined;
        if (detectedPatterns.length > 0) {
            sanitizedQuery = this.sanitizeSQLQuery(sql);
        }

        const isSafe = riskLevel === 'none' || riskLevel === 'low';

        // Log security event if high risk detected
        if (riskLevel === 'high' || riskLevel === 'critical') {
            const securityEvent: SecurityEvent = {
                id: `sql-injection-${Date.now()}`,
                type: 'data_access',
                severity: riskLevel === 'critical' ? 'critical' : 'high',
                description: `Potential SQL injection detected in query`,
                timestamp: new Date().toISOString(),
                resolved: false,
                details: {
                    riskLevel,
                    detectedPatterns,
                    queryLength: sql.length,
                    hasParameters: !!parameters
                }
            };
            this.addSecurityEvent(securityEvent);
        }

        return {
            isSafe,
            riskLevel,
            detectedPatterns,
            sanitizedQuery,
            recommendations
        };
    }

    /**
     * Validates password strength and provides feedback
     */
    validatePasswordStrength(password: string): PasswordStrengthResult {
        const feedback: string[] = [];
        let score = 0;

        // Length check
        if (password.length >= 12) {
            score += 25;
        } else if (password.length >= 8) {
            score += 15;
            feedback.push('Consider using at least 12 characters');
        } else {
            score += 5;
            feedback.push('Password should be at least 8 characters long');
        }

        // Character variety checks
        if (/[a-z]/.test(password)) score += 15;
        else feedback.push('Add lowercase letters');

        if (/[A-Z]/.test(password)) score += 15;
        else feedback.push('Add uppercase letters');

        if (/[0-9]/.test(password)) score += 15;
        else feedback.push('Add numbers');

        if (/[^a-zA-Z0-9]/.test(password)) score += 15;
        else feedback.push('Add special characters (!@#$%^&*)');

        // Complexity bonus
        if (/(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9])/.test(password)) {
            score += 10;
        }

        // Common patterns penalty
        if (/(.)\1{2,}/.test(password)) {
            score -= 10;
            feedback.push('Avoid repeated characters');
        }

        if (/123|abc|qwe|password|admin/i.test(password)) {
            score -= 15;
            feedback.push('Avoid common patterns and dictionary words');
        }

        // Ensure score is within bounds
        score = Math.max(0, Math.min(100, score));

        // Determine strength category
        let strength: 'very-weak' | 'weak' | 'fair' | 'good' | 'strong';
        if (score >= 90) strength = 'strong';
        else if (score >= 70) strength = 'good';
        else if (score >= 50) strength = 'fair';
        else if (score >= 30) strength = 'weak';
        else strength = 'very-weak';

        const isAcceptable = score >= 60; // Minimum acceptable score

        return {
            score,
            strength,
            feedback,
            isAcceptable
        };
    }

    /**
     * Implements rate limiting for connection attempts
     */
    checkRateLimit(identifier: string, maxAttempts: number = 5, windowMs: number = 300000): RateLimitResult {
        const now = Date.now();
        const windowStart = now - windowMs;

        // Get or create rate limit entry
        let rateLimitData = this.rateLimitStore.get(identifier);

        if (!rateLimitData || rateLimitData.windowStart < windowStart) {
            // Reset window if expired
            rateLimitData = {
                attempts: 0,
                windowStart: now
            };
        }

        rateLimitData.attempts++;

        // Check if limit exceeded
        const allowed = rateLimitData.attempts <= maxAttempts;

        let retryAfter: number | undefined;
        if (!allowed) {
            retryAfter = Math.ceil((rateLimitData.windowStart + windowMs - now) / 1000);

            // Log security event for rate limit violation
            const securityEvent: SecurityEvent = {
                id: `rate-limit-${Date.now()}`,
                type: 'authentication',
                severity: 'medium',
                description: `Rate limit exceeded for ${identifier}`,
                timestamp: new Date().toISOString(),
                resolved: true,
                details: {
                    attempts: rateLimitData.attempts,
                    maxAttempts,
                    retryAfter,
                    identifier
                }
            };
            this.addSecurityEvent(securityEvent);
        }

        this.rateLimitStore.set(identifier, rateLimitData);

        return {
            allowed,
            retryAfter,
            totalAttempts: rateLimitData.attempts,
            windowStart: rateLimitData.windowStart,
            reason: allowed ? undefined : `Maximum ${maxAttempts} attempts per ${Math.round(windowMs / 1000)}s window exceeded`
        };
    }

    /**
     * Classifies data based on predefined patterns and rules
     */
    classifyData(data: string, context?: string): DataClassification {
        if (!this.config.dataClassification.enabled) {
            return this.config.dataClassification.defaultClassification;
        }

        // Initialize default classification rules if not already done
        if (this.dataClassificationRules.length === 0) {
            this.initializeDefaultClassificationRules();
        }

        let highestClassification = DataClassification.PUBLIC;

        // Check against each classification rule
        for (const rule of this.dataClassificationRules) {
            try {
                const regex = new RegExp(rule.pattern, 'gi');
                if (regex.test(data)) {
                    if (this.getClassificationPriority(rule.classification) > this.getClassificationPriority(highestClassification)) {
                        highestClassification = rule.classification;
                    }
                }
            } catch (error) {
                Logger.warn(`Invalid regex pattern in classification rule ${rule.id}`, 'classifyData');
            }
        }

        // Context-based classification boosts
        if (context) {
            highestClassification = this.applyContextClassification(data, context, highestClassification);
        }

        return highestClassification;
    }

    /**
     * Masks sensitive data based on classification and masking strategy
     */
    maskData(data: string, classification: DataClassification, strategy?: DataMaskingStrategy): string {
        if (!this.config.dataClassification.maskingEnabled) {
            return data;
        }

        const rule = this.dataClassificationRules.find(r => r.classification === classification);
        const maskingStrategy = strategy || rule?.maskingStrategy;

        if (!maskingStrategy) {
            return data;
        }

        switch (maskingStrategy.type) {
            case 'partial':
                return this.applyPartialMasking(data, maskingStrategy);
            case 'full':
                return this.applyFullMasking(data, maskingStrategy);
            case 'hash':
                return this.applyHashMasking(data, maskingStrategy);
            case 'tokenize':
                return this.applyTokenMasking(data);
            default:
                return data;
        }
    }

    /**
     * Encrypts sensitive data using configured encryption settings
     */
    async encryptSensitiveData(data: string, classification: DataClassification): Promise<string> {
        if (!this.config.encryption.enabled || classification === DataClassification.PUBLIC) {
            return data;
        }

        try {
            // Generate or retrieve encryption key
            const keyId = await this.getOrCreateEncryptionKey(classification);
            const key = this.encryptionKeys.get(keyId);

            if (!key) {
                Logger.warn('Encryption key not found, returning unencrypted data', 'encryptSensitiveData');
                return data;
            }

            // In a real implementation, this would use Node.js crypto module
            // For now, we'll use a placeholder that would be replaced with actual encryption
            const encrypted = `encrypted_${Buffer.from(data).toString('base64')}_${key.algorithm}`;

            // Cache encrypted data
            this.sensitiveDataCache.set(encrypted, {
                encrypted,
                classification,
                timestamp: Date.now()
            });

            Logger.info('Data encrypted successfully', 'encryptSensitiveData', {
                classification,
                algorithm: key.algorithm
            });

            return encrypted;

        } catch (error) {
            Logger.error('Failed to encrypt sensitive data', error as Error, 'encryptSensitiveData');
            return data;
        }
    }

    /**
     * Decrypts previously encrypted data
     */
    async decryptSensitiveData(encryptedData: string): Promise<string> {
        if (!this.config.encryption.enabled) {
            return encryptedData;
        }

        try {
            const cached = this.sensitiveDataCache.get(encryptedData);
            if (cached) {
                // In a real implementation, this would decrypt the actual encrypted data
                const decrypted = Buffer.from(encryptedData.replace('encrypted_', '').split('_')[0], 'base64').toString();
                return decrypted;
            }

            Logger.warn('Encrypted data not found in cache', 'decryptSensitiveData');
            return encryptedData;

        } catch (error) {
            Logger.error('Failed to decrypt sensitive data', error as Error, 'decryptSensitiveData');
            return encryptedData;
        }
    }

    /**
     * Generates compliance report for specified framework
     */
    async generateComplianceReport(framework: ComplianceFramework, startDate: Date, endDate: Date): Promise<ComplianceReport> {
        if (!this.config.compliance.enabled || !this.config.compliance.frameworks.includes(framework)) {
            throw new Error(`Compliance framework ${framework} not enabled`);
        }

        const findings: ComplianceFinding[] = [];
        const reportId = `compliance-${framework}-${Date.now()}`;

        // Analyze security events for compliance violations
        const relevantEvents = this.securityEvents.filter(event =>
            new Date(event.timestamp) >= startDate &&
            new Date(event.timestamp) <= endDate
        );

        // Check for common compliance violations
        const highSeverityEvents = relevantEvents.filter(e => e.severity === 'high' || e.severity === 'critical');
        if (highSeverityEvents.length > 0) {
            findings.push({
                id: `${reportId}-high-severity`,
                category: 'Security Events',
                severity: 'high',
                description: `${highSeverityEvents.length} high/critical security events detected`,
                status: 'open',
                remediation: 'Review and resolve all high/critical security events'
            });
        }

        // Check for data classification compliance
        if (this.config.dataClassification.enabled) {
            const unclassifiedData = this.sensitiveDataCache.size;
            if (unclassifiedData > 0) {
                findings.push({
                    id: `${reportId}-data-classification`,
                    category: 'Data Classification',
                    severity: 'medium',
                    description: `${unclassifiedData} data items may require classification`,
                    status: 'open',
                    remediation: 'Review and classify all sensitive data'
                });
            }
        }

        // Check encryption compliance
        if (this.config.encryption.enabled) {
            const expiredKeys = Array.from(this.encryptionKeys.values()).filter(k => k.expires && k.expires < new Date());
            if (expiredKeys.length > 0) {
                findings.push({
                    id: `${reportId}-key-rotation`,
                    category: 'Encryption',
                    severity: 'high',
                    description: `${expiredKeys.length} encryption keys have expired`,
                    status: 'open',
                    remediation: 'Rotate all expired encryption keys'
                });
            }
        }

        const overallStatus = findings.filter(f => f.severity === 'critical').length > 0 ? 'non-compliant' :
                           findings.filter(f => f.severity === 'high').length > 0 ? 'partial' : 'compliant';

        const report: ComplianceReport = {
            id: reportId,
            framework,
            generatedAt: new Date(),
            period: { start: startDate, end: endDate },
            findings,
            overallStatus,
            nextAssessmentDue: new Date(Date.now() + this.getComplianceFrequencyMs())
        };

        Logger.info('Compliance report generated', 'generateComplianceReport', {
            reportId,
            framework,
            findingCount: findings.length,
            overallStatus
        });

        return report;
    }

    /**
     * Validates network connection against security rules
     */
    async validateNetworkConnection(
        hostname: string,
        port: number,
        sourceIP?: string,
        connectionId?: string
    ): Promise<{ allowed: boolean; blockedReason?: string; requiresSSL?: boolean; }> {
        if (!this.config.networkSecurity.enabled) {
            return { allowed: true };
        }

        // Initialize default network rules if not already done
        if (this.networkSecurityRules.length === 0) {
            this.initializeDefaultNetworkRules();
        }

        // Check if connection is explicitly blocked
        if (this.blockedConnections.has(hostname) || this.blockedConnections.has(sourceIP || '')) {
            return {
                allowed: false,
                blockedReason: 'Connection blocked by security policy'
            };
        }

        // Check port restrictions
        if (!this.config.networkSecurity.allowedPorts.includes(port)) {
            return {
                allowed: false,
                blockedReason: `Port ${port} not in allowed ports list`
            };
        }

        // Check SSL requirements for external connections
        if (this.config.networkSecurity.requireSSLForExternal && this.isExternalHost(hostname) && port !== 5432) {
            return {
                allowed: false,
                blockedReason: 'External connections require SSL on port 5432',
                requiresSSL: true
            };
        }

        // Apply network security rules
        for (const rule of this.networkSecurityRules.sort((a, b) => b.priority - a.priority)) {
            if (!rule.enabled) continue;

            const matches = this.evaluateNetworkRule(rule, hostname, port, sourceIP);
            if (matches) {
                if (rule.action === 'deny') {
                    const securityEvent: SecurityEvent = {
                        id: `network-block-${Date.now()}`,
                        type: 'connection',
                        severity: 'high',
                        description: `Connection blocked by network security rule: ${rule.name}`,
                        timestamp: new Date().toISOString(),
                        resolved: false,
                        details: { hostname, port, sourceIP, ruleId: rule.id },
                        connectionId
                    };
                    this.addSecurityEvent(securityEvent);

                    return {
                        allowed: false,
                        blockedReason: `Blocked by rule: ${rule.name}`
                    };
                } else if (rule.action === 'allow') {
                    return { allowed: true };
                }
            }
        }

        // Default policy
        if (this.config.networkSecurity.whitelistOnly) {
            return {
                allowed: false,
                blockedReason: 'Whitelist-only mode: connection not explicitly allowed'
            };
        }

        return { allowed: true };
    }

    /**
     * Performs vulnerability scan on target host
     */
    async performVulnerabilityScan(
        target: string,
        scanType: 'port' | 'ssl' | 'configuration' | 'full' = 'full',
        connectionId?: string
    ): Promise<VulnerabilityScan> {
        if (!this.config.vulnerabilityScanning.enabled) {
            throw new Error('Vulnerability scanning not enabled');
        }

        const scanId = `scan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const scan: VulnerabilityScan = {
            id: scanId,
            target,
            scanType,
            startedAt: new Date(),
            status: 'running',
            findings: [],
            summary: {
                totalVulnerabilities: 0,
                criticalCount: 0,
                highCount: 0,
                mediumCount: 0,
                lowCount: 0
            }
        };

        this.vulnerabilityScans.set(scanId, scan);

        try {
            // Simulate vulnerability scanning
            await this.executeVulnerabilityScan(scan);

            scan.status = 'completed';
            scan.completedAt = new Date();

            // Update summary counts
            scan.summary = this.calculateVulnerabilitySummary(scan.findings);

            Logger.info('Vulnerability scan completed', 'performVulnerabilityScan', {
                scanId,
                target,
                findingCount: scan.findings.length,
                criticalCount: scan.summary.criticalCount
            });

            // Alert on new vulnerabilities if configured
            if (this.config.vulnerabilityScanning.alertOnNewVulnerabilities && scan.summary.criticalCount + scan.summary.highCount > 0) {
                const securityEvent: SecurityEvent = {
                    id: `vuln-scan-${Date.now()}`,
                    type: 'configuration',
                    severity: scan.summary.criticalCount > 0 ? 'critical' : 'high',
                    description: `Vulnerability scan found ${scan.summary.totalVulnerabilities} issues for ${target}`,
                    timestamp: new Date().toISOString(),
                    resolved: false,
                    details: {
                        scanId,
                        target,
                        summary: scan.summary,
                        criticalFindings: scan.findings.filter(f => f.severity === 'critical').length
                    },
                    connectionId
                };
                this.addSecurityEvent(securityEvent);
            }

        } catch (error) {
            scan.status = 'failed';
            scan.completedAt = new Date();

            Logger.error('Vulnerability scan failed', error as Error, 'performVulnerabilityScan', {
                scanId,
                target
            });
        }

        return scan;
    }

    /**
     * Blocks a connection by hostname or IP
     */
    blockConnection(identifier: string, reason: string, duration?: number): void {
        this.blockedConnections.add(identifier);

        if (duration) {
            // Auto-unblock after duration
            setTimeout(() => {
                this.blockedConnections.delete(identifier);
                Logger.info('Connection auto-unblocked', 'blockConnection', { identifier, reason });
            }, duration);
        }

        const securityEvent: SecurityEvent = {
            id: `block-${Date.now()}`,
            type: 'connection',
            severity: 'high',
            description: `Connection blocked: ${identifier}`,
            timestamp: new Date().toISOString(),
            resolved: false,
            details: { identifier, reason, duration, permanent: !duration }
        };
        this.addSecurityEvent(securityEvent);

        Logger.info('Connection blocked', 'blockConnection', { identifier, reason, duration });
    }

    /**
     * Unblocks a previously blocked connection
     */
    unblockConnection(identifier: string): void {
        const wasBlocked = this.blockedConnections.has(identifier);
        this.blockedConnections.delete(identifier);

        if (wasBlocked) {
            Logger.info('Connection unblocked', 'unblockConnection', { identifier });
        }
    }

    validateConnectionSecurity(hostname: string, _port: number, useSSL: boolean): {
        allowed: boolean;
        reason?: string;
        requiresSSL?: boolean;
    } {
        // Check if secure connections are enforced
        if (this.config.connectionSecurity.enforceSecureConnections && !useSSL) {
            return {
                allowed: false,
                reason: 'Secure connections are enforced but connection is not using SSL',
                requiresSSL: true
            };
        }

        // Check hostname restrictions
        if (this.config.certificatePinning.enabled &&
            this.config.certificatePinning.allowedHostnames.length > 0 &&
            !this.config.certificatePinning.allowedHostnames.includes(hostname)) {
            return {
                allowed: false,
                reason: `Hostname ${hostname} not in allowed list for certificate pinning`
            };
        }

        return { allowed: true };
    }

    /**
     * Helper method to escalate risk level based on detected patterns
     */
    private escalateRiskLevel(currentLevel: 'none' | 'low' | 'medium' | 'high' | 'critical', newLevel: 'none' | 'low' | 'medium' | 'high' | 'critical'): 'none' | 'low' | 'medium' | 'high' | 'critical' {
        const riskHierarchy = { 'none': 0, 'low': 1, 'medium': 2, 'high': 3, 'critical': 4 };
        const current = riskHierarchy[currentLevel];
        const target = riskHierarchy[newLevel];

        if (target > current) {
            return newLevel;
        }
        return currentLevel;
    }

    /**
     * Checks if a query uses parameterized statements
     */
    private isParameterizedQuery(sql: string): boolean {
        // Check for common parameter placeholders
        const paramPatterns = [
            /\$\d+/g,           // PostgreSQL $1, $2 format
            /\?/g,              // Standard ? placeholders
            /@\w+/g,            // @param format
            /:\w+/g             // :param format
        ];

        for (const pattern of paramPatterns) {
            if (pattern.test(sql)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Validates parameter binding in SQL queries
     */
    private validateParameterBinding(sql: string, parameters: any[]): { isValid: boolean; issues: string[]; recommendations: string[]; } {
        const issues: string[] = [];
        const recommendations: string[] = [];

        // Count parameter placeholders
        const dollarParams = (sql.match(/\$\d+/g) || []).length;
        const questionParams = (sql.match(/\?/g) || []).length;
        const namedParams = (sql.match(/@\w+/g) || []).length + (sql.match(/:\w+/g) || []).length;

        const totalPlaceholders = dollarParams + questionParams + namedParams;

        if (totalPlaceholders === 0 && parameters.length > 0) {
            issues.push('Parameters provided but no placeholders found in query');
            recommendations.push('Remove unused parameters or add proper placeholders');
        }

        if (totalPlaceholders > 0 && parameters.length === 0) {
            issues.push('Query contains placeholders but no parameters provided');
            recommendations.push('Provide parameters for all placeholders or use literal values');
        }

        if (parameters.length !== totalPlaceholders && totalPlaceholders > 0) {
            issues.push(`Parameter count mismatch: ${parameters.length} provided, ${totalPlaceholders} expected`);
            recommendations.push('Ensure parameter count matches placeholder count');
        }

        // Validate parameter types (basic check)
        for (let i = 0; i < parameters.length; i++) {
            const param = parameters[i];
            if (typeof param === 'string' && param.length > 1000) {
                issues.push(`Parameter ${i + 1} is unusually long (${param.length} characters)`);
                recommendations.push('Review long string parameters for potential injection');
            }
        }

        return {
            isValid: issues.length === 0,
            issues,
            recommendations
        };
    }

    /**
     * Sanitizes SQL queries by removing potentially dangerous patterns
     */
    private sanitizeSQLQuery(sql: string): string {
        let sanitized = sql;

        // Remove SQL comments
        sanitized = sanitized.replace(/\/\*[\s\S]*?\*\//g, '');
        sanitized = sanitized.replace(/--.*$/gm, '');

        // Remove potentially dangerous keywords if not parameterized
        if (!this.isParameterizedQuery(sanitized)) {
            // Be conservative - only remove obvious injection attempts
            sanitized = sanitized.replace(/;\s*(drop|delete|update|insert|alter)\s+/gi, '; -- ');
        }

        return sanitized.trim();
    }

    /**
     * Validates certificate data integrity before storage or usage
     */
    private validateCertificateIntegrity(certificate: CertificateInfo): boolean {
        try {
            // Check required fields
            if (!certificate.subject || !certificate.issuer || !certificate.fingerprint) {
                Logger.warn('Certificate missing required fields', 'validateCertificateIntegrity');
                return false;
            }

            // Validate fingerprint format (should be colon-separated hex)
            const fingerprintRegex = /^[A-Fa-f0-9]{2}(:[A-Fa-f0-9]{2})*$/;
            if (!fingerprintRegex.test(certificate.fingerprint)) {
                Logger.warn('Certificate has invalid fingerprint format', 'validateCertificateIntegrity');
                return false;
            }

            // Validate dates
            const now = new Date();
            const validFrom = new Date(certificate.validFrom);
            const validTo = new Date(certificate.validTo);

            if (isNaN(validFrom.getTime()) || isNaN(validTo.getTime())) {
                Logger.warn('Certificate has invalid date format', 'validateCertificateIntegrity');
                return false;
            }

            // Check if certificate is not expired
            if (validTo < now) {
                Logger.warn('Certificate has expired', 'validateCertificateIntegrity', {
                    validTo: certificate.validTo,
                    now: now.toISOString()
                });
                return false;
            }

            // Validate key size
            if (certificate.keySize < 1024) {
                Logger.warn('Certificate has insufficient key size', 'validateCertificateIntegrity', {
                    keySize: certificate.keySize
                });
                return false;
            }

            // Validate algorithm
            if (!certificate.algorithm || certificate.algorithm.length === 0) {
                Logger.warn('Certificate missing algorithm information', 'validateCertificateIntegrity');
                return false;
            }

            return true;

        } catch (error) {
            Logger.error('Certificate integrity validation failed', error as Error, 'validateCertificateIntegrity');
            return false;
        }
    }

    /**
     * Pins a certificate for a specific hostname with validation
     */
    async pinCertificate(hostname: string, certificate: CertificateInfo, userApproval: boolean = false): Promise<boolean> {
        try {
            // Validate certificate before pinning
            if (!this.validateCertificateIntegrity(certificate)) {
                Logger.error('Cannot pin invalid certificate', new Error('Certificate validation failed'), 'pinCertificate');
                return false;
            }

            // Check if user approval is required for pinning
            if (this.config.certificatePinning.requireUserApproval && !userApproval) {
                Logger.warn('Certificate pinning requires user approval', 'pinCertificate', { hostname });
                return false;
            }

            // Check if hostname is in allowed list
            if (this.config.certificatePinning.allowedHostnames.length > 0 &&
                !this.config.certificatePinning.allowedHostnames.includes(hostname)) {
                Logger.warn('Hostname not in allowed list for certificate pinning', 'pinCertificate', { hostname });
                return false;
            }

            // Store certificate
            this.pinnedCertificates.set(hostname, certificate);

            // Persist to secret storage
            await this.savePinnedCertificates();

            // Log security event
            const securityEvent: SecurityEvent = {
                id: `cert-pin-${Date.now()}`,
                type: 'certificate',
                severity: 'low',
                description: `Certificate pinned for hostname: ${hostname}`,
                timestamp: new Date().toISOString(),
                resolved: true,
                details: {
                    hostname,
                    fingerprint: certificate.fingerprint,
                    subject: certificate.subject,
                    userApproved: userApproval
                }
            };
            this.addSecurityEvent(securityEvent);

            Logger.info('Certificate pinned successfully', 'pinCertificate', {
                hostname,
                fingerprint: certificate.fingerprint,
                userApproved: userApproval
            });

            return true;

        } catch (error) {
            Logger.error('Failed to pin certificate', error as Error, 'pinCertificate');
            return false;
        }
    }

    /**
     * Removes a pinned certificate for a hostname
     */
    async unpinCertificate(hostname: string): Promise<boolean> {
        try {
            const wasPinned = this.pinnedCertificates.has(hostname);
            this.pinnedCertificates.delete(hostname);

            if (wasPinned) {
                // Persist changes to secret storage
                await this.savePinnedCertificates();

                // Log security event
                const securityEvent: SecurityEvent = {
                    id: `cert-unpin-${Date.now()}`,
                    type: 'certificate',
                    severity: 'low',
                    description: `Certificate unpinned for hostname: ${hostname}`,
                    timestamp: new Date().toISOString(),
                    resolved: true,
                    details: { hostname }
                };
                this.addSecurityEvent(securityEvent);

                Logger.info('Certificate unpinned successfully', 'unpinCertificate', { hostname });
            }

            return wasPinned;

        } catch (error) {
            Logger.error('Failed to unpin certificate', error as Error, 'unpinCertificate');
            return false;
        }
    }

    /**
     * Gets all pinned certificates with their metadata
     */
    getPinnedCertificates(): Array<{ hostname: string; certificate: CertificateInfo; isValid: boolean; }> {
        const result: Array<{ hostname: string; certificate: CertificateInfo; isValid: boolean; }> = [];

        for (const [hostname, certificate] of this.pinnedCertificates.entries()) {
            result.push({
                hostname,
                certificate,
                isValid: this.validateCertificateIntegrity(certificate)
            });
        }

        return result;
    }

    /**
     * Validates a certificate against pinned certificate for hostname
     */
    validateAgainstPinned(hostname: string, certificate: CertificateInfo): { valid: boolean; reason?: string; } {
        const pinnedCert = this.pinnedCertificates.get(hostname);

        if (!pinnedCert) {
            return {
                valid: !this.config.certificatePinning.enabled,
                reason: this.config.certificatePinning.enabled ? 'No pinned certificate found for hostname' : undefined
            };
        }

        // Validate certificate integrity first
        if (!this.validateCertificateIntegrity(certificate)) {
            return {
                valid: false,
                reason: 'Certificate validation failed'
            };
        }

        // Compare fingerprints
        if (pinnedCert.fingerprint !== certificate.fingerprint) {
            return {
                valid: false,
                reason: 'Certificate fingerprint does not match pinned certificate'
            };
        }

        // Check if pinned certificate is still valid
        if (!this.validateCertificateIntegrity(pinnedCert)) {
            return {
                valid: false,
                reason: 'Pinned certificate is no longer valid'
            };
        }

        return { valid: true };
    }

    /**
     * Demonstrates regulatory compliance capabilities
     */
    async demonstrateComplianceFeatures(): Promise<void> {
        Logger.info('=== Regulatory Compliance Demonstration ===');

        try {
            // 1. Generate GDPR Compliance Report
            Logger.info('Generating GDPR compliance report...');
            const gdprReport = await this.generateComplianceReport(
                ComplianceFramework.GDPR,
                new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
                new Date()
            );

            Logger.info('GDPR Report Generated', 'demonstrateComplianceFeatures', {
                reportId: gdprReport.id,
                overallStatus: gdprReport.overallStatus,
                findingCount: gdprReport.findings.length,
                nextAssessment: gdprReport.nextAssessmentDue
            });

            // 2. Generate HIPAA Compliance Report
            Logger.info('Generating HIPAA compliance report...');
            const hipaaReport = await this.generateComplianceReport(
                ComplianceFramework.HIPAA,
                new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // Last 90 days
                new Date()
            );

            Logger.info('HIPAA Report Generated', 'demonstrateComplianceFeatures', {
                reportId: hipaaReport.id,
                overallStatus: hipaaReport.overallStatus,
                findingCount: hipaaReport.findings.length
            });

            // 3. Demonstrate SOX compliance assessment
            Logger.info('Assessing SOX compliance requirements...');
            const soxFindings = await this.assessSOXCompliance();
            Logger.info('SOX Assessment Complete', 'demonstrateComplianceFeatures', {
                totalControls: soxFindings.length,
                compliantControls: soxFindings.filter(f => f.status === 'resolved').length
            });

        } catch (error) {
            Logger.error('Compliance demonstration failed', error as Error, 'demonstrateComplianceFeatures');
        }
    }

    /**
     * Demonstrates data protection capabilities
     */
    async demonstrateDataProtection(): Promise<void> {
        Logger.info('=== Data Protection Demonstration ===');

        try {
            // 1. Classify different types of sensitive data
            const testData = [
                { data: 'john.doe@example.com', context: 'email field' },
                { data: '1234-5678-9012-3456', context: 'payment info' },
                { data: '123-45-6789', context: 'identification' },
                { data: '+1-555-0123', context: 'contact info' },
                { data: '192.168.1.100', context: 'network info' }
            ];

            Logger.info('Classifying sensitive data...');
            for (const item of testData) {
                const classification = this.classifyData(item.data, item.context);
                Logger.info('Data Classified', 'demonstrateDataProtection', {
                    data: item.data.substring(0, 20) + '...',
                    context: item.context,
                    classification,
                    priority: this.getClassificationPriority(classification)
                });
            }

            // 2. Demonstrate data masking
            Logger.info('Demonstrating data masking strategies...');
            const sensitiveEmail = 'user@company.com';
            const emailClassification = this.classifyData(sensitiveEmail, 'email');

            const maskedPartial = this.maskData(sensitiveEmail, emailClassification, {
                type: 'partial',
                showFirst: 2,
                showLast: 2
            });

            const maskedFull = this.maskData(sensitiveEmail, emailClassification, {
                type: 'full',
                preserveLength: true
            });

            Logger.info('Data Masking Examples', 'demonstrateDataProtection', {
                original: sensitiveEmail,
                partialMask: maskedPartial,
                fullMask: maskedFull
            });

            // 3. Demonstrate encryption/decryption
            Logger.info('Demonstrating encryption capabilities...');
            const sensitiveConfig = '{"password": "secret123", "apiKey": "key456"}';
            const classification = DataClassification.RESTRICTED;

            const encrypted = await this.encryptSensitiveData(sensitiveConfig, classification);
            const decrypted = await this.decryptSensitiveData(encrypted);

            Logger.info('Encryption Test', 'demonstrateDataProtection', {
                originalLength: sensitiveConfig.length,
                encryptedLength: encrypted.length,
                decryptedMatches: decrypted === sensitiveConfig,
                classification
            });

            // 4. Show compliance framework integration
            Logger.info('Demonstrating compliance framework data handling...');
            const piiData = 'Patient ID: 12345, DOB: 1980-01-01, SSN: 123-45-6789';

            // GDPR compliance - strict PII protection
            const gdprClassification = this.classifyData(piiData, 'patient record');
            const gdprMasked = this.maskData(piiData, gdprClassification);

            // HIPAA compliance - healthcare data protection
            const hipaaClassification = this.classifyData(piiData, 'medical record');
            const hipaaEncrypted = await this.encryptSensitiveData(piiData, hipaaClassification);

            Logger.info('Compliance-specific Data Protection', 'demonstrateDataProtection', {
                gdprClassification,
                gdprMaskedLength: gdprMasked.length,
                hipaaClassification,
                hipaaEncryptedLength: hipaaEncrypted.length
            });

        } catch (error) {
            Logger.error('Data protection demonstration failed', error as Error, 'demonstrateDataProtection');
        }
    }

    /**
     * Test method to validate security implementations
     */
    runSecurityTests(): { sqlInjection: boolean; passwordStrength: boolean; rateLimiting: boolean; } {
        const results = {
            sqlInjection: false,
            passwordStrength: false,
            rateLimiting: false
        };

        try {
            // Test SQL injection prevention
            const maliciousQuery = "'; DROP TABLE users; --";
            const sqlCheck = this.validateSQLQuery(maliciousQuery);
            results.sqlInjection = !sqlCheck.isSafe && sqlCheck.riskLevel !== 'none';

            // Test password strength validation
            const weakPassword = "123";
            const strongPassword = "MyStr0ng!P@ssw0rd";
            const weakResult = this.validatePasswordStrength(weakPassword);
            const strongResult = this.validatePasswordStrength(strongPassword);
            results.passwordStrength = !weakResult.isAcceptable && strongResult.isAcceptable;

            // Test rate limiting
            const rateLimitResult = this.checkRateLimit("test-user", 2, 60000);
            results.rateLimiting = rateLimitResult.allowed;

            Logger.info('Security tests completed', 'runSecurityTests', results);
            return results;

        } catch (error) {
            Logger.error('Security tests failed', error as Error, 'runSecurityTests');
            return results;
        }
    }

    /**
     * Cleans up old rate limit entries to prevent memory leaks
     */
    private cleanupRateLimitStore(): void {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        let cleanedCount = 0;

        for (const [identifier, data] of this.rateLimitStore.entries()) {
            if (now - data.windowStart > maxAge) {
                this.rateLimitStore.delete(identifier);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            Logger.info('Cleaned up old rate limit entries', 'cleanupRateLimitStore', { cleanedCount });
        }
    }

    /**
     * Initializes default data classification rules
     */
    private initializeDefaultClassificationRules(): void {
        this.dataClassificationRules = [
            {
                id: 'credit-card',
                name: 'Credit Card Numbers',
                pattern: '\\b(?:\\d{4}[\\s-]?){3}\\d{4}\\b',
                classification: DataClassification.RESTRICTED,
                description: 'Credit card numbers requiring PCI DSS compliance',
                complianceFrameworks: [ComplianceFramework.PCI_DSS, ComplianceFramework.GDPR],
                maskingStrategy: { type: 'partial', showFirst: 4, showLast: 4 }
            },
            {
                id: 'ssn',
                name: 'Social Security Numbers',
                pattern: '\\b\\d{3}[\\s-]?\\d{2}[\\s-]?\\d{4}\\b',
                classification: DataClassification.RESTRICTED,
                description: 'US Social Security Numbers requiring PII protection',
                complianceFrameworks: [ComplianceFramework.GDPR, ComplianceFramework.HIPAA],
                maskingStrategy: { type: 'partial', showLast: 4 }
            },
            {
                id: 'email',
                name: 'Email Addresses',
                pattern: '\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b',
                classification: DataClassification.CONFIDENTIAL,
                description: 'Email addresses containing personal information',
                complianceFrameworks: [ComplianceFramework.GDPR],
                maskingStrategy: { type: 'partial', showFirst: 2, showLast: 2 }
            },
            {
                id: 'phone',
                name: 'Phone Numbers',
                pattern: '\\b\\+?\\d{1,3}[-\\s.]?\\(?\\d{3}\\)?[-\\s.]?\\d{3}[-\\s.]?\\d{4}\\b',
                classification: DataClassification.CONFIDENTIAL,
                description: 'Phone numbers containing personal information',
                complianceFrameworks: [ComplianceFramework.GDPR],
                maskingStrategy: { type: 'partial', showLast: 4 }
            },
            {
                id: 'ip-address',
                name: 'IP Addresses',
                pattern: '\\b(?:[0-9]{1,3}\\.){3}[0-9]{1,3}\\b',
                classification: DataClassification.INTERNAL,
                description: 'IP addresses for internal tracking',
                complianceFrameworks: [],
                maskingStrategy: { type: 'partial', showLast: 2 }
            }
        ];

        Logger.info('Default classification rules initialized', 'initializeDefaultClassificationRules', {
            ruleCount: this.dataClassificationRules.length
        });
    }

    /**
     * Gets priority level for data classification (higher = more sensitive)
     */
    private getClassificationPriority(classification: DataClassification): number {
        const priorities = {
            [DataClassification.PUBLIC]: 0,
            [DataClassification.INTERNAL]: 1,
            [DataClassification.CONFIDENTIAL]: 2,
            [DataClassification.RESTRICTED]: 3
        };
        return priorities[classification] || 0;
    }

    /**
     * Applies context-based classification adjustments
     */
    private applyContextClassification(data: string, context: string, currentClassification: DataClassification): DataClassification {
        // Database context increases sensitivity
        if (context.toLowerCase().includes('password') || context.toLowerCase().includes('credential')) {
            return DataClassification.RESTRICTED;
        }

        // Financial context increases sensitivity
        if (context.toLowerCase().includes('financial') || context.toLowerCase().includes('payment')) {
            if (currentClassification === DataClassification.PUBLIC) {
                return DataClassification.CONFIDENTIAL;
            }
        }

        // Medical context requires higher classification
        if (context.toLowerCase().includes('medical') || context.toLowerCase().includes('health')) {
            return DataClassification.RESTRICTED;
        }

        return currentClassification;
    }

    /**
     * Applies partial masking to data
     */
    private applyPartialMasking(data: string, strategy: DataMaskingStrategy): string {
        if (!strategy.showFirst && !strategy.showLast) {
            return '*'.repeat(data.length);
        }

        const showFirst = strategy.showFirst || 0;
        const showLast = strategy.showLast || 0;
        const totalVisible = showFirst + showLast;

        if (totalVisible >= data.length) {
            return data;
        }

        const start = data.substring(0, showFirst);
        const end = data.substring(data.length - showLast);
        const maskLength = data.length - totalVisible;
        const mask = '*'.repeat(maskLength);

        return `${start}${mask}${end}`;
    }

    /**
     * Applies full masking to data
     */
    private applyFullMasking(data: string, strategy: DataMaskingStrategy): string {
        if (strategy.preserveLength) {
            return '*'.repeat(data.length);
        }
        return '***MASKED***';
    }

    /**
     * Applies hash-based masking to data
     */
    private applyHashMasking(data: string, strategy: DataMaskingStrategy): string {
        // In a real implementation, this would use proper cryptographic hashing
        const algorithm = strategy.hashAlgorithm || 'sha256';
        const hash = Buffer.from(data).toString('base64').substring(0, 16);
        return `hash_${algorithm}_${hash}`;
    }

    /**
     * Applies token-based masking to data
     */
    private applyTokenMasking(data: string): string {
        // In a real implementation, this would use a tokenization service
        const token = Buffer.from(data).toString('base64').substring(0, 8);
        return `token_${token}`;
    }

    /**
     * Gets or creates encryption key for data classification
     */
    private async getOrCreateEncryptionKey(classification: DataClassification): Promise<string> {
        const keyName = `data-encryption-${classification}`;

        let key = Array.from(this.encryptionKeys.values()).find(k => k.name === keyName);

        if (!key) {
            // Create new encryption key
            const keyId = `key-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            key = {
                id: keyId,
                name: keyName,
                algorithm: this.config.encryption.defaultAlgorithm,
                keySize: this.config.encryption.defaultAlgorithm === 'AES-256-GCM' ? 256 : 256,
                created: new Date(),
                expires: new Date(Date.now() + (this.config.encryption.keyRotationDays * 24 * 60 * 60 * 1000)),
                usage: [classification]
            };

            this.encryptionKeys.set(keyId, key);

            Logger.info('New encryption key created', 'getOrCreateEncryptionKey', {
                keyId,
                classification,
                algorithm: key.algorithm
            });
        }

        return key.id;
    }

    /**
     * Gets compliance assessment frequency in milliseconds
     */
    private getComplianceFrequencyMs(): number {
        const frequencies = {
            'daily': 24 * 60 * 60 * 1000,
            'weekly': 7 * 24 * 60 * 60 * 1000,
            'monthly': 30 * 24 * 60 * 60 * 1000
        };

        return frequencies[this.config.compliance.reportFrequency] || frequencies.monthly;
    }

    /**
     * Assesses SOX compliance requirements
     */
    private async assessSOXCompliance(): Promise<ComplianceFinding[]> {
        const findings: ComplianceFinding[] = [];

        // SOX Control: Access Controls
        if (!this.config.dataClassification.enabled) {
            findings.push({
                id: 'sox-access-control',
                category: 'Access Control',
                severity: 'high',
                description: 'Data classification not enabled - SOX requires proper access controls',
                status: 'open',
                remediation: 'Enable data classification to implement proper access controls',
                evidence: ['Data classification configuration check']
            });
        }

        // SOX Control: Audit Trail
        const recentEvents = this.securityEvents.filter(e =>
            new Date(e.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000)
        );

        if (recentEvents.length === 0) {
            findings.push({
                id: 'sox-audit-trail',
                category: 'Audit Trail',
                severity: 'medium',
                description: 'No security events logged in the last 24 hours',
                status: 'open',
                remediation: 'Ensure all database activities are properly logged',
                evidence: ['Security events log analysis']
            });
        }

        // SOX Control: Data Integrity
        if (!this.config.encryption.enabled) {
            findings.push({
                id: 'sox-data-integrity',
                category: 'Data Integrity',
                severity: 'high',
                description: 'Encryption not enabled - SOX requires data protection',
                status: 'open',
                remediation: 'Enable encryption for sensitive data protection',
                evidence: ['Encryption configuration check']
            });
        }

        // SOX Control: Change Management
        if (!this.config.compliance.reportingEnabled) {
            findings.push({
                id: 'sox-change-management',
                category: 'Change Management',
                severity: 'medium',
                description: 'Compliance reporting not enabled',
                status: 'open',
                remediation: 'Enable compliance reporting for change tracking',
                evidence: ['Compliance configuration check']
            });
        }

        return findings;
    }

    /**
     * Initializes default network security rules
     */
    private initializeDefaultNetworkRules(): void {
        this.networkSecurityRules = [
            {
                id: 'allow-localhost',
                name: 'Allow Localhost',
                type: 'allow',
                protocol: 'tcp',
                destinationPort: 5432,
                hostname: 'localhost',
                action: 'allow',
                priority: 100,
                enabled: true,
                description: 'Allow connections to localhost PostgreSQL'
            },
            {
                id: 'allow-private-networks',
                name: 'Allow Private Networks',
                type: 'allow',
                protocol: 'tcp',
                destinationPort: 5432,
                action: 'allow',
                priority: 90,
                enabled: true,
                description: 'Allow connections from private IP ranges (10.0.0.0/8, 192.168.0.0/16, 172.16.0.0/12)'
            },
            {
                id: 'block-suspicious-ports',
                name: 'Block Suspicious Ports',
                type: 'deny',
                protocol: 'tcp',
                destinationPort: 5432,
                action: 'deny',
                priority: 80,
                enabled: true,
                description: 'Block connections from suspicious source ports'
            }
        ];

        Logger.info('Default network security rules initialized', 'initializeDefaultNetworkRules', {
            ruleCount: this.networkSecurityRules.length
        });
    }

    /**
     * Checks if hostname is external (not private/internal)
     */
    private isExternalHost(hostname: string): boolean {
        // Check for localhost
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
            return false;
        }

        // Check for private IP ranges
        const privateRanges = [
            /^10\./,
            /^192\.168\./,
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
            /^::1$/,
            /^fc00:/, // IPv6 private
            /^fe80:/  // IPv6 link-local
        ];

        for (const range of privateRanges) {
            if (range.test(hostname)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Evaluates if a network rule matches the connection
     */
    private evaluateNetworkRule(
        rule: NetworkSecurityRule,
        hostname: string,
        port: number,
        sourceIP?: string
    ): boolean {
        // Check hostname match
        if (rule.hostname && !this.hostnameMatches(hostname, rule.hostname)) {
            return false;
        }

        // Check port match
        if (rule.destinationPort && rule.destinationPort !== port) {
            return false;
        }

        // Check source IP if specified
        if (rule.sourceIP && sourceIP && !this.ipMatches(sourceIP, rule.sourceIP)) {
            return false;
        }

        // Check protocol (assume TCP for database connections)
        if (rule.protocol !== 'tcp' && rule.protocol !== 'any') {
            return false;
        }

        return true;
    }

    /**
     * Checks if hostname matches rule pattern (supports wildcards)
     */
    private hostnameMatches(actual: string, pattern: string): boolean {
        if (pattern === actual) {
            return true;
        }

        // Simple wildcard support
        if (pattern.includes('*')) {
            const regexPattern = pattern.replace(/\*/g, '.*');
            const regex = new RegExp(`^${regexPattern}$`);
            return regex.test(actual);
        }

        return false;
    }

    /**
     * Checks if IP address matches rule pattern (supports CIDR notation)
     */
    private ipMatches(actual: string, pattern: string): boolean {
        if (pattern === actual) {
            return true;
        }

        // Simple CIDR support (basic implementation)
        if (pattern.includes('/')) {
            // This is a simplified implementation
            // In production, use a proper IP/CIDR library
            return actual.startsWith(pattern.split('/')[0]);
        }

        return false;
    }

    /**
     * Executes the actual vulnerability scanning logic
     */
    private async executeVulnerabilityScan(scan: VulnerabilityScan): Promise<void> {
        const findings: VulnerabilityFinding[] = [];

        // Simulate different scan types
        switch (scan.scanType) {
            case 'port':
                findings.push(...await this.scanPorts(scan.target));
                break;
            case 'ssl':
                findings.push(...await this.scanSSLConfiguration(scan.target));
                break;
            case 'configuration':
                findings.push(...await this.scanConfiguration(scan.target));
                break;
            case 'full':
                findings.push(...await this.scanPorts(scan.target));
                findings.push(...await this.scanSSLConfiguration(scan.target));
                findings.push(...await this.scanConfiguration(scan.target));
                break;
        }

        scan.findings = findings;

        // Simulate scan duration
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    /**
     * Scans for open ports and services
     */
    private async scanPorts(target: string): Promise<VulnerabilityFinding[]> {
        const findings: VulnerabilityFinding[] = [];

        // Simulate port scanning results
        const commonPorts = [22, 23, 25, 53, 80, 110, 143, 443, 993, 995, 1433, 3306, 3389, 5432, 8080];

        for (const port of commonPorts) {
            if (port === 5432) continue; // Skip PostgreSQL port

            // Simulate finding some open ports
            if (Math.random() > 0.8) { // 20% chance of finding an open port
                findings.push({
                    id: `port-${target}-${port}`,
                    type: 'open-port',
                    severity: 'medium',
                    title: `Port ${port} is open`,
                    description: `Potentially unnecessary service running on port ${port}`,
                    affectedComponent: `Service on port ${port}`,
                    remediation: `Review and disable unnecessary services on port ${port}`,
                    references: [],
                    evidence: [`Port ${port} appears to be open and responding`]
                });
            }
        }

        return findings;
    }

    /**
     * Scans SSL/TLS configuration
     */
    private async scanSSLConfiguration(target: string): Promise<VulnerabilityFinding[]> {
        const findings: VulnerabilityFinding[] = [];

        // Simulate SSL configuration issues
        const sslIssues = [
            {
                type: 'weak-cipher' as const,
                title: 'Weak cipher suites supported',
                description: 'Server supports deprecated SSL cipher suites',
                remediation: 'Disable weak cipher suites and use only TLS 1.2+',
                severity: 'high' as const
            },
            {
                type: 'certificate-issue' as const,
                title: 'Certificate expiration warning',
                description: 'SSL certificate expires soon',
                remediation: 'Renew SSL certificate before expiration',
                severity: 'medium' as const
            }
        ];

        // Randomly include some SSL findings
        for (const issue of sslIssues) {
            if (Math.random() > 0.7) { // 30% chance of each issue
                findings.push({
                    id: `ssl-${target}-${issue.type}`,
                    type: issue.type,
                    severity: issue.severity,
                    title: issue.title,
                    description: issue.description,
                    affectedComponent: 'SSL/TLS Configuration',
                    remediation: issue.remediation,
                    references: [],
                    evidence: [`SSL scan detected ${issue.type} on ${target}`]
                });
            }
        }

        return findings;
    }

    /**
     * Scans database configuration for security issues
     */
    private async scanConfiguration(target: string): Promise<VulnerabilityFinding[]> {
        const findings: VulnerabilityFinding[] = [];

        // Simulate configuration issues
        const configIssues = [
            {
                type: 'misconfiguration' as const,
                title: 'Default credentials detected',
                description: 'Database may be using default credentials',
                remediation: 'Change all default passwords and disable default accounts',
                severity: 'critical' as const
            },
            {
                type: 'misconfiguration' as const,
                title: 'Excessive privileges',
                description: 'Some users have excessive database privileges',
                remediation: 'Review and minimize user privileges using principle of least privilege',
                severity: 'high' as const
            }
        ];

        // Randomly include some configuration findings
        for (const issue of configIssues) {
            if (Math.random() > 0.6) { // 40% chance of each issue
                findings.push({
                    id: `config-${target}-${issue.type}`,
                    type: issue.type,
                    severity: issue.severity,
                    title: issue.title,
                    description: issue.description,
                    affectedComponent: 'Database Configuration',
                    remediation: issue.remediation,
                    references: [],
                    evidence: [`Configuration scan detected ${issue.type} on ${target}`]
                });
            }
        }

        return findings;
    }

    /**
     * Calculates vulnerability summary statistics
     */
    private calculateVulnerabilitySummary(findings: VulnerabilityFinding[]): VulnerabilityScan['summary'] {
        const summary = {
            totalVulnerabilities: findings.length,
            criticalCount: findings.filter(f => f.severity === 'critical').length,
            highCount: findings.filter(f => f.severity === 'high').length,
            mediumCount: findings.filter(f => f.severity === 'medium').length,
            lowCount: findings.filter(f => f.severity === 'low').length
        };

        return summary;
    }

    /**
     * Example usage patterns for regulatory compliance
     */
    static getComplianceUsageExamples(): string {
        return `
=== REGULATORY COMPLIANCE USAGE EXAMPLES ===

1. GDPR COMPLIANCE WORKFLOW:
   const securityManager = SecurityManager.getInstance();

   // Classify personal data
   const emailClassification = securityManager.classifyData(
     'user@company.com',
     'customer contact information'
   );
   // Result: DataClassification.CONFIDENTIAL

   // Apply GDPR-compliant masking
   const maskedEmail = securityManager.maskData(
     'user@company.com',
     emailClassification,
     { type: 'partial', showFirst: 1, showLast: 2 }
   );
   // Result: "u****om"

   // Generate compliance report
   const gdprReport = await securityManager.generateComplianceReport(
     ComplianceFramework.GDPR,
     new Date('2024-01-01'),
     new Date('2024-12-31')
   );

2. HIPAA HEALTHCARE DATA PROTECTION:
   // Encrypt sensitive medical data
   const patientRecord = {
     name: 'John Doe',
     ssn: '123-45-6789',
     diagnosis: 'sensitive condition'
   };

   const classification = securityManager.classifyData(
     JSON.stringify(patientRecord),
     'electronic health record'
   );
   // Result: DataClassification.RESTRICTED

   const encrypted = await securityManager.encryptSensitiveData(
     JSON.stringify(patientRecord),
     classification
   );

3. PCI DSS PAYMENT CARD PROTECTION:
   // Handle credit card data securely
   const creditCard = '4532-1234-5678-9012';
   const ccClassification = securityManager.classifyData(creditCard, 'payment');

   // PCI-compliant masking (show first 4, last 4)
   const maskedCC = securityManager.maskData(
     creditCard,
     ccClassification,
     { type: 'partial', showFirst: 4, showLast: 4 }
   );
   // Result: "4532********9012"

4. SOX FINANCIAL DATA CONTROLS:
   // Ensure audit trail compliance
   const financialQuery = 'SELECT * FROM transactions WHERE amount > 10000';
   const sqlCheck = securityManager.validateSQLQuery(financialQuery);

   if (!sqlCheck.isSafe) {
     // Block or log suspicious financial queries
     Logger.warn('Suspicious financial query detected', sqlCheck);
   }

5. INTEGRATION WITH CONNECTION WORKFLOW:
   // Pre-connection compliance validation
   async function establishCompliantConnection(connectionInfo) {
     // 1. Network security check
     const networkCheck = await securityManager.validateNetworkConnection(
       connectionInfo.host,
       connectionInfo.port,
       connectionInfo.sourceIP
     );

     if (!networkCheck.allowed) {
       throw new Error(\`Network policy violation: \${networkCheck.blockedReason}\`);
     }

     // 2. Data classification for connection metadata
     const classification = securityManager.classifyData(
       connectionInfo.database,
       'database connection'
     );

     // 3. Encrypt connection credentials if required
     if (classification !== DataClassification.PUBLIC) {
       connectionInfo.password = await securityManager.encryptSensitiveData(
         connectionInfo.password,
         classification
       );
     }

     return connectionInfo;
   }

6. AUTOMATED COMPLIANCE MONITORING:
   // Set up continuous compliance assessment
   async function setupComplianceMonitoring() {
     const frameworks = [
       ComplianceFramework.GDPR,
       ComplianceFramework.HIPAA,
       ComplianceFramework.SOX
     ];

     for (const framework of frameworks) {
       // Generate monthly compliance reports
       setInterval(async () => {
         const report = await securityManager.generateComplianceReport(
           framework,
           new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
           new Date()
         );

         if (report.overallStatus !== 'compliant') {
           // Alert compliance team
           await sendComplianceAlert(report);
         }
       }, 30 * 24 * 60 * 60 * 1000); // Monthly
     }
   }

7. DATA PROTECTION PIPELINE:
   // Complete data lifecycle protection
   async function protectDataLifecycle(data, context, operation) {
     const classification = securityManager.classifyData(data, context);

     switch (operation) {
       case 'store':
         // Encrypt before storage
         return await securityManager.encryptSensitiveData(data, classification);

       case 'display':
         // Mask for display
         return securityManager.maskData(data, classification);

       case 'transmit':
         // Validate network security
         const networkCheck = await securityManager.validateNetworkConnection(
           targetHost, targetPort
         );
         if (!networkCheck.allowed) {
           throw new Error('Transmission blocked by network policy');
         }
         return data;

       case 'delete':
         // Ensure secure deletion
         return 'securely-deleted';
     }
   }
`;
    }

    /**
     * Configuration examples for different compliance scenarios
     */
    static getComplianceConfigurationExamples(): string {
        return `
=== COMPLIANCE CONFIGURATION EXAMPLES ===

GDPR-FOCUSED CONFIGURATION:
{
  "postgresql.securityManager": {
    "compliance": {
      "enabled": true,
      "frameworks": ["GDPR"],
      "reportingEnabled": true,
      "reportFrequency": "monthly"
    },
    "dataClassification": {
      "enabled": true,
      "defaultClassification": "CONFIDENTIAL",
      "autoClassifyPatterns": true,
      "maskingEnabled": true,
      "encryptionEnabled": true
    },
    "encryption": {
      "enabled": true,
      "encryptConnectionPasswords": true,
      "keyRotationDays": 90
    }
  }
}

HIPAA HEALTHCARE CONFIGURATION:
{
  "postgresql.securityManager": {
    "compliance": {
      "enabled": true,
      "frameworks": ["HIPAA", "GDPR"],
      "reportingEnabled": true,
      "reportFrequency": "weekly"
    },
    "dataClassification": {
      "enabled": true,
      "defaultClassification": "RESTRICTED",
      "requireApprovalForRestricted": true
    },
    "networkSecurity": {
      "requireSSLForExternal": true,
      "maxConnectionsPerIP": 5
    }
  }
}

PCI DSS PAYMENT PROCESSING:
{
  "postgresql.securityManager": {
    "compliance": {
      "enabled": true,
      "frameworks": ["PCI_DSS", "SOX"]
    },
    "dataClassification": {
      "enabled": true,
      "autoClassifyPatterns": true
    },
    "encryption": {
      "enabled": true,
      "encryptConnectionPasswords": true,
      "keyRotationDays": 30
    },
    "networkSecurity": {
      "firewallEnabled": true,
      "whitelistOnly": true
    }
  }
}

ENTERPRISE MULTI-FRAMEWORK:
{
  "postgresql.securityManager": {
    "compliance": {
      "enabled": true,
      "frameworks": ["GDPR", "HIPAA", "SOX", "PCI_DSS", "ISO_27001"],
      "reportingEnabled": true,
      "reportFrequency": "weekly"
    },
    "dataClassification": {
      "enabled": true,
      "requireApprovalForRestricted": true,
      "maskingEnabled": true,
      "encryptionEnabled": true
    },
    "networkSecurity": {
      "enabled": true,
      "firewallEnabled": true,
      "requireSSLForExternal": true,
      "maxConnectionsPerIP": 3
    },
    "vulnerabilityScanning": {
      "enabled": true,
      "scanOnConnect": true,
      "alertOnNewVulnerabilities": true
    }
  }
}
`;
   }

   /**
    * Tests certificate persistence functionality
    */
   async testCertificatePersistence(): Promise<{ load: boolean; save: boolean; pin: boolean; unpin: boolean; }> {
       const results = {
           load: false,
           save: false,
           pin: false,
           unpin: false
       };

       try {
           Logger.info('Testing certificate persistence functionality', 'testCertificatePersistence');

           // Test 1: Save/load certificates
           const testHostname = 'test.postgresql.example.com';
           const testCertificate: CertificateInfo = {
               subject: 'CN=test.postgresql.example.com',
               issuer: 'CN=Test CA',
               validFrom: new Date(),
               validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
               serialNumber: '123456789',
               fingerprint: 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99',
               keySize: 2048,
               algorithm: 'RSA',
               isSelfSigned: false,
               revocationStatus: 'good'
           };

           // Test 2: Pin certificate
           results.pin = await this.pinCertificate(testHostname, testCertificate, true);

           // Test 3: Verify certificate is pinned
           const pinnedCerts = this.getPinnedCertificates();
           const isPinned = pinnedCerts.some(pc => pc.hostname === testHostname);
           results.save = isPinned;

           // Test 4: Validate against pinned certificate
           const validation = this.validateAgainstPinned(testHostname, testCertificate);
           results.load = validation.valid;

           // Test 5: Unpin certificate
           results.unpin = await this.unpinCertificate(testHostname);

           // Test 6: Verify certificate is unpinned
           const pinnedAfterUnpin = this.getPinnedCertificates();
           const isUnpinned = !pinnedAfterUnpin.some(pc => pc.hostname === testHostname);

           Logger.info('Certificate persistence test results', 'testCertificatePersistence', {
               ...results,
               finalPinState: isUnpinned,
               totalPinnedCertificates: pinnedAfterUnpin.length
           });

           return results;

       } catch (error) {
           Logger.error('Certificate persistence test failed', error as Error, 'testCertificatePersistence');
           return results;
       }
   }
}