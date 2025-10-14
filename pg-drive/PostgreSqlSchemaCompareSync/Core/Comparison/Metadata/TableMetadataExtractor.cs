namespace PostgreSqlSchemaCompareSync.Core.Comparison.Metadata;

/// <summary>
/// Specialized extractor for table metadata
/// </summary>
public class TableMetadataExtractor(
    ILogger<TableMetadataExtractor> logger) : IMetadataExtractor, IObjectMetadataExtractor, IObjectValidator
{
    private readonly ILogger<TableMetadataExtractor> _logger = logger ?? throw new ArgumentNullException(nameof(logger));

    public ObjectType ObjectType => ObjectType.Table;

    /// <summary>
    /// Extracts table metadata
    /// </summary>
    public async Task<IEnumerable<DatabaseObject>> ExtractAsync(
        NpgsqlConnection connection,
        string? schemaFilter,
        CancellationToken cancellationToken)
    {
        var tables = new List<DatabaseObject>();

        const string query = @"
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
    /// Extracts detailed table information including columns
    /// </summary>
    public async Task<DatabaseObjectDetails> ExtractDetailsAsync(
        NpgsqlConnection connection,
        string schema,
        string tableName,
        CancellationToken cancellationToken)
    {
        var details = new DatabaseObjectDetails
        {
            Name = tableName,
            Type = ObjectType.Table,
            Schema = schema,
            Database = connection.Database,
            CreatedAt = DateTime.UtcNow
        };

        await ExtractTableDetailsAsync(connection, details, cancellationToken);
        return details;
    }

    /// <summary>
    /// Validates table objects
    /// </summary>
    public async Task<ObjectValidationResult> ValidateAsync(
        NpgsqlConnection connection,
        DatabaseObject table,
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
            _logger.LogDebug("Validating table {Schema}.{TableName}", table.Schema, table.Name);

            // Check if table exists and is accessible
            const string query = @"
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
                const string advancedQuery = @"
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
                const string columnQuery = @"
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

            result.Metadata["ValidationDate"] = DateTime.UtcNow;
            result.Metadata["ObjectType"] = table.Type.ToString();

            _logger.LogDebug("Validation completed for table {Schema}.{TableName}: Valid={IsValid}",
                table.Schema, table.Name, result.IsValid);

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to validate table {Schema}.{TableName}", table.Schema, table.Name);

            result.IsValid = false;
            result.Errors.Add($"Validation error: {ex.Message}");
            return result;
        }
    }

    /// <summary>
    /// Extracts detailed table information including columns
    /// </summary>
    private async Task ExtractTableDetailsAsync(
        NpgsqlConnection connection,
        DatabaseObjectDetails details,
        CancellationToken cancellationToken)
    {
        // Get columns with enhanced information
        const string columnQuery = @"
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
}