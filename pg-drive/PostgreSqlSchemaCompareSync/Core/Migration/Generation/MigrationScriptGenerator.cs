namespace PostgreSqlSchemaCompareSync.Core.Migration.Generation;

public class MigrationScriptGenerator(
    ILogger<MigrationScriptGenerator> logger,
    IOptions<AppSettings> settings) : IMigrationScriptGenerator
{
    private readonly ILogger<MigrationScriptGenerator> _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    private readonly AppSettings _settings = settings?.Value ?? throw new ArgumentNullException(nameof(settings));

    public async Task<MigrationScript> GenerateMigrationScriptAsync(
        SchemaComparison comparison,
        MigrationOptions options,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(comparison);
        ArgumentNullException.ThrowIfNull(options);

        try
        {
            // Validate inputs
            if (comparison == null)
                throw new ArgumentNullException(nameof(comparison), "Schema comparison cannot be null");

            if (options == null)
                throw new ArgumentNullException(nameof(options), "Migration options cannot be null");

            if (comparison.Differences == null || !comparison.Differences.Any())
            {
                _logger.LogWarning("No differences found in comparison {ComparisonId}", comparison.Id);
                return new MigrationScript
                {
                    Id = Guid.NewGuid().ToString(),
                    Comparison = comparison,
                    SelectedDifferences = comparison.Differences ?? [],
                    Type = options.Type,
                    IsDryRun = options.IsDryRun,
                    Status = MigrationStatus.Completed,
                    CreatedAt = DateTime.UtcNow,
                    SqlScript = "-- No differences found - no migration script needed"
                };
            }

            _logger.LogInformation("Generating migration script for comparison {ComparisonId} with {DifferenceCount} differences",
                comparison.Id, comparison.Differences.Count);

            var script = new MigrationScript
            {
                Id = Guid.NewGuid().ToString(),
                Comparison = comparison,
                SelectedDifferences = comparison.Differences,
                Type = options.Type,
                IsDryRun = options.IsDryRun,
                Status = MigrationStatus.Pending,
                CreatedAt = DateTime.UtcNow
            };

            // Generate SQL script based on differences
            var sqlScript = GenerateSqlScriptAsync(comparison.Differences).Result;

            // Generate rollback script if requested
            string rollbackScript = "";
            if (options.GenerateRollbackScript)
            {
                rollbackScript = GenerateRollbackScriptAsync(comparison.Differences).Result;
            }

            script.SqlScript = sqlScript;
            script.RollbackScript = rollbackScript;

            _logger.LogInformation("Migration script generated successfully: {OperationCount} operations, {ScriptLength} characters",
                script.OperationCount, sqlScript.Length);

            return script;
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("Migration script generation was cancelled for comparison {ComparisonId}", comparison?.Id);
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to generate migration script for comparison {ComparisonId}", comparison?.Id);
            throw new MigrationException($"Migration script generation failed: {ex.Message}",
                comparison?.SourceConnection?.Id ?? "unknown",
                Guid.NewGuid().ToString(), ex);
        }
    }

    private Task<string> GenerateSqlScriptAsync(
        List<SchemaDifference> differences)
    {
        var script = new StringBuilder();

        try
        {
            // Group differences by type for optimal execution order
            var addedObjects = differences.Where(d => d.Type == DifferenceType.Added).ToList();
            var modifiedObjects = differences.Where(d => d.Type == DifferenceType.Modified).ToList();
            var removedObjects = differences.Where(d => d.Type == DifferenceType.Removed).ToList();

            // Sort objects by dependency order for safe execution
            var orderedRemovals = OrderByDependencies(removedObjects, isReverse: true);
            var orderedModifications = OrderByDependencies(modifiedObjects, isReverse: false);
            var orderedAdditions = OrderByDependencies(addedObjects, isReverse: false);

            // Process in safe order: removes first, then modifies, then adds
            foreach (var difference in orderedRemovals.Concat(orderedModifications).Concat(orderedAdditions))
            {
                var sql = GenerateSqlForDifferenceAsync(difference).Result;
                if (!string.IsNullOrEmpty(sql))
                {
                    script.AppendLine(sql);
                    script.AppendLine();
                }
            }

            return Task.FromResult(script.ToString().Trim());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating SQL script");
            throw new MigrationException($"SQL script generation failed: {ex.Message}", Guid.NewGuid().ToString(), Guid.NewGuid().ToString(), ex);
        }
    }

    private Task<string> GenerateRollbackScriptAsync(
        List<SchemaDifference> differences)
    {
        var script = new StringBuilder();

        try
        {
            // Process differences in reverse order for rollback
            var reversedDifferences = differences.AsEnumerable().Reverse().ToList();

            foreach (var difference in reversedDifferences)
            {
                var rollbackSql = GenerateRollbackSqlForDifferenceAsync(difference).Result;
                if (!string.IsNullOrEmpty(rollbackSql))
                {
                    script.AppendLine(rollbackSql);
                    script.AppendLine();
                }
            }

            return Task.FromResult(script.ToString().Trim());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating rollback script");
            throw new MigrationException($"Rollback script generation failed: {ex.Message}", Guid.NewGuid().ToString(), Guid.NewGuid().ToString(), ex);
        }
    }

    private Task<string> GenerateSqlForDifferenceAsync(
        SchemaDifference difference)
    {
        try
        {
            switch (difference.Type)
            {
                case DifferenceType.Added:
                    return GenerateCreateSqlAsync(difference);

                case DifferenceType.Removed:
                    return GenerateDropSqlAsync(difference);

                case DifferenceType.Modified:
                    var alterStatement = GenerateAlterStatement(difference);
                    return Task.FromResult(alterStatement);

                default:
                    _logger.LogWarning("Unknown difference type: {DifferenceType}", difference.Type);
                    return Task.FromResult("");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating SQL for difference {ObjectType} {ObjectName}",
                difference.ObjectType, difference.ObjectName);
            return Task.FromResult($"-- ERROR generating SQL for {difference.ObjectType} {difference.ObjectName}: {ex.Message}");
        }
    }

    private Task<string> GenerateCreateSqlAsync(SchemaDifference difference)
    {
        if (string.IsNullOrEmpty(difference.TargetDefinition))
            return Task.FromResult("");

        var objectType = difference.ObjectType.ToString().ToLowerInvariant();
        var schema = string.IsNullOrEmpty(difference.Schema) ? "public" : difference.Schema;
        var objectName = difference.ObjectName;

        // Generate proper CREATE SQL based on object type
        return Task.FromResult(GenerateCreateStatement(difference, schema, objectName));
    }

    private Task<string> GenerateDropSqlAsync(SchemaDifference difference)
    {
        var objectType = difference.ObjectType.ToString().ToUpperInvariant();
        var schema = string.IsNullOrEmpty(difference.Schema) ? "public" : difference.Schema;
        var objectName = difference.ObjectName;

        // Generate appropriate DROP statement with PostgreSQL-specific syntax and safety
        var result = difference.ObjectType switch
        {
            ObjectType.Table => $"-- Dropping table {schema}.{objectName}\nDROP TABLE IF EXISTS \"{schema}\".\"{objectName}\" CASCADE;",
            ObjectType.View => $"-- Dropping view {schema}.{objectName}\nDROP VIEW IF EXISTS \"{schema}\".\"{objectName}\" CASCADE;",
            ObjectType.Index => $"-- Dropping index {schema}.{objectName}\nDROP INDEX IF EXISTS \"{schema}\".\"{objectName}\" CASCADE;",
            ObjectType.Function or ObjectType.Procedure => $"-- Dropping function {schema}.{objectName}\nDROP FUNCTION IF EXISTS \"{schema}\".\"{objectName}\" CASCADE;",
            ObjectType.Trigger => $"-- Dropping trigger {objectName}\nDROP TRIGGER IF EXISTS \"{objectName}\" ON \"{schema}\".* CASCADE;",
            ObjectType.Schema => $"-- Dropping schema {objectName}\nDROP SCHEMA IF EXISTS \"{objectName}\" CASCADE;",
            ObjectType.Type => $"-- Dropping type {schema}.{objectName}\nDROP TYPE IF EXISTS \"{schema}\".\"{objectName}\" CASCADE;",
            ObjectType.Sequence => $"-- Dropping sequence {schema}.{objectName}\nDROP SEQUENCE IF EXISTS \"{schema}\".\"{objectName}\" CASCADE;",
            _ => $"-- DROP {objectType} {schema}.{objectName} (manual review required)"
        };

        return Task.FromResult(result);
    }


    private Task<string> GenerateRollbackSqlForDifferenceAsync(
        SchemaDifference difference)
    {
        try
        {
            switch (difference.Type)
            {
                case DifferenceType.Added:
                    // Rollback of ADD is DROP
                    return GenerateDropSqlAsync(difference);

                case DifferenceType.Removed:
                    // Rollback of DROP is CREATE (using source definition)
                    if (string.IsNullOrEmpty(difference.SourceDefinition))
                        return Task.FromResult($"-- Cannot rollback DROP {difference.ObjectType} {difference.Schema}.{difference.ObjectName} - no source definition available");

                    var objectType = difference.ObjectType.ToString().ToLowerInvariant();
                    var schema = string.IsNullOrEmpty(difference.Schema) ? "public" : difference.Schema;
                    var objectName = difference.ObjectName;

                    return Task.FromResult($"-- Rolling back DROP {objectType} {schema}.{objectName}\n{difference.SourceDefinition}");

                case DifferenceType.Modified:
                    // Rollback of ALTER would need to restore original state
                    if (string.IsNullOrEmpty(difference.SourceDefinition))
                        return Task.FromResult($"-- Cannot rollback ALTER {difference.ObjectType} {difference.Schema}.{difference.ObjectName} - no source definition available");

                    return Task.FromResult($"-- Rolling back ALTER {difference.ObjectType} {difference.Schema}.{difference.ObjectName}\n{difference.SourceDefinition}");

                default:
                    return Task.FromResult("");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating rollback SQL for difference {ObjectType} {ObjectName}",
                difference.ObjectType, difference.ObjectName);
            return Task.FromResult($"-- ERROR generating rollback SQL for {difference.ObjectType} {difference.ObjectName}: {ex.Message}");
        }
    }

    private string GenerateCreateStatement(SchemaDifference difference, string schema, string objectName)
    {
        return difference.ObjectType switch
        {
            ObjectType.Table => GenerateCreateTableSql(difference),
            ObjectType.View => GenerateCreateViewSql(difference),
            ObjectType.Function => GenerateCreateFunctionSql(difference),
            ObjectType.Procedure => GenerateCreateProcedureSql(difference),
            ObjectType.Index => GenerateCreateIndexSql(difference),
            ObjectType.Trigger => GenerateCreateTriggerSql(difference),
            ObjectType.Sequence => GenerateCreateSequenceSql(difference),
            ObjectType.Type => GenerateCreateTypeSql(difference),
            ObjectType.Schema => GenerateCreateSchemaSql(difference),
            _ => $"-- CREATE {difference.ObjectType} {schema}.{objectName} (manual review required)\n{difference.TargetDefinition ?? ""}"
        };
    }

    private string GenerateAlterStatement(SchemaDifference difference)
    {
        var schema = string.IsNullOrEmpty(difference.Schema) ? "public" : difference.Schema;
        var objectName = difference.ObjectName;

        // For now, provide a more detailed analysis of what needs to be altered
        return difference.ObjectType switch
        {
            ObjectType.Table => GenerateAlterTableSql(difference),
            ObjectType.View => GenerateAlterViewSql(difference),
            ObjectType.Function => GenerateAlterFunctionSql(difference),
            _ => $"-- ALTER {difference.ObjectType} {schema}.{objectName} requires manual review\n" +
                 $"-- Source: {difference.SourceDefinition ?? "null"}\n" +
                 $"-- Target: {difference.TargetDefinition ?? "null"}"
        };
    }

    private string GenerateCreateTableSql(SchemaDifference difference)
    {
        if (string.IsNullOrEmpty(difference.TargetDefinition))
            return $"-- Cannot create table {difference.Schema}.{difference.ObjectName} - no definition available";

        var schema = string.IsNullOrEmpty(difference.Schema) ? "public" : difference.Schema;
        var tableName = difference.ObjectName;

        // For PostgreSQL tables, we need to handle CREATE TABLE with proper syntax
        var createSql = difference.TargetDefinition;

        // Ensure schema is included in CREATE TABLE statement if not present
        if (!createSql.Contains($"\"{schema}\".\"{tableName}\"") && !createSql.Contains($"{schema}.{tableName}"))
        {
            // Extract table definition and modify it to include schema
            var tableKeywordIndex = createSql.IndexOf("TABLE", StringComparison.OrdinalIgnoreCase);
            if (tableKeywordIndex >= 0)
            {
                var tableNameIndex = tableKeywordIndex + 5;
                var openingParenIndex = createSql.IndexOf('(', tableNameIndex);
                if (openingParenIndex > 0)
                {
                    var originalTableName = createSql.Substring(tableNameIndex, openingParenIndex - tableNameIndex).Trim();
                    createSql = createSql.Replace($"TABLE {originalTableName}", $"TABLE \"{schema}\".\"{tableName}\"");
                }
            }
        }

        // Add PostgreSQL-specific optimizations and safety checks
        var enhancedSql = new StringBuilder();
        enhancedSql.AppendLine($"-- Creating table {schema}.{tableName}");
        enhancedSql.AppendLine($"SET search_path TO {schema}, public;");
        enhancedSql.AppendLine(createSql);
        enhancedSql.AppendLine($"RESET search_path;");

        return enhancedSql.ToString();
    }

    private string GenerateCreateViewSql(SchemaDifference difference)
    {
        if (string.IsNullOrEmpty(difference.TargetDefinition))
            return $"-- Cannot create view {difference.Schema}.{difference.ObjectName} - no definition available";

        return difference.TargetDefinition;
    }

    private string GenerateCreateFunctionSql(SchemaDifference difference)
    {
        if (string.IsNullOrEmpty(difference.TargetDefinition))
            return $"-- Cannot create function {difference.Schema}.{difference.ObjectName} - no definition available";

        return difference.TargetDefinition;
    }

    private string GenerateCreateProcedureSql(SchemaDifference difference)
    {
        if (string.IsNullOrEmpty(difference.TargetDefinition))
            return $"-- Cannot create procedure {difference.Schema}.{difference.ObjectName} - no definition available";

        return difference.TargetDefinition;
    }

    private string GenerateCreateIndexSql(SchemaDifference difference)
    {
        if (string.IsNullOrEmpty(difference.TargetDefinition))
            return $"-- Cannot create index {difference.Schema}.{difference.ObjectName} - no definition available";

        return difference.TargetDefinition;
    }

    private string GenerateCreateTriggerSql(SchemaDifference difference)
    {
        if (string.IsNullOrEmpty(difference.TargetDefinition))
            return $"-- Cannot create trigger {difference.Schema}.{difference.ObjectName} - no definition available";

        return difference.TargetDefinition;
    }

    private string GenerateCreateSequenceSql(SchemaDifference difference)
    {
        if (string.IsNullOrEmpty(difference.TargetDefinition))
            return $"-- Cannot create sequence {difference.Schema}.{difference.ObjectName} - no definition available";

        return difference.TargetDefinition;
    }

    private string GenerateCreateTypeSql(SchemaDifference difference)
    {
        if (string.IsNullOrEmpty(difference.TargetDefinition))
            return $"-- Cannot create type {difference.Schema}.{difference.ObjectName} - no definition available";

        return difference.TargetDefinition;
    }

    private string GenerateCreateSchemaSql(SchemaDifference difference)
    {
        var schemaName = string.IsNullOrEmpty(difference.Schema) ? difference.ObjectName : difference.Schema;
        return $"CREATE SCHEMA IF NOT EXISTS \"{schemaName}\";";
    }

    private string GenerateAlterTableSql(SchemaDifference difference)
    {
        var sourceDef = difference.SourceDefinition ?? "";
        var targetDef = difference.TargetDefinition ?? "";
        var schema = string.IsNullOrEmpty(difference.Schema) ? "public" : difference.Schema;
        var tableName = difference.ObjectName;

        return $"-- ALTER TABLE {schema}.{tableName} requires manual review\n" +
               $"-- Source definition length: {sourceDef.Length} characters\n" +
               $"-- Target definition length: {targetDef.Length} characters\n" +
               $"-- Consider using pgAdmin or other tools for detailed diff analysis";
    }

    private string GenerateAlterViewSql(SchemaDifference difference)
    {
        if (string.IsNullOrEmpty(difference.TargetDefinition))
            return $"-- Cannot alter view {difference.Schema}.{difference.ObjectName} - no target definition available";

        var schema = string.IsNullOrEmpty(difference.Schema) ? "public" : difference.Schema;
        var viewName = difference.ObjectName;

        // For views, we typically need to DROP and CREATE
        return $"-- View alteration typically requires DROP and CREATE\n" +
               $"DROP VIEW IF EXISTS \"{schema}\".\"{viewName}\";\n\n" +
               $"{difference.TargetDefinition}";
    }

    private string GenerateAlterFunctionSql(SchemaDifference difference)
    {
        if (string.IsNullOrEmpty(difference.TargetDefinition))
            return $"-- Cannot alter function {difference.Schema}.{difference.ObjectName} - no target definition available";

        var schema = string.IsNullOrEmpty(difference.Schema) ? "public" : difference.Schema;
        var functionName = difference.ObjectName;

        // For functions, we typically need to DROP and CREATE
        return $"-- Function alteration typically requires DROP and CREATE\n" +
               $"DROP FUNCTION IF EXISTS \"{schema}\".\"{functionName}\";\n\n" +
               $"{difference.TargetDefinition}";
    }

    private List<SchemaDifference> OrderByDependencies(List<SchemaDifference> differences, bool isReverse)
    {
        if (!differences.Any())
            return differences;

        // Enhanced dependency ordering based on object types and relationships
        var ordered = new List<SchemaDifference>();

        // Separate by object types for proper ordering
        var schemas = differences.Where(d => d.ObjectType == ObjectType.Schema).ToList();
        var types = differences.Where(d => d.ObjectType == ObjectType.Type || d.ObjectType == ObjectType.Domain).ToList();
        var sequences = differences.Where(d => d.ObjectType == ObjectType.Sequence).ToList();
        var tables = differences.Where(d => d.ObjectType == ObjectType.Table).ToList();
        var functions = differences.Where(d => d.ObjectType == ObjectType.Function || d.ObjectType == ObjectType.Procedure).ToList();
        var views = differences.Where(d => d.ObjectType == ObjectType.View).ToList();
        var indexes = differences.Where(d => d.ObjectType == ObjectType.Index).ToList();
        var triggers = differences.Where(d => d.ObjectType == ObjectType.Trigger).ToList();
        var constraints = differences.Where(d => d.ObjectType == ObjectType.Constraint).ToList();
        var others = differences.Where(d => !schemas.Contains(d)
                && !types.Contains(d)
                && !sequences.Contains(d)
                && !tables.Contains(d)
                && !functions.Contains(d)
                && !views.Contains(d)
                && !indexes.Contains(d)
                && !triggers.Contains(d)
                && !constraints.Contains(d)
        ).ToList();

        if (isReverse)
        {
            ordered.AddRange(constraints);
            ordered.AddRange(triggers);
            ordered.AddRange(indexes);
            ordered.AddRange(views);
            ordered.AddRange(functions);
            ordered.AddRange(tables);
            ordered.AddRange(sequences);
            ordered.AddRange(types);
            ordered.AddRange(schemas);
            ordered.AddRange(others);
        }
        else
        {
            ordered.AddRange(schemas);
            ordered.AddRange(types);
            ordered.AddRange(sequences);
            ordered.AddRange(tables);
            ordered.AddRange(functions);
            ordered.AddRange(views);
            ordered.AddRange(indexes);
            ordered.AddRange(triggers);
            ordered.AddRange(constraints);
            ordered.AddRange(others);
        }

        _logger.LogDebug("Ordered {Count} differences by dependencies: {OrderedTypes}",
            differences.Count, string.Join(", ", ordered.Select(d => d.ObjectType.ToString())));

        return ordered;
    }

    public void Dispose()
    {
        _logger.LogInformation("MigrationScriptGenerator disposed");
    }
}