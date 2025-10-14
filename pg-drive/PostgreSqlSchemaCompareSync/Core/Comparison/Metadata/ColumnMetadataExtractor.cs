namespace PostgreSqlSchemaCompareSync.Core.Comparison.Metadata;

/// <summary>
/// Specialized extractor for PostgreSQL column metadata
/// </summary>
public class ColumnMetadataExtractor(
    ILogger<ColumnMetadataExtractor> logger) : IMetadataExtractor, IObjectMetadataExtractor, IObjectValidator
{
    private readonly ILogger<ColumnMetadataExtractor> _logger = logger ?? throw new ArgumentNullException(nameof(logger));

    public ObjectType ObjectType => ObjectType.Column;

    /// <summary>
    /// Extracts column metadata from the database
    /// </summary>
    public async Task<IEnumerable<DatabaseObject>> ExtractAsync(
        NpgsqlConnection connection,
        string? schemaFilter,
        CancellationToken cancellationToken)
    {
        var columns = new List<DatabaseObject>();

        const string query = @"
            SELECT
                c.table_name,
                c.column_name,
                c.table_schema,
                c.data_type,
                c.is_nullable,
                c.column_default,
                c.character_maximum_length,
                c.numeric_precision,
                c.numeric_scale,
                c.ordinal_position,
                c.domain_name,
                c.is_generated,
                c.generation_expression,
                c.is_identity,
                c.identity_start,
                c.identity_increment,
                c.identity_maximum,
                c.identity_minimum,
                c.identity_cycle,
                c.collation_name,
                obj_description(format('%I.%I', c.table_schema, c.table_name)::regclass, c.ordinal_position) as column_comment,
                t.table_type,
                c.udt_name as underlying_type,
                c.is_updatable
            FROM information_schema.columns c
            JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
            WHERE (@schemaFilter IS NULL OR c.table_schema = @schemaFilter)
              AND c.table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
              AND t.table_type IN ('BASE TABLE', 'VIEW')
            ORDER BY c.table_schema, c.table_name, c.ordinal_position";

        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

        using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var tableName = reader.GetString(0);
            var columnName = reader.GetString(1);
            var tableSchema = reader.GetString(2);

            columns.Add(new DatabaseObject
            {
                Name = columnName,
                Schema = tableSchema,
                Type = ObjectType.Column,
                Database = connection.Database,
                Definition = await BuildColumnDefinitionAsync(connection, tableSchema, tableName, columnName, cancellationToken),
                Properties =
                {
                    ["TableName"] = tableName,
                    ["TableSchema"] = tableSchema,
                    ["DataType"] = reader.GetString(3),
                    ["IsNullable"] = reader.GetString(4) == "YES",
                    ["DefaultValue"] = reader.IsDBNull(5) ? string.Empty : reader.GetString(5),
                    ["MaxLength"] = reader.IsDBNull(6) ? 0 : reader.GetInt32(6),
                    ["Precision"] = reader.IsDBNull(7) ? 0 : reader.GetInt32(7),
                    ["Scale"] = reader.IsDBNull(8) ? 0 : reader.GetInt32(8),
                    ["OrdinalPosition"] = reader.GetInt32(9),
                    ["DomainName"] = reader.IsDBNull(10) ? string.Empty : reader.GetString(10),
                    ["IsGenerated"] = reader.IsDBNull(11) ? false : reader.GetString(11) == "ALWAYS",
                    ["GenerationExpression"] = reader.IsDBNull(12) ? string.Empty : reader.GetString(12),
                    ["IsIdentity"] = reader.IsDBNull(13) ? false : reader.GetString(13) == "YES",
                    ["IdentityStart"] = reader.IsDBNull(14) ? string.Empty : reader.GetString(14),
                    ["IdentityIncrement"] = reader.IsDBNull(15) ? string.Empty : reader.GetString(15),
                    ["IdentityMaximum"] = reader.IsDBNull(16) ? string.Empty : reader.GetString(16),
                    ["IdentityMinimum"] = reader.IsDBNull(17) ? string.Empty : reader.GetString(17),
                    ["IdentityCycle"] = reader.IsDBNull(18) ? false : reader.GetString(18) == "YES",
                    ["CollationName"] = reader.IsDBNull(19) ? string.Empty : reader.GetString(19),
                    ["ColumnComment"] = reader.IsDBNull(20) ? string.Empty : reader.GetString(20),
                    ["TableType"] = reader.GetString(21),
                    ["UnderlyingType"] = reader.GetString(22),
                    ["IsUpdatable"] = reader.GetString(23) == "YES"
                }
            });
        }

        return columns;
    }

    /// <summary>
    /// Extracts detailed column information
    /// </summary>
    public async Task<DatabaseObjectDetails> ExtractDetailsAsync(
        NpgsqlConnection connection,
        string schema,
        string columnName,
        CancellationToken cancellationToken)
    {
        var details = new DatabaseObjectDetails
        {
            Name = columnName,
            Schema = schema,
            Type = ObjectType.Column,
            Database = connection.Database,
            CreatedAt = DateTime.UtcNow
        };

        await ExtractColumnDetailsAsync(connection, details, cancellationToken);
        return details;
    }

    /// <summary>
    /// Validates column objects
    /// </summary>
    public async Task<ObjectValidationResult> ValidateAsync(
        NpgsqlConnection connection,
        DatabaseObject column,
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
            _logger.LogDebug("Validating column {Schema}.{TableName}.{ColumnName}",
                column.Properties["TableSchema"], column.Properties["TableName"], column.Name);

            // Check if column exists and is accessible
            const string query = @"
                SELECT COUNT(*)
                FROM information_schema.columns c
                JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
                WHERE c.table_schema = @schema
                  AND c.table_name = @tableName
                  AND c.column_name = @columnName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schema", column.Properties["TableSchema"]);
            command.Parameters.AddWithValue("@tableName", column.Properties["TableName"]);
            command.Parameters.AddWithValue("@columnName", column.Name);

            var countResult = await command.ExecuteScalarAsync(cancellationToken);
            var count = countResult != null ? (long)countResult : 0;

            if (count == 0)
            {
                result.IsValid = false;
                result.Errors.Add("Column does not exist or is not accessible");
            }
            else
            {
                result.Metadata["ColumnExists"] = true;

                // Get advanced column information
                const string advancedQuery = @"
                    SELECT
                        c.data_type,
                        c.is_nullable,
                        c.column_default,
                        c.character_maximum_length,
                        c.numeric_precision,
                        c.numeric_scale,
                        c.is_identity,
                        c.identity_start,
                        c.identity_increment,
                        c.identity_maximum,
                        c.identity_minimum,
                        c.identity_cycle,
                        c.collation_name,
                        c.is_generated,
                        c.generation_expression,
                        c.domain_name,
                        c.table_name,
                        c.ordinal_position,
                        t.table_type,
                        c.is_updatable
                    FROM information_schema.columns c
                    JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
                    WHERE c.table_schema = @schema
                      AND c.table_name = @tableName
                      AND c.column_name = @columnName";

                using var advCommand = new NpgsqlCommand(advancedQuery, connection);
                advCommand.Parameters.AddWithValue("@schema", column.Properties["TableSchema"]);
                advCommand.Parameters.AddWithValue("@tableName", column.Properties["TableName"]);
                advCommand.Parameters.AddWithValue("@columnName", column.Name);

                using var advReader = await advCommand.ExecuteReaderAsync(cancellationToken);
                if (await advReader.ReadAsync(cancellationToken))
                {
                    result.Metadata["DataType"] = advReader.GetString(0);
                    result.Metadata["IsNullable"] = advReader.GetString(1) == "YES";
                    result.Metadata["DefaultValue"] = advReader.IsDBNull(2) ? string.Empty : advReader.GetString(2);
                    result.Metadata["MaxLength"] = advReader.IsDBNull(3) ? 0 : advReader.GetInt32(3);
                    result.Metadata["Precision"] = advReader.IsDBNull(4) ? 0 : advReader.GetInt32(4);
                    result.Metadata["Scale"] = advReader.IsDBNull(5) ? 0 : advReader.GetInt32(5);
                    result.Metadata["IsIdentity"] = advReader.IsDBNull(6) ? false : advReader.GetString(6) == "YES";
                    result.Metadata["IdentityStart"] = advReader.IsDBNull(7) ? string.Empty : advReader.GetString(7);
                    result.Metadata["IdentityIncrement"] = advReader.IsDBNull(8) ? string.Empty : advReader.GetString(8);
                    result.Metadata["IdentityMaximum"] = advReader.IsDBNull(9) ? string.Empty : advReader.GetString(9);
                    result.Metadata["IdentityMinimum"] = advReader.IsDBNull(10) ? string.Empty : advReader.GetString(10);
                    result.Metadata["IdentityCycle"] = advReader.IsDBNull(11) ? false : advReader.GetString(11) == "YES";
                    result.Metadata["CollationName"] = advReader.IsDBNull(12) ? string.Empty : advReader.GetString(12);
                    result.Metadata["IsGenerated"] = advReader.IsDBNull(13) ? false : advReader.GetString(13) == "ALWAYS";
                    result.Metadata["GenerationExpression"] = advReader.IsDBNull(14) ? string.Empty : advReader.GetString(14);
                    result.Metadata["DomainName"] = advReader.IsDBNull(15) ? string.Empty : advReader.GetString(15);
                    result.Metadata["TableName"] = advReader.GetString(16);
                    result.Metadata["OrdinalPosition"] = advReader.GetInt32(17);
                    result.Metadata["TableType"] = advReader.GetString(18);
                    result.Metadata["IsUpdatable"] = advReader.GetString(19) == "YES";

                    // Add warnings for potential issues
                    if (advReader.GetString(1) == "YES")
                        result.Warnings.Add("Column allows NULL values - may impact data integrity");

                    if (advReader.IsDBNull(2))
                        result.Warnings.Add("Column has no default value - may cause insertion issues");

                    if (advReader.GetBoolean(6)) // IsIdentity
                        result.Warnings.Add("Column is an identity column - special handling may be required for migrations");

                    if (advReader.GetBoolean(13)) // IsGenerated
                        result.Warnings.Add("Column is generated - may have dependencies on other columns");

                    var maxLength = advReader.IsDBNull(3) ? 0 : advReader.GetInt32(3);
                    if (maxLength > 10000)
                        result.Warnings.Add($"Column has very large maximum length ({maxLength}) - may impact performance");
                }

                // Validate column constraints
                await ValidateColumnConstraintsAsync(connection, column.Properties["TableSchema"].ToString(), column.Properties["TableName"].ToString(), column.Name, result, cancellationToken);

                // Check for column dependencies
                await ValidateColumnDependenciesAsync(connection, column.Properties["TableSchema"].ToString(), column.Properties["TableName"].ToString(), column.Name, result, cancellationToken);
            }

            result.Metadata["ValidationDate"] = DateTime.UtcNow;
            result.Metadata["ObjectType"] = column.Type.ToString();

            _logger.LogDebug("Validation completed for column {Schema}.{TableName}.{ColumnName}: Valid={IsValid}",
                column.Properties["TableSchema"], column.Properties["TableName"], column.Name, result.IsValid);

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to validate column {Schema}.{TableName}.{ColumnName}",
                column.Properties["TableSchema"], column.Properties["TableName"], column.Name);

            result.IsValid = false;
            result.Errors.Add($"Validation error: {ex.Message}");
            return result;
        }
    }

    /// <summary>
    /// Extracts detailed column information including constraints and indexes
    /// </summary>
    private async Task ExtractColumnDetailsAsync(
        NpgsqlConnection connection,
        DatabaseObjectDetails details,
        CancellationToken cancellationToken)
    {
        // Get column constraints
        const string constraintQuery = @"
            SELECT
                tc.constraint_name,
                tc.constraint_type,
                tc.table_name,
                tc.table_schema
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                AND tc.table_name = kcu.table_name AND tc.table_schema = kcu.table_schema
            WHERE kcu.column_name = @columnName
              AND kcu.table_schema = @schema
            ORDER BY tc.constraint_type, tc.constraint_name";

        using var consCommand = new NpgsqlCommand(constraintQuery, connection);
        consCommand.Parameters.AddWithValue("@columnName", details.Name);
        consCommand.Parameters.AddWithValue("@schema", details.Schema);

        using var consReader = await consCommand.ExecuteReaderAsync(cancellationToken);
        var constraints = new List<string>();
        while (await consReader.ReadAsync(cancellationToken))
        {
            var constraintName = consReader.GetString(0);
            var constraintType = consReader.GetString(1);
            constraints.Add($"{constraintType}: {constraintName}");
        }

        if (constraints.Any())
        {
            details.AdditionalInfo["ColumnConstraints"] = string.Join("; ", constraints);
            details.AdditionalInfo["ConstraintCount"] = constraints.Count;
        }

        // Get column indexes
        const string indexQuery = @"
            SELECT
                i.indexname as index_name,
                i.indexdef as index_definition,
                i.indisunique as is_unique,
                i.indisprimary as is_primary
            FROM pg_indexes i
            WHERE i.schemaname = @schema
              AND i.tablename = (SELECT table_name FROM information_schema.columns WHERE column_name = @columnName AND table_schema = @schema LIMIT 1)
              AND i.indexdef LIKE '%' || @columnName || '%'
            ORDER BY i.indexname";

        using var indexCommand = new NpgsqlCommand(indexQuery, connection);
        indexCommand.Parameters.AddWithValue("@columnName", details.Name);
        indexCommand.Parameters.AddWithValue("@schema", details.Schema);

        using var indexReader = await indexCommand.ExecuteReaderAsync(cancellationToken);
        var indexes = new List<string>();
        while (await indexReader.ReadAsync(cancellationToken))
        {
            var indexName = indexReader.GetString(0);
            var isUnique = indexReader.GetBoolean(2);
            var isPrimary = indexReader.GetBoolean(3);
            indexes.Add($"{indexName}{(isUnique ? " (UNIQUE)" : "")}{(isPrimary ? " (PRIMARY)" : "")}");
        }

        if (indexes.Any())
        {
            details.AdditionalInfo["ColumnIndexes"] = string.Join("; ", indexes);
            details.AdditionalInfo["IndexCount"] = indexes.Count;
        }

        // Get column statistics if available
        const string statsQuery = @"
            SELECT
                n_distinct as distinct_values,
                most_common_vals as most_common_values,
                most_common_freqs as most_common_frequencies,
                histogram_bounds as histogram_bounds,
                correlation as correlation
            FROM pg_stats
            WHERE schemaname = @schema
              AND tablename = (SELECT table_name FROM information_schema.columns WHERE column_name = @columnName AND table_schema = @schema LIMIT 1)
              AND attname = @columnName";

        using var statsCommand = new NpgsqlCommand(statsQuery, connection);
        statsCommand.Parameters.AddWithValue("@columnName", details.Name);
        statsCommand.Parameters.AddWithValue("@schema", details.Schema);

        using var statsReader = await statsCommand.ExecuteReaderAsync(cancellationToken);
        if (await statsReader.ReadAsync(cancellationToken))
        {
            details.AdditionalInfo["DistinctValues"] = statsReader.IsDBNull(0) ? 0 : statsReader.GetFloat(0);
            details.AdditionalInfo["MostCommonValues"] = statsReader.IsDBNull(1) ? string.Empty : statsReader.GetString(1);
            details.AdditionalInfo["MostCommonFrequencies"] = statsReader.IsDBNull(2) ? string.Empty : statsReader.GetString(2);
            details.AdditionalInfo["HistogramBounds"] = statsReader.IsDBNull(3) ? string.Empty : statsReader.GetString(3);
            details.AdditionalInfo["Correlation"] = statsReader.IsDBNull(4) ? 0 : statsReader.GetFloat(4);
        }
    }

    /// <summary>
    /// Validates column constraints
    /// </summary>
    private async Task ValidateColumnConstraintsAsync(
        NpgsqlConnection connection,
        string schema,
        string tableName,
        string columnName,
        ObjectValidationResult result,
        CancellationToken cancellationToken)
    {
        try
        {
            const string query = @"
                SELECT COUNT(*)
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_name = kcu.table_name AND tc.table_schema = kcu.table_schema
                WHERE kcu.table_schema = @schema
                  AND kcu.table_name = @tableName
                  AND kcu.column_name = @columnName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schema", schema);
            command.Parameters.AddWithValue("@tableName", tableName);
            command.Parameters.AddWithValue("@columnName", columnName);

            var constraintCount = await command.ExecuteScalarAsync(cancellationToken);
            var count = constraintCount != null ? (long)constraintCount : 0;

            result.Metadata["ConstraintCount"] = count;

            if (count == 0)
            {
                result.Warnings.Add("Column has no constraints - may allow invalid data");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error checking column constraints for {Schema}.{TableName}.{ColumnName}", schema, tableName, columnName);
            result.Warnings.Add($"Could not verify column constraints: {ex.Message}");
        }
    }

    /// <summary>
    /// Validates column dependencies
    /// </summary>
    private async Task ValidateColumnDependenciesAsync(
        NpgsqlConnection connection,
        string schema,
        string tableName,
        string columnName,
        ObjectValidationResult result,
        CancellationToken cancellationToken)
    {
        try
        {
            // Check if column is referenced by foreign keys
            const string query = @"
                SELECT COUNT(*)
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_name = kcu.table_name AND tc.table_schema = kcu.table_schema
                WHERE tc.constraint_type = 'FOREIGN KEY'
                  AND kcu.table_schema = @schema
                  AND kcu.table_name = @tableName
                  AND kcu.column_name = @columnName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schema", schema);
            command.Parameters.AddWithValue("@tableName", tableName);
            command.Parameters.AddWithValue("@columnName", columnName);

            var fkCount = await command.ExecuteScalarAsync(cancellationToken);
            var count = fkCount != null ? (long)fkCount : 0;

            result.Metadata["ForeignKeyReferenceCount"] = count;

            if (count > 0)
            {
                result.Warnings.Add($"Column is referenced by {count} foreign key(s) - may impact modification operations");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error checking column dependencies for {Schema}.{TableName}.{ColumnName}", schema, tableName, columnName);
        }
    }

    /// <summary>
    /// Builds a column definition statement
    /// </summary>
    private async Task<string> BuildColumnDefinitionAsync(
        NpgsqlConnection connection,
        string schema,
        string tableName,
        string columnName,
        CancellationToken cancellationToken)
    {
        try
        {
            const string query = @"
                SELECT
                    c.data_type,
                    c.is_nullable,
                    c.column_default,
                    c.character_maximum_length,
                    c.numeric_precision,
                    c.numeric_scale,
                    c.is_identity,
                    c.identity_start,
                    c.identity_increment,
                    c.identity_maximum,
                    c.identity_minimum,
                    c.identity_cycle,
                    c.collation_name,
                    c.is_generated,
                    c.generation_expression,
                    c.domain_name
                FROM information_schema.columns c
                WHERE c.table_schema = @schema
                  AND c.table_name = @tableName
                  AND c.column_name = @columnName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schema", schema);
            command.Parameters.AddWithValue("@tableName", tableName);
            command.Parameters.AddWithValue("@columnName", columnName);

            using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                var dataType = reader.GetString(0);
                var isNullable = reader.GetString(1) == "YES";
                var defaultValue = reader.IsDBNull(2) ? string.Empty : reader.GetString(2);
                var maxLength = reader.IsDBNull(3) ? 0 : reader.GetInt32(3);
                var precision = reader.IsDBNull(4) ? 0 : reader.GetInt32(4);
                var scale = reader.IsDBNull(5) ? 0 : reader.GetInt32(5);
                var isIdentity = reader.IsDBNull(6) ? false : reader.GetString(6) == "YES";
                var isGenerated = reader.IsDBNull(13) ? false : reader.GetString(13) == "ALWAYS";
                var generationExpression = reader.IsDBNull(14) ? string.Empty : reader.GetString(14);

                var columnDef = $"\"{columnName}\" {dataType}";

                // Add type modifiers
                if (maxLength > 0 && (dataType.Contains("char") || dataType.Contains("text")))
                    columnDef += $"({maxLength})";
                else if (precision > 0 && (dataType.Contains("numeric") || dataType.Contains("decimal")))
                    columnDef += $"({precision},{scale})";

                // Add constraints
                if (isIdentity)
                    columnDef += " GENERATED ALWAYS AS IDENTITY";
                else if (isGenerated)
                    columnDef += $" GENERATED ALWAYS AS ({generationExpression}) STORED";
                else
                {
                    if (!isNullable)
                        columnDef += " NOT NULL";

                    if (!string.IsNullOrEmpty(defaultValue))
                        columnDef += $" DEFAULT {defaultValue}";
                }

                return columnDef;
            }

            return $"\"{columnName}\" /* definition not found */";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error building column definition for {Schema}.{TableName}.{ColumnName}", schema, tableName, columnName);
            return $"\"{columnName}\" /* error building definition */";
        }
    }
}