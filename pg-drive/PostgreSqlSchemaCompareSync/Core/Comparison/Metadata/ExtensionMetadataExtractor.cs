namespace PostgreSqlSchemaCompareSync.Core.Comparison.Metadata;

/// <summary>
/// Specialized extractor for PostgreSQL extension metadata
/// </summary>
public class ExtensionMetadataExtractor(
    ILogger<ExtensionMetadataExtractor> logger) : IMetadataExtractor, IObjectMetadataExtractor, IObjectValidator
{
    private readonly ILogger<ExtensionMetadataExtractor> _logger = logger ?? throw new ArgumentNullException(nameof(logger));

    public ObjectType ObjectType => ObjectType.Extension;

    /// <summary>
    /// Extracts extension metadata from the database
    /// </summary>
    public async Task<IEnumerable<DatabaseObject>> ExtractAsync(
        NpgsqlConnection connection,
        string? schemaFilter,
        CancellationToken cancellationToken)
    {
        var extensions = new List<DatabaseObject>();

        const string query = @"
            SELECT
                e.extname as extension_name,
                e.extversion as extension_version,
                n.nspname as extension_schema,
                e.extrelocatable as is_relocatable,
                e.extcondition as requires_extensions,
                c.comment as extension_comment,
                e.extowner::regrole as extension_owner,
                e.extnamespace as schema_oid,
                e.extconfig as configuration_tables,
                e.extdefaultversion as default_version,
                obj_description(e.oid, 'pg_extension') as description,
                e.extcreated as creation_date
            FROM pg_extension e
            JOIN pg_namespace n ON e.extnamespace = n.oid
            LEFT JOIN pg_description c ON c.objoid = e.oid AND c.objsubid = 0
            WHERE (@schemaFilter IS NULL OR n.nspname = @schemaFilter)
              AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
            ORDER BY e.extname";

        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

        using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var extensionName = reader.GetString(0);
            var extensionSchema = reader.GetString(2);

            extensions.Add(new DatabaseObject
            {
                Name = extensionName,
                Schema = extensionSchema,
                Type = ObjectType.Extension,
                Database = connection.Database,
                Owner = reader.IsDBNull(6) ? string.Empty : reader.GetString(6),
                Definition = await BuildExtensionDefinitionAsync(connection, extensionName, extensionSchema, cancellationToken),
                CreatedAt = reader.IsDBNull(11) ? DateTime.UtcNow : reader.GetDateTime(11),
                Properties =
                {
                    ["ExtensionVersion"] = reader.IsDBNull(1) ? string.Empty : reader.GetString(1),
                    ["IsRelocatable"] = reader.GetBoolean(3),
                    ["RequiresExtensions"] = reader.IsDBNull(4) ? string.Empty : reader.GetString(4),
                    ["ExtensionComment"] = reader.IsDBNull(5) ? string.Empty : reader.GetString(5),
                    ["SchemaOid"] = reader.GetInt32(7),
                    ["ConfigurationTables"] = reader.IsDBNull(8) ? string.Empty : reader.GetString(8),
                    ["DefaultVersion"] = reader.IsDBNull(9) ? string.Empty : reader.GetString(9),
                    ["Description"] = reader.IsDBNull(10) ? string.Empty : reader.GetString(10)
                }
            });
        }

        return extensions;
    }

    /// <summary>
    /// Extracts detailed extension information
    /// </summary>
    public async Task<DatabaseObjectDetails> ExtractDetailsAsync(
        NpgsqlConnection connection,
        string schema,
        string extensionName,
        CancellationToken cancellationToken)
    {
        var details = new DatabaseObjectDetails
        {
            Name = extensionName,
            Schema = schema,
            Type = ObjectType.Extension,
            Database = connection.Database,
            CreatedAt = DateTime.UtcNow
        };

        await ExtractExtensionDetailsAsync(connection, details, cancellationToken);
        return details;
    }

    /// <summary>
    /// Validates extension objects
    /// </summary>
    public async Task<ObjectValidationResult> ValidateAsync(
        NpgsqlConnection connection,
        DatabaseObject extension,
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
            _logger.LogDebug("Validating extension {ExtensionName}", extension.Name);

            // Check if extension exists and is accessible
            const string query = @"
                SELECT COUNT(*)
                FROM pg_extension e
                JOIN pg_namespace n ON e.extnamespace = n.oid
                WHERE e.extname = @extensionName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@extensionName", extension.Name);

            var countResult = await command.ExecuteScalarAsync(cancellationToken);
            var count = countResult != null ? (long)countResult : 0;

            if (count == 0)
            {
                result.IsValid = false;
                result.Errors.Add("Extension does not exist or is not accessible");
            }
            else
            {
                result.Metadata["ExtensionExists"] = true;

                // Get advanced extension information
                const string advancedQuery = @"
                    SELECT
                        e.extversion as current_version,
                        e.extrelocatable as is_relocatable,
                        e.extcondition as requires_extensions,
                        e.extdefaultversion as default_version,
                        e.extconfig as configuration_tables,
                        e.extowner::regrole as extension_owner,
                        n.nspname as extension_schema,
                        c.comment as extension_comment,
                        e.extcreated as creation_date,
                        CASE
                            WHEN e.extversion = e.extdefaultversion THEN true
                            ELSE false
                        END as is_default_version
                    FROM pg_extension e
                    JOIN pg_namespace n ON e.extnamespace = n.oid
                    LEFT JOIN pg_description c ON c.objoid = e.oid AND c.objsubid = 0
                    WHERE e.extname = @extensionName";

                using var advCommand = new NpgsqlCommand(advancedQuery, connection);
                advCommand.Parameters.AddWithValue("@extensionName", extension.Name);

                using var advReader = await advCommand.ExecuteReaderAsync(cancellationToken);
                if (await advReader.ReadAsync(cancellationToken))
                {
                    result.Metadata["CurrentVersion"] = advReader.IsDBNull(0) ? string.Empty : advReader.GetString(0);
                    result.Metadata["IsRelocatable"] = advReader.GetBoolean(1);
                    result.Metadata["RequiresExtensions"] = advReader.IsDBNull(2) ? string.Empty : advReader.GetString(2);
                    result.Metadata["DefaultVersion"] = advReader.IsDBNull(3) ? string.Empty : advReader.GetString(3);
                    result.Metadata["ConfigurationTables"] = advReader.IsDBNull(4) ? string.Empty : advReader.GetString(4);
                    result.Metadata["ExtensionOwner"] = advReader.GetString(5);
                    result.Metadata["ExtensionSchema"] = advReader.GetString(6);
                    result.Metadata["ExtensionComment"] = advReader.IsDBNull(7) ? string.Empty : advReader.GetString(7);
                    result.Metadata["CreationDate"] = advReader.IsDBNull(8) ? DateTime.UtcNow : advReader.GetDateTime(8);
                    result.Metadata["IsDefaultVersion"] = advReader.GetBoolean(9);

                    // Add warnings for potential issues
                    if (!advReader.GetBoolean(9))
                        result.Warnings.Add($"Extension is not using default version (current: {advReader.GetString(0)}, default: {advReader.GetString(3)})");

                    if (!advReader.GetBoolean(1))
                        result.Warnings.Add("Extension is not relocatable - schema changes may be restricted");

                    var requires = advReader.IsDBNull(2) ? string.Empty : advReader.GetString(2);
                    if (!string.IsNullOrEmpty(requires))
                        result.Warnings.Add($"Extension requires other extensions: {requires}");
                }

                // Validate extension dependencies
                await ValidateExtensionDependenciesAsync(connection, extension.Name, result, cancellationToken);

                // Check for available updates
                await CheckExtensionUpdatesAsync(connection, extension.Name, result, cancellationToken);
            }

            result.Metadata["ValidationDate"] = DateTime.UtcNow;
            result.Metadata["ObjectType"] = extension.Type.ToString();

            _logger.LogDebug("Validation completed for extension {ExtensionName}: Valid={IsValid}",
                extension.Name, result.IsValid);

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to validate extension {ExtensionName}", extension.Name);

            result.IsValid = false;
            result.Errors.Add($"Validation error: {ex.Message}");
            return result;
        }
    }

    /// <summary>
    /// Extracts detailed extension information including objects and configuration
    /// </summary>
    private async Task ExtractExtensionDetailsAsync(
        NpgsqlConnection connection,
        DatabaseObjectDetails details,
        CancellationToken cancellationToken)
    {
        // Get extension objects
        const string objectQuery = @"
            SELECT
                CASE
                    WHEN c.relkind = 'r' THEN 'Table'
                    WHEN c.relkind = 'v' THEN 'View'
                    WHEN c.relkind = 'i' THEN 'Index'
                    WHEN c.relkind = 'S' THEN 'Sequence'
                    WHEN c.relkind = 'f' THEN 'Foreign Table'
                    WHEN c.relkind = 'm' THEN 'Materialized View'
                    WHEN c.relkind = 'c' THEN 'Composite Type'
                    ELSE 'Other'
                END as object_type,
                c.relname as object_name,
                obj_description(c.oid, 'pg_class') as object_comment
            FROM pg_extension e
            JOIN pg_depend d ON d.refobjid = e.oid
            JOIN pg_class c ON d.objid = c.oid
            JOIN pg_namespace n ON c.relnamespace = n.oid
            WHERE e.extname = @extensionName
              AND d.deptype = 'e'
              AND n.nspname = @schema
            ORDER BY c.relname";

        using var objectCommand = new NpgsqlCommand(objectQuery, connection);
        objectCommand.Parameters.AddWithValue("@extensionName", details.Name);
        objectCommand.Parameters.AddWithValue("@schema", details.Schema);

        using var objectReader = await objectCommand.ExecuteReaderAsync(cancellationToken);
        var extensionObjects = new List<string>();
        while (await objectReader.ReadAsync(cancellationToken))
        {
            var objectType = objectReader.GetString(0);
            var objectName = objectReader.GetString(1);
            var comment = objectReader.IsDBNull(2) ? string.Empty : objectReader.GetString(2);
            extensionObjects.Add($"{objectType}: {objectName}{(string.IsNullOrEmpty(comment) ? "" : $" ({comment})")}");
        }

        if (extensionObjects.Any())
        {
            details.AdditionalInfo["ExtensionObjects"] = string.Join("; ", extensionObjects);
            details.AdditionalInfo["ExtensionObjectCount"] = extensionObjects.Count;
        }

        // Get extension configuration if available
        const string configQuery = @"
            SELECT
                extconfig
            FROM pg_extension
            WHERE extname = @extensionName";

        using var configCommand = new NpgsqlCommand(configQuery, connection);
        configCommand.Parameters.AddWithValue("@extensionName", details.Name);

        var configResult = await configCommand.ExecuteScalarAsync(cancellationToken);
        if (configResult != null && !Convert.IsDBNull(configResult))
        {
            var configArray = (Array)configResult;
            if (configArray.Length > 0)
            {
                var configTables = new List<string>();
                for (int i = 0; i < configArray.Length; i++)
                {
                    if (configArray.GetValue(i) != null && configArray.GetValue(i) != DBNull.Value)
                    {
                        var tableOid = (uint)configArray.GetValue(i);
                        // Get table name from OID
                        const string tableQuery = @"
                            SELECT n.nspname || '.' || c.relname
                            FROM pg_class c
                            JOIN pg_namespace n ON c.relnamespace = n.oid
                            WHERE c.oid = @tableOid";

                        using var tableCommand = new NpgsqlCommand(tableQuery, connection);
                        tableCommand.Parameters.AddWithValue("@tableOid", (int)tableOid);

                        var tableName = await tableCommand.ExecuteScalarAsync(cancellationToken);
                        if (tableName != null)
                        {
                            configTables.Add(tableName.ToString());
                        }
                    }
                }

                if (configTables.Any())
                {
                    details.AdditionalInfo["ConfigurationTables"] = string.Join(", ", configTables);
                }
            }
        }
    }

    /// <summary>
    /// Validates extension dependencies
    /// </summary>
    private async Task ValidateExtensionDependenciesAsync(
        NpgsqlConnection connection,
        string extensionName,
        ObjectValidationResult result,
        CancellationToken cancellationToken)
    {
        try
        {
            const string query = @"
                SELECT e.extcondition as requires_extensions
                FROM pg_extension e
                WHERE e.extname = @extensionName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@extensionName", extensionName);

            var requiresResult = await command.ExecuteScalarAsync(cancellationToken);
            var requires = requiresResult?.ToString() ?? "";

            result.Metadata["RequiresExtensions"] = requires;

            if (!string.IsNullOrEmpty(requires))
            {
                // Check if required extensions are installed
                var requiredExtensions = requires.Split(',')
                    .Select(r => r.Trim())
                    .Where(r => !string.IsNullOrEmpty(r))
                    .ToList();

                const string checkQuery = @"
                    SELECT extname
                    FROM pg_extension
                    WHERE extname = ANY(@requiredExtensions)";

                using var checkCommand = new NpgsqlCommand(checkQuery, connection);
                checkCommand.Parameters.AddWithValue("@requiredExtensions", requiredExtensions.ToArray());

                using var checkReader = await checkCommand.ExecuteReaderAsync(cancellationToken);
                var installedExtensions = new List<string>();
                while (await checkReader.ReadAsync(cancellationToken))
                {
                    installedExtensions.Add(checkReader.GetString(0));
                }

                var missingExtensions = requiredExtensions.Except(installedExtensions).ToList();
                if (missingExtensions.Any())
                {
                    result.Errors.Add($"Missing required extensions: {string.Join(", ", missingExtensions)}");
                }
                else
                {
                    result.Metadata["AllDependenciesSatisfied"] = true;
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error checking extension dependencies for {ExtensionName}", extensionName);
            result.Warnings.Add($"Could not verify extension dependencies: {ex.Message}");
        }
    }

    /// <summary>
    /// Checks for available extension updates
    /// </summary>
    private async Task CheckExtensionUpdatesAsync(
        NpgsqlConnection connection,
        string extensionName,
        ObjectValidationResult result,
        CancellationToken cancellationToken)
    {
        try
        {
            const string query = @"
                SELECT
                    e.extversion as current_version,
                    e.extdefaultversion as default_version
                FROM pg_extension e
                WHERE e.extname = @extensionName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@extensionName", extensionName);

            using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                var currentVersion = reader.GetString(0);
                var defaultVersion = reader.GetString(1);

                result.Metadata["CurrentVersion"] = currentVersion;
                result.Metadata["DefaultVersion"] = defaultVersion;

                if (currentVersion != defaultVersion)
                {
                    result.Warnings.Add($"Extension update available (current: {currentVersion}, available: {defaultVersion})");
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error checking extension updates for {ExtensionName}", extensionName);
            result.Warnings.Add($"Could not check for extension updates: {ex.Message}");
        }
    }

    /// <summary>
    /// Builds a CREATE EXTENSION statement for the extension
    /// </summary>
    private async Task<string> BuildExtensionDefinitionAsync(
        NpgsqlConnection connection,
        string extensionName,
        string schema,
        CancellationToken cancellationToken)
    {
        try
        {
            const string query = @"
                SELECT
                    e.extversion as extension_version,
                    e.extrelocatable as is_relocatable,
                    e.extcondition as requires_extensions
                FROM pg_extension e
                WHERE e.extname = @extensionName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@extensionName", extensionName);

            using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                var version = reader.IsDBNull(0) ? string.Empty : reader.GetString(0);
                var isRelocatable = reader.GetBoolean(1);
                var requires = reader.IsDBNull(2) ? string.Empty : reader.GetString(2);

                var createStatement = $"CREATE EXTENSION \"{extensionName}\"";

                if (!string.IsNullOrEmpty(version))
                {
                    createStatement += $" VERSION '{version}'";
                }

                if (isRelocatable)
                {
                    createStatement += $" SCHEMA \"{schema}\"";
                }

                if (!string.IsNullOrEmpty(requires))
                {
                    createStatement += $" CASCADE";
                }

                createStatement += ";";

                return createStatement;
            }

            return $"CREATE EXTENSION \"{extensionName}\";";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error building extension definition for {ExtensionName}", extensionName);
            return $"CREATE EXTENSION \"{extensionName}\";";
        }
    }
}