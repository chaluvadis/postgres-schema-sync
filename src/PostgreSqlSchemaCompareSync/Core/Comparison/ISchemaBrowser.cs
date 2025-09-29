namespace PostgreSqlSchemaCompareSync.Core.Comparison;
// Temporary placeholder - will be defined in Models
public class DatabaseObjectDetails
{
    public DatabaseObject? Object { get; set; }
    public List<DatabaseObject> Dependencies { get; set; } = [];
    public List<DatabaseObject> Dependents { get; set; } = [];
    public Dictionary<string, object> AdditionalInfo { get; set; } = [];
}
public interface ISchemaBrowser
{
    Task<List<DatabaseObject>> GetDatabaseObjectsAsync(
        ConnectionInfo connectionInfo,
        string? schemaFilter = null,
        CancellationToken cancellationToken = default);
    Task<DatabaseObjectDetails> GetObjectDetailsAsync(
        ConnectionInfo connectionInfo,
        ObjectType objectType,
        string schema,
        string objectName,
        CancellationToken cancellationToken = default);
}