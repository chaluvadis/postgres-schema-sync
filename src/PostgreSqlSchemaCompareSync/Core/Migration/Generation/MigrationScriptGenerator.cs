namespace PostgreSqlSchemaCompareSync.Core.Migration.Generation;
public class MigrationScriptGenerator
{
    private readonly MigrationSettings _settings;
    private readonly ILogger<MigrationScriptGenerator> _logger;
    public MigrationScriptGenerator(
        IOptions<AppSettings> settings,
        ILogger<MigrationScriptGenerator> logger)
    {
        _settings = settings.Value.Migration;
        _logger = logger;
    }
    public async Task<MigrationScript> GenerateMigrationScriptAsync(
        SchemaComparison comparison,
        MigrationOptions options,
        CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogInformation("Generating migration script for {DifferenceCount} differences",
                comparison.Differences.Count);
            var scriptBuilder = new StringBuilder();
            var rollbackScriptBuilder = new StringBuilder();
            var operations = new List<string>();
            // Generate header
            var timestamp = DateTime.UtcNow;
            scriptBuilder.AppendLine($"-- Migration Script Generated: {timestamp}");
            scriptBuilder.AppendLine($"-- Source: {comparison.SourceConnection.Database}");
            scriptBuilder.AppendLine($"-- Target: {comparison.TargetConnection.Database}");
            scriptBuilder.AppendLine($"-- Comparison Mode: {comparison.Mode}");
            scriptBuilder.AppendLine($"-- Differences: {comparison.Differences.Count}");
            scriptBuilder.AppendLine();
            if (options.IsDryRun)
            {
                scriptBuilder.AppendLine("-- DRY RUN MODE - No actual changes will be made");
                scriptBuilder.AppendLine();
            }
            rollbackScriptBuilder.AppendLine($"-- Rollback Script Generated: {timestamp}");
            rollbackScriptBuilder.AppendLine($"-- Original Migration: {comparison.Id}");
            rollbackScriptBuilder.AppendLine();
            // Group differences by type for proper ordering
            var orderedDifferences = OrderDifferencesForMigration(comparison.Differences);
            // Generate SQL for each difference
            foreach (var difference in orderedDifferences)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var sqlStatements = await GenerateSqlForDifferenceAsync(difference, options, cancellationToken);
                var rollbackStatements = await GenerateRollbackSqlForDifferenceAsync(difference, options, cancellationToken);
                foreach (var statement in sqlStatements)
                {
                    scriptBuilder.AppendLine(statement);
                    operations.Add(statement);
                }
                foreach (var rollbackStatement in rollbackStatements)
                {
                    rollbackScriptBuilder.AppendLine(rollbackStatement);
                }
            }
            // Generate footer
            scriptBuilder.AppendLine();
            scriptBuilder.AppendLine($"-- Migration completed. Operations: {operations.Count}");
            var migrationScript = new MigrationScript
            {
                Comparison = comparison,
                SelectedDifferences = comparison.Differences,
                SqlScript = scriptBuilder.ToString(),
                RollbackScript = rollbackScriptBuilder.ToString(),
                Type = options.Type,
                IsDryRun = options.IsDryRun,
                Status = MigrationStatus.Pending
            };
            _logger.LogInformation("Migration script generated with {OperationCount} operations",
                operations.Count);
            return migrationScript;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to generate migration script");
            throw;
        }
    }
    private List<SchemaDifference> OrderDifferencesForMigration(List<SchemaDifference> differences)
    {
        // Order by dependency and safety
        return differences
            .OrderBy(d => GetObjectPriority(d.ObjectType))
            .ThenBy(d => d.Type) // Process removals before additions
            .ThenBy(d => d.Schema)
            .ThenBy(d => d.ObjectName)
            .ToList();
    }
    private int GetObjectPriority(ObjectType objectType)
    {
        return objectType switch
        {
            ObjectType.Schema => 1,
            ObjectType.Type => 2,
            ObjectType.Domain => 3,
            ObjectType.Sequence => 4,
            ObjectType.Table => 5,
            ObjectType.Function => 6,
            ObjectType.View => 7,
            ObjectType.Index => 8,
            ObjectType.Constraint => 9,
            ObjectType.Trigger => 10,
            _ => 99
        };
    }
    private async Task<List<string>> GenerateSqlForDifferenceAsync(
        SchemaDifference difference,
        MigrationOptions options,
        CancellationToken cancellationToken)
    {
        var statements = new List<string>();
        try
        {
            switch (difference.Type)
            {
                case DifferenceType.Added:
                    statements.AddRange(await GenerateCreateStatementsAsync(difference, options, cancellationToken));
                    break;
                case DifferenceType.Removed:
                    statements.AddRange(await GenerateDropStatementsAsync(difference, options, cancellationToken));
                    break;
                case DifferenceType.Modified:
                    statements.AddRange(await GenerateAlterStatementsAsync(difference, options, cancellationToken));
                    break;
                case DifferenceType.Moved:
                    statements.AddRange(await GenerateMoveStatementsAsync(difference, options, cancellationToken));
                    break;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to generate SQL for difference {ObjectType} {ObjectName}",
                difference.ObjectType, difference.ObjectName);
            // Generate a comment explaining the failure
            statements.Add($"-- WARNING: Failed to generate SQL for {difference.ObjectType} {difference.Schema}.{difference.ObjectName}");
            statements.Add($"-- Error: {ex.Message}");
        }
        return statements;
    }
    private async Task<List<string>> GenerateCreateStatementsAsync(
        SchemaDifference difference,
        MigrationOptions options,
        CancellationToken cancellationToken)
    {
        var statements = new List<string>();
        statements.Add($"-- Creating {difference.ObjectType}: {difference.Schema}.{difference.ObjectName}");
        switch (difference.ObjectType)
        {
            case ObjectType.Schema:
                statements.Add($"CREATE SCHEMA IF NOT EXISTS {difference.Schema};");
                break;
            case ObjectType.Table:
                statements.Add(difference.TargetDefinition);
                break;
            case ObjectType.View:
                statements.Add(difference.TargetDefinition);
                break;
            case ObjectType.Function:
                statements.Add(difference.TargetDefinition);
                break;
            case ObjectType.Sequence:
                statements.Add(difference.TargetDefinition);
                break;
            case ObjectType.Type:
                statements.Add(difference.TargetDefinition);
                break;
            case ObjectType.Index:
                statements.Add(difference.TargetDefinition);
                break;
            default:
                statements.Add($"-- Unsupported object type for creation: {difference.ObjectType}");
                break;
        }
        return statements;
    }
    private async Task<List<string>> GenerateDropStatementsAsync(
        SchemaDifference difference,
        MigrationOptions options,
        CancellationToken cancellationToken)
    {
        var statements = new List<string>();
        statements.Add($"-- Dropping {difference.ObjectType}: {difference.Schema}.{difference.ObjectName}");
        switch (difference.ObjectType)
        {
            case ObjectType.Table:
                statements.Add($"DROP TABLE IF EXISTS {difference.Schema}.{difference.ObjectName} CASCADE;");
                break;
            case ObjectType.View:
                statements.Add($"DROP VIEW IF EXISTS {difference.Schema}.{difference.ObjectName} CASCADE;");
                break;
            case ObjectType.Function:
                statements.Add($"DROP FUNCTION IF EXISTS {difference.Schema}.{difference.ObjectName} CASCADE;");
                break;
            case ObjectType.Sequence:
                statements.Add($"DROP SEQUENCE IF EXISTS {difference.Schema}.{difference.ObjectName} CASCADE;");
                break;
            case ObjectType.Type:
                statements.Add($"DROP TYPE IF EXISTS {difference.Schema}.{difference.ObjectName} CASCADE;");
                break;
            case ObjectType.Index:
                statements.Add($"DROP INDEX IF EXISTS {difference.Schema}.{difference.ObjectName} CASCADE;");
                break;
            case ObjectType.Schema:
                statements.Add($"DROP SCHEMA IF EXISTS {difference.Schema} CASCADE;");
                break;
            default:
                statements.Add($"-- Unsupported object type for removal: {difference.ObjectType}");
                break;
        }
        return statements;
    }
    private async Task<List<string>> GenerateAlterStatementsAsync(
        SchemaDifference difference,
        MigrationOptions options,
        CancellationToken cancellationToken)
    {
        var statements = new List<string>();
        statements.Add($"-- Modifying {difference.ObjectType}: {difference.Schema}.{difference.ObjectName}");
        switch (difference.ObjectType)
        {
            case ObjectType.Table:
                statements.AddRange(await GenerateTableAlterStatementsAsync(difference, options, cancellationToken));
                break;
            case ObjectType.View:
                // For views, we need to drop and recreate
                statements.Add($"DROP VIEW IF EXISTS {difference.Schema}.{difference.ObjectName} CASCADE;");
                statements.Add(difference.TargetDefinition);
                break;
            case ObjectType.Function:
                // For functions, we need to drop and recreate
                statements.Add($"DROP FUNCTION IF EXISTS {difference.Schema}.{difference.ObjectName} CASCADE;");
                statements.Add(difference.TargetDefinition);
                break;
            default:
                statements.Add($"-- ALTER not supported for {difference.ObjectType}, consider manual review");
                break;
        }
        return statements;
    }
    private async Task<List<string>> GenerateTableAlterStatementsAsync(
        SchemaDifference difference,
        MigrationOptions options,
        CancellationToken cancellationToken)
    {
        var statements = new List<string>();
        // For now, use a simple approach: comment the change
        // In a full implementation, this would analyze column-level differences
        statements.Add($"-- Table {difference.Schema}.{difference.ObjectName} has been modified");
        statements.Add($"-- Review the following definitions and apply changes manually:");
        statements.Add($"-- Source: {difference.SourceDefinition}");
        statements.Add($"-- Target: {difference.TargetDefinition}");
        return statements;
    }
    private async Task<List<string>> GenerateMoveStatementsAsync(
        SchemaDifference difference,
        MigrationOptions options,
        CancellationToken cancellationToken)
    {
        var statements = new List<string>();
        statements.Add($"-- Moving {difference.ObjectType} {difference.ObjectName} between schemas");
        statements.Add($"-- Manual intervention required for schema moves");
        return statements;
    }
    private async Task<List<string>> GenerateRollbackSqlForDifferenceAsync(
        SchemaDifference difference,
        MigrationOptions options,
        CancellationToken cancellationToken)
    {
        var statements = new List<string>();
        if (!options.GenerateRollbackScript)
        {
            statements.Add($"-- Rollback not generated for {difference.ObjectType} {difference.Schema}.{difference.ObjectName}");
            return statements;
        }
        try
        {
            switch (difference.Type)
            {
                case DifferenceType.Added:
                    // For added objects, rollback should remove them
                    statements.AddRange(await GenerateDropStatementsAsync(difference, options, cancellationToken));
                    break;
                case DifferenceType.Removed:
                    // For removed objects, rollback should recreate them
                    statements.AddRange(await GenerateCreateStatementsAsync(difference, options, cancellationToken));
                    break;
                case DifferenceType.Modified:
                    // For modified objects, rollback should restore original
                    statements.Add($"-- Restoring original {difference.ObjectType}: {difference.Schema}.{difference.ObjectName}");
                    statements.Add(difference.SourceDefinition);
                    break;
                case DifferenceType.Moved:
                    // For moved objects, rollback should move back
                    statements.Add($"-- Moving {difference.ObjectType} back: {difference.Schema}.{difference.ObjectName}");
                    statements.Add($"-- Manual intervention required for rollback");
                    break;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to generate rollback SQL for difference {ObjectType} {ObjectName}",
                difference.ObjectType, difference.ObjectName);
            statements.Add($"-- WARNING: Failed to generate rollback SQL for {difference.ObjectType} {difference.Schema}.{difference.ObjectName}");
        }
        return statements;
    }
}