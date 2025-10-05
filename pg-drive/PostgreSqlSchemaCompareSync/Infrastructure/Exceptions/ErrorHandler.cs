namespace PostgreSqlSchemaCompareSync.Infrastructure.Exceptions
{
    /// <summary>
    /// Centralized error handling for PostgreSQL Schema Compare & Sync
    /// </summary>
    public static class ErrorHandler
    {
        private static ILogger? _logger;

        /// <summary>
        /// Initializes the error handler with a logger
        /// </summary>
        public static void Initialize(ILogger logger)
        {
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        /// <summary>
        /// Creates an error context for logging and tracking
        /// </summary>
        public static ErrorContext CreateContext(string operation, Dictionary<string, object>? contextData = null)
        {
            return new ErrorContext
            {
                Operation = operation,
                Timestamp = DateTime.UtcNow,
                ContextData = contextData ?? []
            };
        }

        /// <summary>
        /// Creates an enhanced error context with additional metadata
        /// </summary>
        public static ErrorContext CreateEnhancedContext(
            string operation,
            Dictionary<string, object>? contextData = null,
            string? component = null,
            string? version = null)
        {
            var context = new ErrorContext
            {
                Operation = operation,
                Timestamp = DateTime.UtcNow,
                ContextData = contextData ?? []
            };

            if (!string.IsNullOrEmpty(component))
                context.ContextData["Component"] = component;

            if (!string.IsNullOrEmpty(version))
                context.ContextData["Version"] = version;

            context.ContextData["MachineName"] = Environment.MachineName;
            context.ContextData["ProcessId"] = Environment.ProcessId;

            return context;
        }

        /// <summary>
        /// Handles an error with context information
        /// </summary>
        public static void HandleError(Exception error, ErrorContext context)
        {
            if (_logger == null)
            {
                // Fallback to console if logger not initialized
                Console.WriteLine($"Error in {context.Operation}: {error.Message}");
                return;
            }

            _logger.LogError(
                "Error in operation {Operation} at {Timestamp}: {ErrorMessage}. " +
                "Context: {@ContextData}",
                context.Operation, context.Timestamp, error.Message, context.ContextData);

            // Log inner exception if present
            if (error.InnerException != null)
            {
                _logger.LogError(
                    "Inner exception for operation {Operation}: {InnerErrorMessage}",
                    context.Operation, error.InnerException.Message);
            }
        }

        /// <summary>
        /// Handles an error with severity level
        /// </summary>
        public static void HandleErrorWithSeverity(
            Exception error,
            ErrorContext context,
            ErrorSeverity severity)
        {
            if (_logger == null)
            {
                HandleError(error, context);
                return;
            }

            var logLevel = severity switch
            {
                ErrorSeverity.Low => LogLevel.Warning,
                ErrorSeverity.Medium => LogLevel.Error,
                ErrorSeverity.High => LogLevel.Error,
                ErrorSeverity.Critical => LogLevel.Critical,
                _ => LogLevel.Error
            };

            _logger.Log(logLevel,
                "Error with severity {Severity} in operation {Operation} at {Timestamp}: {ErrorMessage}. " +
                "Context: {@ContextData}",
                severity, context.Operation, context.Timestamp, error.Message, context.ContextData);

            // For critical errors, also log stack trace
            if (severity == ErrorSeverity.Critical)
            {
                _logger.LogCritical(
                    "Critical error stack trace for operation {Operation}: {StackTrace}",
                    context.Operation, error.StackTrace);
            }
        }

        /// <summary>
        /// Logs a warning with context
        /// </summary>
        public static void LogWarning(string message, ErrorContext context)
        {
            if (_logger == null)
            {
                Console.WriteLine($"Warning in {context.Operation}: {message}");
                return;
            }

            _logger.LogWarning(
                "Warning in operation {Operation} at {Timestamp}: {Message}. " +
                "Context: {@ContextData}",
                context.Operation, context.Timestamp, message, context.ContextData);
        }

        /// <summary>
        /// Logs information with context
        /// </summary>
        public static void LogInformation(string message, ErrorContext context)
        {
            if (_logger == null)
            {
                Console.WriteLine($"Info in {context.Operation}: {message}");
                return;
            }

            _logger.LogInformation(
                "Information in operation {Operation} at {Timestamp}: {Message}. " +
                "Context: {@ContextData}",
                context.Operation, context.Timestamp, message, context.ContextData);
        }

        /// <summary>
        /// Determines error severity based on error type and message
        /// </summary>
        public static ErrorSeverity DetermineSeverity(Exception error)
        {
            var message = (error.Message + (error.InnerException?.Message ?? "")).ToLowerInvariant();

            // Critical errors
            if (message.Contains("fatal") ||
                message.Contains("catastrophic") ||
                message.Contains("out of memory") ||
                message.Contains("stack overflow"))
            {
                return ErrorSeverity.Critical;
            }

            // High severity errors
            if (message.Contains("authentication failed") ||
                message.Contains("access denied") ||
                message.Contains("permission denied") ||
                message.Contains("corruption") ||
                message.Contains("data loss"))
            {
                return ErrorSeverity.High;
            }

            // Medium severity errors
            if (message.Contains("timeout") ||
                message.Contains("connection failed") ||
                message.Contains("network error") ||
                message.Contains("deadlock"))
            {
                return ErrorSeverity.Medium;
            }

            // Low severity errors
            return ErrorSeverity.Low;
        }
    }

    /// <summary>
    /// Error context for tracking and logging
    /// </summary>
    public class ErrorContext
    {
        public string Operation { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
        public Dictionary<string, object> ContextData { get; set; } = [];
    }

    /// <summary>
    /// Error severity levels
    /// </summary>
    public enum ErrorSeverity
    {
        Low,
        Medium,
        High,
        Critical
    }
}