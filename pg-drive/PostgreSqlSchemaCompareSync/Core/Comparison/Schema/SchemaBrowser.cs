namespace PostgreSqlSchemaCompareSync.Core.Comparison.Schema;

/// <summary>
/// Implementation of schema browsing functionality
/// </summary>
public class SchemaBrowser(
    ILogger<SchemaBrowser> logger,
    IOptions<AppSettings> settings,
    IConnectionManager connectionManager) : ISchemaBrowser
{
    private readonly ILogger<SchemaBrowser> _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    private readonly AppSettings _settings = settings?.Value ?? throw new ArgumentNullException(nameof(settings));
    private readonly IConnectionManager _connectionManager = connectionManager ?? throw new ArgumentNullException(nameof(connectionManager));
    private bool _disposed;

    /// <summary>
    /// Gets all database objects for a connection
    /// </summary>
    public async Task<List<DatabaseObject>> GetDatabaseObjectsAsync(
        ConnectionInfo connectionInfo,
        string? schemaFilter = null,
        CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(connectionInfo);
        var objects = new List<DatabaseObject>();
        try
        {
            _logger.LogDebug("Browsing schema for {Database}", connectionInfo.Database);
            await using var connectionHandle = await _connectionManager.CreateConnectionAsync(connectionInfo, ct);
            var connection = connectionHandle.Connection;
            // Get all schema objects
            var tables = await GetTablesAsync(connection, schemaFilter, ct);
            var views = await GetViewsAsync(connection, schemaFilter, ct);
            var functions = await GetFunctionsAsync(connection, schemaFilter, ct);
            var procedures = await GetProceduresAsync(connection, schemaFilter, ct);
            var sequences = await GetSequencesAsync(connection, schemaFilter, ct);
            var types = await GetTypesAsync(connection, schemaFilter, ct);
            var indexes = await GetIndexesAsync(connection, schemaFilter, ct);
            var triggers = await GetTriggersAsync(connection, schemaFilter, ct);
            var constraints = await GetConstraintsAsync(connection, schemaFilter, ct);
            objects.AddRange(tables);
            objects.AddRange(views);
            objects.AddRange(functions);
            objects.AddRange(procedures);
            objects.AddRange(sequences);
            objects.AddRange(types);
            objects.AddRange(indexes);
            objects.AddRange(triggers);
            objects.AddRange(constraints);

            // Add missing object types
            var domains = await ExtractDomainMetadataAsync(connection, schemaFilter, ct);
            var collations = await ExtractCollationMetadataAsync(connection, schemaFilter, ct);
            var extensions = await ExtractExtensionMetadataAsync(connection, schemaFilter, ct);
            var roles = await ExtractRoleMetadataAsync(connection, schemaFilter, ct);
            var tablespaces = await ExtractTablespaceMetadataAsync(connection, schemaFilter, ct);
            var schemas = await ExtractSchemaMetadataAsync(connection, schemaFilter, ct);

            objects.AddRange(domains);
            objects.AddRange(collations);
            objects.AddRange(extensions);
            objects.AddRange(roles);
            objects.AddRange(tablespaces);
            objects.AddRange(schemas);
            _logger.LogInformation("Retrieved {ObjectCount} objects from {Database}", objects.Count, connectionInfo.Database);
            return objects;
        }
        catch (NpgsqlException ex)
        {
            _logger.LogError(ex, "Database error browsing schema for {Database}", connectionInfo.Database);
            throw new SchemaException($"Failed to browse schema: {ex.Message}", connectionInfo.Id, ex);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error browsing schema for {Database}", connectionInfo.Database);
            throw new SchemaException($"Unexpected error browsing schema: {ex.Message}", connectionInfo.Id, ex);
        }
    }
    /// <summary>
    /// Gets detailed information about a specific database object
    /// </summary>
    public async Task<DatabaseObjectDetails> GetObjectDetailsAsync(
        ConnectionInfo connectionInfo,
        ObjectType objectType,
        string schema,
        string objectName,
        CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(connectionInfo);
        try
        {
            _logger.LogDebug("Getting details for {ObjectType} {ObjectName}", objectType, objectName);
            await using var connectionHandle = await _connectionManager.CreateConnectionAsync(connectionInfo, ct);
            var connection = connectionHandle.Connection;
            var details = new DatabaseObjectDetails
            {
                Name = objectName,
                Type = objectType,
                Schema = schema,
                Database = connectionInfo.Database
            };
            // Get object-specific details
            switch (objectType)
            {
                case ObjectType.Table:
                    await PopulateTableDetailsAsync(connection, details, ct);
                    break;
                case ObjectType.View:
                    await PopulateViewDetailsAsync(connection, details, ct);
                    break;
                case ObjectType.Function:
                    await PopulateFunctionDetailsAsync(connection, details, ct);
                    break;
                case ObjectType.Index:
                    await PopulateIndexDetailsAsync(connection, details, ct);
                    break;
                case ObjectType.Sequence:
                    await PopulateSequenceDetailsAsync(connection, details, ct);
                    break;
                case ObjectType.Type:
                case ObjectType.Domain:
                    await PopulateTypeDetailsAsync(connection, details, ct);
                    break;
                case ObjectType.Trigger:
                    await PopulateTriggerDetailsAsync(connection, details, ct);
                    break;
                case ObjectType.Constraint:
                    await PopulateConstraintDetailsAsync(connection, details, ct);
                    break;
                case ObjectType.Schema:
                    await PopulateSchemaDetailsAsync(connection, details, ct);
                    break;
                case ObjectType.Collation:
                    await PopulateCollationDetailsAsync(connection, details, ct);
                    break;
                case ObjectType.Extension:
                    await PopulateExtensionDetailsAsync(connection, details, ct);
                    break;
                case ObjectType.Role:
                    await PopulateRoleDetailsAsync(connection, details, ct);
                    break;
                case ObjectType.Tablespace:
                    await PopulateTablespaceDetailsAsync(connection, details, ct);
                    break;
                default:
                    await PopulateBasicDetailsAsync(connection, details, ct);
                    break;
            }
            _logger.LogDebug("Retrieved details for {ObjectType} {ObjectName}", objectType, objectName);
            return details;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get details for {ObjectType} {ObjectName}", objectType, objectName);
            throw new SchemaException($"Failed to get object details: {ex.Message}", connectionInfo.Id, ex);
        }
    }
    /// <summary>
    /// Searches for database objects by name or pattern
    /// </summary>
    public async Task<List<DatabaseObject>> SearchObjectsAsync(
        ConnectionInfo connectionInfo,
        string searchTerm,
        List<ObjectType>? objectTypes = null,
        CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(connectionInfo);
        if (string.IsNullOrEmpty(searchTerm))
            return [];
        try
        {
            _logger.LogDebug("Searching for objects matching '{SearchTerm}' in {Database}", searchTerm, connectionInfo.Database);
            var allObjects = await GetDatabaseObjectsAsync(connectionInfo, null, ct);
            var matchingObjects = allObjects.Where(obj =>
                (objectTypes == null || objectTypes.Contains(obj.Type)) &&
                (obj.Name.Contains(searchTerm, StringComparison.OrdinalIgnoreCase) ||
                 obj.Schema.Contains(searchTerm, StringComparison.OrdinalIgnoreCase) ||
                 (obj.Definition?.Contains(searchTerm, StringComparison.OrdinalIgnoreCase) ?? false)))
                .ToList();
            _logger.LogInformation("Found {MatchCount} objects matching '{SearchTerm}' in {Database}",
                matchingObjects.Count, searchTerm, connectionInfo.Database);
            return matchingObjects;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to search objects in {Database}", connectionInfo.Database);
            throw new SchemaException($"Failed to search objects: {ex.Message}", connectionInfo.Id, ex);
        }
    }
    /// <summary>
    /// Gets dependencies for a database object
    /// </summary>
    public async Task<List<string>> GetObjectDependenciesAsync(
        ConnectionInfo connectionInfo,
        ObjectType objectType,
        string schema,
        string objectName,
        CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(connectionInfo);
        try
        {
            _logger.LogDebug("Getting dependencies for {ObjectType} {ObjectName}", objectType, objectName);
            await using var connectionHandle = await _connectionManager.CreateConnectionAsync(connectionInfo, ct);
            var connection = connectionHandle.Connection;
            var dependencies = new List<string>();
            // Use PostgreSQL system catalogs to find dependencies
            var query = @"
                    SELECT DISTINCT
                        dependent.relname as dependent_object,
                        dependent.relkind as dependent_type,
                        dependent.nspname as dependent_schema
                    FROM pg_depend d
                    JOIN pg_class obj ON d.objid = obj.oid
                    JOIN pg_namespace obj_ns ON obj.relnamespace = obj_ns.oid
                    JOIN pg_class dependent ON d.refobjid = dependent.oid
                    JOIN pg_namespace dependent_ns ON dependent.relnamespace = dependent_ns.oid
                    WHERE obj_ns.nspname = @schema
                      AND obj.relname = @objectName
                      AND obj.relkind IN ('r', 'v', 'f', 'p')
                    UNION ALL
                    SELECT DISTINCT
                        obj.relname as dependent_object,
                        obj.relkind as dependent_type,
                        obj.nspname as dependent_schema
                    FROM pg_depend d
                    JOIN pg_class dependent ON d.objid = dependent.oid
                    JOIN pg_namespace dependent_ns ON dependent.relnamespace = dependent_ns.oid
                    JOIN pg_class obj ON d.refobjid = obj.oid
                    JOIN pg_namespace obj_ns ON obj.relnamespace = obj_ns.oid
                    WHERE dependent_ns.nspname = @schema
                      AND dependent.relname = @objectName
                      AND dependent.relkind IN ('r', 'v', 'f', 'p')
                ";
            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schema", schema);
            command.Parameters.AddWithValue("@objectName", objectName);
            using var reader = await command.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                var dependentObject = reader.GetString(0);
                var dependentType = reader.GetChar(1);
                var dependentSchema = reader.GetString(2);
                var typeChar = char.ToLower(dependentType);
                var dependentObjectType = typeChar switch
                {
                    'r' => "table",
                    'v' => "view",
                    'f' => "function",
                    'p' => "procedure",
                    _ => "unknown"
                };
                dependencies.Add($"{objectType}:{dependentSchema}.{dependentObject}");
            }
            _logger.LogDebug("Found {DependencyCount} dependencies for {ObjectType} {ObjectName}",
                dependencies.Count, objectType, objectName);
            return dependencies;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get dependencies for {ObjectType} {ObjectName}", objectType, objectName);
            throw new SchemaException($"Failed to get object dependencies: {ex.Message}", connectionInfo.Id, ex);
        }
    }
    private async Task<List<DatabaseObject>> GetTablesAsync(NpgsqlConnection connection, string? schemaFilter, CancellationToken ct)
    {
        var tables = new List<DatabaseObject>();
        var query = @"
                SELECT
                    c.relname AS table_name,
                    n.nspname AS table_schema,
                    pg_total_relation_size(c.oid) AS size_bytes,
                    (
                        SELECT format(
                            'CREATE TABLE %I.%I (\n%s\n);',
                            n.nspname,
                            c.relname,
                            string_agg(
                                format(
                                    '    %I %s%s%s%s',
                                    a.attname,
                                    pg_catalog.format_type(a.atttypid, a.atttypmod),
                                    CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END,
                                    CASE WHEN ad.adbin IS NOT NULL THEN ' DEFAULT ' || pg_get_expr(ad.adbin, ad.adrelid) ELSE '' END,
                                    CASE a.attidentity
                                        WHEN 'a' THEN ' GENERATED ALWAYS AS IDENTITY'
                                        WHEN 'd' THEN ' GENERATED BY DEFAULT AS IDENTITY'
                                        ELSE ''
                                    END
                                ),
                                E',\n'
                                ORDER BY a.attnum
                            )
                        )
                        FROM pg_attribute a
                        LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
                        WHERE a.attrelid = c.oid
                          AND a.attnum > 0
                          AND NOT a.attisdropped
                    ) AS create_ddl,
                    obj_description(c.oid, 'pg_class') AS description
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE c.relkind = 'r'
                  AND (@schemaFilter IS NULL OR n.nspname = @schemaFilter)
                  AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                ORDER BY n.nspname, c.relname";
        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);
        using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var tableName = reader.GetString(0);
            var schemaName = reader.GetString(1);
            var definition = reader.IsDBNull(3) ? string.Empty : reader.GetString(3);

            if (string.IsNullOrWhiteSpace(definition))
            {
                definition = $"CREATE TABLE \"{schemaName}\".\"{tableName}\" ();";
            }

            var description = reader.IsDBNull(4) ? string.Empty : reader.GetString(4);

            var tableObject = new DatabaseObject
            {
                Name = tableName,
                Schema = schemaName,
                Type = ObjectType.Table,
                Database = connection.Database,
                SizeInBytes = reader.IsDBNull(2) ? null : (long?)reader.GetInt64(2),
                Definition = definition,
                CreatedAt = DateTime.UtcNow
            };

            if (!string.IsNullOrWhiteSpace(description))
            {
                tableObject.Properties["Description"] = description;
            }

            tables.Add(tableObject);
        }
        return tables;
    }

    private async Task<List<DatabaseObject>> GetViewsAsync(NpgsqlConnection connection, string? schemaFilter, CancellationToken ct)
    {
        var views = new List<DatabaseObject>();
        var query = @"
                SELECT
                    v.table_name,
                    v.table_schema,
                    v.view_definition,
                    obj_description(format('%I.%I', v.table_schema, v.table_name)::regclass) as description
                FROM information_schema.views v
                WHERE (@schemaFilter IS NULL OR v.table_schema = @schemaFilter)
                  AND v.table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                ORDER BY v.table_schema, v.table_name";
        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);
        using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            views.Add(new DatabaseObject
            {
                Name = reader.GetString(0),
                Schema = reader.GetString(1),
                Type = ObjectType.View,
                Database = connection.Database,
                Definition = reader.IsDBNull(2) ? null : reader.GetString(2),
                CreatedAt = DateTime.UtcNow
            });
        }
        return views;
    }
    /// <summary>
    /// Helper method to get functions
    /// </summary>
    private async Task<List<DatabaseObject>> GetFunctionsAsync(NpgsqlConnection connection, string? schemaFilter, CancellationToken ct)
    {
        var functions = new List<DatabaseObject>();
        var query = @"
                                SELECT
                                        p.proname AS function_name,
                                        n.nspname AS function_schema,
                                        pg_get_function_identity_arguments(p.oid) AS identity_arguments,
                                        pg_get_functiondef(p.oid) AS function_definition,
                                        obj_description(p.oid) AS description
                                FROM pg_proc p
                                JOIN pg_namespace n ON p.pronamespace = n.oid
                                WHERE p.prokind = 'f'
                                    AND (@schemaFilter IS NULL OR n.nspname = @schemaFilter)
                                    AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                                ORDER BY n.nspname, p.proname, identity_arguments";
        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);
        using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var databaseObject = new DatabaseObject
            {
                Name = reader.GetString(0),
                Schema = reader.GetString(1),
                Type = ObjectType.Function,
                Database = connection.Database,
                Definition = reader.IsDBNull(3) ? string.Empty : reader.GetString(3),
                CreatedAt = DateTime.UtcNow
            };

            if (!reader.IsDBNull(2))
            {
                databaseObject.Properties["Signature"] = reader.GetString(2);
            }

            if (!reader.IsDBNull(4))
            {
                databaseObject.Properties["Description"] = reader.GetString(4);
            }

            functions.Add(databaseObject);
        }
        return functions;
    }

    private async Task<List<DatabaseObject>> GetProceduresAsync(NpgsqlConnection connection, string? schemaFilter, CancellationToken ct)
    {
        var procedures = new List<DatabaseObject>();
        var query = @"
                SELECT
                    p.proname AS procedure_name,
                    n.nspname AS procedure_schema,
                    pg_get_function_identity_arguments(p.oid) AS identity_arguments,
                    pg_get_functiondef(p.oid) AS procedure_definition,
                    obj_description(p.oid) AS description
                FROM pg_proc p
                JOIN pg_namespace n ON p.pronamespace = n.oid
                WHERE p.prokind = 'p'
                  AND (@schemaFilter IS NULL OR n.nspname = @schemaFilter)
                  AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                ORDER BY n.nspname, p.proname, identity_arguments";

        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

        using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var databaseObject = new DatabaseObject
            {
                Name = reader.GetString(0),
                Schema = reader.GetString(1),
                Type = ObjectType.Procedure,
                Database = connection.Database,
                Definition = reader.IsDBNull(3) ? string.Empty : reader.GetString(3),
                CreatedAt = DateTime.UtcNow
            };

            if (!reader.IsDBNull(2))
            {
                databaseObject.Properties["Signature"] = reader.GetString(2);
            }

            if (!reader.IsDBNull(4))
            {
                databaseObject.Properties["Description"] = reader.GetString(4);
            }

            procedures.Add(databaseObject);
        }

        return procedures;
    }

    private async Task<List<DatabaseObject>> GetSequencesAsync(NpgsqlConnection connection, string? schemaFilter, CancellationToken ct)
    {
        var sequences = new List<DatabaseObject>();
        var query = @"
                SELECT
                    c.relname as sequence_name,
                    n.nspname as sequence_schema,
                    obj_description(format('%I.%I', n.nspname, c.relname)::regclass) as description
                FROM pg_class c
                JOIN pg_namespace n ON c.relnamespace = n.oid
                WHERE c.relkind = 'S'
                  AND (@schemaFilter IS NULL OR n.nspname = @schemaFilter)
                  AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                ORDER BY n.nspname, c.relname";
        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);
        using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            sequences.Add(new DatabaseObject
            {
                Name = reader.GetString(0),
                Schema = reader.GetString(1),
                Type = ObjectType.Sequence,
                Database = connection.Database,
                Definition = reader.IsDBNull(2) ? null : reader.GetString(2),
                CreatedAt = DateTime.UtcNow
            });
        }
        return sequences;
    }
    /// <summary>
    /// Helper method to get custom types
    /// </summary>
    private async Task<List<DatabaseObject>> GetTypesAsync(NpgsqlConnection connection, string? schemaFilter, CancellationToken ct)
    {
        var types = new List<DatabaseObject>();
        var query = @"
                SELECT
                    t.typname as type_name,
                    n.nspname as type_schema,
                    obj_description(t.oid) as description
                FROM pg_type t
                JOIN pg_namespace n ON t.typnamespace = n.oid
                WHERE (@schemaFilter IS NULL OR n.nspname = @schemaFilter)
                  AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                  AND t.typtype IN ('c', 'd', 'e') -- composite, domain, enum
                ORDER BY n.nspname, t.typname";
        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);
        using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            types.Add(new DatabaseObject
            {
                Name = reader.GetString(0),
                Schema = reader.GetString(1),
                Type = ObjectType.Type,
                Database = connection.Database,
                Definition = reader.IsDBNull(2) ? null : reader.GetString(2),
                CreatedAt = DateTime.UtcNow
            });
        }
        return types;
    }
    /// <summary>
    /// Helper method to get indexes
    /// </summary>
    private async Task<List<DatabaseObject>> GetIndexesAsync(NpgsqlConnection connection, string? schemaFilter, CancellationToken ct)
    {
        var indexes = new List<DatabaseObject>();
        var query = @"
                SELECT
                    c.relname as index_name,
                    t.relname as table_name,
                    n.nspname as index_schema,
                    obj_description(format('%I.%I', n.nspname, c.relname)::regclass) as description
                FROM pg_class c
                JOIN pg_index i ON c.oid = i.indexrelid
                JOIN pg_class t ON i.indrelid = t.oid
                JOIN pg_namespace n ON c.relnamespace = n.oid
                JOIN pg_namespace tn ON t.relnamespace = tn.oid
                WHERE c.relkind = 'i'
                  AND (@schemaFilter IS NULL OR tn.nspname = @schemaFilter)
                  AND tn.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                ORDER BY tn.nspname, t.relname, c.relname";
        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);
        using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            indexes.Add(new DatabaseObject
            {
                Name = reader.GetString(0),
                Schema = reader.GetString(2),
                Type = ObjectType.Index,
                Database = connection.Database,
                Definition = reader.IsDBNull(3) ? null : reader.GetString(3),
                CreatedAt = DateTime.UtcNow
            });
        }
        return indexes;
    }
    /// <summary>
    /// Helper method to get triggers
    /// </summary>
    private async Task<List<DatabaseObject>> GetTriggersAsync(NpgsqlConnection connection, string? schemaFilter, CancellationToken ct)
    {
        var triggers = new List<DatabaseObject>();
        var query = @"
                SELECT
                    t.tgname as trigger_name,
                    c.relname as table_name,
                    n.nspname as trigger_schema,
                    obj_description(t.oid) as description,
                    pg_get_triggerdef(t.oid) as trigger_definition
                FROM pg_trigger t
                JOIN pg_class c ON t.tgrelid = c.oid
                JOIN pg_namespace n ON c.relnamespace = n.oid
                WHERE NOT t.tgisinternal
                  AND (@schemaFilter IS NULL OR n.nspname = @schemaFilter)
                  AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                ORDER BY n.nspname, c.relname, t.tgname";
        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);
        using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var triggerObject = new DatabaseObject
            {
                Name = reader.GetString(0),
                Schema = reader.GetString(2),
                Type = ObjectType.Trigger,
                Database = connection.Database,
                Definition = reader.IsDBNull(4) ? null : reader.GetString(4),
                CreatedAt = DateTime.UtcNow
            };

            triggerObject.Properties["TableName"] = reader.GetString(1);

            if (!reader.IsDBNull(3))
            {
                triggerObject.Properties["Description"] = reader.GetString(3);
            }

            triggers.Add(triggerObject);
        }
        return triggers;
    }
    /// <summary>
    /// Helper method to get constraints
    /// </summary>
    private async Task<List<DatabaseObject>> GetConstraintsAsync(NpgsqlConnection connection, string? schemaFilter, CancellationToken ct)
    {
        var constraints = new List<DatabaseObject>();
        var query = @"
                SELECT
                    c.conname as constraint_name,
                    t.relname as table_name,
                    n.nspname as constraint_schema,
                    c.contype as constraint_type,
                    obj_description(format('%I.%I', n.nspname, c.conname)::regclass) as description
                FROM pg_constraint c
                JOIN pg_class t ON c.conrelid = t.oid
                JOIN pg_namespace n ON t.relnamespace = n.oid
                WHERE (@schemaFilter IS NULL OR n.nspname = @schemaFilter)
                  AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                ORDER BY n.nspname, t.relname, c.conname";
        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);
        using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            constraints.Add(new DatabaseObject
            {
                Name = reader.GetString(0),
                Schema = reader.GetString(2),
                Type = ObjectType.Constraint,
                Database = connection.Database,
                Definition = reader.IsDBNull(4) ? null : reader.GetString(4),
                CreatedAt = DateTime.UtcNow
            });
        }
        return constraints;
    }

    /// <summary>
    /// Helper method to get domains
    /// </summary>
    private async Task<List<DatabaseObject>> ExtractDomainMetadataAsync(NpgsqlConnection connection, string? schemaFilter, CancellationToken ct)
    {
        var domains = new List<DatabaseObject>();
        var query = @"
                SELECT
                    t.typname as domain_name,
                    n.nspname as domain_schema,
                    pg_get_domaindef(t.oid) as domain_definition,
                    obj_description(t.oid) as description,
                    t.typowner::regrole as owner
                FROM pg_type t
                JOIN pg_namespace n ON t.typnamespace = n.oid
                WHERE t.typtype = 'd'
                  AND (@schemaFilter IS NULL OR n.nspname = @schemaFilter)
                  AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                ORDER BY n.nspname, t.typname";

        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

        using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            domains.Add(new DatabaseObject
            {
                Name = reader.GetString(0),
                Schema = reader.GetString(1),
                Type = ObjectType.Domain,
                Database = connection.Database,
                Definition = reader.IsDBNull(2) ? null : reader.GetString(2),
                Owner = reader.IsDBNull(4) ? string.Empty : reader.GetString(4),
                CreatedAt = DateTime.UtcNow
            });
        }
        return domains;
    }

    /// <summary>
    /// Helper method to get collations
    /// </summary>
    private async Task<List<DatabaseObject>> ExtractCollationMetadataAsync(NpgsqlConnection connection, string? schemaFilter, CancellationToken ct)
    {
        var collations = new List<DatabaseObject>();
        var query = @"
                SELECT
                    c.collname as collation_name,
                    n.nspname as collation_schema,
                    c.collowner::regrole as owner,
                    c.collprovider as provider,
                    c.collisdeterministic as is_deterministic,
                    c.collencoding as encoding,
                    obj_description(c.oid) as description
                FROM pg_collation c
                JOIN pg_namespace n ON c.collnamespace = n.oid
                WHERE (@schemaFilter IS NULL OR n.nspname = @schemaFilter)
                  AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                ORDER BY n.nspname, c.collname";

        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

        using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            collations.Add(new DatabaseObject
            {
                Name = reader.GetString(0),
                Schema = reader.GetString(1),
                Type = ObjectType.Collation,
                Database = connection.Database,
                Owner = reader.IsDBNull(2) ? string.Empty : reader.GetString(2),
                Definition = reader.IsDBNull(5) ? string.Empty : reader.GetString(5),
                CreatedAt = DateTime.UtcNow
            });
        }
        return collations;
    }

    /// <summary>
    /// Helper method to get extensions
    /// </summary>
    private async Task<List<DatabaseObject>> ExtractExtensionMetadataAsync(NpgsqlConnection connection, string? schemaFilter, CancellationToken ct)
    {
        var extensions = new List<DatabaseObject>();
        var query = @"
                SELECT
                    e.extname as extension_name,
                    e.extversion as extension_version,
                    n.nspname as extension_schema,
                    e.extowner::regrole as owner,
                    obj_description(e.oid) as description
                FROM pg_extension e
                JOIN pg_namespace n ON e.extnamespace = n.oid
                WHERE (@schemaFilter IS NULL OR n.nspname = @schemaFilter)
                  AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                ORDER BY n.nspname, e.extname";

        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

        using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            extensions.Add(new DatabaseObject
            {
                Name = reader.GetString(0),
                Schema = reader.GetString(2),
                Type = ObjectType.Extension,
                Database = connection.Database,
                Definition = reader.IsDBNull(1) ? string.Empty : reader.GetString(1),
                Owner = reader.IsDBNull(3) ? string.Empty : reader.GetString(3),
                CreatedAt = DateTime.UtcNow
            });
        }
        return extensions;
    }

    /// <summary>
    /// Helper method to get roles
    /// </summary>
    private async Task<List<DatabaseObject>> ExtractRoleMetadataAsync(NpgsqlConnection connection, string? schemaFilter, CancellationToken ct)
    {
        var roles = new List<DatabaseObject>();
        var query = @"
                SELECT
                    r.rolname as role_name,
                    r.rolsuper as is_superuser,
                    r.rolcreaterole as can_create_role,
                    r.rolcreatedb as can_create_db,
                    r.rolcanlogin as can_login,
                    r.rolconnlimit as connection_limit,
                    r.rolvaliduntil as valid_until,
                    obj_description(r.oid) as description
                FROM pg_roles r
                WHERE (@schemaFilter IS NULL OR r.rolname = @schemaFilter)
                ORDER BY r.rolname";

        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

        using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            roles.Add(new DatabaseObject
            {
                Name = reader.GetString(0),
                Schema = "pg_catalog", // Roles are in pg_catalog schema
                Type = ObjectType.Role,
                Database = connection.Database,
                Definition = reader.IsDBNull(1) ? string.Empty : reader.GetString(1),
                Owner = reader.GetString(0), // Role owns itself
                CreatedAt = DateTime.UtcNow
            });
        }
        return roles;
    }

    /// <summary>
    /// Helper method to get tablespaces
    /// </summary>
    private async Task<List<DatabaseObject>> ExtractTablespaceMetadataAsync(NpgsqlConnection connection, string? schemaFilter, CancellationToken ct)
    {
        var tablespaces = new List<DatabaseObject>();
        var query = @"
                SELECT
                    t.spcname as tablespace_name,
                    t.spcowner::regrole as owner,
                    t.spclocation as location,
                    t.spcacl as access_privileges,
                    t.spcoptions as options,
                    obj_description(t.oid) as description
                FROM pg_tablespace t
                WHERE (@schemaFilter IS NULL OR t.spcname = @schemaFilter)
                ORDER BY t.spcname";

        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

        using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            tablespaces.Add(new DatabaseObject
            {
                Name = reader.GetString(0),
                Schema = "pg_catalog", // Tablespaces are in pg_catalog schema
                Type = ObjectType.Tablespace,
                Database = connection.Database,
                Definition = reader.IsDBNull(2) ? string.Empty : reader.GetString(2),
                Owner = reader.IsDBNull(1) ? string.Empty : reader.GetString(1),
                CreatedAt = DateTime.UtcNow
            });
        }
        return tablespaces;
    }

    /// <summary>
    /// Helper method to get schemas
    /// </summary>
    private async Task<List<DatabaseObject>> ExtractSchemaMetadataAsync(NpgsqlConnection connection, string? schemaFilter, CancellationToken ct)
    {
        var schemas = new List<DatabaseObject>();
        var query = @"
                SELECT
                    n.nspname as schema_name,
                    n.nspowner::regrole as owner,
                    n.nspacl as access_privileges,
                    obj_description(n.oid) as description
                FROM pg_namespace n
                WHERE (@schemaFilter IS NULL OR n.nspname = @schemaFilter)
                  AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                ORDER BY n.nspname";

        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

        using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            schemas.Add(new DatabaseObject
            {
                Name = reader.GetString(0),
                Schema = "pg_catalog", // Schemas are in pg_catalog schema
                Type = ObjectType.Schema,
                Database = connection.Database,
                Definition = reader.IsDBNull(3) ? string.Empty : reader.GetString(3),
                Owner = reader.IsDBNull(1) ? string.Empty : reader.GetString(1),
                CreatedAt = DateTime.UtcNow
            });
        }
        return schemas;
    }

    /// <summary>
    /// Helper method to populate table details
    /// </summary>
    private async Task PopulateTableDetailsAsync(NpgsqlConnection connection, DatabaseObjectDetails details, CancellationToken ct)
    {
        // Get columns
        var columnQuery = @"
                SELECT
                    column_name,
                    data_type,
                    is_nullable,
                    column_default,
                    character_maximum_length,
                    numeric_precision,
                    numeric_scale
                FROM information_schema.columns
                WHERE table_schema = @schema AND table_name = @tableName
                ORDER BY ordinal_position";
        using var columnCommand = new NpgsqlCommand(columnQuery, connection);
        columnCommand.Parameters.AddWithValue("@schema", details.Schema);
        columnCommand.Parameters.AddWithValue("@tableName", details.Name);
        using var columnReader = await columnCommand.ExecuteReaderAsync(ct);
        while (await columnReader.ReadAsync(ct))
        {
            details.Columns.Add(new ColumnInfo
            {
                Name = columnReader.GetString(0),
                DataType = columnReader.GetString(1),
                IsNullable = columnReader.GetString(2) == "YES",
                DefaultValue = columnReader.IsDBNull(3) ? null : columnReader.GetString(3),
                MaxLength = columnReader.IsDBNull(4) ? null : (int?)columnReader.GetInt32(4),
                Precision = columnReader.IsDBNull(5) ? null : (int?)columnReader.GetInt32(5),
                Scale = columnReader.IsDBNull(6) ? null : (int?)columnReader.GetInt32(6)
            });
        }
    }
    /// <summary>
    /// Helper method to populate view details
    /// </summary>
    private async Task PopulateViewDetailsAsync(NpgsqlConnection connection, DatabaseObjectDetails details, CancellationToken ct)
    {
        // Get view columns if not already populated
        if (details.Columns.Count == 0)
        {
            var columnQuery = @"
                SELECT
                    column_name,
                    data_type,
                    is_nullable,
                    column_default,
                    character_maximum_length,
                    numeric_precision,
                    numeric_scale
                FROM information_schema.columns
                WHERE table_schema = @schema AND table_name = @viewName
                ORDER BY ordinal_position";

            using var columnCommand = new NpgsqlCommand(columnQuery, connection);
            columnCommand.Parameters.AddWithValue("@schema", details.Schema);
            columnCommand.Parameters.AddWithValue("@viewName", details.Name);

            using var columnReader = await columnCommand.ExecuteReaderAsync(ct);
            while (await columnReader.ReadAsync(ct))
            {
                details.Columns.Add(new ColumnInfo
                {
                    Name = columnReader.GetString(0),
                    DataType = columnReader.GetString(1),
                    IsNullable = columnReader.GetString(2) == "YES",
                    DefaultValue = columnReader.IsDBNull(3) ? null : columnReader.GetString(3),
                    MaxLength = columnReader.IsDBNull(4) ? null : (int?)columnReader.GetInt32(4),
                    Precision = columnReader.IsDBNull(5) ? null : (int?)columnReader.GetInt32(5),
                    Scale = columnReader.IsDBNull(6) ? null : (int?)columnReader.GetInt32(6)
                });
            }
        }

        // Get view dependencies
        var dependencyQuery = @"
            SELECT DISTINCT
                dependent.relname as dependent_object,
                dependent.relkind as dependent_type,
                dependent.nspname as dependent_schema
            FROM pg_depend d
            JOIN pg_class view ON d.objid = view.oid
            JOIN pg_namespace view_ns ON view.relnamespace = view_ns.oid
            JOIN pg_class dependent ON d.refobjid = dependent.oid
            JOIN pg_namespace dependent_ns ON dependent.relnamespace = dependent_ns.oid
            WHERE view_ns.nspname = @schema
              AND view.relname = @viewName
              AND dependent.relkind IN ('r', 'v', 'f', 'p')
            UNION ALL
            SELECT DISTINCT
                obj.relname as dependent_object,
                obj.relkind as dependent_type,
                obj.nspname as dependent_schema
            FROM pg_depend d
            JOIN pg_class view ON d.refobjid = view.oid
            JOIN pg_namespace view_ns ON view.relnamespace = view_ns.oid
            JOIN pg_class obj ON d.objid = obj.oid
            JOIN pg_namespace obj_ns ON obj.relnamespace = obj_ns.oid
            WHERE view_ns.nspname = @schema
              AND view.relname = @viewName
              AND obj.relkind IN ('r', 'v', 'f', 'p')";

        using var depCommand = new NpgsqlCommand(dependencyQuery, connection);
        depCommand.Parameters.AddWithValue("@schema", details.Schema);
        depCommand.Parameters.AddWithValue("@viewName", details.Name);

        using var depReader = await depCommand.ExecuteReaderAsync(ct);
        while (await depReader.ReadAsync(ct))
        {
            var dependentObject = depReader.GetString(0);
            var dependentType = depReader.GetChar(1);
            var dependentSchema = depReader.GetString(2);

            var typeChar = char.ToLower(dependentType);
            var dependentObjectType = typeChar switch
            {
                'r' => "table",
                'v' => "view",
                'f' => "function",
                'p' => "procedure",
                _ => "unknown"
            };

            details.Dependencies.Add($"{dependentObjectType}:{dependentSchema}.{dependentObject}");
        }
    }
    /// <summary>
    /// Helper method to populate function details
    /// </summary>
    private async Task PopulateFunctionDetailsAsync(NpgsqlConnection connection, DatabaseObjectDetails details, CancellationToken ct)
    {
        // Get function parameters and detailed information
        var functionQuery = @"
            SELECT
                p.proname as function_name,
                pg_get_function_identity_arguments(p.oid) as arguments,
                p.prokind as function_type,
                p.provolatile as volatility,
                p.proparallel as parallel_safety,
                p.prosecdef as security_definer,
                p.procost as execution_cost,
                p.prorows as estimated_rows,
                p.proowner::regrole as owner,
                obj_description(p.oid) as description,
                pg_get_functiondef(p.oid) as function_definition
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = @schema AND p.proname = @functionName";

        using var funcCommand = new NpgsqlCommand(functionQuery, connection);
        funcCommand.Parameters.AddWithValue("@schema", details.Schema);
        funcCommand.Parameters.AddWithValue("@functionName", details.Name);

        using var funcReader = await funcCommand.ExecuteReaderAsync(ct);
        if (await funcReader.ReadAsync(ct))
        {
            details.AdditionalInfo["FunctionType"] = funcReader.IsDBNull(2) ? "function" : funcReader.GetString(2);
            details.AdditionalInfo["Volatility"] = funcReader.IsDBNull(3) ? "volatile" : funcReader.GetString(3);
            details.AdditionalInfo["ParallelSafety"] = funcReader.IsDBNull(4) ? "unsafe" : funcReader.GetString(4);
            details.AdditionalInfo["SecurityDefiner"] = !funcReader.IsDBNull(5) && funcReader.GetBoolean(5);
            details.AdditionalInfo["ExecutionCost"] = funcReader.IsDBNull(6) ? 0 : funcReader.GetFloat(6);
            details.AdditionalInfo["EstimatedRows"] = funcReader.IsDBNull(7) ? 0 : funcReader.GetInt32(7);
            details.AdditionalInfo["Owner"] = funcReader.IsDBNull(8) ? string.Empty : funcReader.GetString(8);
        }

        // Get function dependencies
        var depQuery = @"
            SELECT DISTINCT
                dependent.relname as dependent_object,
                dependent.relkind as dependent_type,
                dependent.nspname as dependent_schema
            FROM pg_depend d
            JOIN pg_proc func ON d.objid = func.oid
            JOIN pg_namespace func_ns ON func.pronamespace = func_ns.oid
            JOIN pg_class dependent ON d.refobjid = dependent.oid
            JOIN pg_namespace dependent_ns ON dependent.relnamespace = dependent_ns.oid
            WHERE func_ns.nspname = @schema
              AND func.proname = @functionName
              AND dependent.relkind IN ('r', 'v', 'f', 'p')
            UNION ALL
            SELECT DISTINCT
                obj.relname as dependent_object,
                obj.relkind as dependent_type,
                obj.nspname as dependent_schema
            FROM pg_depend d
            JOIN pg_proc func ON d.refobjid = func.oid
            JOIN pg_namespace func_ns ON func.pronamespace = func_ns.oid
            JOIN pg_class obj ON d.objid = obj.oid
            JOIN pg_namespace obj_ns ON obj.relnamespace = obj_ns.oid
            WHERE func_ns.nspname = @schema
              AND func.proname = @functionName
              AND obj.relkind IN ('r', 'v', 'f', 'p')";

        using var depCommand = new NpgsqlCommand(depQuery, connection);
        depCommand.Parameters.AddWithValue("@schema", details.Schema);
        depCommand.Parameters.AddWithValue("@functionName", details.Name);

        using var depReader = await depCommand.ExecuteReaderAsync(ct);
        while (await depReader.ReadAsync(ct))
        {
            var dependentObject = depReader.GetString(0);
            var dependentType = depReader.GetChar(1);
            var dependentSchema = depReader.GetString(2);

            var typeChar = char.ToLower(dependentType);
            var dependentObjectType = typeChar switch
            {
                'r' => "table",
                'v' => "view",
                'f' => "function",
                'p' => "procedure",
                _ => "unknown"
            };

            details.Dependencies.Add($"{dependentObjectType}:{dependentSchema}.{dependentObject}");
        }
    }
    /// <summary>
    /// Helper method to populate index details
    /// </summary>
    private async Task PopulateIndexDetailsAsync(NpgsqlConnection connection, DatabaseObjectDetails details, CancellationToken ct)
    {
        // Get detailed index information
        var indexQuery = @"
            SELECT
                c.relname as index_name,
                t.relname as table_name,
                n.nspname as index_schema,
                i.indisunique as is_unique,
                i.indisprimary as is_primary,
                i.indisexclusion as is_exclusion,
                i.indimmediate as is_immediate,
                i.indisclustered as is_clustered,
                i.indisvalid as is_valid,
                pg_get_indexdef(c.oid) as index_definition,
                array_to_string(i.indkey, ',') as column_positions,
                array_to_string(i.indclass, ',') as operator_classes,
                i.indnatts as number_of_columns,
                i.indnkeyatts as number_of_key_columns
            FROM pg_class c
            JOIN pg_index i ON c.oid = i.indexrelid
            JOIN pg_class t ON i.indrelid = t.oid
            JOIN pg_namespace n ON c.relnamespace = n.oid
            JOIN pg_namespace tn ON t.relnamespace = tn.oid
            WHERE n.nspname = @schema AND c.relname = @indexName";

        using var indexCommand = new NpgsqlCommand(indexQuery, connection);
        indexCommand.Parameters.AddWithValue("@schema", details.Schema);
        indexCommand.Parameters.AddWithValue("@indexName", details.Name);

        using var indexReader = await indexCommand.ExecuteReaderAsync(ct);
        if (await indexReader.ReadAsync(ct))
        {
            details.AdditionalInfo["IsUnique"] = indexReader.GetBoolean(3);
            details.AdditionalInfo["IsPrimary"] = indexReader.GetBoolean(4);
            details.AdditionalInfo["IsExclusion"] = indexReader.GetBoolean(5);
            details.AdditionalInfo["IsImmediate"] = indexReader.GetBoolean(6);
            details.AdditionalInfo["IsClustered"] = indexReader.GetBoolean(7);
            details.AdditionalInfo["IsValid"] = indexReader.GetBoolean(8);
            details.AdditionalInfo["IndexDefinition"] = indexReader.IsDBNull(9) ? string.Empty : indexReader.GetString(9);
            details.AdditionalInfo["ColumnPositions"] = indexReader.IsDBNull(10) ? string.Empty : indexReader.GetString(10);
            details.AdditionalInfo["OperatorClasses"] = indexReader.IsDBNull(11) ? string.Empty : indexReader.GetString(11);
            details.AdditionalInfo["NumberOfColumns"] = indexReader.GetInt16(12);
            details.AdditionalInfo["NumberOfKeyColumns"] = indexReader.GetInt16(13);
        }

        // Get index columns
        var columnQuery = @"
            SELECT
                a.attname as column_name,
                a.attnum as column_position,
                opc.opcname as operator_class,
                i.indoption[a.attnum-1] as column_option
            FROM pg_class c
            JOIN pg_index i ON c.oid = i.indexrelid
            JOIN pg_attribute a ON a.attrelid = i.indrelid
            LEFT JOIN pg_opclass opc ON opc.oid = i.indclass[a.attnum-1]
            JOIN pg_namespace n ON c.relnamespace = n.oid
            WHERE n.nspname = @schema AND c.relname = @indexName
              AND a.attnum = ANY(i.indkey)
            ORDER BY a.attnum";

        using var colCommand = new NpgsqlCommand(columnQuery, connection);
        colCommand.Parameters.AddWithValue("@schema", details.Schema);
        colCommand.Parameters.AddWithValue("@indexName", details.Name);

        using var colReader = await colCommand.ExecuteReaderAsync(ct);
        while (await colReader.ReadAsync(ct))
        {
            var columnName = colReader.GetString(0);
            var position = colReader.GetInt16(1);
            var operatorClass = colReader.IsDBNull(2) ? null : colReader.GetString(2);
            var options = colReader.IsDBNull(3) ? 0 : colReader.GetInt16(3);

            details.Indexes.Add(new IndexInfo
            {
                Name = details.Name,
                Columns = [columnName],
                IsUnique = details.AdditionalInfo.ContainsKey("IsUnique") && (bool)details.AdditionalInfo["IsUnique"],
                IsPrimary = details.AdditionalInfo.ContainsKey("IsPrimary") && (bool)details.AdditionalInfo["IsPrimary"],
                Type = operatorClass ?? "btree"
            });
        }
    }
    /// <summary>
    /// Helper method to populate basic details
    /// </summary>
    private async Task PopulateBasicDetailsAsync(NpgsqlConnection connection, DatabaseObjectDetails details, CancellationToken ct)
    {
        // For object types that don't have specific detail methods,
        // we can add basic metadata here

        switch (details.Type)
        {
            case ObjectType.Schema:
                {
                    // Get schema-specific information
                    var schemaQuery = @"
                    SELECT
                        n.nspname as schema_name,
                        n.nspowner::regrole as owner,
                        n.nspacl as access_privileges,
                        obj_description(n.oid) as description
                    FROM pg_namespace n
                    WHERE n.nspname = @schemaName";

                    using var schemaCommand = new NpgsqlCommand(schemaQuery, connection);
                    schemaCommand.Parameters.AddWithValue("@schemaName", details.Name);

                    using var schemaReader = await schemaCommand.ExecuteReaderAsync(ct);
                    if (await schemaReader.ReadAsync(ct))
                    {
                        details.AdditionalInfo["Owner"] = schemaReader.IsDBNull(1) ? string.Empty : schemaReader.GetString(1);
                        details.AdditionalInfo["AccessPrivileges"] = schemaReader.IsDBNull(2) ? string.Empty : schemaReader.GetString(2);
                        details.AdditionalInfo["Description"] = schemaReader.IsDBNull(3) ? string.Empty : schemaReader.GetString(3);
                    }
                    break;
                }

            case ObjectType.Sequence:
                {
                    // Get sequence-specific information
                    var sequenceQuery = @"
                    SELECT
                        c.relname as sequence_name,
                        n.nspname as sequence_schema,
                        s.seqstart as start_value,
                        s.seqincrement as increment_by,
                        s.seqmax as max_value,
                        s.seqmin as min_value,
                        s.seqcache as cache_size,
                        s.seqcycle as is_cycled,
                        c.relowner::regrole as owner
                    FROM pg_class c
                    JOIN pg_namespace n ON c.relnamespace = n.oid
                    JOIN pg_sequence s ON c.oid = s.seqrelid
                    WHERE n.nspname = @schema AND c.relname = @sequenceName";

                    using var seqCommand = new NpgsqlCommand(sequenceQuery, connection);
                    seqCommand.Parameters.AddWithValue("@schema", details.Schema);
                    seqCommand.Parameters.AddWithValue("@sequenceName", details.Name);

                    using var seqReader = await seqCommand.ExecuteReaderAsync(ct);
                    if (await seqReader.ReadAsync(ct))
                    {
                        details.AdditionalInfo["StartValue"] = seqReader.GetInt64(2);
                        details.AdditionalInfo["IncrementBy"] = seqReader.GetInt64(3);
                        details.AdditionalInfo["MaxValue"] = seqReader.GetInt64(4);
                        details.AdditionalInfo["MinValue"] = seqReader.GetInt64(5);
                        details.AdditionalInfo["CacheSize"] = seqReader.GetInt64(6);
                        details.AdditionalInfo["IsCycled"] = seqReader.GetBoolean(7);
                        details.AdditionalInfo["Owner"] = seqReader.IsDBNull(8) ? string.Empty : seqReader.GetString(8);
                    }
                    break;
                }

            case ObjectType.Type:
                {
                    // Get type-specific information
                    var typeQuery = @"
                    SELECT
                        t.typname as type_name,
                        n.nspname as type_schema,
                        t.typtype as type_type,
                        t.typlen as type_length,
                        t.typrelid as relation_id,
                        t.typelem as element_type,
                        t.typarray as array_type,
                        t.typowner::regrole as owner,
                        obj_description(t.oid) as description
                    FROM pg_type t
                    JOIN pg_namespace n ON t.typnamespace = n.oid
                    WHERE n.nspname = @schema AND t.typname = @typeName";

                    using var typeCommand = new NpgsqlCommand(typeQuery, connection);
                    typeCommand.Parameters.AddWithValue("@schema", details.Schema);
                    typeCommand.Parameters.AddWithValue("@typeName", details.Name);

                    using var typeReader = await typeCommand.ExecuteReaderAsync(ct);
                    if (await typeReader.ReadAsync(ct))
                    {
                        details.AdditionalInfo["TypeType"] = typeReader.IsDBNull(2) ? string.Empty : typeReader.GetString(2);
                        details.AdditionalInfo["TypeLength"] = typeReader.GetInt16(3);
                        details.AdditionalInfo["RelationId"] = typeReader.GetInt32(4);
                        details.AdditionalInfo["ElementType"] = typeReader.GetInt32(5);
                        details.AdditionalInfo["ArrayType"] = typeReader.GetInt32(6);
                        details.AdditionalInfo["Owner"] = typeReader.IsDBNull(7) ? string.Empty : typeReader.GetString(7);
                        details.AdditionalInfo["Description"] = typeReader.IsDBNull(8) ? string.Empty : typeReader.GetString(8);
                    }
                    break;
                }

            default:
                // For unknown object types, add a generic note
                details.AdditionalInfo["Note"] = $"Detailed information not available for object type: {details.Type}";
                break;
        }
    }

    /// <summary>
    /// Helper method to populate sequence details
    /// </summary>
    private async Task PopulateSequenceDetailsAsync(NpgsqlConnection connection, DatabaseObjectDetails details, CancellationToken ct)
    {
        var sequenceQuery = @"
            SELECT
                c.relname as sequence_name,
                n.nspname as sequence_schema,
                s.seqstart as start_value,
                s.seqincrement as increment_by,
                s.seqmax as max_value,
                s.seqmin as min_value,
                s.seqcache as cache_size,
                s.seqcycle as is_cycled,
                c.relowner::regrole as owner,
                obj_description(c.oid) as description
            FROM pg_class c
            JOIN pg_namespace n ON c.relnamespace = n.oid
            JOIN pg_sequence s ON c.oid = s.seqrelid
            WHERE n.nspname = @schema AND c.relname = @sequenceName";

        using var seqCommand = new NpgsqlCommand(sequenceQuery, connection);
        seqCommand.Parameters.AddWithValue("@schema", details.Schema);
        seqCommand.Parameters.AddWithValue("@sequenceName", details.Name);

        using var seqReader = await seqCommand.ExecuteReaderAsync(ct);
        if (await seqReader.ReadAsync(ct))
        {
            details.AdditionalInfo["StartValue"] = seqReader.GetInt64(2);
            details.AdditionalInfo["IncrementBy"] = seqReader.GetInt64(3);
            details.AdditionalInfo["MaxValue"] = seqReader.GetInt64(4);
            details.AdditionalInfo["MinValue"] = seqReader.GetInt64(5);
            details.AdditionalInfo["CacheSize"] = seqReader.GetInt64(6);
            details.AdditionalInfo["IsCycled"] = seqReader.GetBoolean(7);
            details.AdditionalInfo["Owner"] = seqReader.IsDBNull(8) ? string.Empty : seqReader.GetString(8);
            details.AdditionalInfo["Description"] = seqReader.IsDBNull(9) ? string.Empty : seqReader.GetString(9);
        }
    }

    /// <summary>
    /// Helper method to populate type details
    /// </summary>
    private async Task PopulateTypeDetailsAsync(NpgsqlConnection connection, DatabaseObjectDetails details, CancellationToken ct)
    {
        var typeQuery = @"
            SELECT
                t.typname as type_name,
                n.nspname as type_schema,
                t.typtype as type_type,
                t.typlen as type_length,
                t.typrelid as relation_id,
                t.typelem as element_type,
                t.typarray as array_type,
                t.typowner::regrole as owner,
                obj_description(t.oid) as description
            FROM pg_type t
            JOIN pg_namespace n ON t.typnamespace = n.oid
            WHERE n.nspname = @schema AND t.typname = @typeName";

        using var typeCommand = new NpgsqlCommand(typeQuery, connection);
        typeCommand.Parameters.AddWithValue("@schema", details.Schema);
        typeCommand.Parameters.AddWithValue("@typeName", details.Name);

        using var typeReader = await typeCommand.ExecuteReaderAsync(ct);
        if (await typeReader.ReadAsync(ct))
        {
            details.AdditionalInfo["TypeType"] = typeReader.IsDBNull(2) ? string.Empty : typeReader.GetString(2);
            details.AdditionalInfo["TypeLength"] = typeReader.GetInt16(3);
            details.AdditionalInfo["RelationId"] = typeReader.GetInt32(4);
            details.AdditionalInfo["ElementType"] = typeReader.GetInt32(5);
            details.AdditionalInfo["ArrayType"] = typeReader.GetInt32(6);
            details.AdditionalInfo["Owner"] = typeReader.IsDBNull(7) ? string.Empty : typeReader.GetString(7);
            details.AdditionalInfo["Description"] = typeReader.IsDBNull(8) ? string.Empty : typeReader.GetString(8);
        }
    }

    /// <summary>
    /// Helper method to populate trigger details
    /// </summary>
    private async Task PopulateTriggerDetailsAsync(NpgsqlConnection connection, DatabaseObjectDetails details, CancellationToken ct)
    {
        var triggerQuery = @"
            SELECT
                t.tgname as trigger_name,
                c.relname as table_name,
                n.nspname as trigger_schema,
                p.proname as function_name,
                fn.nspname as function_schema,
                t.tgenabled as is_enabled,
                t.tgisinternal as is_internal,
                t.tgconstraint as is_constraint,
                t.tgdeferrable as is_deferrable,
                t.tginitdeferred as is_deferred,
                t.tgnargs as number_of_arguments,
                t.tgargs as arguments,
                CASE
                    WHEN t.tgtype & 2 = 2 THEN 'BEFORE'
                    WHEN t.tgtype & 64 = 64 THEN 'INSTEAD OF'
                    ELSE 'AFTER'
                END as timing,
                CASE
                    WHEN t.tgtype & 4 = 4 THEN 'INSERT'
                    WHEN t.tgtype & 8 = 8 THEN 'DELETE'
                    WHEN t.tgtype & 16 = 16 THEN 'UPDATE'
                    WHEN t.tgtype & 32 = 32 THEN 'TRUNCATE'
                    ELSE 'UNKNOWN'
                END as event,
                obj_description(t.oid) as description
            FROM pg_trigger t
            JOIN pg_class c ON t.tgrelid = c.oid
            JOIN pg_proc p ON t.tgfoid = p.oid
            JOIN pg_namespace n ON c.relnamespace = n.oid
            JOIN pg_namespace fn ON p.pronamespace = fn.oid
            WHERE n.nspname = @schema AND t.tgname = @triggerName";

        using var triggerCommand = new NpgsqlCommand(triggerQuery, connection);
        triggerCommand.Parameters.AddWithValue("@schema", details.Schema);
        triggerCommand.Parameters.AddWithValue("@triggerName", details.Name);

        using var triggerReader = await triggerCommand.ExecuteReaderAsync(ct);
        if (await triggerReader.ReadAsync(ct))
        {
            details.AdditionalInfo["IsEnabled"] = triggerReader.GetBoolean(5);
            details.AdditionalInfo["IsInternal"] = triggerReader.GetBoolean(6);
            details.AdditionalInfo["IsConstraint"] = triggerReader.GetBoolean(7);
            details.AdditionalInfo["IsDeferrable"] = triggerReader.GetBoolean(8);
            details.AdditionalInfo["IsDeferred"] = triggerReader.GetBoolean(9);
            details.AdditionalInfo["NumberOfArguments"] = triggerReader.GetInt16(10);
            details.AdditionalInfo["Arguments"] = triggerReader.IsDBNull(11) ? string.Empty : triggerReader.GetString(11);
            details.AdditionalInfo["Timing"] = triggerReader.GetString(12);
            details.AdditionalInfo["Event"] = triggerReader.GetString(13);

            // Add trigger info to the Triggers collection
            details.Triggers.Add(new TriggerInfo
            {
                Name = triggerReader.GetString(0),
                Event = triggerReader.GetString(13),
                Timing = triggerReader.GetString(12),
                Function = $"{triggerReader.GetString(4)}.{triggerReader.GetString(3)}"
            });
        }
    }

    /// <summary>
    /// Helper method to populate constraint details
    /// </summary>
    private async Task PopulateConstraintDetailsAsync(NpgsqlConnection connection, DatabaseObjectDetails details, CancellationToken ct)
    {
        var constraintQuery = @"
            SELECT
                c.conname as constraint_name,
                t.relname as table_name,
                n.nspname as constraint_schema,
                c.contype as constraint_type,
                c.condeferrable as is_deferrable,
                c.condeferred as is_deferred,
                c.convalidated as is_validated,
                pg_get_constraintdef(c.oid) as constraint_definition,
                obj_description(c.oid) as description,
                c.conkey as column_positions,
                array_agg(a.attname ORDER BY a.attnum) as column_names
            FROM pg_constraint c
            JOIN pg_class t ON c.conrelid = t.oid
            JOIN pg_namespace n ON t.relnamespace = n.oid
            LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
            WHERE n.nspname = @schema AND c.conname = @constraintName
            GROUP BY c.conname, t.relname, n.nspname, c.contype, c.condeferrable,
                     c.condeferred, c.convalidated, c.oid, c.conkey";

        using var constraintCommand = new NpgsqlCommand(constraintQuery, connection);
        constraintCommand.Parameters.AddWithValue("@schema", details.Schema);
        constraintCommand.Parameters.AddWithValue("@constraintName", details.Name);

        using var constraintReader = await constraintCommand.ExecuteReaderAsync(ct);
        if (await constraintReader.ReadAsync(ct))
        {
            var constraintType = constraintReader.GetChar(3) switch
            {
                'p' => "PRIMARY KEY",
                'f' => "FOREIGN KEY",
                'u' => "UNIQUE",
                'c' => "CHECK",
                'x' => "EXCLUSION",
                _ => "UNKNOWN"
            };

            details.AdditionalInfo["ConstraintType"] = constraintType;
            details.AdditionalInfo["IsDeferrable"] = constraintReader.GetBoolean(4);
            details.AdditionalInfo["IsDeferred"] = constraintReader.GetBoolean(5);
            details.AdditionalInfo["IsValidated"] = constraintReader.GetBoolean(6);
            details.AdditionalInfo["ConstraintDefinition"] = constraintReader.IsDBNull(7) ? string.Empty : constraintReader.GetString(7);
            details.AdditionalInfo["ColumnPositions"] = constraintReader.IsDBNull(9) ? string.Empty : constraintReader.GetString(9);
            details.AdditionalInfo["ColumnNames"] = constraintReader.IsDBNull(10) ? string.Empty : constraintReader.GetString(10);
        }
    }

    /// <summary>
    /// Helper method to populate schema details
    /// </summary>
    private async Task PopulateSchemaDetailsAsync(NpgsqlConnection connection, DatabaseObjectDetails details, CancellationToken ct)
    {
        var schemaQuery = @"
            SELECT
                n.nspname as schema_name,
                n.nspowner::regrole as owner,
                n.nspacl as access_privileges,
                obj_description(n.oid) as description
            FROM pg_namespace n
            WHERE n.nspname = @schemaName";

        using var schemaCommand = new NpgsqlCommand(schemaQuery, connection);
        schemaCommand.Parameters.AddWithValue("@schemaName", details.Name);

        using var schemaReader = await schemaCommand.ExecuteReaderAsync(ct);
        if (await schemaReader.ReadAsync(ct))
        {
            details.AdditionalInfo["Owner"] = schemaReader.IsDBNull(1) ? string.Empty : schemaReader.GetString(1);
            details.AdditionalInfo["AccessPrivileges"] = schemaReader.IsDBNull(2) ? string.Empty : schemaReader.GetString(2);
            details.AdditionalInfo["Description"] = schemaReader.IsDBNull(3) ? string.Empty : schemaReader.GetString(3);
        }
    }

    /// <summary>
    /// Helper method to populate collation details
    /// </summary>
    private async Task PopulateCollationDetailsAsync(NpgsqlConnection connection, DatabaseObjectDetails details, CancellationToken ct)
    {
        var collationQuery = @"
            SELECT
                c.collname as collation_name,
                n.nspname as collation_schema,
                c.collowner::regrole as owner,
                c.collprovider as provider,
                c.collisdeterministic as is_deterministic,
                c.collencoding as encoding,
                c.collcollate as collate,
                c.collctype as ctype,
                obj_description(c.oid) as description
            FROM pg_collation c
            JOIN pg_namespace n ON c.collnamespace = n.oid
            WHERE n.nspname = @schema AND c.collname = @collationName";

        using var collationCommand = new NpgsqlCommand(collationQuery, connection);
        collationCommand.Parameters.AddWithValue("@schema", details.Schema);
        collationCommand.Parameters.AddWithValue("@collationName", details.Name);

        using var collationReader = await collationCommand.ExecuteReaderAsync(ct);
        if (await collationReader.ReadAsync(ct))
        {
            details.AdditionalInfo["Owner"] = collationReader.IsDBNull(2) ? string.Empty : collationReader.GetString(2);
            details.AdditionalInfo["Provider"] = collationReader.IsDBNull(3) ? string.Empty : collationReader.GetString(3);
            details.AdditionalInfo["IsDeterministic"] = collationReader.GetBoolean(4);
            details.AdditionalInfo["Encoding"] = collationReader.GetInt32(5);
            details.AdditionalInfo["Collate"] = collationReader.IsDBNull(6) ? string.Empty : collationReader.GetString(6);
            details.AdditionalInfo["CType"] = collationReader.IsDBNull(7) ? string.Empty : collationReader.GetString(7);
            details.AdditionalInfo["Description"] = collationReader.IsDBNull(8) ? string.Empty : collationReader.GetString(8);
        }
    }

    /// <summary>
    /// Helper method to populate extension details
    /// </summary>
    private async Task PopulateExtensionDetailsAsync(NpgsqlConnection connection, DatabaseObjectDetails details, CancellationToken ct)
    {
        var extensionQuery = @"
            SELECT
                e.extname as extension_name,
                e.extversion as extension_version,
                n.nspname as extension_schema,
                e.extowner::regrole as owner,
                e.extrelocatable as is_relocatable,
                e.extcondition as condition,
                obj_description(e.oid) as description
            FROM pg_extension e
            JOIN pg_namespace n ON e.extnamespace = n.oid
            WHERE n.nspname = @schema AND e.extname = @extensionName";

        using var extensionCommand = new NpgsqlCommand(extensionQuery, connection);
        extensionCommand.Parameters.AddWithValue("@schema", details.Schema);
        extensionCommand.Parameters.AddWithValue("@extensionName", details.Name);

        using var extensionReader = await extensionCommand.ExecuteReaderAsync(ct);
        if (await extensionReader.ReadAsync(ct))
        {
            details.AdditionalInfo["Version"] = extensionReader.IsDBNull(1) ? string.Empty : extensionReader.GetString(1);
            details.AdditionalInfo["Owner"] = extensionReader.IsDBNull(3) ? string.Empty : extensionReader.GetString(3);
            details.AdditionalInfo["IsRelocatable"] = extensionReader.GetBoolean(4);
            details.AdditionalInfo["Condition"] = extensionReader.IsDBNull(5) ? string.Empty : extensionReader.GetString(5);
            details.AdditionalInfo["Description"] = extensionReader.IsDBNull(6) ? string.Empty : extensionReader.GetString(6);
        }
    }

    /// <summary>
    /// Helper method to populate role details
    /// </summary>
    private async Task PopulateRoleDetailsAsync(NpgsqlConnection connection, DatabaseObjectDetails details, CancellationToken ct)
    {
        var roleQuery = @"
            SELECT
                r.rolname as role_name,
                r.rolsuper as is_superuser,
                r.rolcreaterole as can_create_role,
                r.rolcreatedb as can_create_db,
                r.rolcanlogin as can_login,
                r.rolconnlimit as connection_limit,
                r.rolvaliduntil as valid_until,
                r.rolinherit as inherit_role,
                r.rolreplication as is_replication_role,
                obj_description(r.oid) as description
            FROM pg_roles r
            WHERE r.rolname = @roleName";

        using var roleCommand = new NpgsqlCommand(roleQuery, connection);
        roleCommand.Parameters.AddWithValue("@roleName", details.Name);

        using var roleReader = await roleCommand.ExecuteReaderAsync(ct);
        if (await roleReader.ReadAsync(ct))
        {
            details.AdditionalInfo["IsSuperuser"] = roleReader.GetBoolean(1);
            details.AdditionalInfo["CanCreateRole"] = roleReader.GetBoolean(2);
            details.AdditionalInfo["CanCreateDatabase"] = roleReader.GetBoolean(3);
            details.AdditionalInfo["CanLogin"] = roleReader.GetBoolean(4);
            details.AdditionalInfo["ConnectionLimit"] = roleReader.GetInt32(5);
            details.AdditionalInfo["ValidUntil"] = roleReader.IsDBNull(6) ? string.Empty : roleReader.GetDateTime(6).ToString("O");
            details.AdditionalInfo["InheritRole"] = roleReader.GetBoolean(7);
            details.AdditionalInfo["IsReplicationRole"] = roleReader.GetBoolean(8);
            details.AdditionalInfo["Description"] = roleReader.IsDBNull(9) ? string.Empty : roleReader.GetString(9);
        }
    }

    /// <summary>
    /// Helper method to populate tablespace details
    /// </summary>
    private async Task PopulateTablespaceDetailsAsync(NpgsqlConnection connection, DatabaseObjectDetails details, CancellationToken ct)
    {
        var tablespaceQuery = @"
            SELECT
                t.spcname as tablespace_name,
                t.spcowner::regrole as owner,
                t.spclocation as location,
                t.spcacl as access_privileges,
                t.spcoptions as options,
                obj_description(t.oid) as description
            FROM pg_tablespace t
            WHERE t.spcname = @tablespaceName";

        using var tablespaceCommand = new NpgsqlCommand(tablespaceQuery, connection);
        tablespaceCommand.Parameters.AddWithValue("@tablespaceName", details.Name);

        using var tablespaceReader = await tablespaceCommand.ExecuteReaderAsync(ct);
        if (await tablespaceReader.ReadAsync(ct))
        {
            details.AdditionalInfo["Owner"] = tablespaceReader.IsDBNull(1) ? string.Empty : tablespaceReader.GetString(1);
            details.AdditionalInfo["Location"] = tablespaceReader.IsDBNull(2) ? string.Empty : tablespaceReader.GetString(2);
            details.AdditionalInfo["AccessPrivileges"] = tablespaceReader.IsDBNull(3) ? string.Empty : tablespaceReader.GetString(3);
            details.AdditionalInfo["Options"] = tablespaceReader.IsDBNull(4) ? string.Empty : tablespaceReader.GetString(4);
            details.AdditionalInfo["Description"] = tablespaceReader.IsDBNull(5) ? string.Empty : tablespaceReader.GetString(5);
        }
    }

    public void Dispose()
    {
        if (!_disposed)
        {
            _disposed = true;
            _logger.LogInformation("SchemaBrowser disposed");
        }
    }
}