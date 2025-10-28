namespace PostgreSqlSchemaCompareSync.Core.Actors;

/// <summary>
/// Actor responsible for coordinating schema comparison operations with proper fault tolerance
/// </summary>
public class SchemaComparisonCoordinator : ReceiveActor
{
    private readonly ILogger<SchemaComparisonCoordinator> _logger;
    private readonly ISchemaComparator _schemaComparator;

    public SchemaComparisonCoordinator(
        ILogger<SchemaComparisonCoordinator> logger,
        ISchemaComparator schemaComparator)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _schemaComparator = schemaComparator ?? throw new ArgumentNullException(nameof(schemaComparator));

        ReceiveAsync<CompareSchemasMessage>(HandleCompareSchemasAsync);
        Receive<HealthCheckMessage>(HandleHealthCheck);
    }
    private async Task HandleCompareSchemasAsync(CompareSchemasMessage message)
    {
        try
        {
            _logger.LogInformation("Actor {ActorPath} starting schema comparison between {Source} and {Target}",
                Self.Path, message.SourceConnection.Database, message.TargetConnection.Database);

            // Actor processes messages on its own dispatcher - no Task.Run needed
            var comparison = await _schemaComparator.CompareSchemasAsync(
                message.SourceConnection,
                message.TargetConnection,
                message.Options,
                message.CancellationToken);

            _logger.LogInformation("Actor {ActorPath} completed schema comparison successfully", Self.Path);
            Sender.Tell(new SchemaComparisonResponse(comparison, null));
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("Actor {ActorPath} schema comparison was cancelled", Self.Path);
            Sender.Tell(new SchemaComparisonResponse(null, new OperationCanceledException()));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Actor {ActorPath} schema comparison failed", Self.Path);
            // Actor fault tolerance: let supervisor handle the failure
            throw; // Re-throw to trigger supervision strategy
        }
    }

    private void HandleHealthCheck(HealthCheckMessage message)
    {
        _logger.LogDebug("Actor {ActorPath} health check received", Self.Path);
        Sender.Tell(new HealthCheckResponse(true, "Schema comparison coordinator is healthy"));
    }
    protected override void PreStart()
    {
        _logger.LogInformation("Schema comparison coordinator actor started: {ActorPath}", Self.Path);
        base.PreStart();
    }
    protected override void PostStop()
    {
        _logger.LogInformation("Schema comparison coordinator actor stopped: {ActorPath}", Self.Path);
        base.PostStop();
    }
    protected override void PreRestart(Exception reason, object message)
    {
        _logger.LogWarning(reason, "Schema comparison coordinator actor restarting due to: {Message}", message);
        base.PreRestart(reason, message);
    }
    protected override void PostRestart(Exception reason)
    {
        _logger.LogInformation("Schema comparison coordinator actor restarted after: {Reason}", reason?.Message);
        base.PostRestart(reason);
    }
}