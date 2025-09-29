namespace PostgreSqlSchemaCompareSync.Core.Connection.Recovery;
public class ConnectionRecoveryManager : IDisposable
{
    private readonly ConnectionSettings _settings;
    private readonly ILogger<ConnectionRecoveryManager> _logger;
    private readonly ConcurrentDictionary<string, ConnectionRecoveryInfo> _recoveryInfo;
    private readonly Timer _recoveryTimer;
    private bool _disposed;
    public ConnectionRecoveryManager(
        IOptions<AppSettings> settings,
        ILogger<ConnectionRecoveryManager> logger)
    {
        _settings = settings.Value.Connection;
        _logger = logger;
        _recoveryInfo = new ConcurrentDictionary<string, ConnectionRecoveryInfo>();
        // Start recovery timer
        _recoveryTimer = new Timer(
            RecoveryCallback,
            null,
            TimeSpan.FromSeconds(_settings.RetryDelay / 1000),
            TimeSpan.FromSeconds(_settings.RetryDelay / 1000));
        _logger.LogInformation("Connection recovery manager started with {RetryDelay}ms retry delay",
            _settings.RetryDelay);
    }
    public void ReportConnectionFailure(ConnectionInfo connectionInfo, Exception exception)
    {
        var key = GetConnectionKey(connectionInfo);
        var recoveryInfo = _recoveryInfo.GetOrAdd(key, k => new ConnectionRecoveryInfo
        {
            ConnectionInfo = connectionInfo,
            FirstFailureAt = DateTime.UtcNow,
            LastFailureAt = DateTime.UtcNow,
            FailureCount = 0,
            IsRecovering = false
        });
        recoveryInfo.FailureCount++;
        recoveryInfo.LastFailureAt = DateTime.UtcNow;
        recoveryInfo.LastError = exception.Message;
        recoveryInfo.IsRecovering = false;
        _logger.LogWarning(exception,
            "Connection failure {FailureCount} reported for {ConnectionKey}",
            recoveryInfo.FailureCount, key);
        // Start recovery process if enabled
        if (_settings.EnableAutoRecovery && recoveryInfo.FailureCount <= _settings.MaxRetryAttempts)
        {
            Task.Run(() => AttemptRecoveryAsync(connectionInfo));
        }
    }
    public async Task<bool> AttemptRecoveryAsync(ConnectionInfo connectionInfo)
    {
        var key = GetConnectionKey(connectionInfo);
        var recoveryInfo = _recoveryInfo.GetOrAdd(key, k => new ConnectionRecoveryInfo
        {
            ConnectionInfo = connectionInfo
        });
        if (recoveryInfo.IsRecovering || recoveryInfo.FailureCount > _settings.MaxRetryAttempts)
        {
            return false;
        }
        recoveryInfo.IsRecovering = true;
        recoveryInfo.LastRecoveryAttemptAt = DateTime.UtcNow;
        _logger.LogInformation("Attempting recovery for {ConnectionKey} (attempt {Attempt})",
            key, recoveryInfo.FailureCount);
        try
        {
            // Test connection
            using var testConnection = new NpgsqlConnection(connectionInfo.ConnectionString);
            await testConnection.OpenAsync();
            // Perform health check
            using var cmd = testConnection.CreateCommand();
            cmd.CommandText = "SELECT version()";
            cmd.CommandTimeout = 10;
            await cmd.ExecuteScalarAsync();
            // Connection recovered successfully
            recoveryInfo.IsRecovering = false;
            recoveryInfo.LastSuccessAt = DateTime.UtcNow;
            recoveryInfo.RecoveryCount++;
            _logger.LogInformation("Successfully recovered connection {ConnectionKey}", key);
            return true;
        }
        catch (Exception ex)
        {
            recoveryInfo.IsRecovering = false;
            recoveryInfo.LastError = ex.Message;
            _logger.LogWarning(ex, "Recovery attempt {Attempt} failed for {ConnectionKey}",
                recoveryInfo.FailureCount, key);
            return false;
        }
    }
    public ConnectionRecoveryInfo GetRecoveryInfo(ConnectionInfo connectionInfo)
    {
        var key = GetConnectionKey(connectionInfo);
        return _recoveryInfo.GetOrAdd(key, k => new ConnectionRecoveryInfo
        {
            ConnectionInfo = connectionInfo
        });
    }
    public Dictionary<string, ConnectionRecoveryInfo> GetAllRecoveryInfo()
    {
        return new Dictionary<string, ConnectionRecoveryInfo>(_recoveryInfo);
    }
    private void RecoveryCallback(object state)
    {
        Task.Run(PerformRecoveryAsync);
    }
    private async Task PerformRecoveryAsync()
    {
        var recoveryTasks = _recoveryInfo.Values
            .Where(r => r.FailureCount > 0 && r.FailureCount <= _settings.MaxRetryAttempts && !r.IsRecovering)
            .Select(async recoveryInfo =>
            {
                // Check if enough time has passed since last attempt
                var timeSinceLastAttempt = DateTime.UtcNow - (recoveryInfo.LastRecoveryAttemptAt ?? DateTime.UtcNow);
                if (timeSinceLastAttempt.TotalMilliseconds < _settings.RetryDelay)
                {
                    return;
                }
                await AttemptRecoveryAsync(recoveryInfo.ConnectionInfo);
            });
        await Task.WhenAll(recoveryTasks);
        // Log recovery summary
        var recoveringCount = _recoveryInfo.Count(r => r.Value.IsRecovering);
        var failedCount = _recoveryInfo.Count(r => r.Value.FailureCount > _settings.MaxRetryAttempts);
        if (recoveringCount > 0 || failedCount > 0)
        {
            _logger.LogInformation("Recovery check completed: {RecoveringCount} recovering, {FailedCount} permanently failed",
                recoveringCount, failedCount);
        }
    }
    private string GetConnectionKey(ConnectionInfo connectionInfo)
    {
        return $"{connectionInfo.Host}:{connectionInfo.Port}:{connectionInfo.Database}";
    }
    public void Dispose()
    {
        if (!_disposed)
        {
            _disposed = true;
            _recoveryTimer?.Dispose();
            _recoveryInfo.Clear();
            _logger.LogInformation("Connection recovery manager disposed");
        }
    }
}
public class ConnectionRecoveryInfo
{
    public ConnectionInfo ConnectionInfo { get; set; } = new();
    public DateTime FirstFailureAt { get; set; }
    public DateTime LastFailureAt { get; set; }
    public int FailureCount { get; set; }
    public string? LastError { get; set; }
    public bool IsRecovering { get; set; }
    public DateTime? LastRecoveryAttemptAt { get; set; }
    public DateTime? LastSuccessAt { get; set; }
    public int RecoveryCount { get; set; }
    public TimeSpan TotalDowntime => LastSuccessAt.HasValue ?
        LastFailureAt - LastSuccessAt.Value : TimeSpan.Zero;
    public bool IsPermanentlyFailed => FailureCount > 3; // Max retry attempts
}