namespace PostgreSqlSchemaCompareSync.Infrastructure.Logging;
public class StructuredLogger
{
    private readonly ILogger _logger;
    private readonly string _correlationId;
    public StructuredLogger(ILogger logger)
    {
        _logger = logger;
        _correlationId = Guid.NewGuid().ToString("N")[..8];
    }
    public StructuredLogger(ILogger logger, string correlationId)
    {
        _logger = logger;
        _correlationId = correlationId;
    }
    public IDisposable BeginScope(string operation, Dictionary<string, object>? context = null)
    {
        var scopeContext = new Dictionary<string, object>
        {
            ["CorrelationId"] = _correlationId,
            ["Operation"] = operation,
            ["Timestamp"] = DateTime.UtcNow
        };
        if (context != null)
        {
            foreach (var item in context)
            {
                scopeContext[item.Key] = item.Value;
            }
        }
        return _logger.BeginScope(scopeContext) ?? new NoOpDisposable();
    }
    public void LogOperationStart(string operation, Dictionary<string, object>? parameters = null)
    {
        var context = new Dictionary<string, object>
        {
            ["EventType"] = "OperationStart",
            ["Operation"] = operation
        };
        if (parameters != null)
        {
            foreach (var param in parameters)
            {
                context[param.Key] = param.Value;
            }
        }
        using var scope = BeginScope(operation, context);
        _logger.LogInformation("Starting operation: {Operation}", operation);
    }
    public void LogOperationEnd(string operation, TimeSpan duration, bool success, Dictionary<string, object>? metrics = null)
    {
        var context = new Dictionary<string, object>
        {
            ["EventType"] = "OperationEnd",
            ["Operation"] = operation,
            ["DurationMs"] = duration.TotalMilliseconds,
            ["Success"] = success
        };
        if (metrics != null)
        {
            foreach (var metric in metrics)
            {
                context[metric.Key] = metric.Value;
            }
        }
        using var scope = BeginScope(operation, context);
        if (success)
        {
            _logger.LogInformation("Operation completed successfully: {Operation} in {DurationMs}ms", operation, duration.TotalMilliseconds);
        }
        else
        {
            _logger.LogWarning("Operation completed with issues: {Operation} in {DurationMs}ms", operation, duration.TotalMilliseconds);
        }
    }
    public void LogErrorWithContext(Exception exception, string operation, Dictionary<string, object>? context = null)
    {
        var errorContext = new Dictionary<string, object>
        {
            ["EventType"] = "Error",
            ["Operation"] = operation,
            ["ExceptionType"] = exception.GetType().Name,
            ["StackTrace"] = exception.StackTrace ?? "No stack trace"
        };
        if (context != null)
        {
            foreach (var item in context)
            {
                errorContext[item.Key] = item.Value;
            }
        }
        using var scope = BeginScope(operation, errorContext);
        _logger.LogError(exception, "Error in operation {Operation}: {ErrorMessage}", operation, exception.Message);
    }
    public void LogPerformanceMetric(string metricName, double value, Dictionary<string, object>? dimensions = null)
    {
        var context = new Dictionary<string, object>
        {
            ["EventType"] = "PerformanceMetric",
            ["MetricName"] = metricName,
            ["MetricValue"] = value
        };
        if (dimensions != null)
        {
            foreach (var dimension in dimensions)
            {
                context[dimension.Key] = dimension.Value;
            }
        }
        using var scope = BeginScope(metricName, context);
        _logger.LogInformation("Performance metric {MetricName}: {MetricValue}", metricName, value);
    }
    public void LogDatabaseOperation(string operation, string database, string schema, string objectName, TimeSpan duration)
    {
        var context = new Dictionary<string, object>
        {
            ["EventType"] = "DatabaseOperation",
            ["DatabaseOperation"] = operation,
            ["Database"] = database,
            ["Schema"] = schema,
            ["ObjectName"] = objectName,
            ["DurationMs"] = duration.TotalMilliseconds
        };
        using var scope = BeginScope(operation, context);
        _logger.LogInformation("Database operation {Operation} on {Database}.{Schema}.{ObjectName} completed in {DurationMs}ms",
            operation, database, schema, objectName, duration.TotalMilliseconds);
    }
    public string GetCorrelationId() => _correlationId;

    private class NoOpDisposable : IDisposable
    {
        public static NoOpDisposable Instance { get; } = new();
        public void Dispose() { }
    }
}