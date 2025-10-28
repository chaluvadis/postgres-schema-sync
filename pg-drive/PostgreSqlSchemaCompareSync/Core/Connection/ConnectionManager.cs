namespace PostgreSqlSchemaCompareSync.Core.Connection
{
    /// <summary>
    /// Manages database connections with pooling and health monitoring
    /// </summary>
    public class ConnectionManager(
        ILogger<ConnectionManager> logger,
        IOptions<AppSettings> settings,
        ConnectionPool connectionPool,
        ConnectionStringBuilder connectionStringBuilder) : IConnectionManager
    {
        private readonly ILogger<ConnectionManager> _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        private readonly ConnectionSettings _settings = settings?.Value?.Connection ?? throw new ArgumentNullException(nameof(settings));
        private readonly ConnectionPool _connectionPool = connectionPool ?? throw new ArgumentNullException(nameof(connectionPool));
        private readonly ConnectionStringBuilder _connectionStringBuilder = connectionStringBuilder ?? throw new ArgumentNullException(nameof(connectionStringBuilder));
        private bool _disposed;

        public async Task<PooledConnectionHandle> CreateConnectionAsync(
            ConnectionInfo connectionInfo,
            CancellationToken ct = default)
        {
            ArgumentNullException.ThrowIfNull(connectionInfo);
            try
            {
                _logger.LogDebug("Creating connection to {Database} using {ConnectionInfo}",
                    connectionInfo.Database, connectionInfo.GetMaskedConnectionString());

                // Pre-connection validation
                ValidateConnectionInfo(connectionInfo);

                // Use connection pool for better resource management
                var connection = await _connectionPool.GetConnectionAsync(connectionInfo, ct);

                _logger.LogInformation("Connection established to {Database}", connectionInfo.Database);
                return new PooledConnectionHandle(_connectionPool, connectionInfo, connection, _logger);
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
            CancellationToken ct = default)
        {
            ArgumentNullException.ThrowIfNull(connectionInfo);
            var stopwatch = Stopwatch.StartNew();
            try
            {
                _logger.LogDebug("Testing connection to {Database}", connectionInfo.Database);
                await using var connectionHandle = await CreateConnectionAsync(connectionInfo, ct);
                var connection = connectionHandle.Connection;
                // Test a simple query to ensure the database is responsive
                using var command = connection.CreateCommand();
                command.CommandText = "SELECT 1";
                command.CommandTimeout = Math.Min(_settings.CommandTimeout, 10);
                await command.ExecuteScalarAsync(ct);
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
        public async Task CloseConnectionAsync(PooledConnectionHandle connection, CancellationToken ct = default)
        {
            ArgumentNullException.ThrowIfNull(connection);

            ct.ThrowIfCancellationRequested();
            await connection.DisposeAsync();
            _logger.LogDebug("Connection returned to pool");
        }
        /// <summary>
        /// Gets connection health status
        /// </summary>
        public async Task<ConnectionHealthStatus> GetConnectionHealthAsync(
            ConnectionInfo connectionInfo,
            CancellationToken ct = default)
        {
            ArgumentNullException.ThrowIfNull(connectionInfo);
            var stopwatch = Stopwatch.StartNew();
            try
            {
                var isHealthy = await TestConnectionAsync(connectionInfo, ct);
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
        /// Validates connection information before attempting to connect
        /// </summary>
        private void ValidateConnectionInfo(ConnectionInfo connectionInfo)
        {
            if (string.IsNullOrEmpty(connectionInfo.Host))
                throw new ConnectionException("Host is required", connectionInfo.Id);

            if (connectionInfo.Port <= 0 || connectionInfo.Port > 65535)
                throw new ConnectionException($"Invalid port number: {connectionInfo.Port}", connectionInfo.Id);

            if (string.IsNullOrEmpty(connectionInfo.Database))
                throw new ConnectionException("Database name is required", connectionInfo.Id);

            if (string.IsNullOrEmpty(connectionInfo.Username))
                throw new ConnectionException("Username is required", connectionInfo.Id);

            if (string.IsNullOrEmpty(connectionInfo.Password))
                throw new ConnectionException("Password is required", connectionInfo.Id);

            // Validate host format (basic check)
            if (connectionInfo.Host.Length > 255)
                throw new ConnectionException($"Host name too long: {connectionInfo.Host.Length} characters", connectionInfo.Id);

            // Check for suspicious characters in database name
            if (!IsValidDatabaseName(connectionInfo.Database))
                throw new ConnectionException($"Invalid database name: {connectionInfo.Database}", connectionInfo.Id);
        }

        /// <summary>
        /// Validates database name format
        /// </summary>
        private static bool IsValidDatabaseName(string databaseName)
        {
            if (string.IsNullOrEmpty(databaseName) || databaseName.Length > 63)
                return false;

            // PostgreSQL database name rules
            return databaseName.All(c =>
                char.IsLetterOrDigit(c) ||
                c == '_' ||
                c == '-' ||
                c == '.');
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