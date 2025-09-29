namespace PostgreSqlSchemaCompareSync.Core.Migration;
public interface IMigrationExecutor
{
    Task<MigrationResult> ExecuteMigrationAsync(
        MigrationScript migration,
        ConnectionInfo targetConnection,
        CancellationToken cancellationToken = default);
}