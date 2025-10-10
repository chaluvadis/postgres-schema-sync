namespace PostgreSqlSchemaCompareSync.Core.Comparison.Metadata;

/// <summary>
/// Specialized extractor for PostgreSQL role metadata
/// </summary>
public class RoleMetadataExtractor(
    ILogger<RoleMetadataExtractor> logger) : IMetadataExtractor, IObjectMetadataExtractor, IObjectValidator
{
    private readonly ILogger<RoleMetadataExtractor> _logger = logger ?? throw new ArgumentNullException(nameof(logger));

    public ObjectType ObjectType => ObjectType.Role;

    /// <summary>
    /// Extracts role metadata from the database
    /// </summary>
    public async Task<IEnumerable<DatabaseObject>> ExtractAsync(
        NpgsqlConnection connection,
        string? schemaFilter,
        CancellationToken cancellationToken)
    {
        var roles = new List<DatabaseObject>();

        const string query = @"
            SELECT
                r.rolname as role_name,
                r.rolsuper as is_superuser,
                r.rolinherit as inherits_privileges,
                r.rolcreaterole as can_create_roles,
                r.rolcreatedb as can_create_databases,
                r.rolcanlogin as can_login,
                r.rolreplication as is_replication_role,
                r.rolbypassrls as bypasses_rls,
                r.rolconnlimit as connection_limit,
                r.rolpassword as has_password,
                r.rolvaliduntil as password_valid_until,
                r.rolconfig as role_config,
                array_agg(rm.rolname) FILTER (WHERE rm.rolname IS NOT NULL) as member_roles,
                array_agg(g.rolname) FILTER (WHERE g.rolname IS NOT NULL) as granted_roles,
                obj_description(r.oid, 'pg_authid') as description,
                r.rolcreated as creation_date
            FROM pg_roles r
            LEFT JOIN pg_auth_members am ON r.oid = am.member
            LEFT JOIN pg_roles rm ON am.roleid = rm.oid
            LEFT JOIN pg_auth_members ag ON r.oid = ag.roleid
            LEFT JOIN pg_roles g ON ag.member = g.oid
            WHERE r.rolname NOT LIKE 'pg_%'
              AND (@schemaFilter IS NULL OR r.rolname = @schemaFilter)
            GROUP BY r.oid, r.rolname, r.rolsuper, r.rolinherit, r.rolcreaterole,
                     r.rolcreatedb, r.rolcanlogin, r.rolreplication, r.rolbypassrls,
                     r.rolconnlimit, r.rolpassword, r.rolvaliduntil, r.rolconfig,
                     r.rolcreated
            ORDER BY r.rolname";

        using var command = new NpgsqlCommand(query, connection);
        command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

        using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var roleName = reader.GetString(0);

            roles.Add(new DatabaseObject
            {
                Name = roleName,
                Schema = "pg_catalog", // Roles are in pg_catalog schema
                Type = ObjectType.Role,
                Database = connection.Database,
                Definition = await BuildRoleDefinitionAsync(connection, roleName, cancellationToken),
                CreatedAt = reader.IsDBNull(15) ? DateTime.UtcNow : reader.GetDateTime(15),
                Properties =
                {
                    ["IsSuperuser"] = reader.GetBoolean(1),
                    ["InheritsPrivileges"] = reader.GetBoolean(2),
                    ["CanCreateRoles"] = reader.GetBoolean(3),
                    ["CanCreateDatabases"] = reader.GetBoolean(4),
                    ["CanLogin"] = reader.GetBoolean(5),
                    ["IsReplicationRole"] = reader.GetBoolean(6),
                    ["BypassesRLS"] = reader.GetBoolean(7),
                    ["ConnectionLimit"] = reader.GetInt32(8),
                    ["HasPassword"] = !reader.IsDBNull(9),
                    ["PasswordValidUntil"] = reader.IsDBNull(10) ? (DateTime?)null : reader.GetDateTime(10),
                    ["RoleConfig"] = reader.IsDBNull(11) ? string.Empty : reader.GetString(11),
                    ["MemberRoles"] = reader.IsDBNull(12) ? string.Empty : string.Join(", ", (string[])reader.GetValue(12)),
                    ["GrantedRoles"] = reader.IsDBNull(13) ? string.Empty : string.Join(", ", (string[])reader.GetValue(13)),
                    ["Description"] = reader.IsDBNull(14) ? string.Empty : reader.GetString(14)
                }
            });
        }

        return roles;
    }

    /// <summary>
    /// Extracts detailed role information
    /// </summary>
    public async Task<DatabaseObjectDetails> ExtractDetailsAsync(
        NpgsqlConnection connection,
        string schema,
        string roleName,
        CancellationToken cancellationToken)
    {
        var details = new DatabaseObjectDetails
        {
            Name = roleName,
            Schema = schema,
            Type = ObjectType.Role,
            Database = connection.Database,
            CreatedAt = DateTime.UtcNow
        };

        await ExtractRoleDetailsAsync(connection, details, cancellationToken);
        return details;
    }

    /// <summary>
    /// Validates role objects
    /// </summary>
    public async Task<ObjectValidationResult> ValidateAsync(
        NpgsqlConnection connection,
        DatabaseObject role,
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
            _logger.LogDebug("Validating role {RoleName}", role.Name);

            // Check if role exists and is accessible
            const string query = @"
                SELECT COUNT(*)
                FROM pg_roles r
                WHERE r.rolname = @roleName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@roleName", role.Name);

            var countResult = await command.ExecuteScalarAsync(cancellationToken);
            var count = countResult != null ? (long)countResult : 0;

            if (count == 0)
            {
                result.IsValid = false;
                result.Errors.Add("Role does not exist or is not accessible");
            }
            else
            {
                result.Metadata["RoleExists"] = true;

                // Get advanced role information
                const string advancedQuery = @"
                    SELECT
                        r.rolsuper as is_superuser,
                        r.rolcanlogin as can_login,
                        r.rolconnlimit as connection_limit,
                        r.rolvaliduntil as password_valid_until,
                        r.rolconfig as role_config,
                        r.rolpassword IS NOT NULL as has_password,
                        array_agg(DISTINCT rm.rolname) FILTER (WHERE rm.rolname IS NOT NULL) as member_roles,
                        array_agg(DISTINCT g.rolname) FILTER (WHERE g.rolname IS NOT NULL) as granted_roles,
                        COUNT(DISTINCT rm.rolname) as member_count,
                        COUNT(DISTINCT g.rolname) as granted_count
                    FROM pg_roles r
                    LEFT JOIN pg_auth_members am ON r.oid = am.member
                    LEFT JOIN pg_roles rm ON am.roleid = rm.oid
                    LEFT JOIN pg_auth_members ag ON r.oid = ag.roleid
                    LEFT JOIN pg_roles g ON ag.member = g.oid
                    WHERE r.rolname = @roleName
                    GROUP BY r.oid, r.rolsuper, r.rolcanlogin, r.rolconnlimit,
                             r.rolvaliduntil, r.rolconfig, r.rolpassword";

                using var advCommand = new NpgsqlCommand(advancedQuery, connection);
                advCommand.Parameters.AddWithValue("@roleName", role.Name);

                using var advReader = await advCommand.ExecuteReaderAsync(cancellationToken);
                if (await advReader.ReadAsync(cancellationToken))
                {
                    result.Metadata["IsSuperuser"] = advReader.GetBoolean(0);
                    result.Metadata["CanLogin"] = advReader.GetBoolean(1);
                    result.Metadata["ConnectionLimit"] = advReader.GetInt32(2);
                    result.Metadata["PasswordValidUntil"] = advReader.IsDBNull(3) ? (DateTime?)null : advReader.GetDateTime(3);
                    result.Metadata["RoleConfig"] = advReader.IsDBNull(4) ? string.Empty : advReader.GetString(4);
                    result.Metadata["HasPassword"] = advReader.GetBoolean(5);

                    if (!advReader.IsDBNull(6))
                    {
                        result.Metadata["MemberRoles"] = string.Join(", ", (string[])advReader.GetValue(6));
                    }
                    if (!advReader.IsDBNull(7))
                    {
                        result.Metadata["GrantedRoles"] = string.Join(", ", (string[])advReader.GetValue(7));
                    }

                    result.Metadata["MemberCount"] = advReader.GetInt64(8);
                    result.Metadata["GrantedCount"] = advReader.GetInt64(9);

                    // Add warnings for potential issues
                    if (advReader.GetBoolean(0))
                        result.Warnings.Add("Role is a superuser - has unrestricted access");

                    if (!advReader.GetBoolean(1))
                        result.Warnings.Add("Role cannot login - may be a group role only");

                    if (advReader.GetInt32(2) > 0)
                        result.Warnings.Add($"Role has connection limit ({advReader.GetInt32(2)}) - may cause connection issues");

                    if (advReader.IsDBNull(3) == false && advReader.GetDateTime(3) < DateTime.UtcNow)
                        result.Warnings.Add("Role password has expired");

                    if (!advReader.GetBoolean(5))
                        result.Warnings.Add("Role has no password - may be a security risk");
                }

                // Validate role permissions
                await ValidateRolePermissionsAsync(connection, role.Name, result, cancellationToken);
            }

            result.Metadata["ValidationDate"] = DateTime.UtcNow;
            result.Metadata["ObjectType"] = role.Type.ToString();

            _logger.LogDebug("Validation completed for role {RoleName}: Valid={IsValid}",
                role.Name, result.IsValid);

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to validate role {RoleName}", role.Name);

            result.IsValid = false;
            result.Errors.Add($"Validation error: {ex.Message}");
            return result;
        }
    }

    /// <summary>
    /// Extracts detailed role information including permissions and memberships
    /// </summary>
    private async Task ExtractRoleDetailsAsync(
        NpgsqlConnection connection,
        DatabaseObjectDetails details,
        CancellationToken cancellationToken)
    {
        // Get role permissions on database objects
        const string permissionQuery = @"
            SELECT
                'Table' as object_type,
                COUNT(*) as permission_count
            FROM information_schema.role_table_grants g
            WHERE g.grantee = @roleName
            GROUP BY 'Table'
            UNION ALL
            SELECT
                'Column' as object_type,
                COUNT(*) as permission_count
            FROM information_schema.role_column_grants g
            WHERE g.grantee = @roleName
            GROUP BY 'Column'
            UNION ALL
            SELECT
                'Schema' as object_type,
                COUNT(*) as permission_count
            FROM information_schema.role_schema_grants g
            WHERE g.grantee = @roleName
            GROUP BY 'Schema'";

        using var permCommand = new NpgsqlCommand(permissionQuery, connection);
        permCommand.Parameters.AddWithValue("@roleName", details.Name);

        using var permReader = await permCommand.ExecuteReaderAsync(cancellationToken);
        while (await permReader.ReadAsync(cancellationToken))
        {
            var objectType = permReader.GetString(0);
            var permissionCount = permReader.GetInt64(1);
            details.AdditionalInfo[$"PermissionsOn{objectType}s"] = permissionCount;
        }

        // Get role system privileges
        const string sysPrivQuery = @"
            SELECT
                'Superuser' as privilege_type,
                r.rolsuper as has_privilege
            FROM pg_roles r
            WHERE r.rolname = @roleName
            UNION ALL
            SELECT
                'Create Database' as privilege_type,
                r.rolcreatedb as has_privilege
            FROM pg_roles r
            WHERE r.rolname = @roleName
            UNION ALL
            SELECT
                'Create Role' as privilege_type,
                r.rolcreaterole as has_privilege
            FROM pg_roles r
            WHERE r.rolname = @roleName
            UNION ALL
            SELECT
                'Replication' as privilege_type,
                r.rolreplication as has_privilege
            FROM pg_roles r
            WHERE r.rolname = @roleName
            UNION ALL
            SELECT
                'Bypass RLS' as privilege_type,
                r.rolbypassrls as has_privilege
            FROM pg_roles r
            WHERE r.rolname = @roleName";

        using var sysPrivCommand = new NpgsqlCommand(sysPrivQuery, connection);
        sysPrivCommand.Parameters.AddWithValue("@roleName", details.Name);

        using var sysPrivReader = await sysPrivCommand.ExecuteReaderAsync(cancellationToken);
        while (await sysPrivReader.ReadAsync(cancellationToken))
        {
            var privilegeType = sysPrivReader.GetString(0);
            var hasPrivilege = sysPrivReader.GetBoolean(1);
            details.AdditionalInfo[$"SystemPrivilege_{privilegeType}"] = hasPrivilege;
        }
    }

    /// <summary>
    /// Validates role permissions and security settings
    /// </summary>
    private async Task ValidateRolePermissionsAsync(
        NpgsqlConnection connection,
        string roleName,
        ObjectValidationResult result,
        CancellationToken cancellationToken)
    {
        try
        {
            // Check for excessive permissions
            const string query = @"
                SELECT
                    COUNT(*) as total_permissions,
                    COUNT(*) FILTER (WHERE g.privilege_type = 'SELECT') as select_permissions,
                    COUNT(*) FILTER (WHERE g.privilege_type IN ('INSERT', 'UPDATE', 'DELETE')) as write_permissions,
                    COUNT(*) FILTER (WHERE g.is_grantable = true) as grantable_permissions
                FROM information_schema.role_table_grants g
                WHERE g.grantee = @roleName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@roleName", roleName);

            using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                var totalPermissions = reader.GetInt64(0);
                var selectPermissions = reader.GetInt64(1);
                var writePermissions = reader.GetInt64(2);
                var grantablePermissions = reader.GetInt64(3);

                result.Metadata["TotalPermissions"] = totalPermissions;
                result.Metadata["SelectPermissions"] = selectPermissions;
                result.Metadata["WritePermissions"] = writePermissions;
                result.Metadata["GrantablePermissions"] = grantablePermissions;

                // Add warnings for potential security issues
                if (totalPermissions > 100)
                    result.Warnings.Add($"Role has many permissions ({totalPermissions}) - may be overly privileged");

                if (grantablePermissions > 0)
                    result.Warnings.Add($"Role can grant permissions to others ({grantablePermissions}) - increases security risk");

                if (writePermissions > selectPermissions * 2)
                    result.Warnings.Add("Role has significantly more write permissions than read permissions - may indicate excessive access");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error checking role permissions for {RoleName}", roleName);
            result.Warnings.Add($"Could not verify role permissions: {ex.Message}");
        }
    }

    /// <summary>
    /// Builds a CREATE ROLE statement for the role
    /// </summary>
    private async Task<string> BuildRoleDefinitionAsync(
        NpgsqlConnection connection,
        string roleName,
        CancellationToken cancellationToken)
    {
        try
        {
            const string query = @"
                SELECT
                    r.rolsuper as is_superuser,
                    r.rolinherit as inherits_privileges,
                    r.rolcreaterole as can_create_roles,
                    r.rolcreatedb as can_create_databases,
                    r.rolcanlogin as can_login,
                    r.rolreplication as is_replication_role,
                    r.rolbypassrls as bypasses_rls,
                    r.rolconnlimit as connection_limit,
                    r.rolvaliduntil as password_valid_until,
                    r.rolconfig as role_config
                FROM pg_roles r
                WHERE r.rolname = @roleName";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@roleName", roleName);

            using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                var isSuperuser = reader.GetBoolean(0);
                var inheritsPrivileges = reader.GetBoolean(1);
                var canCreateRoles = reader.GetBoolean(2);
                var canCreateDatabases = reader.GetBoolean(3);
                var canLogin = reader.GetBoolean(4);
                var isReplicationRole = reader.GetBoolean(5);
                var bypassesRls = reader.GetBoolean(6);
                var connectionLimit = reader.GetInt32(7);
                var passwordValidUntil = reader.IsDBNull(8) ? (DateTime?)null : reader.GetDateTime(8);
                var roleConfig = reader.IsDBNull(9) ? string.Empty : reader.GetString(9);

                var createStatement = $"CREATE ROLE \"{roleName}\"";

                if (isSuperuser)
                    createStatement += " SUPERUSER";
                else
                    createStatement += " NOSUPERUSER";

                if (canCreateDatabases)
                    createStatement += " CREATEDB";
                else
                    createStatement += " NOCREATEDB";

                if (canCreateRoles)
                    createStatement += " CREATEROLE";
                else
                    createStatement += " NOCREATEROLE";

                if (inheritsPrivileges)
                    createStatement += " INHERIT";
                else
                    createStatement += " NOINHERIT";

                if (canLogin)
                    createStatement += " LOGIN";
                else
                    createStatement += " NOLOGIN";

                if (isReplicationRole)
                    createStatement += " REPLICATION";
                else
                    createStatement += " NOREPLICATION";

                if (bypassesRls)
                    createStatement += " BYPASSRLS";
                else
                    createStatement += " NOBYPASSRLS";

                if (connectionLimit > 0)
                    createStatement += $" CONNECTION LIMIT {connectionLimit}";
                else
                    createStatement += " CONNECTION LIMIT -1";

                if (passwordValidUntil.HasValue)
                    createStatement += $" VALID UNTIL '{passwordValidUntil.Value:yyyy-MM-dd HH:mm:ss}'";

                if (!string.IsNullOrEmpty(roleConfig))
                    createStatement += $" CONFIG '{roleConfig}'";

                createStatement += ";";

                return createStatement;
            }

            return $"CREATE ROLE \"{roleName}\";";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error building role definition for {RoleName}", roleName);
            return $"CREATE ROLE \"{roleName}\";";
        }
    }
}