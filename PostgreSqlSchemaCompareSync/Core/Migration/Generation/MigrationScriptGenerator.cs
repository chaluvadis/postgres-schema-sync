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
    private Task<List<string>> GenerateCreateStatementsAsync(
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
        return Task.FromResult(statements);
    }
    private Task<List<string>> GenerateDropStatementsAsync(
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
        return Task.FromResult(statements);
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
    private Task<List<string>> GenerateTableAlterStatementsAsync(
        SchemaDifference difference,
        MigrationOptions options,
        CancellationToken cancellationToken)
    {
        var statements = new List<string>();
        try
        {
            // Parse table definitions to extract column information
            var sourceTable = ParseTableDefinition(difference.SourceDefinition);
            var targetTable = ParseTableDefinition(difference.TargetDefinition);
            if (sourceTable == null || targetTable == null)
            {
                // Fallback to simple approach if parsing fails
                statements.Add($"-- Table {difference.Schema}.{difference.ObjectName} has been modified");
                statements.Add($"-- Could not parse table definitions for automatic ALTER generation");
                statements.Add($"-- Review the following definitions and apply changes manually:");
                statements.Add($"-- Source: {difference.SourceDefinition}");
                statements.Add($"-- Target: {difference.TargetDefinition}");
                return Task.FromResult(statements);
            }
            statements.Add($"-- Modifying table {difference.Schema}.{difference.ObjectName}");
            // Compare columns
            var columnsToAdd = targetTable.Columns.Where(tc => !sourceTable.Columns.Any(sc => sc.Name == tc.Name));
            var columnsToDrop = sourceTable.Columns.Where(sc => !targetTable.Columns.Any(tc => tc.Name == sc.Name));
            var columnsToModify = sourceTable.Columns.Join(
                targetTable.Columns,
                sc => sc.Name,
                tc => tc.Name,
                (sc, tc) => new { SourceColumn = sc, TargetColumn = tc })
                .Where(x => !AreColumnsEqual(x.SourceColumn, x.TargetColumn));
            // Generate DROP COLUMN statements (in reverse order for safety)
            foreach (var column in columnsToDrop.OrderByDescending(c => c.Name))
            {
                statements.Add($"ALTER TABLE {difference.Schema}.{difference.ObjectName} DROP COLUMN IF EXISTS {column.Name} CASCADE;");
            }
            // Generate ADD COLUMN statements
            foreach (var column in columnsToAdd)
            {
                var addColumnSql = $"ALTER TABLE {difference.Schema}.{difference.ObjectName} ADD COLUMN IF NOT EXISTS {column.Name} {column.DataType}";
                if (!column.IsNullable)
                    addColumnSql += " NOT NULL";
                if (column.DefaultValue != null)
                    addColumnSql += $" DEFAULT {column.DefaultValue}";
                statements.Add(addColumnSql + ";");
            }
            // Generate MODIFY COLUMN statements
            foreach (var columnPair in columnsToModify)
            {
                var sourceCol = columnPair.SourceColumn;
                var targetCol = columnPair.TargetColumn;
                // Type change
                if (sourceCol.DataType != targetCol.DataType)
                {
                    var alterTypeSql = $"ALTER TABLE {difference.Schema}.{difference.ObjectName} ALTER COLUMN {targetCol.Name} TYPE {targetCol.DataType}";
                    if (targetCol.IsNullable && !sourceCol.IsNullable)
                        alterTypeSql += ", ALTER COLUMN " + targetCol.Name + " DROP NOT NULL";
                    else if (!targetCol.IsNullable && sourceCol.IsNullable)
                        alterTypeSql += ", ALTER COLUMN " + targetCol.Name + " SET NOT NULL";
                    statements.Add(alterTypeSql + ";");
                }
                else if (sourceCol.IsNullable != targetCol.IsNullable)
                {
                    // Only nullability change
                    if (targetCol.IsNullable)
                        statements.Add($"ALTER TABLE {difference.Schema}.{difference.ObjectName} ALTER COLUMN {targetCol.Name} DROP NOT NULL;");
                    else
                        statements.Add($"ALTER TABLE {difference.Schema}.{difference.ObjectName} ALTER COLUMN {targetCol.Name} SET NOT NULL;");
                }
                // Default value change
                if (sourceCol.DefaultValue != targetCol.DefaultValue)
                {
                    if (targetCol.DefaultValue != null)
                        statements.Add($"ALTER TABLE {difference.Schema}.{difference.ObjectName} ALTER COLUMN {targetCol.Name} SET DEFAULT {targetCol.DefaultValue};");
                    else
                        statements.Add($"ALTER TABLE {difference.Schema}.{difference.ObjectName} ALTER COLUMN {targetCol.Name} DROP DEFAULT;");
                }
            }
            // If no specific changes were detected, log the difference for manual review
            if (!columnsToAdd.Any() && !columnsToDrop.Any() && !columnsToModify.Any())
            {
                statements.Add($"-- No automatic changes could be determined for table {difference.Schema}.{difference.ObjectName}");
                statements.Add($"-- Manual review may be required. Source and target definitions:");
                statements.Add($"-- Source: {difference.SourceDefinition}");
                statements.Add($"-- Target: {difference.TargetDefinition}");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to generate detailed ALTER statements for table {TableName}", difference.ObjectName);
            // Fallback to simple approach
            statements.Add($"-- Table {difference.Schema}.{difference.ObjectName} has been modified");
            statements.Add($"-- Error generating ALTER statements: {ex.Message}");
            statements.Add($"-- Review the following definitions and apply changes manually:");
            statements.Add($"-- Source: {difference.SourceDefinition}");
            statements.Add($"-- Target: {difference.TargetDefinition}");
        }
        return Task.FromResult(statements);
    }
    private class ParsedTable
    {
        public string Name { get; set; } = string.Empty;
        public List<ParsedColumn> Columns { get; set; } = [];
    }
    private class ParsedColumn
    {
        public string Name { get; set; } = string.Empty;
        public string DataType { get; set; } = string.Empty;
        public bool IsNullable { get; set; } = true;
        public string? DefaultValue { get; set; }
    }
    private ParsedTable? ParseTableDefinition(string definition)
    {
        try
        {
            var table = new ParsedTable();
            // Simple regex-based parsing for CREATE TABLE statements
            var createTableMatch = Regex.Match(definition, @"CREATE\s+TABLE\s+(\w+)\.(\w+)\s*\((.*?)\)", RegexOptions.IgnoreCase | RegexOptions.Singleline);
            if (!createTableMatch.Success)
                return null;
            table.Name = createTableMatch.Groups[2].Value;
            var columnsText = createTableMatch.Groups[3].Value;
            // Split by comma but be careful with commas in default values, etc.
            var columnMatches = Regex.Matches(columnsText, @"(\w+)\s+([^,]+?)(?:\s+DEFAULT\s+([^,]+))?(?:\s+(NOT\s+)?NULL)?(?:\s*,|\s*$)");
            foreach (Match columnMatch in columnMatches)
            {
                if (columnMatch.Groups.Count >= 3)
                {
                    var column = new ParsedColumn
                    {
                        Name = columnMatch.Groups[1].Value,
                        DataType = columnMatch.Groups[2].Value.Trim(),
                        IsNullable = !columnMatch.Groups[4].Success || !columnMatch.Groups[4].Value.Contains("NOT")
                    };
                    if (columnMatch.Groups.Count > 3 && columnMatch.Groups[3].Success)
                    {
                        column.DefaultValue = columnMatch.Groups[3].Value.Trim();
                    }
                    table.Columns.Add(column);
                }
            }
            return table;
        }
        catch
        {
            return null;
        }
    }
    private bool AreColumnsEqual(ParsedColumn source, ParsedColumn target)
    {
        return source.Name == target.Name &&
               source.DataType == target.DataType &&
               source.IsNullable == target.IsNullable &&
               source.DefaultValue == target.DefaultValue;
    }
    private Task<List<string>> GenerateMoveStatementsAsync(
        SchemaDifference difference,
        MigrationOptions options,
        CancellationToken cancellationToken)
    {
        var statements = new List<string>();
        statements.Add($"-- Moving {difference.ObjectType} {difference.ObjectName} between schemas");
        statements.Add($"-- Manual intervention required for schema moves");
        return Task.FromResult(statements);
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