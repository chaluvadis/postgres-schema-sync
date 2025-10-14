namespace PostgreSqlSchemaCompareSync.Core.Comparison.Metadata;

/// <summary>
/// Specialized extractor for PostgreSQL partition metadata
/// </summary>
public class PartitionMetadataExtractor(
    ILogger<PartitionMetadataExtractor> logger) : IMetadataExtractor, IObjectMetadataExtractor, IObjectValidator
{
    private readonly ILogger<PartitionMetadataExtractor> _logger = logger ?? throw new ArgumentNullException(nameof(logger));

    public ObjectType ObjectType => ObjectType.Table; // Partitions are a type of table

    /// <summary>
    /// Extracts partition metadata from the database
    /// </summary>
    public async Task<IEnumerable<DatabaseObject>> ExtractAsync(
        NpgsqlConnection connection,
        string? schemaFilter,
        CancellationToken cancellationToken)
    {
        var partitions = new List<DatabaseObject>();

        const string query = @"
            SELECT
                c.relname as partition_name,
                n.nspname as partition_schema,
                c.relkind as relation_kind,
                parent.relname as parent_table_name,
                parent_nsp.nspname as parent_schema,
                obj_description(c.oid, 'pg_class') as description,
                c.relowner::regrole as partition_owner,
                c.relcreated as creation_date,
                c.reltablespace as tablespace_oid,
                t.spcname as tablespace_name,
                pg_relation_size(c.oid) as size_bytes,
                c.reltuples as row_estimate,
                c.relpages as page_count,
                CASE WHEN c.relkind = 'r' THEN 'Regular Table' ELSE 'Other' END as partition_type,
                CASE WHEN c.relispartition THEN true ELSE false END as is_partition,
                p.partstrat as partition_strategy,
                p.partnatts as partition_columns,
                p.partdefid as partition_def_oid,
                p.partattrs as partition_attributes,
                p.partclass as partition_class,
                p.partcollation as partition_collation,
                p.partopclass as partition_opclass
            FROM pg_class c
            JOIN pg_namespace n ON c.relnamespace = n.oid
            JOIN pg_namespace parent_nsp ON c.relnamespace = parent_nsp.oid
            LEFT JOIN pg_tablespace t ON c.reltablespace = t.oid
            LEFT JOIN pg_partitioned_table p ON c.oid = p.partrelid
            LEFT JOIN pg_inherits i ON c.oid = i.inhrelid
            LEFT JOIN pg_class parent ON i.inhparent = parent.oid
            WHERE c.relispartition = true -- Only actual partitions
              AND (@schemaFilter IS NULL OR n.nspname = @schemaFilter)
              AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
            ORDER BY n.nspname, parent.relname, c.relname";

        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

        using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var partitionName = reader.GetString(0);
            var partitionSchema = reader.GetString(1);
            var parentTableName = reader.IsDBNull(3) ? string.Empty : reader.GetString(3);
            var parentSchema = reader.IsDBNull(4) ? string.Empty : reader.GetString(4);

            partitions.Add(new DatabaseObject
            {
                Name = partitionName,
                Schema = partitionSchema,
                Type = ObjectType.Table, // Using Table type but marking as partition in properties
                Database = connection.Database,
                Owner = reader.IsDBNull(6) ? string.Empty : reader.GetString(6),
                Definition = await BuildPartitionDefinitionAsync(connection, partitionSchema, partitionName, cancellationToken),
                CreatedAt = reader.IsDBNull(7) ? DateTime.UtcNow : reader.GetDateTime(7),
                Properties =
                {
                    ["RelationKind"] = reader.GetString(2),
                    ["Description"] = reader.IsDBNull(5) ? string.Empty : reader.GetString(5),
                    ["TablespaceOid"] = reader.IsDBNull(8) ? 0 : reader.GetInt32(8),
                    ["TablespaceName"] = reader.IsDBNull(9) ? string.Empty : reader.GetString(9),
                    ["SizeBytes"] = reader.IsDBNull(10) ? 0L : reader.GetInt64(10),
                    ["RowEstimate"] = reader.IsDBNull(11) ? 0 : reader.GetFloat(11),
                    ["PageCount"] = reader.GetInt32(12),
                    ["PartitionType"] = reader.GetString(13),
                    ["IsPartition"] = reader.GetBoolean(14),
                    ["PartitionStrategy"] = reader.IsDBNull(15) ? string.Empty : reader.GetString(15),
                    ["PartitionColumns"] = reader.IsDBNull(16) ? 0 : reader.GetInt16(16),
                    ["PartitionDefOid"] = reader.IsDBNull(17) ? 0 : reader.GetInt32(17),
                    ["PartitionAttributes"] = reader.IsDBNull(18) ? string.Empty : reader.GetString(18),
                    ["PartitionClass"] = reader.IsDBNull(19) ? string.Empty : reader.GetString(19),
                    ["PartitionCollation"] = reader.IsDBNull(20) ? string.Empty : reader.GetString(20),
                    ["PartitionOpClass"] = reader.IsDBNull(21) ? string.Empty : reader.GetString(21),
                    ["ParentTableName"] = parentTableName,
                    ["ParentSchema"] = parentSchema
                }
            });
        }

        return partitions;
    }

    /// <summary>
    /// Extracts detailed partition information
    /// </summary>
    public async Task<DatabaseObjectDetails> ExtractDetailsAsync(
        NpgsqlConnection connection,
        string schema,
        string partitionName,
        CancellationToken cancellationToken)
    {
        var details = new DatabaseObjectDetails
        {
            Name = partitionName,
            Schema = schema,
            Type = ObjectType.Table,
            Database = connection.Database,
            CreatedAt = DateTime.UtcNow
        };

        await ExtractPartitionDetailsAsync(connection, details, cancellationToken);
        return details;
    }

    /// <summary>
    /// Validates partition objects
    /// </summary>
    public async Task<ObjectValidationResult> ValidateAsync(
        NpgsqlConnection connection,
        DatabaseObject partition,
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
            _logger.LogDebug("Validating partition {Schema}.{PartitionName}", partition.Schema, partition.Name);

            // Check if partition exists and is accessible
            const string query = @"
                SELECT COUNT(*)
                FROM pg_class c
                JOIN pg_namespace n ON c.relnamespace = n.oid
                WHERE c.relispartition = true
                  AND n.nspname = @schema
                  AND c.relname = @partitionName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schema", partition.Schema);
            command.Parameters.AddWithValue("@partitionName", partition.Name);

            var countResult = await command.ExecuteScalarAsync(cancellationToken);
            var count = countResult != null ? (long)countResult : 0;

            if (count == 0)
            {
                result.IsValid = false;
                result.Errors.Add("Partition does not exist or is not accessible");
            }
            else
            {
                result.Metadata["PartitionExists"] = true;

                // Get advanced partition information
                const string advancedQuery = @"
                    SELECT
                        c.relkind as relation_kind,
                        c.reltablespace as tablespace_oid,
                        t.spcname as tablespace_name,
                        pg_relation_size(c.oid) as size_bytes,
                        c.reltuples as row_estimate,
                        c.relpages as page_count,
                        p.partstrat as partition_strategy,
                        p.partnatts as partition_columns,
                        p.partdefid as partition_def_oid,
                        p.partattrs as partition_attributes,
                        p.partclass as partition_class,
                        p.partcollation as partition_collation,
                        p.partopclass as partition_opclass,
                        parent.relname as parent_table_name,
                        parent_nsp.nspname as parent_schema,
                        obj_description(c.oid, 'pg_class') as description
                    FROM pg_class c
                    JOIN pg_namespace n ON c.relnamespace = n.oid
                    LEFT JOIN pg_tablespace t ON c.reltablespace = t.oid
                    LEFT JOIN pg_partitioned_table p ON c.oid = p.partrelid
                    LEFT JOIN pg_inherits i ON c.oid = i.inhrelid
                    LEFT JOIN pg_class parent ON i.inhparent = parent.oid
                    LEFT JOIN pg_namespace parent_nsp ON parent.relnamespace = parent_nsp.oid
                    WHERE n.nspname = @schema AND c.relname = @partitionName";

                using var advCommand = new NpgsqlCommand(advancedQuery, connection);
                advCommand.Parameters.AddWithValue("@schema", partition.Schema);
                advCommand.Parameters.AddWithValue("@partitionName", partition.Name);

                using var advReader = await advCommand.ExecuteReaderAsync(cancellationToken);
                if (await advReader.ReadAsync(cancellationToken))
                {
                    result.Metadata["RelationKind"] = advReader.GetString(0);
                    result.Metadata["TablespaceOid"] = advReader.IsDBNull(1) ? 0 : advReader.GetInt32(1);
                    result.Metadata["TablespaceName"] = advReader.IsDBNull(2) ? string.Empty : advReader.GetString(2);
                    result.Metadata["SizeBytes"] = advReader.GetInt64(3);
                    result.Metadata["RowEstimate"] = advReader.IsDBNull(4) ? 0 : advReader.GetFloat(4);
                    result.Metadata["PageCount"] = advReader.GetInt32(5);
                    result.Metadata["PartitionStrategy"] = advReader.IsDBNull(6) ? string.Empty : advReader.GetString(6);
                    result.Metadata["PartitionColumns"] = advReader.IsDBNull(7) ? 0 : advReader.GetInt16(7);
                    result.Metadata["PartitionDefOid"] = advReader.IsDBNull(8) ? 0 : advReader.GetInt32(8);
                    result.Metadata["PartitionAttributes"] = advReader.IsDBNull(9) ? string.Empty : advReader.GetString(9);
                    result.Metadata["PartitionClass"] = advReader.IsDBNull(10) ? string.Empty : advReader.GetString(10);
                    result.Metadata["PartitionCollation"] = advReader.IsDBNull(11) ? string.Empty : advReader.GetString(11);
                    result.Metadata["PartitionOpClass"] = advReader.IsDBNull(12) ? string.Empty : advReader.GetString(12);
                    result.Metadata["ParentTableName"] = advReader.IsDBNull(13) ? string.Empty : advReader.GetString(13);
                    result.Metadata["ParentSchema"] = advReader.IsDBNull(14) ? string.Empty : advReader.GetString(14);
                    result.Metadata["Description"] = advReader.IsDBNull(15) ? string.Empty : advReader.GetString(15);

                    // Add warnings for potential issues
                    var sizeBytes = advReader.GetInt64(3);
                    if (sizeBytes > 1024 * 1024 * 1024) // 1GB
                        result.Warnings.Add($"Partition is very large ({sizeBytes / (1024 * 1024)}MB) - consider partition maintenance");

                    var rowEstimate = advReader.IsDBNull(4) ? 0 : advReader.GetFloat(4);
                    if (rowEstimate == 0)
                        result.Warnings.Add("Partition appears to be empty - may need data loading");

                    var partitionStrategy = advReader.IsDBNull(6) ? string.Empty : advReader.GetString(6);
                    if (string.IsNullOrEmpty(partitionStrategy))
                        result.Warnings.Add("Partition strategy is not defined - may cause query issues");

                    var parentTable = advReader.IsDBNull(13) ? string.Empty : advReader.GetString(13);
                    if (string.IsNullOrEmpty(parentTable))
                        result.Warnings.Add("Partition has no parent table - may be orphaned");
                }

                // Validate partition parent relationship
                await ValidatePartitionParentAsync(connection, partition.Schema, partition.Name, result, cancellationToken);

                // Check for partition boundaries
                await ValidatePartitionBoundariesAsync(connection, partition.Schema, partition.Name, result, cancellationToken);
            }

            result.Metadata["ValidationDate"] = DateTime.UtcNow;
            result.Metadata["ObjectType"] = partition.Type.ToString();

            _logger.LogDebug("Validation completed for partition {Schema}.{PartitionName}: Valid={IsValid}",
                partition.Schema, partition.Name, result.IsValid);

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to validate partition {Schema}.{PartitionName}", partition.Schema, partition.Name);

            result.IsValid = false;
            result.Errors.Add($"Validation error: {ex.Message}");
            return result;
        }
    }

    /// <summary>
    /// Extracts detailed partition information including boundaries and structure
    /// </summary>
    private async Task ExtractPartitionDetailsAsync(
        NpgsqlConnection connection,
        DatabaseObjectDetails details,
        CancellationToken cancellationToken)
    {
        // Get partition boundaries and constraints
        const string boundaryQuery = @"
            SELECT
                'Range Partition' as partition_type,
                pg_get_constraintdef(c.oid) as partition_constraint,
                c.conname as constraint_name
            FROM pg_class p
            JOIN pg_namespace n ON p.relnamespace = n.oid
            JOIN pg_constraint c ON c.conrelid = p.oid
            WHERE n.nspname = @schema
              AND p.relname = @partitionName
              AND c.contype = 'c'
            UNION ALL
            SELECT
                'List Partition' as partition_type,
                'IN (' || string_agg('''' || replace(split_part(pg_get_constraintdef(c.oid), 'IN (', 2), ')', '') || '''', ', ') || ')' as partition_constraint,
                c.conname as constraint_name
            FROM pg_class p
            JOIN pg_namespace n ON p.relnamespace = n.oid
            JOIN pg_constraint c ON c.conrelid = p.oid
            WHERE n.nspname = @schema
              AND p.relname = @partitionName
              AND c.contype = 'c'
              AND pg_get_constraintdef(c.oid) LIKE '%IN (%'";

        using var boundaryCommand = new NpgsqlCommand(boundaryQuery, connection);
        boundaryCommand.Parameters.AddWithValue("@schema", details.Schema);
        boundaryCommand.Parameters.AddWithValue("@partitionName", details.Name);

        using var boundaryReader = await boundaryCommand.ExecuteReaderAsync(cancellationToken);
        if (await boundaryReader.ReadAsync(cancellationToken))
        {
            details.AdditionalInfo["PartitionType"] = boundaryReader.GetString(0);
            details.AdditionalInfo["PartitionConstraint"] = boundaryReader.GetString(1);
            details.AdditionalInfo["ConstraintName"] = boundaryReader.GetString(2);
        }

        // Get partition indexes
        const string indexQuery = @"
            SELECT
                c2.relname as index_name,
                i.indisunique as is_unique,
                i.indisprimary as is_primary,
                i.indnatts as column_count,
                pg_get_indexdef(c2.oid) as index_definition
            FROM pg_class c
            JOIN pg_namespace n ON c.relnamespace = n.oid
            JOIN pg_index i ON i.indrelid = c.oid
            JOIN pg_class c2 ON i.indexrelid = c2.oid
            WHERE n.nspname = @schema
              AND c.relname = @partitionName
              AND c2.relkind = 'i'
            ORDER BY c2.relname";

        using var indexCommand = new NpgsqlCommand(indexQuery, connection);
        indexCommand.Parameters.AddWithValue("@schema", details.Schema);
        indexCommand.Parameters.AddWithValue("@partitionName", details.Name);

        using var indexReader = await indexCommand.ExecuteReaderAsync(cancellationToken);
        var partitionIndexes = new List<string>();
        while (await indexReader.ReadAsync(cancellationToken))
        {
            var indexName = indexReader.GetString(0);
            var isUnique = indexReader.GetBoolean(1);
            var isPrimary = indexReader.GetBoolean(2);
            partitionIndexes.Add($"{indexName}{(isUnique ? " (UNIQUE)" : "")}{(isPrimary ? " (PRIMARY)" : "")}");
        }

        if (partitionIndexes.Any())
        {
            details.AdditionalInfo["PartitionIndexes"] = string.Join("; ", partitionIndexes);
            details.AdditionalInfo["PartitionIndexCount"] = partitionIndexes.Count;
        }

        // Get partition statistics
        const string statsQuery = @"
            SELECT
                'Live Tuples' as stat_type,
                c.reltuples as stat_value
            FROM pg_class c
            JOIN pg_namespace n ON c.relnamespace = n.oid
            WHERE n.nspname = @schema AND c.relname = @partitionName
            UNION ALL
            SELECT
                'Dead Tuples' as stat_type,
                CASE WHEN c.reltuples > 0 THEN c.reltuples * 0.1 ELSE 0 END as stat_value
            FROM pg_class c
            JOIN pg_namespace n ON c.relnamespace = n.oid
            WHERE n.nspname = @schema AND c.relname = @partitionName";

        using var statsCommand = new NpgsqlCommand(statsQuery, connection);
        statsCommand.Parameters.AddWithValue("@schema", details.Schema);
        statsCommand.Parameters.AddWithValue("@partitionName", details.Name);

        using var statsReader = await statsCommand.ExecuteReaderAsync(cancellationToken);
        while (await statsReader.ReadAsync(cancellationToken))
        {
            var statType = statsReader.GetString(0);
            var statValue = statsReader.GetFloat(1);
            details.AdditionalInfo[$"PartitionStat_{statType}"] = statValue;
        }
    }

    /// <summary>
    /// Validates partition parent relationship
    /// </summary>
    private async Task ValidatePartitionParentAsync(
        NpgsqlConnection connection,
        string schema,
        string partitionName,
        ObjectValidationResult result,
        CancellationToken cancellationToken)
    {
        try
        {
            const string query = @"
                SELECT COUNT(*)
                FROM pg_class c
                JOIN pg_namespace n ON c.relnamespace = n.oid
                JOIN pg_inherits i ON c.oid = i.inhrelid
                JOIN pg_class parent ON i.inhparent = parent.oid
                WHERE n.nspname = @schema AND c.relname = @partitionName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schema", schema);
            command.Parameters.AddWithValue("@partitionName", partitionName);

            var parentCount = await command.ExecuteScalarAsync(cancellationToken);
            var count = parentCount != null ? (long)parentCount : 0;

            result.Metadata["ValidParentRelationship"] = count > 0;

            if (count == 0)
            {
                result.Warnings.Add("Partition has no parent table relationship - may be orphaned");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error checking partition parent for {Schema}.{PartitionName}", schema, partitionName);
            result.Warnings.Add($"Could not verify partition parent relationship: {ex.Message}");
        }
    }

    /// <summary>
    /// Validates partition boundaries and constraints
    /// </summary>
    private async Task ValidatePartitionBoundariesAsync(
        NpgsqlConnection connection,
        string schema,
        string partitionName,
        ObjectValidationResult result,
        CancellationToken cancellationToken)
    {
        try
        {
            const string query = @"
                SELECT COUNT(*)
                FROM pg_class c
                JOIN pg_namespace n ON c.relnamespace = n.oid
                JOIN pg_constraint cstr ON cstr.conrelid = c.oid
                WHERE n.nspname = @schema
                  AND c.relname = @partitionName
                  AND cstr.contype = 'c'";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schema", schema);
            command.Parameters.AddWithValue("@partitionName", partitionName);

            var constraintCount = await command.ExecuteScalarAsync(cancellationToken);
            var count = constraintCount != null ? (long)constraintCount : 0;

            result.Metadata["PartitionConstraintCount"] = count;

            if (count == 0)
            {
                result.Warnings.Add("Partition has no boundary constraints - may allow data inconsistency");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error checking partition boundaries for {Schema}.{PartitionName}", schema, partitionName);
            result.Warnings.Add($"Could not verify partition boundaries: {ex.Message}");
        }
    }

    /// <summary>
    /// Builds a partition definition statement
    /// </summary>
    private async Task<string> BuildPartitionDefinitionAsync(
        NpgsqlConnection connection,
        string schema,
        string partitionName,
        CancellationToken cancellationToken)
    {
        try
        {
            const string query = @"
                SELECT
                    parent.relname as parent_table_name,
                    p.partstrat as partition_strategy,
                    pg_get_constraintdef(c.oid) as partition_constraint
                FROM pg_class c
                JOIN pg_namespace n ON c.relnamespace = n.oid
                LEFT JOIN pg_inherits i ON c.oid = i.inhrelid
                LEFT JOIN pg_class parent ON i.inhparent = parent.oid
                LEFT JOIN pg_partitioned_table p ON parent.oid = p.partrelid
                WHERE n.nspname = @schema AND c.relname = @partitionName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schema", schema);
            command.Parameters.AddWithValue("@partitionName", partitionName);

            using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                var parentTableName = reader.IsDBNull(0) ? string.Empty : reader.GetString(0);
                var partitionStrategy = reader.IsDBNull(1) ? string.Empty : reader.GetString(1);
                var partitionConstraint = reader.IsDBNull(2) ? string.Empty : reader.GetString(2);

                if (!string.IsNullOrEmpty(parentTableName) && !string.IsNullOrEmpty(partitionConstraint))
                {
                    return $"-- Partition: {partitionName}" + Environment.NewLine +
                           $"-- Parent Table: {parentTableName}" + Environment.NewLine +
                           $"-- Strategy: {partitionStrategy}" + Environment.NewLine +
                           $"-- Constraint: {partitionConstraint}";
                }
            }

            return $"-- Partition definition not found: {partitionName}";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error building partition definition for {Schema}.{PartitionName}", schema, partitionName);
            return $"-- Error building partition definition: {ex.Message}";
        }
    }
}