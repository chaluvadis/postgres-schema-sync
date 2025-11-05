export {
	ConnectionService,
	ConnectionServiceOptions,
	ConnectionValidationResult,
} from "./ConnectionService";
export {
	MigrationLock,
	MigrationMetadata,
	MigrationOptions,
	MigrationOrchestrator,
	MigrationRequest,
	MigrationResult,
	ValidationReport as MigrationValidationReport,
} from "./MigrationOrchestrator";
export {
	ColumnStatistics,
	ConnectionHandle,
	ConnectionInfo,
	FunctionParameter,
	IndexStatistics,
	NativeColumnMetadata,
	NativeConstraintMetadata,
	NativeFunctionMetadata,
	NativeIndexMetadata,
	NativeViewMetadata,
	ViewColumn,
	ViewDependency,
} from "./PostgreSqlConnectionManager";
export {
	ValidationFramework,
	ValidationReport,
	ValidationRequest,
	ValidationResult,
	ValidationRule,
} from "./ValidationFramework";

import { ConnectionManager } from "@/managers/ConnectionManager";
import { ConnectionService } from "./ConnectionService";
import { MigrationOrchestrator } from "./MigrationOrchestrator";
import { ValidationFramework } from "./ValidationFramework";

export class CoreServices {
	private static instance: CoreServices | null = null;
	private _connectionService: ConnectionService | null = null;
	private _validationFramework: ValidationFramework | null = null;
	private _migrationOrchestrator: MigrationOrchestrator | null = null;
	private constructor(private connectionManager: ConnectionManager) {}
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

	get validationFramework(): ValidationFramework {
		if (!this._validationFramework) {
			this._validationFramework = new ValidationFramework();
		}
		return this._validationFramework;
	}

	get migrationOrchestrator(): MigrationOrchestrator {
		if (!this._migrationOrchestrator) {
			// ProgressTracker and PostgreSqlSchemaBrowser have been consolidated
			// into other modules, so we pass null for now
			this._migrationOrchestrator = new MigrationOrchestrator(
				this.connectionService,
				null as any, // ProgressTracker consolidated
				this.validationFramework,
				null as any, // PostgreSqlSchemaBrowser consolidated
			);
		}
		return this._migrationOrchestrator;
	}
	getStats(): {
		connectionService: any;
		validationFramework: any;
		migrationOrchestrator: any;
	} {
		return {
			connectionService: this._connectionService ? { initialized: true } : { initialized: false },
			validationFramework: this._validationFramework ? { initialized: true } : { initialized: false },
			migrationOrchestrator: this._migrationOrchestrator?.getStats(),
		};
	}
	dispose(): void {
		this._connectionService?.dispose();
		this._validationFramework?.dispose();
		this._migrationOrchestrator?.dispose();

		this._connectionService = null;
		this._validationFramework = null;
		this._migrationOrchestrator = null;

		CoreServices.instance = null;
	}
}
