namespace PostgreSqlSchemaCompareSync.Core.Comparison.Cache;

public interface ISchemaCacheManager : IDisposable
{
    Task<List<DatabaseObject>?> GetCachedObjectsAsync(
        string connectionId,
        string? schemaFilter = null,
        CancellationToken cancellationToken = default);

    Task CacheObjectsAsync(
        string connectionId,
        List<DatabaseObject> objects,
        string? schemaFilter = null,
        CancellationToken cancellationToken = default);

    Task InvalidateCacheAsync(
        string connectionId,
        string? schemaFilter = null,
        CancellationToken cancellationToken = default);

    Task<bool> IsCacheValidAsync(
        string connectionId,
        string? schemaFilter = null,
        CancellationToken cancellationToken = default);

    CacheStatistics GetCacheStatistics();

    Task ClearAllCachesAsync(CancellationToken cancellationToken = default);
}

public class CacheStatistics
{
    public int TotalEntries { get; set; }
    public long TotalSizeBytes { get; set; }
    public DateTime OldestEntry { get; set; } = DateTime.UtcNow;
    public DateTime NewestEntry { get; set; } = DateTime.UtcNow;
    public int HitCount { get; set; }
    public int MissCount { get; set; }
    public double HitRate => HitCount + MissCount > 0 ? (double)HitCount / (HitCount + MissCount) : 0;
}