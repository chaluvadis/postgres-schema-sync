namespace PostgreSqlSchemaCompareSync.Core.Comparison.Cache;
public class SchemaCacheManager : IDisposable
{
    private readonly SchemaSettings _settings;
    private readonly ILogger<SchemaCacheManager> _logger;
    private readonly SchemaMetadataExtractor _metadataExtractor;
    private readonly ConcurrentDictionary<string, CacheEntry> _cache;
    private readonly Timer _refreshTimer;
    private readonly SemaphoreSlim _cacheLock;
    private bool _disposed;
    public SchemaCacheManager(
        IOptions<AppSettings> settings,
        ILogger<SchemaCacheManager> logger,
        SchemaMetadataExtractor metadataExtractor)
    {
        _settings = settings.Value.Schema;
        _logger = logger;
        _metadataExtractor = metadataExtractor;
        _cache = new ConcurrentDictionary<string, CacheEntry>();
        _cacheLock = new SemaphoreSlim(1, 1);
        // Start background refresh timer
        _refreshTimer = new Timer(
            RefreshCallback,
            null,
            TimeSpan.FromSeconds(_settings.BackgroundRefreshInterval),
            TimeSpan.FromSeconds(_settings.BackgroundRefreshInterval));
        _logger.LogInformation("Schema cache manager initialized with {Interval}s refresh interval",
            _settings.BackgroundRefreshInterval);
    }
    public async Task<List<DatabaseObject>> GetSchemaAsync(
        ConnectionInfo connectionInfo,
        string? schemaFilter = null,
        CancellationToken cancellationToken = default)
    {
        var cacheKey = GetCacheKey(connectionInfo, schemaFilter);
        // Try to get from cache first
        if (_cache.TryGetValue(cacheKey, out var cacheEntry))
        {
            if (!cacheEntry.IsExpired)
            {
                _logger.LogDebug("Cache hit for {CacheKey}", cacheKey);
                return cacheEntry.Objects;
            }
            else
            {
                _logger.LogDebug("Cache expired for {CacheKey}", cacheKey);
            }
        }
        // Cache miss or expired - fetch from database
        await _cacheLock.WaitAsync(cancellationToken);
        try
        {
            // Double-check after acquiring lock
            if (_cache.TryGetValue(cacheKey, out cacheEntry) && !cacheEntry.IsExpired)
            {
                return cacheEntry.Objects;
            }
            _logger.LogInformation("Fetching schema metadata for {Database}", connectionInfo.Database);
            using var connection = new NpgsqlConnection(connectionInfo.ConnectionString);
            await connection.OpenAsync(cancellationToken);
            var objects = await _metadataExtractor.ExtractAllObjectsAsync(
                connection, schemaFilter, cancellationToken);
            // Update cache
            cacheEntry = new CacheEntry
            {
                Objects = objects,
                CachedAt = DateTime.UtcNow,
                LastAccessedAt = DateTime.UtcNow,
                AccessCount = 1
            };
            _cache[cacheKey] = cacheEntry;
            _logger.LogInformation("Cached {ObjectCount} objects for {CacheKey}", objects.Count, cacheKey);
            return objects;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to fetch schema for {CacheKey}", cacheKey);
            throw;
        }
        finally
        {
            _cacheLock.Release();
        }
    }
    public async Task<DatabaseObject?> GetObjectAsync(
        ConnectionInfo connectionInfo,
        ObjectType objectType,
        string schema,
        string objectName,
        CancellationToken cancellationToken = default)
    {
        var objects = await GetSchemaAsync(connectionInfo, schema, cancellationToken);
        return objects.FirstOrDefault(obj =>
            obj.Type == objectType &&
            obj.Schema.Equals(schema, StringComparison.OrdinalIgnoreCase) &&
            obj.Name.Equals(objectName, StringComparison.OrdinalIgnoreCase));
    }
    public async Task RefreshSchemaAsync(
        ConnectionInfo connectionInfo,
        string? schemaFilter = null,
        CancellationToken cancellationToken = default)
    {
        var cacheKey = GetCacheKey(connectionInfo, schemaFilter);
        await _cacheLock.WaitAsync(cancellationToken);
        try
        {
            _cache.TryRemove(cacheKey, out _);
            _logger.LogInformation("Cache cleared for {CacheKey}", cacheKey);
            // Fetch fresh data
            await GetSchemaAsync(connectionInfo, schemaFilter, cancellationToken);
        }
        finally
        {
            _cacheLock.Release();
        }
    }
    public void ClearCache()
    {
        _cache.Clear();
        _logger.LogInformation("All schema cache cleared");
    }
    public SchemaCacheStats GetStats()
    {
        var entries = _cache.ToArray();
        var totalObjects = entries.Sum(e => e.Value.Objects.Count);
        var totalSize = entries.Sum(e => e.Value.EstimatedSizeBytes);
        return new SchemaCacheStats
        {
            TotalEntries = entries.Length,
            TotalObjects = totalObjects,
            TotalSizeBytes = totalSize,
            OldestEntry = entries.Min(e => e.Value.CachedAt),
            NewestEntry = entries.Max(e => e.Value.CachedAt),
            AverageAccessCount = entries.Any() ? entries.Average(e => e.Value.AccessCount) : 0
        };
    }
    private void RefreshCallback(object state)
    {
        Task.Run(PerformBackgroundRefreshAsync);
    }
    private async Task PerformBackgroundRefreshAsync()
    {
        var expiredKeys = _cache
            .Where(kvp => kvp.Value.IsExpired)
            .Select(kvp => kvp.Key)
            .ToList();
        if (expiredKeys.Count == 0)
        {
            return;
        }
        _logger.LogInformation("Background refresh: removing {ExpiredCount} expired entries", expiredKeys.Count);
        foreach (var key in expiredKeys)
        {
            _cache.TryRemove(key, out _);
        }
        // Log cache statistics after cleanup
        var stats = GetStats();
        _logger.LogDebug("Cache stats after cleanup: {TotalEntries} entries, {TotalObjects} objects",
            stats.TotalEntries, stats.TotalObjects);
    }
    private string GetCacheKey(ConnectionInfo connectionInfo, string? schemaFilter)
    {
        return $"{connectionInfo.Host}:{connectionInfo.Port}:{connectionInfo.Database}:{schemaFilter ?? "all"}";
    }
    public void Dispose()
    {
        if (!_disposed)
        {
            _disposed = true;
            _refreshTimer?.Dispose();
            _cacheLock?.Dispose();
            _cache.Clear();
            _logger.LogInformation("Schema cache manager disposed");
        }
    }
}
public class CacheEntry
{
    public List<DatabaseObject> Objects { get; set; } = [];
    public DateTime CachedAt { get; set; }
    public DateTime LastAccessedAt { get; set; }
    public int AccessCount { get; set; }
    public bool IsExpired => DateTime.UtcNow - CachedAt > TimeSpan.FromSeconds(300); // 5 minutes default
    public long EstimatedSizeBytes
    {
        get
        {
            // Rough estimation: average object size * count
            const long averageObjectSize = 1024; // 1KB per object estimate
            return Objects.Count * averageObjectSize;
        }
    }
}
public class SchemaCacheStats
{
    public int TotalEntries { get; set; }
    public int TotalObjects { get; set; }
    public long TotalSizeBytes { get; set; }
    public DateTime OldestEntry { get; set; }
    public DateTime NewestEntry { get; set; }
    public double AverageAccessCount { get; set; }
    public double CacheHitRatio => TotalObjects > 0 ? (double)TotalObjects / (TotalObjects + AverageAccessCount) : 0;
    public string SizeFormatted => $"{TotalSizeBytes / 1024.0:F2} KB";
}