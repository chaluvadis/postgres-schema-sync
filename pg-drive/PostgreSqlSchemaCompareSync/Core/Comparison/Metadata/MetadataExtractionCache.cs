namespace PostgreSqlSchemaCompareSync.Core.Comparison.Metadata;

/// <summary>
/// Simple in-memory cache for metadata extraction results
/// </summary>
public class MetadataExtractionCache
{
    private readonly Dictionary<string, (List<DatabaseObject> Objects, DateTime Expiry)> _cache = new();
    private readonly ILogger<MetadataExtractionCache> _logger;
    private readonly SchemaSettings _settings;

    public MetadataExtractionCache(
        ILogger<MetadataExtractionCache> logger,
        IOptions<AppSettings> settings)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _settings = settings?.Value?.Schema ?? throw new ArgumentNullException(nameof(settings));
    }

    /// <summary>
    /// Gets cached metadata for the specified parameters
    /// </summary>
    public bool TryGetCachedMetadata(
        ConnectionInfo connectionInfo,
        ObjectType objectType,
        string? schemaFilter,
        out List<DatabaseObject>? cachedObjects)
    {
        var cacheKey = GenerateCacheKey(connectionInfo, objectType, schemaFilter);

        if (_cache.TryGetValue(cacheKey, out var cachedEntry))
        {
            // Check if cache entry has expired
            if (cachedEntry.Expiry > DateTime.UtcNow)
            {
                cachedObjects = cachedEntry.Objects;
                _logger.LogDebug("Retrieved cached metadata for {ObjectType} from {Database}",
                    objectType, connectionInfo.Database);
                return true;
            }
            else
            {
                // Remove expired entry
                _cache.Remove(cacheKey);
            }
        }

        cachedObjects = null;
        return false;
    }

    /// <summary>
    /// Caches metadata extraction results
    /// </summary>
    public void CacheMetadata(
        ConnectionInfo connectionInfo,
        ObjectType objectType,
        string? schemaFilter,
        List<DatabaseObject> objects)
    {
        var cacheKey = GenerateCacheKey(connectionInfo, objectType, schemaFilter);

        var expiry = DateTime.UtcNow.AddSeconds(_settings.CacheTimeout);

        _cache[cacheKey] = (objects, expiry);

        _logger.LogDebug("Cached {ObjectCount} {ObjectType} objects from {Database}",
            objects.Count, objectType, connectionInfo.Database);
    }

    /// <summary>
    /// Clears cache for specific connection and object type
    /// </summary>
    public void ClearCache(ConnectionInfo connectionInfo, ObjectType? objectType = null)
    {
        if (objectType.HasValue)
        {
            var cacheKey = GenerateCacheKey(connectionInfo, objectType.Value, null);
            _cache.Remove(cacheKey);
            _logger.LogDebug("Cleared cache for {ObjectType} from {Database}", objectType.Value, connectionInfo.Database);
        }
        else
        {
            // Clear all cache entries for this connection
            var connectionPrefix = $"{connectionInfo.Id}_{connectionInfo.Database}";
            var keysToRemove = _cache.Keys.Where(k => k.StartsWith(connectionPrefix)).ToList();

            foreach (var key in keysToRemove)
            {
                _cache.Remove(key);
            }

            _logger.LogDebug("Cleared all cached metadata for {Database}", connectionInfo.Database);
        }
    }

    /// <summary>
    /// Gets cache statistics
    /// </summary>
    public CacheStats GetCacheStats()
    {
        var now = DateTime.UtcNow;
        var activeEntries = _cache.Count(entry => entry.Value.Expiry > now);

        return new CacheStats
        {
            ActiveEntries = activeEntries,
            TotalEntries = _cache.Count
        };
    }

    /// <summary>
    /// Generates a unique cache key for the given parameters
    /// </summary>
    private static string GenerateCacheKey(ConnectionInfo connectionInfo, ObjectType objectType, string? schemaFilter)
    {
        return $"{connectionInfo.Id}_{connectionInfo.Database}_{objectType}_{schemaFilter ?? "all"}";
    }
}

/// <summary>
/// Cache statistics
/// </summary>
public class CacheStats
{
    public int ActiveEntries { get; set; }
    public int TotalEntries { get; set; }
    public double UtilizationPercentage => TotalEntries > 0 ? (ActiveEntries * 100.0) / TotalEntries : 0;
}