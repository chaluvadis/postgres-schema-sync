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
        services.AddSingleton<ISchemaMetadataExtractor, SchemaMetadataExtractor>();
        services.AddSingleton<ISchemaCacheManager, SchemaCacheManager>();
        services.AddSingleton<ISchemaComparisonEngine, SchemaComparisonEngine>();
        services.AddSingleton<ISchemaBrowser, SchemaBrowser>();
        services.AddSingleton<ISchemaComparator, SchemaComparator>();
        // Register migration services
        services.AddSingleton<IMigrationScriptGenerator, MigrationScriptGenerator>();
        services.AddSingleton<IMigrationGenerator, MigrationGenerator>();
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
            var generator = _serviceProvider.GetRequiredService<IMigrationGenerator>();
            var migration = await generator.GenerateMigrationAsync(comparison, options, ct);
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