namespace PostgreSqlSchemaCompareSync.Infrastructure.Configuration;

public class AppSettings
{
    public ConnectionSettings Connection { get; set; } = new ConnectionSettings();
    public SchemaSettings Schema { get; set; } = new SchemaSettings();
    public MigrationSettings Migration { get; set; } = new MigrationSettings();
    public LoggingSettings Logging { get; set; } = new LoggingSettings();
    public SecuritySettings Security { get; set; } = new SecuritySettings();
}

public class ConnectionSettings
{
    public int ConnectionTimeout { get; set; } = 30;
    public int CommandTimeout { get; set; } = 300;
    public int MaxPoolSize { get; set; } = 20;
    public int MinPoolSize { get; set; } = 5;
    public bool AutoReconnect { get; set; } = true;
    public int ReconnectAttempts { get; set; } = 3;
    public int ReconnectDelay { get; set; } = 1000;
}

public class SchemaSettings
{
    public int CacheTimeout { get; set; } = 300; // 5 minutes
    public int MaxCacheSize { get; set; } = 1000;
    public bool EnableParallelProcessing { get; set; } = true;
    public int MaxDegreeOfParallelism { get; set; } = 4;
    public string[] IgnoredSchemas { get; set; } = { "information_schema", "pg_catalog", "pg_toast" };
}

public class MigrationSettings
{
    public int BatchSize { get; set; } = 50;
    public bool EnableDryRun { get; set; } = true;
    public bool GenerateRollbackScript { get; set; } = true;
    public int TransactionTimeout { get; set; } = 300;
    public bool ContinueOnError { get; set; } = false;
}

public class LoggingSettings
{
    public string LogLevel { get; set; } = "Information";
    public bool IncludeScopes { get; set; } = false;
    public Dictionary<string, string> LogLevelOverrides { get; set; } = [];
}

public class SecuritySettings
{
    public bool EnableSslValidation { get; set; } = true;
    public bool AllowSelfSignedCertificates { get; set; } = false;
    public int MinCertificateKeySize { get; set; } = 2048;
    public int MaxCertificateValidityDays { get; set; } = 825; // ~2.25 years
    public int MaxQueryLength { get; set; } = 10000;
    public int MaxStatementCount { get; set; } = 1000;
    public int MaxScriptSize { get; set; } = 10485760; // 10MB
}