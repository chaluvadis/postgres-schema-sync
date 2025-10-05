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
            using var connection = await _connectionManager.CreateConnectionAsync(connectionInfo, ct);
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
            using var connection = await _connectionManager.CreateConnectionAsync(connectionInfo, ct);
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
            using var connection = await _connectionManager.CreateConnectionAsync(connectionInfo, ct);
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
                    t.table_name,
                    t.table_schema,
                    t.table_type,
                    pg_total_relation_size(format('%I.%I', t.table_schema, t.table_name)) as size_bytes,
                    obj_description(format('%I.%I', t.table_schema, t.table_name)::regclass) as description
                FROM information_schema.tables t
                WHERE t.table_type = 'BASE TABLE'
                  AND (@schemaFilter IS NULL OR t.table_schema = @schemaFilter)
                  AND t.table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                ORDER BY t.table_schema, t.table_name";
        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);
        using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            tables.Add(new DatabaseObject
            {
                Name = reader.GetString(0),
                Schema = reader.GetString(1),
                Type = ObjectType.Table,
                Database = connection.Database,
                SizeInBytes = reader.IsDBNull(3) ? null : (long?)reader.GetInt64(3),
                Definition = reader.IsDBNull(4) ? null : reader.GetString(4),
                CreatedAt = DateTime.UtcNow // Would need to query pg_stat_user_tables for actual creation time
            });
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
                    p.proname as function_name,
                    p.pronamespace::regnamespace as function_schema,
                    pg_get_function_identity_arguments(p.oid) as arguments,
                    pg_get_functiondef(p.oid) as function_definition,
                    obj_description(p.oid) as description
                FROM pg_proc p
                JOIN pg_namespace n ON p.pronamespace = n.oid
                WHERE (@schemaFilter IS NULL OR n.nspname = @schemaFilter)
                  AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                ORDER BY n.nspname, p.proname";
        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);
        using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            functions.Add(new DatabaseObject
            {
                Name = reader.GetString(0),
                Schema = reader.GetString(1),
                Type = ObjectType.Function,
                Database = connection.Database,
                Definition = reader.IsDBNull(3) ? null : reader.GetString(3),
                CreatedAt = DateTime.UtcNow
            });
        }
        return functions;
    }

    private async Task<List<DatabaseObject>> GetProceduresAsync(NpgsqlConnection connection, string? schemaFilter, CancellationToken ct)
        => await GetFunctionsAsync(connection, schemaFilter, ct);

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
                    obj_description(t.oid) as description
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
            triggers.Add(new DatabaseObject
            {
                Name = reader.GetString(0),
                Schema = reader.GetString(2),
                Type = ObjectType.Trigger,
                Database = connection.Database,
                Definition = reader.IsDBNull(3) ? null : reader.GetString(3),
                CreatedAt = DateTime.UtcNow
            });
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
    public void Dispose()
    {
        if (!_disposed)
        {
            _disposed = true;
            _logger.LogInformation("SchemaBrowser disposed");
        }
    }
}