namespace PostgreSqlSchemaCompareSync.Core.Migration.Execution;
public class MigrationExecutor
{
    private readonly MigrationSettings _settings;
    private readonly ILogger<MigrationExecutor> _logger;
    private readonly IConnectionManager _connectionManager;
    public MigrationExecutor(
        IOptions<AppSettings> settings,
        ILogger<MigrationExecutor> logger,
        IConnectionManager connectionManager)
    {
        _settings = settings.Value.Migration;
        _logger = logger;
        _connectionManager = connectionManager;
    }
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
                        cmd.CommandTimeout = _settings.DefaultBatchSize * 10; // Generous timeout for batches
                        cmd.Transaction = transaction;
                        _logger.LogDebug("Executing statement {StatementNumber}/{TotalStatements}: {StatementPreview}",
                            i + 1, sqlStatements.Count, statement.Length > 100 ? statement[..100] + "..." : statement);
                        await cmd.ExecuteNonQueryAsync(cancellationToken);
                        executedOperations.Add(statement);
                        result.OperationsExecuted++;
                        // Note: For simplicity, we're executing all statements in a single transaction
                        // In a production system, you might want to implement batch commits for very large migrations
                        _logger.LogDebug("Executed operation {OperationNumber}: {StatementPreview}",
                            result.OperationsExecuted, statement.Length > 50 ? statement[..50] + "..." : statement);
                    }
                    catch (Exception ex)
                    {
                        var errorMessage = $"Failed to execute statement {i + 1}: {ex.Message}";
                        result.Errors.Add(errorMessage);
                        result.Status = MigrationStatus.Failed;
                        _logger.LogError(ex, "Migration execution failed at statement {StatementNumber}", i + 1);
                        // Rollback the transaction
                        await transaction.RollbackAsync(cancellationToken);
                        result.ExecutionTime = DateTime.UtcNow - startTime;
                        return result;
                    }
                }
                // Final commit
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
    public async Task<MigrationResult> ExecuteRollbackAsync(
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
            _logger.LogInformation("Starting rollback execution for migration {MigrationId}", migration.Id);
            if (string.IsNullOrEmpty(migration.RollbackScript))
            {
                result.Status = MigrationStatus.Failed;
                result.Errors.Add("No rollback script available");
                return result;
            }
            using var connection = await _connectionManager.CreateConnectionAsync(targetConnection, cancellationToken);
            await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
            try
            {
                var sqlStatements = ParseSqlStatements(migration.RollbackScript);
                var executedOperations = new List<string>();
                _logger.LogInformation("Executing rollback: {StatementCount} SQL statements", sqlStatements.Count);
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
                        cmd.CommandTimeout = _settings.DefaultBatchSize * 10;
                        cmd.Transaction = transaction;
                        await cmd.ExecuteNonQueryAsync(cancellationToken);
                        executedOperations.Add(statement);
                        result.OperationsExecuted++;
                    }
                    catch (Exception ex)
                    {
                        var errorMessage = $"Rollback failed at statement {i + 1}: {ex.Message}";
                        result.Errors.Add(errorMessage);
                        result.Status = MigrationStatus.Failed;
                        _logger.LogError(ex, "Rollback execution failed at statement {StatementNumber}", i + 1);
                        // For rollbacks, we might want to continue with remaining statements
                        // rather than stopping completely
                        if (!IsCriticalError(ex))
                        {
                            result.Warnings.Add($"Non-critical error in rollback: {errorMessage}");
                            continue;
                        }
                        await transaction.RollbackAsync(cancellationToken);
                        result.ExecutionTime = DateTime.UtcNow - startTime;
                        return result;
                    }
                }
                // Final commit for rollback
                await transaction.CommitAsync(cancellationToken);
                result.Status = MigrationStatus.RolledBack;
                result.ExecutionTime = DateTime.UtcNow - startTime;
                _logger.LogInformation("Rollback execution completed successfully: {OperationsExecuted} operations in {ExecutionTime}",
                    result.OperationsExecuted, result.ExecutionTime);
                return result;
            }
            catch (Exception ex)
            {
                result.Status = MigrationStatus.Failed;
                result.Errors.Add($"Rollback transaction failed: {ex.Message}");
                _logger.LogError(ex, "Rollback transaction failed");
                try
                {
                    await transaction.RollbackAsync(cancellationToken);
                }
                catch (Exception rollbackEx)
                {
                    _logger.LogError(rollbackEx, "Failed to rollback failed rollback transaction");
                }
                result.ExecutionTime = DateTime.UtcNow - startTime;
                return result;
            }
        }
        catch (Exception ex)
        {
            result.Status = MigrationStatus.Failed;
            result.Errors.Add($"Rollback connection failed: {ex.Message}");
            result.ExecutionTime = DateTime.UtcNow - startTime;
            _logger.LogError(ex, "Rollback execution failed due to connection error");
            return result;
        }
    }
    private List<string> ParseSqlStatements(string sqlScript)
    {
        var statements = new List<string>();
        var currentStatement = new StringBuilder();
        var inString = false;
        var stringChar = '\0';
        var i = 0;
        while (i < sqlScript.Length)
        {
            var c = sqlScript[i];
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
        // Determine if an error should stop the rollback process
        var errorMessage = ex.Message.ToLowerInvariant();
        // Connection errors are critical
        if (errorMessage.Contains("connection") || errorMessage.Contains("network"))
            return true;
        // Permission errors are critical
        if (errorMessage.Contains("permission") || errorMessage.Contains("access denied"))
            return true;
        // Other errors might be non-critical (e.g., trying to drop non-existent objects)
        return false;
    }
    public async Task<Core.Models.MigrationPreview> PreviewMigrationAsync(
        MigrationScript migration,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var sqlStatements = ParseSqlStatements(migration.SqlScript);
            var preview = new Core.Models.MigrationPreview
            {
                MigrationId = migration.Id,
                TotalStatements = sqlStatements.Count,
                EstimatedExecutionTime = TimeSpan.FromSeconds(sqlStatements.Count * 0.1), // Rough estimate
                RiskLevel = AssessRiskLevel(migration),
                Warnings = await AnalyzeMigrationRisksAsync(migration, cancellationToken),
                StatementPreview = sqlStatements.Take(5).ToList() // First 5 statements
            };
            _logger.LogInformation("Migration preview generated: {TotalStatements} statements, risk level: {RiskLevel}",
                preview.TotalStatements, preview.RiskLevel);
            return preview;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to generate migration preview");
            throw;
        }
    }
    private MigrationRiskLevel AssessRiskLevel(MigrationScript migration)
    {
        var destructiveOperations = new[] { "DROP", "TRUNCATE", "DELETE", "ALTER TABLE" };
        var highRiskOperations = new[] { "DROP TABLE", "DROP SCHEMA", "TRUNCATE" };
        var scriptUpper = migration.SqlScript.ToUpperInvariant();
        if (highRiskOperations.Any(op => scriptUpper.Contains(op)))
            return MigrationRiskLevel.High;
        if (destructiveOperations.Any(op => scriptUpper.Contains(op)))
            return MigrationRiskLevel.Medium;
        return MigrationRiskLevel.Low;
    }
    private Task<List<string>> AnalyzeMigrationRisksAsync(
        MigrationScript migration,
        CancellationToken cancellationToken)
    {
        var risks = new List<string>();
        try
        {
            var scriptUpper = migration.SqlScript.ToUpperInvariant();
            // Check for destructive operations
            if (scriptUpper.Contains("DROP TABLE"))
                risks.Add("Contains DROP TABLE operations - data loss possible");
            if (scriptUpper.Contains("TRUNCATE"))
                risks.Add("Contains TRUNCATE operations - data will be lost");
            if (scriptUpper.Contains("DROP SCHEMA"))
                risks.Add("Contains DROP SCHEMA operations - multiple objects will be affected");
            if (scriptUpper.Contains("ALTER TABLE"))
                risks.Add("Contains ALTER TABLE operations - schema changes may affect applications");
            // Check for large operations
            var statementCount = ParseSqlStatements(migration.SqlScript).Count;
            if (statementCount > 100)
                risks.Add($"Large migration with {statementCount} statements - consider breaking into smaller batches");
            // Check for rollback availability
            if (string.IsNullOrEmpty(migration.RollbackScript))
                risks.Add("No rollback script available - migration cannot be easily reversed");
        }
        catch (Exception ex)
        {
            risks.Add($"Risk analysis failed: {ex.Message}");
        }
        return Task.FromResult(risks);
    }
}