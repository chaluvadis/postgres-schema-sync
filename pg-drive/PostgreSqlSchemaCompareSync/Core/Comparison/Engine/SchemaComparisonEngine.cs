namespace PostgreSqlSchemaCompareSync.Core.Comparison.Engine;

public class SchemaComparisonEngine
{
    private readonly ComparisonSettings _settings;
    private readonly ILogger<SchemaComparisonEngine> _logger;
    public SchemaComparisonEngine(
        IOptions<AppSettings> settings,
        ILogger<SchemaComparisonEngine> logger)
    {
        _settings = settings.Value.Comparison;
        _logger = logger;
    }
    public async Task<List<SchemaDifference>> CompareObjectsAsync(
        List<DatabaseObject> sourceObjects,
        List<DatabaseObject> targetObjects,
        ComparisonOptions options,
        CancellationToken cancellationToken = default)
    {
        var differences = new List<SchemaDifference>();
        try
        {
            _logger.LogInformation("Starting schema comparison: {SourceCount} source, {TargetCount} target objects",
                sourceObjects.Count, targetObjects.Count);
            // Group objects by type for efficient processing
            var sourceByType = sourceObjects.GroupBy(obj => obj.Type).ToDictionary(g => g.Key, g => g.ToList());
            var targetByType = targetObjects.GroupBy(obj => obj.Type).ToDictionary(g => g.Key, g => g.ToList());
            // Process each object type
            var comparisonTasks = new List<Task<List<SchemaDifference>>>();
            foreach (var objectType in sourceByType.Keys.Union(targetByType.Keys).Distinct())
            {
                var sourceTypeObjects = sourceByType.GetValueOrDefault(objectType, []);
                var targetTypeObjects = targetByType.GetValueOrDefault(objectType, []);
                comparisonTasks.Add(CompareObjectTypeAsync(
                    objectType, sourceTypeObjects, targetTypeObjects, options, cancellationToken));
            }
            var typeDifferences = await Task.WhenAll(comparisonTasks);
            foreach (var typeDiff in typeDifferences)
            {
                differences.AddRange(typeDiff);
            }
            _logger.LogInformation("Schema comparison completed: {DifferenceCount} differences found", differences.Count);
            return differences;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Schema comparison failed");
            throw;
        }
    }
    private async Task<List<SchemaDifference>> CompareObjectTypeAsync(
        ObjectType objectType,
        List<DatabaseObject> sourceObjects,
        List<DatabaseObject> targetObjects,
        ComparisonOptions options,
        CancellationToken cancellationToken)
    {
        var differences = new List<SchemaDifference>();
        try
        {
            _logger.LogDebug("Comparing {ObjectType}: {SourceCount} source, {TargetCount} target objects",
                objectType, sourceObjects.Count, targetObjects.Count);
            // Create lookup dictionaries for efficient comparison
            var sourceLookup = sourceObjects.ToDictionary(obj => obj.QualifiedName);
            var targetLookup = targetObjects.ToDictionary(obj => obj.QualifiedName);
            // Find added objects (in target but not in source)
            var addedObjects = targetObjects.Where(targetObj =>
                !sourceLookup.ContainsKey(targetObj.QualifiedName));
            foreach (var addedObj in addedObjects)
            {
                differences.Add(new SchemaDifference
                {
                    Type = DifferenceType.Added,
                    ObjectType = objectType,
                    ObjectName = addedObj.Name,
                    Schema = addedObj.Schema,
                    TargetDefinition = addedObj.Definition
                });
            }
            // Find removed objects (in source but not in target)
            var removedObjects = sourceObjects.Where(sourceObj =>
                !targetLookup.ContainsKey(sourceObj.QualifiedName));
            foreach (var removedObj in removedObjects)
            {
                differences.Add(new SchemaDifference
                {
                    Type = DifferenceType.Removed,
                    ObjectType = objectType,
                    ObjectName = removedObj.Name,
                    Schema = removedObj.Schema,
                    SourceDefinition = removedObj.Definition
                });
            }
            // Find modified objects (in both but different)
            var commonObjects = sourceObjects.Where(sourceObj =>
                targetLookup.ContainsKey(sourceObj.QualifiedName));
            var modificationTasks = commonObjects.Select(async sourceObj =>
            {
                var targetObj = targetLookup[sourceObj.QualifiedName];
                if (await AreObjectsDifferentAsync(sourceObj, targetObj, options, cancellationToken))
                {
                    var differenceDetails = await GetDifferenceDetailsAsync(sourceObj, targetObj, options, cancellationToken);
                    return new SchemaDifference
                    {
                        Type = DifferenceType.Modified,
                        ObjectType = objectType,
                        ObjectName = sourceObj.Name,
                        Schema = sourceObj.Schema,
                        SourceDefinition = sourceObj.Definition,
                        TargetDefinition = targetObj.Definition,
                        DifferenceDetails = differenceDetails
                    };
                }
                return null;
            });
            var modificationResults = await Task.WhenAll(modificationTasks);
            differences.AddRange(modificationResults.Where(diff => diff != null)!);
            _logger.LogDebug("Object type {ObjectType} comparison completed: {DifferenceCount} differences",
                objectType, differences.Count);
            return differences;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to compare object type {ObjectType}", objectType);
            throw;
        }
    }
    private async Task<bool> AreObjectsDifferentAsync(
        DatabaseObject sourceObj,
        DatabaseObject targetObj,
        ComparisonOptions options,
        CancellationToken cancellationToken)
    {
        try
        {
            // Quick check: compare basic properties
            if (sourceObj.Owner != targetObj.Owner ||
                sourceObj.SizeInBytes != targetObj.SizeInBytes)
            {
                return true;
            }
            // Compare definitions based on comparison mode
            if (options.Mode == ComparisonMode.Strict)
            {
                return sourceObj.Definition != targetObj.Definition;
            }
            else // Lenient mode
            {
                return !await AreDefinitionsEquivalentAsync(sourceObj.Definition, targetObj.Definition, cancellationToken);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error comparing objects {SourceName} and {TargetName}",
                sourceObj.QualifiedName, targetObj.QualifiedName);
            return true; // Assume different if comparison fails
        }
    }
    private Task<bool> AreDefinitionsEquivalentAsync(
        string sourceDefinition,
        string targetDefinition,
        CancellationToken cancellationToken)
    {
        try
        {
            // Normalize definitions for comparison
            var normalizedSource = NormalizeDefinition(sourceDefinition);
            var normalizedTarget = NormalizeDefinition(targetDefinition);
            // For now, do a simple string comparison
            // In a real implementation, this would use a proper SQL parser
            var areEquivalent = normalizedSource == normalizedTarget;
            return Task.FromResult(areEquivalent);
        }
        catch
        {
            // If normalization fails, fall back to exact comparison
            var areEquivalent = sourceDefinition == targetDefinition;
            return Task.FromResult(areEquivalent);
        }
    }
    private string NormalizeDefinition(string definition)
    {
        // Basic normalization: trim, normalize whitespace, convert to uppercase
        return definition
            .Trim()
            .Replace("\r\n", "\n")
            .Replace('\t', ' ')
            .Replace("  ", " ") // Collapse multiple spaces
            .ToUpperInvariant();
    }
    private async Task<List<string>> GetDifferenceDetailsAsync(
        DatabaseObject sourceObj,
        DatabaseObject targetObj,
        ComparisonOptions options,
        CancellationToken cancellationToken)
    {
        var details = new List<string>();
        try
        {
            // Compare specific properties based on object type
            switch (sourceObj)
            {
                case Table sourceTable when targetObj is Table targetTable:
                    details.AddRange(CompareTableProperties(sourceTable, targetTable));
                    details.AddRange(await CompareTableColumnsAsync(sourceTable, targetTable, options, cancellationToken));
                    break;
                case View sourceView when targetObj is View targetView:
                    details.AddRange(CompareViewProperties(sourceView, targetView));
                    break;
                case Function sourceFunction when targetObj is Function targetFunction:
                    details.AddRange(CompareFunctionProperties(sourceFunction, targetFunction));
                    break;
                case Core.Models.Index sourceIndex when targetObj is Core.Models.Index targetIndex:
                    details.AddRange(CompareIndexProperties(sourceIndex as Core.Models.Index, targetIndex as Core.Models.Index));
                    break;
                default:
                    details.Add("Object definitions differ");
                    break;
            }
            // Compare metadata properties
            if (sourceObj.Owner != targetObj.Owner)
                details.Add($"Owner differs: '{sourceObj.Owner}' vs '{targetObj.Owner}'");
            if (sourceObj.SizeInBytes != targetObj.SizeInBytes)
                details.Add($"Size differs: {sourceObj.SizeInBytes} vs {targetObj.SizeInBytes} bytes");
            // Compare custom properties
            var allPropertyKeys = sourceObj.Properties.Keys.Union(targetObj.Properties.Keys).Distinct();
            foreach (var key in allPropertyKeys)
            {
                var sourceValue = sourceObj.Properties.GetValueOrDefault(key, "");
                var targetValue = targetObj.Properties.GetValueOrDefault(key, "");
                if (sourceValue != targetValue)
                {
                    details.Add($"Property '{key}' differs: '{sourceValue}' vs '{targetValue}'");
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error getting difference details for {ObjectName}", sourceObj.Name);
            details.Add($"Error analyzing differences: {ex.Message}");
        }
        return details;
    }
    private List<string> CompareTableProperties(Table sourceTable, Table targetTable)
    {
        var details = new List<string>();
        if (sourceTable.RowCount != targetTable.RowCount)
            details.Add($"Row count differs: {sourceTable.RowCount} vs {targetTable.RowCount}");
        // Compare storage parameters
        if (sourceTable.StorageParameters.FillFactor != targetTable.StorageParameters.FillFactor)
            details.Add($"Fill factor differs: '{sourceTable.StorageParameters.FillFactor}' vs '{targetTable.StorageParameters.FillFactor}'");
        return details;
    }
    private Task<List<string>> CompareTableColumnsAsync(
        Table sourceTable,
        Table targetTable,
        ComparisonOptions options,
        CancellationToken cancellationToken)
    {
        var details = new List<string>();
        var sourceColumns = sourceTable.Columns.ToDictionary(c => c.Name);
        var targetColumns = targetTable.Columns.ToDictionary(c => c.Name);
        // Find added columns
        var addedColumns = targetColumns.Keys.Except(sourceColumns.Keys);
        foreach (var addedColumn in addedColumns)
        {
            details.Add($"Column added: {addedColumn}");
        }
        // Find removed columns
        var removedColumns = sourceColumns.Keys.Except(targetColumns.Keys);
        foreach (var removedColumn in removedColumns)
        {
            details.Add($"Column removed: {removedColumn}");
        }
        // Compare common columns
        var commonColumns = sourceColumns.Keys.Intersect(targetColumns.Keys);
        foreach (var columnName in commonColumns)
        {
            var sourceColumn = sourceColumns[columnName];
            var targetColumn = targetColumns[columnName];
            if (sourceColumn.DataType != targetColumn.DataType)
                details.Add($"Column '{columnName}' data type changed: {sourceColumn.DataType} -> {targetColumn.DataType}");
            if (sourceColumn.IsNullable != targetColumn.IsNullable)
                details.Add($"Column '{columnName}' nullability changed: {sourceColumn.IsNullable} -> {targetColumn.IsNullable}");
            if (sourceColumn.DefaultValue != targetColumn.DefaultValue)
                details.Add($"Column '{columnName}' default changed: '{sourceColumn.DefaultValue}' -> '{targetColumn.DefaultValue}'");
        }
        return Task.FromResult(details);
    }
    private List<string> CompareViewProperties(View sourceView, View targetView)
    {
        var details = new List<string>();
        if (sourceView.ReferencedTables.Count != targetView.ReferencedTables.Count)
        {
            details.Add($"Referenced table count differs: {sourceView.ReferencedTables.Count} vs {targetView.ReferencedTables.Count}");
        }
        var addedRefs = targetView.ReferencedTables.Except(sourceView.ReferencedTables);
        var removedRefs = sourceView.ReferencedTables.Except(targetView.ReferencedTables);
        foreach (var addedRef in addedRefs)
            details.Add($"Referenced table added: {addedRef}");
        foreach (var removedRef in removedRefs)
            details.Add($"Referenced table removed: {removedRef}");
        return details;
    }
    private List<string> CompareFunctionProperties(Function sourceFunction, Function targetFunction)
    {
        var details = new List<string>();
        if (sourceFunction.Language != targetFunction.Language)
            details.Add($"Language differs: '{sourceFunction.Language}' vs '{targetFunction.Language}'");
        if (sourceFunction.ReturnType != targetFunction.ReturnType)
            details.Add($"Return type differs: '{sourceFunction.ReturnType}' vs '{targetFunction.ReturnType}'");
        if (sourceFunction.Volatility != targetFunction.Volatility)
            details.Add($"Volatility differs: '{sourceFunction.Volatility}' vs '{targetFunction.Volatility}'");
        if (sourceFunction.Parameters.Count != targetFunction.Parameters.Count)
        {
            details.Add($"Parameter count differs: {sourceFunction.Parameters.Count} vs {targetFunction.Parameters.Count}");
        }
        return details;
    }
    private List<string> CompareIndexProperties(Core.Models.Index sourceIndex, Core.Models.Index targetIndex)
    {
        var details = new List<string>();
        if (sourceIndex.IsUnique != targetIndex.IsUnique)
            details.Add($"Uniqueness differs: {sourceIndex.IsUnique} vs {targetIndex.IsUnique}");
        if (sourceIndex.AccessMethod != targetIndex.AccessMethod)
            details.Add($"Access method differs: '{sourceIndex.AccessMethod}' vs '{targetIndex.AccessMethod}'");
        if (!sourceIndex.ColumnNames.SequenceEqual(targetIndex.ColumnNames))
        {
            details.Add($"Columns differ: [{string.Join(", ", sourceIndex.ColumnNames)}] vs [{string.Join(", ", targetIndex.ColumnNames)}]");
        }
        return details;
    }
}