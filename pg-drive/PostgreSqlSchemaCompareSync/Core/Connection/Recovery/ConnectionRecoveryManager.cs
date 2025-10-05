namespace PostgreSqlSchemaCompareSync.Core.Connection.Recovery
{
    /// <summary>
    /// Manages automatic recovery of failed database connections
    /// </summary>
    public class ConnectionRecoveryManager : IDisposable
    {
        private readonly ILogger<ConnectionRecoveryManager> _logger;
        private readonly AppSettings _settings;
        private readonly IConnectionManager _connectionManager;
        private readonly List<ConnectionRecoveryAttempt> _recoveryAttempts;
        private readonly SemaphoreSlim _operationLock;
        private bool _disposed;
        public event EventHandler<ConnectionRecoveryEventArgs>? RecoveryAttempted;
        public event EventHandler<ConnectionRecoveryEventArgs>? RecoverySucceeded;
        public event EventHandler<ConnectionRecoveryEventArgs>? RecoveryFailed;
        public ConnectionRecoveryManager(
            ILogger<ConnectionRecoveryManager> logger,
            IOptions<AppSettings> settings,
            IConnectionManager connectionManager)
        {
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
            _settings = settings?.Value ?? throw new ArgumentNullException(nameof(settings));
            _connectionManager = connectionManager ?? throw new ArgumentNullException(nameof(connectionManager));
            _recoveryAttempts = [];
            _operationLock = new SemaphoreSlim(1, 1);
        }
        /// <summary>
        /// Attempts to recover a failed connection
        /// </summary>
        public async Task<bool> AttemptRecoveryAsync(
            ConnectionInfo connectionInfo,
            Exception lastException,
            CancellationToken cancellationToken = default)
        {
            if (connectionInfo == null)
                throw new ArgumentNullException(nameof(connectionInfo));
            await _operationLock.WaitAsync(cancellationToken);
            try
            {
                var recoveryAttempt = new ConnectionRecoveryAttempt
                {
                    ConnectionId = connectionInfo.Id,
                    ConnectionName = connectionInfo.Name,
                    AttemptedAt = DateTime.UtcNow,
                    LastException = lastException.Message,
                    AttemptNumber = GetNextAttemptNumber(connectionInfo.Id)
                };
                _recoveryAttempts.Add(recoveryAttempt);
                OnRecoveryAttempted(connectionInfo, recoveryAttempt);
                _logger.LogInformation(
                    "Attempting connection recovery for {ConnectionName}, attempt {AttemptNumber}",
                    connectionInfo.Name, recoveryAttempt.AttemptNumber);
                // Check if we've exceeded max retry attempts
                if (recoveryAttempt.AttemptNumber > _settings.Connection.ReconnectAttempts)
                {
                    var errorMessage = $"Maximum recovery attempts ({_settings.Connection.ReconnectAttempts}) exceeded for {connectionInfo.Name}";
                    recoveryAttempt.FailedAt = DateTime.UtcNow;
                    recoveryAttempt.ErrorMessage = errorMessage;
                    OnRecoveryFailed(connectionInfo, recoveryAttempt, new ConnectionException(errorMessage, connectionInfo.Id));
                    _logger.LogWarning("Connection recovery failed - max attempts exceeded for {ConnectionName}", connectionInfo.Name);
                    return false;
                }
                try
                {
                    // Wait before retry (exponential backoff)
                    var delay = _settings.Connection.ReconnectDelay * (int)Math.Pow(2, recoveryAttempt.AttemptNumber - 1);
                    await Task.Delay(delay, cancellationToken);
                    // Test the connection
                    var isHealthy = await _connectionManager.TestConnectionAsync(connectionInfo, cancellationToken);
                    if (isHealthy)
                    {
                        recoveryAttempt.SucceededAt = DateTime.UtcNow;
                        OnRecoverySucceeded(connectionInfo, recoveryAttempt);
                        _logger.LogInformation("Connection recovery successful for {ConnectionName}", connectionInfo.Name);
                        return true;
                    }
                    else
                    {
                        var errorMessage = $"Connection test failed during recovery attempt {recoveryAttempt.AttemptNumber}";
                        recoveryAttempt.FailedAt = DateTime.UtcNow;
                        recoveryAttempt.ErrorMessage = errorMessage;
                        OnRecoveryFailed(connectionInfo, recoveryAttempt, new ConnectionException(errorMessage, connectionInfo.Id));
                        _logger.LogWarning("Connection recovery attempt {AttemptNumber} failed for {ConnectionName}", recoveryAttempt.AttemptNumber, connectionInfo.Name);
                        return false;
                    }
                }
                catch (OperationCanceledException)
                {
                    _logger.LogWarning("Connection recovery cancelled for {ConnectionName}", connectionInfo.Name);
                    throw;
                }
                catch (Exception ex)
                {
                    recoveryAttempt.FailedAt = DateTime.UtcNow;
                    recoveryAttempt.ErrorMessage = ex.Message;
                    OnRecoveryFailed(connectionInfo, recoveryAttempt, ex);
                    _logger.LogError(ex, "Connection recovery attempt {AttemptNumber} failed for {ConnectionName}", recoveryAttempt.AttemptNumber, connectionInfo.Name);
                    return false;
                }
            }
            finally
            {
                _operationLock.Release();
            }
        }
        /// <summary>
        /// Gets recovery history for a connection
        /// </summary>
        public IReadOnlyList<ConnectionRecoveryAttempt> GetRecoveryHistory(string connectionId)
        {
            if (string.IsNullOrEmpty(connectionId))
                return new List<ConnectionRecoveryAttempt>();
            return _recoveryAttempts
                .Where(attempt => attempt.ConnectionId == connectionId)
                .OrderByDescending(attempt => attempt.AttemptedAt)
                .ToList();
        }
        /// <summary>
        /// Clears recovery history for a connection
        /// </summary>
        public void ClearRecoveryHistory(string connectionId)
        {
            if (string.IsNullOrEmpty(connectionId))
                return;
            _recoveryAttempts.RemoveAll(attempt => attempt.ConnectionId == connectionId);
            _logger.LogDebug("Cleared recovery history for connection {ConnectionId}", connectionId);
        }
        /// <summary>
        /// Gets the next attempt number for a connection
        /// </summary>
        private int GetNextAttemptNumber(string connectionId)
        {
            var attempts = _recoveryAttempts
                .Where(attempt => attempt.ConnectionId == connectionId)
                .ToList();
            return attempts.Count + 1;
        }
        /// <summary>
        /// Event handlers
        /// </summary>
        private void OnRecoveryAttempted(ConnectionInfo connectionInfo, ConnectionRecoveryAttempt attempt)
        {
            try
            {
                RecoveryAttempted?.Invoke(this, new ConnectionRecoveryEventArgs
                {
                    ConnectionInfo = connectionInfo,
                    RecoveryAttempt = attempt
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in RecoveryAttempted event handler");
            }
        }
        private void OnRecoverySucceeded(ConnectionInfo connectionInfo, ConnectionRecoveryAttempt attempt)
        {
            try
            {
                RecoverySucceeded?.Invoke(this, new ConnectionRecoveryEventArgs
                {
                    ConnectionInfo = connectionInfo,
                    RecoveryAttempt = attempt
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in RecoverySucceeded event handler");
            }
        }
        private void OnRecoveryFailed(ConnectionInfo connectionInfo, ConnectionRecoveryAttempt attempt, Exception exception)
        {
            try
            {
                RecoveryFailed?.Invoke(this, new ConnectionRecoveryEventArgs
                {
                    ConnectionInfo = connectionInfo,
                    RecoveryAttempt = attempt,
                    Exception = exception
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in RecoveryFailed event handler");
            }
        }
        public void Dispose()
        {
            if (!_disposed)
            {
                _operationLock.Dispose();
                _recoveryAttempts.Clear();
                _disposed = true;
                _logger.LogInformation("ConnectionRecoveryManager disposed");
            }
        }
    }
    /// <summary>
    /// Represents a single connection recovery attempt
    /// </summary>
    public class ConnectionRecoveryAttempt
    {
        public string ConnectionId { get; set; } = string.Empty;
        public string ConnectionName { get; set; } = string.Empty;
        public DateTime AttemptedAt { get; set; }
        public int AttemptNumber { get; set; }
        public string LastException { get; set; } = string.Empty;
        public DateTime? SucceededAt { get; set; }
        public DateTime? FailedAt { get; set; }
        public string? ErrorMessage { get; set; }
    }
    /// <summary>
    /// Event arguments for connection recovery events
    /// </summary>
    public class ConnectionRecoveryEventArgs : EventArgs
    {
        public ConnectionInfo ConnectionInfo { get; set; } = new ConnectionInfo();
        public ConnectionRecoveryAttempt RecoveryAttempt { get; set; } = new ConnectionRecoveryAttempt();
        public Exception? Exception { get; set; }
    }
}