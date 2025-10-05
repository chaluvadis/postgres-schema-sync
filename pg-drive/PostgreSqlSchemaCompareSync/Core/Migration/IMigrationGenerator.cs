namespace PostgreSqlSchemaCompareSync.Core.Migration;

public interface IMigrationGenerator : IDisposable
{
    Task<MigrationScript> GenerateMigrationAsync(
        SchemaComparison comparison,
        MigrationOptions options,
        CancellationToken cancellationToken = default);
    Task<string> GenerateRollbackScriptAsync(
        MigrationScript migration,
        CancellationToken cancellationToken = default);
    Task<MigrationValidationResult> ValidateMigrationAsync(
        MigrationScript migration,
        CancellationToken cancellationToken = default);
}

public class MigrationValidationResult
{
    public bool IsValid { get; set; }
    public List<string> Errors { get; set; } = [];
    public List<string> Warnings { get; set; } = [];
    public MigrationRiskLevel RiskLevel { get; set; } = MigrationRiskLevel.Low;
    public TimeSpan EstimatedExecutionTime { get; set; }
}
public enum MigrationRiskLevel
{
    Low,
    Medium,
    High,
    Critical
}