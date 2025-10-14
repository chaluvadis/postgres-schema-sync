namespace PostgreSqlSchemaCompareSync.Core.Comparison.Metadata;

/// <summary>
/// Specialized extractor for PostgreSQL constraint metadata
/// </summary>
public class ConstraintMetadataExtractor(
    ILogger<ConstraintMetadataExtractor> logger) : IMetadataExtractor, IObjectMetadataExtractor, IObjectValidator
{
    private readonly ILogger<ConstraintMetadataExtractor> _logger = logger ?? throw new ArgumentNullException(nameof(logger));

    public ObjectType ObjectType => ObjectType.Constraint;

    /// <summary>
    /// Extracts constraint metadata from the database
    /// </summary>
    public async Task<IEnumerable<DatabaseObject>> ExtractAsync(
        NpgsqlConnection connection,
        string? schemaFilter,
        CancellationToken cancellationToken)
    {
        var constraints = new List<DatabaseObject>();

        const string query = @"
            SELECT
                c.conname as constraint_name,
                n.nspname as constraint_schema,
                t.relname as table_name,
                t_nsp.nspname as table_schema,
                CASE
                    WHEN c.contype = 'c' THEN 'CHECK'
                    WHEN c.contype = 'f' THEN 'FOREIGN KEY'
                    WHEN c.contype = 'p' THEN 'PRIMARY KEY'
                    WHEN c.contype = 'u' THEN 'UNIQUE'
                    WHEN c.contype = 't' THEN 'TRIGGER'
                    WHEN c.contype = 'x' THEN 'EXCLUSION'
                    ELSE 'UNKNOWN'
                END as constraint_type,
                c.consrc as check_clause,
                c.conkey as constraint_columns,
                c.confkey as referenced_columns,
                c.conrelid as table_oid,
                c.conindid as index_oid,
                c.confrelid as referenced_table_oid,
                c.condeferrable as is_deferrable,
                c.condeferred as initially_deferred,
                c.convalidated as is_validated,
                obj_description(c.oid, 'pg_constraint') as description,
                c.connoinherit as no_inherit,
                c.conislocal as is_local,
                c.connamespace as constraint_namespace,
                c.conexclop as exclusion_operator
            FROM pg_constraint c
            JOIN pg_class t ON c.conrelid = t.oid
            JOIN pg_namespace n ON c.connamespace = n.oid
            JOIN pg_namespace t_nsp ON t.relnamespace = t_nsp.oid
            WHERE (@schemaFilter IS NULL OR n.nspname = @schemaFilter)
              AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
              AND c.contype != 't' -- Exclude trigger constraints (handled by trigger extractor)
            ORDER BY n.nspname, t.relname, c.conname";

        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

        using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var constraintName = reader.GetString(0);
            var constraintSchema = reader.GetString(1);
            var tableName = reader.GetString(2);
            var tableSchema = reader.GetString(3);
            var constraintType = reader.GetString(4);

            constraints.Add(new DatabaseObject
            {
                Name = constraintName,
                Schema = constraintSchema,
                Type = ObjectType.Constraint,
                Database = connection.Database,
                Definition = await BuildConstraintDefinitionAsync(connection, constraintSchema, constraintName, cancellationToken),
                Properties =
                {
                    ["TableName"] = tableName,
                    ["TableSchema"] = tableSchema,
                    ["ConstraintType"] = constraintType,
                    ["CheckClause"] = reader.IsDBNull(5) ? string.Empty : reader.GetString(5),
                    ["ConstraintColumns"] = reader.IsDBNull(6) ? string.Empty : reader.GetString(6),
                    ["ReferencedColumns"] = reader.IsDBNull(7) ? string.Empty : reader.GetString(7),
                    ["TableOid"] = reader.GetInt32(8),
                    ["IndexOid"] = reader.IsDBNull(9) ? 0 : reader.GetInt32(9),
                    ["ReferencedTableOid"] = reader.IsDBNull(10) ? 0 : reader.GetInt32(10),
                    ["IsDeferrable"] = reader.GetBoolean(11),
                    ["InitiallyDeferred"] = reader.GetBoolean(12),
                    ["IsValidated"] = reader.GetBoolean(13),
                    ["Description"] = reader.IsDBNull(14) ? string.Empty : reader.GetString(14),
                    ["NoInherit"] = reader.GetBoolean(15),
                    ["IsLocal"] = reader.GetBoolean(16),
                    ["ConstraintNamespace"] = reader.GetInt32(17),
                    ["ExclusionOperator"] = reader.IsDBNull(18) ? string.Empty : reader.GetString(18)
                }
            });
        }

        return constraints;
    }

    /// <summary>
    /// Extracts detailed constraint information
    /// </summary>
    public async Task<DatabaseObjectDetails> ExtractDetailsAsync(
        NpgsqlConnection connection,
        string schema,
        string constraintName,
        CancellationToken cancellationToken)
    {
        var details = new DatabaseObjectDetails
        {
            Name = constraintName,
            Schema = schema,
            Type = ObjectType.Constraint,
            Database = connection.Database,
            CreatedAt = DateTime.UtcNow
        };

        await ExtractConstraintDetailsAsync(connection, details, cancellationToken);
        return details;
    }

    /// <summary>
    /// Validates constraint objects
    /// </summary>
    public async Task<ObjectValidationResult> ValidateAsync(
        NpgsqlConnection connection,
        DatabaseObject constraint,
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
            _logger.LogDebug("Validating constraint {Schema}.{ConstraintName}", constraint.Schema, constraint.Name);

            // Check if constraint exists and is accessible
            const string query = @"
                SELECT COUNT(*)
                FROM pg_constraint c
                JOIN pg_namespace n ON c.connamespace = n.oid
                WHERE n.nspname = @schema
                  AND c.conname = @constraintName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schema", constraint.Schema);
            command.Parameters.AddWithValue("@constraintName", constraint.Name);

            var countResult = await command.ExecuteScalarAsync(cancellationToken);
            var count = countResult != null ? (long)countResult : 0;

            if (count == 0)
            {
                result.IsValid = false;
                result.Errors.Add("Constraint does not exist or is not accessible");
            }
            else
            {
                result.Metadata["ConstraintExists"] = true;

                // Get advanced constraint information
                const string advancedQuery = @"
                    SELECT
                        c.contype as constraint_type,
                        c.convalidated as is_validated,
                        c.conislocal as is_local,
                        c.connoinherit as no_inherit,
                        c.condeferrable as is_deferrable,
                        c.condeferred as initially_deferred,
                        t.relname as table_name,
                        t_nsp.nspname as table_schema,
                        c.consrc as check_clause,
                        c.conkey as constraint_columns,
                        c.confkey as referenced_columns,
                        c.confrelid as referenced_table_oid,
                        cr.relname as referenced_table_name,
                        cr_nsp.nspname as referenced_table_schema
                    FROM pg_constraint c
                    JOIN pg_class t ON c.conrelid = t.oid
                    JOIN pg_namespace n ON c.connamespace = n.oid
                    JOIN pg_namespace t_nsp ON t.relnamespace = t_nsp.oid
                    LEFT JOIN pg_class cr ON c.confrelid = cr.oid
                    LEFT JOIN pg_namespace cr_nsp ON cr.relnamespace = cr_nsp.oid
                    WHERE n.nspname = @schema AND c.conname = @constraintName";

                using var advCommand = new NpgsqlCommand(advancedQuery, connection);
                advCommand.Parameters.AddWithValue("@schema", constraint.Schema);
                advCommand.Parameters.AddWithValue("@constraintName", constraint.Name);

                using var advReader = await advCommand.ExecuteReaderAsync(cancellationToken);
                if (await advReader.ReadAsync(cancellationToken))
                {
                    var constraintType = advReader.GetString(0);

                    result.Metadata["ConstraintType"] = constraintType;
                    result.Metadata["IsValidated"] = advReader.GetBoolean(1);
                    result.Metadata["IsLocal"] = advReader.GetBoolean(2);
                    result.Metadata["NoInherit"] = advReader.GetBoolean(3);
                    result.Metadata["IsDeferrable"] = advReader.GetBoolean(4);
                    result.Metadata["InitiallyDeferred"] = advReader.GetBoolean(5);
                    result.Metadata["TableName"] = advReader.GetString(6);
                    result.Metadata["TableSchema"] = advReader.GetString(7);
                    result.Metadata["CheckClause"] = advReader.IsDBNull(8) ? string.Empty : advReader.GetString(8);
                    result.Metadata["ConstraintColumns"] = advReader.IsDBNull(9) ? string.Empty : advReader.GetString(9);
                    result.Metadata["ReferencedColumns"] = advReader.IsDBNull(10) ? string.Empty : advReader.GetString(10);

                    if (!advReader.IsDBNull(11))
                    {
                        result.Metadata["ReferencedTableOid"] = advReader.GetInt32(11);
                        result.Metadata["ReferencedTableName"] = advReader.GetString(12);
                        result.Metadata["ReferencedTableSchema"] = advReader.GetString(13);
                    }

                    // Add warnings for potential issues
                    if (!advReader.GetBoolean(1))
                        result.Warnings.Add("Constraint is not validated - may allow invalid data");

                    if (!advReader.GetBoolean(2))
                        result.Warnings.Add("Constraint is inherited - may be defined at parent table");

                    if (advReader.GetBoolean(3))
                        result.Warnings.Add("Constraint does not inherit to child tables");

                    if (constraintType == "f") // Foreign Key
                    {
                        await ValidateForeignKeyConstraintAsync(connection, constraint.Schema, constraint.Name, result, cancellationToken);
                    }
                    else if (constraintType == "c") // Check constraint
                    {
                        await ValidateCheckConstraintAsync(connection, constraint.Schema, constraint.Name, result, cancellationToken);
                    }
                }

                // Check for constraint dependencies
                await ValidateConstraintDependenciesAsync(connection, constraint.Schema, constraint.Name, result, cancellationToken);
            }

            result.Metadata["ValidationDate"] = DateTime.UtcNow;
            result.Metadata["ObjectType"] = constraint.Type.ToString();

            _logger.LogDebug("Validation completed for constraint {Schema}.{ConstraintName}: Valid={IsValid}",
                constraint.Schema, constraint.Name, result.IsValid);

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to validate constraint {Schema}.{ConstraintName}", constraint.Schema, constraint.Name);

            result.IsValid = false;
            result.Errors.Add($"Validation error: {ex.Message}");
            return result;
        }
    }

    /// <summary>
    /// Extracts detailed constraint information including column details
    /// </summary>
    private async Task ExtractConstraintDetailsAsync(
        NpgsqlConnection connection,
        DatabaseObjectDetails details,
        CancellationToken cancellationToken)
    {
        // Get constraint columns with details
        const string columnQuery = @"
            SELECT
                a.attname as column_name,
                a.atttypid::regtype as column_type,
                a.attnotnull as not_null,
                a.atthasdef as has_default,
                c.consrc as check_clause
            FROM pg_constraint c
            JOIN pg_class t ON c.conrelid = t.oid
            JOIN pg_namespace n ON c.connamespace = n.oid
            JOIN pg_attribute a ON a.attrelid = c.conrelid
            WHERE n.nspname = @schema
              AND c.conname = @constraintName
              AND a.attnum = ANY(c.conkey)
              AND NOT a.attisdropped
            ORDER BY array_position(c.conkey, a.attnum)";

        using var columnCommand = new NpgsqlCommand(columnQuery, connection);
        columnCommand.Parameters.AddWithValue("@schema", details.Schema);
        columnCommand.Parameters.AddWithValue("@constraintName", details.Name);

        using var columnReader = await columnCommand.ExecuteReaderAsync(cancellationToken);
        var constraintColumns = new List<string>();
        while (await columnReader.ReadAsync(cancellationToken))
        {
            var columnName = columnReader.GetString(0);
            var columnType = columnReader.GetString(1);
            var notNull = columnReader.GetBoolean(2);
            var hasDefault = columnReader.GetBoolean(3);

            constraintColumns.Add($"{columnName} ({columnType})");
            details.AdditionalInfo[$"Column_{columnName}_NotNull"] = notNull;
            details.AdditionalInfo[$"Column_{columnName}_HasDefault"] = hasDefault;
        }

        if (constraintColumns.Any())
        {
            details.AdditionalInfo["ConstraintColumns"] = string.Join(", ", constraintColumns);
            details.AdditionalInfo["ConstraintColumnCount"] = constraintColumns.Count;
        }

        // Get referenced columns for foreign key constraints
        const string refColumnQuery = @"
            SELECT
                a.attname as referenced_column_name,
                a.atttypid::regtype as referenced_column_type
            FROM pg_constraint c
            JOIN pg_class t ON c.conrelid = t.oid
            JOIN pg_namespace n ON c.connamespace = n.oid
            JOIN pg_class rt ON c.confrelid = rt.oid
            JOIN pg_attribute a ON a.attrelid = rt.oid
            WHERE n.nspname = @schema
              AND c.conname = @constraintName
              AND c.contype = 'f'
              AND a.attnum = ANY(c.confkey)
              AND NOT a.attisdropped
            ORDER BY array_position(c.confkey, a.attnum)";

        using var refColumnCommand = new NpgsqlCommand(refColumnQuery, connection);
        refColumnCommand.Parameters.AddWithValue("@schema", details.Schema);
        refColumnCommand.Parameters.AddWithValue("@constraintName", details.Name);

        using var refColumnReader = await refColumnCommand.ExecuteReaderAsync(cancellationToken);
        var referencedColumns = new List<string>();
        while (await refColumnReader.ReadAsync(cancellationToken))
        {
            var columnName = refColumnReader.GetString(0);
            var columnType = refColumnReader.GetString(1);
            referencedColumns.Add($"{columnName} ({columnType})");
        }

        if (referencedColumns.Any())
        {
            details.AdditionalInfo["ReferencedColumns"] = string.Join(", ", referencedColumns);
        }
    }

    /// <summary>
    /// Validates foreign key constraint references
    /// </summary>
    private async Task ValidateForeignKeyConstraintAsync(
        NpgsqlConnection connection,
        string schema,
        string constraintName,
        ObjectValidationResult result,
        CancellationToken cancellationToken)
    {
        try
        {
            const string query = @"
                SELECT
                    c.confrelid as referenced_table_oid,
                    cr.relname as referenced_table_name,
                    cr_nsp.nspname as referenced_table_schema
                FROM pg_constraint c
                JOIN pg_class t ON c.conrelid = t.oid
                JOIN pg_namespace n ON c.connamespace = n.oid
                LEFT JOIN pg_class cr ON c.confrelid = cr.oid
                LEFT JOIN pg_namespace cr_nsp ON cr.relnamespace = cr_nsp.oid
                WHERE n.nspname = @schema AND c.conname = @constraintName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schema", schema);
            command.Parameters.AddWithValue("@constraintName", constraintName);

            using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                if (reader.IsDBNull(0))
                {
                    result.Errors.Add("Foreign key constraint references non-existent table");
                }
                else
                {
                    result.Metadata["ReferencedTableOid"] = reader.GetInt32(0);
                    result.Metadata["ReferencedTableName"] = reader.GetString(1);
                    result.Metadata["ReferencedTableSchema"] = reader.GetString(2);
                    result.Metadata["ValidForeignKeyReference"] = true;
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error validating foreign key constraint {Schema}.{ConstraintName}", schema, constraintName);
            result.Warnings.Add($"Could not verify foreign key reference: {ex.Message}");
        }
    }

    /// <summary>
    /// Validates check constraint syntax and logic
    /// </summary>
    private async Task ValidateCheckConstraintAsync(
        NpgsqlConnection connection,
        string schema,
        string constraintName,
        ObjectValidationResult result,
        CancellationToken cancellationToken)
    {
        try
        {
            const string query = @"
                SELECT c.consrc as check_clause
                FROM pg_constraint c
                JOIN pg_namespace n ON c.connamespace = n.oid
                WHERE n.nspname = @schema AND c.conname = @constraintName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schema", schema);
            command.Parameters.AddWithValue("@constraintName", constraintName);

            var checkClause = await command.ExecuteScalarAsync(cancellationToken);
            var clause = checkClause?.ToString() ?? "";

            result.Metadata["CheckClause"] = clause;

            if (string.IsNullOrEmpty(clause))
            {
                result.Warnings.Add("Check constraint has no check clause");
            }
            else
            {
                // Basic syntax validation - check for common issues
                if (!clause.Contains("WHERE") && !clause.Trim().StartsWith("("))
                {
                    result.Warnings.Add("Check clause may have syntax issues - missing WHERE or parentheses");
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error validating check constraint {Schema}.{ConstraintName}", schema, constraintName);
            result.Warnings.Add($"Could not verify check constraint: {ex.Message}");
        }
    }

    /// <summary>
    /// Validates constraint dependencies
    /// </summary>
    private async Task ValidateConstraintDependenciesAsync(
        NpgsqlConnection connection,
        string schema,
        string constraintName,
        ObjectValidationResult result,
        CancellationToken cancellationToken)
    {
        try
        {
            // Check if constraint table exists
            const string tableQuery = @"
                SELECT COUNT(*)
                FROM pg_constraint c
                JOIN pg_class t ON c.conrelid = t.oid
                JOIN pg_namespace n ON c.connamespace = n.oid
                WHERE n.nspname = @schema AND c.conname = @constraintName";

            using var tableCommand = new NpgsqlCommand(tableQuery, connection);
            tableCommand.Parameters.AddWithValue("@schema", schema);
            tableCommand.Parameters.AddWithValue("@constraintName", constraintName);

            var tableCount = await tableCommand.ExecuteScalarAsync(cancellationToken);
            var count = tableCount != null ? (long)tableCount : 0;

            result.Metadata["ValidTableReference"] = count > 0;

            if (count == 0)
            {
                result.Errors.Add("Constraint references non-existent table");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error checking constraint dependencies for {Schema}.{ConstraintName}", schema, constraintName);
        }
    }

    /// <summary>
    /// Builds a constraint definition statement
    /// </summary>
    private async Task<string> BuildConstraintDefinitionAsync(
        NpgsqlConnection connection,
        string schema,
        string constraintName,
        CancellationToken cancellationToken)
    {
        try
        {
            const string query = @"
                SELECT
                    c.contype as constraint_type,
                    t.relname as table_name,
                    c.consrc as check_clause,
                    c.conkey as constraint_columns,
                    c.confkey as referenced_columns,
                    c.confrelid as referenced_table_oid,
                    cr.relname as referenced_table_name,
                    c.condeferrable as is_deferrable,
                    c.condeferred as initially_deferred,
                    c.connoinherit as no_inherit
                FROM pg_constraint c
                JOIN pg_class t ON c.conrelid = t.oid
                JOIN pg_namespace n ON c.connamespace = n.oid
                LEFT JOIN pg_class cr ON c.confrelid = cr.oid
                WHERE n.nspname = @schema AND c.conname = @constraintName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schema", schema);
            command.Parameters.AddWithValue("@constraintName", constraintName);

            using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                var constraintType = reader.GetString(0);
                var tableName = reader.GetString(1);

                switch (constraintType)
                {
                    case "c": // Check constraint
                        var checkClause = reader.IsDBNull(2) ? string.Empty : reader.GetString(2);
                        return $"ALTER TABLE \"{schema}\".\"{tableName}\" ADD CONSTRAINT \"{constraintName}\" CHECK ({checkClause});";

                    case "f": // Foreign Key
                        var constraintColumns = reader.IsDBNull(3) ? string.Empty : reader.GetString(3);
                        var referencedColumns = reader.IsDBNull(4) ? string.Empty : reader.GetString(4);
                        var referencedTable = reader.IsDBNull(6) ? string.Empty : reader.GetString(6);

                        var deferrableClause = "";
                        if (reader.GetBoolean(7))
                        {
                            deferrableClause = reader.GetBoolean(8) ? " INITIALLY DEFERRED" : " DEFERRABLE";
                        }

                        return $"ALTER TABLE \"{schema}\".\"{tableName}\" ADD CONSTRAINT \"{constraintName}\"" +
                               $" FOREIGN KEY ({constraintColumns}) REFERENCES \"{schema}\".\"{referencedTable}\" ({referencedColumns}){deferrableClause};";

                    case "p": // Primary Key
                        var pkColumns = reader.IsDBNull(3) ? string.Empty : reader.GetString(3);
                        return $"ALTER TABLE \"{schema}\".\"{tableName}\" ADD CONSTRAINT \"{constraintName}\" PRIMARY KEY ({pkColumns});";

                    case "u": // Unique
                        var uniqueColumns = reader.IsDBNull(3) ? string.Empty : reader.GetString(3);
                        return $"ALTER TABLE \"{schema}\".\"{tableName}\" ADD CONSTRAINT \"{constraintName}\" UNIQUE ({uniqueColumns});";

                    default:
                        return $"-- Unknown constraint type: {constraintType}";
                }
            }

            return $"-- Constraint definition not found: {constraintName}";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error building constraint definition for {Schema}.{ConstraintName}", schema, constraintName);
            return $"-- Error building constraint definition: {ex.Message}";
        }
    }
}