namespace PostgreSqlSchemaCompareSync.Core.Connection.Health
{
    /// <summary>
    /// Monitors the health of database connections
    /// </summary>
    public class ConnectionHealthMonitor : IDisposable
    {
        private readonly ILogger<ConnectionHealthMonitor> _logger;
        private readonly AppSettings _settings;
        private readonly IConnectionManager _connectionManager;
        private readonly ConcurrentDictionary<string, ConnectionHealthStatus> _healthStatuses;
        private readonly Timer _healthCheckTimer;
        private readonly SemaphoreSlim _operationLock;
        private bool _disposed;
        public event EventHandler<ConnectionHealthChangedEventArgs>? HealthChanged;
        public ConnectionHealthMonitor(
            ILogger<ConnectionHealthMonitor> logger,
            IOptions<AppSettings> settings,
            IConnectionManager connectionManager)
        {
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
            _settings = settings?.Value ?? throw new ArgumentNullException(nameof(settings));
            _connectionManager = connectionManager ?? throw new ArgumentNullException(nameof(connectionManager));
            _healthStatuses = new ConcurrentDictionary<string, ConnectionHealthStatus>();
            _operationLock = new SemaphoreSlim(1, 1);
            // Setup health check timer (every 30 seconds)
            _healthCheckTimer = new Timer(30000);
            _healthCheckTimer.Elapsed += OnHealthCheckTimerElapsed;
            _healthCheckTimer.AutoReset = true;
        }
        /// <summary>
        /// Starts monitoring connection health
        /// </summary>
        public void StartMonitoring()
        {
            if (_disposed)
                throw new ObjectDisposedException(nameof(ConnectionHealthMonitor));
            _healthCheckTimer.Start();
            _logger.LogInformation("Connection health monitoring started");
        }
        /// <summary>
        /// Stops monitoring connection health
        /// </summary>
        public void StopMonitoring()
        {
            if (_disposed)
                return;
            _healthCheckTimer.Stop();
            _logger.LogInformation("Connection health monitoring stopped");
        }
        /// <summary>
        /// Registers a connection for health monitoring
        /// </summary>
        public async Task RegisterConnectionAsync(ConnectionInfo connectionInfo)
        {
            if (connectionInfo == null)
                throw new ArgumentNullException(nameof(connectionInfo));
            await _operationLock.WaitAsync();
            try
            {
                var healthStatus = await _connectionManager.GetConnectionHealthAsync(connectionInfo);
                _healthStatuses[connectionInfo.Id] = healthStatus;
                _logger.LogInformation("Connection {ConnectionName} registered for health monitoring",
                    connectionInfo.Name);
            }
            finally
            {
                _operationLock.Release();
            }
        }
        /// <summary>
        /// Unregisters a connection from health monitoring
        /// </summary>
        public void UnregisterConnection(string connectionId)
        {
            if (string.IsNullOrEmpty(connectionId))
                return;
            if (_healthStatuses.TryRemove(connectionId, out _))
            {
                _logger.LogInformation("Connection {ConnectionId} unregistered from health monitoring", connectionId);
            }
        }
        /// <summary>
        /// Gets the current health status of a connection
        /// </summary>
        public ConnectionHealthStatus? GetConnectionHealth(string connectionId)
        {
            if (string.IsNullOrEmpty(connectionId))
                return null;
            return _healthStatuses.TryGetValue(connectionId, out var status) ? status : null;
        }
        /// <summary>
        /// Gets health status for all monitored connections
        /// </summary>
        public IReadOnlyDictionary<string, ConnectionHealthStatus> GetAllHealthStatuses()
        {
            return _healthStatuses.ToDictionary(kvp => kvp.Key, kvp => kvp.Value);
        }
        /// <summary>
        /// Manually triggers a health check for a specific connection
        /// </summary>
        public async Task<ConnectionHealthStatus> CheckConnectionHealthAsync(ConnectionInfo connectionInfo)
        {
            if (connectionInfo == null)
                throw new ArgumentNullException(nameof(connectionInfo));
            var healthStatus = await _connectionManager.GetConnectionHealthAsync(connectionInfo);
            var previousStatus = _healthStatuses.AddOrUpdate(
                connectionInfo.Id,
                healthStatus,
                (_, _) => healthStatus);
            // Check if health status changed
            if (previousStatus.IsHealthy != healthStatus.IsHealthy)
            {
                OnHealthChanged(connectionInfo, previousStatus, healthStatus);
            }
            return healthStatus;
        }
        /// <summary>
        /// Timer elapsed event handler for periodic health checks
        /// </summary>
        private async void OnHealthCheckTimerElapsed(object? sender, ElapsedEventArgs e)
        {
            try
            {
                await PerformPeriodicHealthChecksAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during periodic health check");
            }
        }
        /// <summary>
        /// Performs health checks for all registered connections
        /// </summary>
        private Task PerformPeriodicHealthChecksAsync()
        {
            var connectionIds = _healthStatuses.Keys.ToList();
            foreach (var connectionId in connectionIds)
            {
                try
                {
                    // We would need a way to get ConnectionInfo from connectionId
                    // For now, we'll skip the actual health check in the timer
                    // This would need to be implemented with a proper connection registry
                    _logger.LogDebug("Periodic health check for connection {ConnectionId}", connectionId);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error checking health for connection {ConnectionId}", connectionId);
                }
            }
            return Task.CompletedTask;
        }
        /// <summary>
        /// Called when connection health status changes
        /// </summary>
        private void OnHealthChanged(ConnectionInfo connectionInfo, ConnectionHealthStatus oldStatus, ConnectionHealthStatus newStatus)
        {
            try
            {
                var eventArgs = new ConnectionHealthChangedEventArgs
                {
                    ConnectionInfo = connectionInfo,
                    OldStatus = oldStatus,
                    NewStatus = newStatus,
                    ChangedAt = DateTime.UtcNow
                };
                HealthChanged?.Invoke(this, eventArgs);
                _logger.LogInformation(
                    "Connection {ConnectionName} health changed: {OldStatus} -> {NewStatus}",
                    connectionInfo.Name, oldStatus.IsHealthy, newStatus.IsHealthy);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling health status change for {ConnectionName}", connectionInfo.Name);
            }
        }
        public void Dispose()
        {
            if (!_disposed)
            {
                StopMonitoring();
                _healthCheckTimer.Dispose();
                _operationLock.Dispose();
                _healthStatuses.Clear();
                _disposed = true;
                _logger.LogInformation("ConnectionHealthMonitor disposed");
            }
        }
    }
    /// <summary>
    /// Event arguments for connection health changes
    /// </summary>
    public class ConnectionHealthChangedEventArgs : EventArgs
    {
        public ConnectionInfo ConnectionInfo { get; set; } = new ConnectionInfo();
        public ConnectionHealthStatus OldStatus { get; set; } = new ConnectionHealthStatus();
        public ConnectionHealthStatus NewStatus { get; set; } = new ConnectionHealthStatus();
        public DateTime ChangedAt { get; set; }
    }
}