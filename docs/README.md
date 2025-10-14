# PostgreSQL Schema Compare & Sync Extension

## 🚀 Quick Start Guide

### Installation
1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for "PostgreSQL Schema Compare & Sync"
4. Click Install
5. Reload VS Code when prompted

### First Steps
1. Click the PostgreSQL icon in the Activity Bar
2. Add your first database connection
3. Browse your schema in the tree view
4. Compare schemas between environments
5. Generate and execute migrations

## 📚 User Guide

### Database Connections

#### Adding a Connection
1. Click the PostgreSQL icon in the Activity Bar
2. Click "Add Connection" or use `Ctrl+Shift+N`
3. Enter your connection details:
   - **Name**: Friendly name for the connection
   - **Host**: Database server hostname
   - **Port**: PostgreSQL port (default: 5432)
   - **Database**: Database name
   - **Username**: Your username
   - **Password**: Your password (stored securely)

#### Connection Security
- Passwords are encrypted using VS Code's Secret Storage API
- SSL certificate validation is enabled by default
- Self-signed certificates can be allowed in settings
- Certificate pinning available for high-security environments

### Schema Comparison

#### Basic Comparison
1. Right-click on a database/schema in the tree view
2. Select "Compare Schemas"
3. Choose source and target databases
4. Review differences in the comparison view

#### Interactive Comparison
1. Use "Interactive Schema Comparison" for advanced workflows
2. Select which differences to include in migration
3. Add notes and custom resolutions
4. Generate migration from selected differences only

#### Comparison Modes
- **Strict**: Exact comparison including whitespace
- **Lenient**: Focus on structural differences

### Migration Management

#### Preview Migration
1. Generate migration script
2. Use "Preview Migration" to see execution plan
3. Review risk assessment and rollback options
4. Execute migration when ready

#### Migration Options
- **Dry Run**: Preview without executing
- **Batch Size**: Control transaction size
- **Stop on Error**: Halt on first error
- **Transaction Mode**: All-or-nothing vs continue on error

#### Rollback Support
- Automatic rollback script generation
- Preview rollback before execution
- Safe rollback execution

## ⚙️ Configuration

### Extension Settings

Access settings via:
- `Ctrl+Shift+S` (Open Settings)
- VS Code Settings UI
- Command Palette: "PostgreSQL: Open Settings"

#### Schema Comparison Settings
```json
{
  "postgresql-schema-sync.compare.mode": "strict",
  "postgresql-schema-sync.compare.ignoreSchemas": ["information_schema", "pg_catalog"],
  "postgresql-schema-sync.compare.includeSystemObjects": false,
  "postgresql-schema-sync.compare.caseSensitive": true
}
```

#### Migration Settings
```json
{
  "postgresql-schema-sync.migration.dryRun": true,
  "postgresql-schema-sync.migration.batchSize": 50,
  "postgresql-schema-sync.migration.stopOnError": true,
  "postgresql-schema-sync.migration.transactionMode": "all_or_nothing"
}
```

#### Security Settings
```json
{
  "postgresql.securityManager.enabled": true,
  "postgresql.securityManager.securityLevel": "warning",
  "postgresql.securityManager.certificateValidation.enabled": true,
  "postgresql.securityManager.certificateValidation.allowSelfSigned": false
}
```

## 🔧 Troubleshooting

### Common Issues

#### Connection Problems
**Issue**: Cannot connect to database
**Solutions**:
1. Verify host, port, and database name
2. Check username and password
3. Ensure PostgreSQL server is running
4. Check firewall settings
5. Verify SSL settings if using secure connections

#### Schema Comparison Issues
**Issue**: Comparison shows no differences
**Solutions**:
1. Check if schemas exist in both databases
2. Verify user has SELECT permissions
3. Check ignored schemas list
4. Try lenient comparison mode

**Issue**: Comparison is slow
**Solutions**:
1. Reduce batch size in settings
2. Enable connection pooling
3. Check network latency
4. Consider schema filtering

#### Migration Issues
**Issue**: Migration fails to execute
**Solutions**:
1. Check user has DDL permissions
2. Verify no active locks on objects
3. Check available disk space
4. Review migration script for syntax errors
5. Use dry-run mode first

### Performance Tips

#### Large Databases
1. Use schema filtering to compare specific schemas only
2. Enable background processing for large comparisons
3. Consider connection pooling for multiple operations
4. Use appropriate batch sizes for migrations

#### Network Optimization
1. Use local connections when possible
2. Enable connection pooling
3. Minimize concurrent operations
4. Use appropriate timeout settings

### Debug Mode

Enable debug logging:
1. Open VS Code Settings
2. Search for "PostgreSQL Schema"
3. Enable "Debug Logging"
4. Set log level to "Debug"
5. View logs in Output panel

## 📖 Advanced Features

### Team Collaboration

#### Workspace Management
1. Create shared workspaces for team projects
2. Invite team members with appropriate roles
3. Lock objects for exclusive editing
4. Track changes and collaboration events

#### Roles and Permissions
- **Admin**: Full access, workspace management
- **Editor**: Schema editing, migration execution
- **Viewer**: Read-only access

### Security Features

#### Certificate Management
- Automatic SSL certificate validation
- Certificate pinning for high-security environments
- Self-signed certificate support (configurable)
- Certificate transparency checking

#### Security Monitoring
- Real-time security event monitoring
- Configurable alert levels
- Security event retention and cleanup
- Integration with VS Code notifications

### Performance Monitoring

#### Metrics Dashboard
- Real-time performance metrics
- Historical trend analysis
- Operation timing and success rates
- Memory usage monitoring

#### Optimization Tools
- Performance recommendations
- Slow query identification
- Cache hit rate monitoring
- Resource usage optimization

## 🛠️ API Reference

### Extension Commands

| Command | Description | Keyboard Shortcut |
|---------|-------------|-------------------|
| `postgresql.addConnection` | Add new database connection | `Ctrl+Shift+N` |
| `postgresql.compareSchemas` | Compare two schemas | `Ctrl+Shift+C` |
| `postgresql.generateMigration` | Generate migration script | `Ctrl+Shift+G` |
| `postgresql.previewMigration` | Preview migration execution | `Ctrl+Shift+V` |
| `postgresql.executeMigration` | Execute migration | `Ctrl+Shift+E` |
| `postgresql.showDashboard` | Open dashboard | `Ctrl+Shift+H` |
| `postgresql.showSettings` | Open settings | `Ctrl+Shift+S` |

### Tree View Operations

| Operation | Description | Context Menu |
|-----------|-------------|--------------|
| **Expand All** | Expand all tree items | Right-click → Expand All |
| **Collapse All** | Collapse all tree items | Right-click → Collapse All |
| **Refresh** | Refresh tree view data | Right-click → Refresh |
| **Compare** | Compare selected schemas | Right-click → Compare Schemas |

## 🌟 Best Practices

### Schema Management
1. **Use descriptive names** for connections and workspaces
2. **Organize schemas** logically in your database
3. **Document changes** using migration notes
4. **Test migrations** in staging before production

### Team Workflow
1. **Use workspaces** for shared projects
2. **Lock objects** before making changes
3. **Communicate changes** through collaboration events
4. **Review migrations** before execution

### Security
1. **Use SSL connections** for production databases
2. **Regularly update certificates** and check validity
3. **Monitor security events** for suspicious activity
4. **Use appropriate security levels** for your environment

### Reporting Bugs
1. Enable debug logging
2. Reproduce the issue
3. Collect relevant logs
4. Submit issue with detailed information

### Feature Requests
1. Check existing feature requests
2. Create new issue with detailed requirements
3. Provide use case and expected behavior

## 📋 Changelog

### Version 1.0.0
- ✅ Complete schema comparison and synchronization
- ✅ Interactive schema comparison with user selections
- ✅ Comprehensive migration management with rollback
- ✅ Real-time dashboard with performance metrics
- ✅ Team collaboration with workspaces and locking
- ✅ Enterprise security with SSL/TLS validation
- ✅ Visual progress indicators and operation tracking
- ✅ Comprehensive error handling and recovery

## 🙏 Acknowledgments

Built with:
- **VS Code Extension API** - For seamless IDE integration
- **Edge.js** - For .NET interoperability
- **Npgsql** - For PostgreSQL connectivity
- **TypeScript** - For type-safe development

---

**Happy schema management!** 🎉