namespace PostgreSqlSchemaCompareSync.Core.Connection;

/// <summary>
/// Builds connection strings from connection information
/// </summary>
public class ConnectionStringBuilder
{
    private readonly ConnectionSettings _settings;

    public ConnectionStringBuilder(IOptions<AppSettings> settings)
    {
        ArgumentNullException.ThrowIfNull(settings);
        _settings = settings.Value?.Connection ?? throw new ArgumentNullException(nameof(settings.Value.Connection));
    }

    /// <summary>
    /// Builds a connection string from connection info
    /// </summary>
    public string Build(ConnectionInfo connectionInfo)
    {
        ArgumentNullException.ThrowIfNull(connectionInfo);

        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = connectionInfo.Host,
            Port = connectionInfo.Port,
            Database = connectionInfo.Database,
            Username = connectionInfo.Username,
            Password = connectionInfo.Password,
            Pooling = true,
            MinPoolSize = _settings.MinPoolSize,
            MaxPoolSize = _settings.MaxPoolSize,
            Timeout = _settings.ConnectionTimeout,
            CommandTimeout = _settings.CommandTimeout
        };

        return builder.ConnectionString;
    }
}