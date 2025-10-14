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

            // Pre-comparison validation
            var validationResult = await ValidateComparisonInputsAsync(sourceConnection, targetConnection, options, cancellationToken);
            if (!validationResult.IsValid)
            {
                _logger.LogError("Schema comparison validation failed: {ValidationErrors}", string.Join(", ", validationResult.Errors));
                throw new SchemaException($"Schema comparison validation failed: {string.Join(", ", validationResult.Errors)}");
            }

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

    private async Task<(bool IsValid, List<string> Errors)> ValidateComparisonInputsAsync(
        ConnectionInfo sourceConnection,
        ConnectionInfo targetConnection,
        SchemaComparisonOptions options,
        CancellationToken cancellationToken)
    {
        var errors = new List<string>();

        try
        {
            // Business Rule 1: Validate connections are different
            if (sourceConnection.GetConnectionString() == targetConnection.GetConnectionString())
            {
                errors.Add("Source and target connections appear to be the same database");
            }

            // Business Rule 2: Validate schema filters
            if (options.SourceSchemas.Count == 0 && options.TargetSchemas.Count == 0)
            {
                // This is actually OK - means compare all schemas
                _logger.LogDebug("No schema filters specified - will compare all schemas");
            }
            else
            {
                // Validate specified schemas exist
                var sourceSchemaValidation = await ValidateSchemasExistAsync(sourceConnection, options.SourceSchemas, cancellationToken);
                var targetSchemaValidation = await ValidateSchemasExistAsync(targetConnection, options.TargetSchemas, cancellationToken);

                if (!sourceSchemaValidation.IsValid)
                {
                    errors.AddRange(sourceSchemaValidation.Errors.Select(e => $"Source: {e}"));
                }

                if (!targetSchemaValidation.IsValid)
                {
                    errors.AddRange(targetSchemaValidation.Errors.Select(e => $"Target: {e}"));
                }
            }

            // Business Rule 3: Validate object types
            if (options.ObjectTypes.Count > 0)
            {
                var validObjectTypes = Enum.GetValues(typeof(ObjectType)).Cast<ObjectType>();
                var invalidTypes = options.ObjectTypes.Where(type => !validObjectTypes.Contains(type)).ToList();

                if (invalidTypes.Any())
                {
                    errors.Add($"Invalid object types specified: {string.Join(", ", invalidTypes)}");
                }
            }

            // Business Rule 4: Check for large comparison scope
            if (options.SourceSchemas.Count > 10 || options.TargetSchemas.Count > 10)
            {
                _logger.LogWarning("Large schema comparison detected - may take significant time");
            }

            // Business Rule 5: Validate comparison mode
            if (!Enum.IsDefined(typeof(ComparisonMode), options.Mode))
            {
                errors.Add($"Invalid comparison mode: {options.Mode}");
            }

            return (errors.Count == 0, errors);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during comparison input validation");
            errors.Add($"Validation error: {ex.Message}");
            return (false, errors);
        }
    }

    private async Task<(bool IsValid, List<string> Errors)> ValidateSchemasExistAsync(
        ConnectionInfo connectionInfo,
        List<string> schemas,
        CancellationToken cancellationToken)
    {
        var errors = new List<string>();

        if (schemas.Count == 0)
        {
            return (true, errors);
        }

        try
        {
            using var connection = await _connectionManager.CreateConnectionAsync(connectionInfo, cancellationToken);

            var schemaList = string.Join(",", schemas.Select(s => $"'{s}'"));
            var query = $@"
                SELECT nspname as schema_name
                FROM pg_namespace
                WHERE nspname IN ({schemaList})
                  AND nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')";

            using var command = new NpgsqlCommand(query, connection);
            using var reader = await command.ExecuteReaderAsync(cancellationToken);

            var existingSchemas = new HashSet<string>();
            while (await reader.ReadAsync(cancellationToken))
            {
                existingSchemas.Add(reader.GetString(0));
            }

            var missingSchemas = schemas.Where(s => !existingSchemas.Contains(s)).ToList();
            foreach (var missingSchema in missingSchemas)
            {
                errors.Add($"Schema '{missingSchema}' does not exist");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error validating schemas for {Database}", connectionInfo.Database);
            errors.Add($"Schema validation failed: {ex.Message}");
        }

        return (errors.Count == 0, errors);
    }
}