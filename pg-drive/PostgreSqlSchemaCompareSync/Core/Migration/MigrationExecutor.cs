namespace PostgreSqlSchemaCompareSync.Core.Migration;
using Npgsql;
using System.Text;
using System.Text.RegularExpressions;

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
                            // For non-critical errors, log warning but continue
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

    private List<string> ParseSqlStatements(string sqlScript)
    {
        var statements = new List<string>();
        var currentStatement = new StringBuilder();
        var inString = false;
        var stringChar = '\0';
        var inComment = false;
        var commentLine = false;

        var i = 0;
        while (i < sqlScript.Length)
        {
            var c = sqlScript[i];

            // Handle comments
            if (!inString && c == '/' && i + 1 < sqlScript.Length && sqlScript[i + 1] == '*')
            {
                inComment = true;
                i++; // Skip next character
            }
            else if (inComment && c == '*' && i + 1 < sqlScript.Length && sqlScript[i + 1] == '/')
            {
                inComment = false;
                i++; // Skip next character
            }
            else if (!inString && !inComment && c == '-' && i + 1 < sqlScript.Length && sqlScript[i + 1] == '-')
            {
                commentLine = true;
            }
            else if (commentLine && c == '\n')
            {
                commentLine = false;
            }
            else if (!inComment && !commentLine)
            {
                // Handle string literals
                if (!inString && (c == '"' || c == '\''))
                {
                    inString = true;
                    stringChar = c;
                    currentStatement.Append(c);
                }
                else if (inString && c == stringChar)
                {
                    // Check if this is an escaped quote
                    if (i + 1 < sqlScript.Length && sqlScript[i + 1] == stringChar)
                    {
                        currentStatement.Append(c); // Escaped quote
                        i++; // Skip next character
                    }
                    else
                    {
                        inString = false;
                        stringChar = '\0';
                        currentStatement.Append(c);
                    }
                }
                else if (!inString && c == ';')
                {
                    currentStatement.Append(c);
                    var statement = currentStatement.ToString().Trim();
                    if (!string.IsNullOrEmpty(statement))
                    {
                        statements.Add(statement);
                    }
                    currentStatement.Clear();
                }
                else
                {
                    currentStatement.Append(c);
                }
            }
            i++;
        }

        // Add any remaining statement
        var finalStatement = currentStatement.ToString().Trim();
        if (!string.IsNullOrEmpty(finalStatement))
        {
            statements.Add(finalStatement);
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