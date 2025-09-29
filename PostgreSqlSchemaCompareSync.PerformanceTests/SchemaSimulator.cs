namespace PostgreSqlSchemaCompareSync.PerformanceTests;

public static class SchemaSimulator
{
    public static List<DatabaseObject> GenerateLargeSchema(int objectCount = 10000)
    {
        var objects = new List<DatabaseObject>();
        var schemas = GenerateSchemas(10);

        Console.WriteLine($"🔧 Generating large schema with {objectCount} objects...");

        // Generate tables (40% of objects)
        var tableCount = (int)(objectCount * 0.4);
        objects.AddRange(GenerateTables(tableCount, schemas));

        // Generate views (15% of objects)
        var viewCount = (int)(objectCount * 0.15);
        objects.AddRange(GenerateViews(viewCount, schemas));

        // Generate functions (15% of objects)
        var functionCount = (int)(objectCount * 0.15);
        objects.AddRange(GenerateFunctions(functionCount, schemas));

        // Generate indexes (20% of objects)
        var indexCount = (int)(objectCount * 0.2);
        objects.AddRange(GenerateIndexes(indexCount, schemas));

        // Generate remaining objects
        var remainingCount = objectCount - objects.Count;
        objects.AddRange(GenerateAdditionalObjects(remainingCount, schemas));

        Console.WriteLine($"✅ Generated {objects.Count} objects across {schemas.Count} schemas");
        return objects;
    }

    private static List<string> GenerateSchemas(int count)
    {
        var schemas = new List<string> { "public" };
        for (int i = 1; i < count; i++)
        {
            schemas.Add($"schema_{i}");
        }
        return schemas;
    }

    private static IEnumerable<Table> GenerateTables(int count, List<string> schemas)
    {
        Console.Write($"   📋 Generating {count} tables...");
        var tables = new List<Table>();

        for (int i = 0; i < count; i++)
        {
            var schema = schemas[i % schemas.Count];
            var table = new Table
            {
                Name = $"table_{i}",
                Schema = schema,
                Database = "test_db",
                RowCount = 1000
            };

            // Generate columns
            var columnCount = 5;
            for (int j = 0; j < columnCount; j++)
            {
                table.Columns.Add(new Column
                {
                    Name = $"column_{j}",
                    DataType = "integer",
                    IsNullable = true
                });
            }
            tables.Add(table);
        }
        Console.WriteLine(" ✓");
        return tables;
    }

    private static IEnumerable<View> GenerateViews(int count, List<string> schemas)
    {
        Console.Write($"   👁️  Generating {count} views...");
        var views = new List<View>();

        for (int i = 0; i < count; i++)
        {
            var schema = schemas[i % schemas.Count];
            var view = new View
            {
                Name = $"view_{i}",
                Schema = schema,
                Database = "test_db",
                SourceCode = $"SELECT * FROM table_{i % 1000}"
            };
            views.Add(view);
        }
        Console.WriteLine(" ✓");
        return views;
    }

    private static IEnumerable<Function> GenerateFunctions(int count, List<string> schemas)
    {
        Console.Write($"   ⚙️  Generating {count} functions...");
        var functions = new List<Function>();

        for (int i = 0; i < count; i++)
        {
            var schema = schemas[i % schemas.Count];
            var function = new Function
            {
                Name = $"function_{i}",
                Schema = schema,
                Database = "test_db",
                ReturnType = "integer",
                Language = "sql",
                Volatility = "VOLATILE",
                SourceCode = $"CREATE FUNCTION function_{i}() RETURNS integer AS 'SELECT 1;' LANGUAGE sql;"
            };
            functions.Add(function);
        }
        Console.WriteLine(" ✓");
        return functions;
    }

    private static IEnumerable<Core.Models.Index> GenerateIndexes(int count, List<string> schemas)
    {
        Console.Write($"   📇 Generating {count} indexes...");
        var indexes = new List<Core.Models.Index>();

        for (int i = 0; i < count; i++)
        {
            var schema = schemas[i % schemas.Count];
            var index = new Core.Models.Index
            {
                Name = $"index_{i}",
                Schema = schema,
                Database = "test_db",
                TableName = $"table_{i % 1000}",
                IsUnique = false,
                AccessMethod = "btree"
            };
            index.ColumnNames.Add("column_0");
            indexes.Add(index);
        }
        Console.WriteLine(" ✓");
        return indexes;
    }

    private static IEnumerable<DatabaseObject> GenerateAdditionalObjects(int count, List<string> schemas)
    {
        var objects = new List<DatabaseObject>();

        for (int i = 0; i < count; i++)
        {
            var schema = schemas[i % schemas.Count];
            objects.Add(new Sequence
            {
                Name = $"sequence_{i}",
                Schema = schema,
                Database = "test_db",
                StartValue = 1,
                Increment = 1
            });
        }

        return objects;
    }
}