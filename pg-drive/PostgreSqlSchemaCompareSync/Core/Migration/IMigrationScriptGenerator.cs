namespace PostgreSqlSchemaCompareSync.Core.Migration;

public interface IMigrationScriptGenerator : IDisposable
{
    Task<MigrationScript> GenerateMigrationScriptAsync(
        SchemaComparison comparison,
        MigrationOptions options,
        CancellationToken cancellationToken = default);

    Task<MigrationScript> GenerateMigrationScriptAsync(
        SchemaComparison comparison,
        MigrationOptions options,
        IProgress<MigrationProgressReport>? progress,
        CancellationToken cancellationToken = default);
}

public class MigrationProgressReport
{
    public int TotalDifferences { get; set; }
    public int ProcessedDifferences { get; set; }
    public string CurrentOperation { get; set; } = string.Empty;
    public MigrationStatus Status { get; set; } = MigrationStatus.Pending;
    public TimeSpan ElapsedTime { get; set; }
    public string CurrentObject { get; set; } = string.Empty;
    public double ProgressPercentage => TotalDifferences > 0 ? (double)ProcessedDifferences / TotalDifferences * 100 : 0;
}