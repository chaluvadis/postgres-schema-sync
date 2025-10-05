namespace PostgreSqlSchemaCompareSync.Core.Connection
{
    /// <summary>
    /// Interface for managing database connections
    /// </summary>
    public interface IConnectionManager : IDisposable
    {
        /// <summary>
        /// Creates a new database connection
        /// </summary>
        Task<NpgsqlConnection> CreateConnectionAsync(
            ConnectionInfo connectionInfo,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Tests if a connection can be established
        /// </summary>
        Task<bool> TestConnectionAsync(
            ConnectionInfo connectionInfo,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Closes and disposes a connection
        /// </summary>
        Task CloseConnectionAsync(
            NpgsqlConnection connection,
            CancellationToken cancellationToken = default);

        /// <summary>
        /// Gets connection health status
        /// </summary>
        Task<ConnectionHealthStatus> GetConnectionHealthAsync(
            ConnectionInfo connectionInfo,
            CancellationToken cancellationToken = default);
    }

    /// <summary>
    /// Connection health status information
    /// </summary>
    public class ConnectionHealthStatus
    {
        public bool IsHealthy { get; set; }
        public TimeSpan ResponseTime { get; set; }
        public DateTime LastChecked { get; set; }
        public string? ErrorMessage { get; set; }
    }
}