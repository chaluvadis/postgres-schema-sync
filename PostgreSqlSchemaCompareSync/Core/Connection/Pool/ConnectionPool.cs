namespace PostgreSqlSchemaCompareSync.Core.Connection.Pool;

public class ConnectionPool : IDisposable
{
    private readonly ConnectionSettings _settings;
    private readonly ILogger<ConnectionPool> _logger;
    private readonly SemaphoreSlim _poolSemaphore;
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
        _poolSemaphore = new SemaphoreSlim(_settings.ConnectionPoolSize);
        _connections = [];
        _connectionStats = new ConcurrentDictionary<string, ConnectionStats>();
        // Initialize connection pool
        InitializePoolAsync().GetAwaiter().GetResult();
        // Start background health monitoring
        _healthCheckTimer = new Timer(
            HealthCheckCallback,
            null,
            TimeSpan.FromSeconds(_settings.HealthCheckInterval),
            TimeSpan.FromSeconds(_settings.HealthCheckInterval));
        // Cleanup timer for removing stale connections
        _cleanupTimer = new Timer(
            CleanupCallback,
            null,
            TimeSpan.FromMinutes(5),
            TimeSpan.FromMinutes(5));
        _logger.LogInformation(
            "Connection pool initialized with max size {MaxPoolSize}, health check interval {HealthCheckInterval}s",
            _settings.ConnectionPoolSize, _settings.HealthCheckInterval);
    }
    private async Task InitializePoolAsync()
    {
        var initializationTasks = Enumerable.Range(0, _settings.ConnectionPoolSize)
            .Select(async i =>
            {
                try
                {
                    var connection = await CreateNewConnectionAsync();
                    _connections.Add(connection);
                    _logger.LogDebug("Initialized connection {ConnectionId} in pool", connection.Id);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to initialize connection {ConnectionIndex} in pool", i);
                }
            });
        await Task.WhenAll(initializationTasks);
        _logger.LogInformation("Connection pool initialization completed");
    }
    public async Task<PooledConnection> AcquireConnectionAsync(
        ConnectionInfo connectionInfo,
        CancellationToken cancellationToken = default)
    {
        var statsKey = GetStatsKey(connectionInfo);
        // Update stats
        _connectionStats.AddOrUpdate(statsKey,
            key => new ConnectionStats { AcquiredCount = 1 },
            (key, stats) =>
            {
                stats.AcquiredCount++;
                stats.LastAcquiredAt = DateTime.UtcNow;
                return stats;
            });
        // Wait for available slot in pool
        await _poolSemaphore.WaitAsync(cancellationToken);
        try
        {
            // Try to get a healthy connection from the pool
            if (_connections.TryTake(out var pooledConnection))
            {
                if (await IsConnectionHealthyAsync(pooledConnection.Connection))
                {
                    pooledConnection.LastAcquiredAt = DateTime.UtcNow;
                    pooledConnection.AcquiredCount++;
                    _logger.LogDebug("Acquired healthy connection {ConnectionId} from pool", pooledConnection.Id);
                    return pooledConnection;
                }
                else
                {
                    // Connection is unhealthy, dispose it
                    await pooledConnection.Connection.DisposeAsync();
                    _logger.LogWarning("Removed unhealthy connection {ConnectionId} from pool", pooledConnection.Id);
                }
            }
            // No healthy connection available, create new one
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
    public void ReleaseConnection(PooledConnection connection)
    {
        try
        {
            if (connection.IsHealthy && !connection.IsExpired)
            {
                // Return healthy connection to pool
                _connections.Add(connection);
                _poolSemaphore.Release();
                _logger.LogDebug("Released healthy connection {ConnectionId} back to pool", connection.Id);
            }
            else
            {
                // Dispose unhealthy or expired connection
                connection.Connection.DisposeAsync().GetAwaiter().GetResult();
                // Create replacement connection in background
                Task.Run(async () =>
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
                _logger.LogWarning("Disposed unhealthy/expired connection {ConnectionId}", connection.Id);
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
            // Quick health check query
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
        Task.Run(PerformHealthCheckAsync);
    }
    private async Task PerformHealthCheckAsync()
    {
        var unhealthyConnections = new List<PooledConnection>();
        var healthyConnections = new List<PooledConnection>();
        // Check all connections in pool
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
        // Return healthy connections to pool
        foreach (var healthyConnection in healthyConnections)
        {
            _connections.Add(healthyConnection);
        }
        // Dispose unhealthy connections and create replacements
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
        if (unhealthyConnections.Count != 0)
        {
            _logger.LogInformation("Health check completed: {HealthyCount} healthy, {UnhealthyCount} unhealthy connections",
                healthyConnections.Count, unhealthyConnections.Count);
        }
    }
    private void CleanupCallback(object? state)
    {
        Task.Run(PerformCleanupAsync);
    }
    private async Task PerformCleanupAsync()
    {
        var expiredConnections = new List<PooledConnection>();
        var now = DateTime.UtcNow;
        // Find expired connections (not used for more than 30 minutes)
        while (_connections.TryTake(out var connection))
        {
            if (now - connection.LastAcquiredAt > TimeSpan.FromMinutes(30))
            {
                expiredConnections.Add(connection);
            }
            else
            {
                _connections.Add(connection);
            }
        }
        // Dispose expired connections
        foreach (var expiredConnection in expiredConnections)
        {
            await expiredConnection.Connection.DisposeAsync();
            _logger.LogDebug("Cleaned up expired connection {ConnectionId}", expiredConnection.Id);
        }
        if (expiredConnections.Count != 0)
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
        if (!_disposed)
        {
            _disposed = true;
            _healthCheckTimer?.Dispose();
            _cleanupTimer?.Dispose();
            _poolSemaphore?.Dispose();
            // Dispose all connections
            while (_connections.TryTake(out var connection))
            {
                connection.Connection.DisposeAsync().GetAwaiter().GetResult();
            }
            _logger.LogInformation("Connection pool disposed");
        }
    }
}