using PostgreSqlSchemaCompareSync.Infrastructure.Exceptions;

namespace PostgreSqlSchemaCompareSync.Core.Migration
{
    /// <summary>
    /// Implementation of migration script generation
    /// </summary>
    public class MigrationGenerator : IMigrationGenerator
    {
        private readonly ILogger<MigrationGenerator> _logger;
        private readonly AppSettings _settings;
        private bool _disposed;

        public MigrationGenerator(
            ILogger<MigrationGenerator> logger,
            IOptions<AppSettings> settings)
        {
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
            _settings = settings?.Value ?? throw new ArgumentNullException(nameof(settings));
        }

        /// <summary>
        /// Generates a migration script from schema differences
        /// </summary>
        public async Task<MigrationScript> GenerateMigrationAsync(
            Core.Models.SchemaComparison comparison,
            MigrationOptions options,
            CancellationToken cancellationToken = default)
        {
            if (comparison == null)
                throw new ArgumentNullException(nameof(comparison));
            if (options == null)
                throw new ArgumentNullException(nameof(options));

            try
            {
                _logger.LogInformation("Generating migration script for comparison {ComparisonId}", comparison.Id);

                var migration = new MigrationScript
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
                    rollbackScript = await GenerateRollbackScriptAsync(migration, cancellationToken);
                }

                migration.SqlScript = sqlScript;
                migration.RollbackScript = rollbackScript;

                _logger.LogInformation("Migration script generated: {OperationCount} operations",
                    migration.OperationCount);

                return migration;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to generate migration for comparison {ComparisonId}", comparison.Id);
                throw new MigrationException($"Migration generation failed: {ex.Message}", comparison.SourceConnection.Id, Guid.NewGuid().ToString(), ex);
            }
        }

        /// <summary>
        /// Generates a rollback script for a migration
        /// </summary>
        public async Task<string> GenerateRollbackScriptAsync(
            MigrationScript migration,
            CancellationToken cancellationToken = default)
        {
            if (migration == null)
                throw new ArgumentNullException(nameof(migration));

            try
            {
                _logger.LogDebug("Generating rollback script for migration {MigrationId}", migration.Id);

                var rollbackScript = new StringBuilder();

                // Process differences in reverse order for rollback
                var reversedDifferences = migration.SelectedDifferences.AsEnumerable().Reverse().ToList();

                foreach (var difference in reversedDifferences)
                {
                    cancellationToken.ThrowIfCancellationRequested();

                    var rollbackSql = await GenerateRollbackSqlForDifferenceAsync(difference, cancellationToken);
                    if (!string.IsNullOrEmpty(rollbackSql))
                    {
                        rollbackScript.AppendLine(rollbackSql);
                        rollbackScript.AppendLine("GO"); // SQL Server style separator, can be changed for PostgreSQL
                    }
                }

                var result = rollbackScript.ToString().Trim();
                _logger.LogDebug("Rollback script generated: {OperationCount} operations", result.Split('\n').Length);

                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to generate rollback script for migration {MigrationId}", migration.Id);
                throw new MigrationException($"Rollback script generation failed: {ex.Message}", Guid.NewGuid().ToString(), migration.Id, ex);
            }
        }

        /// <summary>
        /// Validates a migration script for safety and correctness
        /// </summary>
        public Task<MigrationValidationResult> ValidateMigrationAsync(
            MigrationScript migration,
            CancellationToken cancellationToken = default)
        {
            if (migration == null)
                throw new ArgumentNullException(nameof(migration));

            var result = new MigrationValidationResult
            {
                IsValid = true,
                Errors = [],
                Warnings = [],
                EstimatedExecutionTime = TimeSpan.FromSeconds(migration.OperationCount * 0.1) // Rough estimate
            };

            try
            {
                _logger.LogDebug("Validating migration {MigrationId}", migration.Id);

                // Check for dangerous operations
                var dangerousOps = new[] { "DROP TABLE", "DROP SCHEMA", "TRUNCATE", "DELETE FROM" };
                var highRiskOps = new[] { "DROP", "ALTER TABLE" };

                var scriptUpper = migration.SqlScript.ToUpperInvariant();

                if (dangerousOps.Any(op => scriptUpper.Contains(op)))
                {
                    result.RiskLevel = MigrationRiskLevel.Critical;
                    result.Warnings.Add("Migration contains potentially destructive operations");
                }
                else if (highRiskOps.Any(op => scriptUpper.Contains(op)))
                {
                    result.RiskLevel = MigrationRiskLevel.High;
                    result.Warnings.Add("Migration contains high-risk operations");
                }
                else if (migration.OperationCount > 100)
                {
                    result.RiskLevel = MigrationRiskLevel.Medium;
                    result.Warnings.Add($"Large migration with {migration.OperationCount} operations");
                }
                else
                {
                    result.RiskLevel = MigrationRiskLevel.Low;
                }

                // Validate SQL syntax (basic checks)
                if (migration.SqlScript.Contains(";;"))
                {
                    result.IsValid = false;
                    result.Errors.Add("Double semicolons detected - potential SQL syntax error");
                }

                if (migration.SqlScript.Contains("BEGIN") && !migration.SqlScript.Contains("COMMIT|ROLLBACK"))
                {
                    result.Warnings.Add("Transaction started but not properly closed");
                }

                // Check for common issues
                if (migration.SqlScript.Contains("DROP TABLE") && !migration.RollbackScript.Contains("CREATE TABLE"))
                {
                    result.Warnings.Add("DROP TABLE operation without corresponding CREATE in rollback");
                }

                _logger.LogDebug("Migration validation completed: Valid={IsValid}, Risk={RiskLevel}",
                    result.IsValid, result.RiskLevel);

                return Task.FromResult(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Migration validation failed for {MigrationId}", migration.Id);
                result.IsValid = false;
                result.Errors.Add($"Validation error: {ex.Message}");
                return Task.FromResult(result);
            }
        }

        /// <summary>
        /// Generates SQL script from schema differences
        /// </summary>
        private async Task<string> GenerateSqlScriptAsync(
            List<Core.Models.SchemaDifference> differences,
            MigrationOptions options,
            CancellationToken cancellationToken)
        {
            var script = new StringBuilder();

            try
            {
                // Group differences by type for proper ordering
                var addedObjects = differences.Where(d => d.Type == Core.Models.DifferenceType.Added).ToList();
                var modifiedObjects = differences.Where(d => d.Type == Core.Models.DifferenceType.Modified).ToList();
                var removedObjects = differences.Where(d => d.Type == Core.Models.DifferenceType.Removed).ToList();

                // Process in safe order: removes first, then modifies, then adds
                foreach (var difference in removedObjects.Concat(modifiedObjects).Concat(addedObjects))
                {
                    cancellationToken.ThrowIfCancellationRequested();

                    var sql = await GenerateSqlForDifferenceAsync(difference, options, cancellationToken);
                    if (!string.IsNullOrEmpty(sql))
                    {
                        script.AppendLine(sql);
                        script.AppendLine("GO"); // SQL Server style separator
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
        /// Generates SQL for a specific difference
        /// </summary>
        private async Task<string> GenerateSqlForDifferenceAsync(
            Core.Models.SchemaDifference difference,
            MigrationOptions options,
            CancellationToken cancellationToken)
        {
            try
            {
                switch (difference.Type)
                {
                    case Core.Models.DifferenceType.Added:
                        return await GenerateCreateSqlAsync(difference, options, cancellationToken);

                    case Core.Models.DifferenceType.Removed:
                        return await GenerateDropSqlAsync(difference, options, cancellationToken);

                    case Core.Models.DifferenceType.Modified:
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
            Core.Models.SchemaDifference difference,
            MigrationOptions options,
            CancellationToken cancellationToken)
        {
            if (string.IsNullOrEmpty(difference.TargetDefinition))
                return Task.FromResult("");

            var objectType = difference.ObjectType.ToString().ToLowerInvariant();
            var schema = string.IsNullOrEmpty(difference.Schema) ? "public" : difference.Schema;
            var objectName = difference.ObjectName;

            // Basic CREATE statement - this would need more sophisticated parsing for complex objects
            return Task.FromResult($"-- Creating {objectType} {schema}.{objectName}\n{difference.TargetDefinition}");
        }

        /// <summary>
        /// Generates DROP SQL for removed objects
        /// </summary>
        private Task<string> GenerateDropSqlAsync(
            Core.Models.SchemaDifference difference,
            MigrationOptions options,
            CancellationToken cancellationToken)
        {
            var objectType = difference.ObjectType.ToString().ToUpperInvariant();
            var schema = string.IsNullOrEmpty(difference.Schema) ? "public" : difference.Schema;
            var objectName = difference.ObjectName;

            // Generate appropriate DROP statement
            var result = difference.ObjectType switch
            {
                ObjectType.Table => $"DROP TABLE IF EXISTS \"{schema}\".\"{objectName}\" CASCADE;",
                ObjectType.View => $"DROP VIEW IF EXISTS \"{schema}\".\"{objectName}\" CASCADE;",
                ObjectType.Index => $"DROP INDEX IF EXISTS \"{schema}\".\"{objectName}\" CASCADE;",
                ObjectType.Function or ObjectType.Procedure => $"DROP FUNCTION IF EXISTS \"{schema}\".\"{objectName}\" CASCADE;",
                ObjectType.Trigger => $"DROP TRIGGER IF EXISTS \"{objectName}\" ON \"{schema}\".* CASCADE;",
                ObjectType.Schema => $"DROP SCHEMA IF EXISTS \"{objectName}\" CASCADE;",
                _ => $"-- DROP {objectType} {schema}.{objectName} (manual review required)"
            };

            return Task.FromResult(result);
        }

        /// <summary>
        /// Generates ALTER SQL for modified objects
        /// </summary>
        private Task<string> GenerateAlterSqlAsync(
            Core.Models.SchemaDifference difference,
            MigrationOptions options,
            CancellationToken cancellationToken)
        {
            // For modified objects, we'd need more sophisticated diff analysis
            // For now, return a placeholder
            return Task.FromResult($"-- ALTER {difference.ObjectType} {difference.Schema}.{difference.ObjectName} requires manual review");
        }

        /// <summary>
        /// Generates rollback SQL for a specific difference
        /// </summary>
        private async Task<string> GenerateRollbackSqlForDifferenceAsync(
            Core.Models.SchemaDifference difference,
            CancellationToken cancellationToken)
        {
            try
            {
                switch (difference.Type)
                {
                    case Core.Models.DifferenceType.Added:
                        // Rollback of ADD is DROP
                        var dropResult = await GenerateDropSqlAsync(difference, new MigrationOptions(), cancellationToken);
                        return dropResult;

                    case Core.Models.DifferenceType.Removed:
                        // Rollback of DROP is CREATE
                        var createResult = await GenerateCreateSqlAsync(difference, new MigrationOptions(), cancellationToken);
                        return createResult;

                    case Core.Models.DifferenceType.Modified:
                        // Rollback of ALTER would need to restore original state
                        return $"-- Rollback ALTER {difference.ObjectType} {difference.Schema}.{difference.ObjectName} requires manual review";

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
            if (!_disposed)
            {
                _disposed = true;
                _logger.LogInformation("MigrationGenerator disposed");
            }
        }
    }
}