namespace PostgreSqlSchemaCompareSync.Core.Comparison;

public class SchemaBrowser(
    ILogger<SchemaBrowser> logger,
    SchemaMetadataExtractor metadataExtractor,
    SchemaCacheManager cacheManager,
    IConnectionManager connectionManager) : ISchemaBrowser
{
    private readonly ILogger<SchemaBrowser> _logger = logger;
    private readonly SchemaMetadataExtractor _metadataExtractor = metadataExtractor;
    private readonly SchemaCacheManager _cacheManager = cacheManager;
    private readonly IConnectionManager _connectionManager = connectionManager;

    public async Task<List<DatabaseObject>> GetDatabaseObjectsAsync(
        ConnectionInfo connectionInfo,
        string? schemaFilter = null,
        CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogInformation("Browsing schema for {Database}, filter: {SchemaFilter}",
                connectionInfo.Database, schemaFilter ?? "all");
            // Use cache manager for efficient retrieval
            var objects = await _cacheManager.GetSchemaAsync(connectionInfo, schemaFilter, cancellationToken);
            _logger.LogInformation("Retrieved {ObjectCount} objects from {Database}",
                objects.Count, connectionInfo.Database);
            return objects;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to browse schema for {Database}", connectionInfo.Database);
            throw;
        }
    }
    public async Task<DatabaseObjectDetails> GetObjectDetailsAsync(
        ConnectionInfo connectionInfo,
        ObjectType objectType,
        string schema,
        string objectName,
        CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogInformation("Getting details for {ObjectType} {Schema}.{ObjectName}",
                objectType, schema, objectName);
            // Get the specific object
            var obj = await _cacheManager.GetObjectAsync(connectionInfo, objectType, schema, objectName, cancellationToken) ?? throw new KeyNotFoundException($"Object {objectType} {schema}.{objectName} not found");
            // Get all objects in the schema for dependency analysis
            var allObjects = await _cacheManager.GetSchemaAsync(connectionInfo, schema, cancellationToken);
            // Analyze dependencies
            var dependencies = FindDependencies(obj, allObjects);
            var dependents = FindDependents(obj, allObjects);
            var details = new DatabaseObjectDetails
            {
                Object = obj,
                Dependencies = dependencies,
                Dependents = dependents,
                AdditionalInfo = await GetAdditionalObjectInfoAsync(connectionInfo, obj, cancellationToken)
            };
            _logger.LogInformation("Retrieved details for {ObjectType} {Schema}.{ObjectName}",
                objectType, schema, objectName);
            return details;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get object details for {ObjectType} {Schema}.{ObjectName}",
                objectType, schema, objectName);
            throw;
        }
    }
    public async Task<List<string>> GetSchemasAsync(
        ConnectionInfo connectionInfo,
        CancellationToken cancellationToken = default)
    {
        try
        {
            using var connection = await _connectionManager.CreateConnectionAsync(connectionInfo, cancellationToken);
            const string query = @"
                SELECT schema_name
                FROM information_schema.schemata
                WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                ORDER BY schema_name";
            using var cmd = new NpgsqlCommand(query, connection);
            using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            var schemas = new List<string>();
            while (await reader.ReadAsync(cancellationToken))
            {
                schemas.Add(reader.GetString(0));
            }
            _logger.LogInformation("Retrieved {SchemaCount} schemas from {Database}",
                schemas.Count, connectionInfo.Database);
            return schemas;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get schemas for {Database}", connectionInfo.Database);
            throw;
        }
    }
    public async Task<List<ObjectType>> GetObjectTypesAsync(
        ConnectionInfo connectionInfo,
        string schema,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var objects = await _cacheManager.GetSchemaAsync(connectionInfo, schema, cancellationToken);
            var objectTypes = objects.Select(o => o.Type).Distinct().OrderBy(t => t.ToString()).ToList();
            _logger.LogInformation("Found {TypeCount} object types in schema {Schema}",
                objectTypes.Count, schema);
            return objectTypes;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get object types for schema {Schema}", schema);
            throw;
        }
    }
    private List<DatabaseObject> FindDependencies(DatabaseObject obj, List<DatabaseObject> allObjects)
    {
        var dependencies = new List<DatabaseObject>();
        // Simple dependency analysis based on object properties
        foreach (var otherObj in allObjects)
        {
            if (otherObj.Id == obj.Id) continue;
            // Check if other object is referenced by current object
            if (IsReferencedBy(obj, otherObj))
            {
                dependencies.Add(otherObj);
            }
        }
        return dependencies;
    }
    private List<DatabaseObject> FindDependents(DatabaseObject obj, List<DatabaseObject> allObjects)
    {
        var dependents = new List<DatabaseObject>();
        // Find objects that depend on the current object
        foreach (var otherObj in allObjects)
        {
            if (otherObj.Id == obj.Id) continue;
            if (IsReferencedBy(otherObj, obj))
            {
                dependents.Add(otherObj);
            }
        }
        return dependents;
    }
    private bool IsReferencedBy(DatabaseObject dependent, DatabaseObject dependency) =>
        dependent.Properties.Values.Any(prop =>
            prop.Contains(dependency.Name, StringComparison.OrdinalIgnoreCase) ||
            prop.Contains($"{dependency.Schema}.{dependency.Name}", StringComparison.OrdinalIgnoreCase));
    private async Task<Dictionary<string, object>> GetAdditionalObjectInfoAsync(
        ConnectionInfo connectionInfo,
        DatabaseObject obj,
        CancellationToken cancellationToken)
    {
        var additionalInfo = new Dictionary<string, object>();
        try
        {
            using var connection = await _connectionManager.CreateConnectionAsync(connectionInfo, cancellationToken);
            // Get object size information
            if (obj is Table table)
            {
                var sizeQuery = @"
                    SELECT
                        pg_total_relation_size(c.oid) as total_size,
                        pg_relation_size(c.oid) as table_size,
                        pg_total_relation_size(c.oid) - pg_relation_size(c.oid) as index_size
                    FROM pg_class c
                    JOIN pg_namespace n ON c.relnamespace = n.oid
                    WHERE c.relname = @TableName AND n.nspname = @Schema";
                using var cmd = new NpgsqlCommand(sizeQuery, connection);
                cmd.Parameters.AddWithValue("@TableName", obj.Name);
                cmd.Parameters.AddWithValue("@Schema", obj.Schema);
                using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
                if (await reader.ReadAsync(cancellationToken))
                {
                    additionalInfo["TotalSize"] = reader.GetInt64(0);
                    additionalInfo["TableSize"] = reader.GetInt64(1);
                    additionalInfo["IndexSize"] = reader.GetInt64(2);
                }
            }
            // Get last modification time from system catalogs
            var modTimeQuery = @"
                SELECT
                    CASE
                        WHEN c.relkind = 'r' THEN (SELECT COALESCE(MAX(greptime), c.reltime) FROM pg_stat_user_tables WHERE relname = c.relname)
                        ELSE c.reltime
                    END as last_modified
                FROM pg_class c
                JOIN pg_namespace n ON c.relnamespace = n.oid
                WHERE c.relname = @ObjectName AND n.nspname = @Schema";
            using var modCmd = new NpgsqlCommand(modTimeQuery, connection);
            modCmd.Parameters.AddWithValue("@ObjectName", obj.Name);
            modCmd.Parameters.AddWithValue("@Schema", obj.Schema);
            using var modReader = await modCmd.ExecuteReaderAsync(cancellationToken);
            if (await modReader.ReadAsync(cancellationToken))
            {
                if (!modReader.IsDBNull(0))
                {
                    additionalInfo["LastModified"] = modReader.GetDateTime(0);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to get additional info for {ObjectType} {ObjectName}",
                obj.Type, obj.Name);
        }
        return additionalInfo;
    }
    public SchemaCacheStats GetCacheStats() => _cacheManager.GetStats();
    public async Task RefreshSchemaCacheAsync(
        ConnectionInfo connectionInfo,
        string? schemaFilter = null,
        CancellationToken cancellationToken = default)
        => await _cacheManager.RefreshSchemaAsync(connectionInfo, schemaFilter, cancellationToken);
}