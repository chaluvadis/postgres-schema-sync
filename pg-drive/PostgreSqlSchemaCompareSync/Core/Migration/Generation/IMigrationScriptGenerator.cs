namespace PostgreSqlSchemaCompareSync.Core.Migration.Generation;

public interface IMigrationScriptGenerator
{
    Task<MigrationScript> GenerateMigrationScriptAsync(SchemaComparison comparison, MigrationOptions options, CancellationToken cancellationToken = default);
}