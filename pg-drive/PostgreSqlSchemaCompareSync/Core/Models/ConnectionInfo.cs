namespace PostgreSqlSchemaCompareSync.Core.Models
{
    /// <summary>
    /// Database connection information
    /// </summary>
    public class ConnectionInfo
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Name { get; set; } = string.Empty;
        public string Host { get; set; } = "localhost";
        public int Port { get; set; } = 5432;
        public string Database { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
        public DateTime CreatedDate { get; set; } = DateTime.UtcNow;
        public ConnectionStatus Status { get; set; } = ConnectionStatus.Disconnected;

        /// <summary>
        /// Gets the connection string for Npgsql
        /// </summary>
        public string GetConnectionString()
        {
            return $"Host={Host};Port={Port};Database={Database};Username={Username};Password={Password};";
        }

        /// <summary>
        /// Gets a masked connection string for logging (password hidden)
        /// </summary>
        public string GetMaskedConnectionString()
        {
            return $"Host={Host};Port={Port};Database={Database};Username={Username};Password=***;";
        }
    }

    public enum ConnectionStatus
    {
        Connected,
        Disconnected,
        Error,
        Connecting,
        Reconnecting
    }
}