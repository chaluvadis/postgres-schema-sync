import { Logger } from '@/utils/Logger';
import { PerformanceMonitor } from '@/services/PerformanceMonitor';
import { SecurityManager } from '@/services/SecurityManager';
import * as path from 'path';
import * as fs from 'fs';
let edge: any;
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
            Logger.info('Initializing .NET library integration');

            // Import edge-js dynamically for ESM compatibility
            if (!edge) {
                try {
                    Logger.debug('Loading edge-js module');
                    const edgeModule = await import('edge-js');
                    edge = edgeModule;
                    Logger.info('Edge.js loaded successfully');
                } catch (error) {
                    Logger.warn('Edge.js not available, falling back to mock implementation');
                    throw new Error('Edge.js module not available');
                }
            }

            // Get the path to the .NET DLL for VS Code extension
            const dllPath = this.getDotNetDllPath();

            // Validate DLL path
            if (!dllPath || dllPath.length === 0) {
                throw new DotNetError('InvalidDllPath', '.NET DLL path is not available', 'initializeDotNetLibrary');
            }

            // Check if DLL file actually exists
            if (!fs.existsSync(dllPath)) {
                const errorMsg = `.NET DLL not found at: ${dllPath}`;
                Logger.error(errorMsg);
                throw new DotNetError('DllNotFound', errorMsg, 'initializeDotNetLibrary');
            }

            // Validate DLL is readable
            try {
                await fs.promises.access(dllPath, fs.constants.R_OK);
                Logger.debug('DLL file is readable');
            } catch (error) {
                const errorMsg = `.NET DLL is not readable: ${dllPath}`;
                Logger.error(errorMsg);
                throw new DotNetError('DllNotReadable', errorMsg, 'initializeDotNetLibrary');
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
                Logger.error('Edge.js not available - .NET integration cannot function');
                throw new DotNetError('DotNetNotAvailable', 'Edge.js is not available. .NET integration requires Edge.js to communicate with .NET DLL.', 'initializeDotNetLibrary');
            }
        } catch (error) {
            Logger.error('Failed to initialize .NET library', error as Error, 'initializeDotNetLibrary');
            throw error;
        }
    }
    private getDotNetDllPath(): string {
        const possiblePaths = [
            // Built extension path (in out directory)
            path.join(process.cwd(), 'out', 'PostgreSqlSchemaCompareSync.dll'),
            // Development path (Debug build)
            path.join(process.cwd(), 'pg-drive', 'PostgreSqlSchemaCompareSync', 'bin', 'Debug', 'net9.0', 'PostgreSqlSchemaCompareSync.dll'),
            // Development path (Release build)
            path.join(process.cwd(), 'pg-drive', 'PostgreSqlSchemaCompareSync', 'bin', 'Release', 'net9.0', 'PostgreSqlSchemaCompareSync.dll'),
            // Packaged extension path (in dist directory)
            path.join(process.cwd(), 'dist', 'PostgreSqlSchemaCompareSync.dll'),
            // Alternative development path
            path.join(__dirname, '..', '..', 'pg-drive', 'PostgreSqlSchemaCompareSync', 'bin', 'Debug', 'net9.0', 'PostgreSqlSchemaCompareSync.dll'),
            // VS Code extension host path (when installed)
            path.join(__dirname, '..', '..', '..', 'PostgreSqlSchemaCompareSync.dll')
        ];

        Logger.debug('Searching for .NET DLL in possible locations');

        for (const dllPath of possiblePaths) {
            if (fs.existsSync(dllPath)) {
                Logger.info('Found .NET DLL at', dllPath);
                return dllPath;
            } else {
                Logger.debug('DLL not found at', dllPath);
            }
        }

        Logger.warn('Could not find .NET DLL in any expected location');
        Logger.info('Attempting to use primary path for Edge.js compatibility');

        // Return the most likely path for Edge.js to handle
        return possiblePaths[0];
    }
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

            // Decrypt password for .NET library call
            const decryptedConnectionInfo = await this.decryptConnectionPassword(connectionInfo);

            // Call .NET library method
            const result = await this.callDotNetMethod<boolean>('TestConnectionAsync', decryptedConnectionInfo);

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

            // Decrypt password for .NET library call
            const decryptedConnectionInfo = await this.decryptConnectionPassword(connectionInfo);

            // Call .NET library method
            const objects = await this.callDotNetMethod<DotNetDatabaseObject[]>(
                'BrowseSchemaAsync',
                decryptedConnectionInfo,
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

            // Decrypt passwords for .NET library calls
            const decryptedSourceConnection = await this.decryptConnectionPassword(sourceConnection);
            const decryptedTargetConnection = await this.decryptConnectionPassword(targetConnection);

            // Call .NET library method
            const comparison = await this.callDotNetMethod<DotNetSchemaComparison>(
                'CompareSchemasAsync',
                decryptedSourceConnection,
                decryptedTargetConnection,
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

            // Decrypt password for .NET library call
            const decryptedConnectionInfo = await this.decryptConnectionPassword(connectionInfo);

            // Call .NET library method
            const result = await this.callDotNetMethod<DotNetQueryResult>(
                'ExecuteQueryAsync',
                decryptedConnectionInfo,
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
    private async decryptConnectionPassword(connectionInfo: DotNetConnectionInfo): Promise<DotNetConnectionInfo> {
        try {
            // Check if password is encrypted (starts with "encrypted_")
            if (connectionInfo.password && connectionInfo.password.startsWith('encrypted_')) {
                const securityManager = SecurityManager.getInstance();
                const decryptedPassword = await securityManager.decryptSensitiveData(connectionInfo.password);

                return {
                    ...connectionInfo,
                    password: decryptedPassword
                };
            }

            // Password is not encrypted, return as-is
            return connectionInfo;
        } catch (error) {
            Logger.error('Failed to decrypt connection password', error as Error, 'decryptConnectionPassword', {
                connectionId: connectionInfo.id
            });
            throw error;
        }
    }
    async dispose(): Promise<void> {
        Logger.info('Disposing .NET integration service');
        this.isInitialized = false;
    }
}