namespace PostgreSqlSchemaCompareSync.Core.Actors;
/// <summary>
/// Actor responsible for coordinating migration operations with proper isolation
/// </summary>
public class MigrationCoordinator : ReceiveActor
{
    private readonly ILogger<MigrationCoordinator> _logger;
    private readonly IMigrationExecutor _migrationExecutor;
    public MigrationCoordinator(
        ILogger<MigrationCoordinator> logger,
        IMigrationExecutor migrationExecutor)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _migrationExecutor = migrationExecutor ?? throw new ArgumentNullException(nameof(migrationExecutor));
        ReceiveAsync<ExecuteMigrationMessage>(HandleExecuteMigrationAsync);
        Receive<HealthCheckMessage>(HandleHealthCheck);
    }
    private async Task HandleExecuteMigrationAsync(ExecuteMigrationMessage message)
    {
        try
        {
            _logger.LogInformation("Actor {ActorPath} starting migration execution for {MigrationId}",
                Self.Path, message.Migration.Id);

            // Actor processes messages on its own dispatcher - no Task.Run needed
            var result = await _migrationExecutor.ExecuteMigrationAsync(
                message.Migration,
                message.TargetConnection,
                message.CancellationToken);

            _logger.LogInformation("Actor {ActorPath} completed migration execution successfully", Self.Path);
            Sender.Tell(new MigrationResultResponse(result, null));
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("Actor {ActorPath} migration execution was cancelled", Self.Path);
            Sender.Tell(new MigrationResultResponse(null, new OperationCanceledException()));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Actor {ActorPath} migration execution failed", Self.Path);
            // Actor fault tolerance: let supervisor handle the failure
            throw; // Re-throw to trigger supervision strategy
        }
    }
    private void HandleHealthCheck(HealthCheckMessage message)
    {
        _logger.LogDebug("Actor {ActorPath} health check received", Self.Path);
        Sender.Tell(new HealthCheckResponse(true, "Migration coordinator is healthy"));
    }
    protected override void PreStart()
    {
        _logger.LogInformation("Migration coordinator actor started: {ActorPath}", Self.Path);
        base.PreStart();
    }
    protected override void PostStop()
    {
        _logger.LogInformation("Migration coordinator actor stopped: {ActorPath}", Self.Path);
        base.PostStop();
    }
    protected override void PreRestart(Exception reason, object message)
    {
        _logger.LogWarning(reason, "Migration coordinator actor restarting due to: {Message}", message);
        base.PreRestart(reason, message);
    }
    protected override void PostRestart(Exception reason)
    {
        _logger.LogInformation("Migration coordinator actor restarted after: {Reason}", reason?.Message);
        base.PostRestart(reason);
    }
}