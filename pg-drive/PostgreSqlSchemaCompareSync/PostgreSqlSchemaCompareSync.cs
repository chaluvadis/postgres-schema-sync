using PostgreSqlSchemaCompareSync.Core.Models;
using System;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Configuration;

namespace PostgreSqlSchemaCompareSync;

public class PostgreSqlSchemaCompareSync : IDisposable
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<PostgreSqlSchemaCompareSync> _logger;
    private readonly IConfiguration _configuration;
    private bool _disposed;
    public PostgreSqlSchemaCompareSync()
    {
        // Build configuration
        _configuration = new ConfigurationBuilder()
            .AddJsonFile("appsettings.json", optional: true, reloadOnChange: true)
            .AddEnvironmentVariables()
            .Build();
        // Setup dependency injection
        var services = new ServiceCollection();
        // Configure logging
        services.AddLogging(builder =>
        {
            builder.AddConfiguration(_configuration.GetSection("Logging"));
            builder.AddConsole();
        });
        // Register configuration
        services.Configure<AppSettings>(_configuration.GetSection("PostgreSqlSchemaCompareSync"));
        // Register core services - Advanced connection management
        services.AddSingleton<ConnectionPool>();
        services.AddSingleton<IConnectionManager, ConnectionManager>();
        // Register schema management services
        services.AddSingleton<IMetadataExtractor, SchemaMetadataExtractor>();
        services.AddSingleton<IObjectMetadataExtractor, SchemaMetadataExtractor>();
        services.AddSingleton<IObjectValidator, SchemaMetadataExtractor>();
        services.AddSingleton<ISchemaCacheManager, SchemaCacheManager>();
        services.AddSingleton<ISchemaComparisonEngine, SchemaComparisonEngine>();
        services.AddSingleton<ISchemaBrowser, SchemaBrowser>();
        services.AddSingleton<ISchemaComparator, SchemaComparator>();
        // Register metadata extractors for all PostgreSQL object types
        services.AddSingleton<IMetadataExtractor, TableMetadataExtractor>();
        services.AddSingleton<IMetadataExtractor, ViewMetadataExtractor>();
        services.AddSingleton<IMetadataExtractor, FunctionMetadataExtractor>();
        services.AddSingleton<IMetadataExtractor, SequenceMetadataExtractor>();
        services.AddSingleton<IMetadataExtractor, IndexMetadataExtractor>();
        services.AddSingleton<IMetadataExtractor, TypeMetadataExtractor>();
        services.AddSingleton<IMetadataExtractor, TriggerMetadataExtractor>();
        services.AddSingleton<IMetadataExtractor, ConstraintMetadataExtractor>();
        services.AddSingleton<IMetadataExtractor, ExtensionMetadataExtractor>();
        services.AddSingleton<IMetadataExtractor, CollationMetadataExtractor>();
        services.AddSingleton<IMetadataExtractor, RoleMetadataExtractor>();
        services.AddSingleton<IMetadataExtractor, TablespaceMetadataExtractor>();
        // Register additional metadata extractors for advanced PostgreSQL features
        services.AddSingleton<IMetadataExtractor, MaterializedViewMetadataExtractor>();
        services.AddSingleton<IMetadataExtractor, ProcedureMetadataExtractor>();
        services.AddSingleton<IMetadataExtractor, ColumnMetadataExtractor>();
        services.AddSingleton<IMetadataExtractor, ForeignTableMetadataExtractor>();
        services.AddSingleton<IMetadataExtractor, PartitionMetadataExtractor>();
        // Register migration services
        services.AddSingleton<IMigrationScriptGenerator, MigrationScriptGenerator>();
        services.AddSingleton<IMigrationExecutor, MigrationExecutor>();
        _serviceProvider = services.BuildServiceProvider();
        _logger = _serviceProvider.GetRequiredService<ILogger<PostgreSqlSchemaCompareSync>>();
        _logger.LogInformation("PostgreSQL Schema Compare & Sync extension initialized");
    }
    public async Task<bool> TestConnectionAsync(ConnectionInfo connectionInfo, CancellationToken ct = default)
    {
        try
        {
            var connectionManager = _serviceProvider.GetRequiredService<IConnectionManager>();
            using var connection = await connectionManager.CreateConnectionAsync(connectionInfo, ct);
            _logger.LogInformation("Connection test successful for {ConnectionName}", connectionInfo.Name);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Connection test failed for {ConnectionName}", connectionInfo.Name);
            return false;
        }
    }
    public async Task<List<DatabaseObject>> BrowseSchemaAsync(
        ConnectionInfo connectionInfo,
        string? schemaFilter = null,
        CancellationToken ct = default)
    {
        try
        {
            var schemaBrowser = _serviceProvider.GetRequiredService<ISchemaBrowser>();
            var objects = await schemaBrowser.GetDatabaseObjectsAsync(connectionInfo, schemaFilter, ct);
            _logger.LogInformation("Retrieved {ObjectCount} objects from {Database}",
                objects.Count, connectionInfo.Database);
            return objects;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Schema browsing failed for {ConnectionName}", connectionInfo.Name);
            throw;
        }
    }

    public async Task<SchemaComparison> CompareSchemasAsync(
        ConnectionInfo sourceConnection,
        ConnectionInfo targetConnection,
        SchemaComparisonOptions options,
        CancellationToken ct = default)
    {
        try
        {
            var comparator = _serviceProvider.GetRequiredService<ISchemaComparator>();
            var comparison = await comparator.CompareSchemasAsync(
                sourceConnection,
                targetConnection,
                options,
                ct);
            _logger.LogInformation("Schema comparison completed: {DifferenceCount} differences found",
                comparison.Differences.Count);
            return comparison;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Schema comparison failed between {Source} and {Target}",
                sourceConnection.Name, targetConnection.Name);
            throw;
        }
    }

    public async Task<MigrationScript> GenerateMigrationAsync(
        SchemaComparison comparison,
        MigrationOptions options,
        CancellationToken ct = default)
    {
        try
        {
            var generator = _serviceProvider.GetRequiredService<IMigrationScriptGenerator>();
            var migration = await generator.GenerateMigrationScriptAsync(comparison, options, ct);
            _logger.LogInformation("Migration script generated with {OperationCount} operations",
                migration.SqlScript.Split('\n').Length);
            return migration;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Migration generation failed for comparison {ComparisonId}",
                comparison.Id);
            throw;
        }
    }

    public async Task<MigrationResult> ExecuteMigrationAsync(
        MigrationScript migration,
        ConnectionInfo targetConnection,
        CancellationToken ct = default)
    {
        try
        {
            var executor = _serviceProvider.GetRequiredService<IMigrationExecutor>();
            var result = await executor.ExecuteMigrationAsync(migration, targetConnection, ct);
            _logger.LogInformation("Migration execution {Status} for {MigrationId}",
                result.Status, migration.Id);
            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Migration execution failed for {MigrationId}", migration.Id);
            throw;
        }
    }

    public async Task<DatabaseObjectDetails> GetObjectDetailsAsync(
        ConnectionInfo connectionInfo,
        ObjectType objectType,
        string schema,
        string objectName,
        CancellationToken ct = default)
    {
        try
        {
            var schemaBrowser = _serviceProvider.GetRequiredService<ISchemaBrowser>();
            var details = await schemaBrowser.GetObjectDetailsAsync(
                connectionInfo, objectType, schema, objectName, ct);
            _logger.LogDebug("Retrieved details for {ObjectType} {ObjectName}",
                objectType, objectName);
            return details;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get object details for {ObjectType} {ObjectName}",
                objectType, objectName);
            throw;
        }
    }

    public async Task<QueryResult> ExecuteQueryAsync(
        ConnectionInfo connectionInfo,
        string query,
        QueryOptions options,
        CancellationToken ct = default)
    {
        try
        {
            var connectionManager = _serviceProvider.GetRequiredService<IConnectionManager>();
            using var connection = await connectionManager.CreateConnectionAsync(connectionInfo, ct);

            _logger.LogInformation("Executing query for {ConnectionName}", connectionInfo.Name);

            using var command = connection.CreateCommand();
            var injectionPatterns = new[] { "';", "--", "/*", "*/", "xp_", "sp_", "DROP", "DELETE", "UPDATE", "INSERT", "ALTER", "CREATE", "EXEC", "UNION" };
            foreach (var pattern in injectionPatterns)
            {
                if (query.ToUpper().Contains(pattern))
                {
                    throw new ArgumentException("Query contains potentially unsafe SQL patterns.");
                }
            }
            command.CommandText = query;
            command.CommandTimeout = options.TimeoutSeconds;

            if (options.CancellationToken.HasValue)
            {
                ct = options.CancellationToken.Value;
            }

            using var reader = await command.ExecuteReaderAsync(ct);

            var result = new QueryResult
            {
                RowCount = 0,
                Columns = new List<QueryColumn>(),
                Rows = new List<List<object?>>(),
                ExecutionPlan = options.IncludeExecutionPlan ? await GetExecutionPlanAsync(command) : null
            };

            // Get column information
            for (int i = 0; i < reader.FieldCount; i++)
            {
                result.Columns.Add(new QueryColumn
                {
                    Name = reader.GetName(i),
                    Type = reader.GetFieldType(i)?.Name ?? "unknown",
                    Nullable = reader.IsDBNull(i)
                });
            }

            // Get rows
            while (await reader.ReadAsync(ct))
            {
                if (result.RowCount >= options.MaxRows)
                    break;

                var row = new List<object?>();
                for (int i = 0; i < reader.FieldCount; i++)
                {
                    row.Add(reader.IsDBNull(i) ? null : reader.GetValue(i));
                }
                result.Rows.Add(row);
                result.RowCount++;
            }

            _logger.LogInformation("Query executed successfully: {RowCount} rows returned", result.RowCount);
            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Query execution failed for {ConnectionName}", connectionInfo.Name);
            return new QueryResult
            {
                RowCount = 0,
                Columns = new List<QueryColumn>(),
                Rows = new List<List<object?>>(),
                Error = ex.Message
            };
        }
    }

    private async Task<string?> GetExecutionPlanAsync(System.Data.Common.DbCommand command)
    {
        try
        {
            // This is a simplified implementation
            // In a real implementation, you would use EXPLAIN ANALYZE
            return "Execution plan analysis not implemented in this version";
        }
        catch
        {
            return null;
        }
    }
    public void Dispose()
    {
        if (!_disposed)
        {
            if (_serviceProvider is IDisposable disposable)
            {
                disposable.Dispose();
            }
            _disposed = true;
            _logger.LogInformation("PostgreSQL Schema Compare & Sync extension disposed");
        }
    }
}