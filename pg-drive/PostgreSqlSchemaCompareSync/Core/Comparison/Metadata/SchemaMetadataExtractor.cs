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
                s.schema_name,
                s.schema_owner,
                s.default_character_set_catalog,
                s.default_character_set_schema,
                s.default_character_set_name,
                s.sql_path,
                obj_description(s.oid, 'pg_namespace') as description,
                s.nspacl as access_privileges,
                n.oid as schema_oid,
                n.nspowner as owner_oid,
                n.nspcreated as creation_date
            FROM information_schema.schemata s
            JOIN pg_namespace n ON n.nspname = s.schema_name
            WHERE (@schemaFilter IS NULL OR s.schema_name = @schemaFilter)
              AND s.schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast', 'pg_temp_*')
            ORDER BY s.schema_name";

        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

        using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var schemaName = reader.GetString(0);
            var owner = reader.IsDBNull(1) ? string.Empty : reader.GetString(1);

            schemas.Add(new DatabaseObject
            {
                Name = schemaName,
                Schema = schemaName, // Schema name is both the object name and schema
                Type = ObjectType.Schema,
                Database = connection.Database,
                Owner = owner,
                Definition = await BuildSchemaDefinitionAsync(connection, schemaName, cancellationToken),
                CreatedAt = reader.IsDBNull(10) ? DateTime.UtcNow : reader.GetDateTime(10),
                Properties =
                {
                    ["DefaultCharacterSetCatalog"] = reader.IsDBNull(2) ? string.Empty : reader.GetString(2),
                    ["DefaultCharacterSetSchema"] = reader.IsDBNull(3) ? string.Empty : reader.GetString(3),
                    ["DefaultCharacterSetName"] = reader.IsDBNull(4) ? string.Empty : reader.GetString(4),
                    ["SqlPath"] = reader.IsDBNull(5) ? string.Empty : reader.GetString(5),
                    ["Description"] = reader.IsDBNull(6) ? string.Empty : reader.GetString(6),
                    ["AccessPrivileges"] = reader.IsDBNull(7) ? string.Empty : reader.GetString(7),
                    ["SchemaOid"] = reader.IsDBNull(8) ? 0 : reader.GetInt32(8),
                    ["OwnerOid"] = reader.IsDBNull(9) ? 0 : reader.GetInt32(9)
                }
            });
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
                        n.oid as schema_oid,
                        n.nspowner as owner_oid,
                        n.nspacl as access_privileges,
                        n.nspcreated as creation_date,
                        COUNT(c.oid) as object_count
                    FROM pg_namespace n
                    LEFT JOIN pg_class c ON c.relnamespace = n.oid
                    WHERE n.nspname = @schemaName
                    GROUP BY n.oid, n.nspowner, n.nspacl, n.nspcreated";

                using var advCommand = new NpgsqlCommand(advancedQuery, connection);
                advCommand.Parameters.AddWithValue("@schemaName", schema.Name);

                using var advReader = await advCommand.ExecuteReaderAsync(cancellationToken);
                if (await advReader.ReadAsync(cancellationToken))
                {
                    result.Metadata["SchemaOid"] = advReader.GetInt32(0);
                    result.Metadata["OwnerOid"] = advReader.GetInt32(1);
                    result.Metadata["AccessPrivileges"] = advReader.IsDBNull(2) ? string.Empty : advReader.GetString(2);
                    result.Metadata["CreationDate"] = advReader.IsDBNull(3) ? DateTime.UtcNow : advReader.GetDateTime(3);
                    result.Metadata["ObjectCount"] = advReader.GetInt64(4);

                    // Add warnings for potential issues
                    var objectCount = advReader.GetInt64(4);
                    if (objectCount == 0)
                        result.Warnings.Add("Schema is empty - no objects found");

                    if (objectCount > 10000)
                        result.Warnings.Add($"Schema contains large number of objects ({objectCount}) - may impact performance");
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
        const string sizeQuery = @"
            SELECT
                pg_size_pretty(pg_namespace_size(n.oid)) as total_size,
                pg_namespace_size(n.oid) as size_bytes
            FROM pg_namespace n
            WHERE n.nspname = @schemaName";

        using var sizeCommand = new NpgsqlCommand(sizeQuery, connection);
        sizeCommand.Parameters.AddWithValue("@schemaName", details.Name);

        using var sizeReader = await sizeCommand.ExecuteReaderAsync(cancellationToken);
        if (await sizeReader.ReadAsync(cancellationToken))
        {
            details.AdditionalInfo["TotalSize"] = sizeReader.GetString(0);
            details.AdditionalInfo["SizeBytes"] = sizeReader.GetInt64(1);
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
            var isGrantable = privilegeReader.GetBoolean(2);
            privileges.Add($"{grantee}: {privilege}{(isGrantable ? " (grantable)" : "")}");
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
        CancellationToken cancellationToken)
    {
        try
        {
            // Get schema owner for CREATE statement
            const string ownerQuery = @"
                SELECT nspowner::regrole
                FROM pg_namespace
                WHERE nspname = @schemaName";

            using var ownerCommand = new NpgsqlCommand(ownerQuery, connection);
            ownerCommand.Parameters.AddWithValue("@schemaName", schemaName);

            var ownerResult = await ownerCommand.ExecuteScalarAsync(cancellationToken);
            var owner = ownerResult?.ToString() ?? "postgres";

            return $"CREATE SCHEMA \"{schemaName}\" AUTHORIZATION {owner};";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error building schema definition for {SchemaName}", schemaName);
            return $"CREATE SCHEMA \"{schemaName}\";";
        }
    }
}