namespace PostgreSqlSchemaCompareSync.Infrastructure.Exceptions;
public class ErrorHandler
{
    private readonly ILogger<ErrorHandler> _logger;
    private readonly StructuredLogger _structuredLogger;
    private readonly Dictionary<System.Type, Func<Exception, Task<bool>>> _errorHandlers;
    public ErrorHandler(
        ILogger<ErrorHandler> logger,
        StructuredLogger structuredLogger)
    {
        _logger = logger;
        _structuredLogger = structuredLogger;
        _errorHandlers = new Dictionary<System.Type, Func<Exception, Task<bool>>>();
        RegisterDefaultHandlers();
    }
    private void RegisterDefaultHandlers()
    {
        // Register handlers for specific exception types
        RegisterHandler<Npgsql.NpgsqlException>(HandlePostgresExceptionAsync);
        RegisterHandler<ConnectionException>(HandleConnectionExceptionAsync);
        RegisterHandler<SchemaExtractionException>(HandleSchemaExceptionAsync);
        RegisterHandler<ComparisonException>(HandleComparisonExceptionAsync);
        RegisterHandler<MigrationException>(HandleMigrationExceptionAsync);
        RegisterHandler<ValidationException>(HandleValidationExceptionAsync);
        RegisterHandler<OperationCanceledException>(HandleCancellationExceptionAsync);
        RegisterHandler<TimeoutException>(HandleTimeoutExceptionAsync);
    }
    public void RegisterHandler<TException>(Func<TException, Task<bool>> handler) where TException : Exception
    {
        _errorHandlers[typeof(TException)] = ex => handler((TException)ex);
    }
    public async Task<ErrorHandlingResult> HandleExceptionAsync(
        Exception exception,
        string operation,
        Dictionary<string, object>? context = null)
    {
        var correlationId = _structuredLogger.GetCorrelationId();
        try
        {
            _structuredLogger.LogErrorWithContext(exception, operation, context);
            // Try to find a specific handler for this exception type
            var exceptionType = exception.GetType();
            var handled = false;
            foreach (var handlerType in _errorHandlers.Keys)
            {
                if (handlerType.IsAssignableFrom(exceptionType))
                {
                    var canHandle = await _errorHandlers[handlerType](exception);
                    if (canHandle)
                    {
                        handled = true;
                        break;
                    }
                }
            }
            // If no specific handler was found or handled it, use generic handling
            if (!handled)
            {
                await HandleGenericExceptionAsync(exception, operation, context);
            }
            return new ErrorHandlingResult
            {
                Success = handled,
                CorrelationId = correlationId,
                ShouldRetry = ShouldRetryException(exception),
                RetryDelay = GetRetryDelay(exception)
            };
        }
        catch (Exception handlerException)
        {
            _logger.LogError(handlerException, "Error handler itself failed for operation {Operation}", operation);
            return new ErrorHandlingResult
            {
                Success = false,
                CorrelationId = correlationId,
                ShouldRetry = false,
                RetryDelay = TimeSpan.Zero
            };
        }
    }
    private Task<bool> HandlePostgresExceptionAsync(Exception exception)
    {
        var postgresEx = (Npgsql.NpgsqlException)exception;
        _logger.LogWarning("PostgreSQL exception occurred: {ErrorCode} - {Message}", postgresEx.ErrorCode, postgresEx.Message);
        // Check if this is a recoverable error
        var canHandle = postgresEx.SqlState switch
        {
            "40001" => true, // Serialization failure - can retry
            "40P01" => true, // Deadlock detected - can retry
            "53300" => true, // Too many connections - can retry
            _ => false
        };
        return Task.FromResult(canHandle);
    }
    private Task<bool> HandleConnectionExceptionAsync(Exception exception)
    {
        _logger.LogWarning("Connection exception: {Message}", exception.Message);
        // Connection errors are typically retryable
        return Task.FromResult(true);
    }
    private Task<bool> HandleSchemaExceptionAsync(Exception exception)
    {
        _logger.LogWarning("Schema extraction exception: {Message}", exception.Message);
        // Schema errors might be retryable depending on the cause
        var canHandle = exception.Message.Contains("timeout") || exception.Message.Contains("temporary");
        return Task.FromResult(canHandle);
    }
    private Task<bool> HandleComparisonExceptionAsync(Exception exception)
    {
        _logger.LogWarning("Comparison exception: {Message}", exception.Message);
        // Comparison errors are usually not retryable
        return Task.FromResult(false);
    }
    private Task<bool> HandleMigrationExceptionAsync(Exception exception)
    {
        _logger.LogError("Migration exception: {Message}", exception.Message);
        // Migration errors are typically not retryable due to data consistency concerns
        return Task.FromResult(false);
    }
    private Task<bool> HandleValidationExceptionAsync(Exception exception)
    {
        _logger.LogWarning("Validation exception: {Message}", exception.Message);
        // Validation errors are not retryable
        return Task.FromResult(false);
    }
    private Task<bool> HandleCancellationExceptionAsync(Exception exception)
    {
        _logger.LogInformation("Operation was cancelled: {Message}", exception.Message);
        // Cancellation is not an error that should be retried
        return Task.FromResult(false);
    }
    private Task<bool> HandleTimeoutExceptionAsync(Exception exception)
    {
        _logger.LogWarning("Operation timeout: {Message}", exception.Message);
        // Timeouts are typically retryable
        return Task.FromResult(true);
    }
    private async Task HandleGenericExceptionAsync(
        Exception exception,
        string operation,
        Dictionary<string, object>? context)
    {
        _logger.LogError(exception, "Unhandled exception in operation {Operation}", operation);
        // For unhandled exceptions, we might want to create a support ticket or alert
        await CreateErrorReportAsync(exception, operation, context);
    }
    private Task CreateErrorReportAsync(
        Exception exception,
        string operation,
        Dictionary<string, object>? context)
    {
        try
        {
            // In a real implementation, this would create a support ticket or send an alert
            _logger.LogError(
                "Creating error report for unhandled exception in {Operation}. Exception: {ExceptionType} - {Message}",
                operation, exception.GetType().Name, exception.Message);
            // For now, just log additional context
            if (context != null)
            {
                foreach (var item in context)
                {
                    _logger.LogDebug("Error context - {Key}: {Value}", item.Key, item.Value);
                }
            }
        }
        catch (Exception reportException)
        {
            _logger.LogError(reportException, "Failed to create error report");
        }
        return Task.CompletedTask;
    }
    private bool ShouldRetryException(Exception exception)
    {
        return exception switch
        {
            NpgsqlException postgresEx => postgresEx.SqlState switch
            {
                "40001" => true, // Serialization failure
                "40P01" => true, // Deadlock detected
                "53300" => true, // Too many connections
                _ => false
            },
            ConnectionException => true,
            TimeoutException => true,
            _ => false
        };
    }
    private TimeSpan GetRetryDelay(Exception exception)
    {
        return exception switch
        {
            NpgsqlException postgresEx => postgresEx.SqlState switch
            {
                "40001" => TimeSpan.FromMilliseconds(100), // Serialization failure - short delay
                "40P01" => TimeSpan.FromSeconds(1),       // Deadlock - longer delay
                "53300" => TimeSpan.FromSeconds(5),       // Too many connections - wait longer
                _ => TimeSpan.FromSeconds(1)
            },
            ConnectionException => TimeSpan.FromSeconds(2),
            TimeoutException => TimeSpan.FromSeconds(1),
            _ => TimeSpan.FromSeconds(1)
        };
    }
}
public class ErrorHandlingResult
{
    public bool Success { get; set; }
    public string CorrelationId { get; set; } = string.Empty;
    public bool ShouldRetry { get; set; }
    public TimeSpan RetryDelay { get; set; }
    public string? ErrorMessage { get; set; }
    public Dictionary<string, object>? AdditionalContext { get; set; }
}