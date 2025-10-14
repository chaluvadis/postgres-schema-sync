namespace PostgreSqlSchemaCompareSync.Core.Models;

public class QueryResult
{
    public int RowCount { get; set; }
    public List<QueryColumn> Columns { get; set; } = new();
    public List<List<object?>> Rows { get; set; } = new();
    public string? Error { get; set; }
    public string? ExecutionPlan { get; set; }
}

public class QueryColumn
{
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public bool Nullable { get; set; }
}

public class QueryOptions
{
    public int MaxRows { get; set; } = 1000;
    public int TimeoutSeconds { get; set; } = 30;
    public bool IncludeExecutionPlan { get; set; } = false;
    public CancellationToken? CancellationToken { get; set; }
}