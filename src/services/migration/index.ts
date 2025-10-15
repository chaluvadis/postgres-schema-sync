// Migration Services - Consolidated migration functionality
// This module provides a streamlined replacement for the monolithic MigrationManager

export { StreamlinedMigrationManager } from './StreamlinedMigrationManager';

// Re-export core migration types for convenience
export type {
    MigrationRequest,
    MigrationOptions,
    MigrationMetadata,
    MigrationResult
} from '../../core/MigrationOrchestrator';