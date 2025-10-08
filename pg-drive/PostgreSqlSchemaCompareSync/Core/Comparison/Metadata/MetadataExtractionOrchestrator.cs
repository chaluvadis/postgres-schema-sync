using System.Runtime.CompilerServices;

namespace PostgreSqlSchemaCompareSync.Core.Comparison.Metadata;

/// <summary>
/// Orchestrates metadata extraction using specialized extractors with performance optimizations
/// </summary>
public class MetadataExtractionOrchestrator(
    ILogger<MetadataExtractionOrchestrator> logger,
    IConnectionManager connectionManager,
    IEnumerable<IMetadataExtractor> extractors) : IDisposable
{
    private readonly ILogger<MetadataExtractionOrchestrator> _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    private readonly IConnectionManager _connectionManager = connectionManager ?? throw new ArgumentNullException(nameof(connectionManager));
    private readonly IEnumerable<IMetadataExtractor> _extractors = extractors ?? throw new ArgumentNullException(nameof(extractors));
    private bool _disposed;

    /// <summary>
    /// Extracts metadata for specified object types with performance optimizations
    /// </summary>
    public async Task<List<DatabaseObject>> ExtractMetadataAsync(
        ConnectionInfo connectionInfo,
        List<ObjectType>? objectTypes = null,
        string? schemaFilter = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(connectionInfo);

        var objects = new List<DatabaseObject>();
        var extractionTasks = new List<Task<IEnumerable<DatabaseObject>>>();

        try
        {
            _logger.LogDebug("Extracting metadata for {Database} with schema filter: {SchemaFilter}",
                connectionInfo.Database, schemaFilter ?? "all schemas");

            using var connection = await _connectionManager.CreateConnectionAsync(connectionInfo, cancellationToken);

            // Get applicable extractors
            var applicableExtractors = GetApplicableExtractors(objectTypes);

            // Create extraction tasks for parallel processing
            foreach (var extractor in applicableExtractors)
            {
                extractionTasks.Add(ExtractWithRetryAsync(extractor, connection, schemaFilter, cancellationToken));
            }

            // Wait for all extractions to complete
            if (extractionTasks.Count != 0)
            {
                var results = await Task.WhenAll(extractionTasks);

                foreach (var result in results)
                {
                    objects.AddRange(result);
                }
            }

            _logger.LogInformation("Extracted metadata for {ObjectCount} objects from {Database} ({SchemaFilter} schemas)",
                objects.Count, connectionInfo.Database, schemaFilter ?? "all");

            return objects;
        }
        catch (NpgsqlException ex)
        {
            _logger.LogError(ex, "Database error extracting metadata from {Database}", connectionInfo.Database);
            throw new SchemaException($"Failed to extract metadata: {ex.Message}", connectionInfo.Id, ex);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error extracting metadata from {Database}", connectionInfo.Database);
            throw new SchemaException($"Unexpected error extracting metadata: {ex.Message}", connectionInfo.Id, ex);
        }
    }

    /// <summary>
    /// Extracts metadata with streaming support for large datasets
    /// </summary>
    public async IAsyncEnumerable<DatabaseObject> ExtractMetadataStreamAsync(
        ConnectionInfo connectionInfo,
        List<ObjectType>? objectTypes = null,
        string? schemaFilter = null,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(connectionInfo);

        using var connection = await _connectionManager.CreateConnectionAsync(connectionInfo, cancellationToken);

        var applicableExtractors = GetApplicableExtractors(objectTypes);

        foreach (var extractor in applicableExtractors)
        {
            var objects = await ExtractWithRetryAsync(extractor, connection, schemaFilter, cancellationToken);

            foreach (var obj in objects)
            {
                if (cancellationToken.IsCancellationRequested)
                    yield break;

                yield return obj;
            }
        }
    }

    /// <summary>
    /// Extracts detailed metadata for a specific object
    /// </summary>
    public async Task<DatabaseObjectDetails> ExtractObjectDetailsAsync(
        ConnectionInfo connectionInfo,
        ObjectType objectType,
        string schema,
        string objectName,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(connectionInfo);

        var extractor = GetExtractorForType(objectType);
        if (extractor is not IObjectMetadataExtractor detailExtractor)
        {
            throw new NotSupportedException($"Detailed extraction not supported for {objectType}");
        }

        try
        {
            _logger.LogDebug("Extracting detailed metadata for {ObjectType} {Schema}.{ObjectName}",
                objectType, schema, objectName);

            using var connection = await _connectionManager.CreateConnectionAsync(connectionInfo, cancellationToken);

            var details = await detailExtractor.ExtractDetailsAsync(connection, schema, objectName, cancellationToken);

            _logger.LogDebug("Extracted detailed metadata for {ObjectType} {Schema}.{ObjectName}",
                objectType, schema, objectName);

            return details;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to extract metadata for {ObjectType} {Schema}.{ObjectName}",
                objectType, schema, objectName);
            throw new SchemaException($"Failed to extract object metadata: {ex.Message}", connectionInfo.Id, ex);
        }
    }

    /// <summary>
    /// Validates an object with enhanced error handling
    /// </summary>
    public async Task<ObjectValidationResult> ValidateObjectAsync(
        ConnectionInfo connectionInfo,
        DatabaseObject databaseObject,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(connectionInfo);
        ArgumentNullException.ThrowIfNull(databaseObject);

        var extractor = GetExtractorForType(databaseObject.Type);
        if (extractor is not IObjectValidator validator)
        {
            throw new NotSupportedException($"Validation not supported for {databaseObject.Type}");
        }

        try
        {
            _logger.LogDebug("Validating {ObjectType} {Schema}.{ObjectName}",
                databaseObject.Type, databaseObject.Schema, databaseObject.Name);

            using var connection = await _connectionManager.CreateConnectionAsync(connectionInfo, cancellationToken);

            var result = await validator.ValidateAsync(connection, databaseObject, cancellationToken);

            _logger.LogDebug("Validation completed for {ObjectType} {Schema}.{ObjectName}: Valid={IsValid}",
                databaseObject.Type, databaseObject.Schema, databaseObject.Name, result.IsValid);

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to validate {ObjectType} {Schema}.{ObjectName}",
                databaseObject.Type, databaseObject.Schema, databaseObject.Name);

            return new ObjectValidationResult
            {
                IsValid = false,
                Errors = { $"Validation error: {ex.Message}" }
            };
        }
    }

    /// <summary>
    /// Gets extractors applicable for the specified object types
    /// </summary>
    private IEnumerable<IMetadataExtractor> GetApplicableExtractors(List<ObjectType>? objectTypes)
    {
        if (objectTypes == null || objectTypes.Count == 0)
            return _extractors;

        return _extractors.Where(extractor => objectTypes.Contains(extractor.ObjectType));
    }

    /// <summary>
    /// Gets the extractor for a specific object type
    /// </summary>
    private IMetadataExtractor GetExtractorForType(ObjectType objectType)
    {
        var extractor = _extractors.FirstOrDefault(e => e.ObjectType == objectType);
        if (extractor == null)
        {
            throw new NotSupportedException($"No extractor available for object type {objectType}");
        }
        return extractor;
    }

    /// <summary>
    /// Extracts metadata with retry logic
    /// </summary>
    private async Task<IEnumerable<DatabaseObject>> ExtractWithRetryAsync(
        IMetadataExtractor extractor,
        NpgsqlConnection connection,
        string? schemaFilter,
        CancellationToken cancellationToken)
    {
        const int maxRetries = 3;
        const int delayMs = 1000;

        for (int attempt = 1; attempt <= maxRetries; attempt++)
        {
            try
            {
                return await extractor.ExtractAsync(connection, schemaFilter, cancellationToken);
            }
            catch (NpgsqlException ex) when (attempt < maxRetries && IsRetryableError(ex))
            {
                _logger.LogWarning(ex,
                    "Attempt {Attempt} failed for {ObjectType} extraction, retrying in {Delay}ms",
                    attempt, extractor.ObjectType, delayMs);

                if (delayMs > 0)
                {
                    await Task.Delay(delayMs * attempt, cancellationToken);
                }
            }
        }

        // If we get here, all retries failed
        throw new SchemaException($"Failed to extract {extractor.ObjectType} metadata after {maxRetries} attempts");
    }

    /// <summary>
    /// Determines if an error is retryable
    /// </summary>
    private static bool IsRetryableError(NpgsqlException ex)
    {
        // Retry on connection timeouts and temporary issues
        return ex.ErrorCode switch
        {
            0x08006 => true, // Connection failure
            0x53300 => true, // Too many connections
            0x40001 => true, // Serialization failure
            _ => false
        };
    }

    public void Dispose()
    {
        if (!_disposed)
        {
            _disposed = true;
            _logger.LogInformation("MetadataExtractionOrchestrator disposed");
        }
    }
}