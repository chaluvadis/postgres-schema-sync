namespace PostgreSqlSchemaCompareSync.Core.Migration;

public class MigrationExecutor(
    ILogger<MigrationExecutor> logger,
    IConnectionManager connectionManager) : IMigrationExecutor
{
    private readonly ILogger<MigrationExecutor> _logger = logger;
    private readonly IConnectionManager _connectionManager = connectionManager;

    public async Task<MigrationResult> ExecuteMigrationAsync(
        MigrationScript migration,
        ConnectionInfo targetConnection,
        CancellationToken cancellationToken = default)
    {
        var startTime = DateTime.UtcNow;
        var result = new MigrationResult
        {
            Status = MigrationStatus.Running,
            ExecutionTime = TimeSpan.Zero,
            OperationsExecuted = 0,
            Errors = [],
            Warnings = []
        };

        try
        {
            _logger.LogInformation("Starting migration execution {MigrationId} on {Database}",
                migration.Id, targetConnection.Database);

            if (migration.IsDryRun)
            {
                _logger.LogInformation("Executing in DRY RUN mode - no actual changes will be made");
                result.Status = MigrationStatus.Completed;
                result.ExecutionTime = DateTime.UtcNow - startTime;
                return result;
            }

            using var connection = await _connectionManager.CreateConnectionAsync(targetConnection, cancellationToken);
            await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

            try
            {
                var sqlStatements = ParseSqlStatements(migration.SqlScript);
                var executedOperations = new List<string>();

                _logger.LogInformation("Executing {StatementCount} SQL statements", sqlStatements.Count);

                for (int i = 0; i < sqlStatements.Count; i++)
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    var statement = sqlStatements[i];

                    if (string.IsNullOrWhiteSpace(statement) || statement.TrimStart().StartsWith("--"))
                    {
                        continue; // Skip empty lines and comments
                    }

                    try
                    {
                        using var cmd = connection.CreateCommand();
                        cmd.CommandText = statement;
                        cmd.CommandTimeout = 300; // 5 minutes timeout for complex operations
                        cmd.Transaction = transaction;

                        _logger.LogDebug("Executing statement {StatementNumber}/{TotalStatements}: {StatementPreview}",
                            i + 1, sqlStatements.Count, statement.Length > 100 ? statement[..100] + "..." : statement);

                        await cmd.ExecuteNonQueryAsync(cancellationToken);
                        executedOperations.Add(statement);
                        result.OperationsExecuted++;

                        _logger.LogDebug("Successfully executed operation {OperationNumber}", result.OperationsExecuted);
                    }
                    catch (Exception ex)
                    {
                        var errorMessage = $"Failed to execute statement {i + 1}: {ex.Message}";
                        result.Errors.Add(errorMessage);
                        result.Status = MigrationStatus.Failed;

                        _logger.LogError(ex, "Migration execution failed at statement {StatementNumber}", i + 1);

                        // For critical errors, rollback immediately
                        if (IsCriticalError(ex))
                        {
                            await transaction.RollbackAsync(cancellationToken);
                            result.ExecutionTime = DateTime.UtcNow - startTime;
                            return result;
                        }
                        else
                        {
                            result.Warnings.Add($"Non-critical error at statement {i + 1}: {ex.Message}");
                        }
                    }
                }

                // Commit the transaction if we reach here
                await transaction.CommitAsync(cancellationToken);
                result.Status = MigrationStatus.Completed;
                result.ExecutionTime = DateTime.UtcNow - startTime;

                _logger.LogInformation("Migration execution completed successfully: {OperationsExecuted} operations in {ExecutionTime}",
                    result.OperationsExecuted, result.ExecutionTime);

                return result;
            }
            catch (Exception ex)
            {
                result.Status = MigrationStatus.Failed;
                result.Errors.Add($"Transaction failed: {ex.Message}");
                _logger.LogError(ex, "Migration transaction failed");

                // Attempt rollback
                try
                {
                    await transaction.RollbackAsync(cancellationToken);
                    _logger.LogInformation("Transaction rolled back successfully");
                }
                catch (Exception rollbackEx)
                {
                    _logger.LogError(rollbackEx, "Failed to rollback transaction");
                    result.Errors.Add($"Rollback failed: {rollbackEx.Message}");
                }

                result.ExecutionTime = DateTime.UtcNow - startTime;
                return result;
            }
        }
        catch (Exception ex)
        {
            result.Status = MigrationStatus.Failed;
            result.Errors.Add($"Connection failed: {ex.Message}");
            result.ExecutionTime = DateTime.UtcNow - startTime;
            _logger.LogError(ex, "Migration execution failed due to connection error");
            return result;
        }
    }

    private static List<string> ParseSqlStatements(string sqlScript)
    {
        using var connection = new NpgsqlConnection();
        using var batch = new NpgsqlBatch(connection);
        batch.BatchCommands.Add(new NpgsqlBatchCommand(sqlScript));

        var statements = new List<string>();
        foreach (var command in batch.BatchCommands)
        {
            if (!string.IsNullOrEmpty(command.CommandText.Trim()))
            {
                statements.Add(command.CommandText.Trim());
            }
        }

        return statements;
    }

    private bool IsCriticalError(Exception ex)
    {
        var errorMessage = ex.Message.ToLowerInvariant();

        // Connection errors are critical
        if (errorMessage.Contains("connection") || errorMessage.Contains("network"))
            return true;

        // Authentication errors are critical
        if (errorMessage.Contains("authentication") || errorMessage.Contains("permission") || errorMessage.Contains("access denied"))
            return true;

        // Transaction errors are critical
        if (errorMessage.Contains("deadlock") || errorMessage.Contains("serialization failure"))
            return true;

        // Other errors might be non-critical (e.g., trying to drop non-existent objects)
        return false;
    }
}