namespace PostgreSqlSchemaCompareSync.Core.Models;
public abstract class DatabaseObject
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string Schema { get; set; } = string.Empty;
    public string Database { get; set; } = string.Empty;
    public ObjectType Type { get; set; }
    public string QualifiedName => $"{Database}.{Schema}.{Name}";
    public DateTime CreatedAt { get; set; }
    public DateTime? ModifiedAt { get; set; }
    public string Owner { get; set; } = string.Empty;
    public long? SizeInBytes { get; set; }
    public Dictionary<string, string> Properties { get; set; } = [];
    public List<string> Dependencies { get; set; } = [];
    [JsonIgnore]
    public abstract string Definition { get; }
    public override string ToString() => QualifiedName;
}
public enum ObjectType
{
    Database,
    Schema,
    Table,
    View,
    Function,
    Procedure,
    Trigger,
    Index,
    Constraint,
    Sequence,
    Type,
    Domain,
    Collation,
    Extension,
    Role,
    Tablespace
}
public class Table : DatabaseObject
{
    public List<Column> Columns { get; set; } = [];
    public List<Index> Indexes { get; set; } = [];
    public List<Constraint> Constraints { get; set; } = [];
    public List<Trigger> Triggers { get; set; } = [];
    public TableStorageParameters StorageParameters { get; set; } = new();
    public long? RowCount { get; set; }
    public override string Definition =>
        $"CREATE TABLE {QualifiedName} (\n" +
        $"  {string.Join(",\n  ", Columns.Select(c => c.Definition))}\n);";
}
public class Column
{
    public string Name { get; set; } = string.Empty;
    public string DataType { get; set; } = string.Empty;
    public bool IsNullable { get; set; }
    public string? DefaultValue { get; set; }
    public string? Comment { get; set; }
    public int? MaxLength { get; set; }
    public int? Precision { get; set; }
    public int? Scale { get; set; }
    public bool IsPrimaryKey { get; set; }
    public bool IsForeignKey { get; set; }
    public string? ForeignKeyReference { get; set; }
    public string Definition =>
        $"{Name} {DataType}" +
        $"{(IsNullable ? "" : " NOT NULL")}" +
        $"{(DefaultValue != null ? $" DEFAULT {DefaultValue}" : "")}";
}
public class View : DatabaseObject
{
    public string SourceCode { get; set; } = string.Empty;
    public List<string> ReferencedTables { get; set; } = [];
    public List<Column> Columns { get; set; } = [];
    public override string Definition => SourceCode;
}
public class Function : DatabaseObject
{
    public string SourceCode { get; set; } = string.Empty;
    public string Language { get; set; } = string.Empty;
    public string ReturnType { get; set; } = string.Empty;
    public List<FunctionParameter> Parameters { get; set; } = [];
    public bool IsAggregate { get; set; }
    public bool IsWindowFunction { get; set; }
    public string Volatility { get; set; } = "VOLATILE"; // VOLATILE, STABLE, IMMUTABLE
    public override string Definition => SourceCode;
}
public class FunctionParameter
{
    public string Name { get; set; } = string.Empty;
    public string DataType { get; set; } = string.Empty;
    public ParameterMode Mode { get; set; } = ParameterMode.IN;
    public string? DefaultValue { get; set; }
}
public enum ParameterMode
{
    IN,
    OUT,
    INOUT,
    VARIADIC
}
public class TableIndex : DatabaseObject
{
    public string TableName { get; set; } = string.Empty;
    public List<string> ColumnNames { get; set; } = [];
    public bool IsUnique { get; set; }
    public string IndexType { get; set; } = string.Empty;
    public string AccessMethod { get; set; } = string.Empty;
    public Dictionary<string, string> Options { get; set; } = [];
    public override string Definition =>
        $"CREATE {(IsUnique ? "UNIQUE " : "")}INDEX {Name} ON {TableName} " +
        $"USING {AccessMethod} ({string.Join(", ", ColumnNames)});";
}
public class Constraint : DatabaseObject
{
    public string TableName { get; set; } = string.Empty;
    public new ConstraintType Type { get; set; }
    public string Expression { get; set; } = string.Empty;
    public List<string> ColumnNames { get; set; } = [];
    public string? ReferencedTable { get; set; }
    public List<string>? ReferencedColumns { get; set; }
    public override string Definition
    {
        get
        {
            return Type switch
            {
                ConstraintType.PrimaryKey => $"ALTER TABLE {TableName} ADD CONSTRAINT {Name} PRIMARY KEY ({string.Join(", ", ColumnNames)});",
                ConstraintType.ForeignKey => $"ALTER TABLE {TableName} ADD CONSTRAINT {Name} FOREIGN KEY ({string.Join(", ", ColumnNames)}) REFERENCES {ReferencedTable}({string.Join(", ", ReferencedColumns ?? [])});",
                ConstraintType.Unique => $"ALTER TABLE {TableName} ADD CONSTRAINT {Name} UNIQUE ({string.Join(", ", ColumnNames)});",
                ConstraintType.Check => $"ALTER TABLE {TableName} ADD CONSTRAINT {Name} CHECK ({Expression});",
                _ => $"-- Constraint {Name} of type {Type}"
            };
        }
    }
}
public enum ConstraintType
{
    PrimaryKey,
    ForeignKey,
    Unique,
    Check,
    NotNull,
    Default
}
public class Trigger : DatabaseObject
{
    public string TableName { get; set; } = string.Empty;
    public string FunctionName { get; set; } = string.Empty;
    public string Events { get; set; } = string.Empty; // BEFORE, AFTER, INSTEAD OF
    public string Timing { get; set; } = string.Empty; // ROW, STATEMENT
    public List<string> Columns { get; set; } = [];
    public override string Definition =>
        $"CREATE TRIGGER {Name} {Events} {Timing} ON {TableName}\n" +
        $"  FOR EACH {(Timing == "ROW" ? "ROW" : "STATEMENT")}\n" +
        $"  EXECUTE FUNCTION {FunctionName}();";
}
public class Sequence : DatabaseObject
{
    public long StartValue { get; set; }
    public long Increment { get; set; } = 1;
    public long? MinValue { get; set; }
    public long? MaxValue { get; set; }
    public long LastValue { get; set; }
    public bool IsCycled { get; set; }
    public override string Definition =>
        $"CREATE SEQUENCE {QualifiedName}\n" +
        $"  START WITH {StartValue}\n" +
        $"  INCREMENT BY {Increment}\n" +
        $"{(MinValue.HasValue ? $"  MINVALUE {MinValue.Value}\n" : "")}" +
        $"{(MaxValue.HasValue ? $"  MAXVALUE {MaxValue.Value}\n" : "")}" +
        $"  {(IsCycled ? "CYCLE" : "NO CYCLE")};";
}
public class Type : DatabaseObject
{
    public string InternalName { get; set; } = string.Empty;
    public string BaseType { get; set; } = string.Empty;
    public string InputFunction { get; set; } = string.Empty;
    public string OutputFunction { get; set; } = string.Empty;
    public string ReceiveFunction { get; set; } = string.Empty;
    public string SendFunction { get; set; } = string.Empty;
    public List<TypeAttribute> Attributes { get; set; } = [];
    public override string Definition
    {
        get
        {
            if (Attributes.Count != 0)
            {
                return $"CREATE TYPE {QualifiedName} AS (\n" +
                       $"  {string.Join(",\n  ", Attributes.Select(a => $"{a.Name} {a.DataType}"))}\n);";
            }
            else
            {
                return $"CREATE TYPE {QualifiedName} (\n" +
                       $"  INPUT = {InputFunction},\n" +
                       $"  OUTPUT = {OutputFunction},\n" +
                       $"  RECEIVE = {ReceiveFunction},\n" +
                       $"  SEND = {SendFunction},\n" +
                       $"  INTERNALLENGTH = VARIABLE\n);";
            }
        }
    }
}
public class TypeAttribute
{
    public string Name { get; set; } = string.Empty;
    public string DataType { get; set; } = string.Empty;
}

public class Domain : DatabaseObject
{
    public string BaseType { get; set; } = string.Empty;
    public string? DefaultValue { get; set; }
    public string? CheckConstraint { get; set; }
    public override string Definition =>
        $"CREATE DOMAIN {QualifiedName} AS {BaseType}" +
        $"{(DefaultValue != null ? $" DEFAULT {DefaultValue}" : "")}" +
        $"{(CheckConstraint != null ? $" CHECK ({CheckConstraint})" : "")};";
}

public class Collation : DatabaseObject
{
    public string? Collate { get; set; }
    public string? Ctype { get; set; }
    public string Provider { get; set; } = string.Empty;
    public bool IsDeterministic { get; set; }
    public override string Definition =>
        $"CREATE COLLATION {QualifiedName} (provider = {Provider}, deterministic = {IsDeterministic}" +
        $"{(Collate != null ? $", collate = {Collate}" : "")}" +
        $"{(Ctype != null ? $", ctype = {Ctype}" : "")});";
}

public class Extension : DatabaseObject
{
    public string ExtVersion { get; set; } = string.Empty;
    public Dictionary<string, string> Configuration { get; set; } = [];
    public override string Definition =>
        $"CREATE EXTENSION IF NOT EXISTS {Name}" +
        $"{(!string.IsNullOrEmpty(ExtVersion) ? $" VERSION {ExtVersion}" : "")}" +
        $"{(Configuration.Any() ? $" WITH SCHEMA {Schema}" : "")};";
}

public class Role : DatabaseObject
{
    public bool IsSuperuser { get; set; }
    public bool CanCreateDatabases { get; set; }
    public bool CanCreateRoles { get; set; }
    public bool CanLogin { get; set; }
    public string? Password { get; set; }
    public string? ValidUntil { get; set; }
    public List<string> MemberOf { get; set; } = [];
    public override string Definition =>
        $"CREATE ROLE {Name}" +
        $"{(IsSuperuser ? " SUPERUSER" : " NOSUPERUSER")}" +
        $"{(CanCreateDatabases ? " CREATEDB" : " NOCREATEDB")}" +
        $"{(CanCreateRoles ? " CREATEROLE" : " NOCREATEROLE")}" +
        $"{(CanLogin ? " LOGIN" : " NOLOGIN")}" +
        $"{(Password != null ? $" PASSWORD '{Password}'" : "")}" +
        $"{(ValidUntil != null ? $" VALID UNTIL '{ValidUntil}'" : "")};";
}

public class Tablespace : DatabaseObject
{
    public string Location { get; set; } = string.Empty;
    public new string Owner { get; set; } = string.Empty;
    public Dictionary<string, string> Options { get; set; } = [];
    public override string Definition =>
        $"CREATE TABLESPACE {Name} OWNER {Owner} LOCATION '{Location}'" +
        $"{(Options.Any() ? $" WITH ({string.Join(", ", Options.Select(o => $"{o.Key} = {o.Value}"))})" : "")};";
}
public class TableStorageParameters
{
    public string? FillFactor { get; set; }
    public string? AutoVacuumEnabled { get; set; }
    public string? ToastAutoVacuumEnabled { get; set; }
    public Dictionary<string, string> CustomParameters { get; set; } = [];
}

public class DatabaseObjectDetails
{
    public DatabaseObject? Object { get; set; }
    public List<DatabaseObject> Dependencies { get; set; } = [];
    public List<DatabaseObject> Dependents { get; set; } = [];
    public Dictionary<string, object> AdditionalInfo { get; set; } = [];
}