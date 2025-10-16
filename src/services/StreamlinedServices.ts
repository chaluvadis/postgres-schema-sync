import { ConnectionManager } from '../managers/ConnectionManager';
import { StreamlinedMigrationManager } from './StreamlinedMigrationManager';
import { Logger } from '../utils/Logger';

export class StreamlinedServices {
    private static instance: StreamlinedServices;
    private _connectionManager: ConnectionManager;
    private _migrationManager: StreamlinedMigrationManager;

    private constructor(connectionManager: ConnectionManager) {
        this._connectionManager = connectionManager;
        this._migrationManager = new StreamlinedMigrationManager(connectionManager);
    }

    public static getInstance(connectionManager: ConnectionManager): StreamlinedServices {
        if (!StreamlinedServices.instance) {
            StreamlinedServices.instance = new StreamlinedServices(connectionManager);
        }
        return StreamlinedServices.instance;
    }

    public get migrationManager(): StreamlinedMigrationManager {
        return this._migrationManager;
    }

    public get connectionManager(): ConnectionManager {
        return this._connectionManager;
    }

    public dispose(): void {
        Logger.info('Disposing StreamlinedServices');
        if (this._migrationManager) {
            this._migrationManager.dispose();
        }
    }
}