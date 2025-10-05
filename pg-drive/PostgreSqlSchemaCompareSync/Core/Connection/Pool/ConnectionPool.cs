namespace PostgreSqlSchemaCompareSync.Core.Connection.Pool
{
    /// <summary>
    /// Advanced connection pool for PostgreSQL connections
    /// </summary>
    public class ConnectionPool : IDisposable
    {
        private readonly ILogger<ConnectionPool> _logger;
        private readonly AppSettings _settings;
        private readonly ConcurrentDictionary<string, ConcurrentBag<NpgsqlConnection>> _pools;
        private readonly SemaphoreSlim _poolLock;
        private bool _disposed;

        public ConnectionPool(
            ILogger<ConnectionPool> logger,
            IOptions<AppSettings> settings)
        {
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
            _settings = settings?.Value ?? throw new ArgumentNullException(nameof(settings));
            _pools = new ConcurrentDictionary<string, ConcurrentBag<NpgsqlConnection>>();
            _poolLock = new SemaphoreSlim(1, 1);
        }

        /// <summary>
        /// Gets a connection from the pool or creates a new one
        /// </summary>
        public async Task<NpgsqlConnection> GetConnectionAsync(
            ConnectionInfo connectionInfo,
            CancellationToken cancellationToken = default)
        {
            if (connectionInfo == null)
                throw new ArgumentNullException(nameof(connectionInfo));

            var poolKey = GetPoolKey(connectionInfo);

            // Try to get an existing connection from the pool
            if (_pools.TryGetValue(poolKey, out var pool) &&
                pool.TryTake(out var connection) &&
                IsConnectionValid(connection))
            {
                _logger.LogDebug("Reused connection from pool for {Database}", connectionInfo.Database);
                return connection;
            }

            // Create a new connection if pool is empty or all connections are invalid
            var newConnection = await CreateNewConnectionAsync(connectionInfo, cancellationToken);
            _logger.LogDebug("Created new connection for {Database}", connectionInfo.Database);

            return newConnection;
        }

        /// <summary>
        /// Returns a connection to the pool
        /// </summary>
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

        /// <summary>
        /// Clears all connections from the pool
        /// </summary>
        public void ClearPool(ConnectionInfo connectionInfo)
        {
            if (connectionInfo == null)
                return;

            var poolKey = GetPoolKey(connectionInfo);

            if (_pools.TryRemove(poolKey, out var pool))
            {
                while (pool.TryTake(out var connection))
                {
                    connection.Dispose();
                }

                _logger.LogInformation("Cleared connection pool for {Database}", connectionInfo.Database);
            }
        }

        /// <summary>
        /// Gets pool statistics
        /// </summary>
        public ConnectionStats GetStats(ConnectionInfo connectionInfo)
        {
            var poolKey = GetPoolKey(connectionInfo);

            if (_pools.TryGetValue(poolKey, out var pool))
            {
                return new ConnectionStats
                {
                    PoolKey = poolKey,
                    ActiveConnections = pool.Count,
                    MaxPoolSize = _settings.Connection.MaxPoolSize,
                    CreatedAt = DateTime.UtcNow
                };
            }

            return new ConnectionStats
            {
                PoolKey = poolKey,
                ActiveConnections = 0,
                MaxPoolSize = _settings.Connection.MaxPoolSize,
                CreatedAt = DateTime.UtcNow
            };
        }

        /// <summary>
        /// Creates a new database connection
        /// </summary>
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

        /// <summary>
        /// Checks if a connection is still valid
        /// </summary>
        private bool IsConnectionValid(NpgsqlConnection connection)
        {
            try
            {
                return connection != null &&
                       connection.State == System.Data.ConnectionState.Open &&
                       connection.FullState == System.Data.ConnectionState.Open;
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
}