namespace PostgreSqlSchemaCompareSync.Core.Comparison.Metadata;

/// <summary>
/// Specialized extractor for function metadata
/// </summary>
public class FunctionMetadataExtractor(
    ILogger<FunctionMetadataExtractor> logger) : IMetadataExtractor, IObjectMetadataExtractor, IObjectValidator
{
    private readonly ILogger<FunctionMetadataExtractor> _logger = logger ?? throw new ArgumentNullException(nameof(logger));

    public ObjectType ObjectType => ObjectType.Function;

    /// <summary>
    /// Extracts function metadata
    /// </summary>
    public async Task<IEnumerable<DatabaseObject>> ExtractAsync(
        NpgsqlConnection connection,
        string? schemaFilter,
        CancellationToken cancellationToken)
    {
        var functions = new List<DatabaseObject>();

        const string query = @"
            SELECT
                p.proname as function_name,
                p.pronamespace::regnamespace as function_schema,
                pg_get_function_identity_arguments(p.oid) as arguments,
                pg_get_functiondef(p.oid) as function_definition,
                obj_description(p.oid) as description,
                p.proowner::regrole as owner
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE (@schemaFilter IS NULL OR n.nspname = @schemaFilter)
              AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
            ORDER BY n.nspname, p.proname";

        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

        using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            functions.Add(new DatabaseObject
            {
                Name = reader.GetString(0),
                Schema = reader.GetString(1),
                Type = ObjectType.Function,
                Database = connection.Database,
                Definition = reader.IsDBNull(3) ? string.Empty : reader.GetString(3),
                Owner = reader.IsDBNull(5) ? string.Empty : reader.GetString(5),
                CreatedAt = DateTime.UtcNow
            });
        }

        return functions;
    }

    /// <summary>
    /// Extracts detailed function information including parameters and dependencies
    /// </summary>
    public async Task<DatabaseObjectDetails> ExtractDetailsAsync(
        NpgsqlConnection connection,
        string schema,
        string functionName,
        CancellationToken cancellationToken)
    {
        var details = new DatabaseObjectDetails
        {
            Name = functionName,
            Type = ObjectType.Function,
            Schema = schema,
            Database = connection.Database,
            CreatedAt = DateTime.UtcNow
        };

        // Get function parameters and metadata
        await ExtractFunctionMetadataAsync(connection, details, cancellationToken);

        // Get function dependencies
        await ExtractFunctionDependenciesAsync(connection, details, cancellationToken);

        return details;
    }

    /// <summary>
    /// Validates function objects
    /// </summary>
    public async Task<ObjectValidationResult> ValidateAsync(
        NpgsqlConnection connection,
        DatabaseObject function,
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
            _logger.LogDebug("Validating function {Schema}.{FunctionName}", function.Schema, function.Name);

            // Check if function exists and get detailed information
            const string query = @"
                SELECT
                    COUNT(*) as function_count,
                    p.prokind as function_kind,
                    p.provolatile as volatility,
                    p.proparallel as parallel_safety,
                    p.prosecdef as security_definer,
                    p.procost as execution_cost,
                    p.prorows as estimated_rows,
                    p.proowner::regrole as owner,
                    obj_description(p.oid) as description
                FROM pg_proc p
                JOIN pg_namespace n ON p.pronamespace = n.oid
                WHERE n.nspname = @schema AND p.proname = @functionName
                GROUP BY p.oid, p.prokind, p.provolatile, p.proparallel, p.prosecdef, p.procost, p.prorows, p.proowner";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schema", function.Schema);
            command.Parameters.AddWithValue("@functionName", function.Name);

            using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                var count = reader.GetInt64(0);

                if (count == 0)
                {
                    result.IsValid = false;
                    result.Errors.Add("Function does not exist or is not accessible");
                }
                else
                {
                    result.Metadata["FunctionExists"] = true;
                    result.Metadata["FunctionKind"] = reader.IsDBNull(1) ? "function" : reader.GetString(1);
                    result.Metadata["Volatility"] = reader.IsDBNull(2) ? "volatile" : reader.GetString(2);
                    result.Metadata["ParallelSafety"] = reader.IsDBNull(3) ? "unsafe" : reader.GetString(3);
                    result.Metadata["SecurityDefiner"] = !reader.IsDBNull(4) && reader.GetBoolean(4);
                    result.Metadata["ExecutionCost"] = reader.IsDBNull(5) ? 0 : reader.GetFloat(5);
                    result.Metadata["EstimatedRows"] = reader.IsDBNull(6) ? 0 : reader.GetInt32(6);
                    result.Metadata["Owner"] = reader.IsDBNull(7) ? string.Empty : reader.GetString(7);

                    // Add warnings for potential issues
                    var volatility = reader.IsDBNull(2) ? "volatile" : reader.GetString(2);
                    if (volatility == "volatile")
                        result.Warnings.Add("Function is volatile - may return different results for same inputs");

                    var parallelSafety = reader.IsDBNull(3) ? "unsafe" : reader.GetString(3);
                    if (parallelSafety == "unsafe")
                        result.Warnings.Add("Function is not parallel-safe - may impact query performance");
                }
            }
            else
            {
                result.IsValid = false;
                result.Errors.Add("Function does not exist or is not accessible");
            }

            result.Metadata["ValidationDate"] = DateTime.UtcNow;
            result.Metadata["ObjectType"] = function.Type.ToString();

            _logger.LogDebug("Validation completed for function {Schema}.{FunctionName}: Valid={IsValid}",
                function.Schema, function.Name, result.IsValid);

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to validate function {Schema}.{FunctionName}", function.Schema, function.Name);

            result.IsValid = false;
            result.Errors.Add($"Validation error: {ex.Message}");
            return result;
        }
    }

    /// <summary>
    /// Extracts detailed function information
    /// </summary>
    private async Task ExtractFunctionMetadataAsync(
        NpgsqlConnection connection,
        DatabaseObjectDetails details,
        CancellationToken cancellationToken)
    {
        // Get function parameters
        const string paramQuery = @"
            SELECT
                p.proname as function_name,
                pg_get_function_identity_arguments(p.oid) as arguments,
                p.prokind as function_type,
                p.provolatile as volatility,
                p.proparallel as parallel_safety,
                p.prosecdef as security_definer,
                p.procost as execution_cost,
                p.prorows as estimated_rows,
                obj_description(p.oid) as description
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = @schema AND p.proname = @functionName";

        using var paramCommand = new NpgsqlCommand(paramQuery, connection);
        paramCommand.Parameters.AddWithValue("@schema", details.Schema);
        paramCommand.Parameters.AddWithValue("@functionName", details.Name);

        using var paramReader = await paramCommand.ExecuteReaderAsync(cancellationToken);
        if (await paramReader.ReadAsync(cancellationToken))
        {
            details.AdditionalInfo["FunctionType"] = paramReader.IsDBNull(2) ? "function" : paramReader.GetString(2);
            details.AdditionalInfo["Volatility"] = paramReader.IsDBNull(3) ? "volatile" : paramReader.GetString(3);
            details.AdditionalInfo["ParallelSafety"] = paramReader.IsDBNull(4) ? "unsafe" : paramReader.GetString(4);
            details.AdditionalInfo["SecurityDefiner"] = !paramReader.IsDBNull(5) && paramReader.GetBoolean(5);
            details.AdditionalInfo["ExecutionCost"] = paramReader.IsDBNull(6) ? 0 : paramReader.GetFloat(6);
            details.AdditionalInfo["EstimatedRows"] = paramReader.IsDBNull(7) ? 0 : paramReader.GetInt32(7);
        }
    }

    /// <summary>
    /// Extracts function dependencies
    /// </summary>
    private async Task ExtractFunctionDependenciesAsync(
        NpgsqlConnection connection,
        DatabaseObjectDetails details,
        CancellationToken cancellationToken)
    {
        const string depQuery = @"
            SELECT DISTINCT
                dependent.relname as dependent_object,
                dependent.relkind as dependent_type,
                dependent.nspname as dependent_schema
            FROM pg_depend d
            JOIN pg_proc func ON d.objid = func.oid
            JOIN pg_namespace func_ns ON func.pronamespace = func_ns.oid
            JOIN pg_class dependent ON d.refobjid = dependent.oid
            JOIN pg_namespace dependent_ns ON dependent.relnamespace = dependent_ns.oid
            WHERE func_ns.nspname = @schema
              AND func.proname = @functionName
              AND dependent.relkind IN ('r', 'v', 'f', 'p')
            UNION ALL
            SELECT DISTINCT
                obj.relname as dependent_object,
                obj.relkind as dependent_type,
                obj.nspname as dependent_schema
            FROM pg_depend d
            JOIN pg_proc func ON d.refobjid = func.oid
            JOIN pg_namespace func_ns ON func.pronamespace = func_ns.oid
            JOIN pg_class obj ON d.objid = obj.oid
            JOIN pg_namespace obj_ns ON obj.relnamespace = obj_ns.oid
            WHERE func_ns.nspname = @schema
              AND func.proname = @functionName
              AND obj.relkind IN ('r', 'v', 'f', 'p')";

        using var funcDepCommand = new NpgsqlCommand(depQuery, connection);
        funcDepCommand.Parameters.AddWithValue("@schema", details.Schema);
        funcDepCommand.Parameters.AddWithValue("@functionName", details.Name);

        using var funcDepReader = await funcDepCommand.ExecuteReaderAsync(cancellationToken);
        while (await funcDepReader.ReadAsync(cancellationToken))
        {
            var dependentObject = funcDepReader.GetString(0);
            var dependentType = funcDepReader.GetChar(1);
            var dependentSchema = funcDepReader.GetString(2);

            var typeChar = char.ToLower(dependentType);
            var dependentObjectType = typeChar switch
            {
                'r' => "table",
                'v' => "view",
                'f' => "function",
                'p' => "procedure",
                _ => "unknown"
            };

            details.Dependencies.Add($"{dependentObjectType}:{dependentSchema}.{dependentObject}");
        }
    }
}