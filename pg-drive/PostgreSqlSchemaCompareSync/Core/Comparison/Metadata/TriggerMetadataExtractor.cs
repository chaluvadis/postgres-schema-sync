namespace PostgreSqlSchemaCompareSync.Core.Comparison.Metadata;

/// <summary>
/// Specialized extractor for PostgreSQL trigger metadata
/// </summary>
public class TriggerMetadataExtractor(
    ILogger<TriggerMetadataExtractor> logger) : IMetadataExtractor, IObjectMetadataExtractor, IObjectValidator
{
    private readonly ILogger<TriggerMetadataExtractor> _logger = logger ?? throw new ArgumentNullException(nameof(logger));

    public ObjectType ObjectType => ObjectType.Trigger;

    /// <summary>
    /// Extracts trigger metadata from the database
    /// </summary>
    public async Task<IEnumerable<DatabaseObject>> ExtractAsync(
        NpgsqlConnection connection,
        string? schemaFilter,
        CancellationToken cancellationToken)
    {
        var triggers = new List<DatabaseObject>();

        const string query = @"
            SELECT
                t.tgname as trigger_name,
                n.nspname as trigger_schema,
                c.relname as table_name,
                t_nsp.nspname as table_schema,
                p.proname as function_name,
                p_nsp.nspname as function_schema,
                CASE
                    WHEN t.tgtype & 1 = 1 THEN 'ROW'
                    ELSE 'STATEMENT'
                END as trigger_level,
                CASE
                    WHEN t.tgtype & 2 = 2 THEN 'BEFORE'
                    WHEN t.tgtype & 4 = 4 THEN 'AFTER'
                    WHEN t.tgtype & 8 = 8 THEN 'INSTEAD OF'
                    ELSE 'UNKNOWN'
                END as trigger_timing,
                array_to_string(array(
                    SELECT e.event FROM (VALUES
                        (CASE WHEN t.tgtype & 16 = 16 THEN 'INSERT' END),
                        (CASE WHEN t.tgtype & 32 = 32 THEN 'DELETE' END),
                        (CASE WHEN t.tgtype & 64 = 64 THEN 'UPDATE' END),
                        (CASE WHEN t.tgtype & 128 = 128 THEN 'TRUNCATE' END)
                    ) AS events(event)
                    WHERE event IS NOT NULL
                ), ' OR ') as trigger_events,
                t.tgwhen as trigger_condition,
                t.tgdeferrable as is_deferrable,
                t.tginitdeferred as initially_deferred,
                t.tgnargs as argument_count,
                t.tgargs as arguments,
                obj_description(t.oid, 'pg_trigger') as description,
                t.tgowner::regrole as trigger_owner,
                t.tgcreated as creation_date,
                CASE WHEN t.tgenabled = 'O' THEN true ELSE false END as is_enabled
            FROM pg_trigger t
            JOIN pg_class c ON t.tgrelid = c.oid
            JOIN pg_namespace n ON c.relnamespace = n.oid
            JOIN pg_namespace t_nsp ON c.relnamespace = t_nsp.oid
            JOIN pg_proc p ON t.tgfoid = p.oid
            JOIN pg_namespace p_nsp ON p.pronamespace = p_nsp.oid
            WHERE (@schemaFilter IS NULL OR n.nspname = @schemaFilter)
              AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
              AND NOT t.tgisinternal
            ORDER BY n.nspname, c.relname, t.tgname";

        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

        using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var triggerName = reader.GetString(0);
            var triggerSchema = reader.GetString(1);
            var tableName = reader.GetString(2);
            var tableSchema = reader.GetString(3);

            triggers.Add(new DatabaseObject
            {
                Name = triggerName,
                Schema = triggerSchema,
                Type = ObjectType.Trigger,
                Database = connection.Database,
                Owner = reader.IsDBNull(15) ? string.Empty : reader.GetString(15),
                Definition = await BuildTriggerDefinitionAsync(connection, triggerSchema, triggerName, cancellationToken),
                CreatedAt = reader.IsDBNull(16) ? DateTime.UtcNow : reader.GetDateTime(16),
                Properties =
                {
                    ["TableName"] = tableName,
                    ["TableSchema"] = tableSchema,
                    ["FunctionName"] = reader.GetString(4),
                    ["FunctionSchema"] = reader.GetString(5),
                    ["TriggerLevel"] = reader.GetString(6),
                    ["TriggerTiming"] = reader.GetString(7),
                    ["TriggerEvents"] = reader.GetString(8),
                    ["TriggerCondition"] = reader.IsDBNull(9) ? string.Empty : reader.GetString(9),
                    ["IsDeferrable"] = reader.GetBoolean(10),
                    ["InitiallyDeferred"] = reader.GetBoolean(11),
                    ["ArgumentCount"] = reader.GetInt16(12),
                    ["Arguments"] = reader.IsDBNull(13) ? string.Empty : reader.GetString(13),
                    ["Description"] = reader.IsDBNull(14) ? string.Empty : reader.GetString(14),
                    ["IsEnabled"] = reader.GetBoolean(17)
                }
            });
        }

        return triggers;
    }

    /// <summary>
    /// Extracts detailed trigger information
    /// </summary>
    public async Task<DatabaseObjectDetails> ExtractDetailsAsync(
        NpgsqlConnection connection,
        string schema,
        string triggerName,
        CancellationToken cancellationToken)
    {
        var details = new DatabaseObjectDetails
        {
            Name = triggerName,
            Schema = schema,
            Type = ObjectType.Trigger,
            Database = connection.Database,
            CreatedAt = DateTime.UtcNow
        };

        await ExtractTriggerDetailsAsync(connection, details, cancellationToken);
        return details;
    }

    /// <summary>
    /// Validates trigger objects
    /// </summary>
    public async Task<ObjectValidationResult> ValidateAsync(
        NpgsqlConnection connection,
        DatabaseObject trigger,
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
            _logger.LogDebug("Validating trigger {Schema}.{TriggerName}", trigger.Schema, trigger.Name);

            // Check if trigger exists and is accessible
            const string query = @"
                SELECT COUNT(*)
                FROM pg_trigger t
                JOIN pg_class c ON t.tgrelid = c.oid
                JOIN pg_namespace n ON c.relnamespace = n.oid
                WHERE n.nspname = @schema
                  AND t.tgname = @triggerName
                  AND NOT t.tgisinternal";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schema", trigger.Schema);
            command.Parameters.AddWithValue("@triggerName", trigger.Name);

            var countResult = await command.ExecuteScalarAsync(cancellationToken);
            var count = countResult != null ? (long)countResult : 0;

            if (count == 0)
            {
                result.IsValid = false;
                result.Errors.Add("Trigger does not exist or is not accessible");
            }
            else
            {
                result.Metadata["TriggerExists"] = true;

                // Get advanced trigger information
                const string advancedQuery = @"
                    SELECT
                        t.tgenabled as enabled_status,
                        t.tgisinternal as is_internal,
                        t.tgconstrrelid != 0 as is_constraint_trigger,
                        t.tgconstrname as constraint_name,
                        t.tgnargs as argument_count,
                        t.tgargs as arguments,
                        p.proname as function_name,
                        n.nspname as function_schema,
                        c.relname as table_name,
                        t_nsp.nspname as table_schema
                    FROM pg_trigger t
                    JOIN pg_class c ON t.tgrelid = c.oid
                    JOIN pg_namespace n ON c.relnamespace = n.oid
                    JOIN pg_namespace t_nsp ON c.relnamespace = t_nsp.oid
                    JOIN pg_proc p ON t.tgfoid = p.oid
                    JOIN pg_namespace p_nsp ON p.pronamespace = p_nsp.oid
                    WHERE n.nspname = @schema AND t.tgname = @triggerName";

                using var advCommand = new NpgsqlCommand(advancedQuery, connection);
                advCommand.Parameters.AddWithValue("@schema", trigger.Schema);
                advCommand.Parameters.AddWithValue("@triggerName", trigger.Name);

                using var advReader = await advCommand.ExecuteReaderAsync(cancellationToken);
                if (await advReader.ReadAsync(cancellationToken))
                {
                    var enabledStatus = advReader.GetString(0);
                    var isInternal = advReader.GetBoolean(1);
                    var isConstraintTrigger = advReader.GetBoolean(2);

                    result.Metadata["EnabledStatus"] = enabledStatus;
                    result.Metadata["IsInternal"] = isInternal;
                    result.Metadata["IsConstraintTrigger"] = isConstraintTrigger;
                    result.Metadata["ConstraintName"] = advReader.IsDBNull(3) ? string.Empty : advReader.GetString(3);
                    result.Metadata["ArgumentCount"] = advReader.GetInt16(4);
                    result.Metadata["Arguments"] = advReader.IsDBNull(5) ? string.Empty : advReader.GetString(5);
                    result.Metadata["FunctionName"] = advReader.GetString(6);
                    result.Metadata["FunctionSchema"] = advReader.GetString(7);
                    result.Metadata["TableName"] = advReader.GetString(8);
                    result.Metadata["TableSchema"] = advReader.GetString(9);

                    // Add warnings for potential issues
                    if (enabledStatus != "O")
                        result.Warnings.Add($"Trigger is disabled ({enabledStatus}) - will not execute");

                    if (isInternal)
                        result.Warnings.Add("Trigger is internal to PostgreSQL - may be system-managed");

                    if (isConstraintTrigger)
                        result.Warnings.Add("Trigger is a constraint trigger - special handling may be required");
                }

                // Validate trigger function exists and is accessible
                await ValidateTriggerFunctionAsync(connection, trigger.Schema, trigger.Name, result, cancellationToken);

                // Check for trigger dependencies
                await ValidateTriggerDependenciesAsync(connection, trigger.Schema, trigger.Name, result, cancellationToken);
            }

            result.Metadata["ValidationDate"] = DateTime.UtcNow;
            result.Metadata["ObjectType"] = trigger.Type.ToString();

            _logger.LogDebug("Validation completed for trigger {Schema}.{TriggerName}: Valid={IsValid}",
                trigger.Schema, trigger.Name, result.IsValid);

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to validate trigger {Schema}.{TriggerName}", trigger.Schema, trigger.Name);

            result.IsValid = false;
            result.Errors.Add($"Validation error: {ex.Message}");
            return result;
        }
    }

    /// <summary>
    /// Extracts detailed trigger information including dependencies
    /// </summary>
    private async Task ExtractTriggerDetailsAsync(
        NpgsqlConnection connection,
        DatabaseObjectDetails details,
        CancellationToken cancellationToken)
    {
        // Get trigger columns for UPDATE triggers
        const string columnQuery = @"
            SELECT
                a.attname as column_name,
                a.atttypid::regtype as column_type
            FROM pg_trigger t
            JOIN pg_class c ON t.tgrelid = c.oid
            JOIN pg_namespace n ON c.relnamespace = n.oid
            JOIN pg_attribute a ON a.attrelid = t.tgrelid
            WHERE n.nspname = @schema
              AND t.tgname = @triggerName
              AND a.attnum = ANY(t.tgattr)
              AND NOT a.attisdropped
            ORDER BY a.attnum";

        using var columnCommand = new NpgsqlCommand(columnQuery, connection);
        columnCommand.Parameters.AddWithValue("@schema", details.Schema);
        columnCommand.Parameters.AddWithValue("@triggerName", details.Name);

        using var columnReader = await columnCommand.ExecuteReaderAsync(cancellationToken);
        var triggerColumns = new List<string>();
        while (await columnReader.ReadAsync(cancellationToken))
        {
            var columnName = columnReader.GetString(0);
            var columnType = columnReader.GetString(1);
            triggerColumns.Add($"{columnName} ({columnType})");
        }

        if (triggerColumns.Any())
        {
            details.AdditionalInfo["TriggerColumns"] = string.Join(", ", triggerColumns);
            details.AdditionalInfo["TriggerColumnCount"] = triggerColumns.Count;
        }

        // Get trigger function source if available
        const string functionQuery = @"
            SELECT
                p.prosrc as function_source,
                p.prolang as function_language,
                p.prosecdef as is_security_definer,
                p.provolatile as volatility,
                p.proparallel as parallel_safety
            FROM pg_trigger t
            JOIN pg_proc p ON t.tgfoid = p.oid
            JOIN pg_class c ON t.tgrelid = c.oid
            JOIN pg_namespace n ON c.relnamespace = n.oid
            WHERE n.nspname = @schema AND t.tgname = @triggerName";

        using var funcCommand = new NpgsqlCommand(functionQuery, connection);
        funcCommand.Parameters.AddWithValue("@schema", details.Schema);
        funcCommand.Parameters.AddWithValue("@triggerName", details.Name);

        using var funcReader = await funcCommand.ExecuteReaderAsync(cancellationToken);
        if (await funcReader.ReadAsync(cancellationToken))
        {
            details.AdditionalInfo["FunctionSource"] = funcReader.IsDBNull(0) ? string.Empty : funcReader.GetString(0);
            details.AdditionalInfo["FunctionLanguage"] = funcReader.GetInt32(1).ToString();
            details.AdditionalInfo["IsSecurityDefiner"] = funcReader.GetBoolean(2);
            details.AdditionalInfo["Volatility"] = funcReader.GetString(3);
            details.AdditionalInfo["ParallelSafety"] = funcReader.GetString(4);
        }
    }

    /// <summary>
    /// Validates trigger function exists and is accessible
    /// </summary>
    private async Task ValidateTriggerFunctionAsync(
        NpgsqlConnection connection,
        string schema,
        string triggerName,
        ObjectValidationResult result,
        CancellationToken cancellationToken)
    {
        try
        {
            const string query = @"
                SELECT COUNT(*)
                FROM pg_trigger t
                JOIN pg_proc p ON t.tgfoid = p.oid
                JOIN pg_class c ON t.tgrelid = c.oid
                JOIN pg_namespace n ON c.relnamespace = n.oid
                WHERE n.nspname = @schema
                  AND t.tgname = @triggerName
                  AND p.prorettype = 2279;";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schema", schema);
            command.Parameters.AddWithValue("@triggerName", triggerName);

            var functionCount = await command.ExecuteScalarAsync(cancellationToken);
            var count = functionCount != null ? (long)functionCount : 0;

            result.Metadata["ValidTriggerFunction"] = count > 0;

            if (count == 0)
            {
                result.Errors.Add("Trigger function is missing or has incorrect signature");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error checking trigger function for {Schema}.{TriggerName}", schema, triggerName);
            result.Warnings.Add($"Could not verify trigger function: {ex.Message}");
        }
    }

    /// <summary>
    /// Validates trigger dependencies
    /// </summary>
    private async Task ValidateTriggerDependenciesAsync(
        NpgsqlConnection connection,
        string schema,
        string triggerName,
        ObjectValidationResult result,
        CancellationToken cancellationToken)
    {
        try
        {
            // Check if trigger table exists
            const string tableQuery = @"
                SELECT COUNT(*)
                FROM pg_trigger t
                JOIN pg_class c ON t.tgrelid = c.oid
                JOIN pg_namespace n ON c.relnamespace = n.oid
                WHERE n.nspname = @schema AND t.tgname = @triggerName";

            using var tableCommand = new NpgsqlCommand(tableQuery, connection);
            tableCommand.Parameters.AddWithValue("@schema", schema);
            tableCommand.Parameters.AddWithValue("@triggerName", triggerName);

            var tableCount = await tableCommand.ExecuteScalarAsync(cancellationToken);
            var count = tableCount != null ? (long)tableCount : 0;

            result.Metadata["ValidTableReference"] = count > 0;

            if (count == 0)
            {
                result.Errors.Add("Trigger references non-existent table");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error checking trigger dependencies for {Schema}.{TriggerName}", schema, triggerName);
        }
    }

    /// <summary>
    /// Builds a CREATE TRIGGER statement for the trigger
    /// </summary>
    private async Task<string> BuildTriggerDefinitionAsync(
        NpgsqlConnection connection,
        string schema,
        string triggerName,
        CancellationToken cancellationToken)
    {
        try
        {
            const string query = @"
                SELECT
                    CASE
                        WHEN t.tgtype & 1 = 1 THEN 'ROW'
                        ELSE 'STATEMENT'
                    END as trigger_level,
                    CASE
                        WHEN t.tgtype & 2 = 2 THEN 'BEFORE'
                        WHEN t.tgtype & 4 = 4 THEN 'AFTER'
                        WHEN t.tgtype & 8 = 8 THEN 'INSTEAD OF'
                        ELSE 'UNKNOWN'
                    END as trigger_timing,
                    array_to_string(array(
                        SELECT e.event FROM (VALUES
                            (CASE WHEN t.tgtype & 16 = 16 THEN 'INSERT' END),
                            (CASE WHEN t.tgtype & 32 = 32 THEN 'DELETE' END),
                            (CASE WHEN t.tgtype & 64 = 64 THEN 'UPDATE' END),
                            (CASE WHEN t.tgtype & 128 = 128 THEN 'TRUNCATE' END)
                        ) AS events(event)
                        WHERE event IS NOT NULL
                    ), ' OR ') as trigger_events,
                    c.relname as table_name,
                    p.proname as function_name,
                    t.tgwhen as trigger_condition,
                    t.tgdeferrable as is_deferrable,
                    t.tginitdeferred as initially_deferred,
                    t.tgnargs as argument_count,
                    t.tgargs as arguments
                FROM pg_trigger t
                JOIN pg_class c ON t.tgrelid = c.oid
                JOIN pg_proc p ON t.tgfoid = p.oid
                WHERE t.tgname = @triggerName
                  AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = @schema)";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@triggerName", triggerName);
            command.Parameters.AddWithValue("@schema", schema);

            using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                var triggerLevel = reader.GetString(0);
                var triggerTiming = reader.GetString(1);
                var triggerEvents = reader.GetString(2);
                var tableName = reader.GetString(3);
                var functionName = reader.GetString(4);
                var triggerCondition = reader.IsDBNull(5) ? string.Empty : $" WHEN ({reader.GetString(5)})";
                var isDeferrable = reader.GetBoolean(6);
                var initiallyDeferred = reader.GetBoolean(7);
                var argumentCount = reader.GetInt16(8);
                var arguments = reader.IsDBNull(9) ? string.Empty : reader.GetString(9);

                var deferrableClause = "";
                if (isDeferrable)
                {
                    deferrableClause = initiallyDeferred ? " INITIALLY DEFERRED" : " DEFERRABLE";
                }

                var argsClause = "";
                if (argumentCount > 0 && !string.IsNullOrEmpty(arguments))
                {
                    argsClause = $" FOR EACH {triggerLevel}";
                }

                return $"CREATE TRIGGER \"{triggerName}\"" +
                       $" {triggerTiming} {triggerEvents} ON \"{schema}\".\"{tableName}\"" +
                       $"{argsClause}" +
                       $" EXECUTE FUNCTION \"{schema}\".\"{functionName}\"({arguments})" +
                       $"{deferrableClause}" +
                       $"{triggerCondition};";
            }

            return $"CREATE TRIGGER \"{triggerName}\";";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error building trigger definition for {Schema}.{TriggerName}", schema, triggerName);
            return $"CREATE TRIGGER \"{triggerName}\";";
        }
    }
}