import { ConnectionManager } from './ConnectionManager';
import { SchemaManager } from './SchemaManager';
import { Logger } from '../utils/Logger';
import { DotNetIntegrationService, DotNetConnectionInfo, DotNetSchemaComparison, DotNetMigrationScript } from '../services/DotNetIntegrationService';

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

    constructor(connectionManager: ConnectionManager, _schemaManager: SchemaManager) {
        this.connectionManager = connectionManager;
        // SchemaManager integration reserved for future use
        this.dotNetService = DotNetIntegrationService.getInstance();
    }

    async generateMigration(sourceConnectionId: string, targetConnectionId: string): Promise<MigrationScript> {
        try {
            Logger.info('Generating migration', { sourceConnectionId, targetConnectionId });

            const sourceConnection = this.connectionManager.getConnection(sourceConnectionId);
            const targetConnection = this.connectionManager.getConnection(targetConnectionId);

            if (!sourceConnection || !targetConnection) {
                throw new Error('Source or target connection not found');
            }

            // Get passwords for both connections
            const sourcePassword = await this.connectionManager.getConnectionPassword(sourceConnectionId);
            const targetPassword = await this.connectionManager.getConnectionPassword(targetConnectionId);

            if (!sourcePassword || !targetPassword) {
                throw new Error('Passwords not found for connections');
            }

            // Convert to .NET format
            const dotNetSourceConnection: DotNetConnectionInfo = {
                id: sourceConnection.id,
                name: sourceConnection.name,
                host: sourceConnection.host,
                port: sourceConnection.port,
                database: sourceConnection.database,
                username: sourceConnection.username,
                password: sourcePassword
            };

            const dotNetTargetConnection: DotNetConnectionInfo = {
                id: targetConnection.id,
                name: targetConnection.name,
                host: targetConnection.host,
                port: targetConnection.port,
                database: targetConnection.database,
                username: targetConnection.username,
                password: targetPassword
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

            this.migrations.set(migrationScript.id, migrationScript);

            Logger.info('Migration generated successfully', { migrationId: migrationScript.id });
            return migrationScript;
        } catch (error) {
            Logger.error('Failed to generate migration', error as Error);
            throw error;
        }
    }

    async executeMigration(migrationId: string): Promise<boolean> {
        try {
            Logger.info('Executing migration', { migrationId });

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
            const result = await this.dotNetService.executeMigration(dotNetMigration, dotNetTargetConnection);

            // Update status based on result
            migration.status = result.status as any;
            this.migrations.set(migrationId, migration);

            const success = result.status === 'Completed';
            Logger.info('Migration execution completed', { migrationId, success });
            return success;
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


    private generateId(): string { // eslint-disable-line @typescript-eslint/no-unused-vars // Reserved for future use
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
}