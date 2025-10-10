namespace PostgreSqlSchemaCompareSync.Core.Comparison.Metadata;

/// <summary>
/// Specialized extractor for PostgreSQL index metadata
/// </summary>
public class IndexMetadataExtractor(
    ILogger<IndexMetadataExtractor> logger) : IMetadataExtractor, IObjectMetadataExtractor, IObjectValidator
{
    private readonly ILogger<IndexMetadataExtractor> _logger = logger ?? throw new ArgumentNullException(nameof(logger));

    public ObjectType ObjectType => ObjectType.Index;

    /// <summary>
    /// Extracts index metadata from the database
    /// </summary>
    public async Task<IEnumerable<DatabaseObject>> ExtractAsync(
        NpgsqlConnection connection,
        string? schemaFilter,
        CancellationToken cancellationToken)
    {
        var indexes = new List<DatabaseObject>();

        const string query = @"
            SELECT
                c.relname as index_name,
                n.nspname as index_schema,
                t.relname as table_name,
                t_nsp.nspname as table_schema,
                c.relkind as index_type,
                i.indisunique as is_unique,
                i.indisprimary as is_primary,
                i.indisexclusion as is_exclusion,
                i.indnatts as column_count,
                pg_get_indexdef(c.oid) as index_definition,
                obj_description(c.oid, 'pg_class') as description,
                c.relowner::regrole as index_owner,
                c.relcreated as creation_date,
                pg_relation_size(c.oid) as index_size_bytes,
                i.indnkeyatts as key_column_count,
                am.amname as access_method,
                i.indoption as index_options,
                i.indcollation as index_collation,
                i.indclass as index_opclass
            FROM pg_class c
            JOIN pg_namespace n ON c.relnamespace = n.oid
            JOIN pg_index i ON c.oid = i.indexrelid
            JOIN pg_class t ON i.indrelid = t.oid
            JOIN pg_namespace t_nsp ON t.relnamespace = t_nsp.oid
            JOIN pg_am am ON c.relam = am.oid
            WHERE c.relkind = 'i'
              AND (@schemaFilter IS NULL OR n.nspname = @schemaFilter)
              AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
            ORDER BY n.nspname, c.relname";

        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

        using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var indexName = reader.GetString(0);
            var indexSchema = reader.GetString(1);
            var tableName = reader.GetString(2);
            var tableSchema = reader.GetString(3);

            indexes.Add(new DatabaseObject
            {
                Name = indexName,
                Schema = indexSchema,
                Type = ObjectType.Index,
                Database = connection.Database,
                Owner = reader.IsDBNull(11) ? string.Empty : reader.GetString(11),
                Definition = reader.IsDBNull(9) ? string.Empty : reader.GetString(9),
                CreatedAt = reader.IsDBNull(12) ? DateTime.UtcNow : reader.GetDateTime(12),
                Properties =
                {
                    ["TableName"] = tableName,
                    ["TableSchema"] = tableSchema,
                    ["IndexType"] = reader.GetString(4),
                    ["IsUnique"] = reader.GetBoolean(5),
                    ["IsPrimary"] = reader.GetBoolean(6),
                    ["IsExclusion"] = reader.GetBoolean(7),
                    ["ColumnCount"] = reader.GetInt16(8),
                    ["Description"] = reader.IsDBNull(10) ? string.Empty : reader.GetString(10),
                    ["SizeBytes"] = reader.IsDBNull(13) ? 0L : reader.GetInt64(13),
                    ["KeyColumnCount"] = reader.GetInt16(14),
                    ["AccessMethod"] = reader.GetString(15),
                    ["IndexOptions"] = reader.IsDBNull(16) ? string.Empty : reader.GetString(16),
                    ["IndexCollation"] = reader.IsDBNull(17) ? 0 : reader.GetInt32(17),
                    ["IndexOpClass"] = reader.IsDBNull(18) ? string.Empty : reader.GetString(18)
                }
            });
        }

        return indexes;
    }

    /// <summary>
    /// Extracts detailed index information including columns
    /// </summary>
    public async Task<DatabaseObjectDetails> ExtractDetailsAsync(
        NpgsqlConnection connection,
        string schema,
        string indexName,
        CancellationToken cancellationToken)
    {
        var details = new DatabaseObjectDetails
        {
            Name = indexName,
            Schema = schema,
            Type = ObjectType.Index,
            Database = connection.Database,
            CreatedAt = DateTime.UtcNow
        };

        await ExtractIndexDetailsAsync(connection, details, cancellationToken);
        return details;
    }

    /// <summary>
    /// Validates index objects
    /// </summary>
    public async Task<ObjectValidationResult> ValidateAsync(
        NpgsqlConnection connection,
        DatabaseObject index,
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
            _logger.LogDebug("Validating index {Schema}.{IndexName}", index.Schema, index.Name);

            // Check if index exists and is accessible
            const string query = @"
                SELECT COUNT(*)
                FROM pg_class c
                JOIN pg_namespace n ON c.relnamespace = n.oid
                WHERE c.relkind = 'i'
                  AND n.nspname = @schema
                  AND c.relname = @indexName";

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

                // Get advanced index information
                const string advancedQuery = @"
                    SELECT
                        i.indisvalid as is_valid,
                        i.indisready as is_ready,
                        i.indisclustered as is_clustered,
                        i.indpred as partial_predicate,
                        pg_size_pretty(pg_relation_size(c.oid)) as index_size,
                        pg_relation_size(c.oid) as size_bytes,
                        i.indnatts as column_count,
                        i.indnkeyatts as key_column_count,
                        am.amname as access_method,
                        c.relpages as page_count,
                        c.reltuples as tuple_count
                    FROM pg_class c
                    JOIN pg_namespace n ON c.relnamespace = n.oid
                    JOIN pg_index i ON c.oid = i.indexrelid
                    JOIN pg_am am ON c.relam = am.oid
                    WHERE n.nspname = @schema AND c.relname = @indexName";

                using var advCommand = new NpgsqlCommand(advancedQuery, connection);
                advCommand.Parameters.AddWithValue("@schema", index.Schema);
                advCommand.Parameters.AddWithValue("@indexName", index.Name);

                using var advReader = await advCommand.ExecuteReaderAsync(cancellationToken);
                if (await advReader.ReadAsync(cancellationToken))
                {
                    var isValid = advReader.GetBoolean(0);
                    var isReady = advReader.GetBoolean(1);

                    result.Metadata["IsValid"] = isValid;
                    result.Metadata["IsReady"] = isReady;
                    result.Metadata["IsClustered"] = advReader.GetBoolean(2);
                    result.Metadata["PartialPredicate"] = advReader.IsDBNull(3) ? string.Empty : advReader.GetString(3);
                    result.Metadata["IndexSize"] = advReader.GetString(4);
                    result.Metadata["SizeBytes"] = advReader.GetInt64(5);
                    result.Metadata["ColumnCount"] = advReader.GetInt16(6);
                    result.Metadata["KeyColumnCount"] = advReader.GetInt16(7);
                    result.Metadata["AccessMethod"] = advReader.GetString(8);
                    result.Metadata["PageCount"] = advReader.GetInt32(9);
                    result.Metadata["TupleCount"] = advReader.IsDBNull(10) ? 0 : advReader.GetFloat(10);

                    // Add warnings for potential issues
                    if (!isValid)
                        result.Errors.Add("Index is invalid - may need to be rebuilt");

                    if (!isReady)
                        result.Warnings.Add("Index is not ready - may impact query performance");

                    if (advReader.GetInt64(5) > 100 * 1024 * 1024) // 100MB
                        result.Warnings.Add($"Index is very large ({advReader.GetString(4)}) - consider maintenance");
                }

                // Check for index usage statistics
                await ValidateIndexUsageAsync(connection, index.Schema, index.Name, result, cancellationToken);
            }

            result.Metadata["ValidationDate"] = DateTime.UtcNow;
            result.Metadata["ObjectType"] = index.Type.ToString();

            _logger.LogDebug("Validation completed for index {Schema}.{IndexName}: Valid={IsValid}",
                index.Schema, index.Name, result.IsValid);

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to validate index {Schema}.{IndexName}", index.Schema, index.Name);

            result.IsValid = false;
            result.Errors.Add($"Validation error: {ex.Message}");
            return result;
        }
    }

    /// <summary>
    /// Extracts detailed index information including columns and statistics
    /// </summary>
    private async Task ExtractIndexDetailsAsync(
        NpgsqlConnection connection,
        DatabaseObjectDetails details,
        CancellationToken cancellationToken)
    {
        // Get index columns with ordering and collation
        const string columnQuery = @"
            SELECT
                a.attname as column_name,
                i.indoption[i.indnatts - 1 - array_position(i.indkey, a.attnum)] & 1 = 1 as is_desc,
                CASE i.indoption[i.indnatts - 1 - array_position(i.indkey, a.attnum)]
                    WHEN 0 THEN 'ASC'
                    WHEN 1 THEN 'DESC'
                    ELSE 'UNKNOWN'
                END as sort_order,
                CASE i.indcollation[i.indnatts - 1 - array_position(i.indkey, a.attnum)]
                    WHEN 0 THEN 'default'
                    ELSE (SELECT collname FROM pg_collation WHERE oid = i.indcollation[i.indnatts - 1 - array_position(i.indkey, a.attnum)])
                END as collation_name,
                i.indclass[i.indnatts - 1 - array_position(i.indkey, a.attnum)] as opclass_oid,
                opc.opcname as opclass_name
            FROM pg_index i
            JOIN pg_class c ON c.oid = i.indexrelid
            JOIN pg_namespace n ON c.relnamespace = n.oid
            JOIN pg_attribute a ON a.attrelid = i.indrelid
            JOIN pg_opclass opc ON opc.oid = i.indclass[i.indnatts - 1 - array_position(i.indkey, a.attnum)]
            WHERE n.nspname = @schema
              AND c.relname = @indexName
              AND a.attnum = ANY(i.indkey)
            ORDER BY array_position(i.indkey, a.attnum)";

        using var columnCommand = new NpgsqlCommand(columnQuery, connection);
        columnCommand.Parameters.AddWithValue("@schema", details.Schema);
        columnCommand.Parameters.AddWithValue("@indexName", details.Name);

        using var columnReader = await columnCommand.ExecuteReaderAsync(cancellationToken);
        while (await columnReader.ReadAsync(cancellationToken))
        {
            var columnName = columnReader.GetString(0);
            var isDesc = columnReader.GetBoolean(1);
            var sortOrder = columnReader.GetString(2);
            var collation = columnReader.GetString(3);
            var opclass = columnReader.GetString(5);

            details.AdditionalInfo[$"Column_{columnName}_SortOrder"] = sortOrder;
            details.AdditionalInfo[$"Column_{columnName}_Collation"] = collation;
            details.AdditionalInfo[$"Column_{columnName}_OpClass"] = opclass;
        }

        // Get index statistics if available
        const string statsQuery = @"
            SELECT
                n_tup_ins as tuples_inserted,
                n_tup_upd as tuples_updated,
                n_tup_del as tuples_deleted,
                n_tup_hot_upd as hot_tuples_updated,
                n_tup_newpage_upd as newpage_tuples_updated
            FROM pg_stat_user_indexes
            WHERE schemaname = @schema AND indexname = @indexName";

        using var statsCommand = new NpgsqlCommand(statsQuery, connection);
        statsCommand.Parameters.AddWithValue("@schema", details.Schema);
        statsCommand.Parameters.AddWithValue("@indexName", details.Name);

        using var statsReader = await statsCommand.ExecuteReaderAsync(cancellationToken);
        if (await statsReader.ReadAsync(cancellationToken))
        {
            details.AdditionalInfo["TuplesInserted"] = statsReader.IsDBNull(0) ? 0 : statsReader.GetInt64(0);
            details.AdditionalInfo["TuplesUpdated"] = statsReader.IsDBNull(1) ? 0 : statsReader.GetInt64(1);
            details.AdditionalInfo["TuplesDeleted"] = statsReader.IsDBNull(2) ? 0 : statsReader.GetInt64(2);
            details.AdditionalInfo["HotTuplesUpdated"] = statsReader.IsDBNull(3) ? 0 : statsReader.GetInt64(3);
            details.AdditionalInfo["NewpageTuplesUpdated"] = statsReader.IsDBNull(4) ? 0 : statsReader.GetInt64(4);
        }
    }

    /// <summary>
    /// Validates index usage and performance
    /// </summary>
    private async Task ValidateIndexUsageAsync(
        NpgsqlConnection connection,
        string schema,
        string indexName,
        ObjectValidationResult result,
        CancellationToken cancellationToken)
    {
        try
        {
            // Check index usage statistics
            const string usageQuery = @"
                SELECT
                    idx_scan as index_scans,
                    idx_tup_read as tuples_read,
                    idx_tup_fetch as tuples_fetched
                FROM pg_stat_user_indexes
                WHERE schemaname = @schema AND indexname = @indexName";

            using var usageCommand = new NpgsqlCommand(usageQuery, connection);
            usageCommand.Parameters.AddWithValue("@schema", schema);
            usageCommand.Parameters.AddWithValue("@indexName", indexName);

            using var usageReader = await usageCommand.ExecuteReaderAsync(cancellationToken);
            if (await usageReader.ReadAsync(cancellationToken))
            {
                var scans = usageReader.IsDBNull(0) ? 0 : usageReader.GetInt64(0);
                var tuplesRead = usageReader.IsDBNull(1) ? 0 : usageReader.GetInt64(1);
                var tuplesFetched = usageReader.IsDBNull(2) ? 0 : usageReader.GetInt64(2);

                result.Metadata["IndexScans"] = scans;
                result.Metadata["TuplesRead"] = tuplesRead;
                result.Metadata["TuplesFetched"] = tuplesFetched;

                // Add warnings for potential issues
                if (scans == 0)
                    result.Warnings.Add("Index has never been used - may be unnecessary");

                if (tuplesRead > 0 && tuplesFetched == 0)
                    result.Warnings.Add("Index is being read but not used for fetching - may indicate selectivity issues");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error checking index usage for {Schema}.{IndexName}", schema, indexName);
            result.Warnings.Add($"Could not verify index usage statistics: {ex.Message}");
        }
    }
}