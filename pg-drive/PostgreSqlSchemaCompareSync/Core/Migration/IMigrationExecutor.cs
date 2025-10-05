namespace PostgreSqlSchemaCompareSync.Core.Migration
{
    /// <summary>
    /// Interface for executing migration scripts
    /// </summary>
    public interface IMigrationExecutor : IDisposable
    {
        /// <summary>
        /// Executes a migration script on a target database
        /// </summary>
        Task<MigrationResult> ExecuteMigrationAsync(
            MigrationScript migration,
            ConnectionInfo targetConnection,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Executes a migration script with detailed progress reporting
        /// </summary>
        Task<MigrationResult> ExecuteMigrationWithProgressAsync(
            MigrationScript migration,
            ConnectionInfo targetConnection,
            IProgress<MigrationProgress>? progress = null,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Tests a migration script in dry-run mode
        /// </summary>
        Task<MigrationResult> TestMigrationAsync(
            MigrationScript migration,
            ConnectionInfo targetConnection,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Cancels a running migration
        /// </summary>
        Task<bool> CancelMigrationAsync(string migrationId, CancellationToken cancellationToken = default);
    }

    /// <summary>
    /// Migration execution progress information
    /// </summary>
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
}