namespace PostgreSqlSchemaCompareSync.Core.Migration.Generation;

public class MigrationScriptGenerator(
    IOptions<AppSettings> settings,
    ILogger<MigrationScriptGenerator> logger) : IMigrationScriptGenerator
{
    private readonly MigrationSettings _settings = settings.Value.Migration;

    public async Task<MigrationScript> GenerateMigrationScriptAsync(
        SchemaComparison comparison,
        MigrationOptions options,
        CancellationToken cancellationToken = default)
    {
        try
        {
            // Apply settings as defaults when MigrationOptions don't specify values
            var effectiveOptions = ApplySettingsDefaults(options);

            // Validate settings values
            ValidateSettings();

            if (_settings.LogAllOperations)
            {
                logger.LogInformation("Generating migration script for {DifferenceCount} differences with enhanced logging enabled",
                    comparison.Differences.Count);
                logger.LogDebug("MigrationSettings: DefaultBatchSize={DefaultBatchSize}, EnableDryRun={EnableDryRun}, GenerateRollbackScripts={GenerateRollbackScripts}, LogAllOperations={LogAllOperations}",
                    _settings.DefaultBatchSize, _settings.EnableDryRun, _settings.GenerateRollbackScripts, _settings.LogAllOperations);
                logger.LogDebug("Effective MigrationOptions: Type={Type}, GenerateRollbackScript={GenerateRollbackScript}, IsDryRun={IsDryRun}, BatchSize={BatchSize}",
                    effectiveOptions.Type, effectiveOptions.GenerateRollbackScript, effectiveOptions.IsDryRun, effectiveOptions.BatchSize);
            }
            else
            {
                logger.LogInformation("Generating migration script for {DifferenceCount} differences",
                    comparison.Differences.Count);
            }
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
            if (effectiveOptions.IsDryRun)
            {
                scriptBuilder.AppendLine("-- DRY RUN MODE - No actual changes will be made");
                scriptBuilder.AppendLine();
            }
            rollbackScriptBuilder.AppendLine($"-- Rollback Script Generated: {timestamp}");
            rollbackScriptBuilder.AppendLine($"-- Original Migration: {comparison.Id}");
            rollbackScriptBuilder.AppendLine();

            if (_settings.LogAllOperations)
            {
                logger.LogDebug("Processing {DifferenceCount} differences for migration script generation", comparison.Differences.Count);
            }
            // Group differences by type for proper ordering
            var orderedDifferences = OrderDifferencesForMigration(comparison.Differences);
            // Generate SQL for each difference
            foreach (var difference in orderedDifferences)
            {
                cancellationToken.ThrowIfCancellationRequested();

                if (_settings.LogAllOperations)
                {
                    logger.LogDebug("Processing difference: {ObjectType} {Schema}.{ObjectName} ({DifferenceType})",
                        difference.ObjectType, difference.Schema, difference.ObjectName, difference.Type);
                }

                var sqlStatements = await GenerateSqlForDifferenceAsync(difference, effectiveOptions, cancellationToken);
                var rollbackStatements = await GenerateRollbackSqlForDifferenceAsync(difference, effectiveOptions, cancellationToken);

                if (_settings.LogAllOperations)
                {
                    logger.LogDebug("Generated {SqlStatementCount} SQL statements and {RollbackStatementCount} rollback statements for {ObjectType} {ObjectName}",
                        sqlStatements.Count, rollbackStatements.Count, difference.ObjectType, difference.ObjectName);
                }
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
                Type = effectiveOptions.Type,
                IsDryRun = effectiveOptions.IsDryRun,
                Status = MigrationStatus.Pending
            };
            if (_settings.LogAllOperations)
            {
                logger.LogInformation("Migration script generated with {OperationCount} operations. Rollback script: {RollbackScriptLength} characters, DryRun: {IsDryRun}",
                    operations.Count, migrationScript.RollbackScript.Length, migrationScript.IsDryRun);
            }
            else
            {
                logger.LogInformation("Migration script generated with {OperationCount} operations",
                    operations.Count);
            }

            return migrationScript;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to generate migration script");
            throw;
        }
    }

    /// <summary>
    /// Applies settings as defaults when MigrationOptions don't specify values
    /// </summary>
    private MigrationOptions ApplySettingsDefaults(MigrationOptions options)
    {
        // Create a copy to avoid modifying the original options
        var effectiveOptions = new MigrationOptions
        {
            Type = options.Type,
            GenerateRollbackScript = options.GenerateRollbackScript,
            IsDryRun = options.IsDryRun,
            BatchSize = options.BatchSize
        };

        // Apply settings as defaults when not explicitly set in options
        // Note: We use reflection or check for "default" values to determine if they were explicitly set
        // For now, we'll use a simple heuristic: if BatchSize is 50 (the default in MigrationOptions),
        // assume it wasn't explicitly set and use the settings default
        if (options.BatchSize == 50) // Default value in MigrationOptions
        {
            effectiveOptions.BatchSize = _settings.DefaultBatchSize;

            if (_settings.LogAllOperations)
            {
                logger.LogDebug("Applied DefaultBatchSize from settings: {DefaultBatchSize}", _settings.DefaultBatchSize);
            }
        }

        // For boolean flags, we need a different approach since we can't easily tell if they were explicitly set
        // We'll provide an override mechanism or assume settings should be used when they're different from MigrationOptions defaults
        if (_settings.EnableDryRun && !options.IsDryRun) // Only override if settings enable dry run and options don't explicitly disable it
        {
            effectiveOptions.IsDryRun = _settings.EnableDryRun;

            if (_settings.LogAllOperations)
            {
                logger.LogDebug("Applied EnableDryRun from settings: {EnableDryRun}", _settings.EnableDryRun);
            }
        }

        if (_settings.GenerateRollbackScripts && !options.GenerateRollbackScript) // Only override if settings enable rollback and options don't explicitly disable it
        {
            effectiveOptions.GenerateRollbackScript = _settings.GenerateRollbackScripts;

            if (_settings.LogAllOperations)
            {
                logger.LogDebug("Applied GenerateRollbackScripts from settings: {GenerateRollbackScripts}", _settings.GenerateRollbackScripts);
            }
        }

        return effectiveOptions;
    }

    /// <summary>
    /// Validates settings values to ensure they're within acceptable ranges
    /// </summary>
    private void ValidateSettings()
    {
        if (_settings.DefaultBatchSize < 1 || _settings.DefaultBatchSize > 1000)
        {
            throw new ArgumentOutOfRangeException(nameof(_settings.DefaultBatchSize),
                _settings.DefaultBatchSize, "DefaultBatchSize must be between 1 and 1000");
        }

        if (_settings.LogAllOperations)
        {
            logger.LogDebug("Settings validation passed for MigrationSettings");
        }
    }
    private List<SchemaDifference> OrderDifferencesForMigration(List<SchemaDifference> differences) =>
        // Order by dependency and safety
        [.. differences
            .OrderBy(d => GetObjectPriority(d.ObjectType))
            .ThenBy(d => d.Type) // Process removals before additions
            .ThenBy(d => d.Schema)
            .ThenBy(d => d.ObjectName)];
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
            logger.LogError(ex, "Failed to generate SQL for difference {ObjectType} {ObjectName}",
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
            logger.LogWarning(ex, "Failed to generate detailed ALTER statements for table {TableName}", difference.ObjectName);
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
            logger.LogError(ex, "Failed to generate rollback SQL for difference {ObjectType} {ObjectName}",
                difference.ObjectType, difference.ObjectName);
            statements.Add($"-- WARNING: Failed to generate rollback SQL for {difference.ObjectType} {difference.Schema}.{difference.ObjectName}");
        }
        return statements;
    }
}