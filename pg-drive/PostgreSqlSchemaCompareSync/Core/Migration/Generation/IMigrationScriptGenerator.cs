namespace PostgreSqlSchemaCompareSync.Core.Migration.Generation;

public interface IMigrationScriptGenerator : IDisposable
{
    Task<MigrationScript> GenerateMigrationScriptAsync(
        SchemaComparison comparison,
        MigrationOptions options,
        CancellationToken cancellationToken = default);
}