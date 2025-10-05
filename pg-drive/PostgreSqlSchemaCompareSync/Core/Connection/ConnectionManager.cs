namespace PostgreSqlSchemaCompareSync.Core.Connection
{
    /// <summary>
    /// Manages database connections with pooling and health monitoring
    /// </summary>
    public class ConnectionManager : IConnectionManager
    {
        private readonly ILogger<ConnectionManager> _logger;
        private readonly AppSettings _settings;
        private readonly ConnectionPool _connectionPool;
        private bool _disposed;
        public ConnectionManager(
            ILogger<ConnectionManager> logger,
            IOptions<AppSettings> settings,
            ConnectionPool connectionPool)
        {
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
            _settings = settings?.Value ?? throw new ArgumentNullException(nameof(settings));
            _connectionPool = connectionPool ?? throw new ArgumentNullException(nameof(connectionPool));
        }
        /// <summary>
        /// Creates a new database connection
        /// </summary>
        public async Task<NpgsqlConnection> CreateConnectionAsync(
            ConnectionInfo connectionInfo,
            CancellationToken cancellationToken = default)
        {
            if (connectionInfo == null)
                throw new ArgumentNullException(nameof(connectionInfo));
            try
            {
                _logger.LogDebug("Creating connection to {Database}", connectionInfo.Database);
                var connectionString = BuildConnectionString(connectionInfo);
                var connection = new NpgsqlConnection(connectionString);
                await connection.OpenAsync(cancellationToken);
                _logger.LogInformation("Connection established to {Database}", connectionInfo.Database);
                return connection;
            }
            catch (NpgsqlException ex)
            {
                _logger.LogError(ex, "Failed to create connection to {Database}", connectionInfo.Database);
                throw new ConnectionException($"Failed to connect to database: {ex.Message}", connectionInfo.Id, ex);
            }
            catch (OperationCanceledException)
            {
                _logger.LogWarning("Connection creation cancelled for {Database}", connectionInfo.Database);
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error creating connection to {Database}", connectionInfo.Database);
                throw new ConnectionException($"Unexpected error connecting to database: {ex.Message}", connectionInfo.Id, ex);
            }
        }
        /// <summary>
        /// Tests if a connection can be established
        /// </summary>
        public async Task<bool> TestConnectionAsync(
            ConnectionInfo connectionInfo,
            CancellationToken cancellationToken = default)
        {
            if (connectionInfo == null)
                throw new ArgumentNullException(nameof(connectionInfo));
            var stopwatch = Stopwatch.StartNew();
            try
            {
                _logger.LogDebug("Testing connection to {Database}", connectionInfo.Database);
                using var connection = await CreateConnectionAsync(connectionInfo, cancellationToken);
                // Test a simple query to ensure the database is responsive
                using var command = connection.CreateCommand();
                command.CommandText = "SELECT 1";
                command.CommandTimeout = Math.Min(_settings.Connection.CommandTimeout, 10);
                await command.ExecuteScalarAsync(cancellationToken);
                stopwatch.Stop();
                _logger.LogInformation("Connection test successful for {Database} in {Elapsed}ms",
                    connectionInfo.Database, stopwatch.ElapsedMilliseconds);
                return true;
            }
            catch (Exception ex)
            {
                stopwatch.Stop();
                _logger.LogError(ex, "Connection test failed for {Database} in {Elapsed}ms",
                    connectionInfo.Database, stopwatch.ElapsedMilliseconds);
                return false;
            }
        }
        /// <summary>
        /// Closes and disposes a connection
        /// </summary>
        public async Task CloseConnectionAsync(
            NpgsqlConnection connection,
            CancellationToken cancellationToken = default)
        {
            if (connection == null)
                throw new ArgumentNullException(nameof(connection));
            try
            {
                if (connection.State != System.Data.ConnectionState.Closed)
                {
                    await connection.CloseAsync();
                }
                await connection.DisposeAsync();
                _logger.LogDebug("Connection closed and disposed");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error closing connection");
                // Don't throw - closing errors shouldn't prevent disposal
            }
        }
        /// <summary>
        /// Gets connection health status
        /// </summary>
        public async Task<ConnectionHealthStatus> GetConnectionHealthAsync(
            ConnectionInfo connectionInfo,
            CancellationToken cancellationToken = default)
        {
            if (connectionInfo == null)
                throw new ArgumentNullException(nameof(connectionInfo));
            var stopwatch = Stopwatch.StartNew();
            try
            {
                var isHealthy = await TestConnectionAsync(connectionInfo, cancellationToken);
                stopwatch.Stop();
                return new ConnectionHealthStatus
                {
                    IsHealthy = isHealthy,
                    ResponseTime = stopwatch.Elapsed,
                    LastChecked = DateTime.UtcNow,
                    ErrorMessage = isHealthy ? null : "Connection test failed"
                };
            }
            catch (Exception ex)
            {
                stopwatch.Stop();
                return new ConnectionHealthStatus
                {
                    IsHealthy = false,
                    ResponseTime = stopwatch.Elapsed,
                    LastChecked = DateTime.UtcNow,
                    ErrorMessage = ex.Message
                };
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
                Timeout = _settings.Connection.ConnectionTimeout,
                CommandTimeout = _settings.Connection.CommandTimeout,
                Pooling = true,
                MinPoolSize = _settings.Connection.MinPoolSize,
                MaxPoolSize = _settings.Connection.MaxPoolSize
            };
            return builder.ConnectionString;
        }
        public void Dispose()
        {
            if (!_disposed)
            {
                _connectionPool?.Dispose();
                _disposed = true;
                _logger.LogInformation("ConnectionManager disposed");
            }
        }
    }
}