namespace PostgreSqlSchemaCompareSync.Core.Comparison.Engine;

public interface ISchemaComparisonEngine : IDisposable
{
    Task<SchemaComparison> CompareSchemasAsync(
        ConnectionInfo sourceConnection,
        ConnectionInfo targetConnection,
        MigrationComparisonOptions options,
        CancellationToken cancellationToken = default);
    Task<List<SchemaDifference>> CompareObjectsAsync(
        ConnectionInfo sourceConnection,
        ConnectionInfo targetConnection,
        List<DatabaseObject> sourceObjects,
        List<DatabaseObject> targetObjects,
        MigrationComparisonOptions options,
        CancellationToken cancellationToken = default);

    Task<bool> AreObjectsEquivalentAsync(
        DatabaseObject sourceObject,
        DatabaseObject targetObject,
        MigrationComparisonOptions options,
        CancellationToken cancellationToken = default);
}