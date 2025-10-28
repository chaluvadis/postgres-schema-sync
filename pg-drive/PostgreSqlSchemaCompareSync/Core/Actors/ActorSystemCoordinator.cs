namespace PostgreSqlSchemaCompareSync.Core.Actors;
/// <summary>
/// Actor system coordinator for managing schema comparison and migration operations
/// </summary>
public class ActorSystemCoordinator : IDisposable
{
    private readonly ILogger<ActorSystemCoordinator> _logger;
    private readonly AppSettings _settings;
    private readonly IServiceProvider _serviceProvider;
    private ActorSystem? _actorSystem;
    private IActorRef? _schemaComparisonCoordinator;
    private IActorRef? _migrationCoordinator;
    private bool _disposed;
    public ActorSystemCoordinator(
        ILogger<ActorSystemCoordinator> logger,
        IOptions<AppSettings> settings,
        IServiceProvider serviceProvider)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _settings = settings?.Value ?? throw new ArgumentNullException(nameof(settings));
        _serviceProvider = serviceProvider ?? throw new ArgumentNullException(nameof(serviceProvider));
        InitializeActorSystem();
    }
    private void InitializeActorSystem()
    {
        try
        {
            var config = ConfigurationFactory.ParseString(@"
                akka {
                    loglevel = INFO
                    actor {
                        provider = ""Akka.Actor.LocalActorRefProvider, Akka""
                        deployment {
                            /schema-comparison-coordinator {
                                router = round-robin-pool
                                nr-of-instances = 3
                            }
                            /migration-coordinator {
                                router = round-robin-pool
                                nr-of-instances = 2
                            }
                        }
                        default-dispatcher {
                            type = ForkJoinDispatcher
                            throughput = 100
                        }
                    }
                    supervision {
                        strategy = ""Akka.Actor.OneForOneStrategy""
                        max-nr-of-retries = 10
                        within-time-range = 1m
                    }
                }
            ");
            _actorSystem = ActorSystem.Create("PostgreSqlSchemaSync", config);
            // Create coordinator actors with proper supervision
            _schemaComparisonCoordinator = _actorSystem.ActorOf(
                Props.Create(() => new SchemaComparisonCoordinator(
                    _serviceProvider.GetRequiredService<ILogger<SchemaComparisonCoordinator>>(),
                    _serviceProvider.GetRequiredService<ISchemaComparator>()))
                .WithSupervisorStrategy(new OneForOneStrategy(
                    maxNrOfRetries: 3,
                    withinTimeRange: TimeSpan.FromMinutes(1),
                    localOnlyDecider: ex =>
                    {
                        // Selective supervision: only restart on recoverable errors
                        if (ex is TimeoutException || ex is NpgsqlException ||
                            ex is OperationCanceledException)
                        {
                            _logger.LogWarning(ex, "Schema comparison actor failed with recoverable error, restarting");
                            return Directive.Restart;
                        }
                        else
                        {
                            _logger.LogError(ex, "Schema comparison actor failed with unrecoverable error, stopping");
                            return Directive.Stop;
                        }
                    })),
                "schema-comparison-coordinator");
            _migrationCoordinator = _actorSystem.ActorOf(
                Props.Create(() => new MigrationCoordinator(
                    _serviceProvider.GetRequiredService<ILogger<MigrationCoordinator>>(),
                    _serviceProvider.GetRequiredService<IMigrationExecutor>()))
                .WithSupervisorStrategy(new OneForOneStrategy(
                    maxNrOfRetries: 2,
                    withinTimeRange: TimeSpan.FromMinutes(1),
                    localOnlyDecider: ex =>
                    {
                        // Selective supervision: only restart on recoverable errors
                        if (ex is TimeoutException || ex is NpgsqlException ||
                            ex is OperationCanceledException)
                        {
                            _logger.LogWarning(ex, "Migration coordinator actor failed with recoverable error, restarting");
                            return Directive.Restart;
                        }
                        else
                        {
                            _logger.LogError(ex, "Migration coordinator actor failed with unrecoverable error, stopping");
                            return Directive.Stop;
                        }
                    })),
                "migration-coordinator");
            _logger.LogInformation("Actor system initialized with supervision and routing");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to initialize actor system");
            throw;
        }
    }
    public async Task<SchemaComparison> CompareSchemasAsync(
        ConnectionInfo sourceConnection,
        ConnectionInfo targetConnection,
        SchemaComparisonOptions options,
        CancellationToken ct = default)
    {
        if (_schemaComparisonCoordinator == null)
            throw new InvalidOperationException("Schema comparison coordinator not initialized");
        _logger.LogInformation("Sending schema comparison request to actor system");
        var message = new CompareSchemasMessage(sourceConnection, targetConnection, options, ct);
        var response = await _schemaComparisonCoordinator.Ask<SchemaComparisonResponse>(
            message,
            TimeSpan.FromMinutes(5), // Default 5 minute timeout
            ct);
        if (response.Exception != null)
        {
            _logger.LogError(response.Exception, "Schema comparison failed in actor system");
            throw response.Exception;
        }
        _logger.LogInformation("Schema comparison completed successfully via actor system");
        return response.Comparison!;
    }
    public async Task<MigrationResult> ExecuteMigrationAsync(
        MigrationScript migration,
        ConnectionInfo targetConnection,
        CancellationToken ct = default)
    {
        if (_migrationCoordinator == null)
            throw new InvalidOperationException("Migration coordinator not initialized");
        _logger.LogInformation("Sending migration execution request to actor system");
        var message = new ExecuteMigrationMessage(migration, targetConnection, ct);
        var response = await _migrationCoordinator.Ask<MigrationResultResponse>(
            message,
            TimeSpan.FromMinutes(30), // Longer timeout for migrations
            ct);
        if (response.Exception != null)
        {
            _logger.LogError(response.Exception, "Migration execution failed in actor system");
            throw response.Exception;
        }
        _logger.LogInformation("Migration execution completed successfully via actor system");
        return response.Result!;
    }
    public async Task<bool> PerformHealthCheckAsync(CancellationToken ct = default)
    {
        if (_schemaComparisonCoordinator == null || _migrationCoordinator == null)
            return false;

        try
        {
            // Check coordinators are not null at time of access
            var schemaCoordinator = _schemaComparisonCoordinator;
            var migrationCoordinator = _migrationCoordinator;

            if (schemaCoordinator == null || migrationCoordinator == null)
                return false;

            var schemaHealthTask = schemaCoordinator.Ask<HealthCheckResponse>(
                new HealthCheckMessage(), TimeSpan.FromSeconds(5), ct);
            var migrationHealthTask = migrationCoordinator.Ask<HealthCheckResponse>(
                new HealthCheckMessage(), TimeSpan.FromSeconds(5), ct);

            var results = await Task.WhenAll(schemaHealthTask, migrationHealthTask);
            var allHealthy = results.All(r => r.IsHealthy);
            _logger.LogInformation("Actor system health check: {Status}",
                allHealthy ? "All actors healthy" : "Some actors unhealthy");
            return allHealthy;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Actor system health check failed");
            return false;
        }
    }
    public void Dispose()
    {
        if (!_disposed)
        {
            try
            {
                _logger.LogInformation("Shutting down actor system...");
                // Graceful shutdown with timeout
                var shutdownTask = Task.Run(async () =>
                {
                    await _actorSystem?.Terminate();
                });
                if (shutdownTask.Wait(TimeSpan.FromSeconds(30)))
                {
                    _logger.LogInformation("Actor system terminated gracefully");
                }
                else
                {
                    _logger.LogWarning("Actor system termination timed out");
                }
                _actorSystem?.Dispose();
                _logger.LogInformation("Actor system coordinator disposed successfully");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error during actor system disposal");
            }
            finally
            {
                _disposed = true;
            }
        }
    }
}
/// <summary>
/// Messages for actor communication
/// </summary>
public record CompareSchemasMessage(
    ConnectionInfo SourceConnection,
    ConnectionInfo TargetConnection,
    SchemaComparisonOptions Options,
    CancellationToken CancellationToken);
public record SchemaComparisonResponse(SchemaComparison? Comparison, Exception? Exception);
public record ExecuteMigrationMessage(
    MigrationScript Migration,
    ConnectionInfo TargetConnection,
    CancellationToken CancellationToken);
public record MigrationResultResponse(MigrationResult? Result, Exception? Exception);
public record HealthCheckMessage;
public record HealthCheckResponse(bool IsHealthy, string Status);