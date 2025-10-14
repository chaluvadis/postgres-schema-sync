namespace PostgreSqlSchemaCompareSync.Core.Migration;

public interface IMigrationExecutor : IDisposable
{
    Task<MigrationResult> ExecuteMigrationAsync(
        MigrationScript migration,
        ConnectionInfo targetConnection,
        CancellationToken ct = default);

    Task<MigrationResult> ExecuteMigrationWithProgressAsync(
        MigrationScript migration,
        ConnectionInfo targetConnection,
        IProgress<MigrationProgress>? progress = null,
        CancellationToken ct = default);

    Task<MigrationResult> TestMigrationAsync(
        MigrationScript migration,
        ConnectionInfo targetConnection,
        CancellationToken ct = default);
    Task<bool> CancelMigrationAsync(string migrationId, CancellationToken ct = default);
}

public class MigrationProgress
{
    public int CurrentOperation { get; set; }
    public int TotalOperations { get; set; }
    public string? CurrentOperationDescription { get; set; }
    public MigrationStatus Status { get; set; }
    public TimeSpan ElapsedTime { get; set; }
    public TimeSpan EstimatedTimeRemaining { get; set; }
    public double ProgressPercentage => TotalOperations > 0 ? (double)CurrentOperation / TotalOperations * 100 : 0;
}