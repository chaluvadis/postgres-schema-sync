/**
 * MigrationConstants - Contains all magic numbers and constants used in migration operations
 * Centralizes configuration values for better maintainability and consistency
 */

// Duration estimates for different migration operations (in seconds)
export const MIGRATION_DURATIONS = {
    // Table operations
    TABLE_CREATE: 30,
    TABLE_ALTER: 60,
    TABLE_DROP: 15,

    // Index operations
    INDEX_CREATE: 45,
    INDEX_ALTER: 30,
    INDEX_DROP: 10,

    // View operations
    VIEW_CREATE: 20,
    VIEW_ALTER: 25,
    VIEW_DROP: 5,

    // Function operations
    FUNCTION_CREATE: 15,
    FUNCTION_ALTER: 20,
    FUNCTION_DROP: 5,

    // Column operations
    COLUMN_ADD: 10,
    COLUMN_ALTER: 25,
    COLUMN_DROP: 8,

    // Default duration for unknown operations
    DEFAULT: 30
} as const;

// Risk level thresholds for migration assessment
export const RISK_THRESHOLDS = {
    CRITICAL_STEPS_THRESHOLD: 1, // Any critical step makes migration critical
    HIGH_RISK_STEPS_THRESHOLD: 3, // 3+ high risk steps make migration high risk
    DEFAULT_RISK_LEVEL: 'low' as const
} as const;

// Performance monitoring constants
export const PERFORMANCE_CONSTANTS = {
    SIMULATED_MEMORY_USAGE_MB: 50,
    SIMULATED_DATABASE_LOAD: 0.3,
    DEFAULT_BATCH_SIZE: 100,
    MAX_CONCURRENT_OPERATIONS: 5,
    TIMEOUT_BUFFER_MULTIPLIER: 1.5
} as const;

// Validation constants
export const VALIDATION_CONSTANTS = {
    DEFAULT_SUCCESS_RATE_PERCENTAGE: 60,
    MAX_VALIDATION_RETRIES: 3,
    VALIDATION_TIMEOUT_SECONDS: 300,
    CONDITION_CHECK_TIMEOUT_MS: 5000
} as const;

// Rollback constants
export const ROLLBACK_CONSTANTS = {
    DEFAULT_ROLLBACK_TIME_MINUTES: 90,
    MANUAL_ROLLBACK_TIME_MINUTES: 60,
    BACKUP_RESTORE_TIME_MINUTES: 30,
    ROLLBACK_SUCCESS_RATE_PERCENTAGE: 60
} as const;

// SQL parsing constants
export const SQL_PARSING_CONSTANTS = {
    MAX_STATEMENT_LENGTH_FOR_LOGGING: 200,
    STATEMENT_TRIM_THRESHOLD: 1, // Minimum length for a valid statement
    MAX_PARENTHESIS_DEPTH: 10
} as const;

// Hash generation constants
export const HASH_CONSTANTS = {
    HASH_ALGORITHM: 'SHA-256',
    FALLBACK_HASH_LENGTH: 16,
    SCHEMA_SORT_KEY_TEMPLATE: '{type}:{schema}:{name}'
} as const;

// Logging constants
export const LOGGING_CONSTANTS = {
    MAX_LOG_MESSAGE_LENGTH: 1000,
    SENSITIVE_DATA_MASK: '***MASKED***',
    PERFORMANCE_LOG_THRESHOLD_MS: 1000
} as const;

// Database query constants
export const DATABASE_CONSTANTS = {
    DEFAULT_QUERY_TIMEOUT_MS: 30000,
    CONNECTION_POOL_SIZE: 10,
    MAX_RETRY_ATTEMPTS: 3,
    RETRY_DELAY_MS: 1000
} as const;

// File system constants
export const FILESYSTEM_CONSTANTS = {
    MIGRATION_FILE_EXTENSION: '.sql',
    BACKUP_FILE_PREFIX: 'migration_backup_',
    LOG_FILE_MAX_SIZE_MB: 100,
    TEMP_FILE_CLEANUP_DELAY_MS: 3600000 // 1 hour
} as const;

// Error handling constants
export const ERROR_CONSTANTS = {
    MAX_ERROR_MESSAGE_LENGTH: 500,
    STACK_TRACE_MAX_DEPTH: 10,
    SENSITIVE_ERROR_PATTERNS: ['password', 'token', 'key', 'secret']
} as const;

// Progress tracking constants
export const PROGRESS_CONSTANTS = {
    PROGRESS_UPDATE_INTERVAL_MS: 1000,
    MIN_STEP_DURATION_FOR_PROGRESS: 5,
    MAX_CONCURRENT_PROGRESS_UPDATES: 10
} as const;