namespace PostgreSqlSchemaCompareSync.Core.Connection.Health;
public class ConnectionHealthMonitor : IDisposable
{
    private readonly ConnectionSettings _settings;
    private readonly ILogger<ConnectionHealthMonitor> _logger;
    private readonly ConcurrentDictionary<string, ConnectionHealthInfo> _healthInfo;
    private readonly Timer _monitoringTimer;
    private bool _disposed;
    public ConnectionHealthMonitor(
        IOptions<AppSettings> settings,
        ILogger<ConnectionHealthMonitor> logger)
    {
        _settings = settings.Value.Connection;
        _logger = logger;
        _healthInfo = new ConcurrentDictionary<string, ConnectionHealthInfo>();
        // Start monitoring timer
        _monitoringTimer = new Timer(
            MonitoringCallback,
            null,
            TimeSpan.FromSeconds(_settings.HealthCheckInterval),
            TimeSpan.FromSeconds(_settings.HealthCheckInterval));
        _logger.LogInformation("Connection health monitor started with {Interval}s interval",
            _settings.HealthCheckInterval);
    }
    public void RegisterConnection(ConnectionInfo connectionInfo)
    {
        var key = GetConnectionKey(connectionInfo);
        var healthInfo = new ConnectionHealthInfo
        {
            ConnectionInfo = connectionInfo,
            LastHealthCheck = DateTime.UtcNow,
            IsHealthy = true,
            ConsecutiveFailures = 0,
            TotalChecks = 0,
            TotalFailures = 0
        };
        _healthInfo[key] = healthInfo;
        _logger.LogDebug("Registered connection {ConnectionKey} for health monitoring", key);
    }
    public void UnregisterConnection(ConnectionInfo connectionInfo)
    {
        var key = GetConnectionKey(connectionInfo);
        _healthInfo.TryRemove(key, out _);
        _logger.LogDebug("Unregistered connection {ConnectionKey} from health monitoring", key);
    }
    public async Task<bool> CheckConnectionHealthAsync(
        ConnectionInfo connectionInfo,
        CancellationToken cancellationToken = default)
    {
        var key = GetConnectionKey(connectionInfo);
        var healthInfo = _healthInfo.GetOrAdd(key, k => new ConnectionHealthInfo
        {
            ConnectionInfo = connectionInfo,
            LastHealthCheck = DateTime.UtcNow
        });
        try
        {
            using var connection = new NpgsqlConnection(connectionInfo.ConnectionString);
            await connection.OpenAsync(cancellationToken);
            // Perform health check query
            using var cmd = connection.CreateCommand();
            cmd.CommandText = "SELECT 1 as health_check, current_database() as database";
            cmd.CommandTimeout = 5;
            using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            await reader.ReadAsync(cancellationToken);
            var healthCheck = reader.GetInt32(0);
            var database = reader.GetString(1);
            // Update health info
            healthInfo.IsHealthy = true;
            healthInfo.LastHealthCheck = DateTime.UtcNow;
            healthInfo.LastSuccessAt = DateTime.UtcNow;
            healthInfo.ConsecutiveFailures = 0;
            healthInfo.TotalChecks++;
            healthInfo.ResponseTime = DateTime.UtcNow - healthInfo.LastHealthCheck;
            _logger.LogDebug("Connection {ConnectionKey} is healthy (database: {Database})", key, database);
            return true;
        }
        catch (Exception ex)
        {
            // Update failure info
            healthInfo.IsHealthy = false;
            healthInfo.LastHealthCheck = DateTime.UtcNow;
            healthInfo.LastFailureAt = DateTime.UtcNow;
            healthInfo.ConsecutiveFailures++;
            healthInfo.TotalChecks++;
            healthInfo.TotalFailures++;
            healthInfo.LastError = ex.Message;
            _logger.LogWarning(ex, "Connection {ConnectionKey} health check failed (attempt {Attempt})",
                key, healthInfo.ConsecutiveFailures);
            return false;
        }
    }
    public ConnectionHealthInfo GetConnectionHealth(string connectionKey)
    {
        return _healthInfo.GetOrAdd(connectionKey, key => new ConnectionHealthInfo
        {
            ConnectionInfo = new ConnectionInfo { Name = "Unknown" },
            LastHealthCheck = DateTime.UtcNow
        });
    }
    public Dictionary<string, ConnectionHealthInfo> GetAllHealthInfo()
    {
        return new Dictionary<string, ConnectionHealthInfo>(_healthInfo);
    }
    private void MonitoringCallback(object state)
    {
        Task.Run(PerformMonitoringAsync);
    }
    private async Task PerformMonitoringAsync()
    {
        var monitoringTasks = _healthInfo.Values
            .Where(h => !h.IsHealthy || h.ConsecutiveFailures > 0)
            .Select(async healthInfo =>
            {
                try
                {
                    await CheckConnectionHealthAsync(healthInfo.ConnectionInfo);
                    // If connection recovered, log the recovery
                    if (healthInfo.IsHealthy && healthInfo.ConsecutiveFailures > 0)
                    {
                        _logger.LogInformation(
                            "Connection {ConnectionKey} recovered after {FailureCount} failures",
                            GetConnectionKey(healthInfo.ConnectionInfo), healthInfo.ConsecutiveFailures);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error during health monitoring for {ConnectionKey}",
                        GetConnectionKey(healthInfo.ConnectionInfo));
                }
            });
        await Task.WhenAll(monitoringTasks);
        // Log summary if there are unhealthy connections
        var unhealthyCount = _healthInfo.Count(h => !h.Value.IsHealthy);
        if (unhealthyCount > 0)
        {
            _logger.LogWarning("Health monitoring completed: {UnhealthyCount}/{TotalCount} connections unhealthy",
                unhealthyCount, _healthInfo.Count);
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
            _monitoringTimer?.Dispose();
            _healthInfo.Clear();
            _logger.LogInformation("Connection health monitor disposed");
        }
    }
}
public class ConnectionHealthInfo
{
    public ConnectionInfo ConnectionInfo { get; set; } = new();
    public DateTime LastHealthCheck { get; set; }
    public bool IsHealthy { get; set; }
    public int ConsecutiveFailures { get; set; }
    public int TotalChecks { get; set; }
    public int TotalFailures { get; set; }
    public DateTime? LastSuccessAt { get; set; }
    public DateTime? LastFailureAt { get; set; }
    public string? LastError { get; set; }
    public TimeSpan ResponseTime { get; set; }
    public double AverageResponseTime { get; set; }
}