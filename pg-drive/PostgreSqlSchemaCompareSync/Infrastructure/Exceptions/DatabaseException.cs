namespace PostgreSqlSchemaCompareSync.Infrastructure.Exceptions;

public class DatabaseException : Exception
{
    public string? ConnectionId { get; }
    public DatabaseErrorCode ErrorCode { get; protected set; }

    public DatabaseException(string message)
        : base(message)
    {
        ErrorCode = DatabaseErrorCode.Unknown;
    }

    public DatabaseException(string message, Exception innerException)
        : base(message, innerException)
    {
        ErrorCode = DatabaseErrorCode.Unknown;
    }

    public DatabaseException(string message, string connectionId, DatabaseErrorCode errorCode)
        : base(message)
    {
        ConnectionId = connectionId;
        ErrorCode = errorCode;
    }

    public DatabaseException(string message, string connectionId, DatabaseErrorCode errorCode, Exception innerException)
        : base(message, innerException)
    {
        ConnectionId = connectionId;
        ErrorCode = errorCode;
    }
}

public class ConnectionException : DatabaseException
{
    public ConnectionException(string message)
        : base(message)
    {
        ErrorCode = DatabaseErrorCode.ConnectionFailed;
    }

    public ConnectionException(string message, string connectionId)
        : base(message, connectionId, DatabaseErrorCode.ConnectionFailed)
    {
    }

    public ConnectionException(string message, string connectionId, Exception innerException)
        : base(message, connectionId, DatabaseErrorCode.ConnectionFailed, innerException)
    {
    }
}

public class SchemaException : DatabaseException
{
    public SchemaException(string message)
        : base(message) => ErrorCode = DatabaseErrorCode.SchemaError;

    public SchemaException(string message, string connectionId)
        : base(message, connectionId, DatabaseErrorCode.SchemaError)
    { }

    public SchemaException(string message, string connectionId, Exception innerException)
        : base(message, connectionId, DatabaseErrorCode.SchemaError, innerException)
    { }
}

public class MigrationException : DatabaseException
{
    public string? MigrationId { get; }

    public MigrationException(string message)
        : base(message)
    {
        ErrorCode = DatabaseErrorCode.MigrationError;
    }

    public MigrationException(string message, string migrationId)
        : base(message)
    {
        ErrorCode = DatabaseErrorCode.MigrationError;
        MigrationId = migrationId;
    }

    public MigrationException(string message, string connectionId, string migrationId)
        : base(message, connectionId, DatabaseErrorCode.MigrationError)
    {
        MigrationId = migrationId;
    }

    public MigrationException(string message, string connectionId, string migrationId, Exception innerException)
        : base(message, connectionId, DatabaseErrorCode.MigrationError, innerException)
    {
        MigrationId = migrationId;
    }
}

public enum DatabaseErrorCode
{
    Unknown = 0,
    ConnectionFailed = 1000,
    ConnectionTimeout = 1001,
    AuthenticationFailed = 1002,
    AccessDenied = 1003,
    DatabaseNotFound = 1004,
    SchemaError = 2000,
    ObjectNotFound = 2001,
    ObjectAlreadyExists = 2002,
    MigrationError = 3000,
    MigrationExecutionFailed = 3001,
    RollbackFailed = 3002,
    TransactionFailed = 4000,
    ConstraintViolation = 4001,
    Deadlock = 4002,
    SerializationFailure = 4003
}