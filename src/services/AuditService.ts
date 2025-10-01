import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/Logger';

/**
 * Audit event types for security and compliance tracking
 */
export enum AuditEventType {
    // Authentication & Authorization
    LOGIN_ATTEMPT = 'LOGIN_ATTEMPT',
    LOGIN_SUCCESS = 'LOGIN_SUCCESS',
    LOGIN_FAILURE = 'LOGIN_FAILURE',
    LOGOUT = 'LOGOUT',
    PERMISSION_DENIED = 'PERMISSION_DENIED',

    // Connection Management
    CONNECTION_CREATED = 'CONNECTION_CREATED',
    CONNECTION_UPDATED = 'CONNECTION_UPDATED',
    CONNECTION_DELETED = 'CONNECTION_DELETED',
    CONNECTION_TESTED = 'CONNECTION_TESTED',

    // Schema Operations
    SCHEMA_BROWSED = 'SCHEMA_BROWSED',
    SCHEMA_COMPARED = 'SCHEMA_COMPARED',
    OBJECT_DETAILS_VIEWED = 'OBJECT_DETAILS_VIEWED',

    // Migration Operations
    MIGRATION_GENERATED = 'MIGRATION_GENERATED',
    MIGRATION_EXECUTED = 'MIGRATION_EXECUTED',
    MIGRATION_ROLLBACK = 'MIGRATION_ROLLBACK',

    // Configuration Changes
    SETTINGS_CHANGED = 'SETTINGS_CHANGED',
    ENCRYPTION_KEY_ROTATED = 'ENCRYPTION_KEY_ROTATED',

    // Security Events
    SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
    DATA_EXPORT = 'DATA_EXPORT',
    BULK_OPERATION = 'BULK_OPERATION'
}

/**
 * Severity levels for audit events
 */
export enum AuditSeverity {
    LOW = 'LOW',
    MEDIUM = 'MEDIUM',
    HIGH = 'HIGH',
    CRITICAL = 'CRITICAL'
}

/**
 * Audit event interface
 */
export interface AuditEvent {
    id: string;
    timestamp: string;
    type: AuditEventType;
    severity: AuditSeverity;
    userId?: string;
    workspaceId?: string;
    sessionId: string;
    category: string;
    action: string;
    resource?: string | undefined;
    details: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
    success: boolean;
    errorMessage?: string | undefined;
    duration?: number | undefined;
}

/**
 * Audit service for comprehensive security and compliance logging
 */
export class AuditService {
    private static instance: AuditService;
    private auditLogPath: string;
    private sessionId: string;
    private maxLogFiles: number = 30; // Keep 30 days of logs
    private maxFileSize: number = 10 * 1024 * 1024; // 10MB per file
    private auditQueue: AuditEvent[] = [];
    private flushInterval?: NodeJS.Timeout;
    private isInitialized: boolean = false;

    private constructor() {
        this.sessionId = this.generateSessionId();
        this.auditLogPath = this.getAuditLogDirectory();
        this.initializeAuditLogging();
    }

    static getInstance(): AuditService {
        if (!AuditService.instance) {
            AuditService.instance = new AuditService();
        }
        return AuditService.instance;
    }

    /**
     * Initialize audit logging system
     */
    private initializeAuditLogging(): void {
        try {
            // Create audit log directory if it doesn't exist
            if (!fs.existsSync(this.auditLogPath)) {
                fs.mkdirSync(this.auditLogPath, { recursive: true });
            }

            // Start periodic flush of audit events
            this.flushInterval = setInterval(() => {
                this.flushAuditQueue();
            }, 5000); // Flush every 5 seconds

            this.isInitialized = true;
            Logger.info('Audit service initialized', {
                logPath: this.auditLogPath,
                sessionId: this.sessionId
            });

        } catch (error) {
            Logger.error('Failed to initialize audit service', error as Error);
            throw new Error(`Audit service initialization failed: ${(error as Error).message}`);
        }
    }

    /**
     * Log an audit event
     */
    async logEvent(
        type: AuditEventType,
        severity: AuditSeverity,
        action: string,
        details: Record<string, any> = {},
        resource?: string,
        success: boolean = true,
        errorMessage?: string,
        duration?: number
    ): Promise<void> {
        if (!this.isInitialized) {
            Logger.warn('Audit service not initialized, skipping audit log');
            return;
        }

        try {
            const event: AuditEvent = {
                id: this.generateEventId(),
                timestamp: new Date().toISOString(),
                type,
                severity,
                sessionId: this.sessionId,
                category: this.getCategoryFromType(type),
                action,
                resource,
                details: this.sanitizeDetails(details),
                success,
                errorMessage,
                duration
            };

            // Add to queue for batch processing
            this.auditQueue.push(event);

            // Immediate flush for critical events
            if (severity === AuditSeverity.CRITICAL || severity === AuditSeverity.HIGH) {
                await this.flushAuditQueue();
            }

            Logger.debug('Audit event logged', { type, severity, action });

        } catch (error) {
            Logger.error('Failed to log audit event', error as Error);
        }
    }

    /**
     * Log connection-related events
     */
    async logConnectionEvent(
        action: string,
        connectionName: string,
        details: Record<string, any> = {},
        success: boolean = true,
        errorMessage?: string
    ): Promise<void> {
        await this.logEvent(
            AuditEventType.CONNECTION_TESTED,
            AuditSeverity.MEDIUM,
            action,
            { ...details, connectionName },
            `connection:${connectionName}`,
            success,
            errorMessage
        );
    }

    /**
     * Log schema operation events
     */
    async logSchemaEvent(
        action: string,
        databaseName: string,
        schemaName?: string,
        details: Record<string, any> = {},
        success: boolean = true,
        errorMessage?: string
    ): Promise<void> {
        await this.logEvent(
            AuditEventType.SCHEMA_BROWSED,
            AuditSeverity.LOW,
            action,
            { ...details, databaseName, schemaName },
            schemaName ? `schema:${databaseName}.${schemaName}` : `database:${databaseName}`,
            success,
            errorMessage
        );
    }

    /**
     * Log migration events
     */
    async logMigrationEvent(
        action: string,
        migrationId: string,
        sourceDb: string,
        targetDb: string,
        details: Record<string, any> = {},
        success: boolean = true,
        errorMessage?: string,
        duration?: number
    ): Promise<void> {
        await this.logEvent(
            AuditEventType.MIGRATION_EXECUTED,
            AuditSeverity.HIGH,
            action,
            { ...details, migrationId, sourceDb, targetDb },
            `migration:${migrationId}`,
            success,
            errorMessage,
            duration
        );
    }

    /**
     * Log security events
     */
    async logSecurityEvent(
        action: string,
        details: Record<string, any> = {},
        severity: AuditSeverity = AuditSeverity.HIGH,
        success: boolean = true,
        errorMessage?: string
    ): Promise<void> {
        await this.logEvent(
            AuditEventType.SUSPICIOUS_ACTIVITY,
            severity,
            action,
            details,
            undefined,
            success,
            errorMessage
        );
    }

    /**
     * Generate audit report for compliance
     */
    async generateAuditReport(
        startDate: Date,
        endDate: Date,
        filters?: {
            eventTypes?: AuditEventType[];
            severities?: AuditSeverity[];
            users?: string[];
            resources?: string[];
        }
    ): Promise<AuditEvent[]> {
        try {
            const reportEvents: AuditEvent[] = [];

            // Get all log files within date range
            const logFiles = this.getLogFilesInRange(startDate, endDate);

            for (const logFile of logFiles) {
                try {
                    const fileContent = fs.readFileSync(logFile, 'utf8');
                    const events = JSON.parse(fileContent) as AuditEvent[];

                    // Apply filters
                    let filteredEvents = events.filter(event =>
                        event.timestamp >= startDate.toISOString() &&
                        event.timestamp <= endDate.toISOString()
                    );

                    if (filters?.eventTypes?.length) {
                        filteredEvents = filteredEvents.filter(event =>
                            filters.eventTypes!.includes(event.type)
                        );
                    }

                    if (filters?.severities?.length) {
                        filteredEvents = filteredEvents.filter(event =>
                            filters.severities!.includes(event.severity)
                        );
                    }

                    if (filters?.users?.length) {
                        filteredEvents = filteredEvents.filter(event =>
                            event.userId && filters.users!.includes(event.userId)
                        );
                    }

                    if (filters?.resources?.length) {
                        filteredEvents = filteredEvents.filter(event =>
                            event.resource && filters.resources!.some(resource =>
                                event.resource!.includes(resource)
                            )
                        );
                    }

                    reportEvents.push(...filteredEvents);
                } catch (error) {
                    Logger.warn(`Failed to read audit log file: ${logFile}`, error as Error);
                }
            }

            Logger.info('Audit report generated', {
                eventCount: reportEvents.length,
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString()
            });

            return reportEvents.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

        } catch (error) {
            Logger.error('Failed to generate audit report', error as Error);
            throw new Error(`Audit report generation failed: ${(error as Error).message}`);
        }
    }

    /**
     * Get audit statistics
     */
    async getAuditStatistics(
        startDate: Date,
        endDate: Date
    ): Promise<Record<string, any>> {
        try {
            const events = await this.generateAuditReport(startDate, endDate);

            const stats: Record<string, number> = {
                totalEvents: events.length,
                successRate: 0,
                averageDuration: 0
            };

            // Count by type and severity
            const eventsByType: Record<string, number> = {};
            const eventsBySeverity: Record<string, number> = {};

            events.forEach(event => {
                eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
                eventsBySeverity[event.severity] = (eventsBySeverity[event.severity] || 0) + 1;
            });

            stats.eventsByType = eventsByType;
            stats.eventsBySeverity = eventsBySeverity;

            // Calculate success rate
            const successfulEvents = events.filter(e => e.success).length;
            stats.successRate = events.length > 0 ? (successfulEvents / events.length) * 100 : 0;

            // Calculate average duration
            const eventsWithDuration = events.filter(e => e.duration !== undefined);
            if (eventsWithDuration.length > 0) {
                stats.averageDuration = eventsWithDuration.reduce((sum, e) => sum + (e.duration || 0), 0) / eventsWithDuration.length;
            }

            return stats;

        } catch (error) {
            Logger.error('Failed to get audit statistics', error as Error);
            throw new Error(`Audit statistics generation failed: ${(error as Error).message}`);
        }
    }

    /**
     * Flush audit queue to disk
     */
    private async flushAuditQueue(): Promise<void> {
        if (this.auditQueue.length === 0) {
            return;
        }

        try {
            const events = [...this.auditQueue];
            this.auditQueue = [];

            const logFile = this.getCurrentLogFile();
            const existingContent = fs.existsSync(logFile) ?
                fs.readFileSync(logFile, 'utf8') : '[]';

            let existingEvents: AuditEvent[] = [];
            try {
                existingEvents = JSON.parse(existingContent);
            } catch (error) {
                Logger.warn('Corrupted audit log file, creating new one', error as Error);
                existingEvents = [];
            }

            const allEvents = [...existingEvents, ...events];
            fs.writeFileSync(logFile, JSON.stringify(allEvents, null, 2));

            // Rotate log files if needed
            await this.rotateLogFilesIfNeeded();

        } catch (error) {
            Logger.error('Failed to flush audit queue', error as Error);
            // Put events back in queue for retry
            this.auditQueue.unshift(...this.auditQueue);
        }
    }

    /**
     * Get category from event type
     */
    private getCategoryFromType(type: AuditEventType): string {
        if (type.includes('LOGIN') || type.includes('PERMISSION')) {
            return 'Authentication';
        }
        if (type.includes('CONNECTION')) {
            return 'Connection Management';
        }
        if (type.includes('SCHEMA') || type.includes('OBJECT')) {
            return 'Schema Operations';
        }
        if (type.includes('MIGRATION')) {
            return 'Migration Operations';
        }
        if (type.includes('SETTINGS') || type.includes('ENCRYPTION')) {
            return 'Configuration';
        }
        return 'General';
    }

    /**
     * Sanitize audit details to remove sensitive information
     */
    private sanitizeDetails(details: Record<string, any>): Record<string, any> {
        const sanitized = { ...details };
        const sensitiveKeys = ['password', 'token', 'secret', 'key', 'credential'];

        Object.keys(sanitized).forEach(key => {
            if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
                sanitized[key] = '[REDACTED]';
            }
        });

        return sanitized;
    }

    /**
     * Get audit log directory
     */
    private getAuditLogDirectory(): string {
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        return path.join(homeDir, '.postgresql-schema-sync', 'audit');
    }

    /**
     * Get current log file path
     */
    private getCurrentLogFile(): string {
        const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        return path.join(this.auditLogPath, `audit-${date}.json`);
    }

    /**
     * Get log files within date range
     */
    private getLogFilesInRange(startDate: Date, endDate: Date): string[] {
        const files: string[] = [];

        for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
            const dateStr = date.toISOString().split('T')[0];
            const filePath = path.join(this.auditLogPath, `audit-${dateStr}.json`);
            if (fs.existsSync(filePath)) {
                files.push(filePath);
            }
        }

        return files;
    }

    /**
     * Rotate log files if needed
     */
    private async rotateLogFilesIfNeeded(): Promise<void> {
        try {
            const files = fs.readdirSync(this.auditLogPath)
                .filter(file => file.startsWith('audit-') && file.endsWith('.json'))
                .map(file => ({
                    name: file,
                    path: path.join(this.auditLogPath, file),
                    date: file.replace('audit-', '').replace('.json', '')
                }))
                .sort((a, b) => b.date.localeCompare(a.date));

            // Remove old files if we have too many
            if (files.length > this.maxLogFiles) {
                const filesToRemove = files.slice(this.maxLogFiles);
                filesToRemove.forEach(file => {
                    fs.unlinkSync(file.path);
                    Logger.debug('Removed old audit log file', { file: file.name });
                });
            }

            // Check file sizes and rotate if needed
            files.slice(0, this.maxLogFiles).forEach(file => {
                try {
                    const stats = fs.statSync(file.path);
                    if (stats.size > this.maxFileSize) {
                        this.rotateLargeLogFile(file.path);
                    }
                } catch (error) {
                    Logger.warn('Failed to check log file size', error as Error);
                }
            });

        } catch (error) {
            Logger.error('Log rotation failed', error as Error);
        }
    }

    /**
     * Rotate large log file
     */
    private rotateLargeLogFile(filePath: string): void {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const rotatedPath = filePath.replace('.json', `-${timestamp}.json`);

            fs.renameSync(filePath, rotatedPath);
            Logger.info('Rotated large audit log file', { from: filePath, to: rotatedPath });
        } catch (error) {
            Logger.error('Failed to rotate large log file', error as Error);
        }
    }

    /**
     * Generate unique session ID
     */
    private generateSessionId(): string {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Generate unique event ID
     */
    private generateEventId(): string {
        return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Dispose of the audit service
     */
    async dispose(): Promise<void> {
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
        }

        await this.flushAuditQueue();
        this.isInitialized = false;

        Logger.info('Audit service disposed');
    }
}