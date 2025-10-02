import { Logger } from '../utils/Logger';

// Import Edge.js for .NET interop
const edge = require('edge-js');

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

            // Get the path to the .NET DLL for VS Code extension
            const dllPath = this.getDotNetDllPath();

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
                })
            };

            Logger.info('.NET library functions initialized successfully');
        } catch (error) {
            Logger.error('Failed to initialize .NET library', error as Error);
            throw error;
        }
    }

    private getDotNetDllPath(): string {
        const path = require('path');
        const fs = require('fs');

        // For VS Code extension, look in the extension's bin directory
        const extensionPath = path.join(__dirname, '..', '..');
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
        await this.ensureInitialized();

        try {
            Logger.debug('Testing connection via .NET library', { connectionId: connectionInfo.id });

            // Call .NET library method
            const result = await this.callDotNetMethod<boolean>('TestConnectionAsync', connectionInfo);

            Logger.debug('Connection test completed', { connectionId: connectionInfo.id, success: result });
            return result;
        } catch (error) {
            Logger.error('Failed to test connection via .NET library', error as Error);
            throw error;
        }
    }

    async browseSchema(connectionInfo: DotNetConnectionInfo, schemaFilter?: string): Promise<DotNetDatabaseObject[]> {
        await this.ensureInitialized();

        try {
            Logger.debug('Browsing schema via .NET library', {
                connectionId: connectionInfo.id,
                schemaFilter
            });

            // Call .NET library method
            const objects = await this.callDotNetMethod<DotNetDatabaseObject[]>(
                'BrowseSchemaAsync',
                connectionInfo,
                schemaFilter || null
            );

            Logger.info('Schema browsing completed', {
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
            Logger.debug('Comparing schemas via .NET library', {
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

            Logger.info('Schema comparison completed', {
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
            Logger.debug('Generating migration via .NET library', {
                comparisonId: comparison.id
            });

            // Call .NET library method
            const migration = await this.callDotNetMethod<DotNetMigrationScript>(
                'GenerateMigrationAsync',
                comparison,
                options
            );

            Logger.info('Migration generation completed', {
                migrationId: migration.id,
                operationCount: migration.sqlScript.split('\n').length
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
            Logger.debug('Executing migration via .NET library', {
                migrationId: migration.id,
                targetConnection: connection.id
            });

            // Call .NET library method
            const result = await this.callDotNetMethod<DotNetMigrationResult>(
                'ExecuteMigrationAsync',
                migration,
                connection
            );

            Logger.info('Migration execution completed', {
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
            Logger.debug('Getting object details via .NET library', {
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

            Logger.debug('Object details retrieved', {
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


    // Direct .NET interop implementation using Edge.js
    private async callDotNetMethod<TResult>(
        methodName: string,
        ...args: any[]
    ): Promise<TResult> {
        try {
            Logger.debug('Calling .NET method', { methodName, argCount: args.length });

            // Get .NET function
            const dotNetFunction = this.dotNetFunctions[methodName];
            if (!dotNetFunction) {
                throw new Error(`No .NET function found for method: ${methodName}`);
            }

            // Call the .NET function using Edge.js
            return await new Promise<TResult>((resolve, reject) => {
                dotNetFunction(args, (error: any, result: TResult) => {
                    if (error) {
                        Logger.error('Edge.js call failed', error, { methodName });
                        reject(new Error(`.NET method call failed: ${error.message || error.toString()}`));
                    } else {
                        Logger.debug('.NET method call completed successfully', { methodName });
                        resolve(result);
                    }
                });
            });

        } catch (error) {
            Logger.error('Failed to call .NET method', error as Error, { methodName });
            throw error;
        }
    }


    private async ensureInitialized(): Promise<void> {
        const initialized = await this.initialize();
        if (!initialized) {
            throw new Error('.NET integration service failed to initialize');
        }
    }

    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    async dispose(): Promise<void> {
        Logger.info('Disposing .NET integration service');
        this.isInitialized = false;
    }
}