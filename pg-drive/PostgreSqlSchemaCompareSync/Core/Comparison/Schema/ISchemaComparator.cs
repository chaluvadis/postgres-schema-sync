namespace PostgreSqlSchemaCompareSync.Core.Comparison.Schema;

public interface ISchemaComparator
{
    Task<SchemaComparison> CompareSchemasAsync(
        ConnectionInfo sourceConnection,
        ConnectionInfo targetConnection,
        SchemaComparisonOptions options,
        CancellationToken cancellationToken = default);
}

public class SchemaComparisonOptions
{
    public ComparisonMode Mode { get; set; } = ComparisonMode.Strict;
    public List<string> SourceSchemas { get; set; } = [];
    public List<string> TargetSchemas { get; set; } = [];
    public List<ObjectType> ObjectTypes { get; set; } = [];
    public bool UseParallelProcessing { get; set; } = true;
}