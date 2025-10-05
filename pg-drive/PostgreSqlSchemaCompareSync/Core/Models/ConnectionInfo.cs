namespace PostgreSqlSchemaCompareSync.Core.Models;

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
    public string GetConnectionString()
        => $"Host={Host};Port={Port};Database={Database};Username={Username};Password={Password};";

    public string GetMaskedConnectionString()
        => $"Host={Host};Port={Port};Database={Database};Username={Username};Password=***;";
}

public enum ConnectionStatus
{
    Connected,
    Disconnected,
    Error,
    Connecting,
    Reconnecting
}