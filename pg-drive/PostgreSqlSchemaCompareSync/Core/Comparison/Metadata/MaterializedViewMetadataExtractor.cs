namespace PostgreSqlSchemaCompareSync.Core.Comparison.Metadata;

/// <summary>
/// Specialized extractor for PostgreSQL materialized view metadata
/// </summary>
public class MaterializedViewMetadataExtractor(
    ILogger<MaterializedViewMetadataExtractor> logger) : IMetadataExtractor, IObjectMetadataExtractor, IObjectValidator
{
    private readonly ILogger<MaterializedViewMetadataExtractor> _logger = logger ?? throw new ArgumentNullException(nameof(logger));

    public ObjectType ObjectType => ObjectType.View; // Materialized views are a type of view

    /// <summary>
    /// Extracts materialized view metadata from the database
    /// </summary>
    public async Task<IEnumerable<DatabaseObject>> ExtractAsync(
        NpgsqlConnection connection,
        string? schemaFilter,
        CancellationToken cancellationToken)
    {
        var materializedViews = new List<DatabaseObject>();

        const string query = @"
            SELECT
                c.relname as view_name,
                n.nspname as view_schema,
                c.relkind as relation_kind,
                pg_get_viewdef(c.oid) as view_definition,
                obj_description(c.oid, 'pg_class') as description,
                c.relowner::regrole as view_owner,
                c.relcreated as creation_date,
                c.reltablespace as tablespace_oid,
                t.spcname as tablespace_name,
                pg_relation_size(c.oid) as size_bytes,
                c.reltuples as row_estimate,
                c.relpages as page_count,
                c.relhasindex as has_indexes,
                c.relhasrules as has_rules,
                c.relhastriggers as has_triggers,
                CASE WHEN c.relkind = 'm' THEN true ELSE false END as is_materialized
            FROM pg_class c
            JOIN pg_namespace n ON c.relnamespace = n.oid
            LEFT JOIN pg_tablespace t ON c.reltablespace = t.oid
            WHERE c.relkind = 'm' -- Materialized views only
              AND (@schemaFilter IS NULL OR n.nspname = @schemaFilter)
              AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
            ORDER BY n.nspname, c.relname";

        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

        using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var viewName = reader.GetString(0);
            var viewSchema = reader.GetString(1);

            materializedViews.Add(new DatabaseObject
            {
                Name = viewName,
                Schema = viewSchema,
                Type = ObjectType.View, // Using View type but marking as materialized in properties
                Database = connection.Database,
                Owner = reader.IsDBNull(5) ? string.Empty : reader.GetString(5),
                Definition = reader.IsDBNull(3) ? string.Empty : reader.GetString(3),
                CreatedAt = reader.IsDBNull(6) ? DateTime.UtcNow : reader.GetDateTime(6),
                Properties =
                {
                    ["RelationKind"] = reader.GetString(2),
                    ["Description"] = reader.IsDBNull(4) ? string.Empty : reader.GetString(4),
                    ["TablespaceOid"] = reader.IsDBNull(7) ? 0 : reader.GetInt32(7),
                    ["TablespaceName"] = reader.IsDBNull(8) ? string.Empty : reader.GetString(8),
                    ["SizeBytes"] = reader.IsDBNull(9) ? 0L : reader.GetInt64(9),
                    ["RowEstimate"] = reader.IsDBNull(10) ? 0 : reader.GetFloat(10),
                    ["PageCount"] = reader.GetInt32(11),
                    ["HasIndexes"] = reader.GetBoolean(12),
                    ["HasRules"] = reader.GetBoolean(13),
                    ["HasTriggers"] = reader.GetBoolean(14),
                    ["IsMaterialized"] = reader.GetBoolean(15)
                }
            });
        }

        return materializedViews;
    }

    /// <summary>
    /// Extracts detailed materialized view information
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
            Schema = schema,
            Type = ObjectType.View,
            Database = connection.Database,
            CreatedAt = DateTime.UtcNow
        };

        await ExtractMaterializedViewDetailsAsync(connection, details, cancellationToken);
        return details;
    }

    /// <summary>
    /// Validates materialized view objects
    /// </summary>
    public async Task<ObjectValidationResult> ValidateAsync(
        NpgsqlConnection connection,
        DatabaseObject materializedView,
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
            _logger.LogDebug("Validating materialized view {Schema}.{ViewName}", materializedView.Schema, materializedView.Name);

            // Check if materialized view exists and is accessible
            const string query = @"
                SELECT COUNT(*)
                FROM pg_class c
                JOIN pg_namespace n ON c.relnamespace = n.oid
                WHERE c.relkind = 'm'
                  AND n.nspname = @schema
                  AND c.relname = @viewName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schema", materializedView.Schema);
            command.Parameters.AddWithValue("@viewName", materializedView.Name);

            var countResult = await command.ExecuteScalarAsync(cancellationToken);
            var count = countResult != null ? (long)countResult : 0;

            if (count == 0)
            {
                result.IsValid = false;
                result.Errors.Add("Materialized view does not exist or is not accessible");
            }
            else
            {
                result.Metadata["MaterializedViewExists"] = true;

                // Get advanced materialized view information
                const string advancedQuery = @"
                    SELECT
                        c.relkind as relation_kind,
                        c.reltablespace as tablespace_oid,
                        t.spcname as tablespace_name,
                        pg_relation_size(c.oid) as size_bytes,
                        c.reltuples as row_estimate,
                        c.relpages as page_count,
                        c.relhasindex as has_indexes,
                        c.relhasrules as has_rules,
                        c.relhastriggers as has_triggers,
                        pg_get_viewdef(c.oid) as view_definition,
                        obj_description(c.oid, 'pg_class') as description
                    FROM pg_class c
                    JOIN pg_namespace n ON c.relnamespace = n.oid
                    LEFT JOIN pg_tablespace t ON c.reltablespace = t.oid
                    WHERE n.nspname = @schema AND c.relname = @viewName";

                using var advCommand = new NpgsqlCommand(advancedQuery, connection);
                advCommand.Parameters.AddWithValue("@schema", materializedView.Schema);
                advCommand.Parameters.AddWithValue("@viewName", materializedView.Name);

                using var advReader = await advCommand.ExecuteReaderAsync(cancellationToken);
                if (await advReader.ReadAsync(cancellationToken))
                {
                    result.Metadata["RelationKind"] = advReader.GetString(0);
                    result.Metadata["TablespaceOid"] = advReader.IsDBNull(1) ? 0 : advReader.GetInt32(1);
                    result.Metadata["TablespaceName"] = advReader.IsDBNull(2) ? string.Empty : advReader.GetString(2);
                    result.Metadata["SizeBytes"] = advReader.GetInt64(3);
                    result.Metadata["RowEstimate"] = advReader.IsDBNull(4) ? 0 : advReader.GetFloat(4);
                    result.Metadata["PageCount"] = advReader.GetInt32(5);
                    result.Metadata["HasIndexes"] = advReader.GetBoolean(6);
                    result.Metadata["HasRules"] = advReader.GetBoolean(7);
                    result.Metadata["HasTriggers"] = advReader.GetBoolean(8);
                    result.Metadata["ViewDefinition"] = advReader.IsDBNull(9) ? string.Empty : advReader.GetString(9);
                    result.Metadata["Description"] = advReader.IsDBNull(10) ? string.Empty : advReader.GetString(10);

                    // Add warnings for potential issues
                    var sizeBytes = advReader.GetInt64(3);
                    if (sizeBytes > 1024 * 1024 * 1024) // 1GB
                        result.Warnings.Add($"Materialized view is very large ({sizeBytes / (1024 * 1024)}MB) - consider refresh policy");

                    if (!advReader.GetBoolean(6))
                        result.Warnings.Add("Materialized view has no indexes - query performance may be poor");

                    var rowEstimate = advReader.IsDBNull(4) ? 0 : advReader.GetFloat(4);
                    if (rowEstimate == 0)
                        result.Warnings.Add("Materialized view appears to be empty - may need refresh");
                }

                // Validate materialized view dependencies
                await ValidateMaterializedViewDependenciesAsync(connection, materializedView.Schema, materializedView.Name, result, cancellationToken);

                // Check refresh information
                await ValidateRefreshStatusAsync(connection, materializedView.Schema, materializedView.Name, result, cancellationToken);
            }

            result.Metadata["ValidationDate"] = DateTime.UtcNow;
            result.Metadata["ObjectType"] = materializedView.Type.ToString();

            _logger.LogDebug("Validation completed for materialized view {Schema}.{ViewName}: Valid={IsValid}",
                materializedView.Schema, materializedView.Name, result.IsValid);

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to validate materialized view {Schema}.{ViewName}", materializedView.Schema, materializedView.Name);

            result.IsValid = false;
            result.Errors.Add($"Validation error: {ex.Message}");
            return result;
        }
    }

    /// <summary>
    /// Extracts detailed materialized view information including dependencies and indexes
    /// </summary>
    private async Task ExtractMaterializedViewDetailsAsync(
        NpgsqlConnection connection,
        DatabaseObjectDetails details,
        CancellationToken cancellationToken)
    {
        // Get materialized view indexes
        const string indexQuery = @"
            SELECT
                c2.relname as index_name,
                i.indisunique as is_unique,
                i.indisprimary as is_primary,
                pg_get_indexdef(c2.oid) as index_definition
            FROM pg_class c
            JOIN pg_namespace n ON c.relnamespace = n.oid
            JOIN pg_index i ON i.indrelid = c.oid
            JOIN pg_class c2 ON i.indexrelid = c2.oid
            WHERE n.nspname = @schema
              AND c.relname = @viewName
              AND c2.relkind = 'i'
            ORDER BY c2.relname";

        using var indexCommand = new NpgsqlCommand(indexQuery, connection);
        indexCommand.Parameters.AddWithValue("@schema", details.Schema);
        indexCommand.Parameters.AddWithValue("@viewName", details.Name);

        using var indexReader = await indexCommand.ExecuteReaderAsync(cancellationToken);
        while (await indexReader.ReadAsync(cancellationToken))
        {
            var indexName = indexReader.GetString(0);
            var isUnique = indexReader.GetBoolean(1);
            var isPrimary = indexReader.GetBoolean(2);
            var indexDefinition = indexReader.GetString(3);

            details.AdditionalInfo[$"Index_{indexName}_IsUnique"] = isUnique;
            details.AdditionalInfo[$"Index_{indexName}_IsPrimary"] = isPrimary;
            details.AdditionalInfo[$"Index_{indexName}_Definition"] = indexDefinition;
        }

        // Get dependent objects
        const string dependencyQuery = @"
            SELECT
                'Table' as dependent_type,
                t.relname as dependent_name,
                n.nspname as dependent_schema
            FROM pg_depend d
            JOIN pg_class c ON d.objid = c.oid
            JOIN pg_class t ON d.refobjid = t.oid
            JOIN pg_namespace n ON t.relnamespace = n.oid
            WHERE c.relname = @viewName
              AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = @schema)
              AND d.deptype = 'n'
              AND t.relkind = 'r'
            UNION ALL
            SELECT
                'View' as dependent_type,
                v.relname as dependent_name,
                n.nspname as dependent_schema
            FROM pg_depend d
            JOIN pg_class c ON d.objid = c.oid
            JOIN pg_class v ON d.refobjid = v.oid
            JOIN pg_namespace n ON v.relnamespace = n.oid
            WHERE c.relname = @viewName
              AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = @schema)
              AND d.deptype = 'n'
              AND v.relkind = 'v'";

        using var depCommand = new NpgsqlCommand(dependencyQuery, connection);
        depCommand.Parameters.AddWithValue("@viewName", details.Name);
        depCommand.Parameters.AddWithValue("@schema", details.Schema);

        using var depReader = await depCommand.ExecuteReaderAsync(cancellationToken);
        var dependencies = new List<string>();
        while (await depReader.ReadAsync(cancellationToken))
        {
            var dependentType = depReader.GetString(0);
            var dependentName = depReader.GetString(1);
            var dependentSchema = depReader.GetString(2);
            dependencies.Add($"{dependentType}: {dependentSchema}.{dependentName}");
        }

        if (dependencies.Any())
        {
            details.AdditionalInfo["Dependencies"] = string.Join("; ", dependencies);
            details.AdditionalInfo["DependencyCount"] = dependencies.Count;
        }
    }

    /// <summary>
    /// Validates materialized view dependencies
    /// </summary>
    private async Task ValidateMaterializedViewDependenciesAsync(
        NpgsqlConnection connection,
        string schema,
        string viewName,
        ObjectValidationResult result,
        CancellationToken cancellationToken)
    {
        try
        {
            // Check if source tables/views exist
            const string query = @"
                SELECT COUNT(*)
                FROM pg_class c
                JOIN pg_namespace n ON c.relnamespace = n.oid
                JOIN pg_depend d ON d.objid = c.oid
                JOIN pg_class mv ON d.refobjid = mv.oid
                WHERE mv.relname = @viewName
                  AND mv.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = @schema)
                  AND d.deptype IN ('n', 'i')";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@viewName", viewName);
            command.Parameters.AddWithValue("@schema", schema);

            var dependencyCount = await command.ExecuteScalarAsync(cancellationToken);
            var count = dependencyCount != null ? (long)dependencyCount : 0;

            result.Metadata["DependencyCount"] = count;

            if (count == 0)
            {
                result.Warnings.Add("Materialized view has no dependencies - definition may be invalid");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error checking materialized view dependencies for {Schema}.{ViewName}", schema, viewName);
            result.Warnings.Add($"Could not verify dependencies: {ex.Message}");
        }
    }

    /// <summary>
    /// Validates materialized view refresh status
    /// </summary>
    private async Task ValidateRefreshStatusAsync(
        NpgsqlConnection connection,
        string schema,
        string viewName,
        ObjectValidationResult result,
        CancellationToken cancellationToken)
    {
        try
        {
            // Check if materialized view needs refresh by comparing with source data
            const string query = @"
                SELECT
                    c.reltuples as current_rows,
                    s.row_count as source_rows
                FROM pg_class c
                JOIN pg_namespace n ON c.relnamespace = n.oid
                LEFT JOIN (
                    SELECT
                        mv.relname as mv_name,
                        SUM(st.reltuples) as row_count
                    FROM pg_class mv
                    JOIN pg_depend d ON d.refobjid = mv.oid
                    JOIN pg_class st ON d.objid = st.oid
                    WHERE mv.relname = @viewName
                      AND mv.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = @schema)
                      AND st.relkind = 'r'
                    GROUP BY mv.relname
                ) s ON s.mv_name = c.relname
                WHERE n.nspname = @schema AND c.relname = @viewName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@viewName", viewName);
            command.Parameters.AddWithValue("@schema", schema);

            using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                var currentRows = reader.IsDBNull(0) ? 0 : reader.GetFloat(0);
                var sourceRows = reader.IsDBNull(1) ? 0 : reader.GetFloat(1);

                result.Metadata["CurrentRowCount"] = currentRows;
                result.Metadata["SourceRowCount"] = sourceRows;

                if (sourceRows > 0 && Math.Abs(currentRows - sourceRows) / sourceRows > 0.1) // 10% difference
                {
                    result.Warnings.Add($"Materialized view may be stale (current: {currentRows}, source: {sourceRows}) - consider refresh");
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error checking refresh status for {Schema}.{ViewName}", schema, viewName);
            result.Warnings.Add($"Could not verify refresh status: {ex.Message}");
        }
    }
}