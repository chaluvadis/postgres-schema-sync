namespace PostgreSqlSchemaCompareSync.Core.Comparison.Metadata;
public interface IMetadataExtractor
{
    ObjectType ObjectType { get; }
    Task<IEnumerable<DatabaseObject>> ExtractAsync(
        NpgsqlConnection connection,
        string? schemaFilter,
        CancellationToken cancellationToken);
}

public interface IObjectMetadataExtractor
{
    Task<DatabaseObjectDetails> ExtractDetailsAsync(
        NpgsqlConnection connection,
        string schema,
        string objectName,
        CancellationToken cancellationToken);
}

public interface IObjectValidator
{
    Task<ObjectValidationResult> ValidateAsync(
        NpgsqlConnection connection,
        DatabaseObject databaseObject,
        CancellationToken cancellationToken);
}