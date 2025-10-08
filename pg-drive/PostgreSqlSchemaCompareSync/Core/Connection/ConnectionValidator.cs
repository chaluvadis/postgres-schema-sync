namespace PostgreSqlSchemaCompareSync.Core.Connection;

/// <summary>
/// Validates database connections and their state
/// </summary>
public class ConnectionValidator
{
    private readonly ILogger<ConnectionValidator> _logger;

    public ConnectionValidator(ILogger<ConnectionValidator> logger)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <summary>
    /// Validates if a connection is healthy and ready for use
    /// </summary>
    public bool IsValid(NpgsqlConnection connection)
    {
        if (connection == null)
            return false;

        try
        {
            return connection.State == ConnectionState.Open;
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Connection validation failed for connection state check");
            return false;
        }
    }

    /// <summary>
    /// Validates connection with detailed health check
    /// </summary>
    public async Task<ConnectionValidationResult> ValidateAsync(
        NpgsqlConnection connection,
        CancellationToken cancellationToken = default)
    {
        var result = new ConnectionValidationResult
        {
            IsValid = false,
            CheckedAt = DateTime.UtcNow
        };

        if (connection == null)
        {
            result.ErrorMessage = "Connection is null";
            return result;
        }

        try
        {
            // Basic state check
            if (connection.State != ConnectionState.Open)
            {
                result.ErrorMessage = $"Connection state is {connection.State}";
                return result;
            }

            // Test with a simple query
            using var command = connection.CreateCommand();
            command.CommandText = "SELECT 1";
            command.CommandTimeout = 5; // Quick test

            var startTime = Stopwatch.GetTimestamp();
            await command.ExecuteScalarAsync(cancellationToken);
            var endTime = Stopwatch.GetTimestamp();

            result.IsValid = true;
            result.ResponseTime = TimeSpan.FromTicks(endTime - startTime);
            result.LastSuccessfulOperation = DateTime.UtcNow;

            return result;
        }
        catch (Exception ex)
        {
            result.ErrorMessage = ex.Message;
            _logger.LogDebug(ex, "Connection validation failed");
            return result;
        }
    }
}

/// <summary>
/// Result of connection validation
/// </summary>
public class ConnectionValidationResult
{
    public bool IsValid { get; set; }
    public TimeSpan ResponseTime { get; set; }
    public DateTime CheckedAt { get; set; }
    public DateTime LastSuccessfulOperation { get; set; }
    public string? ErrorMessage { get; set; }
}