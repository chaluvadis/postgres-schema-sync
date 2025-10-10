namespace PostgreSqlSchemaCompareSync.Core.Comparison.Metadata;

/// <summary>
/// Specialized extractor for PostgreSQL sequence metadata
/// </summary>
public class SequenceMetadataExtractor(
    ILogger<SequenceMetadataExtractor> logger) : IMetadataExtractor, IObjectMetadataExtractor, IObjectValidator
{
    private readonly ILogger<SequenceMetadataExtractor> _logger = logger ?? throw new ArgumentNullException(nameof(logger));

    public ObjectType ObjectType => ObjectType.Sequence;

    /// <summary>
    /// Extracts sequence metadata from the database
    /// </summary>
    public async Task<IEnumerable<DatabaseObject>> ExtractAsync(
        NpgsqlConnection connection,
        string? schemaFilter,
        CancellationToken cancellationToken)
    {
        var sequences = new List<DatabaseObject>();

        const string query = @"
            SELECT
                s.sequence_name,
                s.sequence_schema,
                s.data_type,
                s.numeric_precision,
                s.numeric_scale,
                s.start_value,
                s.minimum_value,
                s.maximum_value,
                s.increment,
                s.cycle_option,
                obj_description(format('%I.%I', s.sequence_schema, s.sequence_name)::regclass) as description,
                s.sequence_owner,
                c.relcreated as creation_date,
                pg_sequence_last_value(format('%I.%I', s.sequence_schema, s.sequence_name)::regclass) as last_value,
                CASE WHEN s.cycle_option = 'YES' THEN true ELSE false END as is_cycled
            FROM information_schema.sequences s
            JOIN pg_class c ON c.relname = s.sequence_name
            JOIN pg_namespace n ON c.relnamespace = n.oid AND n.nspname = s.sequence_schema
            WHERE (@schemaFilter IS NULL OR s.sequence_schema = @schemaFilter)
              AND s.sequence_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
            ORDER BY s.sequence_schema, s.sequence_name";

        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

        using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var sequenceName = reader.GetString(0);
            var sequenceSchema = reader.GetString(1);

            sequences.Add(new DatabaseObject
            {
                Name = sequenceName,
                Schema = sequenceSchema,
                Type = ObjectType.Sequence,
                Database = connection.Database,
                Owner = reader.IsDBNull(11) ? string.Empty : reader.GetString(11),
                Definition = await BuildSequenceDefinitionAsync(connection, sequenceSchema, sequenceName, cancellationToken),
                CreatedAt = reader.IsDBNull(12) ? DateTime.UtcNow : reader.GetDateTime(12),
                Properties =
                {
                    ["DataType"] = reader.GetString(2),
                    ["NumericPrecision"] = reader.IsDBNull(3) ? 0 : reader.GetInt32(3),
                    ["NumericScale"] = reader.IsDBNull(4) ? 0 : reader.GetInt32(4),
                    ["StartValue"] = reader.IsDBNull(5) ? 1 : reader.GetInt64(5),
                    ["MinimumValue"] = reader.IsDBNull(6) ? 1 : reader.GetInt64(6),
                    ["MaximumValue"] = reader.IsDBNull(7) ? 0L : reader.GetInt64(7),
                    ["Increment"] = reader.IsDBNull(8) ? 1 : reader.GetInt32(8),
                    ["CycleOption"] = reader.GetString(9),
                    ["Description"] = reader.IsDBNull(10) ? string.Empty : reader.GetString(10),
                    ["LastValue"] = reader.IsDBNull(13) ? 0 : reader.GetInt64(13),
                    ["IsCycled"] = reader.GetBoolean(14)
                }
            });
        }

        return sequences;
    }

    /// <summary>
    /// Extracts detailed sequence information
    /// </summary>
    public async Task<DatabaseObjectDetails> ExtractDetailsAsync(
        NpgsqlConnection connection,
        string schema,
        string sequenceName,
        CancellationToken cancellationToken)
    {
        var details = new DatabaseObjectDetails
        {
            Name = sequenceName,
            Schema = schema,
            Type = ObjectType.Sequence,
            Database = connection.Database,
            CreatedAt = DateTime.UtcNow
        };

        await ExtractSequenceDetailsAsync(connection, details, cancellationToken);
        return details;
    }

    /// <summary>
    /// Validates sequence objects
    /// </summary>
    public async Task<ObjectValidationResult> ValidateAsync(
        NpgsqlConnection connection,
        DatabaseObject sequence,
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
            _logger.LogDebug("Validating sequence {Schema}.{SequenceName}", sequence.Schema, sequence.Name);

            // Check if sequence exists and is accessible
            const string query = @"
                SELECT COUNT(*)
                FROM information_schema.sequences s
                JOIN pg_class c ON c.relname = s.sequence_name
                JOIN pg_namespace n ON c.relnamespace = n.oid AND n.nspname = s.sequence_schema
                WHERE s.sequence_schema = @schema AND s.sequence_name = @sequenceName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schema", sequence.Schema);
            command.Parameters.AddWithValue("@sequenceName", sequence.Name);

            var countResult = await command.ExecuteScalarAsync(cancellationToken);
            var count = countResult != null ? (long)countResult : 0;

            if (count == 0)
            {
                result.IsValid = false;
                result.Errors.Add("Sequence does not exist or is not accessible");
            }
            else
            {
                result.Metadata["SequenceExists"] = true;

                // Get advanced sequence information
                const string advancedQuery = @"
                    SELECT
                        s.data_type,
                        s.is_called,
                        pg_sequence_last_value(format('%I.%I', s.sequence_schema, s.sequence_name)::regclass) as last_value,
                        CASE WHEN s.cycle_option = 'YES' THEN true ELSE false END as is_cycled,
                        c.relowner as owner_oid,
                        c.relacl as access_privileges
                    FROM information_schema.sequences s
                    JOIN pg_class c ON c.relname = s.sequence_name
                    WHERE s.sequence_schema = @schema AND s.sequence_name = @sequenceName";

                using var advCommand = new NpgsqlCommand(advancedQuery, connection);
                advCommand.Parameters.AddWithValue("@schema", sequence.Schema);
                advCommand.Parameters.AddWithValue("@sequenceName", sequence.Name);

                using var advReader = await advCommand.ExecuteReaderAsync(cancellationToken);
                if (await advReader.ReadAsync(cancellationToken))
                {
                    result.Metadata["DataType"] = advReader.GetString(0);
                    result.Metadata["IsCalled"] = advReader.GetBoolean(1);
                    result.Metadata["LastValue"] = advReader.IsDBNull(2) ? 0 : advReader.GetInt64(2);
                    result.Metadata["IsCycled"] = advReader.GetBoolean(3);
                    result.Metadata["OwnerOid"] = advReader.GetInt32(4);
                    result.Metadata["AccessPrivileges"] = advReader.IsDBNull(5) ? string.Empty : advReader.GetString(5);

                    // Add warnings for potential issues
                    if (advReader.GetBoolean(1))
                        result.Warnings.Add("Sequence has been called - may have gaps in sequence values");

                    if (advReader.GetBoolean(3))
                        result.Warnings.Add("Sequence is cyclic - will restart after reaching maximum value");
                }

                // Check for dependencies (tables using this sequence)
                await ValidateSequenceDependenciesAsync(connection, sequence.Schema, sequence.Name, result, cancellationToken);
            }

            result.Metadata["ValidationDate"] = DateTime.UtcNow;
            result.Metadata["ObjectType"] = sequence.Type.ToString();

            _logger.LogDebug("Validation completed for sequence {Schema}.{SequenceName}: Valid={IsValid}",
                sequence.Schema, sequence.Name, result.IsValid);

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to validate sequence {Schema}.{SequenceName}", sequence.Schema, sequence.Name);

            result.IsValid = false;
            result.Errors.Add($"Validation error: {ex.Message}");
            return result;
        }
    }

    /// <summary>
    /// Extracts detailed sequence information including dependencies
    /// </summary>
    private async Task ExtractSequenceDetailsAsync(
        NpgsqlConnection connection,
        DatabaseObjectDetails details,
        CancellationToken cancellationToken)
    {
        // Get sequence dependencies (columns that use this sequence)
        const string dependencyQuery = @"
            SELECT
                t.table_name,
                c.column_name,
                c.data_type,
                tc.table_schema
            FROM information_schema.columns c
            JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
            JOIN information_schema.table_constraints tc ON tc.table_name = t.table_name AND tc.table_schema = t.table_schema
            WHERE c.column_default LIKE '%' || @sequenceName || '%'
              AND tc.constraint_type = 'CHECK'
              AND c.table_schema = @schema
            ORDER BY t.table_name, c.column_name";

        using var depCommand = new NpgsqlCommand(dependencyQuery, connection);
        depCommand.Parameters.AddWithValue("@sequenceName", details.Name);
        depCommand.Parameters.AddWithValue("@schema", details.Schema);

        using var depReader = await depCommand.ExecuteReaderAsync(cancellationToken);
        var dependencies = new List<string>();
        while (await depReader.ReadAsync(cancellationToken))
        {
            var tableName = depReader.GetString(0);
            var columnName = depReader.GetString(1);
            var tableSchema = depReader.GetString(3);
            dependencies.Add($"{tableSchema}.{tableName}.{columnName}");
        }

        if (dependencies.Any())
        {
            details.AdditionalInfo["Dependencies"] = string.Join("; ", dependencies);
            details.AdditionalInfo["DependencyCount"] = dependencies.Count;
        }

        // Get sequence privileges
        const string privilegeQuery = @"
            SELECT
                c.grantee,
                c.privilege_type,
                c.is_grantable
            FROM information_schema.usage_privileges c
            WHERE c.object_name = @sequenceName
              AND c.object_schema = @schema
              AND c.object_type = 'SEQUENCE'
            ORDER BY c.grantee, c.privilege_type";

        using var privilegeCommand = new NpgsqlCommand(privilegeQuery, connection);
        privilegeCommand.Parameters.AddWithValue("@sequenceName", details.Name);
        privilegeCommand.Parameters.AddWithValue("@schema", details.Schema);

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
    /// Validates sequence dependencies
    /// </summary>
    private async Task ValidateSequenceDependenciesAsync(
        NpgsqlConnection connection,
        string schema,
        string sequenceName,
        ObjectValidationResult result,
        CancellationToken cancellationToken)
    {
        try
        {
            // Check if sequence is used by any tables
            const string dependencyQuery = @"
                SELECT COUNT(*)
                FROM information_schema.columns c
                WHERE c.column_default LIKE '%' || @sequenceName || '%'
                  AND c.table_schema = @schema";

            using var depCommand = new NpgsqlCommand(dependencyQuery, connection);
            depCommand.Parameters.AddWithValue("@sequenceName", sequenceName);
            depCommand.Parameters.AddWithValue("@schema", schema);

            var dependencyCount = await depCommand.ExecuteScalarAsync(cancellationToken);
            var count = dependencyCount != null ? (long)dependencyCount : 0;

            result.Metadata["DependencyCount"] = count;

            if (count == 0)
            {
                result.Warnings.Add("Sequence is not used by any table columns - may be unused");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error checking sequence dependencies for {Schema}.{SequenceName}", schema, sequenceName);
            result.Warnings.Add($"Could not verify sequence dependencies: {ex.Message}");
        }
    }

    /// <summary>
    /// Builds a CREATE SEQUENCE statement for the sequence
    /// </summary>
    private async Task<string> BuildSequenceDefinitionAsync(
        NpgsqlConnection connection,
        string schema,
        string sequenceName,
        CancellationToken cancellationToken)
    {
        try
        {
            // Get detailed sequence parameters for CREATE statement
            const string detailQuery = @"
                SELECT
                    s.start_value,
                    s.minimum_value,
                    s.maximum_value,
                    s.increment,
                    CASE WHEN s.cycle_option = 'YES' THEN 'CYCLE' ELSE 'NO CYCLE' END as cycle_option,
                    s.data_type,
                    s.numeric_precision,
                    s.numeric_scale
                FROM information_schema.sequences s
                WHERE s.sequence_schema = @schema AND s.sequence_name = @sequenceName";

            using var detailCommand = new NpgsqlCommand(detailQuery, connection);
            detailCommand.Parameters.AddWithValue("@schema", schema);
            detailCommand.Parameters.AddWithValue("@sequenceName", sequenceName);

            using var detailReader = await detailCommand.ExecuteReaderAsync(cancellationToken);
            if (await detailReader.ReadAsync(cancellationToken))
            {
                var startValue = detailReader.GetInt64(0);
                var minimumValue = detailReader.GetInt64(1);
                var maximumValue = detailReader.GetInt64(2);
                var increment = detailReader.GetInt32(3);
                var cycleOption = detailReader.GetString(4);
                var dataType = detailReader.GetString(5);

                return $"CREATE SEQUENCE \"{schema}\".\"{sequenceName}\"" +
                       $" AS {dataType}" +
                       $" START WITH {startValue}" +
                       $" INCREMENT BY {increment}" +
                       $" MINVALUE {minimumValue}" +
                       $" MAXVALUE {maximumValue}" +
                       $" {cycleOption};";
            }

            // Fallback if detailed query fails
            return $"CREATE SEQUENCE \"{schema}\".\"{sequenceName}\";";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error building sequence definition for {Schema}.{SequenceName}", schema, sequenceName);
            return $"CREATE SEQUENCE \"{schema}\".\"{sequenceName}\";";
        }
    }
}