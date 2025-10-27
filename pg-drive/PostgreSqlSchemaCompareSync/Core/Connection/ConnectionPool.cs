namespace PostgreSqlSchemaCompareSync.Core.Connection;

/// <summary>
/// Statistics about the connection pool
/// </summary>
public class ConnectionPoolStats
{
    public int TotalConnections { get; set; }
    public int PoolCount { get; set; }
    public int MaxPoolSize { get; set; }
    public double UtilizationPercentage => MaxPoolSize > 0 ? (TotalConnections * 100.0) / MaxPoolSize : 0;
}

public class ConnectionPool : IDisposable
{
    private readonly ILogger<ConnectionPool> _logger;
    private readonly ConnectionSettings _settings;
    private readonly ConnectionStringBuilder _connectionStringBuilder;
    private readonly ConnectionValidator _connectionValidator;
    private readonly ConcurrentDictionary<string, ConcurrentBag<NpgsqlConnection>> _pools = new();
    private readonly Timer? _cleanupTimer = null;
    private bool _disposed;

    internal bool IsDisposed => _disposed;

    public ConnectionPool(
        ILogger<ConnectionPool> logger,
        IOptions<AppSettings> settings,
        ConnectionStringBuilder connectionStringBuilder,
        ConnectionValidator connectionValidator)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _settings = settings?.Value?.Connection ?? throw new ArgumentNullException(nameof(settings));
        _connectionStringBuilder = connectionStringBuilder ?? throw new ArgumentNullException(nameof(connectionStringBuilder));
        _connectionValidator = connectionValidator ?? throw new ArgumentNullException(nameof(connectionValidator));

        // Timer initialization can be added later if needed
        // _cleanupTimer = new Timer(CleanupCallback, null, TimeSpan.FromMinutes(5), TimeSpan.FromMinutes(5));
    }
    public async Task<NpgsqlConnection> GetConnectionAsync(
        ConnectionInfo connectionInfo,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(connectionInfo);

        var poolKey = GetPoolKey(connectionInfo);

        // Try to get a valid connection from the pool
        if (_pools.TryGetValue(poolKey, out var pool))
        {
            while (pool.TryTake(out var connection))
            {
                if (_connectionValidator.IsValid(connection))
                {
                    _logger.LogDebug("Reused connection from pool for {Database}", connectionInfo.Database);
                    return connection;
                }
                else
                {
                    // Dispose invalid connection
                    await connection.DisposeAsync();
                    _logger.LogDebug("Disposed invalid connection from pool for {Database}", connectionInfo.Database);
                }
            }
        }

        // Create new connection if none available or valid
        var newConnection = await CreateNewConnectionAsync(connectionInfo, cancellationToken);
        _logger.LogDebug("Created new connection for {Database}", connectionInfo.Database);
        return newConnection;
    }

    public void ReturnConnection(ConnectionInfo connectionInfo, NpgsqlConnection connection)
    {
        if (connectionInfo == null || connection == null)
            return;

        try
        {
            if (_connectionValidator.IsValid(connection) && !_disposed)
            {
                var poolKey = GetPoolKey(connectionInfo);
                var pool = _pools.GetOrAdd(poolKey, _ => []);

                // Enforce pool size limits
                if (pool.Count < _settings.MaxPoolSize)
                {
                    pool.Add(connection);
                    _logger.LogDebug("Returned connection to pool for {Database}", connectionInfo.Database);
                }
                else
                {
                    // Pool is full, close the connection
                    connection.Dispose();
                    _logger.LogDebug("Pool full, disposed connection for {Database}", connectionInfo.Database);
                }
            }
            else
            {
                // Connection is invalid, dispose it
                connection.Dispose();
                _logger.LogDebug("Disposed invalid connection for {Database}", connectionInfo.Database);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error returning connection to pool for {Database}", connectionInfo.Database);
            connection.Dispose();
        }
    }
    private async Task<NpgsqlConnection> CreateNewConnectionAsync(
        ConnectionInfo connectionInfo,
        CancellationToken cancellationToken)
    {
        var connectionString = _connectionStringBuilder.Build(connectionInfo);
        var connection = new NpgsqlConnection(connectionString);

        try
        {
            await connection.OpenAsync(cancellationToken);
            return connection;
        }
        catch (Exception)
        {
            await connection.DisposeAsync();
            throw;
        }
    }

    /// <summary>
    /// Generates a unique pool key for the connection
    /// </summary>
    private static string GetPoolKey(ConnectionInfo connectionInfo) => $"{connectionInfo.Host}:{connectionInfo.Port}:{connectionInfo.Database}:{connectionInfo.Username}";

    /// <summary>
    /// Timer callback for periodic cleanup of invalid connections
    /// </summary>
    private void CleanupCallback(object? state)
    {
        if (_disposed)
            return;

        try
        {
            CleanupInvalidConnectionsAsync().GetAwaiter().GetResult();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error during connection pool cleanup");
        }
    }

    /// <summary>
    /// Manually trigger cleanup of invalid connections from all pools
    /// </summary>
    public async Task CleanupInvalidConnectionsAsync()
    {
        var cleanedCount = 0;
        var disposedCount = 0;

        foreach (var (poolKey, pool) in _pools)
        {
            var validConnections = new List<NpgsqlConnection>();

            while (pool.TryTake(out var connection))
            {
                if (_connectionValidator.IsValid(connection))
                {
                    validConnections.Add(connection);
                }
                else
                {
                    await connection.DisposeAsync();
                    disposedCount++;
                }
            }

            // Return valid connections to pool
            foreach (var connection in validConnections)
            {
                if (pool.Count < _settings.MaxPoolSize)
                {
                    pool.Add(connection);
                    cleanedCount++;
                }
                else
                {
                    await connection.DisposeAsync();
                    disposedCount++;
                }
            }
        }

        if (cleanedCount > 0 || disposedCount > 0)
        {
            _logger.LogInformation(
                "Connection pool cleanup completed: {CleanedCount} connections cleaned, {DisposedCount} connections disposed",
                cleanedCount, disposedCount);
        }
    }

    /// <summary>
    /// Gets statistics about the connection pool
    /// </summary>
    public ConnectionPoolStats GetPoolStats()
    {
        var totalConnections = 0;
        var poolCount = 0;

        foreach (var pool in _pools.Values)
        {
            totalConnections += pool.Count;
            poolCount++;
        }

        return new ConnectionPoolStats
        {
            TotalConnections = totalConnections,
            PoolCount = poolCount,
            MaxPoolSize = _settings.MaxPoolSize
        };
    }

    public void Dispose()
    {
        if (!_disposed)
        {
            _cleanupTimer?.Dispose();

            foreach (var pool in _pools.Values)
            {
                while (pool.TryTake(out var connection))
                {
                    connection.Dispose();
                }
            }

            _pools.Clear();
            _disposed = true;

            _logger.LogInformation("ConnectionPool disposed");
        }
    }
}