namespace PostgreSqlSchemaCompareSync.Infrastructure.Configuration;
public class AppSettings
{
    public ConnectionSettings Connection { get; set; } = new();
    public SchemaSettings Schema { get; set; } = new();
    public ComparisonSettings Comparison { get; set; } = new();
    public MigrationSettings Migration { get; set; } = new();
    public LoggingSettings Logging { get; set; } = new();
    public SecuritySettings Security { get; set; } = new();
}
public class ConnectionSettings
{
    [Range(30, 3600)]
    public int DefaultCommandTimeout { get; set; } = 300;
    [Range(1, 20)]
    public int ConnectionPoolSize { get; set; } = 5;
    [Range(10, 300)]
    public int HealthCheckInterval { get; set; } = 30;
    public bool EnableAutoRecovery { get; set; } = true;
    [Range(1, 10)]
    public int MaxRetryAttempts { get; set; } = 3;
    [Range(500, 5000)]
    public int RetryDelay { get; set; } = 1000;
}
public class SchemaSettings
{
    [Range(60, 3600)]
    public int CacheTimeout { get; set; } = 300;
    [Range(60, 1800)]
    public int BackgroundRefreshInterval { get; set; } = 300;
    [Range(1000, 100000)]
    public int MaxObjectsPerSchema { get; set; } = 10000;
    public bool EnableLazyLoading { get; set; } = true;
}
public class ComparisonSettings
{
    public string DefaultMode { get; set; } = "strict";
    public bool EnableParallelProcessing { get; set; } = true;
    [Range(1, 8)]
    public int MaxDegreeOfParallelism { get; set; } = 4;
    [Range(100, 10000)]
    public int ChunkSize { get; set; } = 1000;
}
public class MigrationSettings
{
    [Range(10, 200)]
    public int DefaultBatchSize { get; set; } = 50;
    public bool EnableDryRun { get; set; } = true;
    public bool GenerateRollbackScripts { get; set; } = true;
    public bool LogAllOperations { get; set; } = true;
}
public class LoggingSettings
{
    public Dictionary<string, string> LogLevel { get; set; } = new()
    {
        ["Default"] = "Information",
        ["Microsoft"] = "Warning",
        ["PostgreSqlSchemaCompareSync"] = "Debug"
    };
}
public class SecuritySettings
{
    public string CredentialStorage { get; set; } = "VSCodeSecretStorage";
    public bool EncryptionEnabled { get; set; } = true;
    public bool CertificateValidation { get; set; } = true;
}