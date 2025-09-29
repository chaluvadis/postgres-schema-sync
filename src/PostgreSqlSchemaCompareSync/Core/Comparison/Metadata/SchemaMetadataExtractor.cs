namespace PostgreSqlSchemaCompareSync.Core.Comparison.Metadata;

public class SchemaMetadataExtractor(ILogger<SchemaMetadataExtractor> logger)
{
    private readonly ILogger<SchemaMetadataExtractor> _logger = logger;

    public async Task<List<DatabaseObject>> ExtractAllObjectsAsync(
        NpgsqlConnection connection,
        string? schemaFilter = null,
        CancellationToken cancellationToken = default)
    {
        var allObjects = new List<DatabaseObject>();
        try
        {
            // Extract different object types in parallel for better performance
            var extractionTasks = new List<Task<IEnumerable<DatabaseObject>>>
            {
                Task.FromResult<IEnumerable<DatabaseObject>>(ExtractTablesAsync(connection, schemaFilter, cancellationToken).Result),
                Task.FromResult<IEnumerable<DatabaseObject>>(ExtractViewsAsync(connection, schemaFilter, cancellationToken).Result),
                Task.FromResult<IEnumerable<DatabaseObject>>(ExtractFunctionsAsync(connection, schemaFilter, cancellationToken).Result),
                Task.FromResult<IEnumerable<DatabaseObject>>(ExtractProceduresAsync(connection, schemaFilter, cancellationToken).Result),
                Task.FromResult<IEnumerable<DatabaseObject>>(ExtractSequencesAsync(connection, schemaFilter, cancellationToken).Result),
                Task.FromResult<IEnumerable<DatabaseObject>>(ExtractTypesAsync(connection, schemaFilter, cancellationToken).Result),
                Task.FromResult<IEnumerable<DatabaseObject>>(ExtractIndexesAsync(connection, schemaFilter, cancellationToken).Result),
                Task.FromResult<IEnumerable<DatabaseObject>>(ExtractTriggersAsync(connection, schemaFilter, cancellationToken).Result)
            };
            var results = await Task.WhenAll(extractionTasks);
            foreach (var result in results)
            {
                allObjects.AddRange(result);
            }
            _logger.LogInformation("Extracted {ObjectCount} database objects", allObjects.Count);
            return allObjects;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to extract schema metadata");
            throw;
        }
    }
    public async Task<List<Table>> ExtractTablesAsync(
        NpgsqlConnection connection,
        string? schemaFilter = null,
        CancellationToken cancellationToken = default)
    {
        var tables = new List<Table>();
        try
        {
            var query = @"
                SELECT
                    t.table_name,
                    t.table_schema,
                    t.table_type,
                    obj_description(c.oid, 'pg_class') as table_comment,
                    t.table_owner,
                    c.reltuples as approximate_row_count,
                    pg_total_relation_size(c.oid) as table_size_bytes,
                    c.relpages as pages,
                    c.relhasindex as has_indexes,
                    c.relhasrules as has_rules,
                    c.relhastriggers as has_triggers
                FROM information_schema.tables t
                JOIN pg_class c ON t.table_name = c.relname AND t.table_schema = c.relnamespace::regnamespace::text
                JOIN pg_namespace n ON t.table_schema = n.nspname
                WHERE t.table_type = 'BASE TABLE'
                AND (@SchemaFilter IS NULL OR t.table_schema = @SchemaFilter)
                ORDER BY t.table_schema, t.table_name";
            using var cmd = new NpgsqlCommand(query, connection);
            cmd.Parameters.AddWithValue("@SchemaFilter",
                string.IsNullOrEmpty(schemaFilter) ? DBNull.Value : schemaFilter);
            using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var table = new Table
                {
                    Name = reader.GetString(0),
                    Schema = reader.GetString(1),
                    Type = ObjectType.Table,
                    Database = connection.Database,
                    Owner = reader.GetString(4),
                    SizeInBytes = reader.IsDBNull(6) ? null : reader.GetInt64(6),
                    Properties = new Dictionary<string, string>
                    {
                        ["Comment"] = reader.IsDBNull(3) ? "" : reader.GetString(3),
                        ["ApproximateRowCount"] = reader.IsDBNull(5) ? "0" : reader.GetInt64(5).ToString(),
                        ["Pages"] = reader.GetInt32(7).ToString(),
                        ["HasIndexes"] = reader.GetBoolean(8).ToString(),
                        ["HasRules"] = reader.GetBoolean(9).ToString(),
                        ["HasTriggers"] = reader.GetBoolean(10).ToString()
                    }
                };
                // Extract columns for this table
                table.Columns = await ExtractTableColumnsAsync(connection, table.Schema, table.Name, cancellationToken);
                tables.Add(table);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to extract tables");
            throw;
        }
        return tables;
    }
    private async Task<List<Column>> ExtractTableColumnsAsync(
        NpgsqlConnection connection,
        string schema,
        string tableName,
        CancellationToken cancellationToken)
    {
        var columns = new List<Column>();
        var query = @"
            SELECT
                c.column_name,
                c.data_type,
                c.is_nullable,
                c.column_default,
                c.character_maximum_length,
                c.numeric_precision,
                c.numeric_scale,
                c.is_identity,
                c.identity_generation,
                pg_catalog.col_description(c.table_oid, c.ordinal_position) as column_comment,
                CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key,
                CASE WHEN fk.column_name IS NOT NULL THEN true ELSE false END as is_foreign_key,
                fk.foreign_table_schema,
                fk.foreign_table_name,
                fk.foreign_column_name
            FROM information_schema.columns c
            LEFT JOIN (
                SELECT ku.column_name, ku.table_schema, ku.table_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name
                WHERE tc.constraint_type = 'PRIMARY KEY'
            ) pk ON c.column_name = pk.column_name AND c.table_schema = pk.table_schema AND c.table_name = pk.table_name
            LEFT JOIN (
                SELECT
                    kcu.column_name,
                    kcu.table_schema,
                    kcu.table_name,
                    ccu.table_schema as foreign_table_schema,
                    ccu.table_name as foreign_table_name,
                    ccu.column_name as foreign_column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
                WHERE tc.constraint_type = 'FOREIGN KEY'
            ) fk ON c.column_name = fk.column_name AND c.table_schema = fk.table_schema AND c.table_name = fk.table_name
            WHERE c.table_schema = @Schema AND c.table_name = @TableName
            ORDER BY c.ordinal_position";
        using var cmd = new NpgsqlCommand(query, connection);
        cmd.Parameters.AddWithValue("@Schema", schema);
        cmd.Parameters.AddWithValue("@TableName", tableName);
        using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var column = new Column
            {
                Name = reader.GetString(0),
                DataType = reader.GetString(1),
                IsNullable = reader.GetString(2) == "YES",
                DefaultValue = reader.IsDBNull(3) ? null : reader.GetString(3),
                MaxLength = reader.IsDBNull(4) ? null : reader.GetInt32(4),
                Precision = reader.IsDBNull(5) ? null : reader.GetInt32(5),
                Scale = reader.IsDBNull(6) ? null : reader.GetInt32(6),
                IsPrimaryKey = reader.GetBoolean(10),
                IsForeignKey = reader.GetBoolean(11),
                Comment = reader.IsDBNull(9) ? null : reader.GetString(9)
            };
            if (column.IsForeignKey && !reader.IsDBNull(12))
            {
                column.ForeignKeyReference = $"{reader.GetString(12)}.{reader.GetString(13)}.{reader.GetString(14)}";
            }
            columns.Add(column);
        }
        return columns;
    }
    public async Task<List<View>> ExtractViewsAsync(
        NpgsqlConnection connection,
        string? schemaFilter = null,
        CancellationToken cancellationToken = default)
    {
        var views = new List<View>();
        var query = @"
            SELECT
                v.table_name,
                v.table_schema,
                v.view_definition,
                obj_description(c.oid, 'pg_class') as view_comment,
                v.table_owner,
                v.is_updatable,
                array_agg(DISTINCT t.table_name) FILTER (WHERE t.table_name IS NOT NULL) as referenced_tables
            FROM information_schema.views v
            JOIN pg_class c ON v.table_name = c.relname AND v.table_schema = c.relnamespace::regnamespace::text
            LEFT JOIN information_schema.view_table_usage vtu ON v.table_name = vtu.view_name AND v.table_schema = vtu.view_schema
            LEFT JOIN information_schema.tables t ON vtu.table_name = t.table_name AND vtu.table_schema = t.table_schema
            WHERE @SchemaFilter IS NULL OR v.table_schema = @SchemaFilter
            GROUP BY v.table_name, v.table_schema, v.view_definition, c.oid, v.table_owner, v.is_updatable
            ORDER BY v.table_schema, v.table_name";
        using var cmd = new NpgsqlCommand(query, connection);
        cmd.Parameters.AddWithValue("@SchemaFilter",
            string.IsNullOrEmpty(schemaFilter) ? DBNull.Value : schemaFilter);
        using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var view = new View
            {
                Name = reader.GetString(0),
                Schema = reader.GetString(1),
                SourceCode = reader.GetString(2),
                Type = ObjectType.View,
                Database = connection.Database,
                Owner = reader.GetString(4),
                Properties = new Dictionary<string, string>
                {
                    ["Comment"] = reader.IsDBNull(3) ? "" : reader.GetString(3),
                    ["IsUpdatable"] = reader.GetString(5)
                }
            };
            // Extract referenced tables
            if (!reader.IsDBNull(6))
            {
                view.ReferencedTables = reader.GetFieldValue<string[]>(6).ToList();
            }
            views.Add(view);
        }
        return views;
    }
    public async Task<List<Function>> ExtractFunctionsAsync(
        NpgsqlConnection connection,
        string? schemaFilter = null,
        CancellationToken cancellationToken = default)
    {
        var functions = new List<Function>();
        var query = @"
            SELECT
                p.proname as function_name,
                n.nspname as function_schema,
                pg_get_function_identity_arguments(p.oid) as arguments,
                pg_get_function_result(p.oid) as return_type,
                p.prokind as function_type,
                l.lanname as language,
                p.provolatile as volatility,
                p.prosecdef as security_definer,
                p.proparallel as parallel_safety,
                obj_description(p.oid, 'pg_proc') as function_comment,
                p.proowner::regrole::text as owner,
                p.prorettype as return_type_oid,
                array_agg(
                    ROW(
                        p.proargnames[i],
                        pg_get_function_arg_type(p.oid, i-1),
                        p.proargmodes[i-1] is not null,
                        p.proargmodes[i-1]
                    )
                ) FILTER (WHERE p.proargnames[i] IS NOT NULL) as parameters
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            JOIN pg_language l ON p.prolang = l.oid
            WHERE n.nspname NOT IN ('information_schema', 'pg_catalog')
            AND (@SchemaFilter IS NULL OR n.nspname = @SchemaFilter)
            GROUP BY p.proname, n.nspname, p.oid, l.lanname, p.provolatile, p.prosecdef, p.proparallel, p.proowner
            ORDER BY n.nspname, p.proname";
        using var cmd = new NpgsqlCommand(query, connection);
        cmd.Parameters.AddWithValue("@SchemaFilter",
            string.IsNullOrEmpty(schemaFilter) ? DBNull.Value : schemaFilter);
        using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var function = new Function
            {
                Name = reader.GetString(0),
                Schema = reader.GetString(1),
                ReturnType = reader.GetString(3),
                Language = reader.GetString(5),
                Type = ObjectType.Function,
                Database = connection.Database,
                Owner = reader.GetString(10),
                Volatility = reader.GetString(6),
                Properties = new Dictionary<string, string>
                {
                    ["Comment"] = reader.IsDBNull(9) ? "" : reader.GetString(9),
                    ["SecurityDefiner"] = reader.GetString(7),
                    ["ParallelSafety"] = reader.GetString(8)
                }
            };
            functions.Add(function);
        }
        return functions;
    }
    public async Task<List<Sequence>> ExtractSequencesAsync(
        NpgsqlConnection connection,
        string? schemaFilter = null,
        CancellationToken cancellationToken = default)
    {
        var sequences = new List<Sequence>();
        var query = @"
            SELECT
                c.relname as sequence_name,
                n.nspname as sequence_schema,
                s.seqstart as start_value,
                s.seqincrement as increment,
                s.seqmin as min_value,
                s.seqmax as max_value,
                s.seqcache as cache_size,
                s.seqcycle as is_cycled,
                obj_description(c.oid, 'pg_class') as sequence_comment,
                c.relowner::regrole::text as owner,
                s.seqtypid as data_type_oid
            FROM pg_class c
            JOIN pg_namespace n ON c.relnamespace = n.oid
            JOIN pg_sequence s ON c.oid = s.seqrelid
            WHERE c.relkind = 'S'
            AND (@SchemaFilter IS NULL OR n.nspname = @SchemaFilter)
            ORDER BY n.nspname, c.relname";
        using var cmd = new NpgsqlCommand(query, connection);
        cmd.Parameters.AddWithValue("@SchemaFilter",
            string.IsNullOrEmpty(schemaFilter) ? DBNull.Value : schemaFilter);
        using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var sequence = new Sequence
            {
                Name = reader.GetString(0),
                Schema = reader.GetString(1),
                StartValue = reader.GetInt64(2),
                Increment = reader.GetInt64(3),
                MinValue = reader.IsDBNull(4) ? null : reader.GetInt64(4),
                MaxValue = reader.IsDBNull(5) ? null : reader.GetInt64(5),
                IsCycled = reader.GetBoolean(7),
                Type = ObjectType.Sequence,
                Database = connection.Database,
                Owner = reader.GetString(9),
                Properties = new Dictionary<string, string>
                {
                    ["Comment"] = reader.IsDBNull(8) ? "" : reader.GetString(8),
                    ["CacheSize"] = reader.GetInt32(6).ToString()
                }
            };
            sequences.Add(sequence);
        }
        return sequences;
    }
    public async Task<List<Models.Type>> ExtractTypesAsync(
        NpgsqlConnection connection,
        string? schemaFilter = null,
        CancellationToken cancellationToken = default)
    {
        var types = new List<Models.Type>();
        var query = @"
            SELECT
                t.typname as type_name,
                n.nspname as type_schema,
                t.typtype as type_type,
                t.typlen as internal_length,
                t.typrelid as relation_oid,
                obj_description(t.oid, 'pg_type') as type_comment,
                t.typowner::regrole::text as owner,
                CASE
                    WHEN t.typtype = 'b' THEN 'Base type'
                    WHEN t.typtype = 'c' THEN 'Composite type'
                    WHEN t.typtype = 'd' THEN 'Domain'
                    WHEN t.typtype = 'e' THEN 'Enum type'
                    ELSE 'Other'
                END as type_category
            FROM pg_type t
            JOIN pg_namespace n ON t.typnamespace = n.oid
            WHERE t.typtype IN ('b', 'c', 'd', 'e')
            AND n.nspname NOT IN ('information_schema', 'pg_catalog')
            AND (@SchemaFilter IS NULL OR n.nspname = @SchemaFilter)
            ORDER BY n.nspname, t.typname";
        using var cmd = new NpgsqlCommand(query, connection);
        cmd.Parameters.AddWithValue("@SchemaFilter",
            string.IsNullOrEmpty(schemaFilter) ? DBNull.Value : schemaFilter);
        using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var type = new Models.Type
            {
                Name = reader.GetString(0),
                Schema = reader.GetString(1),
                InternalName = reader.GetString(0),
                Type = ObjectType.Type,
                Database = connection.Database,
                Owner = reader.GetString(6),
                Properties = new Dictionary<string, string>
                {
                    ["Comment"] = reader.IsDBNull(5) ? "" : reader.GetString(5),
                    ["TypeCategory"] = reader.GetString(7)
                }
            };
            types.Add(type);
        }
        return types;
    }
    public async Task<List<Models.Index>> ExtractIndexesAsync(
        NpgsqlConnection connection,
        string? schemaFilter = null,
        CancellationToken cancellationToken = default)
    {
        var indexes = new List<Models.Index>();
        var query = @"
            SELECT
                c.relname as index_name,
                t.relname as table_name,
                n.nspname as index_schema,
                i.indisunique as is_unique,
                i.indisprimary as is_primary,
                am.amname as access_method,
                pg_get_indexdef(c.oid) as index_definition,
                obj_description(c.oid, 'pg_class') as index_comment,
                c.relowner::regrole::text as owner,
                array_agg(a.attname ORDER BY a.attnum) as column_names
            FROM pg_class c
            JOIN pg_namespace n ON c.relnamespace = n.oid
            JOIN pg_index i ON c.oid = i.indexrelid
            JOIN pg_class t ON i.indrelid = t.oid
            JOIN pg_am am ON c.relam = am.oid
            JOIN pg_attribute a ON t.oid = a.attrelid AND a.attnum = ANY(i.indkey)
            WHERE c.relkind = 'i'
            AND (@SchemaFilter IS NULL OR n.nspname = @SchemaFilter)
            GROUP BY c.relname, t.relname, n.nspname, i.indisunique, i.indisprimary, am.amname, c.oid
            ORDER BY n.nspname, t.relname, c.relname";
        using var cmd = new NpgsqlCommand(query, connection);
        cmd.Parameters.AddWithValue("@SchemaFilter",
            string.IsNullOrEmpty(schemaFilter) ? DBNull.Value : schemaFilter);
        using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var index = new Models.Index
            {
                Name = reader.GetString(0),
                TableName = reader.GetString(1),
                Schema = reader.GetString(2),
                IsUnique = reader.GetBoolean(3),
                IndexType = reader.GetString(5),
                AccessMethod = reader.GetString(5),
                Type = ObjectType.Index,
                Database = connection.Database,
                Owner = reader.GetString(8),
                Properties = new Dictionary<string, string>
                {
                    ["Comment"] = reader.IsDBNull(7) ? "" : reader.GetString(7),
                    ["IsPrimary"] = reader.GetBoolean(4).ToString()
                }
            };
            if (!reader.IsDBNull(9))
            {
                index.ColumnNames = reader.GetFieldValue<string[]>(9).ToList();
            }
            indexes.Add(index);
        }
        return indexes;
    }
    public async Task<List<Trigger>> ExtractTriggersAsync(
        NpgsqlConnection connection,
        string? schemaFilter = null,
        CancellationToken cancellationToken = default)
    {
        var triggers = new List<Trigger>();
        var query = @"
            SELECT
                t.tgname as trigger_name,
                c.relname as table_name,
                n.nspname as trigger_schema,
                p.proname as function_name,
                CASE
                    WHEN t.tgtype & 1 = 1 THEN 'BEFORE'
                    WHEN t.tgtype & 2 = 2 THEN 'AFTER'
                    WHEN t.tgtype & 4 = 4 THEN 'INSTEAD OF'
                END as trigger_event,
                CASE
                    WHEN t.tgtype & 16 = 16 THEN 'ROW'
                    WHEN t.tgtype & 32 = 32 THEN 'STATEMENT'
                END as trigger_timing,
                obj_description(t.oid, 'pg_trigger') as trigger_comment,
                t.tgowner::regrole::text as owner,
                array_agg(a.attname ORDER BY a.attnum) FILTER (WHERE a.attname IS NOT NULL) as column_names
            FROM pg_trigger t
            JOIN pg_class c ON t.tgrelid = c.oid
            JOIN pg_namespace n ON c.relnamespace = n.oid
            JOIN pg_proc p ON t.tgfoid = p.oid
            LEFT JOIN pg_attribute a ON c.oid = a.attrelid AND a.attnum = ANY(t.tgattr)
            WHERE NOT t.tgisinternal
            AND (@SchemaFilter IS NULL OR n.nspname = @SchemaFilter)
            GROUP BY t.tgname, c.relname, n.nspname, p.proname, t.tgtype, t.oid, t.tgowner
            ORDER BY n.nspname, c.relname, t.tgname";
        using var cmd = new NpgsqlCommand(query, connection);
        cmd.Parameters.AddWithValue("@SchemaFilter",
            string.IsNullOrEmpty(schemaFilter) ? DBNull.Value : schemaFilter);
        using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var trigger = new Trigger
            {
                Name = reader.GetString(0),
                TableName = reader.GetString(1),
                Schema = reader.GetString(2),
                FunctionName = reader.GetString(3),
                Events = reader.GetString(4),
                Timing = reader.GetString(5),
                Type = ObjectType.Trigger,
                Database = connection.Database,
                Owner = reader.GetString(7),
                Properties = new Dictionary<string, string>
                {
                    ["Comment"] = reader.IsDBNull(6) ? "" : reader.GetString(6)
                }
            };
            if (!reader.IsDBNull(8))
            {
                trigger.Columns = reader.GetFieldValue<string[]>(8).ToList();
            }
            triggers.Add(trigger);
        }
        return triggers;
    }
    // Placeholder implementations for remaining object types
    public Task<List<Function>> ExtractProceduresAsync(
        NpgsqlConnection connection,
        string? schemaFilter = null,
        CancellationToken cancellationToken = default) =>
        ExtractFunctionsAsync(connection, schemaFilter, cancellationToken);
}