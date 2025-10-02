namespace PostgreSqlSchemaCompareSync.Core.Comparison.Engine;

public class SchemaComparisonEngine : ISchemaComparisonEngine
{
    private readonly ComparisonSettings _settings;
    private readonly ILogger<SchemaComparisonEngine> _logger;

    public SchemaComparisonEngine(IOptions<AppSettings> settings, ILogger<SchemaComparisonEngine> logger)
    {
        _settings = settings.Value.Comparison;
        _logger = logger;
        ValidateSettings();
        LogSettings();
    }

    private void ValidateSettings()
    {
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(_settings.DefaultMode) ||
            !Enum.TryParse<ComparisonMode>(_settings.DefaultMode, true, out _))
            errors.Add($"Invalid DefaultMode '{_settings.DefaultMode}'. Valid values: {string.Join(", ", Enum.GetNames<ComparisonMode>())}");

        if (_settings.MaxDegreeOfParallelism is < 1 or > 8)
            errors.Add($"MaxDegreeOfParallelism must be 1-8, got {_settings.MaxDegreeOfParallelism}");

        if (_settings.ChunkSize is < 100 or > 10000)
            errors.Add($"ChunkSize must be 100-10000, got {_settings.ChunkSize}");

        if (errors.Count > 0)
        {
            var errorMessage = $"Invalid ComparisonSettings: {string.Join("; ", errors)}";
            _logger.LogError(errorMessage);
            throw new ArgumentException(errorMessage);
        }
    }

    private void LogSettings() =>
        _logger.LogInformation(
            "SchemaComparisonEngine initialized: DefaultMode={DefaultMode}, EnableParallelProcessing={EnableParallelProcessing}, MaxDegreeOfParallelism={MaxDegreeOfParallelism}, ChunkSize={ChunkSize}",
            _settings.DefaultMode, _settings.EnableParallelProcessing, _settings.MaxDegreeOfParallelism, _settings.ChunkSize);

    private ComparisonMode GetComparisonMode(ComparisonOptions? options = null)
    {
        if (options != null)
        {
            return options.Mode;
        }
        if (_settings.DefaultMode != null && Enum.TryParse<ComparisonMode>(_settings.DefaultMode, true, out var mode))
        {
            return mode;
        }
        _logger.LogWarning("Failed to parse DefaultMode '{DefaultMode}', falling back to Strict", _settings.DefaultMode);
        return ComparisonMode.Strict;
    }

    public async Task<List<SchemaDifference>> CompareObjectsAsync(
        List<DatabaseObject> sourceObjects,
        List<DatabaseObject> targetObjects,
        ComparisonOptions options,
        CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Starting schema comparison: {SourceCount} source, {TargetCount} target objects",
            sourceObjects.Count, targetObjects.Count);

        var sourceByType = sourceObjects.GroupBy(obj => obj.Type).ToDictionary(g => g.Key, g => g.ToList());
        var targetByType = targetObjects.GroupBy(obj => obj.Type).ToDictionary(g => g.Key, g => g.ToList());

        try
        {
            var objectTypes = sourceByType.Keys.Union(targetByType.Keys).ToList();
            var tasks = objectTypes.Select(objectType =>
            {
                var source = sourceByType.GetValueOrDefault(objectType, []);
                var target = targetByType.GetValueOrDefault(objectType, []);
                return CompareObjectTypeAsync(objectType, source, target, options, cancellationToken);
            });

            List<SchemaDifference>[] typeDiffs;
            if (_settings.EnableParallelProcessing && objectTypes.Count > 1)
            {
                typeDiffs = await Task.WhenAll(tasks);
            }
            else
            {
                typeDiffs = await Task.WhenAll(tasks);
            }

            var differences = typeDiffs.SelectMany(d => d).ToList();
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
        _logger.LogDebug("Comparing {ObjectType}: {SourceCount} source, {TargetCount} target objects",
            objectType, sourceObjects.Count, targetObjects.Count);

        if (ShouldUseChunking(sourceObjects, targetObjects))
            return await CompareObjectTypeWithChunkingAsync(objectType, sourceObjects, targetObjects, options, cancellationToken);

        var sourceLookup = sourceObjects.ToDictionary(obj => obj.QualifiedName);
        var targetLookup = targetObjects.ToDictionary(obj => obj.QualifiedName);

        var differences = new List<SchemaDifference>();

        // Added
        differences.AddRange(targetObjects
            .Where(obj => !sourceLookup.ContainsKey(obj.QualifiedName))
            .Select(obj => new SchemaDifference
            {
                Type = DifferenceType.Added,
                ObjectType = objectType,
                ObjectName = obj.Name,
                Schema = obj.Schema,
                TargetDefinition = obj.Definition
            }));

        // Removed
        differences.AddRange(sourceObjects
            .Where(obj => !targetLookup.ContainsKey(obj.QualifiedName))
            .Select(obj => new SchemaDifference
            {
                Type = DifferenceType.Removed,
                ObjectType = objectType,
                ObjectName = obj.Name,
                Schema = obj.Schema,
                SourceDefinition = obj.Definition
            }));

        // Modified
        var comparisonMode = GetComparisonMode(options);
        var modificationTasks = sourceObjects
            .Where(obj => targetLookup.ContainsKey(obj.QualifiedName))
            .Select(async sourceObj =>
            {
                var targetObj = targetLookup[sourceObj.QualifiedName];
                if (await AreObjectsDifferentAsync(sourceObj, targetObj, comparisonMode, cancellationToken))
                {
                    var details = await GetDifferenceDetailsAsync(sourceObj, targetObj, options, cancellationToken);
                    return new SchemaDifference
                    {
                        Type = DifferenceType.Modified,
                        ObjectType = objectType,
                        ObjectName = sourceObj.Name,
                        Schema = sourceObj.Schema,
                        SourceDefinition = sourceObj.Definition,
                        TargetDefinition = targetObj.Definition,
                        DifferenceDetails = details
                    };
                }
                return null;
            });

        differences.AddRange((await Task.WhenAll(modificationTasks)).Where(diff => diff != null)!);

        _logger.LogDebug("Object type {ObjectType} comparison completed: {DifferenceCount} differences", objectType, differences.Count);
        return differences;
    }

    private bool ShouldUseChunking(List<DatabaseObject> source, List<DatabaseObject> target)
        => source.Count + target.Count > _settings.ChunkSize;

    private async Task<List<SchemaDifference>> CompareObjectTypeWithChunkingAsync(
        ObjectType objectType,
        List<DatabaseObject> sourceObjects,
        List<DatabaseObject> targetObjects,
        ComparisonOptions options,
        CancellationToken cancellationToken)
    {
        var sourceLookup = sourceObjects.ToDictionary(obj => obj.QualifiedName);
        var targetLookup = targetObjects.ToDictionary(obj => obj.QualifiedName);
        var allObjects = sourceObjects.Concat(targetObjects).Distinct().ToList();
        var chunks = allObjects.Chunk(_settings.ChunkSize);

        var differences = new List<SchemaDifference>();

        foreach (var chunk in chunks)
        {
            if (cancellationToken.IsCancellationRequested) break;
            var chunkDiffs = await ProcessChunkAsync(objectType, chunk, sourceLookup, targetLookup, GetComparisonMode(options), cancellationToken);
            differences.AddRange(chunkDiffs);
        }
        return differences;
    }

    private async Task<List<SchemaDifference>> ProcessChunkAsync(
        ObjectType objectType,
        DatabaseObject[] chunk,
        Dictionary<string, DatabaseObject> sourceLookup,
        Dictionary<string, DatabaseObject> targetLookup,
        ComparisonMode comparisonMode,
        CancellationToken cancellationToken)
    {
        var differences = new List<SchemaDifference>();

        differences.AddRange(chunk
            .Where(obj => targetLookup.ContainsKey(obj.QualifiedName) && !sourceLookup.ContainsKey(obj.QualifiedName))
            .Select(obj => new SchemaDifference
            {
                Type = DifferenceType.Added,
                ObjectType = objectType,
                ObjectName = obj.Name,
                Schema = obj.Schema,
                TargetDefinition = obj.Definition
            }));

        differences.AddRange(chunk
            .Where(obj => sourceLookup.ContainsKey(obj.QualifiedName) && !targetLookup.ContainsKey(obj.QualifiedName))
            .Select(obj => new SchemaDifference
            {
                Type = DifferenceType.Removed,
                ObjectType = objectType,
                ObjectName = obj.Name,
                Schema = obj.Schema,
                SourceDefinition = obj.Definition
            }));

        var modificationTasks = chunk
            .Where(obj => sourceLookup.ContainsKey(obj.QualifiedName) && targetLookup.ContainsKey(obj.QualifiedName))
            .Select(async sourceObj =>
            {
                if (cancellationToken.IsCancellationRequested) return null;
                var targetObj = targetLookup[sourceObj.QualifiedName];
                if (await AreObjectsDifferentAsync(sourceObj, targetObj, comparisonMode, cancellationToken))
                {
                    var details = await GetDifferenceDetailsAsync(sourceObj, targetObj, new ComparisonOptions(), cancellationToken);
                    return new SchemaDifference
                    {
                        Type = DifferenceType.Modified,
                        ObjectType = objectType,
                        ObjectName = sourceObj.Name,
                        Schema = sourceObj.Schema,
                        SourceDefinition = sourceObj.Definition,
                        TargetDefinition = targetObj.Definition,
                        DifferenceDetails = details
                    };
                }
                return null;
            });

        differences.AddRange((await Task.WhenAll(modificationTasks)).Where(diff => diff != null)!);
        return differences;
    }

    private async Task<bool> AreObjectsDifferentAsync(
        DatabaseObject sourceObj,
        DatabaseObject targetObj,
        ComparisonMode comparisonMode,
        CancellationToken cancellationToken)
    {
        try
        {
            if (sourceObj.Owner != targetObj.Owner ||
                sourceObj.SizeInBytes != targetObj.SizeInBytes)
                return true;

            return comparisonMode switch
            {
                ComparisonMode.Strict => sourceObj.Definition != targetObj.Definition,
                _ => !await AreDefinitionsEquivalentAsync(sourceObj.Definition, targetObj.Definition, cancellationToken)
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error comparing objects {SourceName} and {TargetName}", sourceObj.QualifiedName, targetObj.QualifiedName);
            return true;
        }
    }

    private Task<bool> AreDefinitionsEquivalentAsync(
        string sourceDefinition,
        string targetDefinition,
        CancellationToken cancellationToken)
    {
        try
        {
            var normalizedSource = NormalizeDefinition(sourceDefinition);
            var normalizedTarget = NormalizeDefinition(targetDefinition);
            return Task.FromResult(normalizedSource == normalizedTarget);
        }
        catch
        {
            return Task.FromResult(sourceDefinition == targetDefinition);
        }
    }

    private static string NormalizeDefinition(string definition) => definition
        .Trim()
        .Replace("\r\n", "\n")
        .Replace('\t', ' ')
        .Replace("  ", " ")
        .ToUpperInvariant();

    private async Task<List<string>> GetDifferenceDetailsAsync(
        DatabaseObject sourceObj,
        DatabaseObject targetObj,
        ComparisonOptions options,
        CancellationToken cancellationToken)
    {
        var details = new List<string>();
        try
        {
            switch (sourceObj)
            {
                case Table sTable when targetObj is Table tTable:
                    details.AddRange(CompareTableProperties(sTable, tTable));
                    details.AddRange(await CompareTableColumnsAsync(sTable, tTable, options, cancellationToken));
                    break;
                case View sView when targetObj is View tView:
                    details.AddRange(CompareViewProperties(sView, tView));
                    break;
                case Function sFunc when targetObj is Function tFunc:
                    details.AddRange(CompareFunctionProperties(sFunc, tFunc));
                    break;
                case TableIndex sIndex when targetObj is TableIndex tIndex:
                    details.AddRange(CompareIndexProperties(sIndex, tIndex));
                    break;
                default:
                    details.Add("Object definitions differ");
                    break;
            }
            if (sourceObj.Owner != targetObj.Owner)
                details.Add($"Owner differs: '{sourceObj.Owner}' vs '{targetObj.Owner}'");
            if (sourceObj.SizeInBytes != targetObj.SizeInBytes)
                details.Add($"Size differs: {sourceObj.SizeInBytes} vs {targetObj.SizeInBytes} bytes");

            foreach (var key in sourceObj.Properties.Keys.Union(targetObj.Properties.Keys))
            {
                var sourceValue = sourceObj.Properties.GetValueOrDefault(key, "");
                var targetValue = targetObj.Properties.GetValueOrDefault(key, "");
                if (sourceValue != targetValue)
                    details.Add($"Property '{key}' differs: '{sourceValue}' vs '{targetValue}'");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error getting difference details for {ObjectName}", sourceObj.Name);
            details.Add($"Error analyzing differences: {ex.Message}");
        }
        return details;
    }

    private List<string> CompareTableProperties(Table sTable, Table tTable)
    {
        var details = new List<string>();
        if (sTable.RowCount != tTable.RowCount)
            details.Add($"Row count differs: {sTable.RowCount} vs {tTable.RowCount}");
        if (sTable.StorageParameters.FillFactor != tTable.StorageParameters.FillFactor)
            details.Add($"Fill factor differs: '{sTable.StorageParameters.FillFactor}' vs '{tTable.StorageParameters.FillFactor}'");
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

        foreach (var added in targetColumns.Keys.Except(sourceColumns.Keys))
            details.Add($"Column added: {added}");

        foreach (var removed in sourceColumns.Keys.Except(targetColumns.Keys))
            details.Add($"Column removed: {removed}");

        foreach (var columnName in sourceColumns.Keys.Intersect(targetColumns.Keys))
        {
            var sourceCol = sourceColumns[columnName];
            var targetCol = targetColumns[columnName];
            if (sourceCol.DataType != targetCol.DataType)
                details.Add($"Column '{columnName}' data type changed: {sourceCol.DataType} -> {targetCol.DataType}");
            if (sourceCol.IsNullable != targetCol.IsNullable)
                details.Add($"Column '{columnName}' nullability changed: {sourceCol.IsNullable} -> {targetCol.IsNullable}");
            if (sourceCol.DefaultValue != targetCol.DefaultValue)
                details.Add($"Column '{columnName}' default changed: '{sourceCol.DefaultValue}' -> '{targetCol.DefaultValue}'");
        }
        return Task.FromResult(details);
    }

    private List<string> CompareViewProperties(View sView, View tView)
    {
        var details = new List<string>();
        if (sView.ReferencedTables.Count != tView.ReferencedTables.Count)
            details.Add($"Referenced table count differs: {sView.ReferencedTables.Count} vs {tView.ReferencedTables.Count}");
        foreach (var added in tView.ReferencedTables.Except(sView.ReferencedTables))
            details.Add($"Referenced table added: {added}");
        foreach (var removed in sView.ReferencedTables.Except(tView.ReferencedTables))
            details.Add($"Referenced table removed: {removed}");
        return details;
    }

    private List<string> CompareFunctionProperties(Function sFunc, Function tFunc)
    {
        var details = new List<string>();
        if (sFunc.Language != tFunc.Language)
            details.Add($"Language differs: '{sFunc.Language}' vs '{tFunc.Language}'");
        if (sFunc.ReturnType != tFunc.ReturnType)
            details.Add($"Return type differs: '{sFunc.ReturnType}' vs '{tFunc.ReturnType}'");
        if (sFunc.Volatility != tFunc.Volatility)
            details.Add($"Volatility differs: '{sFunc.Volatility}' vs '{tFunc.Volatility}'");
        if (sFunc.Parameters.Count != tFunc.Parameters.Count)
            details.Add($"Parameter count differs: {sFunc.Parameters.Count} vs {tFunc.Parameters.Count}");
        return details;
    }

    private List<string> CompareIndexProperties(TableIndex sIndex, TableIndex tIndex)
    {
        var details = new List<string>();
        if (sIndex.IsUnique != tIndex.IsUnique)
            details.Add($"Uniqueness differs: {sIndex.IsUnique} vs {tIndex.IsUnique}");
        if (sIndex.AccessMethod != tIndex.AccessMethod)
            details.Add($"Access method differs: '{sIndex.AccessMethod}' vs '{tIndex.AccessMethod}'");
        if (!sIndex.ColumnNames.SequenceEqual(tIndex.ColumnNames))
            details.Add($"Columns differ: [{string.Join(", ", sIndex.ColumnNames)}] vs [{string.Join(", ", tIndex.ColumnNames)}]");
        return details;
    }
}