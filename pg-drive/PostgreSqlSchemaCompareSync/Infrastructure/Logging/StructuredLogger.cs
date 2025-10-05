namespace PostgreSqlSchemaCompareSync.Infrastructure.Logging
{
    /// <summary>
    /// Structured logger for PostgreSQL Schema Compare & Sync
    /// </summary>
    public class StructuredLogger
    {
        private readonly ILogger _logger;

        public StructuredLogger(ILogger logger)
        {
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        /// <summary>
        /// Logs database operation with structured data
        /// </summary>
        public void LogDatabaseOperation(
            string operation,
            string connectionId,
            string database,
            TimeSpan duration,
            bool success,
            string? errorMessage = null)
        {
            var logLevel = success ? LogLevel.Information : LogLevel.Error;

            _logger.Log(logLevel, "Database operation {Operation} completed for {Database} in {Duration}ms. Success: {Success}. ConnectionId: {ConnectionId}",
                operation, database, duration.TotalMilliseconds, success, connectionId);

            if (!success && !string.IsNullOrEmpty(errorMessage))
            {
                _logger.LogError("Database operation {Operation} failed: {ErrorMessage}", operation, errorMessage);
            }
        }

        /// <summary>
        /// Logs schema comparison operation
        /// </summary>
        public void LogSchemaComparison(
            string sourceDatabase,
            string targetDatabase,
            int differenceCount,
            TimeSpan duration)
        {
            _logger.LogInformation(
                "Schema comparison completed between {SourceDatabase} and {TargetDatabase}. " +
                "Found {DifferenceCount} differences in {Duration}ms",
                sourceDatabase, targetDatabase, differenceCount, duration.TotalMilliseconds);
        }

        /// <summary>
        /// Logs migration operation
        /// </summary>
        public void LogMigrationOperation(
            string migrationId,
            string operation,
            string targetDatabase,
            int operationCount,
            TimeSpan duration,
            bool success,
            string? errorMessage = null)
        {
            var logLevel = success ? LogLevel.Information : LogLevel.Error;

            _logger.Log(logLevel,
                "Migration {Operation} completed for {TargetDatabase}. " +
                "MigrationId: {MigrationId}, Operations: {OperationCount}, Duration: {Duration}ms, Success: {Success}",
                operation, targetDatabase, migrationId, operationCount, duration.TotalMilliseconds, success);

            if (!success && !string.IsNullOrEmpty(errorMessage))
            {
                _logger.LogError("Migration {Operation} failed: {ErrorMessage}", operation, errorMessage);
            }
        }

        /// <summary>
        /// Logs performance metrics
        /// </summary>
        public void LogPerformanceMetric(
            string metricName,
            double value,
            string unit,
            Dictionary<string, object>? dimensions = null)
        {
            _logger.LogInformation(
                "Performance metric {MetricName}: {Value}{Unit} {Dimensions}",
                metricName, value, unit, dimensions != null ? $"({string.Join(", ", dimensions.Select(d => $"{d.Key}={d.Value}"))})" : "");
        }

        /// <summary>
        /// Logs security events
        /// </summary>
        public void LogSecurityEvent(
            string eventType,
            string description,
            Dictionary<string, object>? context = null)
        {
            _logger.LogWarning(
                "Security event {EventType}: {Description} {Context}",
                eventType, description,
                context != null ? $"({string.Join(", ", context.Select(c => $"{c.Key}={c.Value}"))})" : "");
        }
    }
}