namespace PostgreSqlSchemaCompareSync.Core.Comparison.Cache;

public class SchemaCacheManager : ISchemaCacheManager
{
    private readonly ILogger<SchemaCacheManager> _logger;
    private readonly AppSettings _settings;
    private readonly ConcurrentDictionary<string, CacheEntry> _cache;
    private readonly Timer _cleanupTimer;
    private int _hitCount;
    private int _missCount;
    private bool _disposed;

    public SchemaCacheManager(
        ILogger<SchemaCacheManager> logger,
        IOptions<AppSettings> settings)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _settings = settings?.Value ?? throw new ArgumentNullException(nameof(settings));

        _cache = new ConcurrentDictionary<string, CacheEntry>();

        // Setup cleanup timer (every 5 minutes)
        _cleanupTimer = new Timer(CleanupExpiredEntries, null, TimeSpan.FromMinutes(5), TimeSpan.FromMinutes(5));
    }

    /// <summary>
    /// Gets cached database objects for a connection
    /// </summary>
    public Task<List<DatabaseObject>?> GetCachedObjectsAsync(
        string connectionId,
        string? schemaFilter = null,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(connectionId))
            throw new ArgumentNullException(nameof(connectionId));

        var cacheKey = GenerateCacheKey(connectionId, schemaFilter);

        if (_cache.TryGetValue(cacheKey, out var entry))
        {
            if (IsEntryValid(entry))
            {
                Interlocked.Increment(ref _hitCount);
                _logger.LogDebug("Cache hit for connection {ConnectionId}, schema filter: {SchemaFilter}", connectionId, schemaFilter);

                // Update access time
                entry.LastAccessed = DateTime.UtcNow;
                return Task.FromResult<List<DatabaseObject>?>(DeepClone(entry.Objects));
            }
            else
            {
                // Entry expired, remove it
                _cache.TryRemove(cacheKey, out _);
                _logger.LogDebug("Expired cache entry removed for connection {ConnectionId}", connectionId);
            }
        }

        Interlocked.Increment(ref _missCount);
        _logger.LogDebug("Cache miss for connection {ConnectionId}, schema filter: {SchemaFilter}", connectionId, schemaFilter);
        return Task.FromResult<List<DatabaseObject>?>(null);
    }

    /// <summary>
    /// Caches database objects for a connection
    /// </summary>
    public Task CacheObjectsAsync(
        string connectionId,
        List<DatabaseObject> objects,
        string? schemaFilter = null,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(connectionId))
            throw new ArgumentNullException(nameof(connectionId));
        if (objects == null)
            throw new ArgumentNullException(nameof(objects));

        var cacheKey = GenerateCacheKey(connectionId, schemaFilter);
        var entry = new CacheEntry
        {
            ConnectionId = connectionId,
            SchemaFilter = schemaFilter,
            Objects = DeepClone(objects),
            CachedAt = DateTime.UtcNow,
            LastAccessed = DateTime.UtcNow,
            SizeBytes = EstimateSize(objects)
        };

        // Check cache size limits
        if (_cache.Count >= _settings.Schema.MaxCacheSize)
        {
            // Remove oldest entries to make space
            CleanupOldEntriesAsync(10).Wait();
        }

        _cache[cacheKey] = entry;

        _logger.LogDebug("Cached {ObjectCount} objects for connection {ConnectionId}, size: {SizeBytes} bytes",
            objects.Count, connectionId, entry.SizeBytes);

        return Task.CompletedTask;
    }

    /// <summary>
    /// Invalidates cache for a connection
    /// </summary>
    public Task InvalidateCacheAsync(
        string connectionId,
        string? schemaFilter = null,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(connectionId))
            throw new ArgumentNullException(nameof(connectionId));

        var entriesToRemove = _cache.Keys
            .Where(key => key.StartsWith($"{connectionId}:"))
            .ToList();

        foreach (var key in entriesToRemove)
        {
            _cache.TryRemove(key, out _);
        }

        _logger.LogInformation("Invalidated cache for connection {ConnectionId}", connectionId);

        return Task.CompletedTask;
    }

    /// <summary>
    /// Checks if cache is valid for a connection
    /// </summary>
    public Task<bool> IsCacheValidAsync(
        string connectionId,
        string? schemaFilter = null,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(connectionId))
            throw new ArgumentNullException(nameof(connectionId));

        var cacheKey = GenerateCacheKey(connectionId, schemaFilter);

        if (_cache.TryGetValue(cacheKey, out var entry))
        {
            return Task.FromResult(IsEntryValid(entry));
        }

        return Task.FromResult(false);
    }

    /// <summary>
    /// Gets cache statistics
    /// </summary>
    public CacheStatistics GetCacheStatistics()
    {
        var entries = _cache.Values.ToList();

        return new CacheStatistics
        {
            TotalEntries = _cache.Count,
            TotalSizeBytes = entries.Sum(e => e.SizeBytes),
            OldestEntry = entries.Any() ? entries.Min(e => e.CachedAt) : DateTime.UtcNow,
            NewestEntry = entries.Any() ? entries.Max(e => e.CachedAt) : DateTime.UtcNow,
            HitCount = _hitCount,
            MissCount = _missCount
        };
    }

    /// <summary>
    /// Clears all caches
    /// </summary>
    public Task ClearAllCachesAsync(CancellationToken cancellationToken = default)
    {
        var entryCount = _cache.Count;
        _cache.Clear();

        _hitCount = 0;
        _missCount = 0;

        _logger.LogInformation("Cleared all caches ({EntryCount} entries)", entryCount);

        return Task.CompletedTask;
    }

    /// <summary>
    /// Generates a cache key for the connection and schema filter
    /// </summary>
    private string GenerateCacheKey(string connectionId, string? schemaFilter)
    {
        return $"{connectionId}:{schemaFilter ?? "all"}";
    }

    /// <summary>
    /// Checks if a cache entry is still valid
    /// </summary>
    private bool IsEntryValid(CacheEntry entry)
    {
        var age = DateTime.UtcNow - entry.CachedAt;
        return age.TotalSeconds < _settings.Schema.CacheTimeout;
    }

    /// <summary>
    /// Creates a deep clone of objects
    /// </summary>
    private List<DatabaseObject> DeepClone(List<DatabaseObject> objects)
    {
        try
        {
            var json = JsonSerializer.Serialize(objects);
            return JsonSerializer.Deserialize<List<DatabaseObject>>(json) ?? [];
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to deep clone objects, returning as-is");
            return objects; // Fallback to shallow copy
        }
    }

    /// <summary>
    /// Estimates the size of objects in bytes
    /// </summary>
    private long EstimateSize(List<DatabaseObject> objects)
    {
        try
        {
            var json = JsonSerializer.Serialize(objects);
            return System.Text.Encoding.UTF8.GetByteCount(json);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to estimate object size");
            return 0;
        }
    }

    /// <summary>
    /// Cleans up expired cache entries
    /// </summary>
    private void CleanupExpiredEntries(object? state)
    {
        try
        {
            var expiredKeys = _cache
                .Where(kvp => !IsEntryValid(kvp.Value))
                .Select(kvp => kvp.Key)
                .ToList();

            foreach (var key in expiredKeys)
            {
                _cache.TryRemove(key, out _);
            }

            if (expiredKeys.Any())
            {
                _logger.LogDebug("Cleaned up {ExpiredCount} expired cache entries", expiredKeys.Count);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during cache cleanup");
        }
    }

    /// <summary>
    /// Cleans up old entries to make space
    /// </summary>
    private Task CleanupOldEntriesAsync(int targetRemovalCount)
    {
        try
        {
            var entriesToRemove = _cache
                .OrderBy(kvp => kvp.Value.LastAccessed)
                .Take(targetRemovalCount)
                .Select(kvp => kvp.Key)
                .ToList();

            foreach (var key in entriesToRemove)
            {
                _cache.TryRemove(key, out _);
            }

            _logger.LogDebug("Cleaned up {RemovalCount} old cache entries", entriesToRemove.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during old entries cleanup");
        }

        return Task.CompletedTask;
    }

    public void Dispose()
    {
        if (!_disposed)
        {
            _cleanupTimer.Dispose();
            _cache.Clear();
            _disposed = true;

            _logger.LogInformation("SchemaCacheManager disposed");
        }
    }
    private class CacheEntry
    {
        public string ConnectionId { get; set; } = string.Empty;
        public string? SchemaFilter { get; set; }
        public List<DatabaseObject> Objects { get; set; } = [];
        public DateTime CachedAt { get; set; }
        public DateTime LastAccessed { get; set; }
        public long SizeBytes { get; set; }
    }
}