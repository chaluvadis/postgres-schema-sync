namespace PostgreSqlSchemaCompareSync.Core.Connection.Pool;
public class ConnectionStats
{
    public int AcquiredCount { get; set; }
    public DateTime? LastAcquiredAt { get; set; }
    public int FailedCount { get; set; }
    public DateTime? LastFailedAt { get; set; }
    public TimeSpan TotalUsageTime { get; set; }
    public int HealthyCheckCount { get; set; }
    public int UnhealthyCheckCount { get; set; }
}
public class ConnectionPoolStats
{
    public int AvailableConnections { get; set; }
    public int MaxPoolSize { get; set; }
    public long TotalAcquired { get; set; }
    public Dictionary<string, ConnectionStats> ConnectionStats { get; set; } = [];
    public DateTime StatsCollectedAt { get; set; } = DateTime.UtcNow;
    public double AverageUsageRate => TotalAcquired > 0 ?
        (double)TotalAcquired / (StatsCollectedAt - DateTime.UtcNow.AddDays(-1)).TotalHours : 0;
    public int TotalHealthyChecks => ConnectionStats.Sum(s => s.Value.HealthyCheckCount);
    public int TotalUnhealthyChecks => ConnectionStats.Sum(s => s.Value.UnhealthyCheckCount);
    public double HealthRatio => (TotalHealthyChecks + TotalUnhealthyChecks) > 0 ?
        (double)TotalHealthyChecks / (TotalHealthyChecks + TotalUnhealthyChecks) : 1.0;
}