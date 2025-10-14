namespace PostgreSqlSchemaCompareSync.Core.Comparison.Metadata;

/// <summary>
/// Specialized extractor for PostgreSQL foreign table metadata
/// </summary>
public class ForeignTableMetadataExtractor(
    ILogger<ForeignTableMetadataExtractor> logger) : IMetadataExtractor, IObjectMetadataExtractor, IObjectValidator
{
    private readonly ILogger<ForeignTableMetadataExtractor> _logger = logger ?? throw new ArgumentNullException(nameof(logger));

    public ObjectType ObjectType => ObjectType.Table; // Foreign tables are a type of table

    /// <summary>
    /// Extracts foreign table metadata from the database
    /// </summary>
    public async Task<IEnumerable<DatabaseObject>> ExtractAsync(
        NpgsqlConnection connection,
        string? schemaFilter,
        CancellationToken cancellationToken)
    {
        var foreignTables = new List<DatabaseObject>();

        const string query = @"
            SELECT
                c.relname as table_name,
                n.nspname as table_schema,
                c.relkind as relation_kind,
                obj_description(c.oid, 'pg_class') as description,
                c.relowner::regrole as table_owner,
                c.relcreated as creation_date,
                c.reltablespace as tablespace_oid,
                t.spcname as tablespace_name,
                pg_relation_size(c.oid) as size_bytes,
                ft.ftserver as foreign_server,
                fs.srvname as server_name,
                ft.ftoptions as foreign_options,
                obj_description(fs.oid, 'pg_foreign_server') as server_description,
                fs.srvtype as server_type,
                fs.srvversion as server_version,
                fs.srvhost as server_host,
                fs.srvport as server_port,
                fs.srvdb as server_database
            FROM pg_class c
            JOIN pg_namespace n ON c.relnamespace = n.oid
            LEFT JOIN pg_tablespace t ON c.reltablespace = t.oid
            JOIN pg_foreign_table ft ON c.oid = ft.ftrelid
            JOIN pg_foreign_server fs ON ft.ftserver = fs.oid
            WHERE c.relkind = 'f' -- Foreign tables only
              AND (@schemaFilter IS NULL OR n.nspname = @schemaFilter)
              AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
            ORDER BY n.nspname, c.relname";

        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

        using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var tableName = reader.GetString(0);
            var tableSchema = reader.GetString(1);

            foreignTables.Add(new DatabaseObject
            {
                Name = tableName,
                Schema = tableSchema,
                Type = ObjectType.Table, // Using Table type but marking as foreign in properties
                Database = connection.Database,
                Owner = reader.IsDBNull(4) ? string.Empty : reader.GetString(4),
                Definition = await BuildForeignTableDefinitionAsync(connection, tableSchema, tableName, cancellationToken),
                CreatedAt = reader.IsDBNull(5) ? DateTime.UtcNow : reader.GetDateTime(5),
                Properties =
                {
                    ["RelationKind"] = reader.GetString(2),
                    ["Description"] = reader.IsDBNull(3) ? string.Empty : reader.GetString(3),
                    ["TablespaceOid"] = reader.IsDBNull(6) ? 0 : reader.GetInt32(6),
                    ["TablespaceName"] = reader.IsDBNull(7) ? string.Empty : reader.GetString(7),
                    ["SizeBytes"] = reader.IsDBNull(8) ? 0L : reader.GetInt64(8),
                    ["ForeignServer"] = reader.GetInt32(9),
                    ["ServerName"] = reader.GetString(10),
                    ["ForeignOptions"] = reader.IsDBNull(11) ? string.Empty : reader.GetString(11),
                    ["ServerDescription"] = reader.IsDBNull(12) ? string.Empty : reader.GetString(12),
                    ["ServerType"] = reader.IsDBNull(13) ? string.Empty : reader.GetString(13),
                    ["ServerVersion"] = reader.IsDBNull(14) ? string.Empty : reader.GetString(14),
                    ["ServerHost"] = reader.IsDBNull(15) ? string.Empty : reader.GetString(15),
                    ["ServerPort"] = reader.IsDBNull(16) ? 0 : reader.GetInt32(16),
                    ["ServerDatabase"] = reader.IsDBNull(17) ? string.Empty : reader.GetString(17),
                    ["IsForeignTable"] = true
                }
            });
        }

        return foreignTables;
    }

    /// <summary>
    /// Extracts detailed foreign table information
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
            Schema = schema,
            Type = ObjectType.Table,
            Database = connection.Database,
            CreatedAt = DateTime.UtcNow
        };

        await ExtractForeignTableDetailsAsync(connection, details, cancellationToken);
        return details;
    }

    /// <summary>
    /// Validates foreign table objects
    /// </summary>
    public async Task<ObjectValidationResult> ValidateAsync(
        NpgsqlConnection connection,
        DatabaseObject foreignTable,
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
            _logger.LogDebug("Validating foreign table {Schema}.{TableName}", foreignTable.Schema, foreignTable.Name);

            // Check if foreign table exists and is accessible
            const string query = @"
                SELECT COUNT(*)
                FROM pg_class c
                JOIN pg_namespace n ON c.relnamespace = n.oid
                JOIN pg_foreign_table ft ON c.oid = ft.ftrelid
                WHERE c.relkind = 'f'
                  AND n.nspname = @schema
                  AND c.relname = @tableName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schema", foreignTable.Schema);
            command.Parameters.AddWithValue("@tableName", foreignTable.Name);

            var countResult = await command.ExecuteScalarAsync(cancellationToken);
            var count = countResult != null ? (long)countResult : 0;

            if (count == 0)
            {
                result.IsValid = false;
                result.Errors.Add("Foreign table does not exist or is not accessible");
            }
            else
            {
                result.Metadata["ForeignTableExists"] = true;

                // Get advanced foreign table information
                const string advancedQuery = @"
                    SELECT
                        c.relkind as relation_kind,
                        ft.ftserver as foreign_server,
                        fs.srvname as server_name,
                        fs.srvtype as server_type,
                        fs.srvhost as server_host,
                        fs.srvport as server_port,
                        fs.srvdb as server_database,
                        ft.ftoptions as foreign_options,
                        obj_description(c.oid, 'pg_class') as description,
                        c.relowner::regrole as table_owner
                    FROM pg_class c
                    JOIN pg_namespace n ON c.relnamespace = n.oid
                    JOIN pg_foreign_table ft ON c.oid = ft.ftrelid
                    JOIN pg_foreign_server fs ON ft.ftserver = fs.oid
                    WHERE n.nspname = @schema AND c.relname = @tableName";

                using var advCommand = new NpgsqlCommand(advancedQuery, connection);
                advCommand.Parameters.AddWithValue("@schema", foreignTable.Schema);
                advCommand.Parameters.AddWithValue("@tableName", foreignTable.Name);

                using var advReader = await advCommand.ExecuteReaderAsync(cancellationToken);
                if (await advReader.ReadAsync(cancellationToken))
                {
                    result.Metadata["RelationKind"] = advReader.GetString(0);
                    result.Metadata["ForeignServer"] = advReader.GetInt32(1);
                    result.Metadata["ServerName"] = advReader.GetString(2);
                    result.Metadata["ServerType"] = advReader.IsDBNull(3) ? string.Empty : advReader.GetString(3);
                    result.Metadata["ServerHost"] = advReader.IsDBNull(4) ? string.Empty : advReader.GetString(4);
                    result.Metadata["ServerPort"] = advReader.IsDBNull(5) ? 0 : advReader.GetInt32(5);
                    result.Metadata["ServerDatabase"] = advReader.IsDBNull(6) ? string.Empty : advReader.GetString(6);
                    result.Metadata["ForeignOptions"] = advReader.IsDBNull(7) ? string.Empty : advReader.GetString(7);
                    result.Metadata["Description"] = advReader.IsDBNull(8) ? string.Empty : advReader.GetString(8);
                    result.Metadata["TableOwner"] = advReader.GetString(9);

                    // Add warnings for potential issues
                    var serverType = advReader.IsDBNull(3) ? string.Empty : advReader.GetString(3);
                    if (string.IsNullOrEmpty(serverType))
                        result.Warnings.Add("Foreign server type is not specified - may cause connection issues");

                    var serverHost = advReader.IsDBNull(4) ? string.Empty : advReader.GetString(4);
                    if (string.IsNullOrEmpty(serverHost))
                        result.Warnings.Add("Foreign server host is not specified - may cause connection issues");

                    var serverPort = advReader.IsDBNull(5) ? 0 : advReader.GetInt32(5);
                    if (serverPort <= 0 || serverPort > 65535)
                        result.Warnings.Add($"Invalid server port ({serverPort}) - may cause connection issues");
                }

                // Validate foreign server connectivity
                await ValidateForeignServerConnectionAsync(connection, foreignTable.Schema, foreignTable.Name, result, cancellationToken);

                // Check for foreign table dependencies
                await ValidateForeignTableDependenciesAsync(connection, foreignTable.Schema, foreignTable.Name, result, cancellationToken);
            }

            result.Metadata["ValidationDate"] = DateTime.UtcNow;
            result.Metadata["ObjectType"] = foreignTable.Type.ToString();

            _logger.LogDebug("Validation completed for foreign table {Schema}.{TableName}: Valid={IsValid}",
                foreignTable.Schema, foreignTable.Name, result.IsValid);

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to validate foreign table {Schema}.{TableName}", foreignTable.Schema, foreignTable.Name);

            result.IsValid = false;
            result.Errors.Add($"Validation error: {ex.Message}");
            return result;
        }
    }

    /// <summary>
    /// Extracts detailed foreign table information including columns and server details
    /// </summary>
    private async Task ExtractForeignTableDetailsAsync(
        NpgsqlConnection connection,
        DatabaseObjectDetails details,
        CancellationToken cancellationToken)
    {
        // Get foreign table columns
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
                c.domain_name,
                c.collation_name
            FROM information_schema.columns c
            WHERE c.table_schema = @schema
              AND c.table_name = @tableName
            ORDER BY c.ordinal_position";

        using var columnCommand = new NpgsqlCommand(columnQuery, connection);
        columnCommand.Parameters.AddWithValue("@schema", details.Schema);
        columnCommand.Parameters.AddWithValue("@tableName", details.Name);

        using var columnReader = await columnCommand.ExecuteReaderAsync(cancellationToken);
        while (await columnReader.ReadAsync(cancellationToken))
        {
            var columnName = columnReader.GetString(0);
            var dataType = columnReader.GetString(1);
            var isNullable = columnReader.GetString(2) == "YES";
            var defaultValue = columnReader.IsDBNull(3) ? string.Empty : columnReader.GetString(3);

            details.AdditionalInfo[$"Column_{columnName}_DataType"] = dataType;
            details.AdditionalInfo[$"Column_{columnName}_IsNullable"] = isNullable;
            details.AdditionalInfo[$"Column_{columnName}_DefaultValue"] = defaultValue;
        }

        // Get foreign server user mappings
        const string mappingQuery = @"
            SELECT
                um.umuser as user_mapping,
                obj_description(um.oid, 'pg_user_mapping') as mapping_description,
                um.umoptions as mapping_options
            FROM pg_foreign_table ft
            JOIN pg_foreign_server fs ON ft.ftserver = fs.oid
            JOIN pg_user_mapping um ON um.srvid = fs.oid
            JOIN pg_class c ON ft.ftrelid = c.oid
            JOIN pg_namespace n ON c.relnamespace = n.oid
            WHERE n.nspname = @schema AND c.relname = @tableName";

        using var mappingCommand = new NpgsqlCommand(mappingQuery, connection);
        mappingCommand.Parameters.AddWithValue("@schema", details.Schema);
        mappingCommand.Parameters.AddWithValue("@tableName", details.Name);

        using var mappingReader = await mappingCommand.ExecuteReaderAsync(cancellationToken);
        if (await mappingReader.ReadAsync(cancellationToken))
        {
            details.AdditionalInfo["UserMapping"] = mappingReader.GetInt32(0);
            details.AdditionalInfo["MappingDescription"] = mappingReader.IsDBNull(1) ? string.Empty : mappingReader.GetString(1);
            details.AdditionalInfo["MappingOptions"] = mappingReader.IsDBNull(2) ? string.Empty : mappingReader.GetString(2);
        }

        // Get foreign data wrapper information
        const string wrapperQuery = @"
            SELECT
                fw.fdwname as wrapper_name,
                obj_description(fw.oid, 'pg_foreign_data_wrapper') as wrapper_description,
                fw.fdwowner::regrole as wrapper_owner,
                fw.fdwoptions as wrapper_options
            FROM pg_foreign_table ft
            JOIN pg_foreign_server fs ON ft.ftserver = fs.oid
            JOIN pg_foreign_data_wrapper fw ON fs.srvfdw = fw.oid
            JOIN pg_class c ON ft.ftrelid = c.oid
            JOIN pg_namespace n ON c.relnamespace = n.oid
            WHERE n.nspname = @schema AND c.relname = @tableName";

        using var wrapperCommand = new NpgsqlCommand(wrapperQuery, connection);
        wrapperCommand.Parameters.AddWithValue("@schema", details.Schema);
        wrapperCommand.Parameters.AddWithValue("@tableName", details.Name);

        using var wrapperReader = await wrapperCommand.ExecuteReaderAsync(cancellationToken);
        if (await wrapperReader.ReadAsync(cancellationToken))
        {
            details.AdditionalInfo["ForeignDataWrapper"] = wrapperReader.GetString(0);
            details.AdditionalInfo["WrapperDescription"] = wrapperReader.IsDBNull(1) ? string.Empty : wrapperReader.GetString(1);
            details.AdditionalInfo["WrapperOwner"] = wrapperReader.GetString(2);
            details.AdditionalInfo["WrapperOptions"] = wrapperReader.IsDBNull(3) ? string.Empty : wrapperReader.GetString(3);
        }
    }

    /// <summary>
    /// Validates foreign server connectivity
    /// </summary>
    private async Task ValidateForeignServerConnectionAsync(
        NpgsqlConnection connection,
        string schema,
        string tableName,
        ObjectValidationResult result,
        CancellationToken cancellationToken)
    {
        try
        {
            const string query = @"
                SELECT
                    fs.srvname as server_name,
                    fs.srvtype as server_type,
                    fs.srvhost as server_host,
                    fs.srvport as server_port,
                    fs.srvdb as server_database
                FROM pg_foreign_table ft
                JOIN pg_foreign_server fs ON ft.ftserver = fs.oid
                JOIN pg_class c ON ft.ftrelid = c.oid
                JOIN pg_namespace n ON c.relnamespace = n.oid
                WHERE n.nspname = @schema AND c.relname = @tableName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schema", schema);
            command.Parameters.AddWithValue("@tableName", tableName);

            using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                result.Metadata["ServerName"] = reader.GetString(0);
                result.Metadata["ServerType"] = reader.IsDBNull(1) ? string.Empty : reader.GetString(1);
                result.Metadata["ServerHost"] = reader.IsDBNull(2) ? string.Empty : reader.GetString(2);
                result.Metadata["ServerPort"] = reader.IsDBNull(3) ? 0 : reader.GetInt32(3);
                result.Metadata["ServerDatabase"] = reader.IsDBNull(4) ? string.Empty : reader.GetString(4);

                // Add warnings for potential connectivity issues
                var serverHost = reader.IsDBNull(2) ? string.Empty : reader.GetString(2);
                if (string.IsNullOrEmpty(serverHost))
                    result.Warnings.Add("Foreign server host is not configured - may cause connection issues");

                var serverPort = reader.IsDBNull(3) ? 0 : reader.GetInt32(3);
                if (serverPort <= 0 || serverPort > 65535)
                    result.Warnings.Add($"Invalid server port ({serverPort}) - may cause connection issues");

                var serverDatabase = reader.IsDBNull(4) ? string.Empty : reader.GetString(4);
                if (string.IsNullOrEmpty(serverDatabase))
                    result.Warnings.Add("Foreign server database is not specified - may cause connection issues");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error checking foreign server connection for {Schema}.{TableName}", schema, tableName);
            result.Warnings.Add($"Could not verify foreign server connection: {ex.Message}");
        }
    }

    /// <summary>
    /// Validates foreign table dependencies
    /// </summary>
    private async Task ValidateForeignTableDependenciesAsync(
        NpgsqlConnection connection,
        string schema,
        string tableName,
        ObjectValidationResult result,
        CancellationToken cancellationToken)
    {
        try
        {
            // Check if foreign server exists and is accessible
            const string query = @"
                SELECT COUNT(*)
                FROM pg_foreign_table ft
                JOIN pg_foreign_server fs ON ft.ftserver = fs.oid
                JOIN pg_class c ON ft.ftrelid = c.oid
                JOIN pg_namespace n ON c.relnamespace = n.oid
                WHERE n.nspname = @schema AND c.relname = @tableName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schema", schema);
            command.Parameters.AddWithValue("@tableName", tableName);

            var serverCount = await command.ExecuteScalarAsync(cancellationToken);
            var count = serverCount != null ? (long)serverCount : 0;

            result.Metadata["ValidForeignServer"] = count > 0;

            if (count == 0)
            {
                result.Errors.Add("Foreign table references non-existent or inaccessible foreign server");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error checking foreign table dependencies for {Schema}.{TableName}", schema, tableName);
        }
    }

    /// <summary>
    /// Builds a CREATE FOREIGN TABLE statement for the foreign table
    /// </summary>
    private async Task<string> BuildForeignTableDefinitionAsync(
        NpgsqlConnection connection,
        string schema,
        string tableName,
        CancellationToken cancellationToken)
    {
        try
        {
            const string query = @"
                SELECT
                    ft.ftoptions as foreign_options,
                    fs.srvname as server_name,
                    fs.srvoptions as server_options
                FROM pg_foreign_table ft
                JOIN pg_foreign_server fs ON ft.ftserver = fs.oid
                JOIN pg_class c ON ft.ftrelid = c.oid
                JOIN pg_namespace n ON c.relnamespace = n.oid
                WHERE n.nspname = @schema AND c.relname = @tableName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schema", schema);
            command.Parameters.AddWithValue("@tableName", tableName);

            using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                var foreignOptions = reader.IsDBNull(0) ? string.Empty : reader.GetString(0);
                var serverName = reader.GetString(1);
                var serverOptions = reader.IsDBNull(2) ? string.Empty : reader.GetString(2);

                var createStatement = $"CREATE FOREIGN TABLE \"{schema}\".\"{tableName}\" ";

                // Add server options if available
                if (!string.IsNullOrEmpty(serverOptions))
                {
                    createStatement += $"OPTIONS ({serverOptions}) ";
                }

                createStatement += $"SERVER \"{serverName}\"";

                // Add table-specific options if available
                if (!string.IsNullOrEmpty(foreignOptions))
                {
                    createStatement += $" OPTIONS ({foreignOptions})";
                }

                createStatement += ";";

                return createStatement;
            }

            return $"CREATE FOREIGN TABLE \"{schema}\".\"{tableName}\";";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error building foreign table definition for {Schema}.{TableName}", schema, tableName);
            return $"CREATE FOREIGN TABLE \"{schema}\".\"{tableName}\";";
        }
    }
}