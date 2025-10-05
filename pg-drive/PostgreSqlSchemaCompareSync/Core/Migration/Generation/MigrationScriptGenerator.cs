

namespace PostgreSqlSchemaCompareSync.Core.Migration.Generation;

/// <summary>
/// Advanced migration script generator with PostgreSQL-specific optimizations
/// </summary>
public class MigrationScriptGenerator(
    ILogger<MigrationScriptGenerator> logger,
    IOptions<AppSettings> settings) : IMigrationScriptGenerator
{
    private readonly ILogger<MigrationScriptGenerator> _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    private readonly AppSettings _settings = settings?.Value ?? throw new ArgumentNullException(nameof(settings));

    /// <summary>
    /// Generates a migration script from schema comparison
    /// </summary>
    public async Task<MigrationScript> GenerateMigrationScriptAsync(
        SchemaComparison comparison,
        MigrationOptions options,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(comparison);
        ArgumentNullException.ThrowIfNull(options);

        try
        {
            _logger.LogInformation("Generating migration script for comparison {ComparisonId}", comparison.Id);

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
            var sqlScript = await GenerateSqlScriptAsync(comparison.Differences, options, cancellationToken);

            // Generate rollback script if requested
            string rollbackScript = "";
            if (options.GenerateRollbackScript)
            {
                rollbackScript = await GenerateRollbackScriptAsync(comparison.Differences, options, cancellationToken);
            }

            script.SqlScript = sqlScript;
            script.RollbackScript = rollbackScript;

            _logger.LogInformation("Migration script generated: {OperationCount} operations",
                script.OperationCount);

            return script;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to generate migration script for comparison {ComparisonId}", comparison.Id);
            throw new MigrationException($"Migration script generation failed: {ex.Message}", comparison.SourceConnection.Id, Guid.NewGuid().ToString(), ex);
        }
    }

    /// <summary>
    /// Generates optimized SQL script from differences
    /// </summary>
    private async Task<string> GenerateSqlScriptAsync(
        List<SchemaDifference> differences,
        MigrationOptions options,
        CancellationToken cancellationToken)
    {
        var script = new StringBuilder();

        try
        {
            // Group differences by type for optimal execution order
            var addedObjects = differences.Where(d => d.Type == DifferenceType.Added).ToList();
            var modifiedObjects = differences.Where(d => d.Type == DifferenceType.Modified).ToList();
            var removedObjects = differences.Where(d => d.Type == DifferenceType.Removed).ToList();

            // Process in safe order: removes first, then modifies, then adds
            foreach (var difference in removedObjects.Concat(modifiedObjects).Concat(addedObjects))
            {
                cancellationToken.ThrowIfCancellationRequested();

                var sql = await GenerateSqlForDifferenceAsync(difference, options, cancellationToken);
                if (!string.IsNullOrEmpty(sql))
                {
                    script.AppendLine(sql);
                    script.AppendLine();
                }
            }

            return script.ToString().Trim();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating SQL script");
            throw new MigrationException($"SQL script generation failed: {ex.Message}", Guid.NewGuid().ToString(), Guid.NewGuid().ToString(), ex);
        }
    }

    /// <summary>
    /// Generates rollback script from differences
    /// </summary>
    private async Task<string> GenerateRollbackScriptAsync(
        List<SchemaDifference> differences,
        MigrationOptions options,
        CancellationToken cancellationToken)
    {
        var script = new StringBuilder();

        try
        {
            // Process differences in reverse order for rollback
            var reversedDifferences = differences.AsEnumerable().Reverse().ToList();

            foreach (var difference in reversedDifferences)
            {
                cancellationToken.ThrowIfCancellationRequested();

                var rollbackSql = await GenerateRollbackSqlForDifferenceAsync(difference, options, cancellationToken);
                if (!string.IsNullOrEmpty(rollbackSql))
                {
                    script.AppendLine(rollbackSql);
                    script.AppendLine();
                }
            }

            return script.ToString().Trim();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating rollback script");
            throw new MigrationException($"Rollback script generation failed: {ex.Message}", Guid.NewGuid().ToString(), Guid.NewGuid().ToString(), ex);
        }
    }

    /// <summary>
    /// Generates SQL for a specific difference
    /// </summary>
    private async Task<string> GenerateSqlForDifferenceAsync(
        SchemaDifference difference,
        MigrationOptions options,
        CancellationToken cancellationToken)
    {
        try
        {
            switch (difference.Type)
            {
                case DifferenceType.Added:
                    return await GenerateCreateSqlAsync(difference, options, cancellationToken);

                case DifferenceType.Removed:
                    return await GenerateDropSqlAsync(difference, options, cancellationToken);

                case DifferenceType.Modified:
                    return await GenerateAlterSqlAsync(difference, options, cancellationToken);

                default:
                    _logger.LogWarning("Unknown difference type: {DifferenceType}", difference.Type);
                    return "";
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating SQL for difference {ObjectType} {ObjectName}",
                difference.ObjectType, difference.ObjectName);
            return $"-- ERROR generating SQL for {difference.ObjectType} {difference.ObjectName}: {ex.Message}";
        }
    }

    /// <summary>
    /// Generates CREATE SQL for added objects
    /// </summary>
    private Task<string> GenerateCreateSqlAsync(
        SchemaDifference difference,
        MigrationOptions options,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(difference.TargetDefinition))
            return Task.FromResult("");

        var objectType = difference.ObjectType.ToString().ToLowerInvariant();
        var schema = string.IsNullOrEmpty(difference.Schema) ? "public" : difference.Schema;
        var objectName = difference.ObjectName;

        // For complex objects, use the target definition directly
        // In a production system, this would involve more sophisticated SQL parsing and generation
        return Task.FromResult($"-- Creating {objectType} {schema}.{objectName}\n{difference.TargetDefinition}");
    }

    /// <summary>
    /// Generates DROP SQL for removed objects
    /// </summary>
    private Task<string> GenerateDropSqlAsync(
        SchemaDifference difference,
        MigrationOptions options,
        CancellationToken cancellationToken)
    {
        var objectType = difference.ObjectType.ToString().ToUpperInvariant();
        var schema = string.IsNullOrEmpty(difference.Schema) ? "public" : difference.Schema;
        var objectName = difference.ObjectName;

        // Generate appropriate DROP statement with CASCADE for safety
        var result = difference.ObjectType switch
        {
            ObjectType.Table => $"DROP TABLE IF EXISTS \"{schema}\".\"{objectName}\" CASCADE;",
            ObjectType.View => $"DROP VIEW IF EXISTS \"{schema}\".\"{objectName}\" CASCADE;",
            ObjectType.Index => $"DROP INDEX IF EXISTS \"{schema}\".\"{objectName}\" CASCADE;",
            ObjectType.Function or ObjectType.Procedure => $"DROP FUNCTION IF EXISTS \"{schema}\".\"{objectName}\" CASCADE;",
            ObjectType.Trigger => $"DROP TRIGGER IF EXISTS \"{objectName}\" ON \"{schema}\".* CASCADE;",
            ObjectType.Schema => $"DROP SCHEMA IF EXISTS \"{objectName}\" CASCADE;",
            ObjectType.Type => $"DROP TYPE IF EXISTS \"{schema}\".\"{objectName}\" CASCADE;",
            ObjectType.Sequence => $"DROP SEQUENCE IF EXISTS \"{schema}\".\"{objectName}\" CASCADE;",
            _ => $"-- DROP {objectType} {schema}.{objectName} (manual review required)"
        };

        return Task.FromResult(result);
    }

    /// <summary>
    /// Generates ALTER SQL for modified objects
    /// </summary>
    private Task<string> GenerateAlterSqlAsync(
        SchemaDifference difference,
        MigrationOptions options,
        CancellationToken cancellationToken)
    {
        // For modified objects, we'd need more sophisticated diff analysis
        // For now, return a placeholder that requires manual review
        var result = $"-- ALTER {difference.ObjectType} {difference.Schema}.{difference.ObjectName} requires manual review\n" +
                    $"-- Source: {difference.SourceDefinition?.Substring(0, Math.Min(200, difference.SourceDefinition?.Length ?? 0)) ?? "null"}\n" +
                    $"-- Target: {difference.TargetDefinition?.Substring(0, Math.Min(200, difference.TargetDefinition?.Length ?? 0)) ?? "null"}";

        return Task.FromResult(result);
    }

    /// <summary>
    /// Generates rollback SQL for a specific difference
    /// </summary>
    private async Task<string> GenerateRollbackSqlForDifferenceAsync(
        SchemaDifference difference,
        MigrationOptions options,
        CancellationToken cancellationToken)
    {
        try
        {
            switch (difference.Type)
            {
                case DifferenceType.Added:
                    // Rollback of ADD is DROP
                    return await GenerateDropSqlAsync(difference, options, cancellationToken);

                case DifferenceType.Removed:
                    // Rollback of DROP is CREATE (using source definition)
                    if (string.IsNullOrEmpty(difference.SourceDefinition))
                        return $"-- Cannot rollback DROP {difference.ObjectType} {difference.Schema}.{difference.ObjectName} - no source definition available";

                    var objectType = difference.ObjectType.ToString().ToLowerInvariant();
                    var schema = string.IsNullOrEmpty(difference.Schema) ? "public" : difference.Schema;
                    var objectName = difference.ObjectName;

                    return $"-- Rolling back DROP {objectType} {schema}.{objectName}\n{difference.SourceDefinition}";

                case DifferenceType.Modified:
                    // Rollback of ALTER would need to restore original state
                    if (string.IsNullOrEmpty(difference.SourceDefinition))
                        return $"-- Cannot rollback ALTER {difference.ObjectType} {difference.Schema}.{difference.ObjectName} - no source definition available";

                    return $"-- Rolling back ALTER {difference.ObjectType} {difference.Schema}.{difference.ObjectName}\n{difference.SourceDefinition}";

                default:
                    return "";
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating rollback SQL for difference {ObjectType} {ObjectName}",
                difference.ObjectType, difference.ObjectName);
            return $"-- ERROR generating rollback SQL for {difference.ObjectType} {difference.ObjectName}: {ex.Message}";
        }
    }

    public void Dispose()
    {
        _logger.LogInformation("MigrationScriptGenerator disposed");
    }
}