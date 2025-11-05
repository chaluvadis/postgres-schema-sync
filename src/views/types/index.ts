// Common types for React views

export interface DatabaseConnection {
	id: string;
	name: string;
	host: string;
	port: number;
	database?: string;
	username?: string;
	status: "connected" | "disconnected" | "error" | "connecting";
	lastSync?: Date;
	errorMessage?: string;
	connectionTime?: number;
	ssl?: boolean;
	version?: string;
}

export interface SchemaObject {
	id: string;
	name: string;
	type: "table" | "view" | "function" | "index" | "constraint" | "schema" | "sequence" | "trigger";
	schema: string;
	database: string;
	owner: string;
	sizeInBytes?: number;
	definition: string;
	properties: Record<string, any>;
	createdAt: Date;
	modifiedAt?: Date;
	dependencies: string[];
	children?: SchemaObject[];
	expanded?: boolean;
	loading?: boolean;
}

export interface MigrationStep {
	id: string;
	order: number;
	name: string;
	description: string;
	sqlScript: string;
	objectType: string;
	objectName: string;
	schema: string;
	operation: "CREATE" | "DROP" | "ALTER";
	riskLevel: "low" | "medium" | "high" | "critical";
	estimatedDuration: number;
	dependencies: string[];
	rollbackSql?: string;
	verificationQuery?: string;
	preConditions?: PreCondition[];
	postConditions?: PostCondition[];
}

export interface PreCondition {
	id: string;
	type: "data_condition" | "schema_condition" | "permission_condition";
	description: string;
	sqlQuery?: string;
	expectedResult?: any;
	severity: "critical" | "warning" | "info";
}

export interface PostCondition {
	id: string;
	type: "data_integrity" | "schema_validation" | "performance_check";
	description: string;
	sqlQuery?: string;
	expectedResult?: any;
	tolerance?: number;
	severity: "critical" | "warning" | "info";
}

export interface MigrationScript {
	id: string;
	name: string;
	description: string;
	sourceConnectionId: string;
	targetConnectionId: string;
	migrationSteps: MigrationStep[];
	estimatedExecutionTime: number;
	riskLevel: "low" | "medium" | "high" | "critical";
	createdAt: Date;
	rollbackScript?: RollbackScript;
	validationSteps?: ValidationStep[];
}

export interface RollbackScript {
	isComplete: boolean;
	steps: RollbackStep[];
	estimatedRollbackTime: number;
	successRate: number;
	warnings: string[];
	limitations: string[];
}

export interface RollbackStep {
	order: number;
	description: string;
	estimatedDuration: number;
	riskLevel: "low" | "medium" | "high" | "critical";
	dependencies: string[];
	verificationSteps?: string[];
}

export interface ValidationStep {
	id: string;
	name: string;
	type: "schema_validation" | "data_integrity" | "performance_validation";
	sqlQuery: string;
	expectedResult?: any;
	severity: "critical" | "warning" | "info";
}

export interface QueryResult {
	columns: string[];
	rows: any[][];
	rowCount: number;
	executionTime: number;
	success: boolean;
	error?: string;
	queryId?: string;
	timestamp: Date;
}

export interface QueryHistoryItem {
	id: string;
	query: string;
	timestamp: Date;
	executionTime?: number;
	rowCount?: number;
	success: boolean;
	errorMessage?: string;
	connectionId: string;
}

export interface Operation {
	id: string;
	type: "migration" | "sync" | "backup" | "query" | "analysis" | "schema_comparison";
	status: "pending" | "running" | "completed" | "failed" | "cancelled";
	name: string;
	description?: string;
	progress?: number;
	startTime: Date;
	endTime?: Date;
	duration?: number;
	errorMessage?: string;
	metadata?: Record<string, any>;
	sourceConnectionId?: string;
	targetConnectionId?: string;
	steps?: OperationStep[];
}

export interface OperationStep {
	id: string;
	name: string;
	status: "pending" | "running" | "completed" | "failed" | "skipped";
	startTime?: Date;
	endTime?: Date;
	duration?: number;
	errorMessage?: string;
	sqlScript?: string;
	rollbackScript?: string;
}

export interface ValidationResult {
	stepId: string;
	validationId: string;
	passed: boolean;
	actualResult?: any;
	expectedResult?: any;
	executionTime: number;
	errorMessage?: string;
	timestamp: Date;
}

// UI-specific types
export type ThemeVariant = "light" | "dark" | "auto";

export interface VSCodeTheme {
	colors: {
		background: string;
		foreground: string;
		border: string;
		inputBackground: string;
		inputForeground: string;
		listActiveSelectionBackground: string;
		listHoverBackground: string;
		buttonBackground: string;
		buttonForeground: string;
		error: string;
		warning: string;
		info: string;
		success: string;
		accent: string;
	};
	spacing: {
		xs: string;
		sm: string;
		md: string;
		lg: string;
		xl: string;
		xxl: string;
	};
	typography: {
		fontFamily: string;
		fontSize: {
			xs: string;
			sm: string;
			md: string;
			lg: string;
			xl: string;
		};
	};
	borderRadius: {
		sm: string;
		md: string;
		lg: string;
	};
	shadows: {
		sm: string;
		md: string;
		lg: string;
	};
}

// Component prop types
export interface ButtonProps {
	children: React.ReactNode;
	onClick: () => void;
	variant?: "primary" | "secondary" | "danger" | "success" | "warning";
	size?: "sm" | "md" | "lg";
	disabled?: boolean;
	loading?: boolean;
	fullWidth?: boolean;
	type?: "button" | "submit" | "reset";
}

export interface InputProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	type?: "text" | "password" | "email" | "number";
	disabled?: boolean;
	error?: string;
	label?: string;
	required?: boolean;
	maxLength?: number;
}

export interface SelectProps {
	value: string;
	onChange: (value: string) => void;
	options: Array<{ value: string; label: string; disabled?: boolean }>;
	placeholder?: string;
	disabled?: boolean;
	error?: string;
	label?: string;
	required?: boolean;
}

export interface ModalProps {
	isOpen: boolean;
	onClose: () => void;
	title?: string;
	children: React.ReactNode;
	size?: "sm" | "md" | "lg" | "xl";
	closable?: boolean;
	footer?: React.ReactNode;
}

// Hook return types
export interface UseAsyncState<T> {
	data: T | null;
	loading: boolean;
	error: string | null;
	execute: (...args: any[]) => Promise<void>;
	reset: () => void;
}

// Utility types
export type DeepPartial<T> = {
	[P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<T, Exclude<keyof T, Keys>> &
	{
		[K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Keys>>;
	}[Keys];
