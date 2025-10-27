namespace PostgreSqlSchemaCompareSync.Core.Connection;

public interface IConnectionManager : IDisposable
{
    Task<PooledConnectionHandle> CreateConnectionAsync(
        ConnectionInfo connectionInfo,
        CancellationToken cancellationToken = default);

    Task<bool> TestConnectionAsync(
        ConnectionInfo connectionInfo,
        CancellationToken cancellationToken = default);

    Task CloseConnectionAsync(
        PooledConnectionHandle connection,
        CancellationToken cancellationToken = default);

    Task<ConnectionHealthStatus> GetConnectionHealthAsync(
        ConnectionInfo connectionInfo,
        CancellationToken cancellationToken = default);
}

public class ConnectionHealthStatus
{
    public bool IsHealthy { get; set; }
    public TimeSpan ResponseTime { get; set; }
    public DateTime LastChecked { get; set; }
    public string? ErrorMessage { get; set; }
}