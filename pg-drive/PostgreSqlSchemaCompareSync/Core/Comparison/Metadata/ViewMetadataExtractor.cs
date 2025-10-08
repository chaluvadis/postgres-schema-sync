namespace PostgreSqlSchemaCompareSync.Core.Comparison.Metadata;

/// <summary>
/// Specialized extractor for view metadata
/// </summary>
public class ViewMetadataExtractor(
    ILogger<ViewMetadataExtractor> logger) : IMetadataExtractor, IObjectMetadataExtractor, IObjectValidator
{
    private readonly ILogger<ViewMetadataExtractor> _logger = logger ?? throw new ArgumentNullException(nameof(logger));

    public ObjectType ObjectType => ObjectType.View;

    /// <summary>
    /// Extracts view metadata
    /// </summary>
    public async Task<IEnumerable<DatabaseObject>> ExtractAsync(
        NpgsqlConnection connection,
        string? schemaFilter,
        CancellationToken cancellationToken)
    {
        var views = new List<DatabaseObject>();

        const string query = @"
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
    /// Extracts detailed view information including columns and dependencies
    /// </summary>
    public async Task<DatabaseObjectDetails> ExtractDetailsAsync(
        NpgsqlConnection connection,
        string schema,
        string viewName,
        CancellationToken cancellationToken)
    {
        var details = new DatabaseObjectDetails
        {
            Name = viewName,
            Type = ObjectType.View,
            Schema = schema,
            Database = connection.Database,
            CreatedAt = DateTime.UtcNow
        };

        // Get view columns if not already populated
        if (details.Columns.Count == 0)
        {
            await ExtractViewColumnsAsync(connection, details, cancellationToken);
        }

        // Get view dependencies
        await ExtractViewDependenciesAsync(connection, details, cancellationToken);

        return details;
    }

    /// <summary>
    /// Validates view objects
    /// </summary>
    public async Task<ObjectValidationResult> ValidateAsync(
        NpgsqlConnection connection,
        DatabaseObject view,
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
            _logger.LogDebug("Validating view {Schema}.{ViewName}", view.Schema, view.Name);

            // Check if view exists and is accessible
            const string query = @"
                SELECT COUNT(*) FROM information_schema.views
                WHERE table_schema = @schema AND table_name = @viewName";

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

                // Additional view validation can be added here
                // For example, check if underlying tables still exist
            }

            result.Metadata["ValidationDate"] = DateTime.UtcNow;
            result.Metadata["ObjectType"] = view.Type.ToString();

            _logger.LogDebug("Validation completed for view {Schema}.{ViewName}: Valid={IsValid}",
                view.Schema, view.Name, result.IsValid);

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to validate view {Schema}.{ViewName}", view.Schema, view.Name);

            result.IsValid = false;
            result.Errors.Add($"Validation error: {ex.Message}");
            return result;
        }
    }

    /// <summary>
    /// Extracts view columns
    /// </summary>
    private async Task ExtractViewColumnsAsync(
        NpgsqlConnection connection,
        DatabaseObjectDetails details,
        CancellationToken cancellationToken)
    {
        const string columnQuery = @"
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

    /// <summary>
    /// Extracts view dependencies
    /// </summary>
    private async Task ExtractViewDependenciesAsync(
        NpgsqlConnection connection,
        DatabaseObjectDetails details,
        CancellationToken cancellationToken)
    {
        const string dependencyQuery = @"
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
}