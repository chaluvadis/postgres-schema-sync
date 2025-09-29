namespace PostgreSqlSchemaCompareSync.Infrastructure.Monitoring;
public class PerformanceMonitor : IDisposable
{
    private readonly ILogger<PerformanceMonitor> _logger;
    private readonly StructuredLogger _structuredLogger;
    private readonly ConcurrentDictionary<string, PerformanceMetric> _metrics;
    private readonly ConcurrentDictionary<string, Stopwatch> _activeOperations;
    private readonly Timer _reportingTimer;
    private bool _disposed;
    public PerformanceMonitor(
        ILogger<PerformanceMonitor> logger,
        StructuredLogger structuredLogger)
    {
        _logger = logger;
        _structuredLogger = structuredLogger;
        _metrics = new ConcurrentDictionary<string, PerformanceMetric>();
        _activeOperations = new ConcurrentDictionary<string, Stopwatch>();
        // Report performance metrics every 60 seconds
        _reportingTimer = new Timer(
            ReportPerformanceMetrics,
            null,
            TimeSpan.FromSeconds(60),
            TimeSpan.FromSeconds(60));
        _logger.LogInformation("Performance monitor initialized");
    }
    public IDisposable BeginOperation(string operationName, Dictionary<string, object>? context = null)
    {
        var operationId = Guid.NewGuid().ToString("N");
        var stopwatch = Stopwatch.StartNew();
        _activeOperations[operationId] = stopwatch;
        _structuredLogger.LogOperationStart(operationName, context);
        return new OperationScope(this, operationId, operationName, _structuredLogger);
    }
    public void EndOperation(string operationId, string operationName, bool success = true, Dictionary<string, object>? additionalMetrics = null)
    {
        if (_activeOperations.TryRemove(operationId, out var stopwatch))
        {
            stopwatch.Stop();
            var duration = stopwatch.Elapsed;
            // Record the metric
            var dimensions = new Dictionary<string, object>
            {
                ["Success"] = success
            };
            RecordMetric(operationName, duration.TotalMilliseconds, dimensions);
            // Log the completion
            _structuredLogger.LogOperationEnd(operationName, duration, success, additionalMetrics);
        }
    }
    public void RecordMetric(string metricName, double value, Dictionary<string, object>? dimensions = null)
    {
        var metric = _metrics.GetOrAdd(metricName, name => new PerformanceMetric
        {
            Name = name,
            FirstRecorded = DateTime.UtcNow,
            Dimensions = dimensions ?? new Dictionary<string, object>()
        });
        metric.Update(value);
        _structuredLogger.LogPerformanceMetric(metricName, value, dimensions);
    }
    public void RecordDatabaseOperation(string operation, string database, string schema, string objectName, TimeSpan duration)
    {
        _structuredLogger.LogDatabaseOperation(operation, database, schema, objectName, duration);
        var dimensions = new Dictionary<string, object>
        {
            ["Database"] = database,
            ["Schema"] = schema,
            ["ObjectName"] = objectName
        };
        RecordMetric($"Database.{operation}", duration.TotalMilliseconds, dimensions);
    }
    public PerformanceMetricsSnapshot GetSnapshot()
    {
        var metrics = _metrics.ToDictionary(kvp => kvp.Key, kvp => kvp.Value.GetSnapshot());
        var activeOperationCount = _activeOperations.Count;
        return new PerformanceMetricsSnapshot
        {
            Timestamp = DateTime.UtcNow,
            Metrics = metrics,
            ActiveOperationCount = activeOperationCount,
            TotalMetricsRecorded = metrics.Sum(m => m.Value.Count)
        };
    }
    private void ReportPerformanceMetrics(object state)
    {
        var snapshot = GetSnapshot();
        if (snapshot.TotalMetricsRecorded > 0)
        {
            _logger.LogInformation(
                "Performance Report: {ActiveOperations} active operations, {TotalMetrics} total metrics recorded",
                snapshot.ActiveOperationCount, snapshot.TotalMetricsRecorded);
            // Log slow operations
            var slowOperations = snapshot.Metrics
                .Where(m => m.Value.AverageValue > 1000) // Operations slower than 1 second
                .OrderByDescending(m => m.Value.AverageValue);
            foreach (var slowOp in slowOperations.Take(5))
            {
                _logger.LogWarning(
                    "Slow operation detected: {OperationName} - Avg: {AverageMs}ms, Max: {MaxMs}ms, Count: {Count}",
                    slowOp.Key, slowOp.Value.AverageValue, slowOp.Value.MaxValue, slowOp.Value.Count);
            }
        }
    }
    public void Dispose()
    {
        if (!_disposed)
        {
            _disposed = true;
            _reportingTimer?.Dispose();
            // Log final performance report
            var finalSnapshot = GetSnapshot();
            _logger.LogInformation(
                "Performance monitor disposed. Final stats: {ActiveOperations} active operations, {TotalMetrics} total metrics",
                finalSnapshot.ActiveOperationCount, finalSnapshot.TotalMetricsRecorded);
            _metrics.Clear();
            _activeOperations.Clear();
        }
    }
    private class OperationScope : IDisposable
    {
        private readonly PerformanceMonitor _monitor;
        private readonly string _operationId;
        private readonly string _operationName;
        private readonly StructuredLogger _structuredLogger;
        private bool _disposed;
        public OperationScope(
            PerformanceMonitor monitor,
            string operationId,
            string operationName,
            StructuredLogger structuredLogger)
        {
            _monitor = monitor;
            _operationId = operationId;
            _operationName = operationName;
            _structuredLogger = structuredLogger;
        }
        public void Dispose()
        {
            if (!_disposed)
            {
                _disposed = true;
                _monitor.EndOperation(_operationId, _operationName);
            }
        }
    }
}
public class PerformanceMetric
{
    public string Name { get; set; } = string.Empty;
    public DateTime FirstRecorded { get; set; }
    public Dictionary<string, object> Dimensions { get; set; } = new();
    public long Count { get; private set; }
    public double TotalValue { get; private set; }
    public double MinValue { get; private set; } = double.MaxValue;
    public double MaxValue { get; private set; }
    public double AverageValue => Count > 0 ? TotalValue / Count : 0;
    public double LastValue { get; private set; }
    public void Update(double value)
    {
        Count++;
        TotalValue += value;
        MinValue = Math.Min(MinValue, value);
        MaxValue = Math.Max(MaxValue, value);
        LastValue = value;
    }
    public PerformanceMetricSnapshot GetSnapshot()
    {
        return new PerformanceMetricSnapshot
        {
            Name = Name,
            Count = Count,
            TotalValue = TotalValue,
            AverageValue = AverageValue,
            MinValue = MinValue,
            MaxValue = MaxValue,
            LastValue = LastValue,
            FirstRecorded = FirstRecorded,
            Dimensions = new Dictionary<string, object>(Dimensions)
        };
    }
}
public class PerformanceMetricSnapshot
{
    public string Name { get; set; } = string.Empty;
    public long Count { get; set; }
    public double TotalValue { get; set; }
    public double AverageValue { get; set; }
    public double MinValue { get; set; }
    public double MaxValue { get; set; }
    public double LastValue { get; set; }
    public DateTime FirstRecorded { get; set; }
    public Dictionary<string, object> Dimensions { get; set; } = new();
}
public class PerformanceMetricsSnapshot
{
    public DateTime Timestamp { get; set; }
    public Dictionary<string, PerformanceMetricSnapshot> Metrics { get; set; } = new();
    public int ActiveOperationCount { get; set; }
    public long TotalMetricsRecorded { get; set; }
}