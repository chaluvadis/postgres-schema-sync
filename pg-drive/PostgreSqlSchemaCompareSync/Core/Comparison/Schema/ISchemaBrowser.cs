namespace PostgreSqlSchemaCompareSync.Core.Comparison.Schema;

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
    Task<List<string>> GetSchemasAsync(
        ConnectionInfo connectionInfo,
        CancellationToken cancellationToken = default);
    Task<List<ObjectType>> GetObjectTypesAsync(
        ConnectionInfo connectionInfo,
        string schema,
        CancellationToken cancellationToken = default);
    SchemaCacheStats GetCacheStats();
    Task RefreshSchemaCacheAsync(
        ConnectionInfo connectionInfo,
        string? schemaFilter = null,
        CancellationToken cancellationToken = default);
}