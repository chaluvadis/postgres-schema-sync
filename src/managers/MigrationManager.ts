import { ConnectionManager } from './ConnectionManager';
import { Logger } from '../utils/Logger';
import { ErrorHandler } from '../utils/ErrorHandler';
import { DotNetIntegrationService, DotNetConnectionInfo, DotNetSchemaComparison, DotNetMigrationScript } from '../services/DotNetIntegrationService';
import { ErrorSeverity } from '../extension';

export interface MigrationScript {
    id: string;
    name: string;
    sourceConnection: string;
    targetConnection: string;
    sqlScript: string;
    rollbackScript: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'rolled_back';
    createdAt: Date;
}

export class MigrationManager {
    private connectionManager: ConnectionManager;
    // SchemaManager integration reserved for future use
    private dotNetService: DotNetIntegrationService;
    private migrations: Map<string, MigrationScript> = new Map();

    constructor(connectionManager: ConnectionManager) {
        this.connectionManager = connectionManager;
        this.dotNetService = DotNetIntegrationService.getInstance();
    }

    async generateMigration(sourceConnectionId: string, targetConnectionId: string): Promise<MigrationScript> {
        try {
            Logger.info('Generating migration', { sourceConnectionId, targetConnectionId });

            // Check if migration generation service is available
            if (!this.dotNetService) {
                throw new Error('DotNet service not available');
            }

            // Get and validate connections
            const sourceConnection = this.connectionManager.getConnection(sourceConnectionId);
            if (!sourceConnection) {
                throw new Error(`Source connection ${sourceConnectionId} not found`);
            }

            const targetConnection = this.connectionManager.getConnection(targetConnectionId);
            if (!targetConnection) {
                throw new Error(`Target connection ${targetConnectionId} not found`);
            }

            // Get and validate passwords
            const sourcePassword = await this.connectionManager.getConnectionPassword(sourceConnectionId);
            if (!sourcePassword) {
                throw new Error('Source connection password not found');
            }

            const targetPassword = await this.connectionManager.getConnectionPassword(targetConnectionId);
            if (!targetPassword) {
                throw new Error('Target connection password not found');
            }

            // Create .NET connection info
            const dotNetSourceConnection: DotNetConnectionInfo = {
                id: sourceConnection.id,
                name: sourceConnection.name,
                host: sourceConnection.host,
                port: sourceConnection.port,
                database: sourceConnection.database,
                username: sourceConnection.username,
                password: sourcePassword,
                createdDate: new Date().toISOString()
            };

            const dotNetTargetConnection: DotNetConnectionInfo = {
                id: targetConnection.id,
                name: targetConnection.name,
                host: targetConnection.host,
                port: targetConnection.port,
                database: targetConnection.database,
                username: targetConnection.username,
                password: targetPassword,
                createdDate: new Date().toISOString()
            };

            // Compare schemas via .NET service
            const comparison = await this.dotNetService.compareSchemas(
                dotNetSourceConnection,
                dotNetTargetConnection,
                { mode: 'strict' }
            );

            // Generate migration via .NET service
            const dotNetMigration = await this.dotNetService.generateMigration(comparison, {
                type: 'Schema',
                generateRollbackScript: true,
                isDryRun: false
            });

            // Convert to local format
            if (!dotNetMigration) {
                throw new Error('Migration generation returned null');
            }

            const migrationScript: MigrationScript = {
                id: dotNetMigration.id,
                name: `Migration_${dotNetMigration.id}`,
                sourceConnection: sourceConnectionId,
                targetConnection: targetConnectionId,
                sqlScript: dotNetMigration.sqlScript,
                rollbackScript: dotNetMigration.rollbackScript,
                status: dotNetMigration.status as any,
                createdAt: new Date(dotNetMigration.createdAt)
            };

            // Store migration
            this.migrations.set(migrationScript.id, migrationScript);

            Logger.info('Migration generated successfully');
            return migrationScript;
        } catch (error) {
            Logger.error('Failed to generate migration', error as Error);
            throw error;
        }
    }

    async executeMigration(migrationId: string, useAdvancedFeatures: boolean = false): Promise<boolean> {
        let migrationSuccess = false;

        try {
            Logger.info('Executing migration', { migrationId });

            // Check if migration execution service is available
            if (!this.dotNetService) {
                throw new Error('DotNet service not available');
            }

            const migration = this.migrations.get(migrationId);
            if (!migration) {
                throw new Error(`Migration ${migrationId} not found`);
            }

            // Update status to running
            migration.status = 'running';
            this.migrations.set(migrationId, migration);

            // Get target connection
            const targetConnection = this.connectionManager.getConnection(migration.targetConnection);
            if (!targetConnection) {
                throw new Error('Target connection not found');
            }

            // Get password for target connection
            const targetPassword = await this.connectionManager.getConnectionPassword(migration.targetConnection);
            if (!targetPassword) {
                throw new Error('Target connection password not found');
            }

            // Convert to .NET format
            const dotNetTargetConnection: DotNetConnectionInfo = {
                id: targetConnection.id,
                name: targetConnection.name,
                host: targetConnection.host,
                port: targetConnection.port,
                database: targetConnection.database,
                username: targetConnection.username,
                password: targetPassword
            };

            // Convert migration to .NET format
            const dotNetMigration: DotNetMigrationScript = {
                id: migration.id,
                comparison: {} as DotNetSchemaComparison, // Would need to be populated properly
                selectedDifferences: [],
                sqlScript: migration.sqlScript,
                rollbackScript: migration.rollbackScript,
                type: 'Schema',
                isDryRun: false,
                status: migration.status,
                createdAt: migration.createdAt.toISOString()
            };

            // Execute via .NET service
            let result;
            try {
                const executionResult = await this.dotNetService.executeMigration(dotNetMigration, dotNetTargetConnection);

                if (!executionResult) {
                    throw new Error('Migration execution returned null');
                }

                result = executionResult;
            } catch (error) {
                Logger.error('Migration execution failed', error as Error);

                // Log rollback availability but don't attempt automatic rollback
                if (migration.rollbackScript) {
                    Logger.info('Rollback script available for manual execution', { migrationId });
                }

                throw error;
            }

            // Update status based on result
            migration.status = result.status as any;
            this.migrations.set(migrationId, migration);

            migrationSuccess = result.status === 'Completed';
            Logger.info('Migration execution completed', migrationSuccess ? 'success' : 'failed');
            return migrationSuccess;
        } catch (error) {
            Logger.error('Failed to execute migration', error as Error);

            // Update migration status to failed
            const migration = this.migrations.get(migrationId);
            if (migration) {
                migration.status = 'failed';
                this.migrations.set(migrationId, migration);
            }

            return false;
        }
    }

    getMigrations(): MigrationScript[] {
        return Array.from(this.migrations.values());
    }

    getDotNetService(): DotNetIntegrationService {
        return this.dotNetService;
    }

    getMigration(id: string): MigrationScript | undefined {
        return this.migrations.get(id);
    }




}