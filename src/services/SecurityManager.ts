import * as crypto from "crypto";
import * as tls from "tls";
import * as vscode from "vscode";
import { Logger } from "@/utils/Logger";

export interface SecurityConfiguration {
	enabled: boolean;
	securityLevel: "strict" | "warning" | "permissive";
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
		minStrength: "very-weak" | "weak" | "fair" | "good" | "strong";
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
		defaultAlgorithm: "AES-256-GCM" | "ChaCha20-Poly1305";
		keyRotationDays: number;
		encryptConnectionPasswords: boolean;
		encryptQueryResults: boolean;
	};
	compliance: {
		enabled: boolean;
		frameworks: ComplianceFramework[];
		reportingEnabled: boolean;
		reportFrequency: "daily" | "weekly" | "monthly";
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
		scanSchedule: "manual" | "daily" | "weekly";
		autoRemediation: boolean;
		alertOnNewVulnerabilities: boolean;
		maxScanDuration: number;
	};
}
export interface SecurityEvent {
	id: string;
	type: "authentication" | "authorization" | "data_access" | "configuration" | "certificate" | "connection";
	severity: "low" | "medium" | "high" | "critical";
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
	revocationStatus: "good" | "revoked" | "unknown";
}
export enum DataClassification {
	PUBLIC = "public",
	INTERNAL = "internal",
	CONFIDENTIAL = "confidential",
	RESTRICTED = "restricted",
}
enum ComplianceFramework {
	GDPR = "GDPR",
	HIPAA = "HIPAA",
	SOX = "SOX",
	PCI_DSS = "PCI_DSS",
	ISO_27001 = "ISO_27001",
}
interface EncryptionKey {
	id: string;
	name: string;
	algorithm: "AES-256-GCM" | "ChaCha20-Poly1305";
	keySize: number;
	created: Date;
	expires?: Date;
	usage: string[];
}
export class SecurityManager {
	private static instance: SecurityManager;
	private config: SecurityConfiguration;
	private securityEvents: SecurityEvent[] = [];
	private pinnedCertificates: Map<string, CertificateInfo> = new Map();
	private certificateCache: Map<string, { cert: CertificateInfo; timestamp: number }> = new Map();
	private rateLimitStore: Map<string, { attempts: number; windowStart: number }> = new Map();
	private encryptionKeys: Map<string, EncryptionKey> = new Map();
	private sensitiveDataCache: Map<
		string,
		{ encrypted: string; classification: DataClassification; timestamp: number }
	> = new Map();
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
	private loadSecurityConfiguration(): SecurityConfiguration {
		const vscodeConfig = vscode.workspace.getConfiguration("postgresql-schema-sync.securityManager");

		return {
			enabled: vscodeConfig.get("enabled", true),
			securityLevel: vscodeConfig.get("securityLevel", "warning"),
			certificateValidation: {
				enabled: vscodeConfig.get("certificateValidation.enabled", true),
				checkRevocation: vscodeConfig.get("certificateValidation.checkRevocation", false),
				checkTransparency: vscodeConfig.get("certificateValidation.checkTransparency", false),
				allowSelfSigned: vscodeConfig.get("certificateValidation.allowSelfSigned", false),
				minKeySize: vscodeConfig.get("certificateValidation.minKeySize", 2048),
				maxValidityDays: vscodeConfig.get("certificateValidation.maxValidityDays", 825),
			},
			certificatePinning: {
				enabled: vscodeConfig.get("certificatePinning.enabled", false),
				autoPinTrusted: vscodeConfig.get("certificatePinning.autoPinTrusted", false),
				requireUserApproval: vscodeConfig.get("certificatePinning.requireUserApproval", true),
				maxPinAge: vscodeConfig.get("certificatePinning.maxPinAge", 365),
				allowedHostnames: vscodeConfig.get("certificatePinning.allowedHostnames", []),
			},
			monitoring: {
				enabled: vscodeConfig.get("monitoring.enabled", true),
				alertLevels: vscodeConfig.get("monitoring.alertLevels", ["warning", "error", "critical"]),
				retentionDays: vscodeConfig.get("monitoring.retentionDays", 90),
				maxEvents: vscodeConfig.get("monitoring.maxEvents", 1000),
				autoResolveAfterDays: vscodeConfig.get("monitoring.autoResolveAfterDays", 30),
				showNotifications: vscodeConfig.get("monitoring.showNotifications", true),
				showInStatusBar: vscodeConfig.get("monitoring.showInStatusBar", true),
			},
			connectionSecurity: {
				enforceSecureConnections: vscodeConfig.get("connectionSecurity.enforceSecureConnections", false),
				allowInsecureFallback: vscodeConfig.get("connectionSecurity.allowInsecureFallback", true),
				validateOnConnect: vscodeConfig.get("connectionSecurity.validateOnConnect", true),
				validateOnReconnect: vscodeConfig.get("connectionSecurity.validateOnReconnect", true),
			},
			sqlInjection: {
				enabled: vscodeConfig.get("sqlInjection.enabled", true),
				blockHighRisk: vscodeConfig.get("sqlInjection.blockHighRisk", true),
				allowUnparameterizedDML: vscodeConfig.get("sqlInjection.allowUnparameterizedDML", false),
				logOnly: vscodeConfig.get("sqlInjection.logOnly", false),
				maxQueryLength: vscodeConfig.get("sqlInjection.maxQueryLength", 100000),
				allowedKeywords: vscodeConfig.get("sqlInjection.allowedKeywords", ["SELECT", "INSERT", "UPDATE", "DELETE"]),
			},
			passwordPolicy: {
				enabled: vscodeConfig.get("passwordPolicy.enabled", true),
				minStrength: vscodeConfig.get("passwordPolicy.minStrength", "fair"),
				requireSpecialChars: vscodeConfig.get("passwordPolicy.requireSpecialChars", true),
				requireNumbers: vscodeConfig.get("passwordPolicy.requireNumbers", true),
				requireMixedCase: vscodeConfig.get("passwordPolicy.requireMixedCase", true),
				minLength: vscodeConfig.get("passwordPolicy.minLength", 8),
				maxLength: vscodeConfig.get("passwordPolicy.maxLength", 128),
				preventCommonPasswords: vscodeConfig.get("passwordPolicy.preventCommonPasswords", true),
			},
			rateLimiting: {
				enabled: vscodeConfig.get("rateLimiting.enabled", true),
				maxConnectionAttempts: vscodeConfig.get("rateLimiting.maxConnectionAttempts", 5),
				windowMs: vscodeConfig.get("rateLimiting.windowMs", 300000),
				maxQueriesPerMinute: vscodeConfig.get("rateLimiting.maxQueriesPerMinute", 100),
				maxConnectionsPerUser: vscodeConfig.get("rateLimiting.maxConnectionsPerUser", 10),
			},
			dataClassification: {
				enabled: vscodeConfig.get("dataClassification.enabled", true),
				defaultClassification: vscodeConfig.get(
					"dataClassification.defaultClassification",
					DataClassification.INTERNAL,
				),
				autoClassifyPatterns: vscodeConfig.get("dataClassification.autoClassifyPatterns", true),
				requireApprovalForRestricted: vscodeConfig.get("dataClassification.requireApprovalForRestricted", true),
				maskingEnabled: vscodeConfig.get("dataClassification.maskingEnabled", true),
				encryptionEnabled: vscodeConfig.get("dataClassification.encryptionEnabled", true),
			},
			encryption: {
				enabled: vscodeConfig.get("encryption.enabled", true),
				defaultAlgorithm: vscodeConfig.get("encryption.defaultAlgorithm", "AES-256-GCM"),
				keyRotationDays: vscodeConfig.get("encryption.keyRotationDays", 90),
				encryptConnectionPasswords: vscodeConfig.get("encryption.encryptConnectionPasswords", true),
				encryptQueryResults: vscodeConfig.get("encryption.encryptQueryResults", false),
			},
			compliance: {
				enabled: vscodeConfig.get("compliance.enabled", false),
				frameworks: vscodeConfig.get("compliance.frameworks", [ComplianceFramework.GDPR]),
				reportingEnabled: vscodeConfig.get("compliance.reportingEnabled", false),
				reportFrequency: vscodeConfig.get("compliance.reportFrequency", "monthly"),
				retentionDays: vscodeConfig.get("compliance.retentionDays", 2555), // 7 years default
			},
			networkSecurity: {
				enabled: vscodeConfig.get("networkSecurity.enabled", true),
				firewallEnabled: vscodeConfig.get("networkSecurity.firewallEnabled", true),
				allowedPorts: vscodeConfig.get("networkSecurity.allowedPorts", [5432, 5433]),
				blockedCountries: vscodeConfig.get("networkSecurity.blockedCountries", []),
				maxConnectionsPerIP: vscodeConfig.get("networkSecurity.maxConnectionsPerIP", 10),
				connectionTimeout: vscodeConfig.get("networkSecurity.connectionTimeout", 30000),
				requireSSLForExternal: vscodeConfig.get("networkSecurity.requireSSLForExternal", true),
				whitelistOnly: vscodeConfig.get("networkSecurity.whitelistOnly", false),
			},
			vulnerabilityScanning: {
				enabled: vscodeConfig.get("vulnerabilityScanning.enabled", false),
				scanOnConnect: vscodeConfig.get("vulnerabilityScanning.scanOnConnect", false),
				scanSchedule: vscodeConfig.get("vulnerabilityScanning.scanSchedule", "weekly"),
				autoRemediation: vscodeConfig.get("vulnerabilityScanning.autoRemediation", false),
				alertOnNewVulnerabilities: vscodeConfig.get("vulnerabilityScanning.alertOnNewVulnerabilities", true),
				maxScanDuration: vscodeConfig.get("vulnerabilityScanning.maxScanDuration", 300000), // 5 minutes
			},
		};
	}
	async validateCertificate(
		hostname: string,
		port: number,
		connectionId: string,
	): Promise<{
		valid: boolean;
		certificate?: CertificateInfo;
		warnings?: string[];
	}> {
		try {
			Logger.info("Validating SSL certificate", "validateCertificate", {
				hostname,
				port,
				connectionId,
			});

			if (!this.config.certificateValidation.enabled) {
				Logger.info("Certificate validation disabled, skipping", "validateCertificate");
				return { valid: true };
			}

			// Check cache first
			const cached = this.certificateCache.get(`${hostname}:${port}`);
			if (cached && Date.now() - cached.timestamp < 300000) {
				// 5 minute cache
				Logger.debug("Using cached certificate info", "validateCertificate");
				return this.validateCertificateInfo(cached.cert, hostname, connectionId);
			}

			// Create TLS connection to check certificate
			const certificateInfo = await this.getCertificateInfo(hostname, port);

			// Cache the certificate info
			this.certificateCache.set(`${hostname}:${port}`, {
				cert: certificateInfo,
				timestamp: Date.now(),
			});

			return this.validateCertificateInfo(certificateInfo, hostname, connectionId);
		} catch (error) {
			Logger.error("Certificate validation failed", error as Error, "validateCertificate", {
				hostname,
				port,
				connectionId,
			});

			const securityEvent: SecurityEvent = {
				id: `cert-${Date.now()}`,
				type: "certificate",
				severity: "high",
				description: `Certificate validation failed for ${hostname}:${port}`,
				timestamp: new Date().toISOString(),
				resolved: false,
				details: { error: (error as Error).message, hostname, port },
				connectionId,
			};

			this.addSecurityEvent(securityEvent);
			throw error;
		}
	}
	private async getCertificateInfo(hostname: string, port: number): Promise<CertificateInfo> {
		return new Promise((resolve, reject) => {
			const socket = tls.connect(port, hostname, {
				rejectUnauthorized: false, // We'll do our own validation
				timeout: 10000,
			});

			socket.on("secureConnect", () => {
				const cert = socket.getPeerCertificate();
				if (!cert || Object.keys(cert).length === 0) {
					socket.destroy();
					reject(new Error("No certificate provided by server"));
					return;
				}

				const certificateInfo: CertificateInfo = {
					subject: (cert.subject as any)?.CN || "Unknown",
					issuer: (cert.issuer as any)?.CN || "Unknown",
					validFrom: new Date(cert.valid_from || ""),
					validTo: new Date(cert.valid_to || ""),
					serialNumber: cert.serialNumber || "Unknown",
					fingerprint: cert.fingerprint || "Unknown",
					keySize: this.extractKeySize(cert),
					algorithm: "RSA", // Default assumption for PostgreSQL
					isSelfSigned: this.isSelfSigned(cert),
					revocationStatus: "unknown", // Would need OCSP/CRL checking
				};

				socket.destroy();
				resolve(certificateInfo);
			});

			socket.on("error", (error) => {
				reject(error);
			});

			socket.on("timeout", () => {
				socket.destroy();
				reject(new Error("Certificate check timed out"));
			});
		});
	}
	private validateCertificateInfo(
		cert: CertificateInfo,
		hostname: string,
		connectionId: string,
	): { valid: boolean; certificate?: CertificateInfo; warnings?: string[] } {
		const warnings: string[] = [];
		let valid = true;

		// Check if hostname is allowed
		if (this.config.certificatePinning.enabled && this.config.certificatePinning.allowedHostnames.length > 0) {
			if (!this.config.certificatePinning.allowedHostnames.includes(hostname)) {
				warnings.push(`Hostname ${hostname} not in allowed list`);
				if (this.config.securityLevel === "strict") {
					valid = false;
				}
			}
		}

		// Check certificate pinning
		if (this.config.certificatePinning.enabled) {
			const pinnedCert = this.pinnedCertificates.get(hostname);
			if (pinnedCert) {
				if (pinnedCert.fingerprint !== cert.fingerprint) {
					warnings.push("Certificate fingerprint does not match pinned certificate");
					if (this.config.securityLevel === "strict") {
						valid = false;
					}
				}
			}
		}

		// Validate certificate properties
		if (cert.keySize < this.config.certificateValidation.minKeySize) {
			warnings.push(
				`Certificate key size (${cert.keySize} bits) below minimum (${this.config.certificateValidation.minKeySize} bits)`,
			);
			if (this.config.securityLevel === "strict") {
				valid = false;
			}
		}

		// Check validity period
		const validityDays = Math.ceil((cert.validTo.getTime() - cert.validFrom.getTime()) / (1000 * 60 * 60 * 24));
		if (validityDays > this.config.certificateValidation.maxValidityDays) {
			warnings.push(
				`Certificate validity period (${validityDays} days) exceeds maximum (${this.config.certificateValidation.maxValidityDays} days)`,
			);
			if (this.config.securityLevel === "strict") {
				valid = false;
			}
		}

		// Check if certificate is expired
		if (cert.validTo < new Date()) {
			warnings.push("Certificate has expired");
			valid = false;
		}

		// Check if certificate is not yet valid
		if (cert.validFrom > new Date()) {
			warnings.push("Certificate is not yet valid");
			valid = false;
		}

		// Check self-signed certificates
		if (cert.isSelfSigned && !this.config.certificateValidation.allowSelfSigned) {
			warnings.push("Self-signed certificate not allowed");
			if (this.config.securityLevel === "strict") {
				valid = false;
			}
		}

		// Log security event if there are warnings
		if (warnings.length > 0) {
			const securityEvent: SecurityEvent = {
				id: `cert-validation-${Date.now()}`,
				type: "certificate",
				severity: valid ? "medium" : "high",
				description: `Certificate validation for ${hostname} completed with ${warnings.length} warning(s)`,
				timestamp: new Date().toISOString(),
				resolved: valid,
				details: { hostname, warnings, valid },
				connectionId,
			};

			this.addSecurityEvent(securityEvent);
		}

		return {
			valid,
			certificate: cert,
			...(warnings.length > 0 && { warnings }),
		};
	}
	private extractKeySize(pubkey: any): number {
		// Extract key size from public key
		if (pubkey && pubkey.keySize) {
			return pubkey.keySize;
		}

		// Try to determine from modulus length
		if (pubkey && pubkey.data) {
			const keyData = pubkey.data.toString("hex");
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

		Logger.info("Security event recorded", "addSecurityEvent", {
			eventId: event.id,
			type: event.type,
			severity: event.severity,
		});
	}
	private showSecurityNotification(event: SecurityEvent): void {
		const message = `Security ${event.severity}: ${event.description}`;

		switch (event.severity) {
			case "critical":
			case "high":
				vscode.window.showErrorMessage(message, "View Details", "Dismiss").then((selection) => {
					if (selection === "View Details") {
						this.showSecurityDetails(event);
					}
				});
				break;
			case "medium":
				vscode.window.showWarningMessage(message, "View Details", "Dismiss").then((selection) => {
					if (selection === "View Details") {
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
            - Connection: ${event.connectionId || "N/A"}
            - Hostname: ${event.hostname || "N/A"}
            ${event.details ? `- Additional Info: ${JSON.stringify(event.details, null, 2)}` : ""}
        `;

		const outputChannel = vscode.window.createOutputChannel(`Security Event: ${event.id}`);
		outputChannel.clear();
		outputChannel.appendLine(details);
		outputChannel.show();
	}
	private cleanupOldEvents(): void {
		const cutoffDate = new Date(Date.now() - this.config.monitoring.retentionDays * 24 * 60 * 60 * 1000);
		const initialCount = this.securityEvents.length;

		this.securityEvents = this.securityEvents.filter((event) => new Date(event.timestamp) > cutoffDate);

		const removedCount = initialCount - this.securityEvents.length;
		if (removedCount > 0) {
			Logger.info("Cleaned up old security events", "cleanupOldEvents", {
				removedCount,
			});
		}
	}
	private async loadPinnedCertificates(): Promise<void> {
		try {
			this.pinnedCertificates.clear();

			if (!this.secrets) {
				Logger.warn("VS Code secrets storage not available, using in-memory storage only", "loadPinnedCertificates");
				return;
			}

			// Load pinned certificates from VS Code secret storage
			const pinnedCertsData = await this.secrets.get("postgresql.pinnedCertificates");

			if (pinnedCertsData) {
				try {
					const pinnedCertsArray: Array<{
						hostname: string;
						certificate: CertificateInfo;
						pinnedAt: string;
					}> = JSON.parse(pinnedCertsData);

					for (const item of pinnedCertsArray) {
						// Validate certificate data integrity
						if (this.validateCertificateIntegrity(item.certificate)) {
							this.pinnedCertificates.set(item.hostname, item.certificate);

							Logger.debug("Loaded pinned certificate", "loadPinnedCertificates", {
								hostname: item.hostname,
								fingerprint: item.certificate.fingerprint,
								pinnedAt: item.pinnedAt,
							});
						} else {
							Logger.warn("Invalid pinned certificate data detected and skipped", "loadPinnedCertificates", {
								hostname: item.hostname,
							});
						}
					}

					Logger.info("Pinned certificates loaded from secret storage", "loadPinnedCertificates", {
						count: this.pinnedCertificates.size,
					});
				} catch (parseError) {
					Logger.error("Failed to parse pinned certificates data", parseError as Error, "loadPinnedCertificates");
					// Clear corrupted data
					await this.secrets.delete("postgresql.pinnedCertificates");
				}
			} else {
				Logger.info("No pinned certificates found in secret storage", "loadPinnedCertificates");
			}
		} catch (error) {
			Logger.error("Failed to load pinned certificates", error as Error, "loadPinnedCertificates");
		}
	}
	private startSecurityMonitoring(): void {
		// Clean up old events every hour
		setInterval(
			() => {
				this.cleanupOldEvents();
				this.cleanupRateLimitStore();
			},
			60 * 60 * 1000,
		);

		// Auto-resolve events after configured period
		if (this.config.monitoring.autoResolveAfterDays > 0) {
			setInterval(
				() => {
					this.autoResolveEvents();
				},
				24 * 60 * 60 * 1000,
			);
		}

		Logger.info("Security monitoring started", "startSecurityMonitoring");
	}
	private autoResolveEvents(): void {
		const cutoffDate = new Date(Date.now() - this.config.monitoring.autoResolveAfterDays * 24 * 60 * 60 * 1000);
		let resolvedCount = 0;

		this.securityEvents.forEach((event) => {
			if (!event.resolved && new Date(event.timestamp) < cutoffDate) {
				event.resolved = true;
				resolvedCount++;
			}
		});

		if (resolvedCount > 0) {
			Logger.info("Auto-resolved security events", "autoResolveEvents", {
				resolvedCount,
			});
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
				Logger.warn("Encryption key not found, returning unencrypted data", "encryptSensitiveData");
				return data;
			}

			// Generate a random initialization vector (IV) for AES-GCM
			const iv = crypto.randomBytes(16);

			// Generate encryption key from key ID (derive key from ID for consistency)
			const encryptionKey = this.generateKeyFromId(keyId);

			// Create cipher with the encryption key and IV
			const cipher = crypto.createCipheriv(key.algorithm, encryptionKey, iv);

			// Encrypt the data
			let encrypted = cipher.update(data, "utf8", "hex");
			encrypted += cipher.final("hex");

			// For AES-256-GCM, get the authentication tag
			let authTag: Buffer | undefined;
			if (key.algorithm === "AES-256-GCM") {
				authTag = (cipher as any).getAuthTag();
			}

			// Combine IV, encrypted data, and auth tag (if available)
			const buffers: Buffer[] = [iv, Buffer.from(encrypted, "hex")];
			if (authTag) {
				buffers.push(authTag);
			}
			const result = Buffer.concat(buffers).toString("base64");

			// Create final encrypted string with metadata
			const finalEncrypted = `encrypted_${key.algorithm}_${result}`;

			// Cache encrypted data
			this.sensitiveDataCache.set(finalEncrypted, {
				encrypted: finalEncrypted,
				classification,
				timestamp: Date.now(),
			});

			Logger.info("Data encrypted successfully", "encryptSensitiveData", {
				classification,
				algorithm: key.algorithm,
				dataLength: data.length,
				encryptedLength: finalEncrypted.length,
			});

			return finalEncrypted;
		} catch (error) {
			Logger.error("Failed to encrypt sensitive data", error as Error, "encryptSensitiveData");
			return data;
		}
	}
	/**
	 * Generates a consistent encryption key from a key ID
	 */
	private generateKeyFromId(keyId: string): Buffer {
		// Use PBKDF2 to derive a consistent key from the key ID
		// This ensures the same key ID always produces the same encryption key
		const salt = "postgresql-schema-sync-salt"; // Fixed salt for consistency
		return crypto.pbkdf2Sync(keyId, salt, 10000, 32, "sha256");
	}

	/**
	 * Decrypts previously encrypted data
	 */
	async decryptSensitiveData(encryptedData: string): Promise<string> {
		if (!this.config.encryption.enabled) {
			return encryptedData;
		}

		try {
			// Check cache first
			const cached = this.sensitiveDataCache.get(encryptedData);
			if (cached) {
				// Parse the encrypted data format: encrypted_{algorithm}_{base64data}
				const parts = encryptedData.split("_");
				if (parts.length < 3 || parts[0] !== "encrypted") {
					Logger.warn("Invalid encrypted data format", "decryptSensitiveData");
					return encryptedData;
				}

				const algorithm = parts[1];
				const encryptedPayload = parts.slice(2).join("_");

				// Decode the base64 payload
				const payloadBuffer = Buffer.from(encryptedPayload, "base64");

				// Extract components based on algorithm
				let iv: Buffer;
				let encrypted: Buffer;
				let authTag: Buffer | undefined;

				if (algorithm === "AES-256-GCM") {
					// For GCM: IV (16 bytes) + encrypted data + auth tag (16 bytes)
					iv = payloadBuffer.subarray(0, 16);
					authTag = payloadBuffer.subarray(-16);
					encrypted = payloadBuffer.subarray(16, -16);
				} else {
					// For other algorithms: IV (16 bytes) + encrypted data
					iv = payloadBuffer.subarray(0, 16);
					encrypted = payloadBuffer.subarray(16);
				}

				// Find the encryption key (we need to derive it from the key ID used during encryption)
				// This is a simplified approach - in production, you'd store key metadata
				const keyId = this.findKeyIdForEncryptedData(encryptedData);
				if (!keyId) {
					Logger.warn("Could not determine encryption key for data", "decryptSensitiveData");
					return encryptedData;
				}

				const encryptionKey = this.generateKeyFromId(keyId);

				// Create decipher
				const decipher = crypto.createDecipheriv(algorithm, encryptionKey, iv);

				// Set auth tag for GCM mode
				if (authTag && algorithm === "AES-256-GCM") {
					(decipher as any).setAuthTag(authTag);
				}

				// Decrypt the data
				let decrypted = decipher.update(encrypted);
				decrypted = Buffer.concat([decrypted, decipher.final()]);

				return decrypted.toString("utf8");
			}

			Logger.warn("Encrypted data not found in cache", "decryptSensitiveData");
			return encryptedData;
		} catch (error) {
			Logger.error("Failed to decrypt sensitive data", error as Error, "decryptSensitiveData");
			return encryptedData;
		}
	}

	/**
	 * Finds the key ID used to encrypt data (simplified implementation)
	 */
	private findKeyIdForEncryptedData(encryptedData: string): string | null {
		// In a real implementation, you'd store key metadata with encrypted data
		// For now, we'll try to find a key that can decrypt the data
		for (const [keyId, key] of this.encryptionKeys.entries()) {
			try {
				const encryptionKey = this.generateKeyFromId(keyId);
				// This is a simplified check - in production, you'd verify with stored metadata
				if (key.usage.includes("data-encryption")) {
					return keyId;
				}
			} catch {
				// Continue to next key
			}
		}
		return null;
	}
	validateConnectionSecurity(
		hostname: string,
		_port: number,
		useSSL: boolean,
	): {
		allowed: boolean;
		reason?: string;
		requiresSSL?: boolean;
	} {
		// Check if secure connections are enforced
		if (this.config.connectionSecurity.enforceSecureConnections && !useSSL) {
			return {
				allowed: false,
				reason: "Secure connections are enforced but connection is not using SSL",
				requiresSSL: true,
			};
		}

		// Check hostname restrictions
		if (
			this.config.certificatePinning.enabled &&
			this.config.certificatePinning.allowedHostnames.length > 0 &&
			!this.config.certificatePinning.allowedHostnames.includes(hostname)
		) {
			return {
				allowed: false,
				reason: `Hostname ${hostname} not in allowed list for certificate pinning`,
			};
		}

		return { allowed: true };
	}
	/**
	 * Validates certificate data integrity before storage or usage
	 */
	private validateCertificateIntegrity(certificate: CertificateInfo): boolean {
		try {
			// Check required fields
			if (!certificate.subject || !certificate.issuer || !certificate.fingerprint) {
				Logger.warn("Certificate missing required fields", "validateCertificateIntegrity");
				return false;
			}

			// Validate fingerprint format (should be colon-separated hex)
			const fingerprintRegex = /^[A-Fa-f0-9]{2}(:[A-Fa-f0-9]{2})*$/;
			if (!fingerprintRegex.test(certificate.fingerprint)) {
				Logger.warn("Certificate has invalid fingerprint format", "validateCertificateIntegrity");
				return false;
			}

			// Validate dates
			const now = new Date();
			const validFrom = new Date(certificate.validFrom);
			const validTo = new Date(certificate.validTo);

			if (isNaN(validFrom.getTime()) || isNaN(validTo.getTime())) {
				Logger.warn("Certificate has invalid date format", "validateCertificateIntegrity");
				return false;
			}

			// Check if certificate is not expired
			if (validTo < now) {
				Logger.warn("Certificate has expired", "validateCertificateIntegrity", {
					validTo: certificate.validTo,
					now: now.toISOString(),
				});
				return false;
			}

			// Validate key size
			if (certificate.keySize < 1024) {
				Logger.warn("Certificate has insufficient key size", "validateCertificateIntegrity", {
					keySize: certificate.keySize,
				});
				return false;
			}

			// Validate algorithm
			if (!certificate.algorithm || certificate.algorithm.length === 0) {
				Logger.warn("Certificate missing algorithm information", "validateCertificateIntegrity");
				return false;
			}

			return true;
		} catch (error) {
			Logger.error("Certificate integrity validation failed", error as Error, "validateCertificateIntegrity");
			return false;
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
			Logger.info("Cleaned up old rate limit entries", "cleanupRateLimitStore", { cleanedCount });
		}
	}

	/**
	 * Gets or creates encryption key for data classification
	 */
	private async getOrCreateEncryptionKey(classification: DataClassification): Promise<string> {
		const keyName = `data-encryption-${classification}`;

		let key = Array.from(this.encryptionKeys.values()).find((k) => k.name === keyName);

		if (!key) {
			// Create new encryption key
			const keyId = `key-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
			key = {
				id: keyId,
				name: keyName,
				algorithm: this.config.encryption.defaultAlgorithm,
				keySize: this.config.encryption.defaultAlgorithm === "AES-256-GCM" ? 256 : 256,
				created: new Date(),
				expires: new Date(Date.now() + this.config.encryption.keyRotationDays * 24 * 60 * 60 * 1000),
				usage: [classification],
			};

			this.encryptionKeys.set(keyId, key);

			Logger.info("New encryption key created", "getOrCreateEncryptionKey", {
				keyId,
				classification,
				algorithm: key.algorithm,
			});
		}

		return key.id;
	}
}
