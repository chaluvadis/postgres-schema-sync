namespace PostgreSqlSchemaCompareSync.Core.Connection;

public class ConnectionManager : IConnectionManager, IDisposable
{
    private readonly ILogger<ConnectionManager> _logger;
    private readonly ConnectionPool _connectionPool;
    private readonly ConnectionHealthMonitor _healthMonitor;
    private readonly ConnectionRecoveryManager _recoveryManager;
    private bool _disposed;
    public ConnectionManager(
        IOptions<AppSettings> settings,
        ILogger<ConnectionManager> logger,
        ConnectionPool connectionPool,
        ConnectionHealthMonitor healthMonitor,
        ConnectionRecoveryManager recoveryManager)
    {
        _logger = logger;
        _connectionPool = connectionPool;
        _healthMonitor = healthMonitor;
        _recoveryManager = recoveryManager;
        _logger.LogInformation("Advanced connection manager initialized with pooling and health monitoring");
    }
    public async Task<NpgsqlConnection> CreateConnectionAsync(ConnectionInfo connectionInfo, CancellationToken cancellationToken = default)
    {
        try
        {
            // Register with health monitor
            _healthMonitor.RegisterConnection(connectionInfo);
            // Try to get connection from pool first
            var pooledConnection = await _connectionPool.AcquireConnectionAsync(connectionInfo, cancellationToken);
            var connection = pooledConnection.Connection;
            _logger.LogInformation("Successfully acquired connection {ConnectionId} to {Database}",
                pooledConnection.Id, connectionInfo.Database);
            return connection;
        }
        catch (Exception ex)
        {
            // Report failure for recovery
            _recoveryManager.ReportConnectionFailure(connectionInfo, ex);
            _logger.LogError(ex, "Failed to create connection to {Database}", connectionInfo.Database);
            throw;
        }
    }
    public async Task<bool> TestConnectionAsync(ConnectionInfo connectionInfo, CancellationToken cancellationToken = default)
    {
        try
        {
            // Use health monitor for testing
            var isHealthy = await _healthMonitor.CheckConnectionHealthAsync(connectionInfo, cancellationToken);
            if (isHealthy)
            {
                _logger.LogInformation("Connection test successful for {Database}", connectionInfo.Database);
            }
            else
            {
                _logger.LogWarning("Connection test failed for {Database}", connectionInfo.Database);
            }
            return isHealthy;
        }
        catch (Exception ex)
        {
            _recoveryManager.ReportConnectionFailure(connectionInfo, ex);
            _logger.LogError(ex, "Connection test failed for {Database}", connectionInfo.Database);
            return false;
        }
    }
    public async Task CloseConnectionAsync(ConnectionInfo connectionInfo, CancellationToken cancellationToken = default)
    {
        // Note: In the advanced system, connections are managed by the pool
        // This method is mainly for compatibility with the interface
        _healthMonitor.UnregisterConnection(connectionInfo);
        _logger.LogDebug("Connection cleanup completed for {Database}", connectionInfo.Database);
    }
    public ConnectionPoolStats GetPoolStats() => _connectionPool.GetStats();
    public Dictionary<string, ConnectionHealthInfo> GetHealthInfo() => _healthMonitor.GetAllHealthInfo();
    public Dictionary<string, ConnectionRecoveryInfo> GetRecoveryInfo() => _recoveryManager.GetAllRecoveryInfo();
    public void Dispose()
    {
        if (!_disposed)
        {
            _disposed = true;
            _connectionPool?.Dispose();
            _healthMonitor?.Dispose();
            _recoveryManager?.Dispose();
            _logger.LogInformation("Connection manager disposed");
        }
    }
}