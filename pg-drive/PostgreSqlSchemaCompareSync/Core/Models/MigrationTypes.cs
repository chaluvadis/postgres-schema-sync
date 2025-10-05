namespace PostgreSqlSchemaCompareSync.Core.Models;

public class MigrationScript
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public SchemaComparison Comparison { get; set; } = new SchemaComparison();
    public List<SchemaDifference> SelectedDifferences { get; set; } = [];
    public string SqlScript { get; set; } = string.Empty;
    public string RollbackScript { get; set; } = string.Empty;
    public MigrationType Type { get; set; } = MigrationType.Schema;
    public bool IsDryRun { get; set; }
    public MigrationStatus Status { get; set; } = MigrationStatus.Pending;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public TimeSpan? ExecutionTime { get; set; }
    public string? ExecutionLog { get; set; }
    public int OperationCount => SqlScript.Split('\n').Length;
}

public class MigrationResult
{
    public string Status { get; set; } = "Unknown";
    public TimeSpan ExecutionTime { get; set; }
    public int OperationsExecuted { get; set; }
    public List<string> Errors { get; set; } = [];
    public List<string> Warnings { get; set; } = [];
}

public class MigrationOptions
{
    public MigrationType Type { get; set; } = MigrationType.Schema;
    public bool GenerateRollbackScript { get; set; } = true;
    public bool IsDryRun { get; set; } = false;
    public int BatchSize { get; set; } = 50;
    public bool ContinueOnError { get; set; } = false;
    public bool ParallelExecution { get; set; } = false;
}

public class SchemaComparison
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public ConnectionInfo SourceConnection { get; set; } = new ConnectionInfo();
    public ConnectionInfo TargetConnection { get; set; } = new ConnectionInfo();
    public ComparisonMode Mode { get; set; } = ComparisonMode.Strict;
    public List<string> SourceSchemas { get; set; } = [];
    public List<string> TargetSchemas { get; set; } = [];
    public List<SchemaDifference> Differences { get; set; } = [];
    public TimeSpan ExecutionTime { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class SchemaDifference
{
    public DifferenceType Type { get; set; }
    public ObjectType ObjectType { get; set; }
    public string ObjectName { get; set; } = string.Empty;
    public string Schema { get; set; } = string.Empty;
    public string? SourceDefinition { get; set; }
    public string? TargetDefinition { get; set; }
    public List<string> DifferenceDetails { get; set; } = [];
}

public class MigrationComparisonOptions
{
    public ComparisonMode Mode { get; set; } = ComparisonMode.Strict;
    public List<string> IgnoreSchemas { get; set; } = [];
    public List<ObjectType> ObjectTypes { get; set; } = [];
    public bool IncludeSystemObjects { get; set; } = false;
}

public enum MigrationType
{
    Schema,
    Data,
    Full
}

public enum MigrationStatus
{
    Pending,
    Running,
    Completed,
    Failed,
    RolledBack,
    RollingBack
}

public enum DifferenceType
{
    Added,
    Removed,
    Modified,
    Moved
}

public enum ComparisonMode
{
    Strict,
    Lenient
}