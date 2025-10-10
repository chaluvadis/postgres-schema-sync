namespace PostgreSqlSchemaCompareSync.Core.Comparison.Metadata;

/// <summary>
/// Specialized extractor for PostgreSQL procedure metadata
/// </summary>
public class ProcedureMetadataExtractor(
    ILogger<ProcedureMetadataExtractor> logger) : IMetadataExtractor, IObjectMetadataExtractor, IObjectValidator
{
    private readonly ILogger<ProcedureMetadataExtractor> _logger = logger ?? throw new ArgumentNullException(nameof(logger));

    public ObjectType ObjectType => ObjectType.Procedure;

    /// <summary>
    /// Extracts procedure metadata from the database
    /// </summary>
    public async Task<IEnumerable<DatabaseObject>> ExtractAsync(
        NpgsqlConnection connection,
        string? schemaFilter,
        CancellationToken cancellationToken)
    {
        var procedures = new List<DatabaseObject>();

        const string query = @"
            SELECT
                p.proname as procedure_name,
                n.nspname as procedure_schema,
                p.prokind as procedure_kind,
                p.proretset as returns_set,
                p.provolatile as volatility,
                p.proparallel as parallel_safety,
                p.pronargs as argument_count,
                p.pronargdefaults as default_args_count,
                p.prorettype as return_type_oid,
                t.typname as return_type_name,
                p.proargtypes as argument_types,
                p.proargnames as argument_names,
                p.proargmodes as argument_modes,
                p.prosrc as procedure_source,
                obj_description(p.oid, 'pg_proc') as description,
                p.proowner::regrole as procedure_owner,
                p.procreated as creation_date,
                p.prolang as language_oid,
                l.lanname as language_name,
                p.prosecdef as is_security_definer,
                p.proleakproof as is_leakproof,
                p.proisstrict as is_strict,
                p.proisagg as is_aggregate,
                p.proiswindow as is_window_function,
                p.proistrusted as is_trusted,
                p.prosupport as support_function
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            JOIN pg_language l ON p.prolang = l.oid
            LEFT JOIN pg_type t ON p.prorettype = t.oid
            WHERE p.prokind = 'p' -- Procedures only (not functions)
              AND (@schemaFilter IS NULL OR n.nspname = @schemaFilter)
              AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
            ORDER BY n.nspname, p.proname";

        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

        using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var procedureName = reader.GetString(0);
            var procedureSchema = reader.GetString(1);

            procedures.Add(new DatabaseObject
            {
                Name = procedureName,
                Schema = procedureSchema,
                Type = ObjectType.Procedure,
                Database = connection.Database,
                Owner = reader.IsDBNull(15) ? string.Empty : reader.GetString(15),
                Definition = await BuildProcedureDefinitionAsync(connection, procedureSchema, procedureName, cancellationToken),
                CreatedAt = reader.IsDBNull(16) ? DateTime.UtcNow : reader.GetDateTime(16),
                Properties =
                {
                    ["ProcedureKind"] = reader.GetString(2),
                    ["ReturnsSet"] = reader.GetBoolean(3),
                    ["Volatility"] = reader.GetString(4),
                    ["ParallelSafety"] = reader.GetString(5),
                    ["ArgumentCount"] = reader.GetInt16(6),
                    ["DefaultArgsCount"] = reader.GetInt16(7),
                    ["ReturnTypeOid"] = reader.GetInt32(8),
                    ["ReturnTypeName"] = reader.IsDBNull(9) ? string.Empty : reader.GetString(9),
                    ["ArgumentTypes"] = reader.IsDBNull(10) ? string.Empty : reader.GetString(10),
                    ["ArgumentNames"] = reader.IsDBNull(11) ? string.Empty : reader.GetString(11),
                    ["ArgumentModes"] = reader.IsDBNull(12) ? string.Empty : reader.GetString(12),
                    ["ProcedureSource"] = reader.IsDBNull(13) ? string.Empty : reader.GetString(13),
                    ["Description"] = reader.IsDBNull(14) ? string.Empty : reader.GetString(14),
                    ["LanguageOid"] = reader.GetInt32(17),
                    ["LanguageName"] = reader.GetString(18),
                    ["IsSecurityDefiner"] = reader.GetBoolean(19),
                    ["IsLeakproof"] = reader.GetBoolean(20),
                    ["IsStrict"] = reader.GetBoolean(21),
                    ["IsAggregate"] = reader.GetBoolean(22),
                    ["IsWindowFunction"] = reader.GetBoolean(23),
                    ["IsTrusted"] = reader.GetBoolean(24),
                    ["SupportFunction"] = reader.IsDBNull(25) ? string.Empty : reader.GetString(25)
                }
            });
        }

        return procedures;
    }

    /// <summary>
    /// Extracts detailed procedure information
    /// </summary>
    public async Task<DatabaseObjectDetails> ExtractDetailsAsync(
        NpgsqlConnection connection,
        string schema,
        string procedureName,
        CancellationToken cancellationToken)
    {
        var details = new DatabaseObjectDetails
        {
            Name = procedureName,
            Schema = schema,
            Type = ObjectType.Procedure,
            Database = connection.Database,
            CreatedAt = DateTime.UtcNow
        };

        await ExtractProcedureDetailsAsync(connection, details, cancellationToken);
        return details;
    }

    /// <summary>
    /// Validates procedure objects
    /// </summary>
    public async Task<ObjectValidationResult> ValidateAsync(
        NpgsqlConnection connection,
        DatabaseObject procedure,
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
            _logger.LogDebug("Validating procedure {Schema}.{ProcedureName}", procedure.Schema, procedure.Name);

            // Check if procedure exists and is accessible
            const string query = @"
                SELECT COUNT(*)
                FROM pg_proc p
                JOIN pg_namespace n ON p.pronamespace = n.oid
                WHERE p.prokind = 'p'
                  AND n.nspname = @schema
                  AND p.proname = @procedureName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schema", procedure.Schema);
            command.Parameters.AddWithValue("@procedureName", procedure.Name);

            var countResult = await command.ExecuteScalarAsync(cancellationToken);
            var count = countResult != null ? (long)countResult : 0;

            if (count == 0)
            {
                result.IsValid = false;
                result.Errors.Add("Procedure does not exist or is not accessible");
            }
            else
            {
                result.Metadata["ProcedureExists"] = true;

                // Get advanced procedure information
                const string advancedQuery = @"
                    SELECT
                        p.provolatile as volatility,
                        p.proparallel as parallel_safety,
                        p.proisstrict as is_strict,
                        p.proisagg as is_aggregate,
                        p.proiswindow as is_window_function,
                        p.proistrusted as is_trusted,
                        p.proleakproof as is_leakproof,
                        p.prosecdef as is_security_definer,
                        p.pronargs as argument_count,
                        p.prorettype as return_type_oid,
                        t.typname as return_type_name,
                        l.lanname as language_name,
                        p.prosrc as procedure_source
                    FROM pg_proc p
                    JOIN pg_namespace n ON p.pronamespace = n.oid
                    JOIN pg_language l ON p.prolang = l.oid
                    LEFT JOIN pg_type t ON p.prorettype = t.oid
                    WHERE n.nspname = @schema AND p.proname = @procedureName";

                using var advCommand = new NpgsqlCommand(advancedQuery, connection);
                advCommand.Parameters.AddWithValue("@schema", procedure.Schema);
                advCommand.Parameters.AddWithValue("@procedureName", procedure.Name);

                using var advReader = await advCommand.ExecuteReaderAsync(cancellationToken);
                if (await advReader.ReadAsync(cancellationToken))
                {
                    result.Metadata["Volatility"] = advReader.GetString(0);
                    result.Metadata["ParallelSafety"] = advReader.GetString(1);
                    result.Metadata["IsStrict"] = advReader.GetBoolean(2);
                    result.Metadata["IsAggregate"] = advReader.GetBoolean(3);
                    result.Metadata["IsWindowFunction"] = advReader.GetBoolean(4);
                    result.Metadata["IsTrusted"] = advReader.GetBoolean(5);
                    result.Metadata["IsLeakproof"] = advReader.GetBoolean(6);
                    result.Metadata["IsSecurityDefiner"] = advReader.GetBoolean(7);
                    result.Metadata["ArgumentCount"] = advReader.GetInt16(8);
                    result.Metadata["ReturnTypeOid"] = advReader.GetInt32(9);
                    result.Metadata["ReturnTypeName"] = advReader.IsDBNull(10) ? string.Empty : advReader.GetString(10);
                    result.Metadata["LanguageName"] = advReader.GetString(11);
                    result.Metadata["ProcedureSource"] = advReader.IsDBNull(12) ? string.Empty : advReader.GetString(12);

                    // Add warnings for potential issues
                    if (advReader.GetBoolean(3))
                        result.Warnings.Add("Procedure is an aggregate function - special handling may be required");

                    if (advReader.GetBoolean(4))
                        result.Warnings.Add("Procedure is a window function - may have performance implications");

                    if (!advReader.GetBoolean(5))
                        result.Warnings.Add("Procedure is not marked as trusted - may have security implications");

                    if (advReader.GetBoolean(6))
                        result.Warnings.Add("Procedure is leakproof - may hide sensitive information");

                    var language = advReader.GetString(11);
                    if (language != "sql" && language != "plpgsql")
                        result.Warnings.Add($"Procedure uses non-standard language ({language}) - may impact portability");
                }

                // Validate procedure dependencies
                await ValidateProcedureDependenciesAsync(connection, procedure.Schema, procedure.Name, result, cancellationToken);

                // Check for procedure usage patterns
                await ValidateProcedureUsageAsync(connection, procedure.Schema, procedure.Name, result, cancellationToken);
            }

            result.Metadata["ValidationDate"] = DateTime.UtcNow;
            result.Metadata["ObjectType"] = procedure.Type.ToString();

            _logger.LogDebug("Validation completed for procedure {Schema}.{ProcedureName}: Valid={IsValid}",
                procedure.Schema, procedure.Name, result.IsValid);

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to validate procedure {Schema}.{ProcedureName}", procedure.Schema, procedure.Name);

            result.IsValid = false;
            result.Errors.Add($"Validation error: {ex.Message}");
            return result;
        }
    }

    /// <summary>
    /// Extracts detailed procedure information including arguments and dependencies
    /// </summary>
    private async Task ExtractProcedureDetailsAsync(
        NpgsqlConnection connection,
        DatabaseObjectDetails details,
        CancellationToken cancellationToken)
    {
        // Get procedure arguments with detailed information
        const string argumentQuery = @"
            SELECT
                p.proargnames as argument_names,
                p.proargtypes as argument_types,
                p.proargmodes as argument_modes,
                p.pronargdefaults as default_args_count,
                p.proargdefaults as default_values
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = @schema AND p.proname = @procedureName";

        using var argCommand = new NpgsqlCommand(argumentQuery, connection);
        argCommand.Parameters.AddWithValue("@schema", details.Schema);
        argCommand.Parameters.AddWithValue("@procedureName", details.Name);

        using var argReader = await argCommand.ExecuteReaderAsync(cancellationToken);
        if (await argReader.ReadAsync(cancellationToken))
        {
            if (!argReader.IsDBNull(0))
            {
                var argumentNames = (string[])argReader.GetValue(0);
                var argumentTypes = (uint[])argReader.GetValue(1);
                var argumentModes = argReader.IsDBNull(2) ? new char[argumentNames.Length] : (char[])argReader.GetValue(2);

                for (int i = 0; i < argumentNames.Length; i++)
                {
                    var argName = argumentNames[i];
                    var argType = $"OID:{argumentTypes[i]}";
                    var argMode = i < argumentModes.Length ? argumentModes[i].ToString() : "i";

                    details.AdditionalInfo[$"Argument_{i}_Name"] = argName;
                    details.AdditionalInfo[$"Argument_{i}_Type"] = argType;
                    details.AdditionalInfo[$"Argument_{i}_Mode"] = argMode;
                }
            }
        }

        // Get procedure dependencies (objects referenced by the procedure)
        const string dependencyQuery = @"
            SELECT
                'Table' as ref_type,
                t.relname as ref_name,
                n.nspname as ref_schema
            FROM pg_depend d
            JOIN pg_proc p ON d.objid = p.oid
            JOIN pg_class t ON d.refobjid = t.oid
            JOIN pg_namespace n ON t.relnamespace = n.oid
            WHERE p.proname = @procedureName
              AND p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = @schema)
              AND d.deptype = 'n'
              AND t.relkind = 'r'
            UNION ALL
            SELECT
                'Function' as ref_type,
                f.proname as ref_name,
                fn.nspname as ref_schema
            FROM pg_depend d
            JOIN pg_proc p ON d.objid = p.oid
            JOIN pg_proc f ON d.refobjid = f.oid
            JOIN pg_namespace fn ON f.pronamespace = fn.oid
            WHERE p.proname = @procedureName
              AND p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = @schema)
              AND d.deptype = 'n'";

        using var depCommand = new NpgsqlCommand(dependencyQuery, connection);
        depCommand.Parameters.AddWithValue("@procedureName", details.Name);
        depCommand.Parameters.AddWithValue("@schema", details.Schema);

        using var depReader = await depCommand.ExecuteReaderAsync(cancellationToken);
        var dependencies = new List<string>();
        while (await depReader.ReadAsync(cancellationToken))
        {
            var refType = depReader.GetString(0);
            var refName = depReader.GetString(1);
            var refSchema = depReader.GetString(2);
            dependencies.Add($"{refType}: {refSchema}.{refName}");
        }

        if (dependencies.Any())
        {
            details.AdditionalInfo["Dependencies"] = string.Join("; ", dependencies);
            details.AdditionalInfo["DependencyCount"] = dependencies.Count;
        }
    }

    /// <summary>
    /// Validates procedure dependencies
    /// </summary>
    private async Task ValidateProcedureDependenciesAsync(
        NpgsqlConnection connection,
        string schema,
        string procedureName,
        ObjectValidationResult result,
        CancellationToken cancellationToken)
    {
        try
        {
            // Check if all referenced objects exist
            const string query = @"
                SELECT COUNT(*)
                FROM pg_proc p
                JOIN pg_namespace n ON p.pronamespace = n.oid
                WHERE n.nspname = @schema AND p.proname = @procedureName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schema", schema);
            command.Parameters.AddWithValue("@procedureName", procedureName);

            var procedureCount = await command.ExecuteScalarAsync(cancellationToken);
            var count = procedureCount != null ? (long)procedureCount : 0;

            result.Metadata["ValidProcedureDefinition"] = count > 0;

            if (count == 0)
            {
                result.Errors.Add("Procedure definition is invalid or references non-existent objects");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error checking procedure dependencies for {Schema}.{ProcedureName}", schema, procedureName);
            result.Warnings.Add($"Could not verify procedure dependencies: {ex.Message}");
        }
    }

    /// <summary>
    /// Validates procedure usage patterns
    /// </summary>
    private async Task ValidateProcedureUsageAsync(
        NpgsqlConnection connection,
        string schema,
        string procedureName,
        ObjectValidationResult result,
        CancellationToken cancellationToken)
    {
        try
        {
            // Check if procedure is used in other database objects
            const string query = @"
                SELECT COUNT(*)
                FROM pg_proc p
                JOIN pg_namespace n ON p.pronamespace = n.oid
                WHERE n.nspname = @schema AND p.proname = @procedureName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schema", schema);
            command.Parameters.AddWithValue("@procedureName", procedureName);

            var usageCount = await command.ExecuteScalarAsync(cancellationToken);
            var count = usageCount != null ? (long)usageCount : 0;

            result.Metadata["UsageCount"] = count;

            if (count == 0)
            {
                result.Warnings.Add("Procedure is not used by any other objects - may be unused");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error checking procedure usage for {Schema}.{ProcedureName}", schema, procedureName);
            result.Warnings.Add($"Could not verify procedure usage: {ex.Message}");
        }
    }

    /// <summary>
    /// Builds a CREATE PROCEDURE statement for the procedure
    /// </summary>
    private async Task<string> BuildProcedureDefinitionAsync(
        NpgsqlConnection connection,
        string schema,
        string procedureName,
        CancellationToken cancellationToken)
    {
        try
        {
            const string query = @"
                SELECT
                    p.prosrc as procedure_source,
                    p.prolang as language_oid,
                    l.lanname as language_name,
                    p.pronargs as argument_count,
                    p.proargnames as argument_names,
                    p.proargtypes as argument_types,
                    p.proargmodes as argument_modes,
                    p.pronargdefaults as default_args_count,
                    p.prorettype as return_type_oid,
                    t.typname as return_type_name
                FROM pg_proc p
                JOIN pg_namespace n ON p.pronamespace = n.oid
                JOIN pg_language l ON p.prolang = l.oid
                LEFT JOIN pg_type t ON p.prorettype = t.oid
                WHERE n.nspname = @schema AND p.proname = @procedureName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schema", schema);
            command.Parameters.AddWithValue("@procedureName", procedureName);

            using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                var procedureSource = reader.IsDBNull(0) ? string.Empty : reader.GetString(0);
                var languageName = reader.GetString(2);
                var argumentCount = reader.GetInt16(3);

                if (argumentCount > 0 && !reader.IsDBNull(4))
                {
                    var argumentNames = (string[])reader.GetValue(4);
                    var argumentTypes = (uint[])reader.GetValue(5);
                    var argumentModes = reader.IsDBNull(6) ? new char[argumentNames.Length] : (char[])reader.GetValue(6);

                    var parameters = new List<string>();
                    for (int i = 0; i < argumentNames.Length; i++)
                    {
                        var paramName = argumentNames[i];
                        var paramType = $"OID:{argumentTypes[i]}";
                        var paramMode = i < argumentModes.Length ? argumentModes[i].ToString() : "i";

                        if (paramMode == "o")
                            parameters.Add($"OUT {paramName} {paramType}");
                        else if (paramMode == "b")
                            parameters.Add($"INOUT {paramName} {paramType}");
                        else
                            parameters.Add($"IN {paramName} {paramType}");
                    }

                    var paramString = string.Join(", ", parameters);

                    return $"CREATE PROCEDURE \"{schema}\".\"{procedureName}\"({paramString})" +
                           $" LANGUAGE {languageName}" +
                           $" AS {procedureSource};";
                }
                else
                {
                    return $"CREATE PROCEDURE \"{schema}\".\"{procedureName}\"()" +
                           $" LANGUAGE {languageName}" +
                           $" AS {procedureSource};";
                }
            }

            return $"CREATE PROCEDURE \"{schema}\".\"{procedureName}\";";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error building procedure definition for {Schema}.{ProcedureName}", schema, procedureName);
            return $"CREATE PROCEDURE \"{schema}\".\"{procedureName}\";";
        }
    }
}