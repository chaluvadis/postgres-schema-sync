namespace PostgreSqlSchemaCompareSync.Core.Comparison.Metadata;

/// <summary>
/// Specialized extractor for PostgreSQL collation metadata
/// </summary>
public class CollationMetadataExtractor(
    ILogger<CollationMetadataExtractor> logger) : IMetadataExtractor, IObjectMetadataExtractor, IObjectValidator
{
    private readonly ILogger<CollationMetadataExtractor> _logger = logger ?? throw new ArgumentNullException(nameof(logger));

    public ObjectType ObjectType => ObjectType.Collation;

    /// <summary>
    /// Extracts collation metadata from the database
    /// </summary>
    public async Task<IEnumerable<DatabaseObject>> ExtractAsync(
        NpgsqlConnection connection,
        string? schemaFilter,
        CancellationToken cancellationToken)
    {
        var collations = new List<DatabaseObject>();

        const string query = @"
            SELECT
                c.collname as collation_name,
                n.nspname as collation_schema,
                c.collowner::regrole as collation_owner,
                c.collprovider as provider,
                c.collisdeterministic as is_deterministic,
                c.collencoding as encoding_id,
                e.encoding_name,
                c.collcollate as collate_setting,
                c.collctype as ctype_setting,
                c.collversion as version,
                obj_description(c.oid, 'pg_collation') as description,
                c.oid as collation_oid,
                c.collcreated as creation_date
            FROM pg_collation c
            JOIN pg_namespace n ON c.collnamespace = n.oid
            LEFT JOIN (VALUES
                (0, 'UTF8'),
                (1, 'SQL_ASCII'),
                (2, 'EUC_JP'),
                (3, 'EUC_CN'),
                (4, 'EUC_KR'),
                (5, 'EUC_TW'),
                (6, 'JOHAB'),
                (7, 'LATIN1'),
                (8, 'LATIN2'),
                (9, 'LATIN3'),
                (10, 'LATIN4'),
                (11, 'LATIN5'),
                (12, 'LATIN6'),
                (13, 'LATIN7'),
                (14, 'LATIN8'),
                (15, 'LATIN9'),
                (16, 'LATIN10'),
                (17, 'WIN1256'),
                (18, 'WIN1258'),
                (19, 'WIN866'),
                (20, 'WIN874'),
                (21, 'KOI8R'),
                (22, 'WIN1251'),
                (23, 'WIN1252'),
                (24, 'ISO_8859_5'),
                (25, 'ISO_8859_6'),
                (26, 'ISO_8859_7'),
                (27, 'ISO_8859_8'),
                (28, 'WIN1250'),
                (29, 'WIN1253'),
                (30, 'WIN1254'),
                (31, 'WIN1255'),
                (32, 'WIN1257'),
                (33, 'KOI8U'),
                (34, 'SJIS'),
                (35, 'BIG5'),
                (36, 'GBK'),
                (37, 'UHC'),
                (38, 'GB18030'),
                (39, 'JOHAB'),
                (40, 'SHIFT_JIS_2004')
            ) AS e(encoding_id, encoding_name) ON c.collencoding = e.encoding_id
            WHERE (@schemaFilter IS NULL OR n.nspname = @schemaFilter)
              AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
            ORDER BY n.nspname, c.collname";

        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

        using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var collationName = reader.GetString(0);
            var collationSchema = reader.GetString(1);

            collations.Add(new DatabaseObject
            {
                Name = collationName,
                Schema = collationSchema,
                Type = ObjectType.Collation,
                Database = connection.Database,
                Owner = reader.IsDBNull(2) ? string.Empty : reader.GetString(2),
                Definition = await BuildCollationDefinitionAsync(connection, collationSchema, collationName, cancellationToken),
                CreatedAt = reader.IsDBNull(12) ? DateTime.UtcNow : reader.GetDateTime(12),
                Properties =
                {
                    ["Provider"] = reader.GetString(3),
                    ["IsDeterministic"] = reader.GetBoolean(4),
                    ["EncodingId"] = reader.GetInt32(5),
                    ["EncodingName"] = reader.IsDBNull(6) ? string.Empty : reader.GetString(6),
                    ["CollateSetting"] = reader.IsDBNull(7) ? string.Empty : reader.GetString(7),
                    ["CtypeSetting"] = reader.IsDBNull(8) ? string.Empty : reader.GetString(8),
                    ["Version"] = reader.IsDBNull(9) ? string.Empty : reader.GetString(9),
                    ["Description"] = reader.IsDBNull(10) ? string.Empty : reader.GetString(10),
                    ["CollationOid"] = reader.GetInt32(11)
                }
            });
        }

        return collations;
    }

    /// <summary>
    /// Extracts detailed collation information
    /// </summary>
    public async Task<DatabaseObjectDetails> ExtractDetailsAsync(
        NpgsqlConnection connection,
        string schema,
        string collationName,
        CancellationToken cancellationToken)
    {
        var details = new DatabaseObjectDetails
        {
            Name = collationName,
            Schema = schema,
            Type = ObjectType.Collation,
            Database = connection.Database,
            CreatedAt = DateTime.UtcNow
        };

        await ExtractCollationDetailsAsync(connection, details, cancellationToken);
        return details;
    }

    /// <summary>
    /// Validates collation objects
    /// </summary>
    public async Task<ObjectValidationResult> ValidateAsync(
        NpgsqlConnection connection,
        DatabaseObject collation,
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
            _logger.LogDebug("Validating collation {Schema}.{CollationName}", collation.Schema, collation.Name);

            // Check if collation exists and is accessible
            const string query = @"
                SELECT COUNT(*)
                FROM pg_collation c
                JOIN pg_namespace n ON c.collnamespace = n.oid
                WHERE n.nspname = @schema
                  AND c.collname = @collationName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schema", collation.Schema);
            command.Parameters.AddWithValue("@collationName", collation.Name);

            var countResult = await command.ExecuteScalarAsync(cancellationToken);
            var count = countResult != null ? (long)countResult : 0;

            if (count == 0)
            {
                result.IsValid = false;
                result.Errors.Add("Collation does not exist or is not accessible");
            }
            else
            {
                result.Metadata["CollationExists"] = true;

                // Get advanced collation information
                const string advancedQuery = @"
                    SELECT
                        c.collprovider as provider,
                        c.collisdeterministic as is_deterministic,
                        c.collencoding as encoding_id,
                        c.collcollate as collate_setting,
                        c.collctype as ctype_setting,
                        c.collversion as version,
                        c.collowner::regrole as collation_owner,
                        n.nspname as collation_schema,
                        c.oid as collation_oid
                    FROM pg_collation c
                    JOIN pg_namespace n ON c.collnamespace = n.oid
                    WHERE n.nspname = @schema AND c.collname = @collationName";

                using var advCommand = new NpgsqlCommand(advancedQuery, connection);
                advCommand.Parameters.AddWithValue("@schema", collation.Schema);
                advCommand.Parameters.AddWithValue("@collationName", collation.Name);

                using var advReader = await advCommand.ExecuteReaderAsync(cancellationToken);
                if (await advReader.ReadAsync(cancellationToken))
                {
                    result.Metadata["Provider"] = advReader.GetString(0);
                    result.Metadata["IsDeterministic"] = advReader.GetBoolean(1);
                    result.Metadata["EncodingId"] = advReader.GetInt32(2);
                    result.Metadata["CollateSetting"] = advReader.IsDBNull(3) ? string.Empty : advReader.GetString(3);
                    result.Metadata["CtypeSetting"] = advReader.IsDBNull(4) ? string.Empty : advReader.GetString(4);
                    result.Metadata["Version"] = advReader.IsDBNull(5) ? string.Empty : advReader.GetString(5);
                    result.Metadata["CollationOwner"] = advReader.GetString(6);
                    result.Metadata["CollationSchema"] = advReader.GetString(7);
                    result.Metadata["CollationOid"] = advReader.GetInt32(8);

                    // Add warnings for potential issues
                    if (!advReader.GetBoolean(1))
                        result.Warnings.Add("Collation is not deterministic - may cause inconsistent sorting");

                    var provider = advReader.GetString(0);
                    if (provider == "d") // Default provider
                        result.Warnings.Add("Collation uses default provider - may not be suitable for all use cases");
                }

                // Check for collation usage
                await ValidateCollationUsageAsync(connection, collation.Schema, collation.Name, result, cancellationToken);
            }

            result.Metadata["ValidationDate"] = DateTime.UtcNow;
            result.Metadata["ObjectType"] = collation.Type.ToString();

            _logger.LogDebug("Validation completed for collation {Schema}.{CollationName}: Valid={IsValid}",
                collation.Schema, collation.Name, result.IsValid);

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to validate collation {Schema}.{CollationName}", collation.Schema, collation.Name);

            result.IsValid = false;
            result.Errors.Add($"Validation error: {ex.Message}");
            return result;
        }
    }

    /// <summary>
    /// Extracts detailed collation information including usage statistics
    /// </summary>
    private async Task ExtractCollationDetailsAsync(
        NpgsqlConnection connection,
        DatabaseObjectDetails details,
        CancellationToken cancellationToken)
    {
        // Get collation usage in database objects
        const string usageQuery = @"
            SELECT
                'Column' as object_type,
                COUNT(*) as usage_count
            FROM pg_attribute a
            JOIN pg_class c ON a.attrelid = c.oid
            JOIN pg_namespace n ON c.relnamespace = n.oid
            WHERE a.attcollation = (SELECT oid FROM pg_collation WHERE collname = @collationName AND collnamespace = (SELECT oid FROM pg_namespace WHERE nspname = @schema))
              AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
            GROUP BY 'Column'
            UNION ALL
            SELECT
                'Index' as object_type,
                COUNT(*) as usage_count
            FROM pg_index i
            JOIN pg_class c ON i.indexrelid = c.oid
            JOIN pg_namespace n ON c.relnamespace = n.oid
            WHERE i.indcollation = (SELECT oid FROM pg_collation WHERE collname = @collationName AND collnamespace = (SELECT oid FROM pg_namespace WHERE nspname = @schema))
              AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
            GROUP BY 'Index'";

        using var usageCommand = new NpgsqlCommand(usageQuery, connection);
        usageCommand.Parameters.AddWithValue("@collationName", details.Name);
        usageCommand.Parameters.AddWithValue("@schema", details.Schema);

        using var usageReader = await usageCommand.ExecuteReaderAsync(cancellationToken);
        var totalUsage = 0;
        while (await usageReader.ReadAsync(cancellationToken))
        {
            var objectType = usageReader.GetString(0);
            var usageCount = usageReader.GetInt64(1);
            details.AdditionalInfo[$"UsageIn{objectType}s"] = usageCount;
            totalUsage += (int)usageCount;
        }

        details.AdditionalInfo["TotalUsage"] = totalUsage;

        // Get collation character classification examples
        const string charQuery = @"
            SELECT
                'Lowercase' as category,
                COUNT(*) as char_count
            FROM (SELECT unnest(string_to_array('abcdefghijklmnopqrstuvwxyz', ''))) as chars
            WHERE lower(chars) = chars
            UNION ALL
            SELECT
                'Uppercase' as category,
                COUNT(*) as char_count
            FROM (SELECT unnest(string_to_array('ABCDEFGHIJKLMNOPQRSTUVWXYZ', ''))) as chars
            WHERE upper(chars) = chars
            UNION ALL
            SELECT
                'Digits' as category,
                COUNT(*) as char_count
            FROM (SELECT unnest(string_to_array('0123456789', ''))) as chars
            WHERE chars ~ '^[0-9]$'";

        using var charCommand = new NpgsqlCommand(charQuery, connection);
        // Note: This is a simplified character classification - in a real implementation,
        // you might want to use more sophisticated collation testing

        using var charReader = await charCommand.ExecuteReaderAsync(cancellationToken);
        while (await charReader.ReadAsync(cancellationToken))
        {
            var category = charReader.GetString(0);
            var charCount = charReader.GetInt64(1);
            details.AdditionalInfo[$"CharacterCategory_{category}"] = charCount;
        }
    }

    /// <summary>
    /// Validates collation usage in database objects
    /// </summary>
    private async Task ValidateCollationUsageAsync(
        NpgsqlConnection connection,
        string schema,
        string collationName,
        ObjectValidationResult result,
        CancellationToken cancellationToken)
    {
        try
        {
            const string query = @"
                SELECT COUNT(*)
                FROM pg_attribute a
                JOIN pg_class c ON a.attrelid = c.oid
                JOIN pg_namespace n ON c.relnamespace = n.oid
                WHERE a.attcollation = (SELECT oid FROM pg_collation WHERE collname = @collationName AND collnamespace = (SELECT oid FROM pg_namespace WHERE nspname = @schema))
                  AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@collationName", collationName);
            command.Parameters.AddWithValue("@schema", schema);

            var usageCount = await command.ExecuteScalarAsync(cancellationToken);
            var count = usageCount != null ? (long)usageCount : 0;

            result.Metadata["UsageCount"] = count;

            if (count == 0)
            {
                result.Warnings.Add("Collation is not used by any database objects - may be unused");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error checking collation usage for {Schema}.{CollationName}", schema, collationName);
            result.Warnings.Add($"Could not verify collation usage: {ex.Message}");
        }
    }

    /// <summary>
    /// Builds a CREATE COLLATION statement for the collation
    /// </summary>
    private async Task<string> BuildCollationDefinitionAsync(
        NpgsqlConnection connection,
        string schema,
        string collationName,
        CancellationToken cancellationToken)
    {
        try
        {
            const string query = @"
                SELECT
                    c.collprovider as provider,
                    c.collencoding as encoding_id,
                    c.collcollate as collate_setting,
                    c.collctype as ctype_setting,
                    c.collversion as version,
                    c.collisdeterministic as is_deterministic
                FROM pg_collation c
                JOIN pg_namespace n ON c.collnamespace = n.oid
                WHERE n.nspname = @schema AND c.collname = @collationName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schema", schema);
            command.Parameters.AddWithValue("@collationName", collationName);

            using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                var provider = reader.GetString(0);
                var encodingId = reader.GetInt32(1);
                var collateSetting = reader.IsDBNull(2) ? string.Empty : reader.GetString(2);
                var ctypeSetting = reader.IsDBNull(3) ? string.Empty : reader.GetString(3);
                var version = reader.IsDBNull(4) ? string.Empty : reader.GetString(4);
                var isDeterministic = reader.GetBoolean(5);

                var createStatement = $"CREATE COLLATION \"{schema}\".\"{collationName}\" (";

                // Provider-specific settings
                switch (provider)
                {
                    case "i": // ICU provider
                        createStatement += $"provider = icu, locale = '{collateSetting}'";
                        break;
                    case "c": // libc provider
                        createStatement += $"provider = libc, locale = '{collateSetting}'";
                        break;
                    case "d": // Default provider
                        createStatement += $"provider = libc, locale = 'C'";
                        break;
                    default:
                        createStatement += $"provider = libc, locale = 'C'";
                        break;
                }

                if (isDeterministic)
                {
                    createStatement += ", deterministic = true";
                }

                createStatement += ");";

                return createStatement;
            }

            return $"CREATE COLLATION \"{schema}\".\"{collationName}\" (provider = libc, locale = 'C');";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error building collation definition for {Schema}.{CollationName}", schema, collationName);
            return $"CREATE COLLATION \"{schema}\".\"{collationName}\" (provider = libc, locale = 'C');";
        }
    }
}