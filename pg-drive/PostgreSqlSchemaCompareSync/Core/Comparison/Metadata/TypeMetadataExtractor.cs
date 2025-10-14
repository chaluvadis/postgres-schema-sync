namespace PostgreSqlSchemaCompareSync.Core.Comparison.Metadata;

/// <summary>
/// Specialized extractor for PostgreSQL type and domain metadata
/// </summary>
public class TypeMetadataExtractor(
    ILogger<TypeMetadataExtractor> logger) : IMetadataExtractor, IObjectMetadataExtractor, IObjectValidator
{
    private readonly ILogger<TypeMetadataExtractor> _logger = logger ?? throw new ArgumentNullException(nameof(logger));

    public ObjectType ObjectType => ObjectType.Type;

    /// <summary>
    /// Extracts type metadata from the database
    /// </summary>
    public async Task<IEnumerable<DatabaseObject>> ExtractAsync(
        NpgsqlConnection connection,
        string? schemaFilter,
        CancellationToken cancellationToken)
    {
        var types = new List<DatabaseObject>();

        // Extract custom types (excluding built-in PostgreSQL types)
        const string typeQuery = @"
            SELECT
                t.typname as type_name,
                n.nspname as type_schema,
                t.typtype as type_type,
                t.typlen as type_length,
                t.typtype as internal_type,
                t.typbyval as by_value,
                t.typalign as alignment,
                t.typstorage as storage,
                t.typnotnull as not_null,
                t.typndims as array_dims,
                t.typcollation as collation_oid,
                t.typdefault as default_value,
                obj_description(t.oid, 'pg_type') as description,
                t.typowner::regrole as type_owner,
                t.typcreated as creation_date,
                CASE
                    WHEN t.typtype = 'b' THEN 'Base type'
                    WHEN t.typtype = 'c' THEN 'Composite type'
                    WHEN t.typtype = 'd' THEN 'Domain'
                    WHEN t.typtype = 'e' THEN 'Enum type'
                    WHEN t.typtype = 'p' THEN 'Pseudo-type'
                    WHEN t.typtype = 'r' THEN 'Range type'
                    ELSE 'Unknown'
                END as type_category,
                pg_type_is_visible(t.oid) as is_visible
            FROM pg_type t
            JOIN pg_namespace n ON t.typnamespace = n.oid
            WHERE (@schemaFilter IS NULL OR n.nspname = @schemaFilter)
              AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
              AND t.typtype NOT IN ('p') -- Exclude pseudo-types
              AND pg_type_is_visible(t.oid) = true
            ORDER BY n.nspname, t.typname";

        using var typeCommand = new NpgsqlCommand(typeQuery, connection);
        typeCommand.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

        using var typeReader = await typeCommand.ExecuteReaderAsync(cancellationToken);
        while (await typeReader.ReadAsync(cancellationToken))
        {
            var typeName = typeReader.GetString(0);
            var typeSchema = typeReader.GetString(1);
            var typeCategory = typeReader.GetString(15);

            types.Add(new DatabaseObject
            {
                Name = typeName,
                Schema = typeSchema,
                Type = typeCategory == "Domain" ? ObjectType.Domain : ObjectType.Type,
                Database = connection.Database,
                Owner = typeReader.IsDBNull(13) ? string.Empty : typeReader.GetString(13),
                Definition = await BuildTypeDefinitionAsync(connection, typeSchema, typeName, typeCategory, cancellationToken),
                CreatedAt = typeReader.IsDBNull(14) ? DateTime.UtcNow : typeReader.GetDateTime(14),
                Properties =
                {
                    ["TypeCategory"] = typeCategory,
                    ["InternalType"] = typeReader.GetString(2),
                    ["TypeLength"] = typeReader.GetInt16(3),
                    ["ByValue"] = typeReader.GetBoolean(5),
                    ["Alignment"] = typeReader.GetString(6),
                    ["Storage"] = typeReader.GetString(7),
                    ["NotNull"] = typeReader.GetBoolean(8),
                    ["ArrayDimensions"] = typeReader.GetInt32(9),
                    ["CollationOid"] = typeReader.GetInt32(10),
                    ["DefaultValue"] = typeReader.IsDBNull(11) ? string.Empty : typeReader.GetString(11),
                    ["Description"] = typeReader.IsDBNull(12) ? string.Empty : typeReader.GetString(12),
                    ["IsVisible"] = typeReader.GetBoolean(16)
                }
            });
        }

        return types;
    }

    /// <summary>
    /// Extracts detailed type information including attributes for composite types
    /// </summary>
    public async Task<DatabaseObjectDetails> ExtractDetailsAsync(
        NpgsqlConnection connection,
        string schema,
        string typeName,
        CancellationToken cancellationToken)
    {
        var details = new DatabaseObjectDetails
        {
            Name = typeName,
            Schema = schema,
            Type = ObjectType.Type,
            Database = connection.Database,
            CreatedAt = DateTime.UtcNow
        };

        await ExtractTypeDetailsAsync(connection, details, cancellationToken);
        return details;
    }

    /// <summary>
    /// Validates type objects
    /// </summary>
    public async Task<ObjectValidationResult> ValidateAsync(
        NpgsqlConnection connection,
        DatabaseObject type,
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
            _logger.LogDebug("Validating type {Schema}.{TypeName}", type.Schema, type.Name);

            // Check if type exists and is accessible
            const string query = @"
                SELECT COUNT(*)
                FROM pg_type t
                JOIN pg_namespace n ON t.typnamespace = n.oid
                WHERE n.nspname = @schema
                  AND t.typname = @typeName
                  AND pg_type_is_visible(t.oid) = true";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schema", type.Schema);
            command.Parameters.AddWithValue("@typeName", type.Name);

            var countResult = await command.ExecuteScalarAsync(cancellationToken);
            var count = countResult != null ? (long)countResult : 0;

            if (count == 0)
            {
                result.IsValid = false;
                result.Errors.Add("Type does not exist or is not accessible");
            }
            else
            {
                result.Metadata["TypeExists"] = true;

                // Get advanced type information
                const string advancedQuery = @"
                    SELECT
                        t.typtype as type_type,
                        t.typisdefined as is_defined,
                        t.typinput as input_function,
                        t.typoutput as output_function,
                        t.typreceive as receive_function,
                        t.typsend as send_function,
                        t.typmodin as type_modifier_input,
                        t.typmodout as type_modifier_output,
                        t.typanalyze as analyze_function,
                        CASE
                            WHEN t.typtype = 'b' THEN 'Base type'
                            WHEN t.typtype = 'c' THEN 'Composite type'
                            WHEN t.typtype = 'd' THEN 'Domain'
                            WHEN t.typtype = 'e' THEN 'Enum type'
                            WHEN t.typtype = 'r' THEN 'Range type'
                            ELSE 'Unknown'
                        END as type_category
                    FROM pg_type t
                    JOIN pg_namespace n ON t.typnamespace = n.oid
                    WHERE n.nspname = @schema AND t.typname = @typeName";

                using var advCommand = new NpgsqlCommand(advancedQuery, connection);
                advCommand.Parameters.AddWithValue("@schema", type.Schema);
                advCommand.Parameters.AddWithValue("@typeName", type.Name);

                using var advReader = await advCommand.ExecuteReaderAsync(cancellationToken);
                if (await advReader.ReadAsync(cancellationToken))
                {
                    var typeCategory = advReader.GetString(9);

                    result.Metadata["TypeCategory"] = typeCategory;
                    result.Metadata["IsDefined"] = advReader.GetBoolean(1);
                    result.Metadata["InputFunction"] = advReader.IsDBNull(2) ? string.Empty : advReader.GetString(2);
                    result.Metadata["OutputFunction"] = advReader.IsDBNull(3) ? string.Empty : advReader.GetString(3);
                    result.Metadata["ReceiveFunction"] = advReader.IsDBNull(4) ? string.Empty : advReader.GetString(4);
                    result.Metadata["SendFunction"] = advReader.IsDBNull(5) ? string.Empty : advReader.GetString(5);

                    // Add warnings for potential issues
                    if (!advReader.GetBoolean(1))
                        result.Warnings.Add("Type is not fully defined - may cause issues");

                    if (typeCategory == "Domain")
                    {
                        await ValidateDomainConstraintsAsync(connection, type.Schema, type.Name, result, cancellationToken);
                    }
                    else if (typeCategory == "Enum type")
                    {
                        await ValidateEnumValuesAsync(connection, type.Schema, type.Name, result, cancellationToken);
                    }
                }

                // Check for type dependencies
                await ValidateTypeDependenciesAsync(connection, type.Schema, type.Name, result, cancellationToken);
            }

            result.Metadata["ValidationDate"] = DateTime.UtcNow;
            result.Metadata["ObjectType"] = type.Type.ToString();

            _logger.LogDebug("Validation completed for type {Schema}.{TypeName}: Valid={IsValid}",
                type.Schema, type.Name, result.IsValid);

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to validate type {Schema}.{TypeName}", type.Schema, type.Name);

            result.IsValid = false;
            result.Errors.Add($"Validation error: {ex.Message}");
            return result;
        }
    }

    /// <summary>
    /// Extracts detailed type information including attributes and constraints
    /// </summary>
    private async Task ExtractTypeDetailsAsync(
        NpgsqlConnection connection,
        DatabaseObjectDetails details,
        CancellationToken cancellationToken)
    {
        // Get type attributes for composite types
        const string attributeQuery = @"
            SELECT
                a.attname as attribute_name,
                a.atttypid::regtype as attribute_type,
                a.attlen as attribute_length,
                a.attnotnull as not_null,
                a.atthasdef as has_default,
                a.attnum as attribute_position,
                d.adsrc as default_value,
                obj_description(a.attrelid, 'pg_class') as attribute_comment
            FROM pg_attribute a
            LEFT JOIN pg_attrdef d ON a.attrelid = d.adrelid AND a.attnum = d.adnum
            WHERE a.attrelid = (SELECT oid FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid
                               WHERE n.nspname = @schema AND t.typname = @typeName)
              AND a.attnum > 0
              AND NOT a.attisdropped
            ORDER BY a.attnum";

        using var attrCommand = new NpgsqlCommand(attributeQuery, connection);
        attrCommand.Parameters.AddWithValue("@schema", details.Schema);
        attrCommand.Parameters.AddWithValue("@typeName", details.Name);

        using var attrReader = await attrCommand.ExecuteReaderAsync(cancellationToken);
        while (await attrReader.ReadAsync(cancellationToken))
        {
            var attrName = attrReader.GetString(0);
            var attrType = attrReader.GetString(1);
            var notNull = attrReader.GetBoolean(3);
            var hasDefault = attrReader.GetBoolean(4);
            var position = attrReader.GetInt16(5);

            details.AdditionalInfo[$"Attribute_{attrName}_Type"] = attrType;
            details.AdditionalInfo[$"Attribute_{attrName}_NotNull"] = notNull;
            details.AdditionalInfo[$"Attribute_{attrName}_HasDefault"] = hasDefault;
            details.AdditionalInfo[$"Attribute_{attrName}_Position"] = position;

            if (hasDefault && !attrReader.IsDBNull(6))
            {
                details.AdditionalInfo[$"Attribute_{attrName}_Default"] = attrReader.GetString(6);
            }

            if (!attrReader.IsDBNull(7))
            {
                details.AdditionalInfo[$"Attribute_{attrName}_Comment"] = attrReader.GetString(7);
            }
        }

        // Get domain constraints if this is a domain
        if (details.Type == ObjectType.Domain)
        {
            const string constraintQuery = @"
                SELECT
                    c.conname as constraint_name,
                    c.consrc as constraint_source,
                    c.connoinherit as no_inherit
                FROM pg_constraint c
                JOIN pg_type t ON c.contypid = t.oid
                JOIN pg_namespace n ON t.typnamespace = n.oid
                WHERE n.nspname = @schema AND t.typname = @typeName
                ORDER BY c.conname";

            using var consCommand = new NpgsqlCommand(constraintQuery, connection);
            consCommand.Parameters.AddWithValue("@schema", details.Schema);
            consCommand.Parameters.AddWithValue("@typeName", details.Name);

            using var consReader = await consCommand.ExecuteReaderAsync(cancellationToken);
            var constraints = new List<string>();
            while (await consReader.ReadAsync(cancellationToken))
            {
                var constraintName = consReader.GetString(0);
                var constraintSource = consReader.GetString(1);
                var noInherit = consReader.GetBoolean(2);
                constraints.Add($"{constraintName}: {constraintSource}{(noInherit ? " (NO INHERIT)" : "")}");
            }

            if (constraints.Any())
            {
                details.AdditionalInfo["DomainConstraints"] = string.Join("; ", constraints);
            }
        }

        // Get enum values if this is an enum type
        const string enumQuery = @"
            SELECT
                e.enumlabel as enum_value,
                e.enumsortorder as sort_order
            FROM pg_enum e
            JOIN pg_type t ON e.enumtypid = t.oid
            JOIN pg_namespace n ON t.typnamespace = n.oid
            WHERE n.nspname = @schema AND t.typname = @typeName
            ORDER BY e.enumsortorder";

        using var enumCommand = new NpgsqlCommand(enumQuery, connection);
        enumCommand.Parameters.AddWithValue("@schema", details.Schema);
        enumCommand.Parameters.AddWithValue("@typeName", details.Name);

        using var enumReader = await enumCommand.ExecuteReaderAsync(cancellationToken);
        var enumValues = new List<string>();
        while (await enumReader.ReadAsync(cancellationToken))
        {
            var enumValue = enumReader.GetString(0);
            var sortOrder = enumReader.GetFloat(1);
            enumValues.Add($"{enumValue} ({sortOrder})");
        }

        if (enumValues.Any())
        {
            details.AdditionalInfo["EnumValues"] = string.Join(", ", enumValues);
            details.AdditionalInfo["EnumValueCount"] = enumValues.Count;
        }
    }

    /// <summary>
    /// Validates domain constraints
    /// </summary>
    private async Task ValidateDomainConstraintsAsync(
        NpgsqlConnection connection,
        string schema,
        string typeName,
        ObjectValidationResult result,
        CancellationToken cancellationToken)
    {
        try
        {
            const string query = @"
                SELECT COUNT(*)
                FROM pg_constraint c
                JOIN pg_type t ON c.contypid = t.oid
                JOIN pg_namespace n ON t.typnamespace = n.oid
                WHERE n.nspname = @schema AND t.typname = @typeName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schema", schema);
            command.Parameters.AddWithValue("@typeName", typeName);

            var constraintCount = await command.ExecuteScalarAsync(cancellationToken);
            var count = constraintCount != null ? (long)constraintCount : 0;

            result.Metadata["ConstraintCount"] = count;

            if (count == 0)
            {
                result.Warnings.Add("Domain has no constraints - may not provide expected data validation");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error checking domain constraints for {Schema}.{TypeName}", schema, typeName);
        }
    }

    /// <summary>
    /// Validates enum values
    /// </summary>
    private async Task ValidateEnumValuesAsync(
        NpgsqlConnection connection,
        string schema,
        string typeName,
        ObjectValidationResult result,
        CancellationToken cancellationToken)
    {
        try
        {
            const string query = @"
                SELECT COUNT(*)
                FROM pg_enum e
                JOIN pg_type t ON e.enumtypid = t.oid
                JOIN pg_namespace n ON t.typnamespace = n.oid
                WHERE n.nspname = @schema AND t.typname = @typeName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schema", schema);
            command.Parameters.AddWithValue("@typeName", typeName);

            var enumCount = await command.ExecuteScalarAsync(cancellationToken);
            var count = enumCount != null ? (long)enumCount : 0;

            result.Metadata["EnumValueCount"] = count;

            if (count == 0)
            {
                result.Errors.Add("Enum type has no values defined");
            }
            else if (count == 1)
            {
                result.Warnings.Add("Enum type has only one value - may be unnecessarily restrictive");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error checking enum values for {Schema}.{TypeName}", schema, typeName);
        }
    }

    /// <summary>
    /// Validates type dependencies
    /// </summary>
    private async Task ValidateTypeDependenciesAsync(
        NpgsqlConnection connection,
        string schema,
        string typeName,
        ObjectValidationResult result,
        CancellationToken cancellationToken)
    {
        try
        {
            // Check if type is used by any tables or other objects
            const string dependencyQuery = @"
                SELECT COUNT(*)
                FROM pg_attribute a
                JOIN pg_class c ON a.attrelid = c.oid
                JOIN pg_namespace n ON c.relnamespace = n.oid
                WHERE a.atttypid = (SELECT oid FROM pg_type t WHERE t.typname = @typeName AND t.typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = @schema))
                  AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')";

            using var depCommand = new NpgsqlCommand(dependencyQuery, connection);
            depCommand.Parameters.AddWithValue("@typeName", typeName);
            depCommand.Parameters.AddWithValue("@schema", schema);

            var dependencyCount = await depCommand.ExecuteScalarAsync(cancellationToken);
            var count = dependencyCount != null ? (long)dependencyCount : 0;

            result.Metadata["UsageCount"] = count;

            if (count == 0)
            {
                result.Warnings.Add("Type is not used by any table columns - may be unused");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error checking type dependencies for {Schema}.{TypeName}", schema, typeName);
        }
    }

    /// <summary>
    /// Builds a CREATE TYPE statement for the type
    /// </summary>
    private async Task<string> BuildTypeDefinitionAsync(
        NpgsqlConnection connection,
        string schema,
        string typeName,
        string typeCategory,
        CancellationToken cancellationToken)
    {
        try
        {
            if (typeCategory == "Domain")
            {
                return await BuildDomainDefinitionAsync(connection, schema, typeName, cancellationToken);
            }
            else if (typeCategory == "Enum type")
            {
                return await BuildEnumDefinitionAsync(connection, schema, typeName, cancellationToken);
            }
            else if (typeCategory == "Composite type")
            {
                return await BuildCompositeTypeDefinitionAsync(connection, schema, typeName, cancellationToken);
            }
            else
            {
                // Base type or other - return a generic CREATE statement
                return $"CREATE TYPE \"{schema}\".\"{typeName}\";";
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error building type definition for {Schema}.{TypeName}", schema, typeName);
            return $"CREATE TYPE \"{schema}\".\"{typeName}\";";
        }
    }

    /// <summary>
    /// Builds a CREATE DOMAIN statement
    /// </summary>
    private async Task<string> BuildDomainDefinitionAsync(
        NpgsqlConnection connection,
        string schema,
        string domainName,
        CancellationToken cancellationToken)
    {
        try
        {
            const string query = @"
                SELECT
                    t.typname as base_type,
                    t.typnotnull as not_null,
                    t.typdefault as default_value,
                    c.consrc as constraint_source
                FROM pg_type t
                LEFT JOIN pg_constraint c ON c.contypid = t.oid
                JOIN pg_namespace n ON t.typnamespace = n.oid
                WHERE n.nspname = @schema AND t.typname = @domainName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schema", schema);
            command.Parameters.AddWithValue("@domainName", domainName);

            using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                var baseType = reader.GetString(0);
                var notNull = reader.GetBoolean(1);
                var defaultValue = reader.IsDBNull(2) ? string.Empty : $" DEFAULT {reader.GetString(2)}";
                var constraint = reader.IsDBNull(3) ? string.Empty : $" CHECK ({reader.GetString(3)})";

                return $"CREATE DOMAIN \"{schema}\".\"{domainName}\" AS {baseType}{defaultValue}{constraint}{(notNull ? " NOT NULL" : "")};";
            }

            return $"CREATE DOMAIN \"{schema}\".\"{domainName}\";";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error building domain definition for {Schema}.{DomainName}", schema, domainName);
            return $"CREATE DOMAIN \"{schema}\".\"{domainName}\";";
        }
    }

    /// <summary>
    /// Builds a CREATE TYPE statement for enum
    /// </summary>
    private async Task<string> BuildEnumDefinitionAsync(
        NpgsqlConnection connection,
        string schema,
        string enumName,
        CancellationToken cancellationToken)
    {
        try
        {
            const string query = @"
                SELECT string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder)
                FROM pg_enum e
                JOIN pg_type t ON e.enumtypid = t.oid
                JOIN pg_namespace n ON t.typnamespace = n.oid
                WHERE n.nspname = @schema AND t.typname = @enumName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schema", schema);
            command.Parameters.AddWithValue("@enumName", enumName);

            var enumValues = await command.ExecuteScalarAsync(cancellationToken);
            var values = enumValues?.ToString() ?? "";

            if (!string.IsNullOrEmpty(values))
            {
                return $"CREATE TYPE \"{schema}\".\"{enumName}\" AS ENUM ({values});";
            }

            return $"CREATE TYPE \"{schema}\".\"{enumName}\" AS ENUM ();";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error building enum definition for {Schema}.{EnumName}", schema, enumName);
            return $"CREATE TYPE \"{schema}\".\"{enumName}\" AS ENUM ();";
        }
    }

    /// <summary>
    /// Builds a CREATE TYPE statement for composite type
    /// </summary>
    private async Task<string> BuildCompositeTypeDefinitionAsync(
        NpgsqlConnection connection,
        string schema,
        string typeName,
        CancellationToken cancellationToken)
    {
        try
        {
            const string query = @"
                SELECT string_agg(
                    format('%I %s%s',
                        a.attname,
                        a.atttypid::regtype,
                        CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END
                    ),
                    ', '
                    ORDER BY a.attnum
                )
                FROM pg_attribute a
                WHERE a.attrelid = (SELECT oid FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid
                                   WHERE n.nspname = @schema AND t.typname = @typeName)
                  AND a.attnum > 0
                  AND NOT a.attisdropped";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schema", schema);
            command.Parameters.AddWithValue("@typeName", typeName);

            var attributes = await command.ExecuteScalarAsync(cancellationToken);
            var attrs = attributes?.ToString() ?? "";

            if (!string.IsNullOrEmpty(attrs))
            {
                return $"CREATE TYPE \"{schema}\".\"{typeName}\" AS ({attrs});";
            }

            return $"CREATE TYPE \"{schema}\".\"{typeName}\" AS ();";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error building composite type definition for {Schema}.{TypeName}", schema, typeName);
            return $"CREATE TYPE \"{schema}\".\"{typeName}\" AS ();";
        }
    }
}