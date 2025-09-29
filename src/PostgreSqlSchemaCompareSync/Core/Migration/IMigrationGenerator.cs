namespace PostgreSqlSchemaCompareSync.Core.Migration;
public interface IMigrationGenerator
{
    Task<MigrationScript> GenerateMigrationAsync(
        SchemaComparison comparison,
        MigrationOptions options,
        CancellationToken cancellationToken = default);
}
// Temporary placeholder types
public class MigrationOptions
{
    public MigrationType Type { get; set; } = MigrationType.Schema;
    public bool GenerateRollbackScript { get; set; } = true;
    public bool IsDryRun { get; set; } = false;
    public int BatchSize { get; set; } = 50;
}
public class MigrationResult
{
    public MigrationStatus Status { get; set; }
    public TimeSpan ExecutionTime { get; set; }
    public int OperationsExecuted { get; set; }
    public List<string> Errors { get; set; } = [];
    public List<string> Warnings { get; set; } = [];
}