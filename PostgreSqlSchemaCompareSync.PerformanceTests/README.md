# PostgreSQL Schema Compare & Sync - Performance Tests

This project contains comprehensive performance testing for the PostgreSQL Schema Compare & Sync solution.

## 🚀 Quick Start

### Prerequisites
- .NET 9.0 SDK
- PostgreSQL database (for integration tests)

### Running Performance Tests

```bash
# Run manual performance tests
dotnet run

# Run benchmarks with detailed metrics
dotnet run -- --benchmark

# Run specific test scenarios
dotnet run -- --scenario large-schema
```

## 📊 Test Scenarios

### 1. Schema Generation Performance
- **Small Schema**: 1,000 objects
- **Medium Schema**: 10,000 objects
- **Large Schema**: 50,000 objects
- **Extra Large Schema**: 100,000+ objects

### 2. Memory Usage Testing
- Memory consumption monitoring
- Garbage collection impact analysis
- Memory leak detection

### 3. Parallel Processing Performance
- Concurrent schema extraction
- Multi-threaded comparison operations
- Load balancing efficiency

### 4. Database Integration Testing
- Real database connection performance
- Query optimization analysis
- Network latency impact

## 🎯 Performance Metrics

### Key Performance Indicators
- **Throughput**: Objects processed per second
- **Latency**: Response time for operations
- **Memory Efficiency**: Memory usage per object
- **Scalability**: Performance degradation with size

### Benchmark Results
Run benchmarks to get detailed performance metrics including:
- Mean execution time
- Memory allocation
- Garbage collection impact
- Standard deviation

## 🔧 Configuration

### Test Database Setup
```sql
-- Create test database
CREATE DATABASE performance_test;

-- Create test schema
CREATE SCHEMA test_schema;
```

### Configuration Options
```json
{
  "PerformanceTests": {
    "MaxObjectCount": 100000,
    "ConcurrentTasks": 10,
    "MemoryLimitMB": 1024,
    "EnableDetailedLogging": true
  }
}
```

## 📈 Performance Optimization Tips

### For Large Schemas
1. **Use Parallel Processing**: Enable parallel extraction
2. **Batch Operations**: Process objects in chunks
3. **Memory Management**: Implement object pooling
4. **Caching**: Use intelligent caching strategies

### For High Throughput
1. **Connection Pooling**: Optimize connection usage
2. **Query Optimization**: Use efficient SQL queries
3. **Async Operations**: Implement proper async patterns
4. **Resource Management**: Dispose resources properly

## 🛠️ Development

### Adding New Tests
1. Create test method in `LoadTester.cs`
2. Add benchmark method in `SchemaPerformanceBenchmarks.cs`
3. Update configuration if needed

### Custom Scenarios
```csharp
public async Task CustomPerformanceTest()
{
    var schema = SchemaSimulator.GenerateLargeSchema(50000);
    var stopwatch = Stopwatch.StartNew();

    // Your test logic here

    Console.WriteLine($"Test completed in {stopwatch.ElapsedMilliseconds}ms");
}
```

## 📊 Monitoring & Debugging

### Performance Counters
- Object creation rate
- Memory allocation rate
- Database query performance
- Network I/O metrics

### Debugging Tips
- Use `--verbose` flag for detailed logging
- Monitor memory usage with `--memory`
- Enable tracing with `--trace`

## 🎯 Expected Performance

### Benchmarks (Approximate)
- **Small Schema (1K objects)**: < 100ms
- **Medium Schema (10K objects)**: < 1s
- **Large Schema (50K objects)**: < 5s
- **Memory Usage**: < 100MB for 100K objects

### Production Targets
- **Throughput**: > 10,000 objects/second
- **Memory Efficiency**: < 1KB per object
- **Error Rate**: < 0.1%
- **Availability**: > 99.9%

## 🚨 Troubleshooting

### Common Issues
1. **Memory Issues**: Reduce batch size or increase GC pressure
2. **Timeout Errors**: Increase command timeout values
3. **Connection Issues**: Check database connectivity
4. **Performance Issues**: Enable parallel processing

### Performance Tuning
1. **Database**: Optimize PostgreSQL configuration
2. **Application**: Adjust thread pool settings
3. **Memory**: Configure GC settings for large datasets
4. **Network**: Optimize connection pooling

## 📚 Related Documentation

- [Main Solution README](../README.md)
- [Architecture Guide](../docs/architecture.md)
- [API Documentation](../docs/api.md)
- [Deployment Guide](../docs/deployment.md)