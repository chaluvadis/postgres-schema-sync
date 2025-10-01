# PostgreSQL Schema Compare & Sync - .NET Integration

This directory contains the .NET components that provide the backend functionality for the PostgreSQL Schema Compare & Sync VSCode extension.

## Architecture

The .NET integration consists of:

- **PostgreSqlWrapper**: Main wrapper class that exposes PostgreSQL operations to Node.js via Edge.js
- **Core Services**: Connection management, schema comparison, and migration execution
- **Configuration**: Application settings and logging configuration

## Components

### PostgreSqlWrapper Class

The `PostgreSqlWrapper` class is the main entry point for Node.js integration:

```csharp
public class PostgreSqlWrapper
{
    // Connection management
    public async Task<bool> TestConnectionAsync(dynamic connectionInfo)

    // Schema operations
    public async Task<List<dynamic>> BrowseSchemaAsync(dynamic connectionInfo, string schemaFilter = null)
    public async Task<dynamic> CompareSchemasAsync(dynamic sourceConnection, dynamic targetConnection, dynamic options)

    // Migration operations
    public async Task<dynamic> GenerateMigrationAsync(dynamic comparison, dynamic options)
    public async Task<dynamic> ExecuteMigrationAsync(dynamic migration, dynamic targetConnection)

    // Object details
    public async Task<dynamic> GetObjectDetailsAsync(dynamic connectionInfo, string objectType, string schema, string objectName)

    // Health monitoring
    public dynamic GetSystemHealth()
}
```

## Data Models

### ConnectionInfo
Represents database connection parameters:
- `Id`, `Name`: Connection identifier and display name
- `Host`, `Port`, `Database`: Connection details
- `Username`, `Password`: Authentication credentials
- `CreatedDate`: When the connection was created

### SchemaComparison
Contains schema comparison results:
- `Id`: Unique comparison identifier
- `SourceConnection`, `TargetConnection`: Connection information
- `Differences`: List of schema differences found
- `ExecutionTime`: How long the comparison took
- `CreatedAt`: When the comparison was performed

### MigrationScript
Represents a generated migration script:
- `Id`: Unique migration identifier
- `SqlScript`: The SQL commands to execute
- `RollbackScript`: Commands to reverse the migration
- `Status`: Current migration status (Pending, Executing, Completed, Failed)
- `Type`: Schema or Data migration

## Building the .NET Library

### Prerequisites
- .NET 6.0 SDK or later
- Node.js 16+ (for Edge.js compatibility)

### Build Steps

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Build .NET Library**
   ```bash
   npm run build:dotnet
   ```

3. **Verify Build**
   The build script will:
   - Check for .NET SDK availability
   - Restore NuGet packages
   - Compile the C# code
   - Output DLL to `bin/` directory

### Manual Build (if needed)

```bash
cd src/dotnet
dotnet restore
dotnet build --configuration Release --output ../../bin
```

## Integration with Node.js

The .NET library integrates with Node.js using Edge.js:

```typescript
import { DotNetIntegrationService } from './services/DotNetIntegrationService';

const dotNetService = DotNetIntegrationService.getInstance();

// Test database connection
const isConnected = await dotNetService.testConnection(connectionInfo);

// Browse database schema
const schemaObjects = await dotNetService.browseSchema(connectionInfo);

// Compare schemas
const comparison = await dotNetService.compareSchemas(sourceConn, targetConn, options);

// Generate migration
const migration = await dotNetService.generateMigration(comparison, options);

// Execute migration
const result = await dotNetService.executeMigration(migration, targetConn);
```

## Configuration

### Application Settings

The `appsettings.json` file contains configuration for:

- **Connection Management**: Timeouts, pooling, retry policies
- **Schema Comparison**: Default modes, ignored schemas, performance settings
- **Migration**: Batch sizes, transaction modes, rollback generation
- **Logging**: Log levels, output formatting
- **Health Monitoring**: Health check intervals and thresholds

### Environment Variables

You can override settings using environment variables:

```bash
export PostgreSqlSchemaCompareSync__ConnectionTimeout=60
export PostgreSqlSchemaCompareSync__Logging__LogLevel__Default=Debug
```

## Error Handling

The .NET integration includes comprehensive error handling:

- **Connection Errors**: Database connectivity issues, authentication failures
- **Schema Errors**: Invalid object references, permission issues
- **Migration Errors**: SQL execution failures, constraint violations
- **Edge.js Errors**: Interop communication failures

All errors are logged with appropriate severity levels and include detailed context for troubleshooting.

## Logging

The .NET components use structured logging with the following levels:

- **Trace**: Detailed diagnostic information
- **Debug**: Development-time information
- **Information**: General operational messages
- **Warning**: Recoverable issues
- **Error**: Serious problems requiring attention
- **Critical**: System failures requiring immediate action

Logs are output to the console and can be captured by the Node.js application for display in VSCode.

## Performance Considerations

- **Connection Pooling**: Reuse database connections to improve performance
- **Parallel Processing**: Schema comparisons can use multiple threads
- **Batch Operations**: Large migrations are processed in configurable batches
- **Caching**: Metadata caching reduces redundant database queries
- **Resource Management**: Proper disposal of connections and resources

## Troubleshooting

### Common Issues

1. **Edge.js Not Found**
   - Ensure Edge.js is installed: `npm install edge-js`
   - Check .NET DLL path in `getDotNetDllPath()`

2. **Connection Failures**
   - Verify database server is accessible
   - Check connection credentials
   - Review firewall and network settings

3. **Build Errors**
   - Ensure .NET 6.0+ SDK is installed
   - Check NuGet package sources
   - Verify C# syntax and references

4. **Performance Issues**
   - Adjust batch sizes in configuration
   - Enable connection pooling
   - Check database server resources

### Debug Mode

Enable debug logging by setting the log level in `appsettings.json`:

```json
{
  "Logging": {
    "LogLevel": {
      "PostgreSqlSchemaCompareSync": "Debug"
    }
  }
}
```

## Security Considerations

- **Credential Encryption**: Database passwords are encrypted in transit
- **Access Control**: Operations require appropriate permissions
- **Audit Logging**: All operations are logged for compliance
- **Input Validation**: All inputs are validated and sanitized
- **Error Information**: Sensitive information is not exposed in error messages

## Development

### Adding New Operations

1. Add method to `PostgreSqlWrapper` class
2. Create corresponding Edge.js function in `DotNetIntegrationService`
3. Add TypeScript interface definitions
4. Update simulation methods as fallback
5. Add comprehensive error handling

### Testing

The .NET integration includes:
- Unit tests for individual components
- Integration tests for service interactions
- End-to-end tests for complete workflows
- Performance tests for scalability validation

Run tests with:
```bash
npm run test:unit
npm run test:integration
npm run test:e2e
```

## Deployment

For production deployment:

1. Build .NET library in Release configuration
2. Copy DLL to appropriate directory
3. Configure connection strings and settings
4. Set up logging and monitoring
5. Implement health checks and alerting

## Support

For issues and questions:
- Check the troubleshooting section above
- Review the audit logs for detailed error information
- Enable debug logging for development environments
- Consult the comprehensive test suite for usage examples