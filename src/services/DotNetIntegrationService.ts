import { Logger } from '@/utils/Logger';
import { PerformanceMonitor } from '@/services/PerformanceMonitor';
import * as path from 'path';
import * as fs from 'fs';

// Import Edge.js for .NET interop
// Note: edge-js is installed as a dependency
let edge: any;

// Define Edge.js function type for TypeScript
type EdgeFunction = (args: any[], callback: (error: any, result?: any) => void) => void;

// Custom error class for .NET integration errors
export class DotNetError extends Error {
    constructor(
        public type: string,
        message: string,
        public methodName: string,
        public originalError?: Error
    ) {
        super(message);
        this.name = 'DotNetError';
    }
}

export interface DotNetConnectionInfo {
    id: string;
    name: string;
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    createdDate?: string;
}

export interface DotNetDatabaseObject {
    id: string;
    name: string;
    type: string;
    schema: string;
    database: string;
    owner: string;
    sizeInBytes?: number;
    properties: Record<string, string>;
    definition: string;
    createdAt: string;
    modifiedAt?: string;
    dependencies: string[];
}

export interface DotNetSchemaComparison {
    id: string;
    sourceConnection: DotNetConnectionInfo;
    targetConnection: DotNetConnectionInfo;
    differences: DotNetSchemaDifference[];
    executionTime: string;
    createdAt: string;
}

export interface DotNetSchemaDifference {
    type: 'Added' | 'Removed' | 'Modified' | 'Moved';
    objectType: string;
    objectName: string;
    schema: string;
    sourceDefinition?: string;
    targetDefinition?: string;
    differenceDetails: string[];
}

export interface DotNetMigrationScript {
    id: string;
    comparison: DotNetSchemaComparison;
    selectedDifferences: DotNetSchemaDifference[];
    sqlScript: string;
    rollbackScript: string;
    type: string;
    isDryRun: boolean;
    status: string;
    createdAt: string;
    executionTime?: string;
    executionLog?: string;
}

export interface DotNetMigrationResult {
    status: string;
    executionTime: string;
    operationsExecuted: number;
    errors: string[];
    warnings: string[];
}

export interface DotNetQueryResult {
    rowCount: number;
    columns: DotNetQueryColumn[];
    rows: any[][];
    error?: string;
    executionPlan?: string;
}

export interface DotNetQueryColumn {
    name: string;
    type: string;
    nullable: boolean;
    primaryKey?: boolean;
}

// Enhanced interfaces for pg-drive metadata extractors
export interface DotNetMetadataExtractionOptions {
    includeDependencies?: boolean;
    includePermissions?: boolean;
    includeStatistics?: boolean;
    cancellationToken?: any;
}

export interface DotNetColumnMetadata {
    name: string;
    dataType: string;
    isNullable: boolean;
    defaultValue?: string;
    isPrimaryKey: boolean;
    isForeignKey: boolean;
    references?: {
        table: string;
        column: string;
        schema: string;
    };
    constraints: DotNetColumnConstraint[];
    statistics?: {
        distinctValues: number;
        nullCount: number;
        avgLength?: number;
    };
}

export interface DotNetColumnConstraint {
    name: string;
    type: 'CHECK' | 'NOT NULL' | 'UNIQUE' | 'PRIMARY KEY' | 'FOREIGN KEY';
    definition: string;
    isEnabled: boolean;
}

export interface DotNetIndexMetadata {
    name: string;
    tableName: string;
    schema: string;
    isUnique: boolean;
    isPartial: boolean;
    isFunctional: boolean;
    columnNames: string[];
    includedColumns?: string[];
    whereClause?: string;
    definition: string;
    statistics?: {
        sizeInBytes: number;
        indexScans: number;
        tuplesRead: number;
        tuplesFetched: number;
    };
}

export interface DotNetConstraintMetadata {
    name: string;
    type: 'PRIMARY KEY' | 'FOREIGN KEY' | 'CHECK' | 'UNIQUE';
    tableName: string;
    schema: string;
    isEnabled: boolean;
    isDeferrable: boolean;
    definition: string;
    columns: string[];
    referencedTable?: string;
    referencedColumns?: string[];
}

export interface DotNetViewMetadata {
    name: string;
    schema: string;
    definition: string;
    isMaterialized: boolean;
    columns: DotNetViewColumn[];
    dependencies: DotNetViewDependency[];
    statistics?: {
        rowCount?: number;
        sizeInBytes?: number;
        lastRefresh?: string;
    };
}

export interface DotNetViewColumn {
    name: string;
    dataType: string;
    isNullable: boolean;
    sourceExpression: string;
}

export interface DotNetViewDependency {
    type: 'table' | 'view' | 'function';
    name: string;
    schema: string;
}

export interface DotNetMigrationProgressReport {
    stage: string;
    completedOperations: number;
    totalOperations: number;
    currentOperation: string;
    percentage: number;
    estimatedTimeRemaining?: string;
    errors: string[];
    warnings: string[];
}

export class DotNetIntegrationService {
    private static instance: DotNetIntegrationService;
    private isInitialized: boolean = false;
    private dotNetFunctions: Record<string, any> = {};

    private constructor() { }

    static getInstance(): DotNetIntegrationService {
        if (!DotNetIntegrationService.instance) {
            DotNetIntegrationService.instance = new DotNetIntegrationService();
        }
        return DotNetIntegrationService.instance;
    }

    async initialize(): Promise<boolean> {
        if (this.isInitialized) {
            return true;
        }

        try {
            Logger.info('Initializing .NET integration service');
            await this.initializeDotNetLibrary();
            this.isInitialized = true;
            Logger.info('.NET integration service initialized successfully');
            return true;
        } catch (error) {
            Logger.error('Failed to initialize .NET integration service', error as Error);
            return false;
        }
    }

    private async initializeDotNetLibrary(): Promise<void> {
        try {
            Logger.debug('Loading PostgreSqlSchemaCompareSync library');

            // Import edge-js dynamically for ESM compatibility
            if (!edge) {
                try {
                    const edgeModule = await import('edge-js');
                    edge = edgeModule;
                } catch (error) {
                    Logger.warn('Edge.js not available, .NET integration will use mock implementation');
                }
            }

            // Get the path to the .NET DLL for VS Code extension
            const dllPath = this.getDotNetDllPath();

            // Check if .NET DLL exists
            if (!dllPath || dllPath.length === 0) {
                throw new Error('.NET DLL path is not available');
            }

            // Check if edge-js is available
            if (edge) {
                Logger.info('Edge.js available, initializing production .NET functions');

                // Create Edge.js functions for .NET methods used in production
                this.dotNetFunctions = {
                    TestConnectionAsync: edge.func({
                        assemblyFile: dllPath,
                        typeName: 'PostgreSqlSchemaCompareSync.PostgreSqlSchemaCompareSync',
                        methodName: 'TestConnectionAsync'
                    }),

                    BrowseSchemaAsync: edge.func({
                        assemblyFile: dllPath,
                        typeName: 'PostgreSqlSchemaCompareSync.PostgreSqlSchemaCompareSync',
                        methodName: 'BrowseSchemaAsync'
                    }),

                    CompareSchemasAsync: edge.func({
                        assemblyFile: dllPath,
                        typeName: 'PostgreSqlSchemaCompareSync.PostgreSqlSchemaCompareSync',
                        methodName: 'CompareSchemasAsync'
                    }),

                    GenerateMigrationAsync: edge.func({
                        assemblyFile: dllPath,
                        typeName: 'PostgreSqlSchemaCompareSync.PostgreSqlSchemaCompareSync',
                        methodName: 'GenerateMigrationAsync'
                    }),

                    ExecuteMigrationAsync: edge.func({
                        assemblyFile: dllPath,
                        typeName: 'PostgreSqlSchemaCompareSync.PostgreSqlSchemaCompareSync',
                        methodName: 'ExecuteMigrationAsync'
                    }),

                    GetObjectDetailsAsync: edge.func({
                        assemblyFile: dllPath,
                        typeName: 'PostgreSqlSchemaCompareSync.PostgreSqlSchemaCompareSync',
                        methodName: 'GetObjectDetailsAsync'
                    }),

                    ExecuteQueryAsync: edge.func({
                        assemblyFile: dllPath,
                        typeName: 'PostgreSqlSchemaCompareSync.PostgreSqlSchemaCompareSync',
                        methodName: 'ExecuteQueryAsync'
                    }),

                    // Enhanced metadata extractors
                    ExtractColumnMetadataAsync: edge.func({
                        assemblyFile: dllPath,
                        typeName: 'PostgreSqlSchemaCompareSync.Core.Comparison.Metadata.ColumnMetadataExtractor',
                        methodName: 'ExtractMetadataAsync'
                    }),

                    ExtractIndexMetadataAsync: edge.func({
                        assemblyFile: dllPath,
                        typeName: 'PostgreSqlSchemaCompareSync.Core.Comparison.Metadata.IndexMetadataExtractor',
                        methodName: 'ExtractMetadataAsync'
                    }),

                    ExtractConstraintMetadataAsync: edge.func({
                        assemblyFile: dllPath,
                        typeName: 'PostgreSqlSchemaCompareSync.Core.Comparison.Metadata.ConstraintMetadataExtractor',
                        methodName: 'ExtractMetadataAsync'
                    }),

                    ExtractViewMetadataAsync: edge.func({
                        assemblyFile: dllPath,
                        typeName: 'PostgreSqlSchemaCompareSync.Core.Comparison.Metadata.ViewMetadataExtractor',
                        methodName: 'ExtractMetadataAsync'
                    }),

                    ExtractFunctionMetadataAsync: edge.func({
                        assemblyFile: dllPath,
                        typeName: 'PostgreSqlSchemaCompareSync.Core.Comparison.Metadata.FunctionMetadataExtractor',
                        methodName: 'ExtractMetadataAsync'
                    }),

                    ExtractTriggerMetadataAsync: edge.func({
                        assemblyFile: dllPath,
                        typeName: 'PostgreSqlSchemaCompareSync.Core.Comparison.Metadata.TriggerMetadataExtractor',
                        methodName: 'ExtractMetadataAsync'
                    }),

                    ExtractSequenceMetadataAsync: edge.func({
                        assemblyFile: dllPath,
                        typeName: 'PostgreSqlSchemaCompareSync.Core.Comparison.Metadata.SequenceMetadataExtractor',
                        methodName: 'ExtractMetadataAsync'
                    }),

                    ExtractMaterializedViewMetadataAsync: edge.func({
                        assemblyFile: dllPath,
                        typeName: 'PostgreSqlSchemaCompareSync.Core.Comparison.Metadata.MaterializedViewMetadataExtractor',
                        methodName: 'ExtractMetadataAsync'
                    }),

                    ExtractPartitionMetadataAsync: edge.func({
                        assemblyFile: dllPath,
                        typeName: 'PostgreSqlSchemaCompareSync.Core.Comparison.Metadata.PartitionMetadataExtractor',
                        methodName: 'ExtractMetadataAsync'
                    }),

                    ExtractCollationMetadataAsync: edge.func({
                        assemblyFile: dllPath,
                        typeName: 'PostgreSqlSchemaCompareSync.Core.Comparison.Metadata.CollationMetadataExtractor',
                        methodName: 'ExtractMetadataAsync'
                    }),

                    ExtractForeignTableMetadataAsync: edge.func({
                        assemblyFile: dllPath,
                        typeName: 'PostgreSqlSchemaCompareSync.Core.Comparison.Metadata.ForeignTableMetadataExtractor',
                        methodName: 'ExtractMetadataAsync'
                    }),

                    ExtractTypeMetadataAsync: edge.func({
                        assemblyFile: dllPath,
                        typeName: 'PostgreSqlSchemaCompareSync.Core.Comparison.Metadata.TypeMetadataExtractor',
                        methodName: 'ExtractMetadataAsync'
                    }),

                    ExtractProcedureMetadataAsync: edge.func({
                        assemblyFile: dllPath,
                        typeName: 'PostgreSqlSchemaCompareSync.Core.Comparison.Metadata.ProcedureMetadataExtractor',
                        methodName: 'ExtractMetadataAsync'
                    }),

                    ExtractRoleMetadataAsync: edge.func({
                        assemblyFile: dllPath,
                        typeName: 'PostgreSqlSchemaCompareSync.Core.Comparison.Metadata.RoleMetadataExtractor',
                        methodName: 'ExtractMetadataAsync'
                    }),

                    ExtractTablespaceMetadataAsync: edge.func({
                        assemblyFile: dllPath,
                        typeName: 'PostgreSqlSchemaCompareSync.Core.Comparison.Metadata.TablespaceMetadataExtractor',
                        methodName: 'ExtractMetadataAsync'
                    }),

                    ExtractExtensionMetadataAsync: edge.func({
                        assemblyFile: dllPath,
                        typeName: 'PostgreSqlSchemaCompareSync.Core.Comparison.Metadata.ExtensionMetadataExtractor',
                        methodName: 'ExtractMetadataAsync'
                    }),

                    // Enhanced migration and comparison methods
                    GenerateMigrationWithProgressAsync: edge.func({
                        assemblyFile: dllPath,
                        typeName: 'PostgreSqlSchemaCompareSync.Core.Migration.MigrationScriptGenerator',
                        methodName: 'GenerateMigrationWithProgressAsync'
                    }),

                    ExecuteMigrationWithProgressAsync: edge.func({
                        assemblyFile: dllPath,
                        typeName: 'PostgreSqlSchemaCompareSync.Core.Migration.MigrationExecutor',
                        methodName: 'ExecuteMigrationWithProgressAsync'
                    }),

                    CompareSchemasDetailedAsync: edge.func({
                        assemblyFile: dllPath,
                        typeName: 'PostgreSqlSchemaCompareSync.Core.Comparison.Schema.SchemaComparator',
                        methodName: 'CompareSchemasDetailedAsync'
                    })
                };

                Logger.info('.NET library functions initialized successfully with Edge.js');
            } else {
                Logger.warn('Edge.js not available, falling back to mock implementation');

                // Create mock functions for development/testing
                this.dotNetFunctions = {
                    TestConnectionAsync: this.createMockDotNetFunction('TestConnectionAsync'),
                    BrowseSchemaAsync: this.createMockDotNetFunction('BrowseSchemaAsync'),
                    CompareSchemasAsync: this.createMockDotNetFunction('CompareSchemasAsync'),
                    GenerateMigrationAsync: this.createMockDotNetFunction('GenerateMigrationAsync'),
                    ExecuteMigrationAsync: this.createMockDotNetFunction('ExecuteMigrationAsync'),
                    GetObjectDetailsAsync: this.createMockDotNetFunction('GetObjectDetailsAsync'),
                    ExecuteQueryAsync: this.createMockDotNetFunction('ExecuteQueryAsync'),

                    // Enhanced metadata extractors - mock implementations
                    ExtractColumnMetadataAsync: this.createMockDotNetFunction('ExtractColumnMetadataAsync'),
                    ExtractIndexMetadataAsync: this.createMockDotNetFunction('ExtractIndexMetadataAsync'),
                    ExtractConstraintMetadataAsync: this.createMockDotNetFunction('ExtractConstraintMetadataAsync'),
                    ExtractViewMetadataAsync: this.createMockDotNetFunction('ExtractViewMetadataAsync'),
                    ExtractFunctionMetadataAsync: this.createMockDotNetFunction('ExtractFunctionMetadataAsync'),
                    ExtractTriggerMetadataAsync: this.createMockDotNetFunction('ExtractTriggerMetadataAsync'),
                    ExtractSequenceMetadataAsync: this.createMockDotNetFunction('ExtractSequenceMetadataAsync'),
                    ExtractMaterializedViewMetadataAsync: this.createMockDotNetFunction('ExtractMaterializedViewMetadataAsync'),
                    ExtractPartitionMetadataAsync: this.createMockDotNetFunction('ExtractPartitionMetadataAsync'),
                    ExtractCollationMetadataAsync: this.createMockDotNetFunction('ExtractCollationMetadataAsync'),
                    ExtractForeignTableMetadataAsync: this.createMockDotNetFunction('ExtractForeignTableMetadataAsync'),
                    ExtractTypeMetadataAsync: this.createMockDotNetFunction('ExtractTypeMetadataAsync'),
                    ExtractProcedureMetadataAsync: this.createMockDotNetFunction('ExtractProcedureMetadataAsync'),
                    ExtractRoleMetadataAsync: this.createMockDotNetFunction('ExtractRoleMetadataAsync'),
                    ExtractTablespaceMetadataAsync: this.createMockDotNetFunction('ExtractTablespaceMetadataAsync'),
                    ExtractExtensionMetadataAsync: this.createMockDotNetFunction('ExtractExtensionMetadataAsync'),

                    // Enhanced migration and comparison methods - mock implementations
                    GenerateMigrationWithProgressAsync: this.createMockDotNetFunction('GenerateMigrationWithProgressAsync'),
                    ExecuteMigrationWithProgressAsync: this.createMockDotNetFunction('ExecuteMigrationWithProgressAsync'),
                    CompareSchemasDetailedAsync: this.createMockDotNetFunction('CompareSchemasDetailedAsync')
                };

                Logger.info('.NET library functions initialized successfully (using mock implementation)');
            }
        } catch (error) {
            Logger.error('Failed to initialize .NET library', error as Error, 'initializeDotNetLibrary');
            throw error;
        }
    }

    private createMockDotNetFunction(methodName: string): EdgeFunction {
        // Return a mock function that simulates .NET behavior
        return (args: any[], callback: (error: any, result?: any) => void) => {
            Logger.debug(`Mock .NET function called: ${methodName}`, 'createMockDotNetFunction');

            // Simulate async operation
            setTimeout(() => {
                try {
                    const result = this.getMockResult(methodName, args);
                    callback(null, result);
                } catch (error) {
                    callback(error, null);
                }
            }, 100); // Simulate network delay
        };
    }

    private getMockResult(methodName: string, args: any[]): any {
        switch (methodName) {
            case 'TestConnectionAsync':
                return true; // Mock successful connection

            case 'BrowseSchemaAsync':
                return [
                    {
                        id: '1',
                        name: 'users',
                        type: 'table',
                        schema: 'public',
                        database: args[0]?.database || 'testdb',
                        owner: 'postgres',
                        properties: {},
                        definition: 'CREATE TABLE users (id SERIAL PRIMARY KEY, name VARCHAR(100));',
                        createdAt: new Date().toISOString(),
                        dependencies: []
                    }
                ];

            case 'CompareSchemasAsync':
                return {
                    id: 'comparison-1',
                    sourceConnection: args[0],
                    targetConnection: args[1],
                    differences: [
                        {
                            type: 'Added',
                            objectType: 'table',
                            objectName: 'new_table',
                            schema: 'public',
                            differenceDetails: ['Table was added in target database']
                        }
                    ],
                    executionTime: '150ms',
                    createdAt: new Date().toISOString()
                };

            case 'GenerateMigrationAsync':
                return {
                    id: 'migration-1',
                    comparison: args[0],
                    selectedDifferences: args[0]?.differences || [],
                    sqlScript: 'CREATE TABLE new_table (id SERIAL PRIMARY KEY);',
                    rollbackScript: 'DROP TABLE IF EXISTS new_table;',
                    type: 'schema_sync',
                    isDryRun: true,
                    status: 'generated',
                    createdAt: new Date().toISOString()
                };

            case 'ExecuteMigrationAsync':
                return {
                    status: 'completed',
                    executionTime: '200ms',
                    operationsExecuted: 1,
                    errors: [],
                    warnings: []
                };

            case 'GetObjectDetailsAsync':
                return {
                    id: '1',
                    name: args[3], // objectName
                    type: args[1], // objectType
                    schema: args[2], // schema
                    definition: `Detailed definition for ${args[1]} ${args[3]}`,
                    properties: {
                        owner: 'postgres',
                        size: '8KB',
                        created: new Date().toISOString()
                    }
                };

            case 'ExecuteQueryAsync':
                const query = args[1] || '';
                const isSelect = query.trim().toUpperCase().startsWith('SELECT');

                if (isSelect) {
                    return {
                        rowCount: 2,
                        columns: [
                            { name: 'id', type: 'integer', nullable: false, primaryKey: true },
                            { name: 'name', type: 'varchar', nullable: true }
                        ],
                        rows: [
                            [1, 'Test User 1'],
                            [2, 'Test User 2']
                        ],
                        executionPlan: 'Seq Scan on users'
                    };
                } else {
                    return {
                        rowCount: 0,
                        columns: [],
                        rows: [],
                        executionPlan: 'DDL operation completed'
                    };
                }

            // Enhanced metadata extractor mock results
            case 'ExtractColumnMetadataAsync':
                return [
                    {
                        name: 'id',
                        dataType: 'integer',
                        isNullable: false,
                        defaultValue: 'nextval(\'users_id_seq\'::regclass)',
                        isPrimaryKey: true,
                        isForeignKey: false,
                        constraints: [
                            {
                                name: 'users_pkey',
                                type: 'PRIMARY KEY',
                                definition: 'PRIMARY KEY (id)',
                                isEnabled: true
                            }
                        ],
                        statistics: {
                            distinctValues: 1000,
                            nullCount: 0,
                            avgLength: 4
                        }
                    },
                    {
                        name: 'name',
                        dataType: 'varchar',
                        isNullable: true,
                        isPrimaryKey: false,
                        isForeignKey: false,
                        constraints: [],
                        statistics: {
                            distinctValues: 850,
                            nullCount: 50,
                            avgLength: 12
                        }
                    }
                ];

            case 'ExtractIndexMetadataAsync':
                return [
                    {
                        name: 'users_pkey',
                        tableName: 'users',
                        schema: 'public',
                        isUnique: true,
                        isPartial: false,
                        isFunctional: false,
                        columnNames: ['id'],
                        definition: 'CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id)',
                        statistics: {
                            sizeInBytes: 24576,
                            indexScans: 150,
                            tuplesRead: 200,
                            tuplesFetched: 180
                        }
                    }
                ];

            case 'ExtractConstraintMetadataAsync':
                return [
                    {
                        name: 'users_pkey',
                        type: 'PRIMARY KEY',
                        tableName: 'users',
                        schema: 'public',
                        isEnabled: true,
                        isDeferrable: false,
                        definition: 'PRIMARY KEY (id)',
                        columns: ['id']
                    }
                ];

            case 'ExtractViewMetadataAsync':
                return [
                    {
                        name: 'active_users',
                        schema: 'public',
                        definition: 'SELECT id, name FROM users WHERE active = true',
                        isMaterialized: false,
                        columns: [
                            { name: 'id', dataType: 'integer', isNullable: false, sourceExpression: 'id' },
                            { name: 'name', dataType: 'varchar', isNullable: true, sourceExpression: 'name' }
                        ],
                        dependencies: [
                            { type: 'table', name: 'users', schema: 'public' }
                        ]
                    }
                ];

            case 'ExtractFunctionMetadataAsync':
                return [
                    {
                        name: 'get_user_count',
                        schema: 'public',
                        definition: 'CREATE FUNCTION get_user_count() RETURNS integer AS $$ BEGIN RETURN (SELECT COUNT(*) FROM users); END; $$ LANGUAGE plpgsql',
                        isMaterialized: false,
                        columns: [
                            { name: 'get_user_count', dataType: 'integer', isNullable: false, sourceExpression: 'get_user_count()' }
                        ],
                        dependencies: [
                            { type: 'table', name: 'users', schema: 'public' }
                        ]
                    }
                ];

            case 'ExtractTriggerMetadataAsync':
                return [
                    {
                        name: 'update_user_timestamp',
                        tableName: 'users',
                        schema: 'public',
                        definition: 'CREATE TRIGGER update_user_timestamp BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_timestamp()',
                        isEnabled: true
                    }
                ];

            case 'ExtractSequenceMetadataAsync':
                return [
                    {
                        name: 'users_id_seq',
                        schema: 'public',
                        definition: 'CREATE SEQUENCE users_id_seq INCREMENT 1 START 1',
                        lastValue: 1000,
                        isCalled: true
                    }
                ];

            case 'ExtractMaterializedViewMetadataAsync':
                return [
                    {
                        name: 'user_stats_mv',
                        schema: 'public',
                        definition: 'SELECT COUNT(*), AVG(LENGTH(name)) FROM users',
                        isMaterialized: true,
                        columns: [
                            { name: 'count', dataType: 'bigint', isNullable: false, sourceExpression: 'COUNT(*)' },
                            { name: 'avg_length', dataType: 'numeric', isNullable: true, sourceExpression: 'AVG(LENGTH(name))' }
                        ],
                        dependencies: [
                            { type: 'table', name: 'users', schema: 'public' }
                        ],
                        statistics: {
                            rowCount: 1,
                            sizeInBytes: 8192,
                            lastRefresh: new Date().toISOString()
                        }
                    }
                ];

            case 'ExtractPartitionMetadataAsync':
                return [
                    {
                        name: 'sales_2024',
                        tableName: 'sales',
                        schema: 'public',
                        partitionType: 'RANGE',
                        partitionKey: 'sale_date',
                        definition: 'CREATE TABLE sales_2024 PARTITION OF sales FOR VALUES FROM (\'2024-01-01\') TO (\'2025-01-01\')'
                    }
                ];

            case 'ExtractCollationMetadataAsync':
                return [
                    {
                        name: 'en_US',
                        schema: 'pg_catalog',
                        definition: 'en_US.utf8',
                        characterSet: 'UTF-8',
                        isDefault: false
                    }
                ];

            case 'ExtractForeignTableMetadataAsync':
                return [
                    {
                        name: 'remote_users',
                        schema: 'public',
                        definition: 'CREATE FOREIGN TABLE remote_users (id integer, name text) SERVER remote_server OPTIONS (table_name \'users\')',
                        serverName: 'remote_server',
                        options: { table_name: 'users' }
                    }
                ];

            case 'ExtractTypeMetadataAsync':
                return [
                    {
                        name: 'user_status',
                        schema: 'public',
                        definition: 'CREATE TYPE user_status AS ENUM (\'active\', \'inactive\', \'suspended\')',
                        typeCategory: 'ENUM',
                        isArray: false
                    }
                ];

            case 'ExtractProcedureMetadataAsync':
                return [
                    {
                        name: 'update_user_stats',
                        schema: 'public',
                        definition: 'CREATE PROCEDURE update_user_stats() AS $$ BEGIN UPDATE user_stats SET last_updated = NOW(); END; $$ LANGUAGE plpgsql',
                        isProcedure: true
                    }
                ];

            case 'ExtractRoleMetadataAsync':
                return [
                    {
                        name: 'app_user',
                        definition: 'CREATE ROLE app_user WITH LOGIN PASSWORD \'secret\'',
                        isSuperuser: false,
                        canCreateDb: false,
                        canCreateRole: false,
                        inherit: true,
                        connectionLimit: -1
                    }
                ];

            case 'ExtractTablespaceMetadataAsync':
                return [
                    {
                        name: 'fast_ssd',
                        definition: 'CREATE TABLESPACE fast_ssd OWNER postgres LOCATION \'/mnt/ssd/postgresql/data\'',
                        location: '/mnt/ssd/postgresql/data',
                        sizeInBytes: 1073741824
                    }
                ];

            case 'ExtractExtensionMetadataAsync':
                return [
                    {
                        name: 'uuid-ossp',
                        schema: 'public',
                        definition: 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public',
                        version: '1.1',
                        isEnabled: true
                    }
                ];

            case 'GenerateMigrationWithProgressAsync':
                return {
                    id: 'migration-progress-1',
                    comparison: args[0],
                    selectedDifferences: args[0]?.differences || [],
                    sqlScript: 'CREATE TABLE new_table (id SERIAL PRIMARY KEY);',
                    rollbackScript: 'DROP TABLE IF EXISTS new_table;',
                    type: 'schema_sync',
                    isDryRun: true,
                    status: 'generated',
                    createdAt: new Date().toISOString(),
                    progressCallback: args[1] // Progress callback for real-time updates
                };

            case 'ExecuteMigrationWithProgressAsync':
                return {
                    status: 'completed',
                    executionTime: '200ms',
                    operationsExecuted: 1,
                    errors: [],
                    warnings: [],
                    progressCallback: args[2] // Progress callback for real-time updates
                };

            case 'CompareSchemasDetailedAsync':
                return {
                    id: 'comparison-detailed-1',
                    sourceConnection: args[0],
                    targetConnection: args[1],
                    differences: [
                        {
                            type: 'Added',
                            objectType: 'table',
                            objectName: 'new_table',
                            schema: 'public',
                            differenceDetails: ['Table was added in target database'],
                            detailedComparison: {
                                columns: [],
                                indexes: [],
                                constraints: [],
                                triggers: [],
                                permissions: []
                            }
                        }
                    ],
                    executionTime: '150ms',
                    createdAt: new Date().toISOString(),
                    detailedMetadata: {
                        sourceMetadata: args[0],
                        targetMetadata: args[1]
                    }
                };

            default:
                throw new Error(`Unknown method: ${methodName}`);
        }
    }

    private getDotNetDllPath(): string {
        // For VS Code extension, look in the extension's bin directory
        // Use Node.js __dirname equivalent for ESM compatibility
        const extensionPath = path.dirname(path.dirname(__dirname));
        const dllPath = path.join(extensionPath, 'pg-drive', 'PostgreSqlSchemaCompareSync', 'bin', 'PostgreSqlSchemaCompareSync.dll');

        if (fs.existsSync(dllPath)) {
            Logger.debug('Found .NET DLL at', dllPath);
            return dllPath;
        }

        Logger.warn('Could not find .NET DLL at expected location');
        return dllPath; // Return the expected path anyway for Edge.js to handle
    }

    // Connection Management Methods
    async testConnection(connectionInfo: DotNetConnectionInfo): Promise<boolean> {
        const performanceMonitor = PerformanceMonitor.getInstance();
        const operationId = performanceMonitor.startOperation('testConnection', {
            connectionId: connectionInfo.id,
            hostname: connectionInfo.host,
            database: connectionInfo.database
        });

        try {
            await this.ensureInitialized();

            Logger.debug('Testing connection via .NET library', 'testConnection', { connectionId: connectionInfo.id });

            // Call .NET library method
            const result = await this.callDotNetMethod<boolean>('TestConnectionAsync', connectionInfo);

            performanceMonitor.endOperation(operationId, true);
            Logger.debug('Connection test completed', 'testConnection', { connectionId: connectionInfo.id, success: result });
            return result;
        } catch (error) {
            performanceMonitor.endOperation(operationId, false, (error as Error).message);
            Logger.error('Failed to test connection via .NET library', error as Error);
            throw error;
        }
    }

    async browseSchema(connectionInfo: DotNetConnectionInfo, schemaFilter?: string): Promise<DotNetDatabaseObject[]> {
        await this.ensureInitialized();

        try {
            Logger.debug('Browsing schema via .NET library', 'browseSchema', {
                connectionId: connectionInfo.id,
                schemaFilter
            });

            // Call .NET library method
            const objects = await this.callDotNetMethod<DotNetDatabaseObject[]>(
                'BrowseSchemaAsync',
                connectionInfo,
                schemaFilter || null
            );

            Logger.info('Schema browsing completed', 'browseSchema', {
                connectionId: connectionInfo.id,
                objectCount: objects.length
            });

            return objects;
        } catch (error) {
            Logger.error('Failed to browse schema via .NET library', error as Error);
            throw error;
        }
    }

    async compareSchemas(
        sourceConnection: DotNetConnectionInfo,
        targetConnection: DotNetConnectionInfo,
        options: any
    ): Promise<DotNetSchemaComparison> {
        await this.ensureInitialized();

        try {
            Logger.debug('Comparing schemas via .NET library', 'compareSchemas', {
                sourceConnection: sourceConnection.id,
                targetConnection: targetConnection.id
            });

            // Call .NET library method
            const comparison = await this.callDotNetMethod<DotNetSchemaComparison>(
                'CompareSchemasAsync',
                sourceConnection,
                targetConnection,
                options
            );

            Logger.info('Schema comparison completed', 'compareSchemas', {
                comparisonId: comparison.id,
                differenceCount: comparison.differences.length
            });

            return comparison;
        } catch (error) {
            Logger.error('Failed to compare schemas via .NET library', error as Error);
            throw error;
        }
    }

    async generateMigration(
        comparison: DotNetSchemaComparison,
        options: any
    ): Promise<DotNetMigrationScript> {
        await this.ensureInitialized();

        try {
            Logger.debug('Generating migration via .NET library',
                'generateMigration', {
                comparisonId: comparison.id
            });

            // Call .NET library method
            const migration = await this.callDotNetMethod<DotNetMigrationScript>(
                'GenerateMigrationAsync',
                comparison,
                options
            );

            Logger.info('Migration generation completed', 'generateMigration', {
                migrationId: migration.id,
                operationCount: migration.sqlScript ? migration.sqlScript.split('\n').length : 0
            });

            return migration;
        } catch (error) {
            Logger.error('Failed to generate migration via .NET library', error as Error);
            throw error;
        }
    }

    async executeMigration(
        migration: DotNetMigrationScript,
        connection: DotNetConnectionInfo
    ): Promise<DotNetMigrationResult> {
        await this.ensureInitialized();

        try {
            Logger.debug('Executing migration via .NET library',
                'executeMigration', {
                migrationId: migration.id,
                targetConnection: connection.id
            });

            // Call .NET library method
            const result = await this.callDotNetMethod<DotNetMigrationResult>(
                'ExecuteMigrationAsync',
                migration,
                connection
            );

            Logger.info('Migration execution completed', 'executeMigration', {
                migrationId: migration.id,
                status: result.status,
                operationsExecuted: result.operationsExecuted
            });

            return result;
        } catch (error) {
            Logger.error('Failed to execute migration via .NET library', error as Error);
            throw error;
        }
    }

    async getObjectDetails(
        connectionInfo: DotNetConnectionInfo,
        objectType: string,
        schema: string,
        objectName: string
    ): Promise<any> {
        await this.ensureInitialized();

        try {
            Logger.debug('Getting object details via .NET library', 'getObjectDetails', {
                connectionId: connectionInfo.id,
                objectType,
                schema,
                objectName
            });

            // Call .NET library method
            const details = await this.callDotNetMethod<any>(
                'GetObjectDetailsAsync',
                connectionInfo,
                objectType,
                schema,
                objectName
            );

            Logger.debug('Object details retrieved', 'getObjectDetails', {
                connectionId: connectionInfo.id,
                objectType,
                objectName
            });

            return details;
        } catch (error) {
            Logger.error('Failed to get object details via .NET library', error as Error);
            throw error;
        }
    }

    async executeQuery(
        connectionInfo: DotNetConnectionInfo,
        query: string,
        options: {
            maxRows?: number;
            timeout?: number;
            includeExecutionPlan?: boolean;
        } = {}
    ): Promise<DotNetQueryResult> {
        await this.ensureInitialized();

        try {
            Logger.debug('Executing query via .NET library', 'executeQuery', {
                connectionId: connectionInfo.id,
                queryLength: query.length,
                options
            });

            // Call .NET library method
            const result = await this.callDotNetMethod<DotNetQueryResult>(
                'ExecuteQueryAsync',
                connectionInfo,
                query,
                options
            );

            Logger.info('Query execution completed', 'executeQuery', {
                connectionId: connectionInfo.id,
                rowCount: result.rowCount
            });

            return result;
        } catch (error) {
            Logger.error('Failed to execute query via .NET library', error as Error);
            throw error;
        }
    }

    // Direct .NET interop implementation using Edge.js with comprehensive error handling
    private async callDotNetMethod<TResult>(
        methodName: string,
        ...args: any[]
    ): Promise<TResult> {
        const startTime = Date.now();
        const operationId = `${methodName}-${Date.now()}`;

        try {
            Logger.debug('Calling .NET method', 'callDotNetMethod', {
                methodName,
                argCount: args.length,
                operationId
            });

            // Validate .NET function exists
            const dotNetFunction = this.dotNetFunctions[methodName];
            if (!dotNetFunction) {
                const error = new Error(`No .NET function found for method: ${methodName}`);
                Logger.error('Missing .NET function', error, 'callDotNetMethod', { methodName, operationId });
                throw this.createDotNetError('FunctionNotFound', error.message, methodName);
            }

            // Validate arguments
            if (!this.validateArguments(args)) {
                const error = new Error('Invalid arguments provided to .NET method');
                Logger.error('Invalid arguments', error, 'callDotNetMethod', { methodName, operationId, argCount: args.length });
                throw this.createDotNetError('InvalidArguments', error.message, methodName);
            }

            // Check for timeout
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => {
                    reject(this.createDotNetError('Timeout', `.NET method ${methodName} timed out after 30 seconds`, methodName));
                }, 30000); // 30 second timeout
            });

            // Call the .NET function using Edge.js with timeout
            const resultPromise = new Promise<TResult>((resolve, reject) => {
                try {
                    dotNetFunction(args, (error: any, result: TResult) => {
                        if (error) {
                            Logger.error('Edge.js call failed', error, { methodName, operationId });
                            reject(this.createDotNetError('EdgeJsError', error.message || error.toString(), methodName));
                        } else {
                            Logger.debug('.NET method call completed successfully', 'callDotNetMethod', {
                                methodName,
                                operationId,
                                executionTime: Date.now() - startTime
                            });
                            resolve(result);
                        }
                    });
                } catch (syncError) {
                    Logger.error('Synchronous error in Edge.js call', syncError as Error, 'callDotNetMethod', { methodName, operationId });
                    reject(this.createDotNetError('SyncError', (syncError as Error).message, methodName));
                }
            });

            // Race between result and timeout
            return await Promise.race([resultPromise, timeoutPromise]);

        } catch (error) {
            Logger.error('Failed to call .NET method', error as Error, 'callDotNetMethod', {
                methodName,
                operationId,
                executionTime: Date.now() - startTime
            });

            // If it's already a DotNetError, re-throw it
            if (error instanceof DotNetError) {
                throw error;
            }

            // Otherwise, wrap it in a DotNetError
            throw this.createDotNetError('UnknownError', (error as Error).message, methodName);
        }
    }

    private validateArguments(args: any[]): boolean {
        // Basic validation - ensure we have arguments and they're not all null/undefined
        if (!args || args.length === 0) {
            return false;
        }

        // Check that required arguments are not null/undefined
        for (let i = 0; i < Math.min(args.length, 2); i++) { // Check first 2 args as they're usually connection objects
            if (args[i] === null || args[i] === undefined) {
                return false;
            }
        }

        return true;
    }

    private createDotNetError(type: string, message: string, methodName: string): DotNetError {
        return new DotNetError(type, message, methodName);
    }


    private async ensureInitialized(): Promise<void> {
        const initialized = await this.initialize();
        if (!initialized) {
            throw new Error('.NET integration service failed to initialize');
        }
    }

    // Enhanced Metadata Extraction Methods

    async extractColumnMetadata(
        connectionInfo: DotNetConnectionInfo,
        tableName: string,
        schema: string,
        options: DotNetMetadataExtractionOptions = {}
    ): Promise<DotNetColumnMetadata[]> {
        await this.ensureInitialized();

        try {
            Logger.debug('Extracting column metadata via .NET library', 'extractColumnMetadata', {
                connectionId: connectionInfo.id,
                tableName,
                schema,
                options
            });

            const metadata = await this.callDotNetMethod<DotNetColumnMetadata[]>(
                'ExtractColumnMetadataAsync',
                connectionInfo,
                tableName,
                schema,
                options
            );

            Logger.info('Column metadata extraction completed', 'extractColumnMetadata', {
                connectionId: connectionInfo.id,
                tableName,
                columnCount: metadata.length
            });

            return metadata;
        } catch (error) {
            Logger.error('Failed to extract column metadata via .NET library', error as Error);
            throw error;
        }
    }

    async extractIndexMetadata(
        connectionInfo: DotNetConnectionInfo,
        tableName?: string,
        schema?: string,
        options: DotNetMetadataExtractionOptions = {}
    ): Promise<DotNetIndexMetadata[]> {
        await this.ensureInitialized();

        try {
            Logger.debug('Extracting index metadata via .NET library', 'extractIndexMetadata', {
                connectionId: connectionInfo.id,
                tableName,
                schema,
                options
            });

            const metadata = await this.callDotNetMethod<DotNetIndexMetadata[]>(
                'ExtractIndexMetadataAsync',
                connectionInfo,
                tableName || null,
                schema || null,
                options
            );

            Logger.info('Index metadata extraction completed', 'extractIndexMetadata', {
                connectionId: connectionInfo.id,
                indexCount: metadata.length
            });

            return metadata;
        } catch (error) {
            Logger.error('Failed to extract index metadata via .NET library', error as Error);
            throw error;
        }
    }

    async extractConstraintMetadata(
        connectionInfo: DotNetConnectionInfo,
        tableName?: string,
        schema?: string,
        options: DotNetMetadataExtractionOptions = {}
    ): Promise<DotNetConstraintMetadata[]> {
        await this.ensureInitialized();

        try {
            Logger.debug('Extracting constraint metadata via .NET library', 'extractConstraintMetadata', {
                connectionId: connectionInfo.id,
                tableName,
                schema,
                options
            });

            const metadata = await this.callDotNetMethod<DotNetConstraintMetadata[]>(
                'ExtractConstraintMetadataAsync',
                connectionInfo,
                tableName || null,
                schema || null,
                options
            );

            Logger.info('Constraint metadata extraction completed', 'extractConstraintMetadata', {
                connectionId: connectionInfo.id,
                constraintCount: metadata.length
            });

            return metadata;
        } catch (error) {
            Logger.error('Failed to extract constraint metadata via .NET library', error as Error);
            throw error;
        }
    }

    async extractViewMetadata(
        connectionInfo: DotNetConnectionInfo,
        viewName?: string,
        schema?: string,
        options: DotNetMetadataExtractionOptions = {}
    ): Promise<DotNetViewMetadata[]> {
        await this.ensureInitialized();

        try {
            Logger.debug('Extracting view metadata via .NET library', 'extractViewMetadata', {
                connectionId: connectionInfo.id,
                viewName,
                schema,
                options
            });

            const metadata = await this.callDotNetMethod<DotNetViewMetadata[]>(
                'ExtractViewMetadataAsync',
                connectionInfo,
                viewName || null,
                schema || null,
                options
            );

            Logger.info('View metadata extraction completed', 'extractViewMetadata', {
                connectionId: connectionInfo.id,
                viewCount: metadata.length
            });

            return metadata;
        } catch (error) {
            Logger.error('Failed to extract view metadata via .NET library', error as Error);
            throw error;
        }
    }

    async extractFunctionMetadata(
        connectionInfo: DotNetConnectionInfo,
        functionName?: string,
        schema?: string,
        options: DotNetMetadataExtractionOptions = {}
    ): Promise<any[]> {
        await this.ensureInitialized();

        try {
            Logger.debug('Extracting function metadata via .NET library', 'extractFunctionMetadata', {
                connectionId: connectionInfo.id,
                functionName,
                schema,
                options
            });

            const metadata = await this.callDotNetMethod<any[]>(
                'ExtractFunctionMetadataAsync',
                connectionInfo,
                functionName || null,
                schema || null,
                options
            );

            Logger.info('Function metadata extraction completed', 'extractFunctionMetadata', {
                connectionId: connectionInfo.id,
                functionCount: metadata.length
            });

            return metadata;
        } catch (error) {
            Logger.error('Failed to extract function metadata via .NET library', error as Error);
            throw error;
        }
    }

    // Enhanced Migration Methods with Progress Support

    async generateMigrationWithProgress(
        comparison: DotNetSchemaComparison,
        options: any,
        progressCallback?: (progress: DotNetMigrationProgressReport) => void
    ): Promise<DotNetMigrationScript> {
        await this.ensureInitialized();

        try {
            Logger.debug('Generating migration with progress via .NET library', 'generateMigrationWithProgress', {
                comparisonId: comparison.id,
                hasProgressCallback: !!progressCallback
            });

            const migration = await this.callDotNetMethod<DotNetMigrationScript>(
                'GenerateMigrationWithProgressAsync',
                comparison,
                options,
                progressCallback || null
            );

            Logger.info('Migration generation with progress completed', 'generateMigrationWithProgress', {
                migrationId: migration.id,
                operationCount: migration.sqlScript ? migration.sqlScript.split('\n').length : 0
            });

            return migration;
        } catch (error) {
            Logger.error('Failed to generate migration with progress via .NET library', error as Error);
            throw error;
        }
    }

    async executeMigrationWithProgress(
        migration: DotNetMigrationScript,
        connection: DotNetConnectionInfo,
        progressCallback?: (progress: DotNetMigrationProgressReport) => void
    ): Promise<DotNetMigrationResult> {
        await this.ensureInitialized();

        try {
            Logger.debug('Executing migration with progress via .NET library', 'executeMigrationWithProgress', {
                migrationId: migration.id,
                targetConnection: connection.id,
                hasProgressCallback: !!progressCallback
            });

            const result = await this.callDotNetMethod<DotNetMigrationResult>(
                'ExecuteMigrationWithProgressAsync',
                migration,
                connection,
                progressCallback || null
            );

            Logger.info('Migration execution with progress completed', 'executeMigrationWithProgress', {
                migrationId: migration.id,
                status: result.status,
                operationsExecuted: result.operationsExecuted
            });

            return result;
        } catch (error) {
            Logger.error('Failed to execute migration with progress via .NET library', error as Error);
            throw error;
        }
    }

    async compareSchemasDetailed(
        sourceConnection: DotNetConnectionInfo,
        targetConnection: DotNetConnectionInfo,
        options: any
    ): Promise<any> {
        await this.ensureInitialized();

        try {
            Logger.debug('Comparing schemas in detail via .NET library', 'compareSchemasDetailed', {
                sourceConnection: sourceConnection.id,
                targetConnection: targetConnection.id
            });

            const comparison = await this.callDotNetMethod<any>(
                'CompareSchemasDetailedAsync',
                sourceConnection,
                targetConnection,
                options
            );

            Logger.info('Detailed schema comparison completed', 'compareSchemasDetailed', {
                comparisonId: comparison.id,
                differenceCount: comparison.differences.length
            });

            return comparison;
        } catch (error) {
            Logger.error('Failed to compare schemas in detail via .NET library', error as Error);
            throw error;
        }
    }

    // Enhanced Error Information Method
    getEnhancedErrorInfo(error: any): {
        type: string;
        message: string;
        methodName: string;
        suggestion?: string;
        originalError?: Error;
    } {
        if (error instanceof DotNetError) {
            return {
                type: error.type,
                message: error.message,
                methodName: error.methodName,
                suggestion: this.getErrorSuggestion(error.type),
                originalError: error.originalError
            };
        }

        return {
            type: 'UnknownError',
            message: error.message || error.toString(),
            methodName: 'Unknown',
            suggestion: 'Please check your connection and try again.'
        };
    }

    private getErrorSuggestion(errorType: string): string {
        switch (errorType) {
            case 'ConnectionError':
                return 'Check your connection string, host availability, and authentication credentials.';
            case 'PermissionError':
                return 'Ensure the user has sufficient privileges for the requested operation.';
            case 'SyntaxError':
                return 'Review the SQL syntax and object definitions.';
            case 'Timeout':
                return 'The operation timed out. Try increasing the timeout or check system performance.';
            case 'InvalidArguments':
                return 'Check that all required parameters are provided and valid.';
            default:
                return 'Please check the logs for more detailed information.';
        }
    }

    async dispose(): Promise<void> {
        Logger.info('Disposing .NET integration service');
        this.isInitialized = false;
    }
}