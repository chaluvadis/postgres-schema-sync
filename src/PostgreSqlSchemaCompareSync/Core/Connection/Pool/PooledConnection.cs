namespace PostgreSqlSchemaCompareSync.Core.Connection.Pool;
public class PooledConnection : IDisposable
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public NpgsqlConnection Connection { get; set; } = default!;
    public DateTime CreatedAt { get; set; }
    public DateTime LastAcquiredAt { get; set; }
    public int AcquiredCount { get; set; }
    public bool IsHealthy { get; set; } = true;
    public TimeSpan TotalUsageTime { get; set; }
    public bool IsExpired => DateTime.UtcNow - LastAcquiredAt > TimeSpan.FromMinutes(30);
    public void Dispose() => Connection?.Dispose();
}