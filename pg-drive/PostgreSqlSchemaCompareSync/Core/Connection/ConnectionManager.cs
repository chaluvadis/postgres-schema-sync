namespace PostgreSqlSchemaCompareSync.Core.Connection;

public class ConnectionManager(
    ILogger<ConnectionManager> logger,
    ConnectionPool connectionPool,
    ConnectionHealthMonitor healthMonitor,
    ConnectionRecoveryManager recoveryManager) : IConnectionManager, IDisposable
{
    private bool _disposed;
    public async Task<NpgsqlConnection> CreateConnectionAsync(
        ConnectionInfo connectionInfo,
        CancellationToken cancellationToken = default
    )
    {
        try
        {
            // Register with health monitor
            healthMonitor.RegisterConnection(connectionInfo);
            // Try to get connection from pool first
            var pooledConnection = await connectionPool.AcquireConnectionAsync(connectionInfo, cancellationToken);
            var connection = pooledConnection.Connection;
            logger.LogInformation("Successfully acquired connection {ConnectionId} to {Database}",
                pooledConnection.Id, connectionInfo.Database);
            return connection;
        }
        catch (Exception ex)
        {
            // Report failure for recovery
            recoveryManager.ReportConnectionFailure(connectionInfo, ex);
            logger.LogError(ex, "Failed to create connection to {Database}", connectionInfo.Database);
            throw;
        }
    }
    public async Task<bool> TestConnectionAsync(
        ConnectionInfo connectionInfo,
        CancellationToken cancellationToken = default
    )
    {
        try
        {
            // Use health monitor for testing
            var isHealthy = await healthMonitor.CheckConnectionHealthAsync(connectionInfo, cancellationToken);
            if (isHealthy)
            {
                logger.LogInformation("Connection test successful for {Database}", connectionInfo.Database);
            }
            else
            {
                logger.LogWarning("Connection test failed for {Database}", connectionInfo.Database);
            }
            return isHealthy;
        }
        catch (Exception ex)
        {
            recoveryManager.ReportConnectionFailure(connectionInfo, ex);
            logger.LogError(ex, "Connection test failed for {Database}", connectionInfo.Database);
            return false;
        }
    }
    public Task CloseConnectionAsync(ConnectionInfo connectionInfo, CancellationToken cancellationToken = default)
    {
        // Note: In the advanced system, connections are managed by the pool
        // This method is mainly for compatibility with the interface
        healthMonitor.UnregisterConnection(connectionInfo);
        logger.LogDebug("Connection cleanup completed for {Database}", connectionInfo.Database);
        return Task.CompletedTask;
    }
    public void Dispose()
    {
        if (!_disposed)
        {
            _disposed = true;
            connectionPool?.Dispose();
            healthMonitor?.Dispose();
            recoveryManager?.Dispose();
            logger.LogInformation("Connection manager disposed");
        }
    }
}