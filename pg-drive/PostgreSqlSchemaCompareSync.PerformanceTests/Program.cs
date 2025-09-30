namespace PostgreSqlSchemaCompareSync.PerformanceTests;

public class Program
{
    public static void Main(string[] args)
    {
        Console.WriteLine("🚀 PostgreSQL Schema Compare & Sync - Performance Tests");
        Console.WriteLine("====================================================");

        // Test schema simulation performance
        TestSchemaSimulationPerformance();

        // Test object creation performance
        TestObjectCreationPerformance();

        // Test comparison performance
        TestComparisonPerformance();

        Console.WriteLine("\n✅ Performance testing completed!");
    }

    private static void TestSchemaSimulationPerformance()
    {
        Console.WriteLine("\n🎭 Testing schema simulation performance...");

        var sizes = new[] { 1000, 5000, 10000, 25000 };

        foreach (var size in sizes)
        {
            Console.WriteLine($"\n   📊 Simulating schema with {size} objects...");

            var stopwatch = Stopwatch.StartNew();
            var schema = SchemaSimulator.GenerateLargeSchema(size);
            stopwatch.Stop();

            Console.WriteLine($"      ⏱️  Generation time: {stopwatch.ElapsedMilliseconds}ms");
            Console.WriteLine($"      📈 Objects created: {schema.Count}");
            Console.WriteLine($"      ⚡ Performance: {size / (stopwatch.ElapsedMilliseconds / 1000.0):F2} objects/sec");

            // Validate schema integrity
            var tables = schema.OfType<Table>().Count();
            var views = schema.OfType<View>().Count();
            var functions = schema.OfType<Function>().Count();
            Console.WriteLine($"      📋 Tables: {tables}, Views: {views}, Functions: {functions}");
        }
    }

    private static void TestObjectCreationPerformance()
    {
        Console.WriteLine("\n🏗️  Testing object creation performance...");

        var sizes = new[] { 10000, 50000, 100000 };

        foreach (var size in sizes)
        {
            Console.WriteLine($"\n   🔧 Creating {size} objects...");

            var stopwatch = Stopwatch.StartNew();

            var objects = new List<DatabaseObject>();
            for (int i = 0; i < size; i++)
            {
                objects.Add(new Table
                {
                    Name = $"table_{i}",
                    Schema = "public",
                    Database = "test_db"
                });
            }

            stopwatch.Stop();

            Console.WriteLine($"      ⏱️  Creation time: {stopwatch.ElapsedMilliseconds}ms");
            Console.WriteLine($"      📈 Objects created: {objects.Count}");
            Console.WriteLine($"      ⚡ Performance: {size / (stopwatch.ElapsedMilliseconds / 1000.0):F2} objects/sec");
        }
    }

    private static void TestComparisonPerformance()
    {
        Console.WriteLine("\n⚖️  Testing comparison performance...");

        var sizes = new[] { 1000, 5000, 10000 };

        foreach (var size in sizes)
        {
            Console.WriteLine($"\n   🔍 Comparing schemas with {size} objects each...");

            // Create test schemas
            var sourceObjects = new List<DatabaseObject>();
            var targetObjects = new List<DatabaseObject>();

            for (int i = 0; i < size; i++)
            {
                sourceObjects.Add(new Table { Name = $"table_{i}", Schema = "public" });
                targetObjects.Add(new Table { Name = $"table_{i}", Schema = "public" });
            }

            var stopwatch = Stopwatch.StartNew();

            // Simulate comparison
            var differences = new List<SchemaDifference>();
            for (int i = 0; i < Math.Min(sourceObjects.Count, targetObjects.Count); i++)
            {
                if (sourceObjects[i].Name != targetObjects[i].Name)
                {
                    differences.Add(new SchemaDifference
                    {
                        Type = DifferenceType.Modified,
                        ObjectType = ObjectType.Table,
                        ObjectName = sourceObjects[i].Name
                    });
                }
            }

            stopwatch.Stop();

            Console.WriteLine($"      ⏱️  Comparison time: {stopwatch.ElapsedMilliseconds}ms");
            Console.WriteLine($"      📈 Objects compared: {size}");
            Console.WriteLine($"      🔍 Differences found: {differences.Count}");
            Console.WriteLine($"      ⚡ Performance: {size / (stopwatch.ElapsedMilliseconds / 1000.0):F2} objects/sec");
        }
    }
}