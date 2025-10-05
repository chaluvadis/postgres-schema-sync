namespace PostgreSqlSchemaCompareSync.Core.Connection.Pool;

public class ConnectionPool(
    ILogger<ConnectionPool> logger,
    IOptions<AppSettings> settings) : IDisposable
{
    private readonly ILogger<ConnectionPool> _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    private readonly AppSettings _settings = settings?.Value ?? throw new ArgumentNullException(nameof(settings));
    private readonly ConcurrentDictionary<string, ConcurrentBag<NpgsqlConnection>> _pools = new ConcurrentDictionary<string, ConcurrentBag<NpgsqlConnection>>();
    private readonly SemaphoreSlim _poolLock = new SemaphoreSlim(1, 1);
    private bool _disposed;
    public async Task<NpgsqlConnection> GetConnectionAsync(
        ConnectionInfo connectionInfo,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(connectionInfo);

        var poolKey = GetPoolKey(connectionInfo);

        if (_pools.TryGetValue(poolKey, out var pool) &&
            pool.TryTake(out var connection) &&
            IsConnectionValid(connection))
        {
            _logger.LogDebug("Reused connection from pool for {Database}", connectionInfo.Database);
            return connection;
        }

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
            if (IsConnectionValid(connection) && !_disposed)
            {
                var poolKey = GetPoolKey(connectionInfo);
                var pool = _pools.GetOrAdd(poolKey, _ => []);

                // Enforce pool size limits
                if (pool.Count < _settings.Connection.MaxPoolSize)
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
        var connectionString = BuildConnectionString(connectionInfo);
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
    private bool IsConnectionValid(NpgsqlConnection connection)
    {
        try
        {
            return connection != null &&
                   connection.State == ConnectionState.Open &&
                   connection.FullState == ConnectionState.Open;
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Connection validation failed");
            return false;
        }
    }

    /// <summary>
    /// Builds a connection string from connection info
    /// </summary>
    private string BuildConnectionString(ConnectionInfo connectionInfo)
    {
        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = connectionInfo.Host,
            Port = connectionInfo.Port,
            Database = connectionInfo.Database,
            Username = connectionInfo.Username,
            Password = connectionInfo.Password,
            Pooling = true,
            MinPoolSize = _settings.Connection.MinPoolSize,
            MaxPoolSize = _settings.Connection.MaxPoolSize,
            Timeout = _settings.Connection.ConnectionTimeout,
            CommandTimeout = _settings.Connection.CommandTimeout
        };

        return builder.ConnectionString;
    }

    /// <summary>
    /// Generates a unique pool key for the connection
    /// </summary>
    private string GetPoolKey(ConnectionInfo connectionInfo)
    {
        return $"{connectionInfo.Host}:{connectionInfo.Port}:{connectionInfo.Database}:{connectionInfo.Username}";
    }

    public void Dispose()
    {
        if (!_disposed)
        {
            _poolLock.Dispose();

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