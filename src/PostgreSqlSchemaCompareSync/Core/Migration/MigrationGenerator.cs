namespace PostgreSqlSchemaCompareSync.Core.Migration;
public class MigrationGenerator(
    ILogger<MigrationGenerator> logger,
    MigrationScriptGenerator scriptGenerator) : IMigrationGenerator
{
    private readonly ILogger<MigrationGenerator> _logger = logger;
    private readonly MigrationScriptGenerator _scriptGenerator = scriptGenerator;
    public async Task<MigrationScript> GenerateMigrationAsync(
        SchemaComparison comparison,
        MigrationOptions options,
        CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogInformation("Generating migration script for comparison {ComparisonId} with {DifferenceCount} differences",
                comparison.Id, comparison.Differences.Count);
            // Use the advanced script generator
            var migration = await _scriptGenerator.GenerateMigrationScriptAsync(comparison, options, cancellationToken);
            _logger.LogInformation("Migration script generated successfully: {OperationCount} operations",
                migration.SqlScript.Split('\n', StringSplitOptions.RemoveEmptyEntries).Length);
            return migration;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to generate migration for comparison {ComparisonId}", comparison.Id);
            throw;
        }
    }
}