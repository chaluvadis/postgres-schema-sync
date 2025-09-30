namespace PostgreSqlSchemaCompareSync.PerformanceTests;
public class LoadTester
{
    private readonly ILogger<LoadTester> _logger;
    public LoadTester(ILogger<LoadTester> logger)
    {
        _logger = logger;
    }
    public async Task RunLoadTests()
    {
        Console.WriteLine("\n🔥 Load Testing Scenarios");
        Console.WriteLine("========================");
        // Test 1: Large schema comparison
        await TestLargeSchemaComparison();
        // Test 2: Memory usage with large datasets
        await TestMemoryUsage();
        // Test 3: Concurrent operations
        await TestConcurrentOperations();
        // Test 4: Stress test with extreme scenarios
        await TestStressScenarios();
    }
    private async Task TestLargeSchemaComparison()
    {
        Console.WriteLine("\n📊 Testing large schema comparison performance...");
        var stopwatch = Stopwatch.StartNew();
        try
        {
            // Generate large schemas
            var sourceSchema = SchemaSimulator.GenerateLargeSchema(50000);
            var targetSchema = SchemaSimulator.GenerateLargeSchema(50000);
            // Add some differences
            ModifySchemaForComparison(targetSchema);
            stopwatch.Restart();
            // Perform comparison
            // For performance testing, we'll create a simple comparison without DI
            var sourceObjectsDict = sourceSchema.GroupBy(obj => obj.Type).ToDictionary(g => g.Key, g => g.ToList());
            var targetObjectsDict = targetSchema.GroupBy(obj => obj.Type).ToDictionary(g => g.Key, g => g.ToList());

            var differences = new List<SchemaDifference>();
            foreach (var objectType in sourceObjectsDict.Keys.Union(targetObjectsDict.Keys).Distinct())
            {
                var sourceTypeObjects = sourceObjectsDict.GetValueOrDefault(objectType, new List<DatabaseObject>());
                var targetTypeObjects = targetObjectsDict.GetValueOrDefault(objectType, new List<DatabaseObject>());

                // Simple comparison logic for performance testing
                var sourceNames = sourceTypeObjects.Select(obj => obj.QualifiedName).ToHashSet();
                var targetNames = targetTypeObjects.Select(obj => obj.QualifiedName).ToHashSet();

                // Find added objects
                foreach (var targetObj in targetTypeObjects.Where(obj => !sourceNames.Contains(obj.QualifiedName)))
                {
                    differences.Add(new SchemaDifference
                    {
                        Type = DifferenceType.Added,
                        ObjectType = objectType,
                        ObjectName = targetObj.Name,
                        Schema = targetObj.Schema
                    });
                }

                // Find removed objects
                foreach (var sourceObj in sourceTypeObjects.Where(obj => !targetNames.Contains(obj.QualifiedName)))
                {
                    differences.Add(new SchemaDifference
                    {
                        Type = DifferenceType.Removed,
                        ObjectType = objectType,
                        ObjectName = sourceObj.Name,
                        Schema = sourceObj.Schema
                    });
                }
            }
            stopwatch.Stop();
            Console.WriteLine($"   ⏱️  Comparison time: {stopwatch.ElapsedMilliseconds}ms");
            Console.WriteLine($"   📈 Objects compared: {sourceSchema.Count}");
            Console.WriteLine($"   🔍 Differences found: {differences.Count}");
            Console.WriteLine($"   ⚡ Performance: {sourceSchema.Count / (stopwatch.ElapsedMilliseconds / 1000.0):F2} objects/sec");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"   ❌ Error: {ex.Message}");
        }
    }
    private async Task TestMemoryUsage()
    {
        Console.WriteLine("\n💾 Testing memory usage with large datasets...");
        var initialMemory = GC.GetTotalMemory(true);
        try
        {
            // Generate large schema
            var largeSchema = SchemaSimulator.GenerateLargeSchema(100000);
            // Force garbage collection
            GC.Collect();
            GC.WaitForPendingFinalizers();
            GC.Collect();
            var peakMemory = GC.GetTotalMemory(false);
            var memoryUsed = peakMemory - initialMemory;
            Console.WriteLine($"   📊 Objects created: {largeSchema.Count}");
            Console.WriteLine($"   💾 Memory used: {memoryUsed / 1024.0 / 1024.0:F2} MB");
            Console.WriteLine($"   📏 Avg per object: {memoryUsed / largeSchema.Count:F2} bytes");
            // Test memory efficiency
            var memoryPerObject = (double)memoryUsed / largeSchema.Count;
            if (memoryPerObject < 1000) // Less than 1KB per object
            {
                Console.WriteLine("   ✅ Memory efficient!");
            }
            else if (memoryPerObject < 5000) // Less than 5KB per object
            {
                Console.WriteLine("   ⚠️  Moderate memory usage");
            }
            else
            {
                Console.WriteLine("   ❌ High memory usage - consider optimization");
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"   ❌ Error: {ex.Message}");
        }
    }
    private async Task TestConcurrentOperations()
    {
        Console.WriteLine("\n🔄 Testing concurrent operations...");
        var stopwatch = Stopwatch.StartNew();
        try
        {
            var tasks = new List<Task<List<DatabaseObject>>>();
            // Simulate concurrent schema extractions
            for (int i = 0; i < 5; i++)
            {
                tasks.Add(Task.Run(() =>
                {
                    return SchemaSimulator.GenerateLargeSchema(10000);
                }));
            }
            var results = await Task.WhenAll(tasks);
            stopwatch.Stop();
            var totalObjects = results.Sum(r => r.Count);
            Console.WriteLine($"   ⏱️  Concurrent execution time: {stopwatch.ElapsedMilliseconds}ms");
            Console.WriteLine($"   📊 Total objects processed: {totalObjects}");
            Console.WriteLine($"   👥 Concurrent tasks: {tasks.Count}");
            Console.WriteLine($"   ⚡ Throughput: {totalObjects / (stopwatch.ElapsedMilliseconds / 1000.0):F2} objects/sec");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"   ❌ Error: {ex.Message}");
        }
    }
    private async Task TestStressScenarios()
    {
        Console.WriteLine("\n⚡ Testing stress scenarios...");
        var scenarios = new[]
        {
            ("Small Schema", 1000),
            ("Medium Schema", 10000),
            ("Large Schema", 50000),
            ("Extra Large Schema", 100000)
        };
        foreach (var (name, size) in scenarios)
        {
            Console.WriteLine($"\n   🧪 Testing {name} ({size} objects)...");
            var stopwatch = Stopwatch.StartNew();
            try
            {
                // Generate schema
                var schema = SchemaSimulator.GenerateLargeSchema(size);
                // Test serialization (if needed)
                var jsonSize = System.Text.Json.JsonSerializer.Serialize(schema).Length;
                // Test grouping operations
                var groupedByType = schema.GroupBy(o => o.Type).ToDictionary(g => g.Key, g => g.ToList());
                stopwatch.Stop();
                Console.WriteLine($"      ⏱️  Generation time: {stopwatch.ElapsedMilliseconds}ms");
                Console.WriteLine($"      📊 Objects created: {schema.Count}");
                Console.WriteLine($"      🏷️  Object types: {groupedByType.Count}");
                Console.WriteLine($"      📏 JSON size: {jsonSize / 1024.0:F2} KB");
                // Performance assessment
                var objectsPerSecond = size / (stopwatch.ElapsedMilliseconds / 1000.0);
                if (objectsPerSecond > 10000)
                {
                    Console.WriteLine("      ✅ Excellent performance!");
                }
                else if (objectsPerSecond > 5000)
                {
                    Console.WriteLine("      ⚠️  Good performance");
                }
                else
                {
                    Console.WriteLine("      ❌ Needs optimization");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"      ❌ Error: {ex.Message}");
            }
        }
    }
    private void ModifySchemaForComparison(List<DatabaseObject> schema)
    {
        // Add some differences to make comparison interesting
        if (schema.Count > 100)
        {
            // Modify some objects
            for (int i = 0; i < Math.Min(50, schema.Count / 10); i++)
            {
                if (schema[i] is Table table)
                {
                    table.RowCount = 999999; // Different row count
                }
            }
            // Add some new objects
            schema.Add(new Table
            {
                Name = "new_performance_test_table",
                Schema = "public",
                Database = "test_db"
            });
        }
    }
}