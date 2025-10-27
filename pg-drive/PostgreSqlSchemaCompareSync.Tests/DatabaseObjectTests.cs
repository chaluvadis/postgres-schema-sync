namespace PostgreSqlSchemaCompareSync.Tests;
public class DatabaseObjectTests
{
    [Fact]
    public void SplitStatements_RespectDollarQuotedBlocks()
    {
        var script = """
            CREATE FUNCTION public.say_hello(name text)
            RETURNS text AS $$
            BEGIN
                RETURN format('hello; %s', name);
            END;
            $$ LANGUAGE plpgsql;
            SELECT 1;
            """;
        var statements = SqlStatementSplitter.SplitStatements(script);
        Assert.Equal(2, statements.Length);
        Assert.Contains("CREATE FUNCTION", statements[0]);
        Assert.Contains("SELECT 1", statements[1]);
    }
    [Fact]
    public void GenerateDropSql_ForTrigger_UsesParentTableMetadata()
    {
        var difference = new SchemaDifference
        {
            ObjectType = ObjectType.Trigger,
            ObjectName = "audit_changes",
            Schema = "app",
            Metadata = new Dictionary<string, object?>
            {
                ["TableName"] = "transactions"
            }
        };
        var sql = MigrationScriptGenerator.GenerateDropSql(difference);
        Assert.Contains("DROP TRIGGER IF EXISTS \"audit_changes\" ON \"app\".\"transactions\"", sql);
        Assert.DoesNotContain("<table_name>", sql);
    }
    [Fact]
    public void GenerateDropSql_ForFunctionIncludesSignature()
    {
        var difference = new SchemaDifference
        {
            ObjectType = ObjectType.Function,
            ObjectName = "calculate_tax",
            Schema = "app",
            Metadata = new Dictionary<string, object?>
            {
                ["Signature"] = "numeric, numeric"
            }
        };
        var sql = MigrationScriptGenerator.GenerateDropSql(difference);
        Assert.Contains("DROP FUNCTION IF EXISTS \"app\".\"calculate_tax\"(numeric, numeric)", sql);
    }
}