import { Logger } from '../utils/Logger';
import { CoreServices } from '../core';
import {
    MigrationRequest,
    MigrationResult,
    MigrationOptions,
    MigrationMetadata
} from '../core/MigrationOrchestrator';
export class StreamlinedMigrationManager {
    private coreServices: CoreServices;
    constructor(connectionManager: any) {
        this.coreServices = CoreServices.getInstance(connectionManager);
    }
    async executeMigration(
        sourceConnectionId: string,
        targetConnectionId: string,
        options: MigrationOptions = {}
    ): Promise<MigrationResult> {
        try {
            Logger.info('Executing streamlined migration', 'StreamlinedMigrationManager.executeMigration', {
                sourceConnectionId,
                targetConnectionId,
                options: Object.keys(options)
            });

            const request: MigrationRequest = {
                sourceConnectionId,
                targetConnectionId,
                options,
                metadata: this.buildMetadata(options)
            };

            const result = await this.coreServices.migrationOrchestrator.executeMigration(request);

            Logger.info('Streamlined migration execution completed', 'StreamlinedMigrationManager.executeMigration', {
                migrationId: result.migrationId,
                success: result.success,
                executionTime: result.executionTime,
                operationsProcessed: result.operationsProcessed
            });

            return result;

        } catch (error) {
            Logger.error('Streamlined migration execution failed', error as Error, 'StreamlinedMigrationManager.executeMigration', {
                sourceConnectionId,
                targetConnectionId
            });
            throw error;
        }
    }
    async cancelMigration(migrationId: string): Promise<boolean> {
        try {
            Logger.info('Cancelling streamlined migration', 'StreamlinedMigrationManager.cancelMigration', {
                migrationId
            });

            const result = await this.coreServices.migrationOrchestrator.cancelMigration(migrationId);

            Logger.info('Streamlined migration cancellation completed', 'StreamlinedMigrationManager.cancelMigration', {
                migrationId,
                success: result
            });

            return result;

        } catch (error) {
            Logger.error('Streamlined migration cancellation failed', error as Error, 'StreamlinedMigrationManager.cancelMigration', {
                migrationId
            });
            return false;
        }
    }
    getStats(): {
        coreServices: any;
        migrationOrchestrator: any;
        validationFramework: any;
        progressTracker: any;
    } {
        return {
            coreServices: {
                connectionService: this.coreServices.connectionService.getServiceStats(),
                validationFramework: this.coreServices.validationFramework.getStats(),
                progressTracker: this.coreServices.progressTracker.getStats(),
                migrationOrchestrator: this.coreServices.migrationOrchestrator.getStats()
            },
            migrationOrchestrator: this.coreServices.migrationOrchestrator.getStats(),
            validationFramework: this.coreServices.validationFramework.getStats(),
            progressTracker: this.coreServices.progressTracker.getStats()
        };
    }
    private buildMetadata(options: MigrationOptions): MigrationMetadata {
        return {
            author: options.author || 'StreamlinedMigrationManager',
            businessJustification: options.businessJustification || 'Automated schema synchronization',
            changeType: options.changeType || 'feature',
            environment: options.environment || 'production',
            tags: options.tags || ['automated', 'streamlined']
        };
    }
    dispose(): void {
        Logger.info('StreamlinedMigrationManager disposed', 'StreamlinedMigrationManager.dispose');
        this.coreServices.dispose();
    }
}