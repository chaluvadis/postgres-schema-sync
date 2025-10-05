namespace PostgreSqlSchemaCompareSync.Core.Comparison.Metadata;

/// <summary>
/// Implementation of schema metadata extraction
/// </summary>
public class SchemaMetadataExtractor(
    ILogger<SchemaMetadataExtractor> logger,
    IOptions<AppSettings> settings,
    IConnectionManager connectionManager) : ISchemaMetadataExtractor
{
    private readonly ILogger<SchemaMetadataExtractor> _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    private readonly AppSettings _settings = settings?.Value ?? throw new ArgumentNullException(nameof(settings));
    private readonly IConnectionManager _connectionManager = connectionManager ?? throw new ArgumentNullException(nameof(connectionManager));
    private bool _disposed;

    /// <summary>
    /// Extracts comprehensive metadata for database objects
    /// </summary>
    public async Task<List<DatabaseObject>> ExtractMetadataAsync(
        ConnectionInfo connectionInfo,
        List<ObjectType>? objectTypes = null,
        string? schemaFilter = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(connectionInfo);

        var objects = new List<DatabaseObject>();
        var extractionTasks = new List<Task<List<DatabaseObject>>>();

        try
        {
            _logger.LogDebug("Extracting metadata for {Database} with schema filter: {SchemaFilter}",
                connectionInfo.Database, schemaFilter ?? "all schemas");

            using var connection = await _connectionManager.CreateConnectionAsync(connectionInfo, cancellationToken);

            // Extract different types of objects in parallel where possible
            if (objectTypes == null || objectTypes.Contains(ObjectType.Table))
            {
                extractionTasks.Add(ExtractTableMetadataAsync(connection, schemaFilter, cancellationToken));
            }

            if (objectTypes == null || objectTypes.Contains(ObjectType.View))
            {
                extractionTasks.Add(ExtractViewMetadataAsync(connection, schemaFilter, cancellationToken));
            }

            if (objectTypes == null || objectTypes.Contains(ObjectType.Function))
            {
                extractionTasks.Add(ExtractFunctionMetadataAsync(connection, schemaFilter, cancellationToken));
            }

            if (objectTypes == null || objectTypes.Contains(ObjectType.Sequence))
            {
                extractionTasks.Add(ExtractSequenceMetadataAsync(connection, schemaFilter, cancellationToken));
            }

            if (objectTypes == null || objectTypes.Contains(ObjectType.Index))
            {
                extractionTasks.Add(ExtractIndexMetadataAsync(connection, schemaFilter, cancellationToken));
            }

            if (objectTypes == null || objectTypes.Contains(ObjectType.Trigger))
            {
                extractionTasks.Add(ExtractTriggerMetadataAsync(connection, schemaFilter, cancellationToken));
            }

            if (objectTypes == null || objectTypes.Contains(ObjectType.Type))
            {
                extractionTasks.Add(ExtractTypeMetadataAsync(connection, schemaFilter, cancellationToken));
            }

            if (objectTypes == null || objectTypes.Contains(ObjectType.Constraint))
            {
                extractionTasks.Add(ExtractConstraintMetadataAsync(connection, schemaFilter, cancellationToken));
            }

            if (objectTypes == null || objectTypes.Contains(ObjectType.Procedure))
            {
                extractionTasks.Add(ExtractProcedureMetadataAsync(connection, schemaFilter, cancellationToken));
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
    /// Extracts metadata for a specific object
    /// </summary>
    public async Task<DatabaseObjectDetails> ExtractObjectMetadataAsync(
        ConnectionInfo connectionInfo,
        ObjectType objectType,
        string schema,
        string objectName,
        CancellationToken cancellationToken = default)
    {
        if (connectionInfo == null)
            throw new ArgumentNullException(nameof(connectionInfo));

        try
        {
            _logger.LogDebug("Extracting detailed metadata for {ObjectType} {Schema}.{ObjectName}",
                objectType, schema, objectName);

            using var connection = await _connectionManager.CreateConnectionAsync(connectionInfo, cancellationToken);

            var details = new DatabaseObjectDetails
            {
                Name = objectName,
                Type = objectType,
                Schema = schema,
                Database = connectionInfo.Database,
                CreatedAt = DateTime.UtcNow
            };

            // Extract object-specific metadata
            switch (objectType)
            {
                case ObjectType.Table:
                    await ExtractTableDetailsAsync(connection, details, cancellationToken);
                    break;
                case ObjectType.View:
                    await ExtractViewDetailsAsync(connection, details, cancellationToken);
                    break;
                case ObjectType.Function:
                    await ExtractFunctionDetailsAsync(connection, details, cancellationToken);
                    break;
                case ObjectType.Index:
                    await ExtractIndexDetailsAsync(connection, details, cancellationToken);
                    break;
                case ObjectType.Trigger:
                    await ExtractTriggerDetailsAsync(connection, details, cancellationToken);
                    break;
                default:
                    await ExtractBasicDetailsAsync(connection, details, cancellationToken);
                    break;
            }

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
    /// Extracts dependency information for objects
    /// </summary>
    public async Task<Dictionary<string, List<string>>> ExtractDependenciesAsync(
        ConnectionInfo connectionInfo,
        List<DatabaseObject> objects,
        CancellationToken cancellationToken = default)
    {
        if (connectionInfo == null)
            throw new ArgumentNullException(nameof(connectionInfo));
        if (objects == null)
            throw new ArgumentNullException(nameof(objects));

        var dependencies = new Dictionary<string, List<string>>();

        try
        {
            _logger.LogDebug("Extracting dependencies for {ObjectCount} objects from {Database}",
                objects.Count, connectionInfo.Database);

            using var connection = await _connectionManager.CreateConnectionAsync(connectionInfo, cancellationToken);

            foreach (var obj in objects)
            {
                cancellationToken.ThrowIfCancellationRequested();

                var objectKey = $"{obj.Type}:{obj.Schema}.{obj.Name}";
                var objectDependencies = await ExtractObjectDependenciesAsync(connection, obj, cancellationToken);

                if (objectDependencies.Count != 0)
                {
                    dependencies[objectKey] = objectDependencies;
                }
            }

            _logger.LogInformation("Extracted dependencies for {ObjectCount} objects from {Database}",
                objects.Count, connectionInfo.Database);

            return dependencies;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to extract dependencies from {Database}", connectionInfo.Database);
            throw new SchemaException($"Failed to extract dependencies: {ex.Message}", connectionInfo.Id, ex);
        }
    }

    /// <summary>
    /// Validates object integrity and consistency
    /// </summary>
    public async Task<ObjectValidationResult> ValidateObjectAsync(
        ConnectionInfo connectionInfo,
        DatabaseObject databaseObject,
        CancellationToken cancellationToken = default)
    {
        if (connectionInfo == null)
            throw new ArgumentNullException(nameof(connectionInfo));
        if (databaseObject == null)
            throw new ArgumentNullException(nameof(databaseObject));

        var result = new ObjectValidationResult
        {
            IsValid = true,
            Errors = [],
            Warnings = [],
            Metadata = []
        };

        try
        {
            _logger.LogDebug("Validating {ObjectType} {Schema}.{ObjectName}",
                databaseObject.Type, databaseObject.Schema, databaseObject.Name);

            using var connection = await _connectionManager.CreateConnectionAsync(connectionInfo, cancellationToken);

            // Basic validation
            if (string.IsNullOrEmpty(databaseObject.Name))
            {
                result.IsValid = false;
                result.Errors.Add("Object name is required");
            }

            if (string.IsNullOrEmpty(databaseObject.Schema))
            {
                result.Warnings.Add("Object schema not specified");
            }

            // Object-specific validation
            switch (databaseObject.Type)
            {
                case ObjectType.Table:
                    await ValidateTableAsync(connection, databaseObject, result, cancellationToken);
                    break;
                case ObjectType.View:
                    await ValidateViewAsync(connection, databaseObject, result, cancellationToken);
                    break;
                case ObjectType.Function:
                    await ValidateFunctionAsync(connection, databaseObject, result, cancellationToken);
                    break;
                case ObjectType.Index:
                    await ValidateIndexAsync(connection, databaseObject, result, cancellationToken);
                    break;
            }

            result.Metadata["ValidationDate"] = DateTime.UtcNow;
            result.Metadata["ObjectType"] = databaseObject.Type.ToString();

            _logger.LogDebug("Validation completed for {ObjectType} {Schema}.{ObjectName}: Valid={IsValid}",
                databaseObject.Type, databaseObject.Schema, databaseObject.Name, result.IsValid);

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to validate {ObjectType} {Schema}.{ObjectName}",
                databaseObject.Type, databaseObject.Schema, databaseObject.Name);

            result.IsValid = false;
            result.Errors.Add($"Validation error: {ex.Message}");
            return result;
        }
    }

    /// <summary>
    /// Extracts table metadata
    /// </summary>
    private async Task<List<DatabaseObject>> ExtractTableMetadataAsync(
        NpgsqlConnection connection,
        string? schemaFilter,
        CancellationToken cancellationToken)
    {
        var tables = new List<DatabaseObject>();

        var query = @"
                SELECT
                    t.table_name,
                    t.table_schema,
                    t.table_type,
                    pg_total_relation_size(format('%I.%I', t.table_schema, t.table_name)) as size_bytes,
                    obj_description(format('%I.%I', t.table_schema, t.table_name)::regclass) as description,
                    t.table_owner,
                    c.relcreated as creation_date
                FROM information_schema.tables t
                JOIN pg_class c ON c.relname = t.table_name
                JOIN pg_namespace n ON c.relnamespace = n.oid AND n.nspname = t.table_schema
                WHERE t.table_type = 'BASE TABLE'
                  AND (@schemaFilter IS NULL OR t.table_schema = @schemaFilter)
                  AND t.table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                ORDER BY t.table_schema, t.table_name";

        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

        using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            tables.Add(new DatabaseObject
            {
                Name = reader.GetString(0),
                Schema = reader.GetString(1),
                Type = ObjectType.Table,
                Database = connection.Database,
                SizeInBytes = reader.IsDBNull(3) ? null : (long?)reader.GetInt64(3),
                Definition = reader.IsDBNull(4) ? string.Empty : reader.GetString(4),
                Owner = reader.IsDBNull(5) ? string.Empty : reader.GetString(5),
                CreatedAt = reader.IsDBNull(6) ? DateTime.UtcNow : reader.GetDateTime(6)
            });
        }

        return tables;
    }

    /// <summary>
    /// Extracts view metadata
    /// </summary>
    private async Task<List<DatabaseObject>> ExtractViewMetadataAsync(
        NpgsqlConnection connection,
        string? schemaFilter,
        CancellationToken cancellationToken)
    {
        var views = new List<DatabaseObject>();

        var query = @"
                SELECT
                    v.table_name,
                    v.table_schema,
                    v.view_definition,
                    obj_description(format('%I.%I', v.table_schema, v.table_name)::regclass) as description,
                    v.table_owner
                FROM information_schema.views v
                WHERE (@schemaFilter IS NULL OR v.table_schema = @schemaFilter)
                  AND v.table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                ORDER BY v.table_schema, v.table_name";

        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

        using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            views.Add(new DatabaseObject
            {
                Name = reader.GetString(0),
                Schema = reader.GetString(1),
                Type = ObjectType.View,
                Database = connection.Database,
                Definition = reader.IsDBNull(2) ? string.Empty : reader.GetString(2),
                Owner = reader.IsDBNull(3) ? string.Empty : reader.GetString(3),
                CreatedAt = DateTime.UtcNow
            });
        }

        return views;
    }

    /// <summary>
    /// Extracts function metadata
    /// </summary>
    private async Task<List<DatabaseObject>> ExtractFunctionMetadataAsync(
        NpgsqlConnection connection,
        string? schemaFilter,
        CancellationToken cancellationToken)
    {
        var functions = new List<DatabaseObject>();

        var query = @"
                SELECT
                    p.proname as function_name,
                    p.pronamespace::regnamespace as function_schema,
                    pg_get_function_identity_arguments(p.oid) as arguments,
                    pg_get_functiondef(p.oid) as function_definition,
                    obj_description(p.oid) as description,
                    p.proowner::regrole as owner
                FROM pg_proc p
                JOIN pg_namespace n ON p.pronamespace = n.oid
                WHERE (@schemaFilter IS NULL OR n.nspname = @schemaFilter)
                  AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                ORDER BY n.nspname, p.proname";

        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

        using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            functions.Add(new DatabaseObject
            {
                Name = reader.GetString(0),
                Schema = reader.GetString(1),
                Type = ObjectType.Function,
                Database = connection.Database,
                Definition = reader.IsDBNull(3) ? string.Empty : reader.GetString(3),
                Owner = reader.IsDBNull(5) ? string.Empty : reader.GetString(5),
                CreatedAt = DateTime.UtcNow
            });
        }

        return functions;
    }

    /// <summary>
    /// Extracts sequence metadata
    /// </summary>
    private async Task<List<DatabaseObject>> ExtractSequenceMetadataAsync(
        NpgsqlConnection connection,
        string? schemaFilter,
        CancellationToken cancellationToken)
    {
        var sequences = new List<DatabaseObject>();

        var query = @"
                SELECT
                    c.relname as sequence_name,
                    n.nspname as sequence_schema,
                    obj_description(format('%I.%I', n.nspname, c.relname)::regclass) as description,
                    c.relowner::regrole as owner
                FROM pg_class c
                JOIN pg_namespace n ON c.relnamespace = n.oid
                WHERE c.relkind = 'S'
                  AND (@schemaFilter IS NULL OR n.nspname = @schemaFilter)
                  AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                ORDER BY n.nspname, c.relname";

        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

        using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            sequences.Add(new DatabaseObject
            {
                Name = reader.GetString(0),
                Schema = reader.GetString(1),
                Type = ObjectType.Sequence,
                Database = connection.Database,
                Definition = reader.IsDBNull(2) ? string.Empty : reader.GetString(2),
                Owner = reader.IsDBNull(3) ? string.Empty : reader.GetString(3),
                CreatedAt = DateTime.UtcNow
            });
        }

        return sequences;
    }

    /// <summary>
    /// Extracts index metadata
    /// </summary>
    private async Task<List<DatabaseObject>> ExtractIndexMetadataAsync(
        NpgsqlConnection connection,
        string? schemaFilter,
        CancellationToken cancellationToken)
    {
        var indexes = new List<DatabaseObject>();

        var query = @"
                SELECT
                    c.relname as index_name,
                    t.relname as table_name,
                    n.nspname as index_schema,
                    obj_description(format('%I.%I', n.nspname, c.relname)::regclass) as description,
                    c.relowner::regrole as owner
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

        using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            indexes.Add(new DatabaseObject
            {
                Name = reader.GetString(0),
                Schema = reader.GetString(2),
                Type = ObjectType.Index,
                Database = connection.Database,
                Definition = reader.IsDBNull(3) ? string.Empty : reader.GetString(3),
                Owner = reader.IsDBNull(4) ? string.Empty : reader.GetString(4),
                CreatedAt = DateTime.UtcNow
            });
        }

        return indexes;
    }

    /// <summary>
    /// Extracts trigger metadata
    /// </summary>
    private async Task<List<DatabaseObject>> ExtractTriggerMetadataAsync(
        NpgsqlConnection connection,
        string? schemaFilter,
        CancellationToken cancellationToken)
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

        using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            triggers.Add(new DatabaseObject
            {
                Name = reader.GetString(0),
                Schema = reader.GetString(2),
                Type = ObjectType.Trigger,
                Database = connection.Database,
                Definition = reader.IsDBNull(3) ? string.Empty : reader.GetString(3),
                CreatedAt = DateTime.UtcNow
            });
        }

        return triggers;
    }

    /// <summary>
    /// Extracts type metadata
    /// </summary>
    private async Task<List<DatabaseObject>> ExtractTypeMetadataAsync(
        NpgsqlConnection connection,
        string? schemaFilter,
        CancellationToken cancellationToken)
    {
        var types = new List<DatabaseObject>();

        var query = @"
                SELECT
                    t.typname as type_name,
                    n.nspname as type_schema,
                    obj_description(t.oid) as description,
                    t.typowner::regrole as owner
                FROM pg_type t
                JOIN pg_namespace n ON t.typnamespace = n.oid
                WHERE (@schemaFilter IS NULL OR n.nspname = @schemaFilter)
                  AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                  AND t.typtype IN ('c', 'd', 'e') -- composite, domain, enum
                ORDER BY n.nspname, t.typname";

        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

        using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            types.Add(new DatabaseObject
            {
                Name = reader.GetString(0),
                Schema = reader.GetString(1),
                Type = ObjectType.Type,
                Database = connection.Database,
                Definition = reader.IsDBNull(2) ? string.Empty : reader.GetString(2),
                Owner = reader.IsDBNull(3) ? string.Empty : reader.GetString(3),
                CreatedAt = DateTime.UtcNow
            });
        }

        return types;
    }

    /// <summary>
    /// Extracts constraint metadata
    /// </summary>
    private async Task<List<DatabaseObject>> ExtractConstraintMetadataAsync(
        NpgsqlConnection connection,
        string? schemaFilter,
        CancellationToken cancellationToken)
    {
        var constraints = new List<DatabaseObject>();

        var query = @"
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
            WHERE (@schemaFilter IS NULL OR n.nspname = @schemaFilter)
              AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
            GROUP BY c.conname, t.relname, n.nspname, c.contype, c.condeferrable,
                     c.condeferred, c.convalidated, c.oid, c.conkey
            ORDER BY n.nspname, t.relname, c.conname";

        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

        using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var constraintType = reader.GetChar(3) switch
            {
                'p' => "PRIMARY KEY",
                'f' => "FOREIGN KEY",
                'u' => "UNIQUE",
                'c' => "CHECK",
                'x' => "EXCLUSION",
                _ => "UNKNOWN"
            };

            constraints.Add(new DatabaseObject
            {
                Name = reader.GetString(0),
                Schema = reader.GetString(2),
                Type = ObjectType.Constraint,
                Database = connection.Database,
                Definition = reader.IsDBNull(7) ? string.Empty : reader.GetString(7),
                Owner = string.Empty, // Constraints don't have owners in the same way
                CreatedAt = DateTime.UtcNow // Would need pg_stat_user_tables for actual creation time
            });
        }

        return constraints;
    }

    /// <summary>
    /// Extracts procedure metadata
    /// </summary>
    private async Task<List<DatabaseObject>> ExtractProcedureMetadataAsync(
        NpgsqlConnection connection,
        string? schemaFilter,
        CancellationToken cancellationToken)
    {
        var procedures = new List<DatabaseObject>();

        var query = @"
            SELECT
                p.proname as procedure_name,
                p.pronamespace::regnamespace as procedure_schema,
                pg_get_function_identity_arguments(p.oid) as arguments,
                pg_get_functiondef(p.oid) as procedure_definition,
                obj_description(p.oid) as description,
                p.proowner::regrole as owner,
                p.prokind as procedure_kind
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE p.prokind = 'p'
              AND (@schemaFilter IS NULL OR n.nspname = @schemaFilter)
              AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
            ORDER BY n.nspname, p.proname";

        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

        using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            procedures.Add(new DatabaseObject
            {
                Name = reader.GetString(0),
                Schema = reader.GetString(1),
                Type = ObjectType.Procedure,
                Database = connection.Database,
                Definition = reader.IsDBNull(3) ? string.Empty : reader.GetString(3),
                Owner = reader.IsDBNull(5) ? string.Empty : reader.GetString(5),
                CreatedAt = DateTime.UtcNow
            });
        }

        return procedures;
    }

    /// <summary>
    /// Extracts detailed table information
    /// </summary>
    private async Task ExtractTableDetailsAsync(
        NpgsqlConnection connection,
        DatabaseObjectDetails details,
        CancellationToken cancellationToken)
    {
        // Get columns with enhanced information
        var columnQuery = @"
            SELECT
                c.column_name,
                c.data_type,
                c.is_nullable,
                c.column_default,
                c.character_maximum_length,
                c.numeric_precision,
                c.numeric_scale,
                c.ordinal_position,
                CASE WHEN pk.column_name IS NOT NULL THEN 'PRIMARY KEY' ELSE '' END as column_key,
                c.domain_name,
                c.is_generated,
                c.generation_expression,
                c.is_identity,
                c.identity_start,
                c.identity_increment,
                c.identity_maximum,
                c.identity_minimum,
                c.identity_cycle,
                col_description(format('%I.%I', @schema, @tableName)::regclass, c.ordinal_position) as column_comment
            FROM information_schema.columns c
            LEFT JOIN information_schema.key_column_usage kcu ON kcu.column_name = c.column_name
                AND kcu.table_name = c.table_name AND kcu.table_schema = c.table_schema
            LEFT JOIN information_schema.table_constraints pk ON pk.constraint_name = kcu.constraint_name
                AND pk.table_name = kcu.table_name AND pk.table_schema = kcu.table_schema
                AND pk.constraint_type = 'PRIMARY KEY'
            WHERE c.table_schema = @schema AND c.table_name = @tableName
            ORDER BY c.ordinal_position";

        using var columnCommand = new NpgsqlCommand(columnQuery, connection);
        columnCommand.Parameters.AddWithValue("@schema", details.Schema);
        columnCommand.Parameters.AddWithValue("@tableName", details.Name);

        using var columnReader = await columnCommand.ExecuteReaderAsync(cancellationToken);
        while (await columnReader.ReadAsync(cancellationToken))
        {
            var columnKey = columnReader.IsDBNull(8) ? "" : columnReader.GetString(8);

            details.Columns.Add(new ColumnInfo
            {
                Name = columnReader.GetString(0),
                DataType = columnReader.GetString(1),
                IsNullable = columnReader.GetString(2) == "YES",
                DefaultValue = columnReader.IsDBNull(3) ? null : columnReader.GetString(3),
                MaxLength = columnReader.IsDBNull(4) ? null : (int?)columnReader.GetInt32(4),
                Precision = columnReader.IsDBNull(5) ? null : (int?)columnReader.GetInt32(5),
                Scale = columnReader.IsDBNull(6) ? null : (int?)columnReader.GetInt32(6),
                IsPrimaryKey = columnKey.Contains("PRIMARY KEY"),
                IsForeignKey = false, // Would need additional query to determine
                References = null // Would need additional query to determine
            });

            // Add column-specific metadata
            var columnName = columnReader.GetString(0);
            details.AdditionalInfo[$"Column_{columnName}_Position"] = columnReader.GetInt32(7);
            details.AdditionalInfo[$"Column_{columnName}_Domain"] = columnReader.IsDBNull(9) ? string.Empty : columnReader.GetString(9);
            details.AdditionalInfo[$"Column_{columnName}_IsGenerated"] = columnReader.IsDBNull(10) ? false : columnReader.GetString(10) == "ALWAYS";
            details.AdditionalInfo[$"Column_{columnName}_GenerationExpression"] = columnReader.IsDBNull(11) ? string.Empty : columnReader.GetString(11);
            details.AdditionalInfo[$"Column_{columnName}_IsIdentity"] = columnReader.IsDBNull(12) ? false : columnReader.GetString(12) == "YES";
            details.AdditionalInfo[$"Column_{columnName}_Comment"] = columnReader.IsDBNull(18) ? string.Empty : columnReader.GetString(18);
        }
    }

    /// <summary>
    /// Extracts detailed view information
    /// </summary>
    private async Task ExtractViewDetailsAsync(
        NpgsqlConnection connection,
        DatabaseObjectDetails details,
        CancellationToken cancellationToken)
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

            using var columnReader = await columnCommand.ExecuteReaderAsync(cancellationToken);
            while (await columnReader.ReadAsync(cancellationToken))
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

        using var depReader = await depCommand.ExecuteReaderAsync(cancellationToken);
        while (await depReader.ReadAsync(cancellationToken))
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
    /// Extracts detailed function information
    /// </summary>
    private async Task ExtractFunctionDetailsAsync(
        NpgsqlConnection connection,
        DatabaseObjectDetails details,
        CancellationToken cancellationToken)
    {
        // Get function parameters
        var paramQuery = @"
            SELECT
                p.proname as function_name,
                pg_get_function_identity_arguments(p.oid) as arguments,
                p.prokind as function_type,
                p.provolatile as volatility,
                p.proparallel as parallel_safety,
                p.prosecdef as security_definer,
                p.procost as execution_cost,
                p.prorows as estimated_rows,
                obj_description(p.oid) as description
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = @schema AND p.proname = @functionName";

        using var paramCommand = new NpgsqlCommand(paramQuery, connection);
        paramCommand.Parameters.AddWithValue("@schema", details.Schema);
        paramCommand.Parameters.AddWithValue("@functionName", details.Name);

        using var paramReader = await paramCommand.ExecuteReaderAsync(cancellationToken);
        if (await paramReader.ReadAsync(cancellationToken))
        {
            details.AdditionalInfo["FunctionType"] = paramReader.IsDBNull(2) ? "function" : paramReader.GetString(2);
            details.AdditionalInfo["Volatility"] = paramReader.IsDBNull(3) ? "volatile" : paramReader.GetString(3);
            details.AdditionalInfo["ParallelSafety"] = paramReader.IsDBNull(4) ? "unsafe" : paramReader.GetString(4);
            details.AdditionalInfo["SecurityDefiner"] = !paramReader.IsDBNull(5) && paramReader.GetBoolean(5);
            details.AdditionalInfo["ExecutionCost"] = paramReader.IsDBNull(6) ? 0 : paramReader.GetFloat(6);
            details.AdditionalInfo["EstimatedRows"] = paramReader.IsDBNull(7) ? 0 : paramReader.GetInt32(7);
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

        using var funcDepCommand = new NpgsqlCommand(depQuery, connection);
        funcDepCommand.Parameters.AddWithValue("@schema", details.Schema);
        funcDepCommand.Parameters.AddWithValue("@functionName", details.Name);

        using var funcDepReader = await funcDepCommand.ExecuteReaderAsync(cancellationToken);
        while (await funcDepReader.ReadAsync(cancellationToken))
        {
            var dependentObject = funcDepReader.GetString(0);
            var dependentType = funcDepReader.GetChar(1);
            var dependentSchema = funcDepReader.GetString(2);

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
    /// Extracts detailed index information
    /// </summary>
    private async Task ExtractIndexDetailsAsync(
        NpgsqlConnection connection,
        DatabaseObjectDetails details,
        CancellationToken cancellationToken)
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

        using var indexReader = await indexCommand.ExecuteReaderAsync(cancellationToken);
        if (await indexReader.ReadAsync(cancellationToken))
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

        using var colReader = await colCommand.ExecuteReaderAsync(cancellationToken);
        while (await colReader.ReadAsync(cancellationToken))
        {
            var columnName = colReader.GetString(0);
            var position = colReader.GetInt16(1);
            var operatorClass = colReader.IsDBNull(2) ? null : colReader.GetString(2);
            var options = colReader.IsDBNull(3) ? 0 : colReader.GetInt16(3);

            details.Indexes.Add(new IndexInfo
            {
                Name = details.Name,
                Columns = new List<string> { columnName },
                IsUnique = details.AdditionalInfo.ContainsKey("IsUnique") && (bool)details.AdditionalInfo["IsUnique"],
                IsPrimary = details.AdditionalInfo.ContainsKey("IsPrimary") && (bool)details.AdditionalInfo["IsPrimary"],
                Type = operatorClass ?? "btree"
            });
        }
    }

    /// <summary>
    /// Extracts detailed trigger information
    /// </summary>
    private async Task ExtractTriggerDetailsAsync(
        NpgsqlConnection connection,
        DatabaseObjectDetails details,
        CancellationToken cancellationToken)
    {
        // Get detailed trigger information
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

        using var triggerReader = await triggerCommand.ExecuteReaderAsync(cancellationToken);
        if (await triggerReader.ReadAsync(cancellationToken))
        {
            details.AdditionalInfo["IsEnabled"] = triggerReader.GetBoolean(4);
            details.AdditionalInfo["IsInternal"] = triggerReader.GetBoolean(5);
            details.AdditionalInfo["IsConstraint"] = triggerReader.GetBoolean(6);
            details.AdditionalInfo["IsDeferrable"] = triggerReader.GetBoolean(7);
            details.AdditionalInfo["IsDeferred"] = triggerReader.GetBoolean(8);
            details.AdditionalInfo["NumberOfArguments"] = triggerReader.GetInt16(9);
            details.AdditionalInfo["Arguments"] = triggerReader.IsDBNull(10) ? string.Empty : triggerReader.GetString(10);
            details.AdditionalInfo["Timing"] = triggerReader.GetString(11);
            details.AdditionalInfo["Event"] = triggerReader.GetString(12);

            // Add trigger info to the Triggers collection
            details.Triggers.Add(new TriggerInfo
            {
                Name = triggerReader.GetString(0),
                Event = triggerReader.GetString(12),
                Timing = triggerReader.GetString(11),
                Function = $"{triggerReader.GetString(14)}.{triggerReader.GetString(3)}"
            });
        }
    }

    /// <summary>
    /// Extracts basic object details
    /// </summary>
    private Task ExtractBasicDetailsAsync(
        NpgsqlConnection connection,
        DatabaseObjectDetails details,
        CancellationToken cancellationToken)
    {
        // Basic details are already populated
        return Task.CompletedTask;
    }

    /// <summary>
    /// Extracts dependencies for a specific object
    /// </summary>
    private async Task<List<string>> ExtractObjectDependenciesAsync(
        NpgsqlConnection connection,
        DatabaseObject obj,
        CancellationToken cancellationToken)
    {
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
        command.Parameters.AddWithValue("@schema", obj.Schema);
        command.Parameters.AddWithValue("@objectName", obj.Name);

        using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
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

            dependencies.Add($"{dependentObjectType}:{dependentSchema}.{dependentObject}");
        }

        return dependencies;
    }

    /// <summary>
    /// Validates table objects
    /// </summary>
    private async Task ValidateTableAsync(
        NpgsqlConnection connection,
        DatabaseObject table,
        ObjectValidationResult result,
        CancellationToken cancellationToken)
    {
        // Check if table exists and is accessible
        var query = @"
            SELECT COUNT(*)
            FROM information_schema.tables t
            JOIN pg_class c ON c.relname = t.table_name
            JOIN pg_namespace n ON c.relnamespace = n.oid AND n.nspname = t.table_schema
            WHERE t.table_schema = @schema AND t.table_name = @tableName";

        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schema", table.Schema);
        command.Parameters.AddWithValue("@tableName", table.Name);

        var countResult = await command.ExecuteScalarAsync(cancellationToken);
        var count = countResult != null ? (long)countResult : 0;

        if (count == 0)
        {
            result.IsValid = false;
            result.Errors.Add("Table does not exist or is not accessible");
        }
        else
        {
            result.Metadata["TableExists"] = true;

            // Check for additional table issues
            var advancedQuery = @"
                SELECT
                    c.relhasindex as has_indexes,
                    c.relhasrules as has_rules,
                    c.relhastriggers as has_triggers,
                    c.relhassubclass as has_subclass,
                    CASE WHEN c.relkind = 'r' THEN 'regular table'
                         WHEN c.relkind = 'v' THEN 'view'
                         WHEN c.relkind = 'f' THEN 'foreign table'
                         ELSE 'other' END as table_kind,
                    pg_total_relation_size(c.oid) as size_bytes,
                    c.reltuples as estimated_rows
                FROM pg_class c
                JOIN pg_namespace n ON c.relnamespace = n.oid
                WHERE n.nspname = @schema AND c.relname = @tableName";

            using var advCommand = new NpgsqlCommand(advancedQuery, connection);
            advCommand.Parameters.AddWithValue("@schema", table.Schema);
            advCommand.Parameters.AddWithValue("@tableName", table.Name);

            using var advReader = await advCommand.ExecuteReaderAsync(cancellationToken);
            if (await advReader.ReadAsync(cancellationToken))
            {
                result.Metadata["HasIndexes"] = advReader.GetBoolean(0);
                result.Metadata["HasRules"] = advReader.GetBoolean(1);
                result.Metadata["HasTriggers"] = advReader.GetBoolean(2);
                result.Metadata["HasSubclass"] = advReader.GetBoolean(3);
                result.Metadata["TableKind"] = advReader.GetString(4);
                result.Metadata["SizeBytes"] = advReader.GetInt64(5);
                result.Metadata["EstimatedRows"] = advReader.GetFloat(6);

                // Add warnings for potential issues
                if (!advReader.GetBoolean(0))
                    result.Warnings.Add("Table has no indexes - may impact query performance");

                if (advReader.GetBoolean(3))
                    result.Warnings.Add("Table has subclasses - inheritance may affect operations");
            }

            // Check for column consistency
            var columnQuery = @"
                SELECT COUNT(*) FROM information_schema.columns
                WHERE table_schema = @schema AND table_name = @tableName";

            using var colCommand = new NpgsqlCommand(columnQuery, connection);
            colCommand.Parameters.AddWithValue("@schema", table.Schema);
            colCommand.Parameters.AddWithValue("@tableName", table.Name);

            var columnCountResult = await colCommand.ExecuteScalarAsync(cancellationToken);
            var columnCount = columnCountResult != null ? (long)columnCountResult : 0;
            result.Metadata["ColumnCount"] = columnCount;

            if (columnCount == 0)
            {
                result.Warnings.Add("Table has no columns defined");
            }
        }
    }

    /// <summary>
    /// Validates view objects
    /// </summary>
    private async Task ValidateViewAsync(
        NpgsqlConnection connection,
        DatabaseObject view,
        ObjectValidationResult result,
        CancellationToken cancellationToken)
    {
        // Check if view exists and is accessible
        var query = "SELECT COUNT(*) FROM information_schema.views WHERE table_schema = @schema AND table_name = @viewName";

        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schema", view.Schema);
        command.Parameters.AddWithValue("@viewName", view.Name);

        var countResult = await command.ExecuteScalarAsync(cancellationToken);
        var count = countResult != null ? (long)countResult : 0;

        if (count == 0)
        {
            result.IsValid = false;
            result.Errors.Add("View does not exist or is not accessible");
        }
        else
        {
            result.Metadata["ViewExists"] = true;
        }
    }

    /// <summary>
    /// Validates function objects
    /// </summary>
    private async Task ValidateFunctionAsync(
        NpgsqlConnection connection,
        DatabaseObject function,
        ObjectValidationResult result,
        CancellationToken cancellationToken)
    {
        // Check if function exists and get detailed information
        var query = @"
            SELECT
                COUNT(*) as function_count,
                p.prokind as function_kind,
                p.provolatile as volatility,
                p.proparallel as parallel_safety,
                p.prosecdef as security_definer,
                p.procost as execution_cost,
                p.prorows as estimated_rows,
                p.proowner::regrole as owner,
                obj_description(p.oid) as description
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = @schema AND p.proname = @functionName
            GROUP BY p.oid, p.prokind, p.provolatile, p.proparallel, p.prosecdef, p.procost, p.prorows, p.proowner";

        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schema", function.Schema);
        command.Parameters.AddWithValue("@functionName", function.Name);

        using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (await reader.ReadAsync(cancellationToken))
        {
            var count = reader.GetInt64(0);

            if (count == 0)
            {
                result.IsValid = false;
                result.Errors.Add("Function does not exist or is not accessible");
            }
            else
            {
                result.Metadata["FunctionExists"] = true;
                result.Metadata["FunctionKind"] = reader.IsDBNull(1) ? "function" : reader.GetString(1);
                result.Metadata["Volatility"] = reader.IsDBNull(2) ? "volatile" : reader.GetString(2);
                result.Metadata["ParallelSafety"] = reader.IsDBNull(3) ? "unsafe" : reader.GetString(3);
                result.Metadata["SecurityDefiner"] = !reader.IsDBNull(4) && reader.GetBoolean(4);
                result.Metadata["ExecutionCost"] = reader.IsDBNull(5) ? 0 : reader.GetFloat(5);
                result.Metadata["EstimatedRows"] = reader.IsDBNull(6) ? 0 : reader.GetInt32(6);
                result.Metadata["Owner"] = reader.IsDBNull(7) ? string.Empty : reader.GetString(7);

                // Add warnings for potential issues
                var volatility = reader.IsDBNull(2) ? "volatile" : reader.GetString(2);
                if (volatility == "volatile")
                    result.Warnings.Add("Function is volatile - may return different results for same inputs");

                var parallelSafety = reader.IsDBNull(3) ? "unsafe" : reader.GetString(3);
                if (parallelSafety == "unsafe")
                    result.Warnings.Add("Function is not parallel-safe - may impact query performance");
            }
        }
        else
        {
            result.IsValid = false;
            result.Errors.Add("Function does not exist or is not accessible");
        }
    }

    /// <summary>
    /// Validates index objects
    /// </summary>
    private async Task ValidateIndexAsync(
        NpgsqlConnection connection,
        DatabaseObject index,
        ObjectValidationResult result,
        CancellationToken cancellationToken)
    {
        // Check if index exists
        var query = @"
                SELECT COUNT(*)
                FROM pg_class c
                JOIN pg_namespace n ON c.relnamespace = n.oid
                WHERE c.relkind = 'i' AND n.nspname = @schema AND c.relname = @indexName";

        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schema", index.Schema);
        command.Parameters.AddWithValue("@indexName", index.Name);

        var countResult = await command.ExecuteScalarAsync(cancellationToken);
        var count = countResult != null ? (long)countResult : 0;

        if (count == 0)
        {
            result.IsValid = false;
            result.Errors.Add("Index does not exist or is not accessible");
        }
        else
        {
            result.Metadata["IndexExists"] = true;
        }
    }

    public void Dispose()
    {
        if (!_disposed)
        {
            _disposed = true;
            _logger.LogInformation("SchemaMetadataExtractor disposed");
        }
    }
}