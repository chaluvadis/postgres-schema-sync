namespace PostgreSqlSchemaCompareSync.Core.Comparison.Metadata;

/// <summary>
/// Specialized extractor for PostgreSQL tablespace metadata
/// </summary>
public class TablespaceMetadataExtractor(
    ILogger<TablespaceMetadataExtractor> logger) : IMetadataExtractor, IObjectMetadataExtractor, IObjectValidator
{
    private readonly ILogger<TablespaceMetadataExtractor> _logger = logger ?? throw new ArgumentNullException(nameof(logger));

    public ObjectType ObjectType => ObjectType.Tablespace;

    /// <summary>
    /// Extracts tablespace metadata from the database
    /// </summary>
    public async Task<IEnumerable<DatabaseObject>> ExtractAsync(
        NpgsqlConnection connection,
        string? schemaFilter,
        CancellationToken cancellationToken)
    {
        var tablespaces = new List<DatabaseObject>();

        const string query = @"
            SELECT
                t.spcname as tablespace_name,
                t.spcowner::regrole as tablespace_owner,
                t.spclocation as location,
                t.spcacl as access_privileges,
                t.spcoptions as options,
                pg_tablespace_size(t.oid) as size_bytes,
                pg_size_pretty(pg_tablespace_size(t.oid)) as size_pretty,
                obj_description(t.oid, 'pg_tablespace') as description,
                t.oid as tablespace_oid,
                t.spccreated as creation_date,
                CASE
                    WHEN t.spcname = 'pg_default' THEN 'Default tablespace'
                    WHEN t.spcname = 'pg_global' THEN 'Global tablespace'
                    ELSE 'Custom tablespace'
                END as tablespace_type,
                COUNT(c.oid) as object_count
            FROM pg_tablespace t
            LEFT JOIN pg_class c ON c.reltablespace = t.oid
            WHERE (@schemaFilter IS NULL OR t.spcname = @schemaFilter)
            GROUP BY t.oid, t.spcname, t.spcowner, t.spclocation, t.spcacl,
                     t.spcoptions, t.spccreated
            ORDER BY t.spcname";

        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

        using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var tablespaceName = reader.GetString(0);

            tablespaces.Add(new DatabaseObject
            {
                Name = tablespaceName,
                Schema = "pg_catalog", // Tablespaces are in pg_catalog schema
                Type = ObjectType.Tablespace,
                Database = connection.Database,
                Owner = reader.IsDBNull(1) ? string.Empty : reader.GetString(1),
                Definition = await BuildTablespaceDefinitionAsync(connection, tablespaceName, cancellationToken),
                CreatedAt = reader.IsDBNull(9) ? DateTime.UtcNow : reader.GetDateTime(9),
                Properties =
                {
                    ["Location"] = reader.IsDBNull(2) ? string.Empty : reader.GetString(2),
                    ["AccessPrivileges"] = reader.IsDBNull(3) ? string.Empty : reader.GetString(3),
                    ["Options"] = reader.IsDBNull(4) ? string.Empty : reader.GetString(4),
                    ["SizeBytes"] = reader.IsDBNull(5) ? 0L : reader.GetInt64(5),
                    ["SizePretty"] = reader.IsDBNull(6) ? "0 bytes" : reader.GetString(6),
                    ["Description"] = reader.IsDBNull(7) ? string.Empty : reader.GetString(7),
                    ["TablespaceOid"] = reader.GetInt32(8),
                    ["TablespaceType"] = reader.GetString(10),
                    ["ObjectCount"] = reader.GetInt64(11)
                }
            });
        }

        return tablespaces;
    }

    /// <summary>
    /// Extracts detailed tablespace information
    /// </summary>
    public async Task<DatabaseObjectDetails> ExtractDetailsAsync(
        NpgsqlConnection connection,
        string schema,
        string tablespaceName,
        CancellationToken cancellationToken)
    {
        var details = new DatabaseObjectDetails
        {
            Name = tablespaceName,
            Schema = schema,
            Type = ObjectType.Tablespace,
            Database = connection.Database,
            CreatedAt = DateTime.UtcNow
        };

        await ExtractTablespaceDetailsAsync(connection, details, cancellationToken);
        return details;
    }

    /// <summary>
    /// Validates tablespace objects
    /// </summary>
    public async Task<ObjectValidationResult> ValidateAsync(
        NpgsqlConnection connection,
        DatabaseObject tablespace,
        CancellationToken cancellationToken)
    {
        var result = new ObjectValidationResult
        {
            IsValid = true,
            Errors = [],
            Warnings = [],
            Metadata = []
        };

        try
        {
            _logger.LogDebug("Validating tablespace {TablespaceName}", tablespace.Name);

            // Check if tablespace exists and is accessible
            const string query = @"
                SELECT COUNT(*)
                FROM pg_tablespace t
                WHERE t.spcname = @tablespaceName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@tablespaceName", tablespace.Name);

            var countResult = await command.ExecuteScalarAsync(cancellationToken);
            var count = countResult != null ? (long)countResult : 0;

            if (count == 0)
            {
                result.IsValid = false;
                result.Errors.Add("Tablespace does not exist or is not accessible");
            }
            else
            {
                result.Metadata["TablespaceExists"] = true;

                // Get advanced tablespace information
                const string advancedQuery = @"
                    SELECT
                        t.spcname as tablespace_name,
                        t.spclocation as location,
                        pg_tablespace_size(t.oid) as size_bytes,
                        t.spcowner::regrole as tablespace_owner,
                        t.spcacl as access_privileges,
                        t.spcoptions as options,
                        COUNT(c.oid) as object_count,
                        COUNT(c.oid) FILTER (WHERE c.relkind = 'r') as table_count,
                        COUNT(c.oid) FILTER (WHERE c.relkind = 'i') as index_count,
                        COUNT(c.oid) FILTER (WHERE c.relkind = 'S') as sequence_count,
                        COUNT(c.oid) FILTER (WHERE c.relkind = 'm') as matview_count
                    FROM pg_tablespace t
                    LEFT JOIN pg_class c ON c.reltablespace = t.oid
                    WHERE t.spcname = @tablespaceName
                    GROUP BY t.oid, t.spcname, t.spclocation, t.spcowner, t.spcacl, t.spcoptions";

                using var advCommand = new NpgsqlCommand(advancedQuery, connection);
                advCommand.Parameters.AddWithValue("@tablespaceName", tablespace.Name);

                using var advReader = await advCommand.ExecuteReaderAsync(cancellationToken);
                if (await advReader.ReadAsync(cancellationToken))
                {
                    result.Metadata["TablespaceName"] = advReader.GetString(0);
                    result.Metadata["Location"] = advReader.IsDBNull(1) ? string.Empty : advReader.GetString(1);
                    result.Metadata["SizeBytes"] = advReader.GetInt64(2);
                    result.Metadata["TablespaceOwner"] = advReader.GetString(3);
                    result.Metadata["AccessPrivileges"] = advReader.IsDBNull(4) ? string.Empty : advReader.GetString(4);
                    result.Metadata["Options"] = advReader.IsDBNull(5) ? string.Empty : advReader.GetString(5);
                    result.Metadata["ObjectCount"] = advReader.GetInt64(6);
                    result.Metadata["TableCount"] = advReader.GetInt64(7);
                    result.Metadata["IndexCount"] = advReader.GetInt64(8);
                    result.Metadata["SequenceCount"] = advReader.GetInt64(9);
                    result.Metadata["MatViewCount"] = advReader.GetInt64(10);

                    // Add warnings for potential issues
                    var sizeBytes = advReader.GetInt64(2);
                    if (sizeBytes > 100L * 1024 * 1024 * 1024) // 100GB
                        result.Warnings.Add($"Tablespace is very large ({sizeBytes / (1024 * 1024 * 1024)}GB) - may need maintenance");

                    var objectCount = advReader.GetInt64(6);
                    if (objectCount == 0)
                        result.Warnings.Add("Tablespace contains no objects - may be unused");

                    if (objectCount > 10000)
                        result.Warnings.Add($"Tablespace contains many objects ({objectCount}) - may impact performance");

                    var location = advReader.IsDBNull(1) ? string.Empty : advReader.GetString(1);
                    if (string.IsNullOrEmpty(location))
                        result.Warnings.Add("Tablespace location is not set - may be using default location");
                }

                // Validate tablespace location accessibility
                await ValidateTablespaceLocationAsync(connection, tablespace.Name, result, cancellationToken);

                // Check for tablespace usage patterns
                await ValidateTablespaceUsageAsync(connection, tablespace.Name, result, cancellationToken);
            }

            result.Metadata["ValidationDate"] = DateTime.UtcNow;
            result.Metadata["ObjectType"] = tablespace.Type.ToString();

            _logger.LogDebug("Validation completed for tablespace {TablespaceName}: Valid={IsValid}",
                tablespace.Name, result.IsValid);

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to validate tablespace {TablespaceName}", tablespace.Name);

            result.IsValid = false;
            result.Errors.Add($"Validation error: {ex.Message}");
            return result;
        }
    }

    /// <summary>
    /// Extracts detailed tablespace information including objects and usage
    /// </summary>
    private async Task ExtractTablespaceDetailsAsync(
        NpgsqlConnection connection,
        DatabaseObjectDetails details,
        CancellationToken cancellationToken)
    {
        // Get objects in this tablespace by type
        const string objectQuery = @"
            SELECT
                CASE c.relkind
                    WHEN 'r' THEN 'Table'
                    WHEN 'i' THEN 'Index'
                    WHEN 'S' THEN 'Sequence'
                    WHEN 'm' THEN 'Materialized View'
                    WHEN 'f' THEN 'Foreign Table'
                    WHEN 'p' THEN 'Partitioned Table'
                    ELSE 'Other'
                END as object_type,
                c.relname as object_name,
                n.nspname as object_schema,
                pg_relation_size(c.oid) as object_size_bytes,
                c.relowner::regrole as object_owner
            FROM pg_class c
            JOIN pg_namespace n ON c.relnamespace = n.oid
            WHERE c.reltablespace = (SELECT oid FROM pg_tablespace WHERE spcname = @tablespaceName)
              AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
            ORDER BY c.relkind, n.nspname, c.relname";

        using var objectCommand = new NpgsqlCommand(objectQuery, connection);
        objectCommand.Parameters.AddWithValue("@tablespaceName", details.Name);

        using var objectReader = await objectCommand.ExecuteReaderAsync(cancellationToken);
        var tablespaceObjects = new List<string>();
        var totalSize = 0L;

        while (await objectReader.ReadAsync(cancellationToken))
        {
            var objectType = objectReader.GetString(0);
            var objectName = objectReader.GetString(1);
            var objectSchema = objectReader.GetString(2);
            var objectSize = objectReader.GetInt64(3);
            var objectOwner = objectReader.GetString(4);

            tablespaceObjects.Add($"{objectType}: {objectSchema}.{objectName} ({objectSize} bytes, owner: {objectOwner})");
            totalSize += objectSize;

            // Update object counts by type
            var currentCount = details.AdditionalInfo.ContainsKey($"ObjectCount_{objectType}")
                ? (int)details.AdditionalInfo[$"ObjectCount_{objectType}"]
                : 0;
            details.AdditionalInfo[$"ObjectCount_{objectType}"] = currentCount + 1;
        }

        if (tablespaceObjects.Any())
        {
            details.AdditionalInfo["TablespaceObjects"] = string.Join("; ", tablespaceObjects.Take(50)); // Limit to first 50 for readability
            details.AdditionalInfo["TotalObjectSize"] = totalSize;
            details.AdditionalInfo["TotalObjectCount"] = tablespaceObjects.Count;

            if (tablespaceObjects.Count > 50)
            {
                details.AdditionalInfo["ObjectListTruncated"] = true;
                details.AdditionalInfo["TotalObjectsInTablespace"] = tablespaceObjects.Count;
            }
        }

        // Get tablespace file system information if available
        const string fsQuery = @"
            SELECT
                setting as fs_info
            FROM pg_settings
            WHERE name = 'data_directory'";

        using var fsCommand = new NpgsqlCommand(fsQuery, connection);
        var fsResult = await fsCommand.ExecuteScalarAsync(cancellationToken);
        if (fsResult != null)
        {
            var dataDirectory = fsResult.ToString();
            if (!string.IsNullOrWhiteSpace(dataDirectory))
            {
                details.AdditionalInfo["DataDirectory"] = dataDirectory;
            }
        }
    }

    /// <summary>
    /// Validates tablespace location accessibility
    /// </summary>
    private async Task ValidateTablespaceLocationAsync(
        NpgsqlConnection connection,
        string tablespaceName,
        ObjectValidationResult result,
        CancellationToken cancellationToken)
    {
        try
        {
            const string query = @"
                SELECT t.spclocation as location
                FROM pg_tablespace t
                WHERE t.spcname = @tablespaceName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@tablespaceName", tablespaceName);

            var location = await command.ExecuteScalarAsync(cancellationToken);
            var locationPath = location?.ToString() ?? "";

            result.Metadata["Location"] = locationPath;

            if (string.IsNullOrEmpty(locationPath))
            {
                result.Warnings.Add("Tablespace location is not set - using default location");
            }
            else if (locationPath.StartsWith("/tmp") || locationPath.StartsWith("C:\\temp"))
            {
                result.Warnings.Add("Tablespace is in temporary location - data may be lost on restart");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error checking tablespace location for {TablespaceName}", tablespaceName);
            result.Warnings.Add($"Could not verify tablespace location: {ex.Message}");
        }
    }

    /// <summary>
    /// Validates tablespace usage patterns
    /// </summary>
    private async Task ValidateTablespaceUsageAsync(
        NpgsqlConnection connection,
        string tablespaceName,
        ObjectValidationResult result,
        CancellationToken cancellationToken)
    {
        try
        {
            // Check for mixed object types in tablespace
            const string query = @"
                SELECT
                    COUNT(DISTINCT c.relkind) as object_type_count,
                    array_agg(DISTINCT c.relkind) as object_types
                FROM pg_class c
                JOIN pg_tablespace t ON c.reltablespace = t.oid
                WHERE t.spcname = @tablespaceName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@tablespaceName", tablespaceName);

            using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                var objectTypeCount = reader.GetInt32(0);
                var objectTypes = Array.Empty<string>();

                if (!reader.IsDBNull(1))
                {
                    objectTypes = reader.GetValue(1) switch
                    {
                        string[] stringArray => stringArray,
                        object[] objectArray => objectArray
                            .Select(item => item?.ToString())
                            .Where(s => !string.IsNullOrWhiteSpace(s))
                            .Select(s => s!)
                            .ToArray(),
                        string single when !string.IsNullOrWhiteSpace(single) => new[] { single },
                        _ => Array.Empty<string>()
                    };
                }

                result.Metadata["ObjectTypeCount"] = objectTypeCount;
                result.Metadata["ObjectTypes"] = string.Join(", ", objectTypes);

                if (objectTypeCount > 3)
                    result.Warnings.Add($"Tablespace contains mixed object types ({objectTypeCount}) - may impact performance optimization");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error checking tablespace usage for {TablespaceName}", tablespaceName);
            result.Warnings.Add($"Could not verify tablespace usage: {ex.Message}");
        }
    }

    /// <summary>
    /// Builds a CREATE TABLESPACE statement for the tablespace
    /// </summary>
    private async Task<string> BuildTablespaceDefinitionAsync(
        NpgsqlConnection connection,
        string tablespaceName,
        CancellationToken cancellationToken)
    {
        try
        {
            const string query = @"
                SELECT
                    t.spclocation as location,
                    t.spcowner::regrole as owner,
                    t.spcoptions as options
                FROM pg_tablespace t
                WHERE t.spcname = @tablespaceName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@tablespaceName", tablespaceName);

            using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                var location = reader.IsDBNull(0) ? string.Empty : reader.GetString(0);
                var owner = reader.GetString(1);
                var options = reader.IsDBNull(2) ? string.Empty : reader.GetString(2);

                var createStatement = $"CREATE TABLESPACE \"{tablespaceName}\"";

                if (!string.IsNullOrEmpty(owner) && owner != "postgres")
                    createStatement += $" OWNER {owner}";

                if (!string.IsNullOrEmpty(location))
                    createStatement += $" LOCATION '{location}'";

                if (!string.IsNullOrEmpty(options))
                    createStatement += $" WITH ({options})";

                createStatement += ";";

                return createStatement;
            }

            return $"CREATE TABLESPACE \"{tablespaceName}\";";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error building tablespace definition for {TablespaceName}", tablespaceName);
            return $"CREATE TABLESPACE \"{tablespaceName}\";";
        }
    }
}