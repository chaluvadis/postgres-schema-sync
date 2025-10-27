namespace PostgreSqlSchemaCompareSync.Core.Comparison.Metadata;

/// <summary>
/// Specialized extractor for PostgreSQL schema metadata
/// </summary>
public class SchemaMetadataExtractor(
    ILogger<SchemaMetadataExtractor> logger) : IMetadataExtractor, IObjectMetadataExtractor, IObjectValidator
{
    private readonly ILogger<SchemaMetadataExtractor> _logger = logger ?? throw new ArgumentNullException(nameof(logger));

    public ObjectType ObjectType => ObjectType.Schema;

    /// <summary>
    /// Extracts schema metadata from the database
    /// </summary>
    public async Task<IEnumerable<DatabaseObject>> ExtractAsync(
        NpgsqlConnection connection,
        string? schemaFilter,
        CancellationToken cancellationToken)
    {
        var schemas = new List<DatabaseObject>();

        const string query = @"
            SELECT
                n.nspname AS schema_name,
                pg_get_userbyid(n.nspowner) AS owner_name,
                obj_description(n.oid, 'pg_namespace') AS description,
                n.oid AS schema_oid
            FROM pg_namespace n
            WHERE (@schemaFilter IS NULL OR n.nspname = @schemaFilter)
              AND n.nspname NOT LIKE 'pg_%'
              AND n.nspname <> 'information_schema'
            ORDER BY n.nspname";

        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

        using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var schemaName = reader.GetString(0);
            var owner = reader.IsDBNull(1) ? string.Empty : reader.GetString(1);

            var databaseObject = new DatabaseObject
            {
                Name = schemaName,
                Schema = schemaName,
                Type = ObjectType.Schema,
                Database = connection.Database,
                Owner = owner,
                Definition = await BuildSchemaDefinitionAsync(connection, schemaName, owner, cancellationToken),
                CreatedAt = DateTime.UtcNow
            };

            var description = reader.IsDBNull(2) ? string.Empty : reader.GetString(2);
            if (!string.IsNullOrWhiteSpace(description))
            {
                databaseObject.Properties["Description"] = description;
            }

            databaseObject.Properties["SchemaOid"] = reader.GetInt32(3);
            schemas.Add(databaseObject);
        }

        return schemas;
    }

    /// <summary>
    /// Extracts detailed schema information
    /// </summary>
    public async Task<DatabaseObjectDetails> ExtractDetailsAsync(
        NpgsqlConnection connection,
        string schema,
        string schemaName,
        CancellationToken cancellationToken)
    {
        var details = new DatabaseObjectDetails
        {
            Name = schemaName,
            Schema = schemaName,
            Type = ObjectType.Schema,
            Database = connection.Database,
            CreatedAt = DateTime.UtcNow
        };

        await ExtractSchemaDetailsAsync(connection, details, cancellationToken);
        return details;
    }

    /// <summary>
    /// Validates schema objects
    /// </summary>
    public async Task<ObjectValidationResult> ValidateAsync(
        NpgsqlConnection connection,
        DatabaseObject schema,
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
            _logger.LogDebug("Validating schema {SchemaName}", schema.Name);

            // Check if schema exists and is accessible
            const string query = @"
                SELECT COUNT(*)
                FROM information_schema.schemata s
                JOIN pg_namespace n ON n.nspname = s.schema_name
                WHERE s.schema_name = @schemaName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schemaName", schema.Name);

            var countResult = await command.ExecuteScalarAsync(cancellationToken);
            var count = countResult != null ? (long)countResult : 0;

            if (count == 0)
            {
                result.IsValid = false;
                result.Errors.Add("Schema does not exist or is not accessible");
            }
            else
            {
                result.Metadata["SchemaExists"] = true;

                // Check for additional schema issues
                const string advancedQuery = @"
                        SELECT
                            n.oid AS schema_oid,
                            pg_get_userbyid(n.nspowner) AS owner_name,
                            COUNT(c.oid) AS object_count
                        FROM pg_namespace n
                        LEFT JOIN pg_class c ON c.relnamespace = n.oid
                        WHERE n.nspname = @schemaName
                        GROUP BY n.oid, n.nspowner";

                using var advCommand = new NpgsqlCommand(advancedQuery, connection);
                advCommand.Parameters.AddWithValue("@schemaName", schema.Name);

                using var advReader = await advCommand.ExecuteReaderAsync(cancellationToken);
                if (await advReader.ReadAsync(cancellationToken))
                {
                    result.Metadata["SchemaOid"] = advReader.GetInt32(0);
                    result.Metadata["Owner"] = advReader.IsDBNull(1) ? string.Empty : advReader.GetString(1);
                    result.Metadata["ObjectCount"] = advReader.GetInt64(2);

                    var objectCount = advReader.GetInt64(2);
                    if (objectCount == 0)
                    {
                        result.Warnings.Add("Schema is empty - no objects found");
                    }

                    if (objectCount > 10000)
                    {
                        result.Warnings.Add($"Schema contains large number of objects ({objectCount}) - may impact performance");
                    }
                }

                // Check schema permissions
                await ValidateSchemaPermissionsAsync(connection, schema.Name, result, cancellationToken);
            }

            result.Metadata["ValidationDate"] = DateTime.UtcNow;
            result.Metadata["ObjectType"] = schema.Type.ToString();

            _logger.LogDebug("Validation completed for schema {SchemaName}: Valid={IsValid}",
                schema.Name, result.IsValid);

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to validate schema {SchemaName}", schema.Name);

            result.IsValid = false;
            result.Errors.Add($"Validation error: {ex.Message}");
            return result;
        }
    }

    /// <summary>
    /// Extracts detailed schema information including object counts
    /// </summary>
    private async Task ExtractSchemaDetailsAsync(
        NpgsqlConnection connection,
        DatabaseObjectDetails details,
        CancellationToken cancellationToken)
    {
        // Get object counts by type for this schema
        const string objectCountQuery = @"
            SELECT
                CASE
                    WHEN c.relkind = 'r' THEN 'Table'
                    WHEN c.relkind = 'v' THEN 'View'
                    WHEN c.relkind = 'm' THEN 'Materialized View'
                    WHEN c.relkind = 'S' THEN 'Sequence'
                    WHEN c.relkind = 'f' THEN 'Foreign Table'
                    WHEN c.relkind = 'p' THEN 'Partitioned Table'
                    ELSE 'Other'
                END as object_type,
                COUNT(*) as object_count
            FROM pg_class c
            JOIN pg_namespace n ON c.relnamespace = n.oid
            WHERE n.nspname = @schemaName
              AND c.relkind IN ('r', 'v', 'm', 'S', 'f', 'p')
            GROUP BY c.relkind
            ORDER BY object_count DESC";

        using var countCommand = new NpgsqlCommand(objectCountQuery, connection);
        countCommand.Parameters.AddWithValue("@schemaName", details.Name);

        using var countReader = await countCommand.ExecuteReaderAsync(cancellationToken);
        while (await countReader.ReadAsync(cancellationToken))
        {
            var objectType = countReader.GetString(0);
            var count = countReader.GetInt64(1);
            details.AdditionalInfo[$"ObjectCount_{objectType}"] = count;
        }

        // Get schema size information
        try
        {
            const string sizeQuery = @"
                SELECT
                    pg_size_pretty(SUM(pg_total_relation_size(c.oid))) AS total_size,
                    SUM(pg_total_relation_size(c.oid)) AS size_bytes
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = @schemaName";

            using var sizeCommand = new NpgsqlCommand(sizeQuery, connection);
            sizeCommand.Parameters.AddWithValue("@schemaName", details.Name);

            using var sizeReader = await sizeCommand.ExecuteReaderAsync(cancellationToken);
            if (await sizeReader.ReadAsync(cancellationToken) && !sizeReader.IsDBNull(0))
            {
                details.AdditionalInfo["TotalSize"] = sizeReader.GetString(0);
                details.AdditionalInfo["SizeBytes"] = sizeReader.GetInt64(1);
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Schema size calculation failed for {SchemaName}", details.Name);
        }

        // Get schema privileges
        const string privilegeQuery = @"
            SELECT
                c.grantee,
                c.privilege_type,
                c.is_grantable
            FROM information_schema.schema_privileges c
            WHERE c.schema_name = @schemaName
            ORDER BY c.grantee, c.privilege_type";

        using var privilegeCommand = new NpgsqlCommand(privilegeQuery, connection);
        privilegeCommand.Parameters.AddWithValue("@schemaName", details.Name);

        using var privilegeReader = await privilegeCommand.ExecuteReaderAsync(cancellationToken);
        var privileges = new List<string>();
        while (await privilegeReader.ReadAsync(cancellationToken))
        {
            var grantee = privilegeReader.GetString(0);
            var privilege = privilegeReader.GetString(1);
            var isGrantable = !privilegeReader.IsDBNull(2) &&
                               privilegeReader.GetString(2).Equals("YES", StringComparison.OrdinalIgnoreCase);
            privileges.Add($"{grantee}: {privilege}{(isGrantable ? " (grantable)" : string.Empty)}");
        }

        if (privileges.Any())
        {
            details.AdditionalInfo["Privileges"] = string.Join("; ", privileges);
        }
    }

    /// <summary>
    /// Validates schema permissions
    /// </summary>
    private async Task ValidateSchemaPermissionsAsync(
        NpgsqlConnection connection,
        string schemaName,
        ObjectValidationResult result,
        CancellationToken cancellationToken)
    {
        try
        {
            // Check if current user has USAGE privilege on schema
            const string permissionQuery = @"
                SELECT COUNT(*)
                FROM information_schema.schema_privileges
                WHERE schema_name = @schemaName
                  AND (grantee = CURRENT_USER OR grantee = 'PUBLIC')
                  AND privilege_type = 'USAGE'";

            using var permCommand = new NpgsqlCommand(permissionQuery, connection);
            permCommand.Parameters.AddWithValue("@schemaName", schemaName);

            var permissionCount = await permCommand.ExecuteScalarAsync(cancellationToken);
            var hasUsage = permissionCount != null && (long)permissionCount > 0;

            result.Metadata["HasUsagePrivilege"] = hasUsage;

            if (!hasUsage)
            {
                result.Warnings.Add("Current user may not have USAGE privilege on schema - some operations may fail");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error checking schema permissions for {SchemaName}", schemaName);
            result.Warnings.Add($"Could not verify schema permissions: {ex.Message}");
        }
    }

    /// <summary>
    /// Builds a CREATE SCHEMA statement for the schema
    /// </summary>
    private async Task<string> BuildSchemaDefinitionAsync(
        NpgsqlConnection connection,
        string schemaName,
        string owner,
        CancellationToken cancellationToken)
    {
        try
        {
            var resolvedOwner = string.IsNullOrWhiteSpace(owner) ? "CURRENT_USER" : owner;
            return $"CREATE SCHEMA IF NOT EXISTS \"{schemaName}\" AUTHORIZATION {resolvedOwner};";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error building schema definition for {SchemaName}", schemaName);
            return $"CREATE SCHEMA \"{schemaName}\";";
        }
    }
}