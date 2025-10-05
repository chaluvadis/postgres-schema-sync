namespace PostgreSqlSchemaCompareSync.Infrastructure.Monitoring
{
    /// <summary>
    /// Performance monitoring for PostgreSQL Schema Compare & Sync
    /// </summary>
    public class PerformanceMonitor : IDisposable
    {
        private readonly ILogger<PerformanceMonitor> _logger;
        private readonly AppSettings _settings;
        private readonly ConcurrentDictionary<string, PerformanceMetric> _metrics;
        private readonly ConcurrentDictionary<string, Stopwatch> _activeOperations;
        private readonly Timer _reportingTimer;
        private bool _disposed;

        public PerformanceMonitor(
            ILogger<PerformanceMonitor> logger,
            IOptions<AppSettings> settings)
        {
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
            _settings = settings?.Value ?? throw new ArgumentNullException(nameof(settings));

            _metrics = new ConcurrentDictionary<string, PerformanceMetric>();
            _activeOperations = new ConcurrentDictionary<string, Stopwatch>();

            // Setup reporting timer (every 60 seconds)
            _reportingTimer = new Timer(GeneratePerformanceReport, null, TimeSpan.FromSeconds(60), TimeSpan.FromSeconds(60));
        }

        /// <summary>
        /// Starts monitoring an operation
        /// </summary>
        public void StartOperation(string operationId, string operationName, Dictionary<string, object>? metadata = null)
        {
            if (string.IsNullOrEmpty(operationId))
                throw new ArgumentNullException(nameof(operationId));

            var stopwatch = Stopwatch.StartNew();
            _activeOperations[operationId] = stopwatch;

            _logger.LogDebug("Started monitoring operation {OperationName} with ID {OperationId}", operationName, operationId);
        }

        /// <summary>
        /// Stops monitoring an operation and records the metric
        /// </summary>
        public void EndOperation(string operationId, string operationName, Dictionary<string, object>? metadata = null)
        {
            if (string.IsNullOrEmpty(operationId))
                throw new ArgumentNullException(nameof(operationId));

            if (_activeOperations.TryRemove(operationId, out var stopwatch))
            {
                stopwatch.Stop();
                var duration = stopwatch.Elapsed;

                var metric = new PerformanceMetric
                {
                    OperationName = operationName,
                    Duration = duration,
                    Timestamp = DateTime.UtcNow,
                    Metadata = metadata ?? []
                };

                var key = $"{operationName}_{DateTime.UtcNow:yyyyMMddHHmmss}_{Guid.NewGuid().ToString().Substring(0, 8)}";
                _metrics[key] = metric;

                _logger.LogDebug("Ended monitoring operation {OperationName} with ID {OperationId}. Duration: {Duration}ms",
                    operationName, operationId, duration.TotalMilliseconds);
            }
            else
            {
                _logger.LogWarning("Attempted to end operation {OperationId} that was not being monitored", operationId);
            }
        }

        /// <summary>
        /// Records a custom performance metric
        /// </summary>
        public void RecordMetric(string metricName, double value, string unit, Dictionary<string, object>? dimensions = null)
        {
            var metric = new PerformanceMetric
            {
                OperationName = metricName,
                Duration = TimeSpan.FromMilliseconds(value),
                Timestamp = DateTime.UtcNow,
                Metadata = dimensions ?? [],
                Unit = unit
            };

            var key = $"{metricName}_{DateTime.UtcNow:yyyyMMddHHmmss}_{Guid.NewGuid().ToString().Substring(0, 8)}";
            _metrics[key] = metric;

            _logger.LogDebug("Recorded custom metric {MetricName}: {Value}{Unit}", metricName, value, unit);
        }

        /// <summary>
        /// Gets performance metrics for a specific operation
        /// </summary>
        public List<PerformanceMetric> GetMetrics(string operationName, TimeSpan? timeRange = null)
        {
            var query = _metrics.Values.Where(m => m.OperationName == operationName);

            if (timeRange.HasValue)
            {
                var cutoffTime = DateTime.UtcNow - timeRange.Value;
                query = query.Where(m => m.Timestamp >= cutoffTime);
            }

            return query.OrderByDescending(m => m.Timestamp).ToList();
        }

        /// <summary>
        /// Gets performance statistics for an operation
        /// </summary>
        public PerformanceStatistics GetStatistics(string operationName, TimeSpan? timeRange = null)
        {
            var metrics = GetMetrics(operationName, timeRange);

            if (!metrics.Any())
            {
                return new PerformanceStatistics
                {
                    OperationName = operationName,
                    SampleCount = 0,
                    AverageDuration = TimeSpan.Zero,
                    MinDuration = TimeSpan.Zero,
                    MaxDuration = TimeSpan.Zero
                };
            }

            var durations = metrics.Select(m => m.Duration.TotalMilliseconds).ToList();

            return new PerformanceStatistics
            {
                OperationName = operationName,
                SampleCount = metrics.Count,
                AverageDuration = TimeSpan.FromMilliseconds(durations.Average()),
                MinDuration = TimeSpan.FromMilliseconds(durations.Min()),
                MaxDuration = TimeSpan.FromMilliseconds(durations.Max()),
                P95Duration = TimeSpan.FromMilliseconds(Percentile(durations, 0.95)),
                P99Duration = TimeSpan.FromMilliseconds(Percentile(durations, 0.99)),
                TotalDuration = TimeSpan.FromMilliseconds(durations.Sum())
            };
        }

        /// <summary>
        /// Gets all active operations
        /// </summary>
        public IReadOnlyDictionary<string, TimeSpan> GetActiveOperations()
        {
            return _activeOperations.ToDictionary(
                kvp => kvp.Key,
                kvp => kvp.Value.Elapsed);
        }

        /// <summary>
        /// Clears old performance metrics
        /// </summary>
        public void ClearOldMetrics(TimeSpan retentionPeriod)
        {
            var cutoffTime = DateTime.UtcNow - retentionPeriod;
            var keysToRemove = _metrics.Where(kvp => kvp.Value.Timestamp < cutoffTime).Select(kvp => kvp.Key).ToList();

            foreach (var key in keysToRemove)
            {
                _metrics.TryRemove(key, out _);
            }

            _logger.LogInformation("Cleared {MetricCount} old performance metrics", keysToRemove.Count);
        }

        /// <summary>
        /// Generates a performance report
        /// </summary>
        private void GeneratePerformanceReport(object? state)
        {
            try
            {
                var report = GenerateReport();
                _logger.LogInformation("Performance Report:\n{Report}", report);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error generating performance report");
            }
        }

        /// <summary>
        /// Generates a detailed performance report
        /// </summary>
        public string GenerateReport()
        {
            var report = new System.Text.StringBuilder();
            report.AppendLine("=== PostgreSQL Schema Compare & Sync Performance Report ===");
            report.AppendLine($"Generated at: {DateTime.UtcNow}");
            report.AppendLine($"Total metrics collected: {_metrics.Count}");
            report.AppendLine($"Active operations: {_activeOperations.Count}");
            report.AppendLine();

            // Group metrics by operation
            var operationGroups = _metrics.Values.GroupBy(m => m.OperationName);

            foreach (var group in operationGroups)
            {
                var stats = GetStatistics(group.Key, TimeSpan.FromHours(1)); // Last hour
                report.AppendLine($"Operation: {group.Key}");
                report.AppendLine($"  Samples: {stats.SampleCount}");
                report.AppendLine($"  Average: {stats.AverageDuration.TotalMilliseconds:F2}ms");
                report.AppendLine($"  Min: {stats.MinDuration.TotalMilliseconds:F2}ms");
                report.AppendLine($"  Max: {stats.MaxDuration.TotalMilliseconds:F2}ms");
                report.AppendLine($"  P95: {stats.P95Duration.TotalMilliseconds:F2}ms");
                report.AppendLine($"  P99: {stats.P99Duration.TotalMilliseconds:F2}ms");
                report.AppendLine();
            }

            return report.ToString();
        }

        /// <summary>
        /// Calculates percentile from a list of values
        /// </summary>
        private double Percentile(List<double> values, double percentile)
        {
            if (!values.Any())
                return 0;

            var sortedValues = values.OrderBy(v => v).ToList();
            var index = (percentile / 100) * (sortedValues.Count - 1);

            if (index < 0)
                return sortedValues.First();
            if (index >= sortedValues.Count - 1)
                return sortedValues.Last();

            var lowerIndex = (int)Math.Floor(index);
            var upperIndex = (int)Math.Ceiling(index);

            if (lowerIndex == upperIndex)
                return sortedValues[lowerIndex];

            var weight = index - lowerIndex;
            return sortedValues[lowerIndex] * (1 - weight) + sortedValues[upperIndex] * weight;
        }

        public void Dispose()
        {
            if (!_disposed)
            {
                _reportingTimer.Dispose();
                _metrics.Clear();
                _activeOperations.Clear();
                _disposed = true;

                _logger.LogInformation("PerformanceMonitor disposed");
            }
        }
    }

    /// <summary>
    /// Performance metric information
    /// </summary>
    public class PerformanceMetric
    {
        public string OperationName { get; set; } = string.Empty;
        public TimeSpan Duration { get; set; }
        public DateTime Timestamp { get; set; }
        public Dictionary<string, object> Metadata { get; set; } = [];
        public string? Unit { get; set; }
    }

    /// <summary>
    /// Performance statistics summary
    /// </summary>
    public class PerformanceStatistics
    {
        public string OperationName { get; set; } = string.Empty;
        public int SampleCount { get; set; }
        public TimeSpan AverageDuration { get; set; }
        public TimeSpan MinDuration { get; set; }
        public TimeSpan MaxDuration { get; set; }
        public TimeSpan P95Duration { get; set; }
        public TimeSpan P99Duration { get; set; }
        public TimeSpan TotalDuration { get; set; }
    }
}