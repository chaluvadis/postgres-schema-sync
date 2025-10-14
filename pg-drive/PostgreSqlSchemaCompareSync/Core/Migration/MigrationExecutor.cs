namespace PostgreSqlSchemaCompareSync.Core.Migration;

public class MigrationExecutor(
    ILogger<MigrationExecutor> logger,
    IOptions<AppSettings> settings,
    IConnectionManager connectionManager) : IMigrationExecutor
{
    private readonly ILogger<MigrationExecutor> _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    private readonly AppSettings _settings = settings?.Value ?? throw new ArgumentNullException(nameof(settings));
    private readonly IConnectionManager _connectionManager = connectionManager ?? throw new ArgumentNullException(nameof(connectionManager));
    private readonly Dictionary<string, CancellationTokenSource> _runningMigrations = [];
    private bool _disposed;
    public async Task<MigrationResult> ExecuteMigrationAsync(
        MigrationScript migration,
        ConnectionInfo targetConnection,
        CancellationToken cancellationToken = default)
    {
        return await ExecuteMigrationWithProgressAsync(migration, targetConnection, null, cancellationToken);
    }
    public async Task<MigrationResult> ExecuteMigrationWithProgressAsync(
        MigrationScript migration,
        ConnectionInfo targetConnection,
        IProgress<MigrationProgress>? progress = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(migration);
        ArgumentNullException.ThrowIfNull(targetConnection);
        var startTime = DateTime.UtcNow;
        var operationsExecuted = 0;
        var errors = new List<string>();
        var warnings = new List<string>();
        try
        {
            _logger.LogInformation("Starting migration execution: {MigrationId}", migration.Id);

            // Pre-execution validation and security checks
            var validationResult = await ValidateMigrationExecutionAsync(migration, targetConnection, cancellationToken);
            if (!validationResult.IsValid)
            {
                _logger.LogError("Migration validation failed: {ValidationErrors}", string.Join(", ", validationResult.Errors));
                return new MigrationResult
                {
                    Status = "ValidationFailed",
                    ExecutionTime = DateTime.UtcNow - startTime,
                    OperationsExecuted = 0,
                    Errors = validationResult.Errors,
                    Warnings = validationResult.Warnings
                };
            }

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
                                    var errorCategory = CategorizeDatabaseError(ex);
                                    var errorMessage = $"Statement {i + 1} failed ({errorCategory}): {ex.Message}";
                                    errors.Add(errorMessage);

                                    _logger.LogError(ex, "Statement execution failed: {Statement}", statement.Substring(0, Math.Min(100, statement.Length)));

                                    if (!_settings.Migration.ContinueOnError)
                                    {
                                        throw new MigrationException(
                                            $"Migration execution failed at statement {i + 1}: {ex.Message}",
                                            targetConnection.Id,
                                            migration.Id,
                                            ex);
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
                    Status = errors.Count != 0 ? "Failed" : "Completed",
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
    public async Task<MigrationResult> TestMigrationAsync(
        MigrationScript migration,
        ConnectionInfo targetConnection,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(migration);
        ArgumentNullException.ThrowIfNull(targetConnection);
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
    public async Task<bool> CancelMigrationAsync(string migrationId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(migrationId))
            return false;

        if (_runningMigrations.TryGetValue(migrationId, out var cts))
        {
            try
            {
                // Use cancellation token if provided, otherwise cancel immediately
                if (cancellationToken.IsCancellationRequested)
                {
                    cts.Cancel();
                    _logger.LogInformation("Migration cancellation requested via token: {MigrationId}", migrationId);
                }
                else
                {
                    cts.Cancel();
                    _logger.LogInformation("Migration cancellation requested: {MigrationId}", migrationId);
                }
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to cancel migration: {MigrationId}", migrationId);
                return false;
            }
        }

        _logger.LogWarning("Migration not found for cancellation: {MigrationId}", migrationId);
        return false;
    }

    private async Task<(bool IsValid, List<string> Errors, List<string> Warnings)> ValidateMigrationExecutionAsync(
        MigrationScript migration,
        ConnectionInfo targetConnection,
        CancellationToken cancellationToken)
    {
        var errors = new List<string>();
        var warnings = new List<string>();

        try
        {
            // Business Rule 1: Validate migration script is not empty
            if (string.IsNullOrEmpty(migration.SqlScript))
            {
                errors.Add("Migration script is empty or null");
            }

            // Business Rule 2: Check for potentially dangerous operations
            if (migration.SqlScript.Contains("DROP DATABASE") || migration.SqlScript.Contains("DROP SYSTEM"))
            {
                errors.Add("Migration contains potentially dangerous DROP DATABASE or DROP SYSTEM operations");
            }

            // Business Rule 3: Validate connection info
            if (string.IsNullOrEmpty(targetConnection?.GetConnectionString()))
            {
                errors.Add("Target connection information is missing or invalid");
            }

            // Business Rule 4: Check migration size (using reasonable defaults)
            const int MaxScriptSize = 10 * 1024 * 1024; // 10MB limit
            if (migration.SqlScript.Length > MaxScriptSize)
            {
                errors.Add($"Migration script size ({migration.SqlScript.Length}) exceeds maximum allowed size ({MaxScriptSize})");
            }

            // Business Rule 5: Validate statement count
            var statements = ParseSqlStatements(migration.SqlScript);
            const int MaxStatementCount = 1000; // Reasonable limit
            if (statements.Length > MaxStatementCount)
            {
                errors.Add($"Migration contains too many statements ({statements.Length}) - maximum allowed: {MaxStatementCount}");
            }

            // Business Rule 6: Check for large transactions (warning only)
            if (statements.Length > 100)
            {
                warnings.Add($"Large migration detected ({statements.Length} statements) - consider breaking into smaller migrations");
            }

            // Business Rule 7: Validate critical object operations
            if (ContainsCriticalObjectOperations(migration.SqlScript))
            {
                warnings.Add("Migration contains operations on critical system objects - please review carefully");
            }

            // Business Rule 8: Check for concurrent migration conflicts
            if (_runningMigrations.ContainsKey(migration.Id))
            {
                errors.Add("Migration with the same ID is already running");
            }

            // Business Rule 9: Validate environment compatibility
            var environmentCheck = await ValidateEnvironmentCompatibilityAsync(targetConnection, cancellationToken);
            if (!environmentCheck.IsCompatible)
            {
                errors.AddRange(environmentCheck.Errors);
                warnings.AddRange(environmentCheck.Warnings);
            }

            _logger.LogInformation("Migration validation completed: {MigrationId}, Valid: {IsValid}, Errors: {ErrorCount}, Warnings: {WarningCount}",
                migration.Id, errors.Count == 0, errors.Count, warnings.Count);

            return (errors.Count == 0, errors, warnings);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during migration validation: {MigrationId}", migration.Id);
            errors.Add($"Validation error: {ex.Message}");
            return (false, errors, warnings);
        }
    }

    private static bool ContainsCriticalObjectOperations(string sqlScript)
    {
        var criticalPatterns = new[]
        {
            "DROP SCHEMA", "ALTER SCHEMA", "DROP USER", "ALTER USER",
            "DROP ROLE", "ALTER ROLE", "DROP TABLESPACE", "ALTER TABLESPACE"
        };

        return criticalPatterns.Any(pattern =>
            sqlScript.Contains(pattern, StringComparison.OrdinalIgnoreCase));
    }

    private async Task<(bool IsCompatible, List<string> Errors, List<string> Warnings)> ValidateEnvironmentCompatibilityAsync(
        ConnectionInfo connectionInfo,
        CancellationToken cancellationToken)
    {
        var errors = new List<string>();
        var warnings = new List<string>();

        try
        {
            using var connection = await _connectionManager.CreateConnectionAsync(connectionInfo, cancellationToken);

            // Check database version compatibility
            using var command = new NpgsqlCommand("SELECT version()", connection);
            var version = (await command.ExecuteScalarAsync(cancellationToken))?.ToString() ?? "";

            if (version.Contains("PostgreSQL 9.") || version.Contains("PostgreSQL 10."))
            {
                warnings.Add($"Database version may not support all migration features: {version}");
            }

            // Check if database is in recovery mode
            using var recoveryCommand = new NpgsqlCommand("SELECT pg_is_in_recovery()", connection);
            var isInRecovery = (bool)(await recoveryCommand.ExecuteScalarAsync(cancellationToken))!;

            if (isInRecovery)
            {
                errors.Add("Database is in recovery mode - migrations are not allowed");
            }

            // Check available disk space (basic check)
            using var spaceCommand = new NpgsqlCommand(@"
                SELECT
                    datname as database_name,
                    pg_database_size(datname) as size_bytes
                FROM pg_database
                WHERE datname = current_database()", connection);

            using var reader = await spaceCommand.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                var sizeBytes = reader.GetInt64(1);
                var sizeGB = sizeBytes / (1024.0 * 1024.0 * 1024.0);

                if (sizeGB > 100) // Warning for databases larger than 100GB
                {
                    warnings.Add($"Large database detected ({sizeGB:F1}GB) - migration may take significant time");
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error checking environment compatibility");
            errors.Add($"Environment compatibility check failed: {ex.Message}");
        }

        return (errors.Count == 0, errors, warnings);
    }

    private static string[] ParseSqlStatements(string sqlScript)
    {
        if (string.IsNullOrEmpty(sqlScript))
            return [];
        var statements = Regex.Split(sqlScript, @";\s*$", RegexOptions.Multiline)
            .Select(stmt => stmt.Trim())
            .Where(stmt => !string.IsNullOrEmpty(stmt) && !stmt.StartsWith("--"))
            .ToArray();
        return statements;
    }
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

    private static string CategorizeDatabaseError(NpgsqlException ex)
    {
        return ex.SqlState switch
        {
            "42P01" => "RelationDoesNotExist",           // relation does not exist
            "42P07" => "DuplicateTable",                 // duplicate table
            "23505" => "UniqueViolation",                // unique violation
            "23503" => "ForeignKeyViolation",            // foreign key violation
            "23502" => "NotNullViolation",               // not null violation
            "40P01" => "DeadlockDetected",               // deadlock detected
            "40001" => "SerializationFailure",           // serialization failure
            "08003" => "ConnectionDoesNotExist",         // connection does not exist
            "08006" => "ConnectionFailure",              // connection failure
            "08001" => "SqlClientUnableToEstablishConnection", // client unable to establish connection
            "28000" => "InvalidAuthorizationSpecification", // invalid authorization specification
            "42501" => "InsufficientPrivilege",          // insufficient privilege
            _ => "UnknownError"
        };
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