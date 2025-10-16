export { ConnectionService, ConnectionInfo, ConnectionValidationResult, ConnectionServiceOptions } from './ConnectionService';
export { ProgressTracker, ProgressInfo, ProgressCallback, BatchProgressInfo, ValidationProgressInfo, MigrationProgressInfo } from './ProgressTracker';
export { ValidationFramework, ValidationRule, ValidationResult, ValidationRequest, ValidationReport } from './ValidationFramework';
export {
    MigrationOrchestrator,
    MigrationRequest,
    MigrationOptions,
    MigrationMetadata,
    MigrationResult
} from './MigrationOrchestrator';

import { ConnectionManager } from '../managers/ConnectionManager';
import { ConnectionService } from './ConnectionService';
import { ProgressTracker } from './ProgressTracker';
import { ValidationFramework } from './ValidationFramework';
import { MigrationOrchestrator } from './MigrationOrchestrator';

export class CoreServices {
    private static instance: CoreServices | null = null;
    private _connectionService: ConnectionService | null = null;
    private _progressTracker: ProgressTracker | null = null;
    private _validationFramework: ValidationFramework | null = null;
    private _migrationOrchestrator: MigrationOrchestrator | null = null;
    private constructor(private connectionManager: ConnectionManager) { }
    static getInstance(connectionManager: ConnectionManager): CoreServices {
        if (!CoreServices.instance) {
            CoreServices.instance = new CoreServices(connectionManager);
        }
        return CoreServices.instance;
    }

    get connectionService(): ConnectionService {
        if (!this._connectionService) {
            this._connectionService = new ConnectionService(this.connectionManager, this.validationFramework);
        }
        return this._connectionService;
    }

    get progressTracker(): ProgressTracker {
        if (!this._progressTracker) {
            this._progressTracker = new ProgressTracker();
        }
        return this._progressTracker;
    }

    get validationFramework(): ValidationFramework {
        if (!this._validationFramework) {
            this._validationFramework = new ValidationFramework();
        }
        return this._validationFramework;
    }

    get migrationOrchestrator(): MigrationOrchestrator {
        if (!this._migrationOrchestrator) {
            this._migrationOrchestrator = new MigrationOrchestrator(
                this.connectionService,
                this.progressTracker,
                this.validationFramework
            );
        }
        return this._migrationOrchestrator;
    }
    getStats(): {
        connectionService: any;
        progressTracker: any;
        validationFramework: any;
        migrationOrchestrator: any;
    } {
        return {
            connectionService: this._connectionService ? { initialized: true } : { initialized: false },
            progressTracker: this._progressTracker ? { initialized: true } : { initialized: false },
            validationFramework: this._validationFramework ? { initialized: true } : { initialized: false },
            migrationOrchestrator: this._migrationOrchestrator?.getStats()
        };
    }
    dispose(): void {
        this._connectionService?.dispose();
        this._progressTracker?.dispose();
        this._validationFramework?.dispose();
        this._migrationOrchestrator?.dispose();

        this._connectionService = null;
        this._progressTracker = null;
        this._validationFramework = null;
        this._migrationOrchestrator = null;

        CoreServices.instance = null;
    }
}