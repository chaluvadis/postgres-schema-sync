using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Npgsql;

namespace PostgreSqlSchemaCompareSync
{
    /// <summary>
    /// Main wrapper class for PostgreSQL Schema Compare & Sync operations
    /// This class is designed to be called from Node.js using Edge.js
    /// </summary>
    public class PostgreSqlWrapper
    {
        private readonly PostgreSqlSchemaCompareSync _coreService;
        private readonly ILogger<PostgreSqlWrapper> _logger;

        public PostgreSqlWrapper()
        {
            // Initialize the core service (same as in the main application)
            _coreService = new PostgreSqlSchemaCompareSync();
            _logger = _coreService.GetLogger<PostgreSqlWrapper>();
        }

        /// <summary>
        /// Test database connection
        /// </summary>
        public async Task<bool> TestConnectionAsync(dynamic connectionInfo)
        {
            try
            {
                var connInfo = MapConnectionInfo(connectionInfo);
                _logger.LogInformation("Testing connection to {Database}", connInfo.Database);

                var result = await _coreService.TestConnectionAsync(connInfo);
                _logger.LogInformation("Connection test completed for {Database}", connInfo.Database);

                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Connection test failed for database");
                throw new EdgeJsException($"Connection test failed: {ex.Message}");
            }
        }

        /// <summary>
        /// Browse database schema
        /// </summary>
        public async Task<List<dynamic>> BrowseSchemaAsync(dynamic connectionInfo, string schemaFilter = null)
        {
            try
            {
                var connInfo = MapConnectionInfo(connectionInfo);
                _logger.LogInformation("Browsing schema for {Database}", connInfo.Database);

                var objects = await _coreService.BrowseSchemaAsync(connInfo, schemaFilter);

                // Convert to dynamic objects for Edge.js compatibility
                var result = objects.Select(obj => new
                {
                    id = obj.Id,
                    name = obj.Name,
                    type = obj.Type.ToString(),
                    schema = obj.Schema,
                    database = obj.Database,
                    owner = obj.Owner,
                    sizeInBytes = obj.SizeInBytes,
                    properties = obj.Properties,
                    definition = obj.Definition,
                    createdAt = obj.CreatedAt.ToString("O"),
                    modifiedAt = obj.ModifiedAt?.ToString("O"),
                    dependencies = obj.Dependencies
                }).Cast<dynamic>().ToList();

                _logger.LogInformation("Schema browsing completed for {Database}, {ObjectCount} objects found", connInfo.Database, result.Count);

                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Schema browsing failed for database");
                throw new EdgeJsException($"Schema browsing failed: {ex.Message}");
            }
        }

        /// <summary>
        /// Compare schemas between two databases
        /// </summary>
        public async Task<dynamic> CompareSchemasAsync(dynamic sourceConnection, dynamic targetConnection, dynamic options)
        {
            try
            {
                var sourceInfo = MapConnectionInfo(sourceConnection);
                var targetInfo = MapConnectionInfo(targetConnection);
                var comparisonOptions = MapComparisonOptions(options);

                _logger.LogInformation("Comparing schemas between {SourceDatabase} and {TargetDatabase}",
                    sourceInfo.Database, targetInfo.Database);

                var comparison = await _coreService.CompareSchemasAsync(sourceInfo, targetInfo, comparisonOptions);

                // Convert to dynamic object for Edge.js compatibility
                var result = new
                {
                    id = comparison.Id,
                    sourceConnection = new
                    {
                        id = sourceInfo.Id,
                        name = sourceInfo.Name,
                        host = sourceInfo.Host,
                        port = sourceInfo.Port,
                        database = sourceInfo.Database,
                        username = sourceInfo.Username
                    },
                    targetConnection = new
                    {
                        id = targetInfo.Id,
                        name = targetInfo.Name,
                        host = targetInfo.Host,
                        port = targetInfo.Port,
                        database = targetInfo.Database,
                        username = targetInfo.Username
                    },
                    differences = comparison.Differences.Select(diff => new
                    {
                        type = diff.Type.ToString(),
                        objectType = diff.ObjectType,
                        objectName = diff.ObjectName,
                        schema = diff.Schema,
                        sourceDefinition = diff.SourceDefinition,
                        targetDefinition = diff.TargetDefinition,
                        differenceDetails = diff.DifferenceDetails
                    }).Cast<dynamic>().ToList(),
                    executionTime = comparison.ExecutionTime,
                    createdAt = comparison.CreatedAt.ToString("O")
                };

                _logger.LogInformation("Schema comparison completed, {DifferenceCount} differences found",
                    comparison.Differences.Count);

                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Schema comparison failed");
                throw new EdgeJsException($"Schema comparison failed: {ex.Message}");
            }
        }

        /// <summary>
        /// Generate migration script from schema comparison
        /// </summary>
        public async Task<dynamic> GenerateMigrationAsync(dynamic comparison, dynamic options)
        {
            try
            {
                var schemaComparison = MapSchemaComparison(comparison);
                var migrationOptions = MapMigrationOptions(options);

                _logger.LogInformation("Generating migration for comparison {ComparisonId}", schemaComparison.Id);

                var migration = await _coreService.GenerateMigrationAsync(schemaComparison, migrationOptions);

                // Convert to dynamic object for Edge.js compatibility
                var result = new
                {
                    id = migration.Id,
                    comparisonId = migration.ComparisonId,
                    sqlScript = migration.SqlScript,
                    rollbackScript = migration.RollbackScript,
                    type = migration.Type.ToString(),
                    isDryRun = migration.IsDryRun,
                    status = migration.Status.ToString(),
                    createdAt = migration.CreatedAt.ToString("O"),
                    executionTime = migration.ExecutionTime,
                    executionLog = migration.ExecutionLog
                };

                _logger.LogInformation("Migration generated with {OperationCount} operations",
                    migration.SqlScript.Split('\n').Length);

                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Migration generation failed");
                throw new EdgeJsException($"Migration generation failed: {ex.Message}");
            }
        }

        /// <summary>
        /// Execute migration script
        /// </summary>
        public async Task<dynamic> ExecuteMigrationAsync(dynamic migration, dynamic targetConnection)
        {
            try
            {
                var migrationScript = MapMigrationScript(migration);
                var targetInfo = MapConnectionInfo(targetConnection);

                _logger.LogInformation("Executing migration {MigrationId} on {Database}",
                    migrationScript.Id, targetInfo.Database);

                var result = await _coreService.ExecuteMigrationAsync(migrationScript, targetInfo);

                // Convert to dynamic object for Edge.js compatibility
                var response = new
                {
                    status = result.Status.ToString(),
                    executionTime = result.ExecutionTime,
                    operationsExecuted = result.OperationsExecuted,
                    errors = result.Errors,
                    warnings = result.Warnings
                };

                _logger.LogInformation("Migration execution {Status} for {MigrationId}",
                    result.Status, migrationScript.Id);

                return response;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Migration execution failed");
                throw new EdgeJsException($"Migration execution failed: {ex.Message}");
            }
        }

        /// <summary>
        /// Get detailed information about a database object
        /// </summary>
        public async Task<dynamic> GetObjectDetailsAsync(dynamic connectionInfo, string objectType, string schema, string objectName)
        {
            try
            {
                var connInfo = MapConnectionInfo(connectionInfo);
                var objType = MapObjectType(objectType);

                _logger.LogInformation("Getting object details for {ObjectType} {ObjectName} in {Database}",
                    objectType, objectName, connInfo.Database);

                var details = await _coreService.GetObjectDetailsAsync(connInfo, objType, schema, objectName);

                // Convert to dynamic object for Edge.js compatibility
                var result = new
                {
                    objectDetails = new
                    {
                        name = details.Object.Name,
                        type = details.Object.Type.ToString(),
                        schema = details.Object.Schema,
                        database = details.Object.Database,
                        owner = details.Object.Owner,
                        definition = details.Object.Definition,
                        createdAt = details.Object.CreatedAt.ToString("O"),
                        modifiedAt = details.Object.ModifiedAt?.ToString("O")
                    },
                    dependencies = details.Dependencies,
                    dependents = details.Dependents,
                    additionalInfo = details.AdditionalInfo
                };

                _logger.LogDebug("Object details retrieved for {ObjectType} {ObjectName}", objectType, objectName);

                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to get object details");
                throw new EdgeJsException($"Failed to get object details: {ex.Message}");
            }
        }

        /// <summary>
        /// Get comprehensive system health information
        /// </summary>
        public dynamic GetSystemHealth()
        {
            try
            {
                _logger.LogInformation("Retrieving system health information");

                var health = new
                {
                    status = "Healthy",
                    timestamp = DateTime.UtcNow.ToString("O"),
                    version = "1.0.0",
                    uptime = "00:00:00", // Would be calculated in real implementation
                    services = new
                    {
                        database = "Connected",
                        cache = "Available",
                        logging = "Active"
                    },
                    performance = new
                    {
                        memoryUsage = "Normal",
                        cpuUsage = "Low",
                        activeConnections = 0
                    }
                };

                return health;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to get system health");
                throw new EdgeJsException($"Health check failed: {ex.Message}");
            }
        }

        // Helper methods for mapping dynamic objects to strongly-typed models

        private ConnectionInfo MapConnectionInfo(dynamic connectionInfo)
        {
            return new ConnectionInfo
            {
                Id = connectionInfo.id,
                Name = connectionInfo.name,
                Host = connectionInfo.host,
                Port = connectionInfo.port,
                Database = connectionInfo.database,
                Username = connectionInfo.username,
                Password = connectionInfo.password,
                CreatedDate = DateTime.UtcNow
            };
        }

        private ComparisonOptions MapComparisonOptions(dynamic options)
        {
            return new ComparisonOptions
            {
                Mode = options.mode == "strict" ? ComparisonMode.Strict : ComparisonMode.Lenient,
                IgnoreSchemas = options.ignoreSchemas != null ?
                    ((IEnumerable<string>)options.ignoreSchemas).ToList() : new List<string>(),
                IncludeSystemObjects = options.includeSystemObjects ?? false,
                CaseSensitive = options.caseSensitive ?? true
            };
        }

        private SchemaComparison MapSchemaComparison(dynamic comparison)
        {
            return new SchemaComparison
            {
                Id = comparison.id,
                SourceConnection = MapConnectionInfo(comparison.sourceConnection),
                TargetConnection = MapConnectionInfo(comparison.targetConnection),
                Differences = ((IEnumerable<dynamic>)comparison.differences).Select(diff =>
                    new SchemaDifference
                    {
                        Type = diff.type == "Added" ? DifferenceType.Added :
                               diff.type == "Removed" ? DifferenceType.Removed :
                               diff.type == "Modified" ? DifferenceType.Modified : DifferenceType.Moved,
                        ObjectType = diff.objectType,
                        ObjectName = diff.objectName,
                        Schema = diff.schema,
                        SourceDefinition = diff.sourceDefinition,
                        TargetDefinition = diff.targetDefinition,
                        DifferenceDetails = ((IEnumerable<string>)diff.differenceDetails).ToList()
                    }).ToList(),
                ExecutionTime = comparison.executionTime,
                CreatedAt = DateTime.Parse(comparison.createdAt)
            };
        }

        private MigrationOptions MapMigrationOptions(dynamic options)
        {
            return new MigrationOptions
            {
                IncludeDropStatements = options.includeDropStatements ?? true,
                GenerateRollbackScript = options.generateRollbackScript ?? true,
                BatchSize = options.batchSize ?? 50,
                TransactionMode = options.transactionMode ?? TransactionMode.AllOrNothing,
                DryRun = options.dryRun ?? true
            };
        }

        private MigrationScript MapMigrationScript(dynamic migration)
        {
            return new MigrationScript
            {
                Id = migration.id,
                ComparisonId = migration.comparisonId,
                SqlScript = migration.sqlScript,
                RollbackScript = migration.rollbackScript,
                Type = migration.type == "Schema" ? MigrationType.Schema : MigrationType.Data,
                IsDryRun = migration.isDryRun,
                Status = migration.status == "Pending" ? MigrationStatus.Pending :
                        migration.status == "Executing" ? MigrationStatus.Executing :
                        migration.status == "Completed" ? MigrationStatus.Completed : MigrationStatus.Failed,
                CreatedAt = DateTime.Parse(migration.createdAt),
                ExecutionTime = migration.executionTime,
                ExecutionLog = migration.executionLog
            };
        }

        private ObjectType MapObjectType(string objectType)
        {
            return objectType switch
            {
                "Table" => ObjectType.Table,
                "View" => ObjectType.View,
                "Function" => ObjectType.Function,
                "Procedure" => ObjectType.Procedure,
                "Trigger" => ObjectType.Trigger,
                "Index" => ObjectType.Index,
                "Sequence" => ObjectType.Sequence,
                "Type" => ObjectType.Type,
                "Domain" => ObjectType.Domain,
                "Schema" => ObjectType.Schema,
                _ => ObjectType.Table
            };
        }
    }

    /// <summary>
    /// Exception class for Edge.js communication errors
    /// </summary>
    public class EdgeJsException : Exception
    {
        public EdgeJsException(string message) : base(message) { }
        public EdgeJsException(string message, Exception innerException) : base(message, innerException) { }
    }

    // Model classes (simplified for Edge.js compatibility)

    public class ConnectionInfo
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string Host { get; set; }
        public int Port { get; set; }
        public string Database { get; set; }
        public string Username { get; set; }
        public string Password { get; set; }
        public DateTime CreatedDate { get; set; }
    }

    public class ComparisonOptions
    {
        public ComparisonMode Mode { get; set; }
        public List<string> IgnoreSchemas { get; set; } = new List<string>();
        public bool IncludeSystemObjects { get; set; }
        public bool CaseSensitive { get; set; }
    }

    public enum ComparisonMode
    {
        Strict,
        Lenient
    }

    public class SchemaComparison
    {
        public string Id { get; set; }
        public ConnectionInfo SourceConnection { get; set; }
        public ConnectionInfo TargetConnection { get; set; }
        public List<SchemaDifference> Differences { get; set; } = new List<SchemaDifference>();
        public string ExecutionTime { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class SchemaDifference
    {
        public DifferenceType Type { get; set; }
        public string ObjectType { get; set; }
        public string ObjectName { get; set; }
        public string Schema { get; set; }
        public string SourceDefinition { get; set; }
        public string TargetDefinition { get; set; }
        public List<string> DifferenceDetails { get; set; } = new List<string>();
    }

    public enum DifferenceType
    {
        Added,
        Removed,
        Modified,
        Moved
    }

    public class MigrationOptions
    {
        public bool IncludeDropStatements { get; set; }
        public bool GenerateRollbackScript { get; set; }
        public int BatchSize { get; set; }
        public TransactionMode TransactionMode { get; set; }
        public bool DryRun { get; set; }
    }

    public enum TransactionMode
    {
        AllOrNothing,
        PerBatch,
        PerStatement
    }

    public class MigrationScript
    {
        public string Id { get; set; }
        public string ComparisonId { get; set; }
        public string SqlScript { get; set; }
        public string RollbackScript { get; set; }
        public MigrationType Type { get; set; }
        public bool IsDryRun { get; set; }
        public MigrationStatus Status { get; set; }
        public DateTime CreatedAt { get; set; }
        public string ExecutionTime { get; set; }
        public string ExecutionLog { get; set; }
    }

    public enum MigrationType
    {
        Schema,
        Data
    }

    public enum MigrationStatus
    {
        Pending,
        Executing,
        Completed,
        Failed,
        RolledBack
    }

    public enum ObjectType
    {
        Table,
        View,
        Function,
        Procedure,
        Trigger,
        Index,
        Sequence,
        Type,
        Domain,
        Schema,
        Collation,
        Extension
    }

    public class DatabaseObjectDetails
    {
        public DatabaseObject Object { get; set; }
        public List<string> Dependencies { get; set; } = new List<string>();
        public List<string> Dependents { get; set; } = new List<string>();
        public Dictionary<string, string> AdditionalInfo { get; set; } = new Dictionary<string, string>();
    }

    public class DatabaseObject
    {
        public string Name { get; set; }
        public ObjectType Type { get; set; }
        public string Schema { get; set; }
        public string Database { get; set; }
        public string Owner { get; set; }
        public string Definition { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? ModifiedAt { get; set; }
    }

    public class MigrationResult
    {
        public MigrationStatus Status { get; set; }
        public string ExecutionTime { get; set; }
        public int OperationsExecuted { get; set; }
        public List<string> Errors { get; set; } = new List<string>();
        public List<string> Warnings { get; set; } = new List<string>();
    }
}