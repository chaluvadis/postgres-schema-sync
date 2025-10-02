namespace PostgreSqlSchemaCompareSync.Core.Connection.Pool;

public class ConnectionPool : IDisposable, IAsyncDisposable
{
    private readonly ConnectionSettings _settings;
    private readonly ILogger<ConnectionPool> _logger;
    private readonly SemaphoreSlim _poolSemaphore;
    private readonly SemaphoreSlim _timerSemaphore;
    private readonly ConcurrentBag<PooledConnection> _connections;
    private readonly ConcurrentDictionary<string, ConnectionStats> _connectionStats;
    private readonly Timer _healthCheckTimer;
    private readonly Timer _cleanupTimer;
    private bool _disposed;

    public ConnectionPool(
        IOptions<AppSettings> settings,
        ILogger<ConnectionPool> logger)
    {
        _settings = settings.Value.Connection;
        _logger = logger;
        _poolSemaphore = new(_settings.ConnectionPoolSize);
        _timerSemaphore = new(1);
        _connections = [];
        _connectionStats = new();
        _healthCheckTimer = new(
            HealthCheckCallback,
            null,
            TimeSpan.FromSeconds(_settings.HealthCheckInterval),
            TimeSpan.FromSeconds(_settings.HealthCheckInterval));
        _cleanupTimer = new(
            CleanupCallback,
            null,
            TimeSpan.FromMinutes(5),
            TimeSpan.FromMinutes(5));
        _logger.LogInformation(
            "Connection pool initialized with max size {MaxPoolSize}, health check interval {HealthCheckInterval}s",
            _settings.ConnectionPoolSize, _settings.HealthCheckInterval);
    }

    public static async Task<ConnectionPool> CreateAsync(
        IOptions<AppSettings> settings,
        ILogger<ConnectionPool> logger)
    {
        var pool = new ConnectionPool(settings, logger);
        await pool.InitializePoolAsync();
        return pool;
    }

    private async Task InitializePoolAsync()
    {
        var tasks = Enumerable.Range(0, _settings.ConnectionPoolSize)
            .Select(_ => CreateNewConnectionAsync().ContinueWith(t =>
            {
                if (t.Exception != null)
                    _logger.LogWarning(t.Exception, "Failed to initialize connection in pool");
                else
                    _connections.Add(t.Result);
            }));
        await Task.WhenAll(tasks);
        _logger.LogInformation("Connection pool initialization completed");
    }

    public async Task<PooledConnection> AcquireConnectionAsync(
        ConnectionInfo connectionInfo,
        CancellationToken cancellationToken = default)
    {
        var statsKey = GetStatsKey(connectionInfo);
        _connectionStats.AddOrUpdate(statsKey,
            _ => new ConnectionStats { AcquiredCount = 1 },
            (_, stats) =>
            {
                stats.AcquiredCount++;
                stats.LastAcquiredAt = DateTime.UtcNow;
                return stats;
            });

        await _poolSemaphore.WaitAsync(cancellationToken);
        try
        {
            if (_connections.TryTake(out var pooledConnection))
            {
                if (await IsConnectionHealthyAsync(pooledConnection.Connection))
                {
                    pooledConnection.LastAcquiredAt = DateTime.UtcNow;
                    pooledConnection.AcquiredCount++;
                    _logger.LogDebug("Acquired healthy connection {ConnectionId} from pool", pooledConnection.Id);
                    return pooledConnection;
                }
                await pooledConnection.Connection.DisposeAsync();
                _logger.LogWarning("Removed unhealthy connection {ConnectionId} from pool", pooledConnection.Id);
            }
            var newConnection = await CreateNewConnectionAsync(connectionInfo);
            _logger.LogDebug("Created new connection {ConnectionId} for acquisition", newConnection.Id);
            return newConnection;
        }
        catch (Exception ex)
        {
            _poolSemaphore.Release();
            _logger.LogError(ex, "Failed to acquire connection for {Database}", connectionInfo.Database);
            throw;
        }
    }

    public async Task ReleaseConnectionAsync(PooledConnection connection)
    {
        try
        {
            if (connection.IsHealthy && !connection.IsExpired)
            {
                _connections.Add(connection);
                _poolSemaphore.Release();
                _logger.LogDebug("Released healthy connection {ConnectionId} back to pool", connection.Id);
            }
            else
            {
                await connection.Connection.DisposeAsync();
                _logger.LogWarning("Disposed unhealthy/expired connection {ConnectionId}", connection.Id);
                _ = Task.Run(async () =>
                {
                    try
                    {
                        var replacement = await CreateNewConnectionAsync();
                        _connections.Add(replacement);
                        _logger.LogDebug("Created replacement connection {ConnectionId}", replacement.Id);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to create replacement connection");
                    }
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error releasing connection {ConnectionId}", connection.Id);
        }
    }

    private async Task<PooledConnection> CreateNewConnectionAsync(ConnectionInfo? connectionInfo = null)
    {
        var connection = new NpgsqlConnection(connectionInfo?.ConnectionString ?? "Host=localhost;Database=postgres");
        await connection.OpenAsync();
        var pooledConnection = new PooledConnection
        {
            Id = Guid.NewGuid().ToString(),
            Connection = connection,
            CreatedAt = DateTime.UtcNow,
            LastAcquiredAt = DateTime.UtcNow,
            AcquiredCount = 0,
            IsHealthy = true
        };
        _logger.LogDebug("Created new pooled connection {ConnectionId}", pooledConnection.Id);
        return pooledConnection;
    }

    private async Task<bool> IsConnectionHealthyAsync(NpgsqlConnection connection)
    {
        try
        {
            if (connection.State != System.Data.ConnectionState.Open)
                return false;
            using var cmd = connection.CreateCommand();
            cmd.CommandText = "SELECT 1";
            cmd.CommandTimeout = 5;
            await cmd.ExecuteScalarAsync();
            return true;
        }
        catch
        {
            return false;
        }
    }

    private void HealthCheckCallback(object? state)
    {
        if (_disposed) return;
        Task.Run(async () =>
        {
            await _timerSemaphore.WaitAsync();
            try
            {
                await PerformHealthCheckAsync();
            }
            finally
            {
                _timerSemaphore.Release();
            }
        });
    }

    private async Task PerformHealthCheckAsync()
    {
        var unhealthyConnections = new List<PooledConnection>();
        var healthyConnections = new List<PooledConnection>();
        while (_connections.TryTake(out var connection))
        {
            if (await IsConnectionHealthyAsync(connection.Connection))
            {
                connection.IsHealthy = true;
                healthyConnections.Add(connection);
            }
            else
            {
                connection.IsHealthy = false;
                unhealthyConnections.Add(connection);
            }
        }
        foreach (var healthyConnection in healthyConnections)
            _connections.Add(healthyConnection);

        foreach (var unhealthyConnection in unhealthyConnections)
        {
            await unhealthyConnection.Connection.DisposeAsync();
            try
            {
                var replacement = await CreateNewConnectionAsync();
                _connections.Add(replacement);
                _logger.LogDebug("Replaced unhealthy connection {ConnectionId} with {ReplacementId}",
                    unhealthyConnection.Id, replacement.Id);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to create replacement for unhealthy connection {ConnectionId}",
                    unhealthyConnection.Id);
            }
        }
        if (unhealthyConnections.Count > 0)
        {
            _logger.LogInformation("Health check completed: {HealthyCount} healthy, {UnhealthyCount} unhealthy connections",
                healthyConnections.Count, unhealthyConnections.Count);
        }
    }

    private void CleanupCallback(object? state)
    {
        if (_disposed) return;
        Task.Run(async () =>
        {
            await _timerSemaphore.WaitAsync();
            try
            {
                await PerformCleanupAsync();
            }
            finally
            {
                _timerSemaphore.Release();
            }
        });
    }

    private async Task PerformCleanupAsync()
    {
        var expiredConnections = new List<PooledConnection>();
        var now = DateTime.UtcNow;
        while (_connections.TryTake(out var connection))
        {
            if (now - connection.LastAcquiredAt > TimeSpan.FromMinutes(30))
                expiredConnections.Add(connection);
            else
                _connections.Add(connection);
        }
        foreach (var expiredConnection in expiredConnections)
        {
            await expiredConnection.Connection.DisposeAsync();
            _logger.LogDebug("Cleaned up expired connection {ConnectionId}", expiredConnection.Id);
        }
        if (expiredConnections.Count > 0)
        {
            _logger.LogInformation("Cleanup completed: removed {ExpiredCount} expired connections",
                expiredConnections.Count);
        }
    }

    public ConnectionPoolStats GetStats()
    {
        var availableConnections = _connections.Count;
        var totalAcquired = _connectionStats.Sum(s => s.Value.AcquiredCount);
        return new ConnectionPoolStats
        {
            AvailableConnections = availableConnections,
            MaxPoolSize = _settings.ConnectionPoolSize,
            TotalAcquired = totalAcquired,
            ConnectionStats = _connectionStats.ToDictionary(kvp => kvp.Key, kvp => kvp.Value)
        };
    }

    private string GetStatsKey(ConnectionInfo connectionInfo)
        => $"{connectionInfo.Host}:{connectionInfo.Port}:{connectionInfo.Database}";

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        _healthCheckTimer?.Dispose();
        _cleanupTimer?.Dispose();
        _poolSemaphore?.Dispose();
        _timerSemaphore?.Dispose();
        _ = DisposeAllConnectionsAsync();
        _logger.LogInformation("Connection pool disposed");
    }

    public async ValueTask DisposeAsync()
    {
        if (_disposed) return;
        _disposed = true;
        _healthCheckTimer?.Dispose();
        _cleanupTimer?.Dispose();
        _poolSemaphore?.Dispose();
        _timerSemaphore?.Dispose();
        await DisposeAllConnectionsAsync();
        _logger.LogInformation("Connection pool disposed");
    }

    private async Task DisposeAllConnectionsAsync()
    {
        var connections = new List<PooledConnection>();
        while (_connections.TryTake(out var connection))
            connections.Add(connection);

        if (connections.Count != 0)
        {
            var disposeTasks = connections.Select(conn => conn.Connection.DisposeAsync().AsTask());
            await Task.WhenAll(disposeTasks);
            _logger.LogInformation("Disposed {ConnectionCount} connections", connections.Count);
        }
    }
}