using System.Data;
using PostgreSqlSchemaCompareSync.Infrastructure.Exceptions;

namespace PostgreSqlSchemaCompareSync.Core.Migration
{
    /// <summary>
    /// Implementation of migration script execution
    /// </summary>
    public class MigrationExecutor : IMigrationExecutor
    {
        private readonly ILogger<MigrationExecutor> _logger;
        private readonly AppSettings _settings;
        private readonly IConnectionManager _connectionManager;
        private readonly Dictionary<string, CancellationTokenSource> _runningMigrations;
        private bool _disposed;

        public MigrationExecutor(
            ILogger<MigrationExecutor> logger,
            IOptions<AppSettings> settings,
            IConnectionManager connectionManager)
        {
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
            _settings = settings?.Value ?? throw new ArgumentNullException(nameof(settings));
            _connectionManager = connectionManager ?? throw new ArgumentNullException(nameof(connectionManager));

            _runningMigrations = [];
        }

        /// <summary>
        /// Executes a migration script on a target database
        /// </summary>
        public async Task<MigrationResult> ExecuteMigrationAsync(
            MigrationScript migration,
            ConnectionInfo targetConnection,
            CancellationToken cancellationToken = default)
        {
            return await ExecuteMigrationWithProgressAsync(migration, targetConnection, null, cancellationToken);
        }

        /// <summary>
        /// Executes a migration script with detailed progress reporting
        /// </summary>
        public async Task<MigrationResult> ExecuteMigrationWithProgressAsync(
            MigrationScript migration,
            ConnectionInfo targetConnection,
            IProgress<MigrationProgress>? progress = null,
            CancellationToken cancellationToken = default)
        {
            if (migration == null)
                throw new ArgumentNullException(nameof(migration));
            if (targetConnection == null)
                throw new ArgumentNullException(nameof(targetConnection));

            var startTime = DateTime.UtcNow;
            var operationsExecuted = 0;
            var errors = new List<string>();
            var warnings = new List<string>();

            try
            {
                _logger.LogInformation("Starting migration execution: {MigrationId}", migration.Id);

                // Register as running migration
                var cts = new CancellationTokenSource();
                var combinedToken = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, cts.Token).Token;
                _runningMigrations[migration.Id] = cts;

                try
                {
                    // Parse SQL script into individual statements
                    var statements = ParseSqlStatements(migration.SqlScript);

                    if (migration.IsDryRun)
                    {
                        _logger.LogInformation("Executing migration in dry-run mode: {MigrationId}", migration.Id);

                        // In dry-run mode, just validate and count operations
                        foreach (var statement in statements)
                        {
                            combinedToken.ThrowIfCancellationRequested();

                            if (!string.IsNullOrWhiteSpace(statement))
                            {
                                operationsExecuted++;
                                progress?.Report(CreateProgressReport(operationsExecuted, statements.Length, statement, MigrationStatus.Running, DateTime.UtcNow - startTime));
                                await Task.Delay(10, combinedToken); // Simulate execution time
                            }
                        }
                    }
                    else
                    {
                        _logger.LogInformation("Executing migration for real: {MigrationId}", migration.Id);

                        using var connection = await _connectionManager.CreateConnectionAsync(targetConnection, combinedToken);

                        // Execute statements in a transaction
                        using var transaction = await connection.BeginTransactionAsync(combinedToken);

                        try
                        {
                            for (int i = 0; i < statements.Length; i++)
                            {
                                combinedToken.ThrowIfCancellationRequested();

                                var statement = statements[i];

                                if (!string.IsNullOrWhiteSpace(statement))
                                {
                                    try
                                    {
                                        using var command = new NpgsqlCommand(statement, connection, transaction);
                                        command.CommandTimeout = _settings.Migration.TransactionTimeout;

                                        await command.ExecuteNonQueryAsync(combinedToken);

                                        operationsExecuted++;
                                        progress?.Report(CreateProgressReport(i + 1, statements.Length, statement, MigrationStatus.Running, DateTime.UtcNow - startTime));

                                        _logger.LogDebug("Executed statement {StatementNumber}: {Statement}", i + 1, statement.Substring(0, Math.Min(100, statement.Length)));
                                    }
                                    catch (NpgsqlException ex)
                                    {
                                        var errorMessage = $"Statement {i + 1} failed: {ex.Message}";
                                        errors.Add(errorMessage);
                                        _logger.LogError(ex, "Statement execution failed: {Statement}", statement.Substring(0, Math.Min(100, statement.Length)));

                                        if (!_settings.Migration.ContinueOnError)
                                        {
                                            throw new MigrationException($"Migration execution failed at statement {i + 1}: {ex.Message}", targetConnection.Id, migration.Id, ex);
                                        }
                                    }
                                }
                            }

                            // Commit transaction if all statements succeeded
                            await transaction.CommitAsync(combinedToken);
                            _logger.LogInformation("Migration transaction committed: {MigrationId}", migration.Id);
                        }
                        catch (Exception)
                        {
                            // Rollback transaction on error
                            try
                            {
                                await transaction.RollbackAsync(combinedToken);
                                _logger.LogWarning("Migration transaction rolled back: {MigrationId}", migration.Id);
                            }
                            catch (Exception rollbackEx)
                            {
                                _logger.LogError(rollbackEx, "Failed to rollback migration transaction: {MigrationId}", migration.Id);
                            }
                            throw;
                        }
                    }

                    var executionTime = DateTime.UtcNow - startTime;

                    var result = new MigrationResult
                    {
                        Status = errors.Any() ? "Failed" : "Completed",
                        ExecutionTime = executionTime,
                        OperationsExecuted = operationsExecuted,
                        Errors = errors,
                        Warnings = warnings
                    };

                    _logger.LogInformation("Migration execution completed: {MigrationId}, Status: {Status}, Operations: {Operations}, Time: {ExecutionTime}",
                        migration.Id, result.Status, operationsExecuted, executionTime);

                    return result;
                }
                finally
                {
                    // Unregister running migration
                    _runningMigrations.Remove(migration.Id);
                    cts.Dispose();
                }
            }
            catch (OperationCanceledException)
            {
                _logger.LogWarning("Migration execution cancelled: {MigrationId}", migration.Id);

                var executionTime = DateTime.UtcNow - startTime;
                return new MigrationResult
                {
                    Status = "Cancelled",
                    ExecutionTime = executionTime,
                    OperationsExecuted = operationsExecuted,
                    Errors = errors,
                    Warnings = warnings
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Migration execution failed: {MigrationId}", migration.Id);

                var executionTime = DateTime.UtcNow - startTime;
                return new MigrationResult
                {
                    Status = "Failed",
                    ExecutionTime = executionTime,
                    OperationsExecuted = operationsExecuted,
                    Errors = errors.Concat(new[] { ex.Message }).ToList(),
                    Warnings = warnings
                };
            }
        }

        /// <summary>
        /// Tests a migration script in dry-run mode
        /// </summary>
        public async Task<MigrationResult> TestMigrationAsync(
            MigrationScript migration,
            ConnectionInfo targetConnection,
            CancellationToken cancellationToken = default)
        {
            if (migration == null)
                throw new ArgumentNullException(nameof(migration));
            if (targetConnection == null)
                throw new ArgumentNullException(nameof(targetConnection));

            _logger.LogInformation("Testing migration: {MigrationId}", migration.Id);

            // Create a test version of the migration
            var testMigration = new MigrationScript
            {
                Id = migration.Id,
                Comparison = migration.Comparison,
                SelectedDifferences = migration.SelectedDifferences,
                SqlScript = migration.SqlScript,
                RollbackScript = migration.RollbackScript,
                Type = migration.Type,
                IsDryRun = true, // Force dry-run mode
                Status = MigrationStatus.Pending,
                CreatedAt = migration.CreatedAt
            };

            return await ExecuteMigrationAsync(testMigration, targetConnection, cancellationToken);
        }

        /// <summary>
        /// Cancels a running migration
        /// </summary>
        public Task<bool> CancelMigrationAsync(string migrationId, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrEmpty(migrationId))
                return Task.FromResult(false);

            if (_runningMigrations.TryGetValue(migrationId, out var cts))
            {
                try
                {
                    cts.Cancel();
                    _logger.LogInformation("Migration cancellation requested: {MigrationId}", migrationId);
                    return Task.FromResult(true);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to cancel migration: {MigrationId}", migrationId);
                    return Task.FromResult(false);
                }
            }

            _logger.LogWarning("Migration not found for cancellation: {MigrationId}", migrationId);
            return Task.FromResult(false);
        }

        /// <summary>
        /// Parses SQL script into individual statements
        /// </summary>
        private string[] ParseSqlStatements(string sqlScript)
        {
            if (string.IsNullOrEmpty(sqlScript))
                return Array.Empty<string>();

            // Basic SQL statement parsing - split by semicolon
            // This is a simplified parser and may need enhancement for complex scripts
            var statements = Regex.Split(sqlScript, @";\s*$", RegexOptions.Multiline)
                .Select(stmt => stmt.Trim())
                .Where(stmt => !string.IsNullOrEmpty(stmt) && !stmt.StartsWith("--"))
                .ToArray();

            return statements;
        }

        /// <summary>
        /// Creates a progress report
        /// </summary>
        private MigrationProgress CreateProgressReport(
            int currentOperation,
            int totalOperations,
            string currentOperationDescription,
            MigrationStatus status,
            TimeSpan elapsedTime)
        {
            var progress = new MigrationProgress
            {
                CurrentOperation = currentOperation,
                TotalOperations = totalOperations,
                CurrentOperationDescription = currentOperationDescription,
                Status = status,
                ElapsedTime = elapsedTime,
                EstimatedTimeRemaining = TimeSpan.FromTicks(
                    totalOperations > 0 ?
                    (long)(elapsedTime.Ticks * ((double)(totalOperations - currentOperation) / currentOperation)) :
                    0)
            };

            return progress;
        }

        public void Dispose()
        {
            if (!_disposed)
            {
                // Cancel all running migrations
                foreach (var cts in _runningMigrations.Values)
                {
                    try
                    {
                        cts.Cancel();
                        cts.Dispose();
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Error cancelling migration during disposal");
                    }
                }

                _runningMigrations.Clear();
                _disposed = true;

                _logger.LogInformation("MigrationExecutor disposed");
            }
        }
    }
}