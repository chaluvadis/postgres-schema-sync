using PostgreSqlSchemaCompareSync.Infrastructure.Exceptions;

namespace PostgreSqlSchemaCompareSync.Core.Comparison.Schema
{
    /// <summary>
    /// Implementation of schema browsing functionality
    /// </summary>
    public class SchemaBrowser : ISchemaBrowser
    {
        private readonly ILogger<SchemaBrowser> _logger;
        private readonly AppSettings _settings;
        private readonly IConnectionManager _connectionManager;
        private bool _disposed;

        public SchemaBrowser(
            ILogger<SchemaBrowser> logger,
            IOptions<AppSettings> settings,
            IConnectionManager connectionManager)
        {
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
            _settings = settings?.Value ?? throw new ArgumentNullException(nameof(settings));
            _connectionManager = connectionManager ?? throw new ArgumentNullException(nameof(connectionManager));
        }

        /// <summary>
        /// Gets all database objects for a connection
        /// </summary>
        public async Task<List<DatabaseObject>> GetDatabaseObjectsAsync(
            ConnectionInfo connectionInfo,
            string? schemaFilter = null,
            CancellationToken cancellationToken = default)
        {
            if (connectionInfo == null)
                throw new ArgumentNullException(nameof(connectionInfo));

            var objects = new List<DatabaseObject>();

            try
            {
                _logger.LogDebug("Browsing schema for {Database}", connectionInfo.Database);

                using var connection = await _connectionManager.CreateConnectionAsync(connectionInfo, cancellationToken);

                // Get all schema objects
                var tables = await GetTablesAsync(connection, schemaFilter, cancellationToken);
                var views = await GetViewsAsync(connection, schemaFilter, cancellationToken);
                var functions = await GetFunctionsAsync(connection, schemaFilter, cancellationToken);
                var procedures = await GetProceduresAsync(connection, schemaFilter, cancellationToken);
                var sequences = await GetSequencesAsync(connection, schemaFilter, cancellationToken);
                var types = await GetTypesAsync(connection, schemaFilter, cancellationToken);
                var indexes = await GetIndexesAsync(connection, schemaFilter, cancellationToken);
                var triggers = await GetTriggersAsync(connection, schemaFilter, cancellationToken);
                var constraints = await GetConstraintsAsync(connection, schemaFilter, cancellationToken);

                objects.AddRange(tables);
                objects.AddRange(views);
                objects.AddRange(functions);
                objects.AddRange(procedures);
                objects.AddRange(sequences);
                objects.AddRange(types);
                objects.AddRange(indexes);
                objects.AddRange(triggers);
                objects.AddRange(constraints);

                _logger.LogInformation("Retrieved {ObjectCount} objects from {Database}", objects.Count, connectionInfo.Database);
                return objects;
            }
            catch (NpgsqlException ex)
            {
                _logger.LogError(ex, "Database error browsing schema for {Database}", connectionInfo.Database);
                throw new SchemaException($"Failed to browse schema: {ex.Message}", connectionInfo.Id, ex);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error browsing schema for {Database}", connectionInfo.Database);
                throw new SchemaException($"Unexpected error browsing schema: {ex.Message}", connectionInfo.Id, ex);
            }
        }

        /// <summary>
        /// Gets detailed information about a specific database object
        /// </summary>
        public async Task<DatabaseObjectDetails> GetObjectDetailsAsync(
            ConnectionInfo connectionInfo,
            ObjectType objectType,
            string schema,
            string objectName,
            CancellationToken cancellationToken = default)
        {
            if (connectionInfo == null)
                throw new ArgumentNullException(nameof(connectionInfo));

            try
            {
                _logger.LogDebug("Getting details for {ObjectType} {ObjectName}", objectType, objectName);

                using var connection = await _connectionManager.CreateConnectionAsync(connectionInfo, cancellationToken);

                var details = new DatabaseObjectDetails
                {
                    Name = objectName,
                    Type = objectType,
                    Schema = schema,
                    Database = connectionInfo.Database
                };

                // Get object-specific details
                switch (objectType)
                {
                    case ObjectType.Table:
                        await PopulateTableDetailsAsync(connection, details, cancellationToken);
                        break;
                    case ObjectType.View:
                        await PopulateViewDetailsAsync(connection, details, cancellationToken);
                        break;
                    case ObjectType.Function:
                        await PopulateFunctionDetailsAsync(connection, details, cancellationToken);
                        break;
                    case ObjectType.Index:
                        await PopulateIndexDetailsAsync(connection, details, cancellationToken);
                        break;
                    default:
                        await PopulateBasicDetailsAsync(connection, details, cancellationToken);
                        break;
                }

                _logger.LogDebug("Retrieved details for {ObjectType} {ObjectName}", objectType, objectName);
                return details;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to get details for {ObjectType} {ObjectName}", objectType, objectName);
                throw new SchemaException($"Failed to get object details: {ex.Message}", connectionInfo.Id, ex);
            }
        }

        /// <summary>
        /// Searches for database objects by name or pattern
        /// </summary>
        public async Task<List<DatabaseObject>> SearchObjectsAsync(
            ConnectionInfo connectionInfo,
            string searchTerm,
            List<ObjectType>? objectTypes = null,
            CancellationToken cancellationToken = default)
        {
            if (connectionInfo == null)
                throw new ArgumentNullException(nameof(connectionInfo));

            if (string.IsNullOrEmpty(searchTerm))
                return [];

            try
            {
                _logger.LogDebug("Searching for objects matching '{SearchTerm}' in {Database}", searchTerm, connectionInfo.Database);

                var allObjects = await GetDatabaseObjectsAsync(connectionInfo, null, cancellationToken);

                var matchingObjects = allObjects.Where(obj =>
                    (objectTypes == null || objectTypes.Contains(obj.Type)) &&
                    (obj.Name.Contains(searchTerm, StringComparison.OrdinalIgnoreCase) ||
                     obj.Schema.Contains(searchTerm, StringComparison.OrdinalIgnoreCase) ||
                     (obj.Definition?.Contains(searchTerm, StringComparison.OrdinalIgnoreCase) ?? false)))
                    .ToList();

                _logger.LogInformation("Found {MatchCount} objects matching '{SearchTerm}' in {Database}",
                    matchingObjects.Count, searchTerm, connectionInfo.Database);

                return matchingObjects;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to search objects in {Database}", connectionInfo.Database);
                throw new SchemaException($"Failed to search objects: {ex.Message}", connectionInfo.Id, ex);
            }
        }

        /// <summary>
        /// Gets dependencies for a database object
        /// </summary>
        public async Task<List<string>> GetObjectDependenciesAsync(
            ConnectionInfo connectionInfo,
            ObjectType objectType,
            string schema,
            string objectName,
            CancellationToken cancellationToken = default)
        {
            if (connectionInfo == null)
                throw new ArgumentNullException(nameof(connectionInfo));

            try
            {
                _logger.LogDebug("Getting dependencies for {ObjectType} {ObjectName}", objectType, objectName);

                using var connection = await _connectionManager.CreateConnectionAsync(connectionInfo, cancellationToken);

                var dependencies = new List<string>();

                // Use PostgreSQL system catalogs to find dependencies
                var query = @"
                    SELECT DISTINCT
                        dependent.relname as dependent_object,
                        dependent.relkind as dependent_type,
                        dependent.nspname as dependent_schema
                    FROM pg_depend d
                    JOIN pg_class obj ON d.objid = obj.oid
                    JOIN pg_namespace obj_ns ON obj.relnamespace = obj_ns.oid
                    JOIN pg_class dependent ON d.refobjid = dependent.oid
                    JOIN pg_namespace dependent_ns ON dependent.relnamespace = dependent_ns.oid
                    WHERE obj_ns.nspname = @schema
                      AND obj.relname = @objectName
                      AND obj.relkind IN ('r', 'v', 'f', 'p')
                    UNION ALL
                    SELECT DISTINCT
                        obj.relname as dependent_object,
                        obj.relkind as dependent_type,
                        obj.nspname as dependent_schema
                    FROM pg_depend d
                    JOIN pg_class dependent ON d.objid = dependent.oid
                    JOIN pg_namespace dependent_ns ON dependent.relnamespace = dependent_ns.oid
                    JOIN pg_class obj ON d.refobjid = obj.oid
                    JOIN pg_namespace obj_ns ON obj.relnamespace = obj_ns.oid
                    WHERE dependent_ns.nspname = @schema
                      AND dependent.relname = @objectName
                      AND dependent.relkind IN ('r', 'v', 'f', 'p')
                ";

                using var command = new NpgsqlCommand(query, connection);
                command.Parameters.AddWithValue("@schema", schema);
                command.Parameters.AddWithValue("@objectName", objectName);

                using var reader = await command.ExecuteReaderAsync(cancellationToken);
                while (await reader.ReadAsync(cancellationToken))
                {
                    var dependentObject = reader.GetString(0);
                    var dependentType = reader.GetChar(1);
                    var dependentSchema = reader.GetString(2);

                    var typeChar = char.ToLower(dependentType);
                    var dependentObjectType = typeChar switch
                    {
                        'r' => "table",
                        'v' => "view",
                        'f' => "function",
                        'p' => "procedure",
                        _ => "unknown"
                    };

                    dependencies.Add($"{objectType}:{dependentSchema}.{dependentObject}");
                }

                _logger.LogDebug("Found {DependencyCount} dependencies for {ObjectType} {ObjectName}",
                    dependencies.Count, objectType, objectName);

                return dependencies;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to get dependencies for {ObjectType} {ObjectName}", objectType, objectName);
                throw new SchemaException($"Failed to get object dependencies: {ex.Message}", connectionInfo.Id, ex);
            }
        }

        /// <summary>
        /// Helper method to get tables
        /// </summary>
        private async Task<List<DatabaseObject>> GetTablesAsync(NpgsqlConnection connection, string? schemaFilter, CancellationToken cancellationToken)
        {
            var tables = new List<DatabaseObject>();

            var query = @"
                SELECT
                    t.table_name,
                    t.table_schema,
                    t.table_type,
                    pg_total_relation_size(format('%I.%I', t.table_schema, t.table_name)) as size_bytes,
                    obj_description(format('%I.%I', t.table_schema, t.table_name)::regclass) as description
                FROM information_schema.tables t
                WHERE t.table_type = 'BASE TABLE'
                  AND (@schemaFilter IS NULL OR t.table_schema = @schemaFilter)
                  AND t.table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                ORDER BY t.table_schema, t.table_name";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

            using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                tables.Add(new DatabaseObject
                {
                    Name = reader.GetString(0),
                    Schema = reader.GetString(1),
                    Type = ObjectType.Table,
                    Database = connection.Database,
                    SizeInBytes = reader.IsDBNull(3) ? null : (long?)reader.GetInt64(3),
                    Definition = reader.IsDBNull(4) ? null : reader.GetString(4),
                    CreatedAt = DateTime.UtcNow // Would need to query pg_stat_user_tables for actual creation time
                });
            }

            return tables;
        }

        /// <summary>
        /// Helper method to get views
        /// </summary>
        private async Task<List<DatabaseObject>> GetViewsAsync(NpgsqlConnection connection, string? schemaFilter, CancellationToken cancellationToken)
        {
            var views = new List<DatabaseObject>();

            var query = @"
                SELECT
                    v.table_name,
                    v.table_schema,
                    v.view_definition,
                    obj_description(format('%I.%I', v.table_schema, v.table_name)::regclass) as description
                FROM information_schema.views v
                WHERE (@schemaFilter IS NULL OR v.table_schema = @schemaFilter)
                  AND v.table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                ORDER BY v.table_schema, v.table_name";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

            using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                views.Add(new DatabaseObject
                {
                    Name = reader.GetString(0),
                    Schema = reader.GetString(1),
                    Type = ObjectType.View,
                    Database = connection.Database,
                    Definition = reader.IsDBNull(2) ? null : reader.GetString(2),
                    CreatedAt = DateTime.UtcNow
                });
            }

            return views;
        }

        /// <summary>
        /// Helper method to get functions
        /// </summary>
        private async Task<List<DatabaseObject>> GetFunctionsAsync(NpgsqlConnection connection, string? schemaFilter, CancellationToken cancellationToken)
        {
            var functions = new List<DatabaseObject>();

            var query = @"
                SELECT
                    p.proname as function_name,
                    p.pronamespace::regnamespace as function_schema,
                    pg_get_function_identity_arguments(p.oid) as arguments,
                    pg_get_functiondef(p.oid) as function_definition,
                    obj_description(p.oid) as description
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
                    Definition = reader.IsDBNull(3) ? null : reader.GetString(3),
                    CreatedAt = DateTime.UtcNow
                });
            }

            return functions;
        }

        /// <summary>
        /// Helper method to get procedures
        /// </summary>
        private async Task<List<DatabaseObject>> GetProceduresAsync(NpgsqlConnection connection, string? schemaFilter, CancellationToken cancellationToken)
        {
            // In PostgreSQL, procedures are similar to functions
            return await GetFunctionsAsync(connection, schemaFilter, cancellationToken);
        }

        /// <summary>
        /// Helper method to get sequences
        /// </summary>
        private async Task<List<DatabaseObject>> GetSequencesAsync(NpgsqlConnection connection, string? schemaFilter, CancellationToken cancellationToken)
        {
            var sequences = new List<DatabaseObject>();

            var query = @"
                SELECT
                    c.relname as sequence_name,
                    n.nspname as sequence_schema,
                    obj_description(format('%I.%I', n.nspname, c.relname)::regclass) as description
                FROM pg_class c
                JOIN pg_namespace n ON c.relnamespace = n.oid
                WHERE c.relkind = 'S'
                  AND (@schemaFilter IS NULL OR n.nspname = @schemaFilter)
                  AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                ORDER BY n.nspname, c.relname";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

            using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                sequences.Add(new DatabaseObject
                {
                    Name = reader.GetString(0),
                    Schema = reader.GetString(1),
                    Type = ObjectType.Sequence,
                    Database = connection.Database,
                    Definition = reader.IsDBNull(2) ? null : reader.GetString(2),
                    CreatedAt = DateTime.UtcNow
                });
            }

            return sequences;
        }

        /// <summary>
        /// Helper method to get custom types
        /// </summary>
        private async Task<List<DatabaseObject>> GetTypesAsync(NpgsqlConnection connection, string? schemaFilter, CancellationToken cancellationToken)
        {
            var types = new List<DatabaseObject>();

            var query = @"
                SELECT
                    t.typname as type_name,
                    n.nspname as type_schema,
                    obj_description(t.oid) as description
                FROM pg_type t
                JOIN pg_namespace n ON t.typnamespace = n.oid
                WHERE (@schemaFilter IS NULL OR n.nspname = @schemaFilter)
                  AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                  AND t.typtype IN ('c', 'd', 'e') -- composite, domain, enum
                ORDER BY n.nspname, t.typname";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

            using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                types.Add(new DatabaseObject
                {
                    Name = reader.GetString(0),
                    Schema = reader.GetString(1),
                    Type = ObjectType.Type,
                    Database = connection.Database,
                    Definition = reader.IsDBNull(2) ? null : reader.GetString(2),
                    CreatedAt = DateTime.UtcNow
                });
            }

            return types;
        }

        /// <summary>
        /// Helper method to get indexes
        /// </summary>
        private async Task<List<DatabaseObject>> GetIndexesAsync(NpgsqlConnection connection, string? schemaFilter, CancellationToken cancellationToken)
        {
            var indexes = new List<DatabaseObject>();

            var query = @"
                SELECT
                    c.relname as index_name,
                    t.relname as table_name,
                    n.nspname as index_schema,
                    obj_description(format('%I.%I', n.nspname, c.relname)::regclass) as description
                FROM pg_class c
                JOIN pg_index i ON c.oid = i.indexrelid
                JOIN pg_class t ON i.indrelid = t.oid
                JOIN pg_namespace n ON c.relnamespace = n.oid
                JOIN pg_namespace tn ON t.relnamespace = tn.oid
                WHERE c.relkind = 'i'
                  AND (@schemaFilter IS NULL OR tn.nspname = @schemaFilter)
                  AND tn.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                ORDER BY tn.nspname, t.relname, c.relname";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

            using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                indexes.Add(new DatabaseObject
                {
                    Name = reader.GetString(0),
                    Schema = reader.GetString(2),
                    Type = ObjectType.Index,
                    Database = connection.Database,
                    Definition = reader.IsDBNull(3) ? null : reader.GetString(3),
                    CreatedAt = DateTime.UtcNow
                });
            }

            return indexes;
        }

        /// <summary>
        /// Helper method to get triggers
        /// </summary>
        private async Task<List<DatabaseObject>> GetTriggersAsync(NpgsqlConnection connection, string? schemaFilter, CancellationToken cancellationToken)
        {
            var triggers = new List<DatabaseObject>();

            var query = @"
                SELECT
                    t.tgname as trigger_name,
                    c.relname as table_name,
                    n.nspname as trigger_schema,
                    obj_description(t.oid) as description
                FROM pg_trigger t
                JOIN pg_class c ON t.tgrelid = c.oid
                JOIN pg_namespace n ON c.relnamespace = n.oid
                WHERE NOT t.tgisinternal
                  AND (@schemaFilter IS NULL OR n.nspname = @schemaFilter)
                  AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                ORDER BY n.nspname, c.relname, t.tgname";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

            using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                triggers.Add(new DatabaseObject
                {
                    Name = reader.GetString(0),
                    Schema = reader.GetString(2),
                    Type = ObjectType.Trigger,
                    Database = connection.Database,
                    Definition = reader.IsDBNull(3) ? null : reader.GetString(3),
                    CreatedAt = DateTime.UtcNow
                });
            }

            return triggers;
        }

        /// <summary>
        /// Helper method to get constraints
        /// </summary>
        private async Task<List<DatabaseObject>> GetConstraintsAsync(NpgsqlConnection connection, string? schemaFilter, CancellationToken cancellationToken)
        {
            var constraints = new List<DatabaseObject>();

            var query = @"
                SELECT
                    c.conname as constraint_name,
                    t.relname as table_name,
                    n.nspname as constraint_schema,
                    c.contype as constraint_type,
                    obj_description(format('%I.%I', n.nspname, c.conname)::regclass) as description
                FROM pg_constraint c
                JOIN pg_class t ON c.conrelid = t.oid
                JOIN pg_namespace n ON t.relnamespace = n.oid
                WHERE (@schemaFilter IS NULL OR n.nspname = @schemaFilter)
                  AND n.nspname NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
                ORDER BY n.nspname, t.relname, c.conname";

            using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("@schemaFilter", schemaFilter ?? (object)DBNull.Value);

            using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                constraints.Add(new DatabaseObject
                {
                    Name = reader.GetString(0),
                    Schema = reader.GetString(2),
                    Type = ObjectType.Constraint,
                    Database = connection.Database,
                    Definition = reader.IsDBNull(4) ? null : reader.GetString(4),
                    CreatedAt = DateTime.UtcNow
                });
            }

            return constraints;
        }

        /// <summary>
        /// Helper method to populate table details
        /// </summary>
        private async Task PopulateTableDetailsAsync(NpgsqlConnection connection, DatabaseObjectDetails details, CancellationToken cancellationToken)
        {
            // Get columns
            var columnQuery = @"
                SELECT
                    column_name,
                    data_type,
                    is_nullable,
                    column_default,
                    character_maximum_length,
                    numeric_precision,
                    numeric_scale
                FROM information_schema.columns
                WHERE table_schema = @schema AND table_name = @tableName
                ORDER BY ordinal_position";

            using var columnCommand = new NpgsqlCommand(columnQuery, connection);
            columnCommand.Parameters.AddWithValue("@schema", details.Schema);
            columnCommand.Parameters.AddWithValue("@tableName", details.Name);

            using var columnReader = await columnCommand.ExecuteReaderAsync(cancellationToken);
            while (await columnReader.ReadAsync(cancellationToken))
            {
                details.Columns.Add(new ColumnInfo
                {
                    Name = columnReader.GetString(0),
                    DataType = columnReader.GetString(1),
                    IsNullable = columnReader.GetString(2) == "YES",
                    DefaultValue = columnReader.IsDBNull(3) ? null : columnReader.GetString(3),
                    MaxLength = columnReader.IsDBNull(4) ? null : (int?)columnReader.GetInt32(4),
                    Precision = columnReader.IsDBNull(5) ? null : (int?)columnReader.GetInt32(5),
                    Scale = columnReader.IsDBNull(6) ? null : (int?)columnReader.GetInt32(6)
                });
            }
        }

        /// <summary>
        /// Helper method to populate view details
        /// </summary>
        private async Task PopulateViewDetailsAsync(NpgsqlConnection connection, DatabaseObjectDetails details, CancellationToken cancellationToken)
        {
            // View details are already populated in the main query
            await Task.CompletedTask;
        }

        /// <summary>
        /// Helper method to populate function details
        /// </summary>
        private async Task PopulateFunctionDetailsAsync(NpgsqlConnection connection, DatabaseObjectDetails details, CancellationToken cancellationToken)
        {
            // Function details are already populated in the main query
            await Task.CompletedTask;
        }

        /// <summary>
        /// Helper method to populate index details
        /// </summary>
        private async Task PopulateIndexDetailsAsync(NpgsqlConnection connection, DatabaseObjectDetails details, CancellationToken cancellationToken)
        {
            // Index details are already populated in the main query
            await Task.CompletedTask;
        }

        /// <summary>
        /// Helper method to populate basic details
        /// </summary>
        private async Task PopulateBasicDetailsAsync(NpgsqlConnection connection, DatabaseObjectDetails details, CancellationToken cancellationToken)
        {
            // Basic details are already populated
            await Task.CompletedTask;
        }

        public void Dispose()
        {
            if (!_disposed)
            {
                _disposed = true;
                _logger.LogInformation("SchemaBrowser disposed");
            }
        }
    }
}