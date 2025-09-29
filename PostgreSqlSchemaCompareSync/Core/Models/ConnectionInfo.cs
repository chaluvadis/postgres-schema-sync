namespace PostgreSqlSchemaCompareSync.Core.Models;
public class ConnectionInfo
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string Host { get; set; } = "localhost";
    public int Port { get; set; } = 5432;
    public string Database { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty; // Will be stored securely
    public string ConnectionString => BuildConnectionString();
    public ConnectionStatus Status { get; set; } = ConnectionStatus.Disconnected;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastConnectedAt { get; set; }
    public string? LastError { get; set; }
    public Dictionary<string, string> Properties { get; set; } = [];
    [JsonIgnore]
    public bool IsConnected => Status == ConnectionStatus.Connected;
    private string BuildConnectionString()
    {
        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = Host,
            Port = Port,
            Database = Database,
            Username = Username,
            Password = Password,
            SslMode = Npgsql.SslMode.Require
        };
        return builder.ConnectionString;
    }
}
public enum ConnectionStatus
{
    Disconnected,
    Connecting,
    Connected,
    Error,
    Unauthorized
}
public class SchemaComparison
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public ConnectionInfo SourceConnection { get; set; } = new();
    public ConnectionInfo TargetConnection { get; set; } = new();
    public List<string> SourceSchemas { get; set; } = [];
    public List<string> TargetSchemas { get; set; } = [];
    public ComparisonMode Mode { get; set; } = ComparisonMode.Strict;
    public List<SchemaDifference> Differences { get; set; } = [];
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public TimeSpan ExecutionTime { get; set; }
}
public enum ComparisonMode
{
    Strict,   // Exact match including whitespace and order
    Lenient   // Ignore formatting differences
}
public class SchemaDifference
{
    public DifferenceType Type { get; set; }
    public ObjectType ObjectType { get; set; }
    public string ObjectName { get; set; } = string.Empty;
    public string Schema { get; set; } = string.Empty;
    public string SourceDefinition { get; set; } = string.Empty;
    public string TargetDefinition { get; set; } = string.Empty;
    public List<string> DifferenceDetails { get; set; } = [];
}
public enum DifferenceType
{
    Added,      // Object exists in target but not in source
    Removed,    // Object exists in source but not in target
    Modified,   // Object exists in both but definitions differ
    Moved       // Object moved between schemas
}
public class MigrationScript
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public SchemaComparison Comparison { get; set; } = new();
    public List<SchemaDifference> SelectedDifferences { get; set; } = [];
    public string SqlScript { get; set; } = string.Empty;
    public string RollbackScript { get; set; } = string.Empty;
    public MigrationType Type { get; set; } = MigrationType.Schema;
    public bool IsDryRun { get; set; }
    public MigrationStatus Status { get; set; } = MigrationStatus.Pending;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public TimeSpan? ExecutionTime { get; set; }
    public string? ExecutionLog { get; set; }
}
public enum MigrationType
{
    Schema,     // Schema structure changes only
    Data,       // Data migration
    Full        // Both schema and data
}
public enum MigrationStatus
{
    Pending,
    Running,
    Completed,
    Failed,
    RolledBack
}