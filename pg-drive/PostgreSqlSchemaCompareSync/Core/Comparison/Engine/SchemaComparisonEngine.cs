namespace PostgreSqlSchemaCompareSync.Core.Comparison.Engine;

public class SchemaComparisonEngine(
    ILogger<SchemaComparisonEngine> logger,
    IOptions<AppSettings> settings,
    ISchemaBrowser schemaBrowser) : ISchemaComparisonEngine
{
    private readonly ILogger<SchemaComparisonEngine> _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    private readonly AppSettings _settings = settings?.Value ?? throw new ArgumentNullException(nameof(settings));
    private readonly ISchemaBrowser _schemaBrowser = schemaBrowser ?? throw new ArgumentNullException(nameof(schemaBrowser));
    private bool _disposed;

    /// <summary>
    /// Compares schemas between two databases
    /// </summary>
    public async Task<SchemaComparison> CompareSchemasAsync(
        ConnectionInfo sourceConnection,
        ConnectionInfo targetConnection,
        MigrationComparisonOptions options,
        CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(sourceConnection);
        ArgumentNullException.ThrowIfNull(targetConnection);
        ArgumentNullException.ThrowIfNull(options);

        var startTime = DateTime.UtcNow;

        try
        {
            _logger.LogInformation("Starting schema comparison between {Source} and {Target}",
                sourceConnection.Database, targetConnection.Database);

            // Get objects from both databases
            var sourceObjects = await _schemaBrowser.GetDatabaseObjectsAsync(sourceConnection, null, ct);
            var targetObjects = await _schemaBrowser.GetDatabaseObjectsAsync(targetConnection, null, ct);

            // Filter objects based on options
            var filteredSourceObjects = FilterObjects(sourceObjects, options);
            var filteredTargetObjects = FilterObjects(targetObjects, options);

            // Compare objects
            var differences = await CompareObjectsAsync(
                sourceConnection,
                targetConnection,
                filteredSourceObjects,
                filteredTargetObjects,
                options,
                ct);

            var executionTime = DateTime.UtcNow - startTime;

            var comparison = new SchemaComparison
            {
                Id = Guid.NewGuid().ToString(),
                SourceConnection = sourceConnection,
                TargetConnection = targetConnection,
                Differences = differences,
                ExecutionTime = executionTime,
                CreatedAt = DateTime.UtcNow
            };

            _logger.LogInformation("Schema comparison completed: {DifferenceCount} differences found in {ExecutionTime}ms",
                differences.Count, executionTime.TotalMilliseconds);

            return comparison;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Schema comparison failed between {Source} and {Target}",
                sourceConnection.Database, targetConnection.Database);
            throw new SchemaException($"Schema comparison failed: {ex.Message}", sourceConnection.Id, ex);
        }
    }

    /// <summary>
    /// Compares specific objects between two databases
    /// </summary>
    public async Task<List<SchemaDifference>> CompareObjectsAsync(
        ConnectionInfo sourceConnection,
        ConnectionInfo targetConnection,
        List<DatabaseObject> sourceObjects,
        List<DatabaseObject> targetObjects,
        MigrationComparisonOptions options,
        CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(sourceConnection);
        ArgumentNullException.ThrowIfNull(targetConnection);
        ArgumentNullException.ThrowIfNull(sourceObjects);
        ArgumentNullException.ThrowIfNull(targetObjects);
        ArgumentNullException.ThrowIfNull(options);

        var differences = new List<SchemaDifference>();

        try
        {
            _logger.LogDebug("Comparing {SourceCount} source objects with {TargetCount} target objects",
                sourceObjects.Count, targetObjects.Count);

            // Create lookup maps for efficient comparison
            var sourceMap = sourceObjects.ToDictionary(BuildObjectKey);
            var targetMap = targetObjects.ToDictionary(BuildObjectKey);

            // Find added, removed, and modified objects
            foreach (var (key, sourceObj) in sourceMap)
            {
                ct.ThrowIfCancellationRequested();

                if (targetMap.TryGetValue(key, out var targetObj))
                {
                    // Object exists in both - check if modified
                    if (await AreObjectsEquivalentAsync(sourceObj, targetObj, options, ct))
                    {
                        // Objects are equivalent - no difference
                        continue;
                    }

                    // Objects are different
                    differences.Add(new SchemaDifference
                    {
                        Type = DifferenceType.Modified,
                        ObjectType = sourceObj.Type,
                        ObjectName = sourceObj.Name,
                        Schema = sourceObj.Schema,
                        SourceDefinition = sourceObj.Definition,
                        TargetDefinition = targetObj.Definition,
                        DifferenceDetails = await GetDifferenceDetailsAsync(sourceConnection, targetConnection, sourceObj, targetObj, options, ct),
                        Metadata = MergeMetadata(sourceObj.Properties, targetObj.Properties)
                    });
                }
                else
                {
                    // Object exists only in source - removed from target
                    differences.Add(new SchemaDifference
                    {
                        Type = DifferenceType.Removed,
                        ObjectType = sourceObj.Type,
                        ObjectName = sourceObj.Name,
                        Schema = sourceObj.Schema,
                        SourceDefinition = sourceObj.Definition,
                        DifferenceDetails = ["Object exists in source but not in target"],
                        Metadata = CopyMetadata(sourceObj.Properties)
                    });
                }
            }

            // Find added objects (exist only in target)
            foreach (var (key, targetObj) in targetMap)
            {
                ct.ThrowIfCancellationRequested();

                if (!sourceMap.ContainsKey(key))
                {
                    differences.Add(new SchemaDifference
                    {
                        Type = DifferenceType.Added,
                        ObjectType = targetObj.Type,
                        ObjectName = targetObj.Name,
                        Schema = targetObj.Schema,
                        TargetDefinition = targetObj.Definition,
                        DifferenceDetails = ["Object exists in target but not in source"],
                        Metadata = CopyMetadata(targetObj.Properties)
                    });
                }
            }

            _logger.LogDebug("Object comparison completed: {DifferenceCount} differences found", differences.Count);
            return differences;
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("Object comparison cancelled");
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Object comparison failed");
            throw new SchemaException($"Object comparison failed: {ex.Message}", sourceConnection.Id, ex);
        }
    }

    private static string BuildObjectKey(DatabaseObject databaseObject)
    {
        var key = $"{databaseObject.Type}:{databaseObject.Schema}:{databaseObject.Name}";

        if (databaseObject.Type is ObjectType.Function or ObjectType.Procedure)
        {
            if (databaseObject.Properties.TryGetValue("Signature", out var signatureObj) &&
                signatureObj is string signature &&
                !string.IsNullOrWhiteSpace(signature))
            {
                return $"{key}:{signature}";
            }
        }

        return key;
    }
    public async Task<bool> AreObjectsEquivalentAsync(
        DatabaseObject sourceObject,
        DatabaseObject targetObject,
        MigrationComparisonOptions options,
        CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(sourceObject);
        ArgumentNullException.ThrowIfNull(targetObject);
        ArgumentNullException.ThrowIfNull(options);

        try
        {
            // Basic property comparison
            if (sourceObject.Type != targetObject.Type ||
                sourceObject.Schema != targetObject.Schema ||
                sourceObject.Name != targetObject.Name)
            {
                return false;
            }

            // Definition comparison based on mode
            if (options.Mode == ComparisonMode.Strict)
            {
                return string.Equals(sourceObject.Definition, targetObject.Definition, StringComparison.Ordinal);
            }
            else // Lenient mode
            {
                var sourceNormalized = NormalizeDefinition(sourceObject.Definition);
                var targetNormalized = NormalizeDefinition(targetObject.Definition);
                return string.Equals(sourceNormalized, targetNormalized, StringComparison.OrdinalIgnoreCase);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error checking object equivalence for {ObjectType} {ObjectName}",
                sourceObject.Type, sourceObject.Name);
            return false;
        }
    }
    private List<DatabaseObject> FilterObjects(List<DatabaseObject> objects, MigrationComparisonOptions options)
    {
        var filtered = objects.AsEnumerable();

        // Filter by schemas to ignore
        if (options.IgnoreSchemas != null && options.IgnoreSchemas.Count != 0)
        {
            filtered = filtered.Where(obj => !options.IgnoreSchemas.Contains(obj.Schema));
        }

        // Filter by object types
        if (options.ObjectTypes != null && options.ObjectTypes.Count != 0)
        {
            filtered = filtered.Where(obj => options.ObjectTypes.Contains(obj.Type));
        }

        // Filter system objects
        if (!options.IncludeSystemObjects)
        {
            var systemSchemas = _settings.Schema.IgnoredSchemas ?? ["information_schema", "pg_catalog", "pg_toast"];
            filtered = filtered.Where(obj => !systemSchemas.Contains(obj.Schema));
        }

        return [.. filtered];
    }

    /// <summary>
    /// Gets detailed difference information between two objects
    /// </summary>
    private async Task<List<string>> GetDifferenceDetailsAsync(
        ConnectionInfo sourceConnection,
        ConnectionInfo targetConnection,
        DatabaseObject sourceObject,
        DatabaseObject targetObject,
        MigrationComparisonOptions options,
        CancellationToken ct)
    {
        var details = new List<string>();

        try
        {
            if (sourceObject.Definition != targetObject.Definition)
            {
                details.Add("Definition differs");
            }

            if (sourceObject.SizeInBytes != targetObject.SizeInBytes)
            {
                details.Add($"Size differs: {sourceObject.SizeInBytes} vs {targetObject.SizeInBytes} bytes");
            }

            if (sourceObject.Owner != targetObject.Owner)
            {
                details.Add($"Owner differs: {sourceObject.Owner} vs {targetObject.Owner}");
            }

            // Object-specific differences
            if (sourceObject.Type == ObjectType.Table && targetObject.Type == ObjectType.Table)
            {
                var tableDifferences = await GetTableDifferencesAsync(sourceConnection, targetConnection, sourceObject, targetObject, options, ct);
                details.AddRange(tableDifferences);
            }
            else if (sourceObject.Type == ObjectType.View && targetObject.Type == ObjectType.View)
            {
                var viewDifferences = await GetViewDifferencesAsync(sourceConnection, targetConnection, sourceObject, targetObject, options, ct);
                details.AddRange(viewDifferences);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error getting difference details for {ObjectType} {ObjectName}",
                sourceObject.Type, sourceObject.Name);
            details.Add($"Error analyzing differences: {ex.Message}");
        }

        return details;
    }
    private static string? NormalizeDefinition(string? definition)
    {
        if (string.IsNullOrEmpty(definition))
            return definition;

        return definition
            .Replace("\r\n", "\n") // Normalize line endings
            .Replace("\r", "\n")
            .Replace("\t", " ") // Normalize tabs to spaces
            .Replace("  ", " ") // Collapse multiple spaces
            .Trim()
            .ToLowerInvariant();
    }

    private static Dictionary<string, object?> CopyMetadata(Dictionary<string, object> source)
    {
        var metadata = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);

        foreach (var (key, value) in source)
        {
            metadata[key] = value;
        }

        return metadata;
    }

    private static Dictionary<string, object?> MergeMetadata(Dictionary<string, object> source, Dictionary<string, object> target)
    {
        var metadata = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);

        foreach (var (key, value) in target)
        {
            metadata[key] = value;
        }

        foreach (var (key, value) in source)
        {
            if (!metadata.ContainsKey(key))
            {
                metadata[key] = value;
            }
        }

        return metadata;
    }

    /// <summary>
    /// Gets table-specific differences
    /// </summary>
    private async Task<List<string>> GetTableDifferencesAsync(
        ConnectionInfo sourceConnection,
        ConnectionInfo targetConnection,
        DatabaseObject sourceObject,
        DatabaseObject targetObject,
        MigrationComparisonOptions options,
        CancellationToken ct)
    {
        var differences = new List<string>();

        try
        {
            _logger.LogDebug("Getting detailed table differences for {SourceTable} vs {TargetTable}",
                $"{sourceObject.Schema}.{sourceObject.Name}", $"{targetObject.Schema}.{targetObject.Name}");

            // Get detailed information for both tables
            var sourceDetails = await _schemaBrowser.GetObjectDetailsAsync(
                sourceConnection,
                ObjectType.Table,
                sourceObject.Schema,
                sourceObject.Name,
                ct);

            var targetDetails = await _schemaBrowser.GetObjectDetailsAsync(
                targetConnection,
                ObjectType.Table,
                targetObject.Schema,
                targetObject.Name,
                ct);

            // Compare columns
            var columnDifferences = CompareTableColumns(sourceDetails.Columns, targetDetails.Columns);
            differences.AddRange(columnDifferences);

            // Compare constraints
            var constraintDifferences = CompareTableConstraints(sourceDetails.Constraints, targetDetails.Constraints);
            differences.AddRange(constraintDifferences);

            // Compare indexes
            var indexDifferences = CompareTableIndexes(sourceDetails.Indexes, targetDetails.Indexes);
            differences.AddRange(indexDifferences);

            // Compare triggers
            var triggerDifferences = CompareTableTriggers(sourceDetails.Triggers, targetDetails.Triggers);
            differences.AddRange(triggerDifferences);

            if (differences.Count == 0)
            {
                differences.Add("Tables have identical structure");
            }

            _logger.LogDebug("Table differences analysis completed: {DifferenceCount} differences found", differences.Count);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error getting table differences for {SourceTable} vs {TargetTable}",
                $"{sourceObject.Schema}.{sourceObject.Name}", $"{targetObject.Schema}.{targetObject.Name}");
            differences.Add($"Error analyzing table differences: {ex.Message}");
        }

        return differences;
    }

    /// <summary>
    /// Gets view-specific differences
    /// </summary>
    private async Task<List<string>> GetViewDifferencesAsync(
        ConnectionInfo sourceConnection,
        ConnectionInfo targetConnection,
        DatabaseObject sourceObject,
        DatabaseObject targetObject,
        MigrationComparisonOptions options,
        CancellationToken ct)
    {
        var differences = new List<string>();

        try
        {
            _logger.LogDebug("Getting detailed view differences for {SourceView} vs {TargetView}",
                $"{sourceObject.Schema}.{sourceObject.Name}", $"{targetObject.Schema}.{targetObject.Name}");

            // Get detailed information for both views
            var sourceDetails = await _schemaBrowser.GetObjectDetailsAsync(
                sourceConnection,
                ObjectType.View,
                sourceObject.Schema,
                sourceObject.Name,
                ct);

            var targetDetails = await _schemaBrowser.GetObjectDetailsAsync(
                targetConnection,
                ObjectType.View,
                targetObject.Schema,
                targetObject.Name,
                ct);

            // Compare view columns if available
            if (sourceDetails.Columns.Count != 0 || targetDetails.Columns.Count != 0)
            {
                var columnDifferences = CompareViewColumns(sourceDetails.Columns, targetDetails.Columns);
                differences.AddRange(columnDifferences);
            }

            // Compare dependencies
            var sourceDependencies = await _schemaBrowser.GetObjectDependenciesAsync(
                sourceConnection, ObjectType.View, sourceObject.Schema, sourceObject.Name, ct);
            var targetDependencies = await _schemaBrowser.GetObjectDependenciesAsync(
                targetConnection, ObjectType.View, targetObject.Schema, targetObject.Name, ct);

            var dependencyDifferences = CompareViewDependencies(sourceDependencies, targetDependencies);
            differences.AddRange(dependencyDifferences);

            // Compare additional properties
            if (sourceDetails.AdditionalInfo.Count != targetDetails.AdditionalInfo.Count)
            {
                differences.Add($"Additional properties count differs: {sourceDetails.AdditionalInfo.Count} vs {targetDetails.AdditionalInfo.Count}");
            }

            if (differences.Count == 0)
            {
                differences.Add("Views have identical structure and dependencies");
            }

            _logger.LogDebug("View differences analysis completed: {DifferenceCount} differences found", differences.Count);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error getting view differences for {SourceView} vs {TargetView}",
                $"{sourceObject.Schema}.{sourceObject.Name}", $"{targetObject.Schema}.{targetObject.Name}");
            differences.Add($"Error analyzing view differences: {ex.Message}");
        }

        return differences;
    }

    /// <summary>
    /// Compares columns between two tables
    /// </summary>
    private List<string> CompareTableColumns(List<ColumnInfo> sourceColumns, List<ColumnInfo> targetColumns)
    {
        var differences = new List<string>();

        // Create lookup dictionaries for efficient comparison
        var sourceColumnMap = sourceColumns.ToDictionary(col => col.Name, col => col);
        var targetColumnMap = targetColumns.ToDictionary(col => col.Name, col => col);

        // Find added, removed, and modified columns
        foreach (var (columnName, sourceColumn) in sourceColumnMap)
        {
            if (targetColumnMap.TryGetValue(columnName, out var targetColumn))
            {
                // Column exists in both - check if modified
                if (!AreColumnsEquivalent(sourceColumn, targetColumn))
                {
                    differences.Add($"Column '{columnName}' differs:");
                    differences.Add($"  Source: {sourceColumn.DataType}{(sourceColumn.IsNullable ? " NULL" : " NOT NULL")}");
                    differences.Add($"  Target: {targetColumn.DataType}{(targetColumn.IsNullable ? " NULL" : " NOT NULL")}");
                }
            }
            else
            {
                // Column exists only in source
                differences.Add($"Column '{columnName}' exists only in source table ({sourceColumn.DataType})");
            }
        }

        // Find added columns (exist only in target)
        foreach (var (columnName, targetColumn) in targetColumnMap)
        {
            if (!sourceColumnMap.ContainsKey(columnName))
            {
                differences.Add($"Column '{columnName}' exists only in target table ({targetColumn.DataType})");
            }
        }

        return differences;
    }

    /// <summary>
    /// Compares constraints between two tables
    /// </summary>
    private List<string> CompareTableConstraints(List<ConstraintInfo> sourceConstraints, List<ConstraintInfo> targetConstraints)
    {
        var differences = new List<string>();

        // Create lookup dictionaries for efficient comparison
        var sourceConstraintMap = sourceConstraints.ToDictionary(con => con.Name, con => con);
        var targetConstraintMap = targetConstraints.ToDictionary(con => con.Name, con => con);

        // Find added, removed, and modified constraints
        foreach (var (constraintName, sourceConstraint) in sourceConstraintMap)
        {
            if (targetConstraintMap.TryGetValue(constraintName, out var targetConstraint))
            {
                // Constraint exists in both - check if modified
                if (!AreConstraintsEquivalent(sourceConstraint, targetConstraint))
                {
                    differences.Add($"Constraint '{constraintName}' differs:");
                    differences.Add($"  Source: {sourceConstraint.Type} on {string.Join(", ", sourceConstraint.Columns)}");
                    differences.Add($"  Target: {targetConstraint.Type} on {string.Join(", ", targetConstraint.Columns)}");
                }
            }
            else
            {
                // Constraint exists only in source
                differences.Add($"Constraint '{constraintName}' exists only in source table");
            }
        }

        // Find added constraints (exist only in target)
        foreach (var (constraintName, targetConstraint) in targetConstraintMap)
        {
            if (!sourceConstraintMap.ContainsKey(constraintName))
            {
                differences.Add($"Constraint '{constraintName}' exists only in target table");
            }
        }

        return differences;
    }

    /// <summary>
    /// Compares indexes between two tables
    /// </summary>
    private List<string> CompareTableIndexes(List<IndexInfo> sourceIndexes, List<IndexInfo> targetIndexes)
    {
        var differences = new List<string>();

        // Create lookup dictionaries for efficient comparison
        var sourceIndexMap = sourceIndexes.ToDictionary(idx => idx.Name, idx => idx);
        var targetIndexMap = targetIndexes.ToDictionary(idx => idx.Name, idx => idx);

        // Find added, removed, and modified indexes
        foreach (var (indexName, sourceIndex) in sourceIndexMap)
        {
            if (targetIndexMap.TryGetValue(indexName, out var targetIndex))
            {
                // Index exists in both - check if modified
                if (!AreIndexesEquivalent(sourceIndex, targetIndex))
                {
                    differences.Add($"Index '{indexName}' differs:");
                    differences.Add($"  Source: {sourceIndex.Type} on {string.Join(", ", sourceIndex.Columns)}");
                    differences.Add($"  Target: {targetIndex.Type} on {string.Join(", ", targetIndex.Columns)}");
                }
            }
            else
            {
                // Index exists only in source
                differences.Add($"Index '{indexName}' exists only in source table");
            }
        }

        // Find added indexes (exist only in target)
        foreach (var (indexName, targetIndex) in targetIndexMap)
        {
            if (!sourceIndexMap.ContainsKey(indexName))
            {
                differences.Add($"Index '{indexName}' exists only in target table");
            }
        }

        return differences;
    }

    /// <summary>
    /// Compares triggers between two tables
    /// </summary>
    private List<string> CompareTableTriggers(List<TriggerInfo> sourceTriggers, List<TriggerInfo> targetTriggers)
    {
        var differences = new List<string>();

        // Create lookup dictionaries for efficient comparison
        var sourceTriggerMap = sourceTriggers.ToDictionary(trg => trg.Name, trg => trg);
        var targetTriggerMap = targetTriggers.ToDictionary(trg => trg.Name, trg => trg);

        // Find added, removed, and modified triggers
        foreach (var (triggerName, sourceTrigger) in sourceTriggerMap)
        {
            if (targetTriggerMap.TryGetValue(triggerName, out var targetTrigger))
            {
                // Trigger exists in both - check if modified
                if (!AreTriggersEquivalent(sourceTrigger, targetTrigger))
                {
                    differences.Add($"Trigger '{triggerName}' differs:");
                    differences.Add($"  Source: {sourceTrigger.Event} {sourceTrigger.Timing} -> {sourceTrigger.Function}");
                    differences.Add($"  Target: {targetTrigger.Event} {targetTrigger.Timing} -> {targetTrigger.Function}");
                }
            }
            else
            {
                // Trigger exists only in source
                differences.Add($"Trigger '{triggerName}' exists only in source table");
            }
        }

        // Find added triggers (exist only in target)
        foreach (var (triggerName, targetTrigger) in targetTriggerMap)
        {
            if (!sourceTriggerMap.ContainsKey(triggerName))
            {
                differences.Add($"Trigger '{triggerName}' exists only in target table");
            }
        }

        return differences;
    }

    /// <summary>
    /// Checks if two columns are equivalent
    /// </summary>
    private bool AreColumnsEquivalent(ColumnInfo sourceColumn, ColumnInfo targetColumn)
    {
        return sourceColumn.Name == targetColumn.Name &&
               sourceColumn.DataType == targetColumn.DataType &&
               sourceColumn.IsNullable == targetColumn.IsNullable &&
               sourceColumn.DefaultValue == targetColumn.DefaultValue &&
               sourceColumn.MaxLength == targetColumn.MaxLength &&
               sourceColumn.Precision == targetColumn.Precision &&
               sourceColumn.Scale == targetColumn.Scale;
    }

    /// <summary>
    /// Checks if two constraints are equivalent
    /// </summary>
    private bool AreConstraintsEquivalent(ConstraintInfo sourceConstraint, ConstraintInfo targetConstraint)
    {
        return sourceConstraint.Name == targetConstraint.Name &&
               sourceConstraint.Type == targetConstraint.Type &&
               Enumerable.SequenceEqual(sourceConstraint.Columns.OrderBy(c => c), targetConstraint.Columns.OrderBy(c => c)) &&
               sourceConstraint.CheckClause == targetConstraint.CheckClause &&
               sourceConstraint.References == targetConstraint.References;
    }

    /// <summary>
    /// Checks if two indexes are equivalent
    /// </summary>
    private bool AreIndexesEquivalent(IndexInfo sourceIndex, IndexInfo targetIndex)
    {
        return sourceIndex.Name == targetIndex.Name &&
               sourceIndex.Type == targetIndex.Type &&
               sourceIndex.IsUnique == targetIndex.IsUnique &&
               sourceIndex.IsPrimary == targetIndex.IsPrimary &&
               Enumerable.SequenceEqual(sourceIndex.Columns.OrderBy(c => c), targetIndex.Columns.OrderBy(c => c)) &&
               sourceIndex.Condition == targetIndex.Condition;
    }

    /// <summary>
    /// Checks if two triggers are equivalent
    /// </summary>
    private bool AreTriggersEquivalent(TriggerInfo sourceTrigger, TriggerInfo targetTrigger)
    {
        return sourceTrigger.Name == targetTrigger.Name &&
               sourceTrigger.Event == targetTrigger.Event &&
               sourceTrigger.Timing == targetTrigger.Timing &&
               sourceTrigger.Function == targetTrigger.Function &&
               sourceTrigger.Condition == targetTrigger.Condition;
    }

    /// <summary>
    /// Compares columns between two views
    /// </summary>
    private List<string> CompareViewColumns(List<ColumnInfo> sourceColumns, List<ColumnInfo> targetColumns)
    {
        var differences = new List<string>();

        // Create lookup dictionaries for efficient comparison
        var sourceColumnMap = sourceColumns.ToDictionary(col => col.Name, col => col);
        var targetColumnMap = targetColumns.ToDictionary(col => col.Name, col => col);

        // Find added, removed, and modified columns
        foreach (var (columnName, sourceColumn) in sourceColumnMap)
        {
            if (targetColumnMap.TryGetValue(columnName, out var targetColumn))
            {
                // Column exists in both - check if modified
                if (!AreColumnsEquivalent(sourceColumn, targetColumn))
                {
                    differences.Add($"View column '{columnName}' differs:");
                    differences.Add($"  Source: {sourceColumn.DataType}{(sourceColumn.IsNullable ? " NULL" : " NOT NULL")}");
                    differences.Add($"  Target: {targetColumn.DataType}{(targetColumn.IsNullable ? " NULL" : " NOT NULL")}");
                }
            }
            else
            {
                // Column exists only in source
                differences.Add($"View column '{columnName}' exists only in source view ({sourceColumn.DataType})");
            }
        }

        // Find added columns (exist only in target)
        foreach (var (columnName, targetColumn) in targetColumnMap)
        {
            if (!sourceColumnMap.ContainsKey(columnName))
            {
                differences.Add($"View column '{columnName}' exists only in target view ({targetColumn.DataType})");
            }
        }

        return differences;
    }

    /// <summary>
    /// Compares dependencies between two views
    /// </summary>
    private List<string> CompareViewDependencies(List<string> sourceDependencies, List<string> targetDependencies)
    {
        var differences = new List<string>();

        // Create lookup sets for efficient comparison
        var sourceDependencySet = new HashSet<string>(sourceDependencies);
        var targetDependencySet = new HashSet<string>(targetDependencies);

        // Find added dependencies (exist only in target)
        foreach (var targetDependency in targetDependencySet)
        {
            if (!sourceDependencySet.Contains(targetDependency))
            {
                differences.Add($"Dependency exists only in target view: {targetDependency}");
            }
        }

        // Find removed dependencies (exist only in source)
        foreach (var sourceDependency in sourceDependencySet)
        {
            if (!targetDependencySet.Contains(sourceDependency))
            {
                differences.Add($"Dependency exists only in source view: {sourceDependency}");
            }
        }

        return differences;
    }

    public void Dispose()
    {
        if (!_disposed)
        {
            _disposed = true;
            _logger.LogInformation("SchemaComparisonEngine disposed");
        }
    }
}