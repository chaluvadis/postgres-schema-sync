# PostgreSQL Schema Compare & Sync - VSCode Extension

This VSCode extension provides enterprise-grade PostgreSQL schema management directly in your development environment.

## Features

- 🔗 **Multi-environment connection management** with secure credential storage
- 🌳 **Visual database schema explorer** with hierarchical tree view
- ⚖️ **Advanced schema comparison** with visual diff display
- 🔄 **Migration generation and execution** with rollback support
- 🛡️ **Enterprise-grade security** with encrypted credential storage
- ⚡ **High-performance** schema operations with intelligent caching

## Getting Started

### Installation

1. Open VSCode
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for "PostgreSQL Schema Compare & Sync"
4. Click "Install"

### First Steps

1. **Add Database Connection**
   - Click the PostgreSQL icon in the Activity Bar
   - Click the "+" button to add a new connection
   - Enter your database connection details

2. **Explore Schema**
   - Browse your database objects in the tree view
   - Expand schemas to see tables, views, functions, and more

3. **Compare Schemas**
   - Select source and target databases
   - Run schema comparison to identify differences

4. **Generate & Execute Migrations**
   - Generate migration scripts from schema differences
   - Preview changes before execution
   - Execute migrations with progress tracking

## Commands

All commands are available through the Command Palette (`Ctrl+Shift+P`):

| Command | Description |
|---------|-------------|
| `PostgreSQL: Add Connection` | Add a new database connection |
| `PostgreSQL: Compare Schemas` | Compare schemas between databases |
| `PostgreSQL: Generate Migration` | Create migration script |
| `PostgreSQL: Execute Migration` | Run migration on target database |
| `PostgreSQL: View Object Details` | Show detailed object information |
| `PostgreSQL: Show Help` | Display help and documentation |

## Configuration

Configure the extension through VSCode settings:

```json
{
  "postgresql-schema-sync.compare.mode": "strict",
  "postgresql-schema-sync.compare.ignoreSchemas": ["information_schema", "pg_*"],
  "postgresql-schema-sync.migration.dryRun": true,
  "postgresql-schema-sync.notifications.enabled": true
}
```

## Architecture

This extension integrates with a powerful .NET backend that provides:

- **Advanced Connection Management**: Connection pooling, health monitoring, auto-recovery
- **Comprehensive Schema Analysis**: All PostgreSQL object types with detailed metadata
- **Intelligent Caching**: Background refresh with performance optimization
- **Migration Engine**: Automated SQL generation with rollback support

## Development

### Prerequisites

- Node.js 22.0.0+
- .NET 9.0+ SDK
- PostgreSQL 12+

### Setup

```bash
# Build the .NET solution first
npm run build:dotnet

# Or build .NET manually
cd pg-drive/PostgreSqlSchemaCompareSync
dotnet build -c Release
cd ../../

# Install Node.js dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode for development
npm run watch
```

### Project Structure

```
├── src/                                    # VSCode extension source
│   ├── extension.ts                        # Main extension entry point
│   ├── managers/                           # Business logic managers
│   │   ├── ConnectionManager.ts            # Connection lifecycle management
│   │   ├── SchemaManager.ts                # Schema browsing and metadata
│   │   └── MigrationManager.ts             # Migration operations
│   ├── services/                           # Advanced services
│   │   ├── DotNetIntegrationService.ts     # Main .NET integration service
│   │   └── ConnectionHealthChecker.ts      # Health monitoring
│   ├── providers/                          # VSCode UI providers
│   ├── views/                              # Custom webview panels
│   └── utils/                              # Utility functions
├── pg-drive/                               # .NET solution root
│   └── PostgreSqlSchemaCompareSync/        # Main .NET project
│       ├── PostgreSqlSchemaCompareSync.cs  # Main extension class
│       ├── Core/                           # Core .NET functionality
│       │   ├── Connection/                 # Advanced connection management
│       │   ├── Comparison/                 # Schema comparison engine
│       │   ├── Migration/                  # Migration generation and execution
│       │   └── Models/                     # Data models and types
│       ├── Infrastructure/                 # Infrastructure services
│       ├── Tests/                          # Comprehensive test suite
│       └── PerformanceTests/               # Performance benchmarks
├── test/                                   # VSCode extension tests
├── package.json                            # Extension manifest
└── build-dotnet.js                         # .NET build automation
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## Support

- **Documentation**: Use `PostgreSQL: Show Help` command
- **Logs**: Use `PostgreSQL: Show Logs` command for debugging
- **Issues**: Report bugs and feature requests on GitHub

## License

MIT License - see LICENSE file for details.