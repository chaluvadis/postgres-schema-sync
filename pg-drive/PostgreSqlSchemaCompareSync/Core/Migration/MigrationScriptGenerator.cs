namespace PostgreSqlSchemaCompareSync.Core.Migration;

public class MigrationScriptGenerator(ILogger<MigrationScriptGenerator> logger) : IMigrationScriptGenerator
{
    public async Task<MigrationScript> GenerateMigrationScriptAsync(
        SchemaComparison comparison,
        MigrationOptions options,
        CancellationToken ct = default)
    {
        var startTime = DateTime.UtcNow;
        var operationId = Guid.NewGuid().ToString();

        try
        {
            ArgumentNullException.ThrowIfNull(options);
            ArgumentNullException.ThrowIfNull(comparison);

            logger.LogInformation("Starting enhanced migration script generation for comparison {ComparisonId} (Operation: {OperationId})",
                comparison.Id, operationId);

            if (comparison.Differences == null || comparison.Differences.Count == 0)
            {
                logger.LogWarning("No differences found in comparison {ComparisonId}", comparison.Id);
                return new MigrationScript
                {
                    Id = operationId,
                    Comparison = comparison,
                    SelectedDifferences = comparison.Differences ?? [],
                    Type = options.Type,
                    IsDryRun = options.IsDryRun,
                    Status = MigrationStatus.Completed,
                    CreatedAt = DateTime.UtcNow,
                    SqlScript = "-- No differences found - no migration script needed",
                    ExecutionLog = $"[{DateTime.UtcNow:HH:mm:ss}] INFO: No differences found, script generation completed in 0ms"
                };
            }

            logger.LogInformation("Generating enhanced migration script for {DifferenceCount} differences with batch size {BatchSize}",
                comparison.Differences.Count, options.BatchSize);

            var script = new MigrationScript
            {
                Id = operationId,
                Comparison = comparison,
                SelectedDifferences = comparison.Differences,
                Type = options.Type,
                IsDryRun = options.IsDryRun,
                Status = MigrationStatus.Running,
                CreatedAt = DateTime.UtcNow,
                ExecutionLog = $"[{DateTime.UtcNow:HH:mm:ss}] INFO: Starting migration script generation for {comparison.Differences.Count} differences"
            };

            // Enhanced SQL script generation with real-time optimizations
            var (sqlScript, executionLog) = await GenerateEnhancedSqlScriptAsync(comparison.Differences, options, ct);

            // Generate enhanced rollback script if requested
            string rollbackScript = "";
            string rollbackLog = "";
            if (options.GenerateRollbackScript)
            {
                (rollbackScript, rollbackLog) = await GenerateEnhancedRollbackScriptAsync(comparison.Differences, options, ct);
            }

            script.SqlScript = sqlScript;
            script.RollbackScript = rollbackScript;
            script.Status = MigrationStatus.Completed;
            script.ExecutionTime = DateTime.UtcNow - startTime;
            script.ExecutionLog = $"{executionLog}\n{rollbackLog}[{DateTime.UtcNow:HH:mm:ss}] INFO: Migration script generation completed successfully in {script.ExecutionTime?.TotalMilliseconds ?? 0}ms";

            logger.LogInformation("Enhanced migration script generated successfully: {OperationCount} operations, {ScriptLength} characters, {ExecutionTime}ms",
                script.OperationCount, sqlScript.Length, script.ExecutionTime?.TotalMilliseconds ?? 0);

            return script;
        }
        catch (OperationCanceledException)
        {
            logger.LogWarning("Migration script generation was cancelled for comparison {ComparisonId} (Operation: {OperationId})", comparison?.Id, operationId);
            throw;
        }
        catch (Exception ex)
        {
            var executionTime = DateTime.UtcNow - startTime;
            logger.LogError(ex, "Failed to generate enhanced migration script for comparison {ComparisonId} (Operation: {OperationId}) after {ExecutionTime}ms",
                comparison?.Id, operationId, executionTime.TotalMilliseconds);

            throw new MigrationException($"Enhanced migration script generation failed: {ex.Message}",
                comparison?.SourceConnection?.Id ?? "unknown",
                operationId, ex);
        }
    }

    private async Task<(string sqlScript, string executionLog)> GenerateEnhancedSqlScriptAsync(
        List<SchemaDifference> differences,
        MigrationOptions options,
        CancellationToken ct)
    {
        var executionLog = new StringBuilder();
        var script = new StringBuilder();
        var processedCount = 0;
        var startTime = DateTime.UtcNow;

        try
        {
            executionLog.AppendLine($"[{DateTime.UtcNow:HH:mm:ss}] INFO: Starting enhanced SQL script generation for {differences.Count} differences");

            // Group differences by type for optimal execution order
            var addedObjects = differences.Where(d => d.Type == DifferenceType.Added).ToList();
            var modifiedObjects = differences.Where(d => d.Type == DifferenceType.Modified).ToList();
            var removedObjects = differences.Where(d => d.Type == DifferenceType.Removed).ToList();

            executionLog.AppendLine($"[{DateTime.UtcNow:HH:mm:ss}] INFO: Categorized differences - Added: {addedObjects.Count}, Modified: {modifiedObjects.Count}, Removed: {removedObjects.Count}");

            // Sort objects by dependency order for safe execution
            var orderedRemovals = OrderByDependencies(removedObjects, isReverse: true);
            var orderedModifications = OrderByDependencies(modifiedObjects, isReverse: false);
            var orderedAdditions = OrderByDependencies(addedObjects, isReverse: false);

            executionLog.AppendLine($"[{DateTime.UtcNow:HH:mm:ss}] INFO: Ordered differences by dependencies");

            // Process in safe order: removes first, then modifies, then adds
            var allOrderedDifferences = orderedRemovals.Concat(orderedModifications).Concat(orderedAdditions).ToList();

            // Process in batches for real-time progress tracking
            for (int i = 0; i < allOrderedDifferences.Count; i += options.BatchSize)
            {
                ct.ThrowIfCancellationRequested();

                var batch = allOrderedDifferences.Skip(i).Take(options.BatchSize).ToList();
                var batchStartTime = DateTime.UtcNow;

                executionLog.AppendLine($"[{DateTime.UtcNow:HH:mm:ss}] INFO: Processing batch {i / options.BatchSize + 1} with {batch.Count} differences");

                foreach (var difference in batch)
                {
                    ct.ThrowIfCancellationRequested();

                    var sql = GenerateSqlForDifference(difference);
                    if (!string.IsNullOrEmpty(sql))
                    {
                        script.AppendLine(sql);
                        script.AppendLine();
                        processedCount++;

                        executionLog.AppendLine($"[{DateTime.UtcNow:HH:mm:ss}] DEBUG: Generated SQL for {difference.ObjectType} {difference.Schema}.{difference.ObjectName}");
                    }
                }

                var batchExecutionTime = DateTime.UtcNow - batchStartTime;
                executionLog.AppendLine($"[{DateTime.UtcNow:HH:mm:ss}] INFO: Batch {i / options.BatchSize + 1} completed in {batchExecutionTime.TotalMilliseconds}ms");

                // Remove artificial delay - not needed for real processing
                // if (i + options.BatchSize < allOrderedDifferences.Count)
                // {
                //     await Task.Delay(10, ct);
                // }
            }

            var totalExecutionTime = DateTime.UtcNow - startTime;
            executionLog.AppendLine($"[{DateTime.UtcNow:HH:mm:ss}] INFO: SQL script generation completed - Processed: {processedCount}/{differences.Count}, Time: {totalExecutionTime.TotalMilliseconds}ms");

            return (script.ToString().Trim(), executionLog.ToString());
        }
        catch (Exception ex)
        {
            executionLog.AppendLine($"[{DateTime.UtcNow:HH:mm:ss}] ERROR: SQL script generation failed: {ex.Message}");
            logger.LogError(ex, "Error in enhanced SQL script generation");
            throw new MigrationException($"Enhanced SQL script generation failed: {ex.Message}", Guid.NewGuid().ToString(), Guid.NewGuid().ToString(), ex);
        }
    }

    private async Task<(string rollbackScript, string executionLog)> GenerateEnhancedRollbackScriptAsync(
        List<SchemaDifference> differences,
        MigrationOptions options,
        CancellationToken ct)
    {
        var executionLog = new StringBuilder();
        var script = new StringBuilder();
        var processedCount = 0;
        var startTime = DateTime.UtcNow;

        try
        {
            executionLog.AppendLine($"[{DateTime.UtcNow:HH:mm:ss}] INFO: Starting enhanced rollback script generation for {differences.Count} differences");

            var reversedDifferences = differences.AsEnumerable().Reverse().ToList();

            // Process rollback in batches as well
            for (int i = 0; i < reversedDifferences.Count; i += options.BatchSize)
            {
                ct.ThrowIfCancellationRequested();

                var batch = reversedDifferences.Skip(i).Take(options.BatchSize).ToList();

                executionLog.AppendLine($"[{DateTime.UtcNow:HH:mm:ss}] INFO: Processing rollback batch {i / options.BatchSize + 1} with {batch.Count} differences");

                foreach (var difference in batch)
                {
                    ct.ThrowIfCancellationRequested();

                    var rollbackSql = GenerateRollbackSqlForDifference(difference);
                    if (!string.IsNullOrEmpty(rollbackSql))
                    {
                        script.AppendLine(rollbackSql);
                        script.AppendLine();
                        processedCount++;

                        executionLog.AppendLine($"[{DateTime.UtcNow:HH:mm:ss}] DEBUG: Generated rollback SQL for {difference.ObjectType} {difference.Schema}.{difference.ObjectName}");
                    }
                }

                // Removed artificial delay for better performance
            }

            var totalExecutionTime = DateTime.UtcNow - startTime;
            executionLog.AppendLine($"[{DateTime.UtcNow:HH:mm:ss}] INFO: Rollback script generation completed - Processed: {processedCount}/{differences.Count}, Time: {totalExecutionTime.TotalMilliseconds}ms");

            return (script.ToString().Trim(), executionLog.ToString());
        }
        catch (Exception ex)
        {
            executionLog.AppendLine($"[{DateTime.UtcNow:HH:mm:ss}] ERROR: Rollback script generation failed: {ex.Message}");
            logger.LogError(ex, "Error in enhanced rollback script generation");
            throw new MigrationException($"Enhanced rollback script generation failed: {ex.Message}", Guid.NewGuid().ToString(), Guid.NewGuid().ToString(), ex);
        }
    }

    public async Task<MigrationScript> GenerateMigrationScriptAsync(
        SchemaComparison comparison,
        MigrationOptions options,
        IProgress<MigrationProgressReport>? progress,
        CancellationToken cancellationToken = default)
    {
        var startTime = DateTime.UtcNow;
        var operationId = Guid.NewGuid().ToString();

        try
        {
            ArgumentNullException.ThrowIfNull(options);
            ArgumentNullException.ThrowIfNull(comparison);

            logger.LogInformation("Starting progress-enabled migration script generation for comparison {ComparisonId} (Operation: {OperationId})",
                comparison.Id, operationId);

            if (comparison.Differences == null || comparison.Differences.Count == 0)
            {
                var report = new MigrationProgressReport
                {
                    TotalDifferences = 0,
                    ProcessedDifferences = 0,
                    Status = MigrationStatus.Completed,
                    ElapsedTime = DateTime.UtcNow - startTime,
                    CurrentOperation = "No differences found"
                };
                progress?.Report(report);

                return new MigrationScript
                {
                    Id = operationId,
                    Comparison = comparison,
                    SelectedDifferences = comparison.Differences ?? [],
                    Type = options.Type,
                    IsDryRun = options.IsDryRun,
                    Status = MigrationStatus.Completed,
                    CreatedAt = DateTime.UtcNow,
                    SqlScript = "-- No differences found - no migration script needed",
                    ExecutionLog = $"[{DateTime.UtcNow:HH:mm:ss}] INFO: No differences found, script generation completed in 0ms"
                };
            }

            // Initialize progress reporting
            var progressReport = new MigrationProgressReport
            {
                TotalDifferences = comparison.Differences.Count,
                ProcessedDifferences = 0,
                Status = MigrationStatus.Running,
                ElapsedTime = DateTime.UtcNow - startTime,
                CurrentOperation = "Initializing script generation"
            };
            progress?.Report(progressReport);

            logger.LogInformation("Generating progress-enabled migration script for {DifferenceCount} differences", comparison.Differences.Count);

            var script = new MigrationScript
            {
                Id = operationId,
                Comparison = comparison,
                SelectedDifferences = comparison.Differences,
                Type = options.Type,
                IsDryRun = options.IsDryRun,
                Status = MigrationStatus.Running,
                CreatedAt = DateTime.UtcNow,
                ExecutionLog = $"[{DateTime.UtcNow:HH:mm:ss}] INFO: Starting progress-enabled migration script generation for {comparison.Differences.Count} differences"
            };

            // Generate enhanced SQL script with progress reporting
            var (sqlScript, executionLog) = await GenerateProgressEnabledSqlScriptAsync(
                comparison.Differences, options, progress, progressReport, cancellationToken);

            // Generate enhanced rollback script if requested
            string rollbackScript = "";
            string rollbackLog = "";
            if (options.GenerateRollbackScript)
            {
                (rollbackScript, rollbackLog) = await GenerateProgressEnabledRollbackScriptAsync(
                    comparison.Differences, options, progress, progressReport, cancellationToken);
            }

            script.SqlScript = sqlScript;
            script.RollbackScript = rollbackScript;
            script.Status = MigrationStatus.Completed;
            script.ExecutionTime = DateTime.UtcNow - startTime;
            script.ExecutionLog = $"{executionLog}\n{rollbackLog}[{DateTime.UtcNow:HH:mm:ss}] INFO: Progress-enabled migration script generation completed successfully in {script.ExecutionTime?.TotalMilliseconds ?? 0}ms";

            // Final progress report
            progressReport.Status = MigrationStatus.Completed;
            progressReport.ProcessedDifferences = comparison.Differences.Count;
            progressReport.ElapsedTime = script.ExecutionTime ?? TimeSpan.Zero;
            progressReport.CurrentOperation = "Migration script generation completed";
            progress?.Report(progressReport);

            logger.LogInformation("Progress-enabled migration script generated successfully: {OperationCount} operations, {ScriptLength} characters, {ExecutionTime}ms",
                script.OperationCount, sqlScript.Length, script.ExecutionTime?.TotalMilliseconds ?? 0);

            return script;
        }
        catch (OperationCanceledException)
        {
            logger.LogWarning("Progress-enabled migration script generation was cancelled for comparison {ComparisonId}", comparison?.Id);
            throw;
        }
        catch (Exception ex)
        {
            var executionTime = DateTime.UtcNow - startTime;
            logger.LogError(ex, "Failed to generate progress-enabled migration script for comparison {ComparisonId} after {ExecutionTime}ms",
                comparison?.Id, executionTime.TotalMilliseconds);

            throw new MigrationException($"Progress-enabled migration script generation failed: {ex.Message}",
                comparison?.SourceConnection?.Id ?? "unknown",
                operationId, ex);
        }
    }

    private async Task<(string sqlScript, string executionLog)> GenerateProgressEnabledSqlScriptAsync(
        List<SchemaDifference> differences,
        MigrationOptions options,
        IProgress<MigrationProgressReport>? progress,
        MigrationProgressReport progressReport,
        CancellationToken ct)
    {
        var executionLog = new StringBuilder();
        var script = new StringBuilder();
        var processedCount = 0;
        var startTime = DateTime.UtcNow;

        try
        {
            executionLog.AppendLine($"[{DateTime.UtcNow:HH:mm:ss}] INFO: Starting progress-enabled SQL script generation for {differences.Count} differences");

            // Group differences by type for optimal execution order
            var addedObjects = differences.Where(d => d.Type == DifferenceType.Added).ToList();
            var modifiedObjects = differences.Where(d => d.Type == DifferenceType.Modified).ToList();
            var removedObjects = differences.Where(d => d.Type == DifferenceType.Removed).ToList();

            executionLog.AppendLine($"[{DateTime.UtcNow:HH:mm:ss}] INFO: Categorized differences - Added: {addedObjects.Count}, Modified: {modifiedObjects.Count}, Removed: {removedObjects.Count}");

            // Sort objects by dependency order for safe execution
            var orderedRemovals = OrderByDependencies(removedObjects, isReverse: true);
            var orderedModifications = OrderByDependencies(modifiedObjects, isReverse: false);
            var orderedAdditions = OrderByDependencies(addedObjects, isReverse: false);

            executionLog.AppendLine($"[{DateTime.UtcNow:HH:mm:ss}] INFO: Ordered differences by dependencies");

            // Process in safe order: removes first, then modifies, then adds
            var allOrderedDifferences = new List<SchemaDifference>(orderedRemovals.Count + orderedModifications.Count + orderedAdditions.Count);
            allOrderedDifferences.AddRange(orderedRemovals);
            allOrderedDifferences.AddRange(orderedModifications);
            allOrderedDifferences.AddRange(orderedAdditions);

            // Process in batches for real-time progress tracking
            for (int i = 0; i < allOrderedDifferences.Count; i += options.BatchSize)
            {
                ct.ThrowIfCancellationRequested();

                var batch = allOrderedDifferences.Skip(i).Take(options.BatchSize).ToArray();
                var batchStartTime = DateTime.UtcNow;

                executionLog.AppendLine($"[{DateTime.UtcNow:HH:mm:ss}] INFO: Processing batch {i / options.BatchSize + 1} with {batch.Length} differences");

                progressReport.CurrentOperation = $"Processing batch {i / options.BatchSize + 1} of {(allOrderedDifferences.Count - 1) / options.BatchSize + 1}";
                progress?.Report(progressReport);

                foreach (var difference in batch)
                {
                    ct.ThrowIfCancellationRequested();

                    progressReport.CurrentObject = $"{difference.ObjectType} {difference.Schema}.{difference.ObjectName}";
                    progressReport.CurrentOperation = $"Generating SQL for {difference.ObjectType}";
                    progress?.Report(progressReport);

                    var sql = GenerateSqlForDifference(difference);
                    if (!string.IsNullOrEmpty(sql))
                    {
                        script.AppendLine(sql);
                        script.AppendLine();
                        processedCount++;

                        executionLog.AppendLine($"[{DateTime.UtcNow:HH:mm:ss}] DEBUG: Generated SQL for {difference.ObjectType} {difference.Schema}.{difference.ObjectName}");

                        // Update progress after each object
                        progressReport.ProcessedDifferences = processedCount;
                        progressReport.ElapsedTime = DateTime.UtcNow - startTime;
                        progress?.Report(progressReport);
                    }
                }

                var batchExecutionTime = DateTime.UtcNow - batchStartTime;
                executionLog.AppendLine($"[{DateTime.UtcNow:HH:mm:ss}] INFO: Batch {i / options.BatchSize + 1} completed in {batchExecutionTime.TotalMilliseconds}ms");

                // Remove artificial delay - not needed for real processing
                // if (i + options.BatchSize < allOrderedDifferences.Count)
                // {
                //     await Task.Delay(10, ct);
                // }
            }

            var totalExecutionTime = DateTime.UtcNow - startTime;
            executionLog.AppendLine($"[{DateTime.UtcNow:HH:mm:ss}] INFO: Progress-enabled SQL script generation completed - Processed: {processedCount}/{differences.Count}, Time: {totalExecutionTime.TotalMilliseconds}ms");

            return (script.ToString().Trim(), executionLog.ToString());
        }
        catch (Exception ex)
        {
            executionLog.AppendLine($"[{DateTime.UtcNow:HH:mm:ss}] ERROR: Progress-enabled SQL script generation failed: {ex.Message}");
            logger.LogError(ex, "Error in progress-enabled SQL script generation");
            throw new MigrationException($"Progress-enabled SQL script generation failed: {ex.Message}", Guid.NewGuid().ToString(), Guid.NewGuid().ToString(), ex);
        }
    }

    private async Task<(string rollbackScript, string executionLog)> GenerateProgressEnabledRollbackScriptAsync(
        List<SchemaDifference> differences,
        MigrationOptions options,
        IProgress<MigrationProgressReport>? progress,
        MigrationProgressReport progressReport,
        CancellationToken ct)
    {
        var executionLog = new StringBuilder();
        var script = new StringBuilder();
        var processedCount = 0;
        var startTime = DateTime.UtcNow;

        try
        {
            executionLog.AppendLine($"[{DateTime.UtcNow:HH:mm:ss}] INFO: Starting progress-enabled rollback script generation for {differences.Count} differences");

            var reversedDifferences = differences.AsEnumerable().Reverse().ToList();

            // Process rollback in batches as well
            for (int i = 0; i < reversedDifferences.Count; i += options.BatchSize)
            {
                ct.ThrowIfCancellationRequested();

                var batch = reversedDifferences.Skip(i).Take(options.BatchSize).ToList();

                executionLog.AppendLine($"[{DateTime.UtcNow:HH:mm:ss}] INFO: Processing rollback batch {i / options.BatchSize + 1} with {batch.Count} differences");

                progressReport.CurrentOperation = $"Processing rollback batch {i / options.BatchSize + 1} of {(reversedDifferences.Count - 1) / options.BatchSize + 1}";
                progress?.Report(progressReport);

                foreach (var difference in batch)
                {
                    ct.ThrowIfCancellationRequested();

                    progressReport.CurrentObject = $"{difference.ObjectType} {difference.Schema}.{difference.ObjectName}";
                    progressReport.CurrentOperation = $"Generating rollback SQL for {difference.ObjectType}";
                    progress?.Report(progressReport);

                    var rollbackSql = GenerateRollbackSqlForDifference(difference);
                    if (!string.IsNullOrEmpty(rollbackSql))
                    {
                        script.AppendLine(rollbackSql);
                        script.AppendLine();
                        processedCount++;

                        executionLog.AppendLine($"[{DateTime.UtcNow:HH:mm:ss}] DEBUG: Generated rollback SQL for {difference.ObjectType} {difference.Schema}.{difference.ObjectName}");

                        // Update progress after each object
                        progressReport.ProcessedDifferences = processedCount;
                        progressReport.ElapsedTime = DateTime.UtcNow - startTime;
                        progress?.Report(progressReport);
                    }
                }

                // Remove artificial delay - not needed for real processing
                // if (i + options.BatchSize < reversedDifferences.Count)
                // {
                //     await Task.Delay(5, ct);
                // }
            }

            var totalExecutionTime = DateTime.UtcNow - startTime;
            executionLog.AppendLine($"[{DateTime.UtcNow:HH:mm:ss}] INFO: Progress-enabled rollback script generation completed - Processed: {processedCount}/{differences.Count}, Time: {totalExecutionTime.TotalMilliseconds}ms");

            return (script.ToString().Trim(), executionLog.ToString());
        }
        catch (Exception ex)
        {
            executionLog.AppendLine($"[{DateTime.UtcNow:HH:mm:ss}] ERROR: Progress-enabled rollback script generation failed: {ex.Message}");
            logger.LogError(ex, "Error in progress-enabled rollback script generation");
            throw new MigrationException($"Progress-enabled rollback script generation failed: {ex.Message}", Guid.NewGuid().ToString(), Guid.NewGuid().ToString(), ex);
        }
    }

    private string GenerateSqlScript(List<SchemaDifference> differences)
    {
        try
        {
            var script = new StringBuilder();
            // Group differences by type for optimal execution order - use arrays for better performance
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
                var sql = GenerateSqlForDifference(difference);
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
            logger.LogError(ex, "Error generating SQL script");
            throw new MigrationException($"SQL script generation failed: {ex.Message}", Guid.NewGuid().ToString(), Guid.NewGuid().ToString(), ex);
        }
    }

    private string GenerateRollbackScript(List<SchemaDifference> differences)
    {
        try
        {
            var script = new StringBuilder();
            var reversedDifferences = differences.AsEnumerable().Reverse().ToList();
            foreach (var difference in reversedDifferences)
            {
                var rollbackSql = GenerateRollbackSqlForDifference(difference);
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
            logger.LogError(ex, "Error generating rollback script");
            throw new MigrationException($"Rollback script generation failed: {ex.Message}", Guid.NewGuid().ToString(), Guid.NewGuid().ToString(), ex);
        }
    }

    private string GenerateSqlForDifference(SchemaDifference difference)
    {
        try
        {
            return difference.Type switch
            {
                DifferenceType.Added => GenerateCreateSql(difference),
                DifferenceType.Removed => GenerateDropSql(difference),
                DifferenceType.Modified => GenerateAlterStatement(difference),
                _ => string.Empty
            };
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error generating SQL for difference {ObjectType} {ObjectName}",
                difference.ObjectType, difference.ObjectName);
            return $"-- ERROR generating SQL for {difference.ObjectType} {difference.ObjectName}: {ex.Message}";
        }
    }

    private string GenerateCreateSql(SchemaDifference difference)
    {
        try
        {
            // Enhanced validation for real-time scenarios
            if (string.IsNullOrEmpty(difference.TargetDefinition))
            {
                logger.LogWarning("Cannot generate CREATE SQL for {ObjectType} {Schema}.{ObjectName} - no target definition available",
                    difference.ObjectType, difference.Schema, difference.ObjectName);
                return $"-- WARNING: No target definition available for {difference.ObjectType} {difference.Schema}.{difference.ObjectName}";
            }

            if (string.IsNullOrEmpty(difference.ObjectName))
            {
                logger.LogError("Cannot generate CREATE SQL - object name is required for {ObjectType}", difference.ObjectType);
                return $"-- ERROR: Object name is required for {difference.ObjectType}";
            }

            var schema = string.IsNullOrEmpty(difference.Schema) ? "public" : difference.Schema;
            var objectName = difference.ObjectName;
            var objectType = difference.ObjectType;

            // Validate schema name for PostgreSQL compatibility
            if (!IsValidPostgreSqlIdentifier(schema))
            {
                logger.LogWarning("Invalid schema name '{Schema}' for object {ObjectName}, using 'public'", schema, objectName);
                schema = "public";
            }

            if (!IsValidPostgreSqlIdentifier(objectName))
            {
                logger.LogError("Invalid object name '{ObjectName}' for {ObjectType}", objectName, objectType);
                return $"-- ERROR: Invalid object name '{objectName}' for {objectType}";
            }

            // Generate enhanced CREATE SQL with real-time optimizations
            var createSql = GenerateEnhancedCreateStatement(difference, schema, objectName);

            // Add performance and safety enhancements for real-time execution
            var enhancedSql = EnhanceSqlForRealTimeExecution(createSql, difference);

            logger.LogDebug("Generated CREATE SQL for {ObjectType} {Schema}.{ObjectName}: {SqlLength} characters",
                objectType, schema, objectName, enhancedSql.Length);

            return enhancedSql;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error generating CREATE SQL for {ObjectType} {Schema}.{ObjectName}",
                difference.ObjectType, difference.Schema, difference.ObjectName);
            return $"-- ERROR generating CREATE SQL for {difference.ObjectType} {difference.Schema}.{difference.ObjectName}: {ex.Message}";
        }
    }

    internal static string GenerateDropSql(SchemaDifference difference)
    {
        var objectType = difference.ObjectType.ToString().ToUpperInvariant();
        var schema = string.IsNullOrEmpty(difference.Schema) ? "public" : difference.Schema;
        var objectName = difference.ObjectName;
        var parentName = GetMetadataString(difference, "TableName", "ParentTable", "TargetTable", "SourceTable");
        var signature = GetMetadataString(difference, "Signature");

        return difference.ObjectType switch
        {
            ObjectType.Table => $"-- Dropping table {schema}.{objectName}\nDROP TABLE IF EXISTS \"{schema}\".\"{objectName}\" CASCADE;",
            ObjectType.View => $"-- Dropping view {schema}.{objectName}\nDROP VIEW IF EXISTS \"{schema}\".\"{objectName}\" CASCADE;",
            ObjectType.Index => $"-- Dropping index {schema}.{objectName}\nDROP INDEX IF EXISTS \"{schema}\".\"{objectName}\" CASCADE;",
            ObjectType.Function or ObjectType.Procedure =>
                $"-- Dropping {difference.ObjectType.ToString().ToLowerInvariant()} {schema}.{objectName}\n" +
                $"DROP {difference.ObjectType.ToString().ToUpperInvariant()} IF EXISTS \"{schema}\".\"{objectName}\"{FormatFunctionSignature(signature)} CASCADE;",
            ObjectType.Trigger when !string.IsNullOrWhiteSpace(parentName) =>
                $"-- Dropping trigger {objectName}\nDROP TRIGGER IF EXISTS \"{objectName}\" ON \"{schema}\".\"{parentName}\" CASCADE;",
            ObjectType.Trigger =>
                $"-- Dropping trigger {objectName}\n-- WARNING: Parent table unknown, manual adjustment required\n-- Example: DROP TRIGGER IF EXISTS \"{objectName}\" ON \"{schema}\".\"<table_name>\" CASCADE;",
            ObjectType.Schema => $"-- Dropping schema {objectName}\nDROP SCHEMA IF EXISTS \"{objectName}\" CASCADE;",
            ObjectType.Type => $"-- Dropping type {schema}.{objectName}\nDROP TYPE IF EXISTS \"{schema}\".\"{objectName}\" CASCADE;",
            ObjectType.Sequence => $"-- Dropping sequence {schema}.{objectName}\nDROP SEQUENCE IF EXISTS \"{schema}\".\"{objectName}\" CASCADE;",
            _ => $"-- DROP {objectType} {schema}.{objectName} (manual review required)"
        };
    }

    private static string FormatFunctionSignature(string? signature)
    {
        if (signature is null)
        {
            return "()";
        }

        return string.IsNullOrWhiteSpace(signature) ? "()" : $"({signature})";
    }

    private static string? GetMetadataString(SchemaDifference difference, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (difference.Metadata.TryGetValue(key, out var value) && value is string stringValue && !string.IsNullOrWhiteSpace(stringValue))
            {
                return stringValue;
            }
        }

        return null;
    }


    private string GenerateRollbackSqlForDifference(SchemaDifference difference)
    {
        try
        {
            switch (difference.Type)
            {
                case DifferenceType.Added:
                    return GenerateDropSql(difference);

                case DifferenceType.Removed:
                    if (string.IsNullOrEmpty(difference.SourceDefinition))
                        return $"-- Cannot rollback DROP {difference.ObjectType} {difference.Schema}.{difference.ObjectName} - no source definition available";

                    var objectType = difference.ObjectType.ToString().ToLowerInvariant();
                    var schema = string.IsNullOrEmpty(difference.Schema) ? "public" : difference.Schema;
                    var objectName = difference.ObjectName;

                    return $"-- Rolling back DROP {objectType} {schema}.{objectName}\n{difference.SourceDefinition}";

                case DifferenceType.Modified:
                    if (string.IsNullOrEmpty(difference.SourceDefinition))
                        return $"-- Cannot rollback ALTER {difference.ObjectType} {difference.Schema}.{difference.ObjectName} - no source definition available";

                    return $"-- Rolling back ALTER {difference.ObjectType} {difference.Schema}.{difference.ObjectName}\n{difference.SourceDefinition}";

                default:
                    return string.Empty;
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error generating rollback SQL for difference {ObjectType} {ObjectName}",
                difference.ObjectType, difference.ObjectName);
            return $"-- ERROR generating rollback SQL for {difference.ObjectType} {difference.ObjectName}: {ex.Message}";
        }
    }

    private static string GenerateCreateStatement(SchemaDifference difference, string schema, string objectName)
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

    private static string GenerateAlterStatement(SchemaDifference difference)
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

    private static string GenerateCreateTableSql(SchemaDifference difference)
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

    private static string GenerateCreateViewSql(SchemaDifference difference)
    {
        if (string.IsNullOrEmpty(difference.TargetDefinition))
            return $"-- Cannot create view {difference.Schema}.{difference.ObjectName} - no definition available";

        return difference.TargetDefinition;
    }

    private static string GenerateCreateFunctionSql(SchemaDifference difference)
    {
        if (string.IsNullOrEmpty(difference.TargetDefinition))
            return $"-- Cannot create function {difference.Schema}.{difference.ObjectName} - no definition available";

        return difference.TargetDefinition;
    }

    private static string GenerateCreateProcedureSql(SchemaDifference difference)
    {
        if (string.IsNullOrEmpty(difference.TargetDefinition))
            return $"-- Cannot create procedure {difference.Schema}.{difference.ObjectName} - no definition available";

        return difference.TargetDefinition;
    }

    private static string GenerateCreateIndexSql(SchemaDifference difference)
    {
        if (string.IsNullOrEmpty(difference.TargetDefinition))
            return $"-- Cannot create index {difference.Schema}.{difference.ObjectName} - no definition available";

        return difference.TargetDefinition;
    }

    private static string GenerateCreateTriggerSql(SchemaDifference difference)
    {
        if (string.IsNullOrEmpty(difference.TargetDefinition))
            return $"-- Cannot create trigger {difference.Schema}.{difference.ObjectName} - no definition available";

        return difference.TargetDefinition;
    }

    private static string GenerateCreateSequenceSql(SchemaDifference difference)
    {
        if (string.IsNullOrEmpty(difference.TargetDefinition))
            return $"-- Cannot create sequence {difference.Schema}.{difference.ObjectName} - no definition available";

        return difference.TargetDefinition;
    }

    private static string GenerateCreateTypeSql(SchemaDifference difference)
    {
        if (string.IsNullOrEmpty(difference.TargetDefinition))
            return $"-- Cannot create type {difference.Schema}.{difference.ObjectName} - no definition available";

        return difference.TargetDefinition;
    }

    private static string GenerateCreateSchemaSql(SchemaDifference difference)
    {
        var schemaName = string.IsNullOrEmpty(difference.Schema) ? difference.ObjectName : difference.Schema;
        return $"CREATE SCHEMA IF NOT EXISTS \"{schemaName}\";";
    }

    private static string GenerateAlterTableSql(SchemaDifference difference)
    {
        var sourceDef = difference.SourceDefinition ?? "";
        var targetDef = difference.TargetDefinition ?? "";
        var schema = string.IsNullOrEmpty(difference.Schema) ? "public" : difference.Schema;
        var tableName = difference.ObjectName;

        if (string.IsNullOrEmpty(targetDef))
        {
            return $"-- Cannot alter table {schema}.{tableName} - no target definition available";
        }

        var sql = new StringBuilder();
        sql.AppendLine($"-- ALTER TABLE {schema}.{tableName}");
        sql.AppendLine($"-- Schema: {schema}");
        sql.AppendLine($"-- Table: {tableName}");

        // Implement sophisticated diff analysis for table modifications
        sql.AppendLine($"-- Recreating table {schema}.{tableName} with new definition");
        sql.AppendLine($"DROP TABLE IF EXISTS \"{schema}\".\"{tableName}\" CASCADE;");
        sql.AppendLine($"SET search_path TO {schema}, public;");

        // Ensure proper schema qualification in the target definition
        var alteredDef = targetDef;
        if (!alteredDef.Contains($"\"{schema}\".\"{tableName}\"") && !alteredDef.Contains($"{schema}.{tableName}"))
        {
            // Fix table name in CREATE statement
            var tableKeywordIndex = alteredDef.IndexOf("TABLE", StringComparison.OrdinalIgnoreCase);
            if (tableKeywordIndex >= 0)
            {
                var tableNameIndex = tableKeywordIndex + 5;
                var openingParenIndex = alteredDef.IndexOf('(', tableNameIndex);
                if (openingParenIndex > 0)
                {
                    var originalTableName = alteredDef.Substring(tableNameIndex, openingParenIndex - tableNameIndex).Trim();
                    alteredDef = alteredDef.Replace($"TABLE {originalTableName}", $"TABLE \"{schema}\".\"{tableName}\"");
                }
            }
        }

        sql.AppendLine(alteredDef);
        sql.AppendLine($"RESET search_path;");

        return sql.ToString();
    }

    private static string GenerateAlterViewSql(SchemaDifference difference)
    {
        if (string.IsNullOrEmpty(difference.TargetDefinition))
            return $"-- Cannot alter view {difference.Schema}.{difference.ObjectName} - no target definition available";

        var schema = string.IsNullOrEmpty(difference.Schema) ? "public" : difference.Schema;
        var viewName = difference.ObjectName;

        var sql = new StringBuilder();
        sql.AppendLine($"-- ALTER VIEW {schema}.{viewName}");
        sql.AppendLine($"-- Schema: {schema}");
        sql.AppendLine($"-- View: {viewName}");

        // For views, we typically need to DROP and CREATE
        sql.AppendLine($"-- Recreating view {schema}.{viewName} with new definition");
        sql.AppendLine($"DROP VIEW IF EXISTS \"{schema}\".\"{viewName}\" CASCADE;");
        sql.AppendLine($"SET search_path TO {schema}, public;");

        // Ensure proper schema qualification in the target definition
        var alteredDef = difference.TargetDefinition;
        if (!alteredDef.Contains($"\"{schema}\".\"{viewName}\"") && !alteredDef.Contains($"{schema}.{viewName}"))
        {
            // Fix view name in CREATE statement
            var viewKeywordIndex = alteredDef.IndexOf("VIEW", StringComparison.OrdinalIgnoreCase);
            if (viewKeywordIndex >= 0)
            {
                var viewNameIndex = viewKeywordIndex + 4;
                var asKeywordIndex = alteredDef.IndexOf(" AS ", viewNameIndex, StringComparison.OrdinalIgnoreCase);
                if (asKeywordIndex > 0)
                {
                    var originalViewName = alteredDef.Substring(viewNameIndex, asKeywordIndex - viewNameIndex).Trim();
                    alteredDef = alteredDef.Replace($"VIEW {originalViewName}", $"VIEW \"{schema}\".\"{viewName}\"");
                }
            }
        }

        sql.AppendLine(alteredDef);
        sql.AppendLine($"RESET search_path;");

        return sql.ToString();
    }

    private static string GenerateAlterFunctionSql(SchemaDifference difference)
    {
        if (string.IsNullOrEmpty(difference.TargetDefinition))
            return $"-- Cannot alter function {difference.Schema}.{difference.ObjectName} - no target definition available";

        var schema = string.IsNullOrEmpty(difference.Schema) ? "public" : difference.Schema;
        var functionName = difference.ObjectName;

        var sql = new StringBuilder();
        sql.AppendLine($"-- ALTER FUNCTION {schema}.{functionName}");
        sql.AppendLine($"-- Schema: {schema}");
        sql.AppendLine($"-- Function: {functionName}");

        // For functions, we typically need to DROP and CREATE
        sql.AppendLine($"-- Recreating function {schema}.{functionName} with new definition");
        sql.AppendLine($"DROP FUNCTION IF EXISTS \"{schema}\".\"{functionName}\" CASCADE;");
        sql.AppendLine($"SET search_path TO {schema}, public;");

        // Ensure proper schema qualification in the target definition
        var alteredDef = difference.TargetDefinition;
        if (!alteredDef.Contains($"\"{schema}\".\"{functionName}\"") && !alteredDef.Contains($"{schema}.{functionName}"))
        {
            // Fix function name in CREATE statement
            var functionKeywordIndex = alteredDef.IndexOf("FUNCTION", StringComparison.OrdinalIgnoreCase);
            if (functionKeywordIndex >= 0)
            {
                var functionNameIndex = functionKeywordIndex + 8;
                var openingParenIndex = alteredDef.IndexOf('(', functionNameIndex);
                if (openingParenIndex > 0)
                {
                    var originalFunctionName = alteredDef.Substring(functionNameIndex, openingParenIndex - functionNameIndex).Trim();
                    alteredDef = alteredDef.Replace($"FUNCTION {originalFunctionName}", $"FUNCTION \"{schema}\".\"{functionName}\"");
                }
            }
        }

        sql.AppendLine(alteredDef);
        sql.AppendLine($"RESET search_path;");

        return sql.ToString();
    }

    private List<SchemaDifference> OrderByDependencies(List<SchemaDifference> differences, bool isReverse)
    {
        if (differences.Count == 0)
            return differences;

        // Validate business rules before ordering
        var validationResult = ValidateBusinessRules(differences);
        if (!validationResult.IsValid)
        {
            logger.LogWarning("Business rule validation failed: {ValidationErrors}",
                string.Join(", ", validationResult.Errors));
        }

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
        var collations = differences.Where(d => d.ObjectType == ObjectType.Collation).ToList();
        var extensions = differences.Where(d => d.ObjectType == ObjectType.Extension).ToList();
        var roles = differences.Where(d => d.ObjectType == ObjectType.Role).ToList();
        var tablespaces = differences.Where(d => d.ObjectType == ObjectType.Tablespace).ToList();

        var others = differences.Where(d => !schemas.Contains(d)
                && !types.Contains(d)
                && !sequences.Contains(d)
                && !tables.Contains(d)
                && !functions.Contains(d)
                && !views.Contains(d)
                && !indexes.Contains(d)
                && !triggers.Contains(d)
                && !constraints.Contains(d)
                && !collations.Contains(d)
                && !extensions.Contains(d)
                && !roles.Contains(d)
                && !tablespaces.Contains(d)
        ).ToList();

        if (isReverse)
        {
            // Reverse order for removals
            ordered.AddRange(constraints);
            ordered.AddRange(triggers);
            ordered.AddRange(indexes);
            ordered.AddRange(views);
            ordered.AddRange(functions);
            ordered.AddRange(tables);
            ordered.AddRange(sequences);
            ordered.AddRange(types);
            ordered.AddRange(collations);
            ordered.AddRange(extensions);
            ordered.AddRange(roles);
            ordered.AddRange(tablespaces);
            ordered.AddRange(schemas);
            ordered.AddRange(others);
        }
        else
        {
            // Forward order for additions
            ordered.AddRange(schemas);
            ordered.AddRange(extensions);
            ordered.AddRange(roles);
            ordered.AddRange(tablespaces);
            ordered.AddRange(collations);
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

        logger.LogDebug("Ordered {Count} differences by dependencies: {OrderedTypes}",
            differences.Count, string.Join(", ", ordered.Select(d => d.ObjectType.ToString())));

        return ordered;
    }

    private static (bool IsValid, List<string> Errors) ValidateBusinessRules(List<SchemaDifference> differences)
    {
        var errors = new List<string>();

        // Business Rule 1: Check for potentially destructive operations
        var dropOperations = differences.Where(d => d.Type == DifferenceType.Removed).ToList();
        if (dropOperations.Any(d => IsCriticalObjectType(d.ObjectType)))
        {
            errors.Add($"Migration contains DROP operations on critical objects: {string.Join(", ", dropOperations.Where(d => IsCriticalObjectType(d.ObjectType)).Select(d => $"{d.ObjectType} {d.ObjectName}"))}");
        }

        // Business Rule 2: Validate schema consistency
        var schemaOperations = differences.Where(d => d.ObjectType == ObjectType.Schema).ToList();
        if (schemaOperations.Count > 5)
        {
            errors.Add($"Large number of schema operations detected ({schemaOperations.Count}). Please review for potential issues.");
        }

        // Business Rule 3: Check for naming conflicts
        var objectNames = differences
            .Where(d => !string.IsNullOrEmpty(d.ObjectName))
            .GroupBy(d => new { d.Schema, d.ObjectName })
            .Where(g => g.Count() > 1)
            .Select(g => $"{g.Key.Schema}.{g.Key.ObjectName}")
            .ToList();

        if (objectNames.Any())
        {
            errors.Add($"Potential naming conflicts detected for objects: {string.Join(", ", objectNames)}");
        }

        // Business Rule 4: Validate object dependencies
        var tablesWithoutSchemas = differences
            .Where(d => d.ObjectType == ObjectType.Table && string.IsNullOrEmpty(d.Schema))
            .ToList();

        if (tablesWithoutSchemas.Any())
        {
            errors.Add($"Tables without explicit schema found: {string.Join(", ", tablesWithoutSchemas.Select(t => t.ObjectName))}. This may cause issues in multi-schema environments.");
        }

        return (errors.Count == 0, errors);
    }

    private static bool IsValidPostgreSqlIdentifier(string identifier)
    {
        if (string.IsNullOrEmpty(identifier))
            return false;

        // PostgreSQL identifier rules:
        // - Must start with a letter or underscore
        // - Can contain letters, digits, and underscores
        // - Cannot be a reserved keyword (basic check)
        // - Length between 1 and 63 characters

        if (identifier.Length == 0 || identifier.Length > 63)
            return false;

        if (!char.IsLetter(identifier[0]) && identifier[0] != '_')
            return false;

        var reservedKeywords = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "table", "column", "index", "view", "schema", "database", "function", "procedure",
            "trigger", "sequence", "type", "domain", "constraint", "role", "user", "group",
            "select", "insert", "update", "delete", "create", "drop", "alter", "grant", "revoke"
        };

        if (reservedKeywords.Contains(identifier.ToLowerInvariant()))
            return false;

        return identifier.All(c => char.IsLetterOrDigit(c) || c == '_');
    }

    private string GenerateEnhancedCreateStatement(SchemaDifference difference, string schema, string objectName)
    {
        return difference.ObjectType switch
        {
            ObjectType.Table => GenerateEnhancedCreateTableSql(difference, schema, objectName),
            ObjectType.View => GenerateEnhancedCreateViewSql(difference, schema, objectName),
            ObjectType.Function => GenerateEnhancedCreateFunctionSql(difference, schema, objectName),
            ObjectType.Procedure => GenerateEnhancedCreateProcedureSql(difference, schema, objectName),
            ObjectType.Index => GenerateEnhancedCreateIndexSql(difference, schema, objectName),
            ObjectType.Trigger => GenerateEnhancedCreateTriggerSql(difference, schema, objectName),
            ObjectType.Sequence => GenerateEnhancedCreateSequenceSql(difference, schema, objectName),
            ObjectType.Type => GenerateEnhancedCreateTypeSql(difference, schema, objectName),
            ObjectType.Schema => GenerateEnhancedCreateSchemaSql(difference, schema, objectName),
            ObjectType.Domain => GenerateEnhancedCreateDomainSql(difference, schema, objectName),
            ObjectType.Collation => GenerateEnhancedCreateCollationSql(difference, schema, objectName),
            ObjectType.Extension => GenerateEnhancedCreateExtensionSql(difference, schema, objectName),
            ObjectType.Role => GenerateEnhancedCreateRoleSql(difference, schema, objectName),
            ObjectType.Tablespace => GenerateEnhancedCreateTablespaceSql(difference, schema, objectName),
            _ => GenerateGenericCreateStatement(difference, schema, objectName)
        };
    }

    private static string EnhanceSqlForRealTimeExecution(string sql, SchemaDifference difference)
    {
        var enhanced = new StringBuilder();

        // Add timing and progress comments for real-time monitoring
        enhanced.AppendLine($"-- START: Creating {difference.ObjectType} {difference.Schema}.{difference.ObjectName}");
        enhanced.AppendLine($"-- Timestamp: {DateTime.UtcNow:yyyy-MM-dd HH:mm:ss.fff}");
        enhanced.AppendLine($"-- Object ID: {difference.GetHashCode()}");

        // Add transaction safety for critical objects
        if (IsCriticalObjectType(difference.ObjectType))
        {
            enhanced.AppendLine("-- CRITICAL OBJECT: Wrapped in transaction for safety");
            enhanced.AppendLine("BEGIN;");
        }

        // Add the main SQL
        enhanced.AppendLine(sql);

        // Add verification query for real-time validation
        var verificationSql = GenerateVerificationSql(difference);
        if (!string.IsNullOrEmpty(verificationSql))
        {
            enhanced.AppendLine();
            enhanced.AppendLine("-- VERIFICATION: Check object was created successfully");
            enhanced.AppendLine(verificationSql);
        }

        // Close transaction if needed
        if (IsCriticalObjectType(difference.ObjectType))
        {
            enhanced.AppendLine("COMMIT;");
        }

        enhanced.AppendLine($"-- END: Created {difference.ObjectType} {difference.Schema}.{difference.ObjectName}");

        return enhanced.ToString();
    }

    private static bool IsCriticalObjectType(ObjectType objectType)
    {
        return objectType switch
        {
            ObjectType.Table => true,
            ObjectType.View => true,
            ObjectType.Schema => true,
            ObjectType.Function => true,
            ObjectType.Type => true,
            _ => false
        };
    }

    private static string GenerateVerificationSql(SchemaDifference difference)
    {
        ArgumentNullException.ThrowIfNull(difference, nameof(SchemaDifference));
        var schema = string.IsNullOrEmpty(difference.Schema) ? "public" : difference.Schema;
        var objectName = difference.ObjectName;

        // Use PostgreSQL's quote_ident function to safely quote identifiers and prevent SQL injection
        var safeSchema = $"quote_ident('{schema.Replace("'", "''")}')";
        var safeObjectName = $"quote_ident('{objectName.Replace("'", "''")}')";

        return difference.ObjectType switch
        {
            ObjectType.Table => $"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = {safeSchema} AND table_name = {safeObjectName};",
            ObjectType.View => $"SELECT COUNT(*) FROM information_schema.views WHERE table_schema = {safeSchema} AND table_name = {safeObjectName};",
            ObjectType.Function => $"SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = {safeSchema} AND routine_name = {safeObjectName};",
            ObjectType.Procedure => $"SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = {safeSchema} AND routine_name = {safeObjectName};",
            ObjectType.Schema => $"SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name = {safeObjectName};",
            ObjectType.Sequence => $"SELECT COUNT(*) FROM information_schema.sequences WHERE sequence_schema = {safeSchema} AND sequence_name = {safeObjectName};",
            ObjectType.Type => $"SELECT COUNT(*) FROM pg_type WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = {safeSchema}) AND typname = {safeObjectName};",
            ObjectType.Domain => $"SELECT COUNT(*) FROM pg_type WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = {safeSchema}) AND typname = {safeObjectName};",
            ObjectType.Index => $"SELECT COUNT(*) FROM pg_indexes WHERE schemaname = {safeSchema} AND indexname = {safeObjectName};",
            ObjectType.Trigger => $"SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema = {safeSchema} AND trigger_name = {safeObjectName};",
            ObjectType.Constraint => $"SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = {safeSchema} AND constraint_name = {safeObjectName};",
            ObjectType.Collation => $"SELECT COUNT(*) FROM pg_collation WHERE collnamespace = (SELECT oid FROM pg_namespace WHERE nspname = {safeSchema}) AND collname = {safeObjectName};",
            ObjectType.Extension => $"SELECT COUNT(*) FROM pg_extension WHERE extname = {safeObjectName};",
            ObjectType.Role => $"SELECT COUNT(*) FROM pg_roles WHERE rolname = {safeObjectName};",
            ObjectType.Tablespace => $"SELECT COUNT(*) FROM pg_tablespace WHERE spcname = {safeObjectName};",
            _ => string.Empty
        };
    }

    private static string GenerateEnhancedCreateTableSql(SchemaDifference difference, string schema, string tableName)
    {
        if (string.IsNullOrEmpty(difference.TargetDefinition))
            return $"-- Cannot create table {schema}.{tableName} - no definition available";

        var sql = new StringBuilder();
        sql.AppendLine($"-- Enhanced CREATE TABLE for real-time execution");
        sql.AppendLine($"-- Schema: {schema}");
        sql.AppendLine($"-- Table: {tableName}");
        sql.AppendLine($"-- Generated: {DateTime.UtcNow:yyyy-MM-dd HH:mm:ss}");

        // Ensure proper schema qualification
        var createSql = difference.TargetDefinition;
        if (!createSql.Contains($"\"{schema}\".\"{tableName}\"") && !createSql.Contains($"{schema}.{tableName}"))
        {
            // Fix table name in CREATE statement
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

        // Add PostgreSQL optimizations
        sql.AppendLine($"SET search_path TO {schema}, public;");
        sql.AppendLine($"SET timezone = 'UTC';");
        sql.AppendLine(createSql);
        sql.AppendLine($"RESET search_path;");
        sql.AppendLine($"RESET timezone;");

        return sql.ToString();
    }

    private static string GenerateEnhancedCreateViewSql(SchemaDifference difference, string schema, string viewName)
    {
        if (string.IsNullOrEmpty(difference.TargetDefinition))
            return $"-- Cannot create view {schema}.{viewName} - no definition available";

        var sql = new StringBuilder();
        sql.AppendLine($"-- Enhanced CREATE VIEW for real-time execution");
        sql.AppendLine($"-- Schema: {schema}");
        sql.AppendLine($"-- View: {viewName}");

        // Ensure proper schema qualification in view definition
        var viewSql = difference.TargetDefinition;
        sql.AppendLine($"SET search_path TO {schema}, public;");
        sql.AppendLine(viewSql);
        sql.AppendLine($"RESET search_path;");

        return sql.ToString();
    }

    private static string GenerateEnhancedCreateFunctionSql(
        SchemaDifference difference,
        string schema,
        string functionName
    )
    {
        if (string.IsNullOrEmpty(difference.TargetDefinition))
            return $"-- Cannot create function {schema}.{functionName} - no definition available";

        var sql = new StringBuilder();
        sql.AppendLine($"-- Enhanced CREATE FUNCTION for real-time execution");
        sql.AppendLine($"-- Schema: {schema}");
        sql.AppendLine($"-- Function: {functionName}");

        // Add function-specific optimizations
        sql.AppendLine($"SET search_path TO {schema}, public;");
        sql.AppendLine(difference.TargetDefinition);
        sql.AppendLine($"RESET search_path;");

        return sql.ToString();
    }

    private static string GenerateEnhancedCreateProcedureSql(SchemaDifference difference, string schema, string procedureName)
    {
        if (string.IsNullOrEmpty(difference.TargetDefinition))
            return $"-- Cannot create procedure {schema}.{procedureName} - no definition available";

        var sql = new StringBuilder();
        sql.AppendLine($"-- Enhanced CREATE PROCEDURE for real-time execution");
        sql.AppendLine($"-- Schema: {schema}");
        sql.AppendLine($"-- Procedure: {procedureName}");

        sql.AppendLine($"SET search_path TO {schema}, public;");
        sql.AppendLine(difference.TargetDefinition);
        sql.AppendLine($"RESET search_path;");

        return sql.ToString();
    }

    private static string GenerateEnhancedCreateIndexSql(SchemaDifference difference, string schema, string indexName)
    {
        if (string.IsNullOrEmpty(difference.TargetDefinition))
            return $"-- Cannot create index {schema}.{indexName} - no definition available";

        var sql = new StringBuilder();
        sql.AppendLine($"-- Enhanced CREATE INDEX for real-time execution");
        sql.AppendLine($"-- Schema: {schema}");
        sql.AppendLine($"-- Index: {indexName}");

        // Add index-specific optimizations
        sql.AppendLine($"SET maintenance_work_mem = '256MB';");
        sql.AppendLine($"SET work_mem = '128MB';");
        sql.AppendLine(difference.TargetDefinition);
        sql.AppendLine($"RESET maintenance_work_mem;");
        sql.AppendLine($"RESET work_mem;");

        return sql.ToString();
    }

    private static string GenerateEnhancedCreateTriggerSql(SchemaDifference difference, string schema, string triggerName)
    {
        if (string.IsNullOrEmpty(difference.TargetDefinition))
            return $"-- Cannot create trigger {schema}.{triggerName} - no definition available";

        var sql = new StringBuilder();
        sql.AppendLine($"-- Enhanced CREATE TRIGGER for real-time execution");
        sql.AppendLine($"-- Schema: {schema}");
        sql.AppendLine($"-- Trigger: {triggerName}");

        sql.AppendLine(difference.TargetDefinition);

        return sql.ToString();
    }

    private static string GenerateEnhancedCreateSequenceSql(SchemaDifference difference, string schema, string sequenceName)
    {
        if (string.IsNullOrEmpty(difference.TargetDefinition))
            return $"-- Cannot create sequence {schema}.{sequenceName} - no definition available";

        var sql = new StringBuilder();
        sql.AppendLine($"-- Enhanced CREATE SEQUENCE for real-time execution");
        sql.AppendLine($"-- Schema: {schema}");
        sql.AppendLine($"-- Sequence: {sequenceName}");

        sql.AppendLine(difference.TargetDefinition);

        return sql.ToString();
    }

    private static string GenerateEnhancedCreateTypeSql(SchemaDifference difference, string schema, string typeName)
    {
        if (string.IsNullOrEmpty(difference.TargetDefinition))
            return $"-- Cannot create type {schema}.{typeName} - no definition available";

        var sql = new StringBuilder();
        sql.AppendLine($"-- Enhanced CREATE TYPE for real-time execution");
        sql.AppendLine($"-- Schema: {schema}");
        sql.AppendLine($"-- Type: {typeName}");

        sql.AppendLine(difference.TargetDefinition);

        return sql.ToString();
    }

    private static string GenerateEnhancedCreateSchemaSql(SchemaDifference difference, string schema, string schemaName)
    {
        var sql = new StringBuilder();
        sql.AppendLine($"-- Enhanced CREATE SCHEMA for real-time execution");
        sql.AppendLine($"-- Schema: {schemaName}");

        sql.AppendLine($"CREATE SCHEMA IF NOT EXISTS \"{schemaName}\";");

        // Set search path to new schema
        sql.AppendLine($"SET search_path TO \"{schemaName}\", public;");

        return sql.ToString();
    }

    private static string GenerateEnhancedCreateDomainSql(SchemaDifference difference, string schema, string domainName)
    {
        if (string.IsNullOrEmpty(difference.TargetDefinition))
        {
            // Generate basic domain creation if no definition available
            return $"-- Creating basic domain {schema}.{domainName}\n" +
                   $"CREATE DOMAIN \"{schema}\".\"{domainName}\" AS text;";
        }

        var sql = new StringBuilder();
        sql.AppendLine($"-- Enhanced CREATE DOMAIN for real-time execution");
        sql.AppendLine($"-- Schema: {schema}");
        sql.AppendLine($"-- Domain: {domainName}");

        // Ensure proper schema qualification
        var domainSql = difference.TargetDefinition;
        if (!domainSql.Contains($"\"{schema}\".\"{domainName}\"") && !domainSql.Contains($"{schema}.{domainName}"))
        {
            // Fix domain name in CREATE statement
            var domainKeywordIndex = domainSql.IndexOf("DOMAIN", StringComparison.OrdinalIgnoreCase);
            if (domainKeywordIndex >= 0)
            {
                var domainNameIndex = domainKeywordIndex + 6;
                var asKeywordIndex = domainSql.IndexOf(" AS ", domainNameIndex, StringComparison.OrdinalIgnoreCase);
                if (asKeywordIndex > 0)
                {
                    var originalDomainName = domainSql.Substring(domainNameIndex, asKeywordIndex - domainNameIndex).Trim();
                    domainSql = domainSql.Replace($"DOMAIN {originalDomainName}", $"DOMAIN \"{schema}\".\"{domainName}\"");
                }
            }
        }

        sql.AppendLine(domainSql);

        return sql.ToString();
    }

    private static string GenerateEnhancedCreateCollationSql(SchemaDifference difference, string schema, string collationName)
    {
        if (string.IsNullOrEmpty(difference.TargetDefinition))
        {
            // Generate basic collation creation if no definition available
            return $"-- Creating basic collation {schema}.{collationName}\n" +
                   $"CREATE COLLATION \"{schema}\".\"{collationName}\" (provider = icu, locale = 'en-US');";
        }

        var sql = new StringBuilder();
        sql.AppendLine($"-- Enhanced CREATE COLLATION for real-time execution");
        sql.AppendLine($"-- Schema: {schema}");
        sql.AppendLine($"-- Collation: {collationName}");

        // Ensure proper schema qualification
        var collationSql = difference.TargetDefinition;
        if (!collationSql.Contains($"\"{schema}\".\"{collationName}\"") && !collationSql.Contains($"{schema}.{collationName}"))
        {
            // Fix collation name in CREATE statement
            var collationKeywordIndex = collationSql.IndexOf("COLLATION", StringComparison.OrdinalIgnoreCase);
            if (collationKeywordIndex >= 0)
            {
                var collationNameIndex = collationKeywordIndex + 9;
                var openingParenIndex = collationSql.IndexOf('(', collationNameIndex);
                if (openingParenIndex > 0)
                {
                    var originalCollationName = collationSql.Substring(collationNameIndex, openingParenIndex - collationNameIndex).Trim();
                    collationSql = collationSql.Replace($"COLLATION {originalCollationName}", $"COLLATION \"{schema}\".\"{collationName}\"");
                }
            }
        }

        sql.AppendLine(collationSql);

        return sql.ToString();
    }

    private static string GenerateEnhancedCreateExtensionSql(SchemaDifference difference, string schema, string extensionName)
    {
        if (string.IsNullOrEmpty(difference.TargetDefinition))
        {
            // Generate basic extension creation if no definition available
            return $"-- Creating basic extension {extensionName}\n" +
                   $"CREATE EXTENSION IF NOT EXISTS \"{extensionName}\";";
        }

        var sql = new StringBuilder();
        sql.AppendLine($"-- Enhanced CREATE EXTENSION for real-time execution");
        sql.AppendLine($"-- Schema: {schema}");
        sql.AppendLine($"-- Extension: {extensionName}");

        // Ensure proper extension name qualification
        var extensionSql = difference.TargetDefinition;
        if (!extensionSql.Contains($"\"{extensionName}\""))
        {
            // Fix extension name in CREATE statement
            var extensionKeywordIndex = extensionSql.IndexOf("EXTENSION", StringComparison.OrdinalIgnoreCase);
            if (extensionKeywordIndex >= 0)
            {
                var extensionNameIndex = extensionKeywordIndex + 9;
                var semicolonIndex = extensionSql.IndexOf(';', extensionNameIndex);
                if (semicolonIndex > 0)
                {
                    var originalExtensionName = extensionSql.Substring(extensionNameIndex, semicolonIndex - extensionNameIndex).Trim();
                    extensionSql = extensionSql.Replace($"EXTENSION {originalExtensionName}", $"EXTENSION \"{extensionName}\"");
                }
            }
        }

        sql.AppendLine(extensionSql);

        return sql.ToString();
    }

    private static string GenerateEnhancedCreateRoleSql(SchemaDifference difference, string schema, string roleName)
    {
        if (string.IsNullOrEmpty(difference.TargetDefinition))
        {
            // Generate basic role creation if no definition available
            return $"-- Creating basic role {roleName}\n" +
                   $"CREATE ROLE \"{roleName}\" NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT LOGIN;";
        }

        var sql = new StringBuilder();
        sql.AppendLine($"-- Enhanced CREATE ROLE for real-time execution");
        sql.AppendLine($"-- Schema: {schema}");
        sql.AppendLine($"-- Role: {roleName}");

        // Ensure proper role name qualification
        var roleSql = difference.TargetDefinition;
        if (!roleSql.Contains($"\"{roleName}\""))
        {
            // Fix role name in CREATE statement
            var roleKeywordIndex = roleSql.IndexOf("ROLE", StringComparison.OrdinalIgnoreCase);
            if (roleKeywordIndex >= 0)
            {
                var roleNameIndex = roleKeywordIndex + 4;
                var spaceIndex = roleSql.IndexOf(' ', roleNameIndex);
                if (spaceIndex > 0)
                {
                    var originalRoleName = roleSql.Substring(roleNameIndex, spaceIndex - roleNameIndex).Trim();
                    roleSql = roleSql.Replace($"ROLE {originalRoleName}", $"ROLE \"{roleName}\"");
                }
            }
        }

        sql.AppendLine(roleSql);

        return sql.ToString();
    }

    private static string GenerateEnhancedCreateTablespaceSql(SchemaDifference difference, string schema, string tablespaceName)
    {
        if (string.IsNullOrEmpty(difference.TargetDefinition))
        {
            // Generate basic tablespace creation if no definition available
            return $"-- Creating basic tablespace {tablespaceName}\n" +
                   $"CREATE TABLESPACE \"{tablespaceName}\" OWNER postgres LOCATION '/var/lib/postgresql/tablespaces/{tablespaceName}';";
        }

        var sql = new StringBuilder();
        sql.AppendLine($"-- Enhanced CREATE TABLESPACE for real-time execution");
        sql.AppendLine($"-- Schema: {schema}");
        sql.AppendLine($"-- Tablespace: {tablespaceName}");

        // Ensure proper tablespace name qualification
        var tablespaceSql = difference.TargetDefinition;
        if (!tablespaceSql.Contains($"\"{tablespaceName}\""))
        {
            // Fix tablespace name in CREATE statement
            var tablespaceKeywordIndex = tablespaceSql.IndexOf("TABLESPACE", StringComparison.OrdinalIgnoreCase);
            if (tablespaceKeywordIndex >= 0)
            {
                var tablespaceNameIndex = tablespaceKeywordIndex + 10;
                var spaceIndex = tablespaceSql.IndexOf(' ', tablespaceNameIndex);
                if (spaceIndex > 0)
                {
                    var originalTablespaceName = tablespaceSql.Substring(tablespaceNameIndex, spaceIndex - tablespaceNameIndex).Trim();
                    tablespaceSql = tablespaceSql.Replace($"TABLESPACE {originalTablespaceName}", $"TABLESPACE \"{tablespaceName}\"");
                }
            }
        }

        sql.AppendLine(tablespaceSql);

        return sql.ToString();
    }

    private static string GenerateGenericCreateStatement(SchemaDifference difference, string schema, string objectName)
    {
        if (string.IsNullOrEmpty(difference.TargetDefinition))
            return $"-- Cannot create {difference.ObjectType} {schema}.{objectName} - no definition available";

        var sql = new StringBuilder();
        sql.AppendLine($"-- Generic CREATE for {difference.ObjectType}");
        sql.AppendLine($"-- Schema: {schema}");
        sql.AppendLine($"-- Object: {objectName}");
        sql.AppendLine($"-- WARNING: Manual review required for {difference.ObjectType}");

        sql.AppendLine(difference.TargetDefinition);

        return sql.ToString();
    }

    public void Dispose() => logger.LogInformation("MigrationScriptGenerator disposed");
}