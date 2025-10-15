// Streamlined Services - Consolidated service layer for PostgreSQL Schema Sync Extension
// This module provides the new modular architecture replacing the previous monolithic design

// Core services (shared infrastructure)
export { CoreServices } from '../core';
export type {
    ConnectionInfo,
    ConnectionValidationResult,
    ProgressInfo,
    ValidationRule,
    ValidationResult,
    MigrationRequest,
    MigrationResult
} from '../core';

// Migration services (consolidated from 4,000+ lines to ~200 lines)
export { StreamlinedMigrationManager } from './migration';
export type { MigrationOptions, MigrationMetadata } from '../core/MigrationOrchestrator';


// Performance analysis services (consolidated from 1,500+ lines to ~400 lines)
export { PerformanceService } from './PerformanceService';
export type {
    PerformanceMetrics,
    AggregatedMetrics,
    QueryPerformanceMetrics,
    IndexUsageMetrics,
    DatabasePerformanceMetrics,
    PerformanceAlert,
    PerformanceRecommendation,
    PerformanceTrend,
    DataPoint,
    SystemPerformanceTrend,
    PerformanceBaseline,
    BaselineMetric,
    SystemBaselineMetric
} from './PerformanceService';

// Service factory for easy initialization
import { ConnectionManager } from '../managers/ConnectionManager';
import { CoreServices } from '../core';
import { StreamlinedMigrationManager } from './migration';
import { PerformanceService } from './PerformanceService';
import { ConflictResolutionService } from './ConflictResolutionService';

export class StreamlinedServices {
    private static instance: StreamlinedServices | null = null;
    private _coreServices: CoreServices | null = null;
    private _migrationManager: StreamlinedMigrationManager | null = null;
    private _conflictResolutionService: ConflictResolutionService | null = null;
    private _performanceService: PerformanceService | null = null;

    private constructor(private connectionManager: ConnectionManager) {
        this._coreServices = CoreServices.getInstance(connectionManager);
    }

    static getInstance(connectionManager: ConnectionManager): StreamlinedServices {
        if (!StreamlinedServices.instance) {
            StreamlinedServices.instance = new StreamlinedServices(connectionManager);
        }
        return StreamlinedServices.instance;
    }

    get coreServices(): CoreServices {
        return this._coreServices!;
    }

    get migrationManager(): StreamlinedMigrationManager {
        if (!this._migrationManager) {
            this._migrationManager = new StreamlinedMigrationManager(this.connectionManager);
        }
        return this._migrationManager;
    }

    get conflictResolutionService(): ConflictResolutionService {
        if (!this._conflictResolutionService) {
            this._conflictResolutionService = new ConflictResolutionService(this.connectionManager);
        }
        return this._conflictResolutionService;
    }

    get performanceService(): PerformanceService {
        if (!this._performanceService) {
            this._performanceService = PerformanceService.getInstance(this.connectionManager);
        }
        return this._performanceService;
    }

    /**
     * Get comprehensive service statistics
     */
    getServiceStats(): {
        core: any;
        migration: any;
        conflict: any;
        performance: any;
        totalServices: number;
    } {
        return {
            core: this._coreServices?.getStats(),
            migration: this._migrationManager?.getStats(),
            conflict: {
                initialized: !!this._conflictResolutionService,
                type: 'ConflictResolutionService'
            },
            performance: this._performanceService?.getStats(),
            totalServices: 4
        };
    }

    /**
     * Dispose of all streamlined services
     */
    dispose(): void {
        this._migrationManager?.dispose();
        this._conflictResolutionService?.dispose();
        this._performanceService?.dispose();
        this._coreServices?.dispose();

        this._migrationManager = null;
        this._conflictResolutionService = null;
        this._performanceService = null;
        this._coreServices = null;

        StreamlinedServices.instance = null;
    }
}