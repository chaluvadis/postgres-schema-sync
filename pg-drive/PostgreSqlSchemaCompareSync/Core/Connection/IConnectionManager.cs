namespace PostgreSqlSchemaCompareSync.Core.Connection;

public interface IConnectionManager
{
    Task<NpgsqlConnection> CreateConnectionAsync(ConnectionInfo connectionInfo, CancellationToken ct = default);
    Task<bool> TestConnectionAsync(ConnectionInfo connectionInfo, CancellationToken ct = default);
    Task CloseConnectionAsync(ConnectionInfo connectionInfo, CancellationToken ct = default);
}