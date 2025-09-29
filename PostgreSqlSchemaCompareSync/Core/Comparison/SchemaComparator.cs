namespace PostgreSqlSchemaCompareSync.Core.Comparison;
public class SchemaComparator(
    ILogger<SchemaComparator> logger,
    SchemaMetadataExtractor metadataExtractor,
    SchemaCacheManager cacheManager,
    IConnectionManager connectionManager,
    SchemaComparisonEngine comparisonEngine) : ISchemaComparator
{
    private readonly ILogger<SchemaComparator> _logger = logger;
    private readonly SchemaMetadataExtractor _metadataExtractor = metadataExtractor;
    private readonly SchemaCacheManager _cacheManager = cacheManager;
    private readonly IConnectionManager _connectionManager = connectionManager;
    private readonly SchemaComparisonEngine _comparisonEngine = comparisonEngine;
    public async Task<SchemaComparison> CompareSchemasAsync(
        ConnectionInfo sourceConnection,
        ConnectionInfo targetConnection,
        ComparisonOptions options,
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
            // Perform comparison
            var differences = await _comparisonEngine.CompareObjectsAsync(
                sourceObjects, targetObjects, options, cancellationToken);
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
            using var connection = await _connectionManager.CreateConnectionAsync(connectionInfo, cancellationToken);
            // If specific schemas requested, filter by them
            string? schemaFilter = schemas.Any() ? schemas.First() : null;
            var objects = await _metadataExtractor.ExtractAllObjectsAsync(
                connection, schemaFilter, cancellationToken);
            _logger.LogDebug("Extracted {ObjectCount} objects from {Database}",
                objects.Count, connectionInfo.Database);
            return objects;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to extract objects from {Database}", connectionInfo.Database);
            throw;
        }
    }
}