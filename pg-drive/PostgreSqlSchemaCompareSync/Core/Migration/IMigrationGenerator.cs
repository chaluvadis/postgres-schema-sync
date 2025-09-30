namespace PostgreSqlSchemaCompareSync.Core.Migration;

public interface IMigrationGenerator
{
   Task<MigrationScript> GenerateMigrationAsync(
       SchemaComparison comparison,
       MigrationOptions options,
       CancellationToken cancellationToken = default);
}