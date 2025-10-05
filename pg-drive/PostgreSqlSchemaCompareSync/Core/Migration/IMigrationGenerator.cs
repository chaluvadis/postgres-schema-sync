namespace PostgreSqlSchemaCompareSync.Core.Migration
{
    /// <summary>
    /// Interface for generating migration scripts
    /// </summary>
    public interface IMigrationGenerator : IDisposable
    {
        /// <summary>
        /// Generates a migration script from schema differences
        /// </summary>
        Task<MigrationScript> GenerateMigrationAsync(
            Core.Models.SchemaComparison comparison,
            MigrationOptions options,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Generates a rollback script for a migration
        /// </summary>
        Task<string> GenerateRollbackScriptAsync(
            MigrationScript migration,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Validates a migration script for safety and correctness
        /// </summary>
        Task<MigrationValidationResult> ValidateMigrationAsync(
            MigrationScript migration,
            CancellationToken cancellationToken = default);
    }

    /// <summary>
    /// Result of migration validation
    /// </summary>
    public class MigrationValidationResult
    {
        public bool IsValid { get; set; }
        public List<string> Errors { get; set; } = [];
        public List<string> Warnings { get; set; } = [];
        public MigrationRiskLevel RiskLevel { get; set; } = MigrationRiskLevel.Low;
        public TimeSpan EstimatedExecutionTime { get; set; }
    }

    /// <summary>
    /// Migration risk levels
    /// </summary>
    public enum MigrationRiskLevel
    {
        Low,
        Medium,
        High,
        Critical
    }
}