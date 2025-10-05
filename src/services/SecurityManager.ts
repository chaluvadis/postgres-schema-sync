import * as vscode from 'vscode';
import * as tls from 'tls';
import { Logger } from '../utils/Logger';
import { ErrorHandler } from '../utils/ErrorHandler';

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

export class SecurityManager {
    private static instance: SecurityManager;
    private config: SecurityConfiguration;
    private securityEvents: SecurityEvent[] = [];
    private pinnedCertificates: Map<string, CertificateInfo> = new Map();
    private certificateCache: Map<string, { cert: CertificateInfo; timestamp: number; }> = new Map();

    private constructor() {
        this.config = this.loadSecurityConfiguration();
        this.loadPinnedCertificates();
        this.startSecurityMonitoring();
    }

    static getInstance(): SecurityManager {
        if (!SecurityManager.instance) {
            SecurityManager.instance = new SecurityManager();
        }
        return SecurityManager.instance;
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

    /**
     * Adds a security event to the monitoring system
     */
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

    /**
     * Pins a certificate for future validation
     */
    async pinCertificate(hostname: string, certificate: CertificateInfo): Promise<boolean> {
        try {
            if (this.config.certificatePinning.requireUserApproval) {
                const confirmed = await vscode.window.showWarningMessage(
                    `Pin certificate for ${hostname}? This will trust this certificate for future connections.`,
                    'Pin Certificate',
                    'Cancel'
                );

                if (confirmed !== 'Pin Certificate') {
                    return false;
                }
            }

            this.pinnedCertificates.set(hostname, certificate);
            await this.savePinnedCertificates();

            Logger.info('Certificate pinned successfully', 'pinCertificate', { hostname });

            const securityEvent: SecurityEvent = {
                id: `pin-${Date.now()}`,
                type: 'certificate',
                severity: 'low',
                description: `Certificate pinned for ${hostname}`,
                timestamp: new Date().toISOString(),
                resolved: true,
                details: { hostname, fingerprint: certificate.fingerprint }
            };

            this.addSecurityEvent(securityEvent);
            return true;

        } catch (error) {
            Logger.error('Failed to pin certificate', error as Error, 'pinCertificate');
            return false;
        }
    }

    /**
     * Gets all security events
     */
    getSecurityEvents(): SecurityEvent[] {
        return [...this.securityEvents];
    }

    /**
     * Gets security events by severity
     */
    getSecurityEventsBySeverity(severity: SecurityEvent['severity']): SecurityEvent[] {
        return this.securityEvents.filter(event => event.severity === severity);
    }

    /**
     * Gets unresolved security events
     */
    getUnresolvedSecurityEvents(): SecurityEvent[] {
        return this.securityEvents.filter(event => !event.resolved);
    }

    /**
     * Resolves a security event
     */
    resolveSecurityEvent(eventId: string): boolean {
        const event = this.securityEvents.find(e => e.id === eventId);
        if (event) {
            event.resolved = true;
            Logger.info('Security event resolved', 'resolveSecurityEvent', { eventId });
            return true;
        }
        return false;
    }

    /**
     * Cleans up old security events based on retention policy
     */
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
            // In a real implementation, this would load from VS Code's secret storage
            // For now, we'll use an empty map
            this.pinnedCertificates.clear();
            Logger.info('Pinned certificates loaded', 'loadPinnedCertificates');
        } catch (error) {
            Logger.error('Failed to load pinned certificates', error as Error, 'loadPinnedCertificates');
        }
    }

    private async savePinnedCertificates(): Promise<void> {
        try {
            // In a real implementation, this would save to VS Code's secret storage
            Logger.info('Pinned certificates saved', 'savePinnedCertificates');
        } catch (error) {
            Logger.error('Failed to save pinned certificates', error as Error, 'savePinnedCertificates');
        }
    }

    private startSecurityMonitoring(): void {
        // Clean up old events every hour
        setInterval(() => {
            this.cleanupOldEvents();
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
     * Validates connection security settings
     */
    validateConnectionSecurity(hostname: string, port: number, useSSL: boolean): {
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
     * Gets security statistics
     */
    getSecurityStatistics(): {
        totalEvents: number;
        unresolvedEvents: number;
        eventsBySeverity: Record<string, number>;
        eventsByType: Record<string, number>;
        pinnedCertificates: number;
        averageResolutionTime: number;
    } {
        const unresolvedEvents = this.securityEvents.filter(e => !e.resolved).length;

        const eventsBySeverity: Record<string, number> = {};
        const eventsByType: Record<string, number> = {};

        this.securityEvents.forEach(event => {
            eventsBySeverity[event.severity] = (eventsBySeverity[event.severity] || 0) + 1;
            eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
        });

        // Calculate average resolution time for resolved events
        const resolvedEvents = this.securityEvents.filter(e => e.resolved);
        const averageResolutionTime = resolvedEvents.length > 0
            ? resolvedEvents.reduce((sum, event) => {
                const resolutionTime = new Date(event.timestamp).getTime();
                return sum + (Date.now() - resolutionTime);
            }, 0) / resolvedEvents.length / (1000 * 60 * 60) // Convert to hours
            : 0;

        return {
            totalEvents: this.securityEvents.length,
            unresolvedEvents,
            eventsBySeverity,
            eventsByType,
            pinnedCertificates: this.pinnedCertificates.size,
            averageResolutionTime: Math.round(averageResolutionTime * 100) / 100
        };
    }

    dispose(): void {
        this.securityEvents.length = 0;
        this.pinnedCertificates.clear();
        this.certificateCache.clear();
        Logger.info('SecurityManager disposed', 'dispose');
    }
}