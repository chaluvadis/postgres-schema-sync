namespace PostgreSqlSchemaCompareSync.Core.Models;
public class MigrationPreview
{
    public Guid MigrationId { get; set; }
    public int TotalStatements { get; set; }
    public TimeSpan EstimatedExecutionTime { get; set; }
    public MigrationRiskLevel RiskLevel { get; set; }
    public List<string> Warnings { get; set; } = [];
    public List<string> StatementPreview { get; set; } = [];
    public DateTime PreviewGeneratedAt { get; set; } = DateTime.UtcNow;
}
public enum MigrationRiskLevel
{
    Low,
    Medium,
    High
}
public class MigrationBatch
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public MigrationScript ParentMigration { get; set; } = new();
    public int BatchNumber { get; set; }
    public List<string> SqlStatements { get; set; } = [];
    public MigrationStatus Status { get; set; } = MigrationStatus.Pending;
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public TimeSpan? ExecutionTime { get; set; }
    public List<string> Errors { get; set; } = [];
    public List<string> Warnings { get; set; } = [];
}
public class MigrationExecutionPlan
{
    public MigrationScript Migration { get; set; } = new();
    public List<MigrationBatch> Batches { get; set; } = [];
    public MigrationExecutionStrategy Strategy { get; set; } = MigrationExecutionStrategy.Sequential;
    public bool StopOnFirstError { get; set; } = true;
    public TimeSpan? EstimatedTotalTime { get; set; }
}
public enum MigrationExecutionStrategy
{
    Sequential,     // Execute batches one after another
    Parallel,       // Execute batches in parallel (where safe)
    Conservative    // Execute with extra safety checks
}