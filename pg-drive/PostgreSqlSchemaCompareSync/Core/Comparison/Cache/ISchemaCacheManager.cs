namespace PostgreSqlSchemaCompareSync.Core.Comparison.Cache;

public interface ISchemaCacheManager
{
    void ClearCache();
    void Dispose();
    Task<DatabaseObject?> GetObjectAsync(ConnectionInfo connectionInfo, ObjectType objectType, string schema, string objectName, CancellationToken cancellationToken = default);
    Task<List<DatabaseObject>> GetSchemaAsync(ConnectionInfo connectionInfo, string? schemaFilter = null, CancellationToken cancellationToken = default);
    SchemaCacheStats GetStats();
    Task RefreshSchemaAsync(ConnectionInfo connectionInfo, string? schemaFilter = null, CancellationToken cancellationToken = default);
}