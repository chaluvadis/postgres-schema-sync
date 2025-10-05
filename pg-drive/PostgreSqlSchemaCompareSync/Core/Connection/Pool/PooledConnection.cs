namespace PostgreSqlSchemaCompareSync.Core.Connection.Pool
{
    /// <summary>
    /// Wrapper for pooled database connections with lifecycle management
    /// </summary>
    public class PooledConnection : IDisposable, IAsyncDisposable
    {
        private readonly ConnectionInfo _connectionInfo;
        private readonly ConnectionPool _pool;
        private readonly ILogger<PooledConnection> _logger;
        private NpgsqlConnection? _connection;
        private bool _disposed;

        public PooledConnection(
            ConnectionInfo connectionInfo,
            ConnectionPool pool,
            ILogger<PooledConnection> logger)
        {
            _connectionInfo = connectionInfo ?? throw new ArgumentNullException(nameof(connectionInfo));
            _pool = pool ?? throw new ArgumentNullException(nameof(pool));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        /// <summary>
        /// Gets the underlying database connection
        /// </summary>
        public NpgsqlConnection Connection
        {
            get
            {
                if (_connection == null)
                    throw new InvalidOperationException("Connection not initialized. Call OpenAsync first.");

                if (_disposed)
                    throw new ObjectDisposedException(nameof(PooledConnection));

                return _connection;
            }
        }

        /// <summary>
        /// Opens the connection from the pool
        /// </summary>
        public async Task OpenAsync(CancellationToken cancellationToken = default)
        {
            if (_disposed)
                throw new ObjectDisposedException(nameof(PooledConnection));

            if (_connection != null)
                throw new InvalidOperationException("Connection already opened");

            try
            {
                _connection = await _pool.GetConnectionAsync(_connectionInfo, cancellationToken);
                _logger.LogDebug("Pooled connection opened for {Database}", _connectionInfo.Database);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to open pooled connection for {Database}", _connectionInfo.Database);
                throw;
            }
        }

        /// <summary>
        /// Closes the connection and returns it to the pool
        /// </summary>
        public void Close()
        {
            if (_disposed || _connection == null)
                return;

            try
            {
                _pool.ReturnConnection(_connectionInfo, _connection);
                _connection = null;
                _logger.LogDebug("Pooled connection closed for {Database}", _connectionInfo.Database);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error closing pooled connection for {Database}", _connectionInfo.Database);
                _connection?.Dispose();
                _connection = null;
            }
        }

        public void Dispose()
        {
            if (!_disposed)
            {
                Close();
                _disposed = true;
                _logger.LogDebug("PooledConnection disposed for {Database}", _connectionInfo.Database);
            }
        }

        public ValueTask DisposeAsync()
        {
            if (!_disposed)
            {
                Close();
                _disposed = true;
                _logger.LogDebug("PooledConnection disposed async for {Database}", _connectionInfo.Database);
            }

            return ValueTask.CompletedTask;
        }
    }
}