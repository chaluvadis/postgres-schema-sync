namespace PostgreSqlSchemaCompareSync.Core.Comparison.Metadata;

public interface ISchemaMetadataExtractor
{
    Task<List<DatabaseObject>> ExtractAllObjectsAsync(NpgsqlConnection connection, string? schemaFilter = null, CancellationToken cancellationToken = default);
    Task<List<Collation>> ExtractCollationsAsync(NpgsqlConnection connection, string? schemaFilter = null, CancellationToken cancellationToken = default);
    Task<List<Domain>> ExtractDomainsAsync(NpgsqlConnection connection, string? schemaFilter = null, CancellationToken cancellationToken = default);
    Task<List<Extension>> ExtractExtensionsAsync(NpgsqlConnection connection, string? schemaFilter = null, CancellationToken cancellationToken = default);
    Task<List<Function>> ExtractFunctionsAsync(NpgsqlConnection connection, string? schemaFilter = null, CancellationToken cancellationToken = default);
    Task<List<Models.Index>> ExtractIndexesAsync(NpgsqlConnection connection, string? schemaFilter = null, CancellationToken cancellationToken = default);
    Task<List<Function>> ExtractProceduresAsync(NpgsqlConnection connection, string? schemaFilter = null, CancellationToken cancellationToken = default);
    Task<List<Role>> ExtractRolesAsync(NpgsqlConnection connection, string? schemaFilter = null, CancellationToken cancellationToken = default);
    Task<List<Sequence>> ExtractSequencesAsync(NpgsqlConnection connection, string? schemaFilter = null, CancellationToken cancellationToken = default);
    Task<List<Table>> ExtractTablesAsync(NpgsqlConnection connection, string? schemaFilter = null, CancellationToken cancellationToken = default);
    Task<List<Tablespace>> ExtractTablespacesAsync(NpgsqlConnection connection, string? schemaFilter = null, CancellationToken cancellationToken = default);
    Task<List<Trigger>> ExtractTriggersAsync(NpgsqlConnection connection, string? schemaFilter = null, CancellationToken cancellationToken = default);
    Task<List<Models.Type>> ExtractTypesAsync(NpgsqlConnection connection, string? schemaFilter = null, CancellationToken cancellationToken = default);
    Task<List<View>> ExtractViewsAsync(NpgsqlConnection connection, string? schemaFilter = null, CancellationToken cancellationToken = default);
}