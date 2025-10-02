namespace PostgreSqlSchemaCompareSync.Core.Comparison.Engine;

public interface ISchemaComparisonEngine
{
    Task<List<SchemaDifference>> CompareObjectsAsync(List<DatabaseObject> sourceObjects, List<DatabaseObject> targetObjects, ComparisonOptions options, CancellationToken cancellationToken = default);
}