namespace PostgreSqlSchemaCompareSync.Core.Connection.Pool
{
    /// <summary>
    /// Connection pool statistics
    /// </summary>
    public class ConnectionStats
    {
        public string PoolKey { get; set; } = string.Empty;
        public int ActiveConnections { get; set; }
        public int MaxPoolSize { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}