namespace PostgreSqlSchemaCompareSync.Core.Models;

public class DatabaseObject
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Name { get; set; } = string.Empty;
    public ObjectType Type { get; set; }
    public string Schema { get; set; } = string.Empty;
    public string Database { get; set; } = string.Empty;
    public string Owner { get; set; } = string.Empty;
    public long? SizeInBytes { get; set; }
    public string? Definition { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? ModifiedAt { get; set; }
    public List<string> Dependencies { get; set; } = [];
    public List<string> Dependents { get; set; } = [];
    public Dictionary<string, object> Properties { get; set; } = [];
}

public enum ObjectType
{
    Table,
    View,
    Function,
    Procedure,
    Sequence,
    Type,
    Domain,
    Index,
    Trigger,
    Constraint,
    Column,
    Schema,
    Collation,
    Extension,
    Role,
    Tablespace,
    Unknown
}

public class DatabaseObjectDetails : DatabaseObject
{
    public List<ColumnInfo> Columns { get; set; } = [];
    public List<IndexInfo> Indexes { get; set; } = [];
    public List<ConstraintInfo> Constraints { get; set; } = [];
    public List<TriggerInfo> Triggers { get; set; } = [];
    public Dictionary<string, object> AdditionalInfo { get; set; } = [];
}

public class ColumnInfo
{
    public string Name { get; set; } = string.Empty;
    public string DataType { get; set; } = string.Empty;
    public bool IsNullable { get; set; }
    public string? DefaultValue { get; set; }
    public int? MaxLength { get; set; }
    public int? Precision { get; set; }
    public int? Scale { get; set; }
    public bool IsPrimaryKey { get; set; }
    public bool IsForeignKey { get; set; }
    public string? References { get; set; }
}
public class IndexInfo
{
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public List<string> Columns { get; set; } = [];
    public bool IsUnique { get; set; }
    public bool IsPrimary { get; set; }
    public string? Condition { get; set; }
}

public class ConstraintInfo
{
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public List<string> Columns { get; set; } = [];
    public string? CheckClause { get; set; }
    public string? References { get; set; }
}

public class TriggerInfo
{
    public string Name { get; set; } = string.Empty;
    public string Event { get; set; } = string.Empty;
    public string Timing { get; set; } = string.Empty;
    public string Function { get; set; } = string.Empty;
    public string? Condition { get; set; }
}