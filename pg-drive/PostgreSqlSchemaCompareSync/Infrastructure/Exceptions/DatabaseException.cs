namespace PostgreSqlSchemaCompareSync.Infrastructure.Exceptions;

using System.Text.Json;
using System.Text.Json.Serialization;

public class DatabaseException : Exception
{
    public string? Database { get; init; }
    public string? Schema { get; init; }
    public string? ObjectName { get; init; }
    public DatabaseErrorCode ErrorCode { get; init; }

    public DatabaseException() { }
    public DatabaseException(string message) : base(message) { }
    public DatabaseException(string message, Exception innerException) : base(message, innerException) { }
    public DatabaseException(string message, string? database, string? schema, string? objectName, DatabaseErrorCode errorCode)
        : base(message)
    {
        Database = database;
        Schema = schema;
        ObjectName = objectName;
        ErrorCode = errorCode;
    }
    public DatabaseException(string message, string? database, DatabaseErrorCode errorCode)
        : base(message)
    {
        Database = database;
        ErrorCode = errorCode;
    }

    public virtual string ToJson() => JsonSerializer.Serialize(this, GetType());
    public static T FromJson<T>(string json) where T : DatabaseException
        => JsonSerializer.Deserialize<T>(json)!;
}

public class ConnectionException : DatabaseException
{
    public ConnectionException(string message) : base(message) { }
    public ConnectionException(string message, string database) : base(message, database, DatabaseErrorCode.ConnectionFailed) { }
    public ConnectionException(string message, Exception innerException) : base(message, innerException) { }
}

public class SchemaExtractionException : DatabaseException
{
    public SchemaExtractionException(string message) : base(message) { }
    public SchemaExtractionException(string message, string database, string schema)
        : base(message, database, schema, string.Empty, DatabaseErrorCode.SchemaExtractionFailed) { }
}

public class ComparisonException : DatabaseException
{
    public ComparisonException(string message) : base(message) { }
    public ComparisonException(string message, string sourceDatabase, string targetDatabase)
        : base(message, $"{sourceDatabase}->{targetDatabase}", DatabaseErrorCode.ComparisonFailed) { }
}

public class MigrationException : DatabaseException
{
    public Guid MigrationId { get; init; }
    public MigrationException(string message) : base(message) { }
    public MigrationException(string message, Guid migrationId)
        : base(message) => MigrationId = migrationId;
    public MigrationException(string message, Guid migrationId, Exception innerException)
        : base(message, innerException) => MigrationId = migrationId;

    public override string ToJson() => JsonSerializer.Serialize(this, GetType());
    public static MigrationException FromJson(string json)
        => JsonSerializer.Deserialize<MigrationException>(json)!;
}

public class ValidationException : DatabaseException
{
    public ValidationException(string message) : base(message) { }
    public ValidationException(string message, string database, string schema, string objectName)
        : base(message, database, schema, objectName, DatabaseErrorCode.ValidationFailed) { }
}

public enum DatabaseErrorCode
{
    // Connection errors (1000-1099)
    ConnectionFailed = 1000,
    ConnectionTimeout = 1001,
    AuthenticationFailed = 1002,
    ConnectionPoolExhausted = 1003,
    // Schema errors (1100-1199)
    SchemaExtractionFailed = 1100,
    ObjectNotFound = 1101,
    SchemaAccessDenied = 1102,
    // Comparison errors (1200-1299)
    ComparisonFailed = 1200,
    IncompatibleSchemas = 1201,
    ComparisonTimeout = 1202,
    // Migration errors (1300-1399)
    MigrationFailed = 1300,
    MigrationRollbackFailed = 1301,
    TransactionFailed = 1302,
    // Validation errors (1400-1499)
    ValidationFailed = 1400,
    InvalidConfiguration = 1401,
    UnsupportedOperation = 1402,
    // Performance errors (1500-1599)
    OperationTimeout = 1500,
    MemoryLimitExceeded = 1501,
    ResourceExhausted = 1502,
    // System errors (1600-1699)
    ConfigurationError = 1600,
    DependencyInjectionError = 1601,
    LoggingError = 1602
}