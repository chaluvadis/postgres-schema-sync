namespace PostgreSqlSchemaCompareSync.Core.Comparison.Schema;
public class SchemaComparator(
    ILogger<SchemaComparator> logger,
    ISchemaBrowser schemaBrowser,
    IConnectionManager connectionManager,
    SchemaComparisonEngine comparisonEngine) : ISchemaComparator
{
    private readonly ILogger<SchemaComparator> _logger = logger;
    private readonly ISchemaBrowser _schemaBrowser = schemaBrowser;
    private readonly IConnectionManager _connectionManager = connectionManager;
    private readonly SchemaComparisonEngine _comparisonEngine = comparisonEngine;
    public async Task<SchemaComparison> CompareSchemasAsync(
        ConnectionInfo sourceConnection,
        ConnectionInfo targetConnection,
        SchemaComparisonOptions options,
        CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogInformation("Starting schema comparison between {SourceDatabase} and {TargetDatabase}",
                sourceConnection.Database, targetConnection.Database);
            var startTime = DateTime.UtcNow;
            // Extract metadata from both databases
            var sourceObjects = await ExtractSchemaObjectsAsync(sourceConnection, options.SourceSchemas, cancellationToken);
            var targetObjects = await ExtractSchemaObjectsAsync(targetConnection, options.TargetSchemas, cancellationToken);
            // Convert options to the expected type for SchemaComparisonEngine
            var engineOptions = new MigrationComparisonOptions
            {
                Mode = options.Mode,
                ObjectTypes = options.ObjectTypes,
                IncludeSystemObjects = false // Default value
            };
            // Perform comparison
            var differences = await _comparisonEngine.CompareObjectsAsync(
                sourceConnection,
                targetConnection,
                sourceObjects, targetObjects,
                engineOptions, cancellationToken);
            var executionTime = DateTime.UtcNow - startTime;
            var comparison = new SchemaComparison
            {
                SourceConnection = sourceConnection,
                TargetConnection = targetConnection,
                Mode = options.Mode,
                SourceSchemas = options.SourceSchemas,
                TargetSchemas = options.TargetSchemas,
                Differences = differences,
                ExecutionTime = executionTime
            };
            _logger.LogInformation(
                "Schema comparison completed in {ExecutionTime}: {DifferenceCount} differences found",
                executionTime, differences.Count);
            return comparison;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Schema comparison failed between {Source} and {Target}",
                sourceConnection.Name, targetConnection.Name);
            throw;
        }
    }
    private async Task<List<DatabaseObject>> ExtractSchemaObjectsAsync(
        ConnectionInfo connectionInfo,
        List<string> schemas,
        CancellationToken cancellationToken)
    {
        try
        {
            var allObjects = new List<DatabaseObject>();
            if (schemas.Count == 0)
            {
                // Extract from all schemas
                var objects = await _schemaBrowser.GetDatabaseObjectsAsync(
                    connectionInfo, null, cancellationToken);
                allObjects.AddRange(objects);
            }
            else
            {
                // Extract from each specified schema
                foreach (var schema in schemas)
                {
                    var objects = await _schemaBrowser.GetDatabaseObjectsAsync(
                        connectionInfo, schema, cancellationToken);
                    allObjects.AddRange(objects);
                }
            }
            _logger.LogDebug("Extracted {ObjectCount} objects from {Database} across {SchemaCount} schemas",
                allObjects.Count, connectionInfo.Database, schemas.Count == 0 ? "all" : schemas.Count.ToString());
            return allObjects;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to extract objects from {Database}", connectionInfo.Database);
            throw;
        }
    }
}