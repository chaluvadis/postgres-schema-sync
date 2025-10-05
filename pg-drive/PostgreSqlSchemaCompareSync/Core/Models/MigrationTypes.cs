namespace PostgreSqlSchemaCompareSync.Core.Models
{
    /// <summary>
    /// Migration script information
    /// </summary>
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

    /// <summary>
    /// Migration execution result
    /// </summary>
    public class MigrationResult
    {
        public string Status { get; set; } = "Unknown";
        public TimeSpan ExecutionTime { get; set; }
        public int OperationsExecuted { get; set; }
        public List<string> Errors { get; set; } = [];
        public List<string> Warnings { get; set; } = [];
    }

    /// <summary>
    /// Migration options for generation and execution
    /// </summary>
    public class MigrationOptions
    {
        public MigrationType Type { get; set; } = MigrationType.Schema;
        public bool GenerateRollbackScript { get; set; } = true;
        public bool IsDryRun { get; set; } = false;
        public int BatchSize { get; set; } = 50;
        public bool ContinueOnError { get; set; } = false;
        public bool ParallelExecution { get; set; } = false;
    }

    /// <summary>
    /// Schema comparison result
    /// </summary>
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

    /// <summary>
    /// Schema difference information
    /// </summary>
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

    /// <summary>
    /// Comparison options
    /// </summary>
    public class MigrationComparisonOptions
    {
        public ComparisonMode Mode { get; set; } = ComparisonMode.Strict;
        public List<string> IgnoreSchemas { get; set; } = [];
        public List<ObjectType> ObjectTypes { get; set; } = [];
        public bool IncludeSystemObjects { get; set; } = false;
    }

    /// <summary>
    /// Types of migrations supported
    /// </summary>
    public enum MigrationType
    {
        Schema,
        Data,
        Full
    }

    /// <summary>
    /// Migration execution status
    /// </summary>
    public enum MigrationStatus
    {
        Pending,
        Running,
        Completed,
        Failed,
        RolledBack,
        RollingBack
    }

    /// <summary>
    /// Types of schema differences
    /// </summary>
    public enum DifferenceType
    {
        Added,
        Removed,
        Modified,
        Moved
    }

    /// <summary>
    /// Comparison modes
    /// </summary>
    public enum ComparisonMode
    {
        Strict,
        Lenient
    }
}