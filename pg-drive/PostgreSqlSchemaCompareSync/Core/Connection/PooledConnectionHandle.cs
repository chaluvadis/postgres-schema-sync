namespace PostgreSqlSchemaCompareSync.Core.Connection;

/// <summary>
/// Wraps an <see cref="NpgsqlConnection"/> so disposing the scope returns the connection to the pool.
/// </summary>
public sealed class PooledConnectionHandle : IAsyncDisposable, IDisposable
{
    private readonly ConnectionPool _connectionPool;
    private readonly ConnectionInfo _connectionInfo;
    private readonly ILogger _logger;
    private bool _disposed;

    public NpgsqlConnection Connection { get; }

    internal PooledConnectionHandle(ConnectionPool connectionPool, ConnectionInfo connectionInfo, NpgsqlConnection connection, ILogger logger)
    {
        _connectionPool = connectionPool ?? throw new ArgumentNullException(nameof(connectionPool));
        _connectionInfo = connectionInfo ?? throw new ArgumentNullException(nameof(connectionInfo));
        Connection = connection ?? throw new ArgumentNullException(nameof(connection));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public void Dispose()
    {
        DisposeAsyncCore().GetAwaiter().GetResult();
    }

    public ValueTask DisposeAsync()
    {
        return DisposeAsyncCore();
    }

    private ValueTask DisposeAsyncCore()
    {
        if (_disposed)
        {
            return ValueTask.CompletedTask;
        }

        _disposed = true;

        if (_connectionPool.IsDisposed)
        {
            return DisposeBrokenConnectionAsync();
        }

        if (Connection.FullState.HasFlag(ConnectionState.Broken))
        {
            return DisposeBrokenConnectionAsync();
        }

        try
        {
            if (Connection.State == ConnectionState.Closed)
            {
                Connection.Open();
            }

            _connectionPool.ReturnConnection(_connectionInfo, Connection);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Failed to return connection to pool for {Database}, disposing instead", _connectionInfo.Database);
            return DisposeBrokenConnectionAsync();
        }

        return ValueTask.CompletedTask;
    }

    private ValueTask DisposeBrokenConnectionAsync()
    {
        try
        {
            return Connection.DisposeAsync();
        }
        catch (Exception disposeEx)
        {
            _logger.LogDebug(disposeEx, "Suppressing exception while disposing broken connection for {Database}", _connectionInfo.Database);
            return ValueTask.CompletedTask;
        }
    }
}
