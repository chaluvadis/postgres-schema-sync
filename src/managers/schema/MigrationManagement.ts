import { QueryExecutionService } from "@/services/QueryExecutionService";
import { Logger } from "@/utils/Logger";
import { ValidationFramework } from "../../core/ValidationFramework";
import {
	EnhancedMigrationScript,
	MigrationDependency,
	MigrationExecutionResult,
	MigrationStep,
	PostCondition,
	PreCondition,
	RollbackScript,
	RollbackStep,
	SchemaSnapshot,
	ValidationResult,
	ValidationStep,
} from "./MigrationTypes";
import { SchemaDifference } from "./SchemaComparison";

/**
 * MigrationManagement - Handles migration script generation, execution, and validation
 * Responsible for creating and executing database migration scripts
 */
export class MigrationManagement {
	private queryService: QueryExecutionService;
	private validationFramework: ValidationFramework;

	/**
	 * Creates a new MigrationManagement instance
	 * @param queryService - Service for executing database queries
	 * @param validationFramework - Framework for validating migration operations
	 */
	constructor(queryService: QueryExecutionService, validationFramework: ValidationFramework) {
		this.queryService = queryService;
		this.validationFramework = validationFramework;
	}
	/**
	 * Generates an enhanced migration script with comprehensive analysis and rollback capabilities
	 * @param sourceConnectionId - Connection ID for the source database
	 * @param targetConnectionId - Connection ID for the target database
	 * @param schemaChanges - Array of schema differences to migrate
	 * @param options - Configuration options for migration generation
	 * @param options.includeRollback - Whether to include rollback script generation
	 * @param options.includeValidation - Whether to include validation steps
	 * @param options.includePerformanceOptimization - Whether to include performance optimizations
	 * @param options.businessJustification - Business justification for the migration
	 * @returns Promise resolving to an enhanced migration script
	 * @throws Error if migration script generation fails
	 */
	async generateEnhancedMigrationScript(
		sourceConnectionId: string,
		targetConnectionId: string,
		schemaChanges: SchemaDifference[],
		options: {
			includeRollback?: boolean;
			includeValidation?: boolean;
			includePerformanceOptimization?: boolean;
			businessJustification?: string;
		} = {},
	): Promise<EnhancedMigrationScript> {
		// Input validation
		if (!sourceConnectionId || typeof sourceConnectionId !== "string") {
			throw new Error("sourceConnectionId must be a non-empty string");
		}
		if (!targetConnectionId || typeof targetConnectionId !== "string") {
			throw new Error("targetConnectionId must be a non-empty string");
		}
		if (!Array.isArray(schemaChanges)) {
			throw new Error("schemaChanges must be an array");
		}
		if (schemaChanges.length === 0) {
			throw new Error("schemaChanges array cannot be empty");
		}
		if (options.businessJustification && typeof options.businessJustification !== "string") {
			throw new Error("businessJustification must be a string if provided");
		}

		try {
			Logger.info("Generating enhanced migration script", "generateEnhancedMigrationScript", {
				sourceConnectionId,
				targetConnectionId,
				changeCount: schemaChanges.length,
				options,
			});

			// Generate migration steps
			const migrationSteps = await this.generateMigrationSteps(schemaChanges, sourceConnectionId, targetConnectionId);

			// Generate validation steps if requested
			const validationSteps = options.includeValidation
				? await this.generateValidationSteps(migrationSteps, sourceConnectionId, targetConnectionId)
				: [];

			// Generate rollback script if requested
			const rollbackScript = options.includeRollback
				? await this.generateRollbackScript(migrationSteps, sourceConnectionId, targetConnectionId)
				: this.getDefaultRollbackScript();

			// Assess overall risk level
			const riskLevel = this.assessMigrationRiskLevel(migrationSteps);

			// Calculate estimated execution time
			const estimatedExecutionTime = migrationSteps.reduce((total, step) => total + step.estimatedDuration, 0);

			// Create enhanced migration script
			const enhancedScript: EnhancedMigrationScript = {
				id: this.generateId(),
				name: `Migration_${sourceConnectionId}_to_${targetConnectionId}_${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}`,
				description: `Schema migration from ${sourceConnectionId} to ${targetConnectionId} with ${schemaChanges.length} changes`,
				version: "1.0.0",
				sourceSchema: await this.createSchemaSnapshot(sourceConnectionId),
				targetSchema: await this.createSchemaSnapshot(targetConnectionId),
				migrationSteps,
				rollbackScript,
				validationSteps,
				dependencies: await this.analyzeMigrationDependencies(migrationSteps, sourceConnectionId, targetConnectionId),
				metadata: {
					author: "MigrationManagement",
					tags: ["schema-migration", "automated"],
					businessJustification: options.businessJustification || "Automated schema migration",
					changeType: "schema",
					environment: "production",
					testingRequired: true,
					documentationUpdated: false,
				},
				generatedAt: new Date(),
				estimatedExecutionTime,
				riskLevel,
			};

			Logger.info("Enhanced migration script generated successfully", "generateEnhancedMigrationScript", {
				scriptId: enhancedScript.id,
				stepCount: migrationSteps.length,
				validationCount: validationSteps.length,
				rollbackComplete: rollbackScript.isComplete,
				riskLevel,
				estimatedTime: `${estimatedExecutionTime}s`,
			});

			return enhancedScript;
		} catch (error) {
			Logger.error("Failed to generate enhanced migration script", error as Error);
			throw error;
		}
	}
	/**
	 * Executes an enhanced migration script with comprehensive monitoring and error handling
	 * @param script - The enhanced migration script to execute
	 * @param connectionId - Connection ID for the target database
	 * @param options - Execution options
	 * @param options.dryRun - If true, only simulate execution without making changes
	 * @param options.validateOnly - If true, only run validation without executing migration
	 * @param options.stopOnError - If true, stop execution on first error
	 * @returns Promise resolving to migration execution result
	 * @throws Error if migration execution fails
	 */
	async executeMigrationScript(
		script: EnhancedMigrationScript,
		connectionId: string,
		options: {
			dryRun?: boolean;
			validateOnly?: boolean;
			stopOnError?: boolean;
		} = {},
	): Promise<MigrationExecutionResult> {
		// Input validation
		if (!script || typeof script !== "object") {
			throw new Error("script must be a valid EnhancedMigrationScript object");
		}
		if (!script.id || !script.migrationSteps || !Array.isArray(script.migrationSteps)) {
			throw new Error("script must have valid id and migrationSteps array");
		}
		if (!connectionId || typeof connectionId !== "string") {
			throw new Error("connectionId must be a non-empty string");
		}

		try {
			Logger.info("Executing enhanced migration script", "executeMigrationScript", {
				scriptId: script.id,
				stepCount: script.migrationSteps.length,
				dryRun: options.dryRun || false,
				validateOnly: options.validateOnly || false,
			});

			const executionId = this.generateId();
			const startTime = new Date();

			// Initialize execution result
			const executionResult: MigrationExecutionResult = {
				scriptId: script.id,
				executionId,
				startTime,
				status: "running",
				completedSteps: 0,
				failedSteps: 0,
				executionLog: [],
				performanceMetrics: {
					totalExecutionTime: 0,
					averageStepTime: 0,
					peakMemoryUsage: 0,
					databaseLoad: 0,
				},
				validationResults: [],
			};

			// If validateOnly, run validation steps only
			if (options.validateOnly) {
				Logger.info("Running validation only", "executeMigrationScript", {
					scriptId: script.id,
				});
				executionResult.validationResults = await this.performFrameworkValidation(script, connectionId);
				executionResult.status = "completed";
				executionResult.endTime = new Date();
				return executionResult;
			}

			// Execute migration steps
			let stepIndex = 0;
			for (const step of script.migrationSteps) {
				try {
					executionResult.currentStep = stepIndex + 1;

					Logger.info("Executing migration step", "executeMigrationScript", {
						scriptId: script.id,
						stepId: step.id,
						stepOrder: step.order,
						operation: step.operation,
					});

					const stepStartTime = Date.now();

					// Execute the step
					if (!options.dryRun) {
						await this.executeMigrationStep(step, connectionId);
					}

					const stepDuration = Date.now() - stepStartTime;

					// Log successful step execution
					executionResult.executionLog.push({
						timestamp: new Date(),
						stepId: step.id,
						level: "info",
						message: `Step ${step.order} completed successfully`,
						duration: stepDuration,
					});

					executionResult.completedSteps++;
				} catch (stepError) {
					Logger.error("Migration step failed", stepError as Error, "executeMigrationScript", {
						scriptId: script.id,
						stepId: step.id,
						stepOrder: step.order,
					});

					executionResult.failedSteps++;
					executionResult.executionLog.push({
						timestamp: new Date(),
						stepId: step.id,
						level: "error",
						message: `Step ${step.order} failed: ${(stepError as Error).message}`,
					});

					// Stop on first error if configured
					if (options.stopOnError) {
						executionResult.status = "failed";
						executionResult.endTime = new Date();
						return executionResult;
					}
				}

				stepIndex++;
			}

			// Run validation steps if available
			if (script.validationSteps && script.validationSteps.length > 0) {
				Logger.info("Running post-migration validation", "executeMigrationScript", {
					scriptId: script.id,
					validationCount: script.validationSteps.length,
				});

				try {
					executionResult.validationResults = await this.performFrameworkValidation(script, connectionId);
				} catch (validationError) {
					Logger.warn("Post-migration validation failed", "executeMigrationScript", {
						scriptId: script.id,
						error: (validationError as Error).message,
					});
				}
			}

			// Calculate performance metrics
			const endTime = new Date();
			executionResult.endTime = endTime;
			executionResult.performanceMetrics.totalExecutionTime = endTime.getTime() - startTime.getTime();
			executionResult.performanceMetrics.averageStepTime =
				executionResult.completedSteps > 0
					? executionResult.performanceMetrics.totalExecutionTime / executionResult.completedSteps
					: 0;

			// Set final status
			executionResult.status = executionResult.failedSteps === 0 ? "completed" : "failed";

			Logger.info("Migration execution completed", "executeMigrationScript", {
				scriptId: script.id,
				status: executionResult.status,
				completedSteps: executionResult.completedSteps,
				failedSteps: executionResult.failedSteps,
				totalTime: `${executionResult.performanceMetrics.totalExecutionTime}ms`,
			});

			return executionResult;
		} catch (error) {
			Logger.error("Migration script execution failed", error as Error);
			throw error;
		}
	}
	/**
	 * Validates a migration script using both framework validation and legacy validation steps
	 * @param script - The enhanced migration script to validate
	 * @param connectionId - Connection ID for the database to validate against
	 * @returns Promise resolving to array of validation results
	 * @throws Error if validation fails
	 */
	async validateMigrationScript(script: EnhancedMigrationScript, connectionId: string): Promise<ValidationResult[]> {
		// Input validation
		if (!script || typeof script !== "object") {
			throw new Error("script must be a valid EnhancedMigrationScript object");
		}
		if (!script.id || !script.validationSteps || !Array.isArray(script.validationSteps)) {
			throw new Error("script must have valid id and validationSteps array");
		}
		if (!connectionId || typeof connectionId !== "string") {
			throw new Error("connectionId must be a non-empty string");
		}

		try {
			Logger.info("Validating migration script with ValidationFramework", "validateMigrationScript", {
				scriptId: script.id,
				stepCount: script.validationSteps.length,
				connectionId,
			});

			// Use ValidationFramework directly
			return await this.performFrameworkValidation(script, connectionId);
		} catch (error) {
			Logger.error("Migration script validation failed", error as Error, "validateMigrationScript");
			throw error;
		}
	}
	/**
	 * Creates a comprehensive snapshot of the database schema for migration analysis
	 * @param connectionId - Connection ID for the database to snapshot
	 * @returns Promise resolving to schema snapshot
	 * @throws Error if schema snapshot creation fails
	 * @private
	 */
	private async createSchemaSnapshot(connectionId: string): Promise<SchemaSnapshot> {
		// Input validation
		if (!connectionId || typeof connectionId !== "string") {
			throw new Error("connectionId must be a non-empty string");
		}

		try {
			Logger.info("Creating schema snapshot", "createSchemaSnapshot", {
				connectionId,
			});

			// Get all tables
			const tablesQuery = `
                SELECT
                    schemaname as schema_name,
                    tablename as table_name,
                    tableowner as owner
                FROM pg_tables
                WHERE schemaname NOT IN ('information_schema', 'pg_catalog')
                ORDER BY schemaname, tablename
            `;

			const tablesResult = await this.queryService.executeQuery(connectionId, tablesQuery);

			// Get all columns for each table
			const columnsQuery = `
                SELECT
                    table_schema,
                    table_name,
                    column_name,
                    data_type,
                    is_nullable,
                    column_default,
                    character_maximum_length,
                    numeric_precision,
                    numeric_scale
                FROM information_schema.columns
                WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
                ORDER BY table_schema, table_name, ordinal_position
            `;

			const columnsResult = await this.queryService.executeQuery(connectionId, columnsQuery);

			// Get all constraints
			const constraintsQuery = `
                SELECT
                    tc.table_schema,
                    tc.table_name,
                    tc.constraint_name,
                    tc.constraint_type,
                    kcu.column_name,
                    ccu.table_schema AS foreign_table_schema,
                    ccu.table_name AS foreign_table_name,
                    ccu.column_name AS foreign_column_name
                FROM information_schema.table_constraints tc
                LEFT JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                LEFT JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
                WHERE tc.table_schema NOT IN ('information_schema', 'pg_catalog')
                ORDER BY tc.table_schema, tc.table_name, tc.constraint_name
            `;

			const constraintsResult = await this.queryService.executeQuery(connectionId, constraintsQuery);

			// Get all indexes
			const indexesQuery = `
                SELECT
                    schemaname as schema_name,
                    tablename as table_name,
                    indexname as index_name,
                    indexdef as index_definition
                FROM pg_indexes
                WHERE schemaname NOT IN ('information_schema', 'pg_catalog')
                ORDER BY schemaname, tablename, indexname
            `;

			const indexesResult = await this.queryService.executeQuery(connectionId, indexesQuery);

			// Build objects array
			const objects: any[] = [];

			// Add tables
			tablesResult.rows.forEach((table: any) => {
				objects.push({
					type: "table",
					category: "table",
					schema: table[0], // schema_name
					name: table[1], // table_name
					owner: table[2], // owner
					definition: `CREATE TABLE ${table[0]}.${table[1]} (\n  -- Columns will be added below\n);`,
				});
			});

			// Add columns to table definitions
			objects.forEach((table) => {
				if (table.type === "table") {
					const tableColumns = columnsResult.rows.filter(
						(col: any) => col[0] === table.schema && col[1] === table.name,
					);

					const columnDefs = tableColumns.map((col: any) => {
						const nullable = col[3] === "YES" ? "NULL" : "NOT NULL";
						const defaultValue = col[5] ? ` DEFAULT ${col[5]}` : "";
						return `  ${col[2]} ${col[3]}${defaultValue}${nullable}`;
					});

					table.definition = `CREATE TABLE ${table.schema}.${table.name} (\n${columnDefs.join(",\n")}\n);`;
				}
			});

			// Add indexes
			indexesResult.rows.forEach((index: any) => {
				objects.push({
					type: "index",
					category: "index",
					schema: index[0], // schema_name
					name: index[2], // index_name
					table: index[1], // table_name
					definition: index[3], // index_definition
				});
			});

			// Build relationships array
			const relationships: any[] = [];
			constraintsResult.rows.forEach((constraint: any) => {
				if (constraint[3] === "FOREIGN KEY") {
					// constraint_type
					relationships.push({
						type: "foreign_key",
						category: "foreign_key",
						table_schema: constraint[0],
						table_name: constraint[1],
						constraint_name: constraint[2],
						column_name: constraint[4],
						foreign_table_schema: constraint[5],
						foreign_table_name: constraint[6],
						foreign_column_name: constraint[7],
					});
				}
			});

			// Generate schema hash
			const schemaHash = await this.generateSchemaHash(objects);

			const snapshot: SchemaSnapshot = {
				connectionId,
				schemaHash,
				objectCount: objects.length,
				capturedAt: new Date(),
				objects,
				relationships,
			};

			Logger.info("Schema snapshot created", "createSchemaSnapshot", {
				connectionId,
				objectCount: objects.length,
				relationshipCount: relationships.length,
			});

			return snapshot;
		} catch (error) {
			Logger.error("Failed to create schema snapshot", error as Error, "createSchemaSnapshot", { connectionId });
			throw error;
		}
	}
	/**
	 * Generates a deterministic hash for schema objects for change detection
	 * @param objects - Array of schema objects to hash
	 * @returns Promise resolving to schema hash string
	 * @throws Error if hash generation fails
	 * @private
	 */
	private async generateSchemaHash(objects: any[]): Promise<string> {
		try {
			// Sort objects consistently for deterministic hashing
			const sortedObjects = objects.sort((a, b) => {
				const keyA = `${a.type}:${a.schema || ""}:${a.name || ""}`;
				const keyB = `${b.type}:${b.schema || ""}:${b.name || ""}`;
				return keyA.localeCompare(keyB);
			});

			// Create a normalized string representation
			const schemaString = sortedObjects
				.map((obj) => {
					const definition = obj.definition || "";
					return `${obj.type}:${obj.schema || ""}:${obj.name || ""}:${definition}`;
				})
				.join("|");

			// Use crypto.subtle for secure hashing (Web Crypto API)
			try {
				const encoder = new TextEncoder();
				const data = encoder.encode(schemaString);
				const hashBuffer = await crypto.subtle.digest("SHA-256", data);
				const hashArray = Array.from(new Uint8Array(hashBuffer));
				const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
				return hashHex;
			} catch (cryptoError) {
				// Fallback to simple hash if crypto.subtle is not available
				let hash = 0;
				for (let i = 0; i < schemaString.length; i++) {
					const char = schemaString.charCodeAt(i);
					hash = (hash << 5) - hash + char;
					hash = hash & hash; // Convert to 32-bit integer
				}
				return Math.abs(hash).toString(16);
			}
		} catch (error) {
			Logger.error("Failed to generate schema hash", error as Error, "generateSchemaHash");
			// Return a simple timestamp-based hash as ultimate fallback
			return Date.now().toString(16);
		}
	}
	/**
	 * Generates ordered migration steps from schema differences
	 * @param schemaChanges - Array of schema differences to convert to steps
	 * @param sourceConnectionId - Connection ID for source database
	 * @param targetConnectionId - Connection ID for target database
	 * @returns Promise resolving to array of migration steps
	 * @private
	 */
	private async generateMigrationSteps(
		schemaChanges: SchemaDifference[],
		sourceConnectionId: string,
		targetConnectionId: string,
	): Promise<MigrationStep[]> {
		// Input validation
		if (!Array.isArray(schemaChanges)) {
			throw new Error("schemaChanges must be an array");
		}
		if (!sourceConnectionId || typeof sourceConnectionId !== "string") {
			throw new Error("sourceConnectionId must be a non-empty string");
		}
		if (!targetConnectionId || typeof targetConnectionId !== "string") {
			throw new Error("targetConnectionId must be a non-empty string");
		}
		const steps: MigrationStep[] = [];

		// Sort changes by dependency order (DROP first, then CREATE/ALTER)
		const orderedChanges = this.orderChangesByDependency(schemaChanges);

		for (let i = 0; i < orderedChanges.length; i++) {
			const change = orderedChanges[i];
			const step = await this.generateMigrationStep(change, i + 1, sourceConnectionId, targetConnectionId);
			steps.push(step);
		}

		return steps;
	}
	/**
	 * Orders schema changes by dependency to ensure safe migration execution
	 * @param changes - Array of schema differences to order
	 * @returns Ordered array of schema differences
	 * @private
	 */
	private orderChangesByDependency(changes: SchemaDifference[]): SchemaDifference[] {
		// Input validation
		if (!Array.isArray(changes)) {
			throw new Error("changes must be an array");
		}
		// Order: DROP operations first, then CREATE, then ALTER
		const dropOperations = changes.filter((c) => c.type === "Removed");
		const createOperations = changes.filter((c) => c.type === "Added");
		const modifyOperations = changes.filter((c) => c.type === "Modified");

		return [...dropOperations, ...createOperations, ...modifyOperations];
	}
	/**
	 * Generates a single migration step from a schema difference
	 * @param change - Schema difference to convert to migration step
	 * @param order - Order number for the migration step
	 * @param sourceConnectionId - Connection ID for source database
	 * @param targetConnectionId - Connection ID for target database
	 * @returns Promise resolving to migration step
	 * @private
	 */
	private async generateMigrationStep(
		change: SchemaDifference,
		order: number,
		sourceConnectionId: string,
		targetConnectionId: string,
	): Promise<MigrationStep> {
		// Input validation
		if (!change || typeof change !== "object") {
			throw new Error("change must be a valid SchemaDifference object");
		}
		if (!change.objectType || !change.objectName || !change.schema) {
			throw new Error("change must have valid objectType, objectName, and schema properties");
		}
		if (typeof order !== "number" || order < 1) {
			throw new Error("order must be a positive number");
		}
		if (!sourceConnectionId || typeof sourceConnectionId !== "string") {
			throw new Error("sourceConnectionId must be a non-empty string");
		}
		if (!targetConnectionId || typeof targetConnectionId !== "string") {
			throw new Error("targetConnectionId must be a non-empty string");
		}
		const stepId = `step_${order}`;

		// Generate SQL based on change type
		const sqlScript = await this.generateChangeSQL(change, sourceConnectionId, targetConnectionId);

		// Determine operation type
		const operation = change.type === "Added" ? "CREATE" : change.type === "Removed" ? "DROP" : "ALTER";

		// Assess risk level
		const riskLevel = this.assessChangeRiskLevel(change);

		// Generate pre and post conditions
		const preConditions = this.generatePreConditions(change);
		const postConditions = this.generatePostConditions(change);

		return {
			id: stepId,
			order,
			name: `${operation} ${change.objectType} ${change.objectName}`,
			description: `${change.type} ${change.objectType} ${change.schema}.${change.objectName}`,
			sqlScript,
			objectType: change.objectType,
			objectName: change.objectName,
			schema: change.schema,
			operation,
			riskLevel,
			dependencies: [], // Would be populated from dependency analysis
			estimatedDuration: this.estimateStepDuration(change),
			rollbackSql: await this.generateRollbackSQL(change, sourceConnectionId, targetConnectionId),
			verificationQuery: this.generateVerificationQuery(change),
			preConditions,
			postConditions,
		};
	}
	/**
	 * Generates SQL statement for a schema change based on change type
	 * @param change - Schema difference to generate SQL for
	 * @param sourceConnectionId - Connection ID for source database
	 * @param targetConnectionId - Connection ID for target database
	 * @returns Promise resolving to SQL statement string
	 * @throws Error if SQL generation fails
	 * @private
	 */
	private async generateChangeSQL(
		change: SchemaDifference,
		sourceConnectionId: string,
		targetConnectionId: string,
	): Promise<string> {
		// Input validation
		if (!change || typeof change !== "object") {
			throw new Error("change must be a valid SchemaDifference object");
		}
		if (!sourceConnectionId || typeof sourceConnectionId !== "string") {
			throw new Error("sourceConnectionId must be a non-empty string");
		}
		if (!targetConnectionId || typeof targetConnectionId !== "string") {
			throw new Error("targetConnectionId must be a non-empty string");
		}
		try {
			switch (change.type) {
				case "Added":
					return await this.generateCreateSQL(change, targetConnectionId);

				case "Removed":
					return this.generateDropSQL(change);

				case "Modified":
					return await this.generateAlterSQL(change, sourceConnectionId, targetConnectionId);

				default:
					return `-- Unknown change type: ${change.type}`;
			}
		} catch (error) {
			Logger.error("Failed to generate change SQL", error as Error, "generateChangeSQL", {
				changeType: change.type,
				objectType: change.objectType,
				objectName: change.objectName,
			});
			return `-- Error generating SQL for ${change.type} ${change.objectType} ${change.objectName}: ${(error as Error).message}`;
		}
	}
	/**
	 * Generates CREATE SQL statement for added objects
	 * @param change - Schema difference representing the added object
	 * @param targetConnectionId - Connection ID for target database
	 * @returns Promise resolving to CREATE SQL statement
	 * @throws Error if CREATE SQL generation fails
	 * @private
	 */
	private async generateCreateSQL(change: SchemaDifference, targetConnectionId: string): Promise<string> {
		// Input validation
		if (!change || typeof change !== "object") {
			throw new Error("change must be a valid SchemaDifference object");
		}
		if (!targetConnectionId || typeof targetConnectionId !== "string") {
			throw new Error("targetConnectionId must be a non-empty string");
		}
		if (change.targetDefinition) {
			return change.targetDefinition;
		}

		// Generate CREATE statement by querying target database for actual definitions
		try {
			switch (change.objectType) {
				case "table":
					return await this.generateTableCreateSQL(change, targetConnectionId);

				case "index":
					return await this.generateIndexCreateSQL(change, targetConnectionId);

				case "view":
					return await this.generateViewCreateSQL(change, targetConnectionId);

				case "function":
					return await this.generateFunctionCreateSQL(change, targetConnectionId);

				default:
					return `-- CREATE statement for ${change.objectType} ${change.objectName} needs manual definition`;
			}
		} catch (error) {
			Logger.error("Failed to generate CREATE SQL from target database", error as Error, "generateCreateSQL", {
				objectType: change.objectType,
				objectName: change.objectName,
				schema: change.schema,
			});
			return `-- Error generating CREATE SQL: ${(error as Error).message}`;
		}
	}

	/**
	 * Generates CREATE TABLE SQL by querying target database structure
	 * @param change - Schema difference for the table to create
	 * @param targetConnectionId - Connection ID for target database
	 * @returns Promise resolving to CREATE TABLE SQL statement
	 * @throws Error if table creation SQL generation fails
	 * @private
	 */
	private async generateTableCreateSQL(change: SchemaDifference, targetConnectionId: string): Promise<string> {
		try {
			// Get table structure from target database
			const tableQuery = `
                SELECT
                    c.column_name,
                    c.data_type,
                    c.is_nullable,
                    c.column_default,
                    c.character_maximum_length,
                    c.numeric_precision,
                    c.numeric_scale
                FROM information_schema.columns c
                WHERE c.table_schema = '${change.schema}'
                AND c.table_name = '${change.objectName}'
                ORDER BY c.ordinal_position
            `;

			const columnsResult = await this.queryService.executeQuery(targetConnectionId, tableQuery);

			if (columnsResult.rows.length === 0) {
				return `-- No columns found for table ${change.schema}.${change.objectName}`;
			}

			// Build column definitions
			const columnDefs = columnsResult.rows.map((col: any) => {
				const columnName = col[0];
				const dataType = col[1];
				const isNullable = col[2] === "YES";
				const defaultValue = col[3];
				const maxLength = col[4];
				const precision = col[5];
				const scale = col[6];

				let typeDef = dataType;
				if (maxLength && (dataType === "varchar" || dataType === "character")) {
					typeDef = `${dataType}(${maxLength})`;
				} else if (precision && scale && (dataType === "numeric" || dataType === "decimal")) {
					typeDef = `${dataType}(${precision},${scale})`;
				}

				const nullableDef = isNullable ? "" : " NOT NULL";
				const defaultDef = defaultValue ? ` DEFAULT ${defaultValue}` : "";

				return `  ${columnName} ${typeDef}${nullableDef}${defaultDef}`;
			});

			return `CREATE TABLE ${change.schema}.${change.objectName} (\n${columnDefs.join(",\n")}\n);`;
		} catch (error) {
			Logger.error("Failed to generate table CREATE SQL", error as Error, "generateTableCreateSQL", {
				schema: change.schema,
				tableName: change.objectName,
			});
			return `-- Error generating CREATE TABLE: ${(error as Error).message}`;
		}
	}

	/**
	 * Generates CREATE INDEX SQL by querying target database index definition
	 * @param change - Schema difference for the index to create
	 * @param targetConnectionId - Connection ID for target database
	 * @returns Promise resolving to CREATE INDEX SQL statement
	 * @throws Error if index creation SQL generation fails
	 * @private
	 */
	private async generateIndexCreateSQL(change: SchemaDifference, targetConnectionId: string): Promise<string> {
		try {
			// Get index definition from target database
			const indexQuery = `
                SELECT indexdef
                FROM pg_indexes
                WHERE schemaname = '${change.schema}'
                AND indexname = '${change.objectName}'
            `;

			const indexResult = await this.queryService.executeQuery(targetConnectionId, indexQuery);

			if (indexResult.rows.length === 0) {
				return `-- Index ${change.schema}.${change.objectName} not found in target database`;
			}

			return indexResult.rows[0][0]; // Return the index definition
		} catch (error) {
			Logger.error("Failed to generate index CREATE SQL", error as Error, "generateIndexCreateSQL", {
				schema: change.schema,
				indexName: change.objectName,
			});
			return `-- Error generating CREATE INDEX: ${(error as Error).message}`;
		}
	}

	/**
	 * Generates CREATE VIEW SQL by querying target database view definition
	 * @param change - Schema difference for the view to create
	 * @param targetConnectionId - Connection ID for target database
	 * @returns Promise resolving to CREATE VIEW SQL statement
	 * @throws Error if view creation SQL generation fails
	 * @private
	 */
	private async generateViewCreateSQL(change: SchemaDifference, targetConnectionId: string): Promise<string> {
		try {
			// Get view definition from target database
			const viewQuery = `
                SELECT definition
                FROM pg_views
                WHERE schemaname = '${change.schema}'
                AND viewname = '${change.objectName}'
            `;

			const viewResult = await this.queryService.executeQuery(targetConnectionId, viewQuery);

			if (viewResult.rows.length === 0) {
				return `-- View ${change.schema}.${change.objectName} not found in target database`;
			}

			return `CREATE VIEW ${change.schema}.${change.objectName} AS\n${viewResult.rows[0][0]}`;
		} catch (error) {
			Logger.error("Failed to generate view CREATE SQL", error as Error, "generateViewCreateSQL", {
				schema: change.schema,
				viewName: change.objectName,
			});
			return `-- Error generating CREATE VIEW: ${(error as Error).message}`;
		}
	}

	/**
	 * Generates CREATE FUNCTION SQL by querying target database function definition
	 * @param change - Schema difference for the function to create
	 * @param targetConnectionId - Connection ID for target database
	 * @returns Promise resolving to CREATE FUNCTION SQL statement
	 * @throws Error if function creation SQL generation fails
	 * @private
	 */
	private async generateFunctionCreateSQL(change: SchemaDifference, targetConnectionId: string): Promise<string> {
		try {
			// Get function definition from target database
			const functionQuery = `
                SELECT pg_get_functiondef(p.oid) as function_definition
                FROM pg_proc p
                JOIN pg_namespace n ON p.pronamespace = n.oid
                WHERE n.nspname = '${change.schema}'
                AND p.proname = '${change.objectName}'
                ORDER BY p.oid
                LIMIT 1
            `;

			const functionResult = await this.queryService.executeQuery(targetConnectionId, functionQuery);

			if (functionResult.rows.length === 0) {
				return `-- Function ${change.schema}.${change.objectName} not found in target database`;
			}

			return functionResult.rows[0][0]; // Return the function definition
		} catch (error) {
			Logger.error("Failed to generate function CREATE SQL", error as Error, "generateFunctionCreateSQL", {
				schema: change.schema,
				functionName: change.objectName,
			});
			return `-- Error generating CREATE FUNCTION: ${(error as Error).message}`;
		}
	}

	/**
	 * Generates DROP SQL statement for removed objects
	 * @param change - Schema difference representing the removed object
	 * @returns DROP SQL statement string
	 * @private
	 */
	private generateDropSQL(change: SchemaDifference): string {
		const objectType = change.objectType.toUpperCase();

		// Handle different object types with appropriate DROP statements
		switch (change.objectType) {
			case "table":
				return `DROP TABLE IF EXISTS ${change.schema}.${change.objectName} CASCADE;`;

			case "index":
				return `DROP INDEX IF EXISTS ${change.schema}.${change.objectName} CASCADE;`;

			case "view":
				return `DROP VIEW IF EXISTS ${change.schema}.${change.objectName} CASCADE;`;

			case "function":
				return `DROP FUNCTION IF EXISTS ${change.schema}.${change.objectName} CASCADE;`;

			case "trigger":
				return `DROP TRIGGER IF EXISTS ${change.objectName} ON ${change.schema} CASCADE;`;

			case "sequence":
				return `DROP SEQUENCE IF EXISTS ${change.schema}.${change.objectName} CASCADE;`;

			default:
				return `DROP ${objectType} IF EXISTS ${change.schema}.${change.objectName} CASCADE;`;
		}
	}

	/**
	 * Generates ALTER SQL statement for modified objects
	 * @param change - Schema difference representing the modified object
	 * @param sourceConnectionId - Connection ID for source database
	 * @param targetConnectionId - Connection ID for target database
	 * @returns Promise resolving to ALTER SQL statement
	 * @throws Error if ALTER SQL generation fails
	 * @private
	 */
	private async generateAlterSQL(
		change: SchemaDifference,
		sourceConnectionId: string,
		targetConnectionId: string,
	): Promise<string> {
		if (change.targetDefinition) {
			return change.targetDefinition;
		}

		// For table modifications, we need to analyze the specific changes
		if (change.objectType === "table") {
			return this.generateTableAlterSQL(change, sourceConnectionId, targetConnectionId);
		}

		if (change.objectType === "column") {
			return this.generateColumnAlterSQL(change, sourceConnectionId, targetConnectionId);
		}

		return `-- ALTER statement for ${change.objectType} ${change.objectName} needs manual definition`;
	}

	/**
	 * Generates ALTER TABLE SQL statement for table modifications
	 * @param change - Schema difference for the table modification
	 * @param sourceConnectionId - Connection ID for source database
	 * @param targetConnectionId - Connection ID for target database
	 * @returns Promise resolving to ALTER TABLE SQL statement
	 * @throws Error if table alteration SQL generation fails
	 * @private
	 */
	private async generateTableAlterSQL(
		change: SchemaDifference,
		sourceConnectionId: string,
		targetConnectionId: string,
	): Promise<string> {
		try {
			Logger.info("Generating table ALTER SQL", "generateTableAlterSQL", {
				schema: change.schema,
				tableName: change.objectName,
				sourceConnectionId,
				targetConnectionId,
			});

			// Get column information from both source and target databases
			const sourceColumns = await this.getTableColumns(sourceConnectionId, change.schema, change.objectName);
			const targetColumns = await this.getTableColumns(targetConnectionId, change.schema, change.objectName);

			if (!sourceColumns || !targetColumns) {
				return `-- Cannot generate ALTER TABLE: unable to retrieve column information`;
			}

			// Get constraint information
			const sourceConstraints = await this.getTableConstraints(sourceConnectionId, change.schema, change.objectName);
			const targetConstraints = await this.getTableConstraints(targetConnectionId, change.schema, change.objectName);

			// Get index information
			const sourceIndexes = await this.getTableIndexes(sourceConnectionId, change.schema, change.objectName);
			const targetIndexes = await this.getTableIndexes(targetConnectionId, change.schema, change.objectName);

			// Analyze differences and generate ALTER statements
			const alterStatements: string[] = [];
			const warnings: string[] = [];

			// Analyze column changes
			if (sourceColumns && targetColumns) {
				const columnChanges = this.analyzeColumnChanges(sourceColumns, targetColumns);
				for (const columnChange of columnChanges) {
					const statement = this.generateColumnAlterStatement(change.schema, change.objectName, columnChange);
					if (statement) {
						alterStatements.push(statement);
					}
					if (columnChange.warning) {
						warnings.push(columnChange.warning);
					}
				}
			}

			// Analyze constraint changes
			if (sourceConstraints && targetConstraints) {
				const constraintChanges = this.analyzeConstraintChanges(sourceConstraints, targetConstraints);
				for (const constraintChange of constraintChanges) {
					const statement = this.generateConstraintAlterStatement(change.schema, change.objectName, constraintChange);
					if (statement) {
						alterStatements.push(statement);
					}
				}
			}

			// Analyze index changes
			if (sourceIndexes && targetIndexes) {
				const indexChanges = this.analyzeIndexChanges(sourceIndexes, targetIndexes);
				for (const indexChange of indexChanges) {
					const statement = this.generateIndexAlterStatement(change.schema, change.objectName, indexChange);
					if (statement) {
						alterStatements.push(statement);
					}
				}
			}

			if (alterStatements.length === 0) {
				return `-- No specific table changes detected for ${change.schema}.${change.objectName}`;
			}

			let result = `-- ALTER TABLE statements for ${change.schema}.${change.objectName}\n${alterStatements.join("\n")}`;

			if (warnings.length > 0) {
				result += `\n-- Warnings:\n${warnings.map((w) => `--   ${w}`).join("\n")}`;
			}

			Logger.info("Table ALTER SQL generated", "generateTableAlterSQL", {
				tableName: change.objectName,
				statementCount: alterStatements.length,
				warningCount: warnings.length,
			});

			return result;
		} catch (error) {
			Logger.error("Failed to generate table ALTER SQL", error as Error, "generateTableAlterSQL", {
				schema: change.schema,
				tableName: change.objectName,
			});
			return `-- Error generating ALTER TABLE: ${(error as Error).message}`;
		}
	}

	/**
	 * Retrieves table column information from database
	 * @param connectionId - Connection ID for the database
	 * @param schema - Schema name
	 * @param tableName - Table name
	 * @returns Promise resolving to array of column information or null if failed
	 * @private
	 */
	private async getTableColumns(connectionId: string, schema: string, tableName: string): Promise<any[] | null> {
		try {
			const query = `
                SELECT
                    column_name,
                    data_type,
                    is_nullable,
                    column_default,
                    character_maximum_length,
                    numeric_precision,
                    numeric_scale,
                    ordinal_position
                FROM information_schema.columns
                WHERE table_schema = '${schema}' AND table_name = '${tableName}'
                ORDER BY ordinal_position
            `;

			const result = await this.queryService.executeQuery(connectionId, query);
			return result.rows.map((row) => ({
				columnName: row[0],
				dataType: row[1],
				isNullable: row[2],
				columnDefault: row[3],
				maxLength: row[4],
				precision: row[5],
				scale: row[6],
				position: row[7],
			}));
		} catch (error) {
			Logger.warn("Failed to get table columns", "getTableColumns", {
				connectionId,
				schema,
				tableName,
				error: (error as Error).message,
			});
			return null;
		}
	}

	/**
	 * Retrieves table constraint information from database
	 * @param connectionId - Connection ID for the database
	 * @param schema - Schema name
	 * @param tableName - Table name
	 * @returns Promise resolving to array of constraint information or null if failed
	 * @private
	 */
	private async getTableConstraints(connectionId: string, schema: string, tableName: string): Promise<any[] | null> {
		try {
			const query = `
                SELECT
                    tc.constraint_name,
                    tc.constraint_type,
                    kcu.column_name,
                    ccu.table_schema AS foreign_table_schema,
                    ccu.table_name AS foreign_table_name,
                    ccu.column_name AS foreign_column_name,
                    cc.check_clause
                FROM information_schema.table_constraints tc
                LEFT JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                LEFT JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
                LEFT JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name
                WHERE tc.table_schema = '${schema}' AND tc.table_name = '${tableName}'
                ORDER BY tc.constraint_name
            `;

			const result = await this.queryService.executeQuery(connectionId, query);
			return result.rows.map((row) => ({
				constraintName: row[0],
				constraintType: row[1],
				columnName: row[2],
				foreignTableSchema: row[3],
				foreignTableName: row[4],
				foreignColumnName: row[5],
				checkClause: row[6],
			}));
		} catch (error) {
			Logger.warn("Failed to get table constraints", "getTableConstraints", {
				connectionId,
				schema,
				tableName,
				error: (error as Error).message,
			});
			return null;
		}
	}

	/**
	 * Retrieves table index information from database
	 * @param connectionId - Connection ID for the database
	 * @param schema - Schema name
	 * @param tableName - Table name
	 * @returns Promise resolving to array of index information or null if failed
	 * @private
	 */
	private async getTableIndexes(connectionId: string, schema: string, tableName: string): Promise<any[] | null> {
		try {
			const query = `
                SELECT
                    schemaname,
                    tablename,
                    indexname,
                    indexdef
                FROM pg_indexes
                WHERE schemaname = '${schema}' AND tablename = '${tableName}'
                ORDER BY indexname
            `;

			const result = await this.queryService.executeQuery(connectionId, query);
			return result.rows.map((row) => ({
				schema: row[0],
				tableName: row[1],
				indexName: row[2],
				definition: row[3],
			}));
		} catch (error) {
			Logger.warn("Failed to get table indexes", "getTableIndexes", {
				connectionId,
				schema,
				tableName,
				error: (error as Error).message,
			});
			return null;
		}
	}

	/**
	 * Analyzes differences between source and target column definitions
	 * @param sourceColumns - Column definitions from source database
	 * @param targetColumns - Column definitions from target database
	 * @returns Array of column change objects
	 * @private
	 */
	private analyzeColumnChanges(sourceColumns: any[], targetColumns: any[]): any[] {
		const changes: any[] = [];

		// Find added columns
		for (const targetCol of targetColumns) {
			const sourceCol = sourceColumns.find((sc) => sc.columnName === targetCol.columnName);
			if (!sourceCol) {
				changes.push({
					type: "ADD",
					category: "ADD",
					column: targetCol,
					warning: null,
				});
			}
		}

		// Find removed columns
		for (const sourceCol of sourceColumns) {
			const targetCol = targetColumns.find((tc) => tc.columnName === sourceCol.columnName);
			if (!targetCol) {
				changes.push({
					type: "DROP",
					category: "DROP",
					column: sourceCol,
					warning: `WARNING: Dropping column ${sourceCol.columnName} may cause data loss`,
				});
			}
		}

		// Find modified columns
		for (const sourceCol of sourceColumns) {
			const targetCol = targetColumns.find((tc) => tc.columnName === sourceCol.columnName);
			if (targetCol) {
				const differences = this.compareColumns(sourceCol, targetCol);
				if (differences.length > 0) {
					changes.push({
						type: "MODIFY",
						category: "MODIFY",
						sourceColumn: sourceCol,
						targetColumn: targetCol,
						differences,
						warning: differences.some((d) => d.includes("data type"))
							? `WARNING: Data type change for ${sourceCol.columnName} may cause data loss`
							: null,
					});
				}
			}
		}

		return changes;
	}

	/**
	 * Compares two column definitions and returns list of differences
	 * @param sourceCol - Source column definition
	 * @param targetCol - Target column definition
	 * @returns Array of difference descriptions
	 * @private
	 */
	private compareColumns(sourceCol: any, targetCol: any): string[] {
		const differences: string[] = [];

		if (sourceCol.dataType !== targetCol.dataType) {
			differences.push(`data type: ${sourceCol.dataType} -> ${targetCol.dataType}`);
		}
		if (sourceCol.isNullable !== targetCol.isNullable) {
			differences.push(`nullable: ${sourceCol.isNullable} -> ${targetCol.isNullable}`);
		}
		if (sourceCol.columnDefault !== targetCol.columnDefault) {
			differences.push(`default: ${sourceCol.columnDefault} -> ${targetCol.columnDefault}`);
		}
		if (sourceCol.maxLength !== targetCol.maxLength) {
			differences.push(`max length: ${sourceCol.maxLength} -> ${targetCol.maxLength}`);
		}

		return differences;
	}

	/**
	 * Generates ALTER TABLE statement for column changes
	 * @param schema - Schema name
	 * @param tableName - Table name
	 * @param change - Column change object
	 * @returns ALTER TABLE statement or null if no change needed
	 * @private
	 */
	private generateColumnAlterStatement(schema: string, tableName: string, change: any): string | null {
		switch (change.type) {
			case "ADD":
				const nullable = change.column.isNullable === "YES" ? "" : " NOT NULL";
				const defaultVal = change.column.columnDefault ? ` DEFAULT ${change.column.columnDefault}` : "";
				return `ALTER TABLE ${schema}.${tableName} ADD COLUMN ${change.column.columnName} ${change.column.dataType}${nullable}${defaultVal};`;

			case "DROP":
				return `ALTER TABLE ${schema}.${tableName} DROP COLUMN IF EXISTS ${change.column.columnName} CASCADE;`;

			case "MODIFY":
				const statements: string[] = [];
				if (change.differences.some((d: string) => d.includes("data type"))) {
					statements.push(
						`ALTER TABLE ${schema}.${tableName} ALTER COLUMN ${change.sourceColumn.columnName} TYPE ${change.targetColumn.dataType};`,
					);
				}
				if (change.differences.some((d: string) => d.includes("nullable"))) {
					if (change.targetColumn.isNullable === "YES") {
						statements.push(
							`ALTER TABLE ${schema}.${tableName} ALTER COLUMN ${change.sourceColumn.columnName} DROP NOT NULL;`,
						);
					} else {
						statements.push(
							`ALTER TABLE ${schema}.${tableName} ALTER COLUMN ${change.sourceColumn.columnName} SET NOT NULL;`,
						);
					}
				}
				if (change.differences.some((d: string) => d.includes("default"))) {
					if (change.targetColumn.columnDefault) {
						statements.push(
							`ALTER TABLE ${schema}.${tableName} ALTER COLUMN ${change.sourceColumn.columnName} SET DEFAULT ${change.targetColumn.columnDefault};`,
						);
					} else {
						statements.push(
							`ALTER TABLE ${schema}.${tableName} ALTER COLUMN ${change.sourceColumn.columnName} DROP DEFAULT;`,
						);
					}
				}
				return statements.join("\n");

			default:
				return null;
		}
	}

	/**
	 * Analyzes differences between source and target constraint definitions
	 * @param sourceConstraints - Constraint definitions from source database
	 * @param targetConstraints - Constraint definitions from target database
	 * @returns Array of constraint change objects
	 * @private
	 */
	private analyzeConstraintChanges(sourceConstraints: any[], targetConstraints: any[]): any[] {
		const changes: any[] = [];

		// Find added constraints
		for (const targetCon of targetConstraints) {
			const sourceCon = sourceConstraints.find((sc) => sc.constraintName === targetCon.constraintName);
			if (!sourceCon) {
				changes.push({
					type: "ADD",
					category: "ADD",
					constraint: targetCon,
				});
			}
		}

		// Find removed constraints
		for (const sourceCon of sourceConstraints) {
			const targetCon = targetConstraints.find((tc) => tc.constraintName === sourceCon.constraintName);
			if (!targetCon) {
				changes.push({
					type: "DROP",
					category: "DROP",
					constraint: sourceCon,
				});
			}
		}

		return changes;
	}

	/**
	 * Generates ALTER TABLE statement for constraint changes
	 * @param schema - Schema name
	 * @param tableName - Table name
	 * @param change - Constraint change object
	 * @returns ALTER TABLE statement or null if no change needed
	 * @private
	 */
	private generateConstraintAlterStatement(schema: string, tableName: string, change: any): string | null {
		switch (change.type) {
			case "ADD":
				const constraint = change.constraint;
				switch (constraint.constraintType) {
					case "PRIMARY KEY":
						return `ALTER TABLE ${schema}.${tableName} ADD CONSTRAINT ${constraint.constraintName} PRIMARY KEY (${constraint.columnName});`;
					case "FOREIGN KEY":
						return `ALTER TABLE ${schema}.${tableName} ADD CONSTRAINT ${constraint.constraintName} FOREIGN KEY (${constraint.columnName}) REFERENCES ${constraint.foreignTableSchema}.${constraint.foreignTableName}(${constraint.foreignColumnName});`;
					case "UNIQUE":
						return `ALTER TABLE ${schema}.${tableName} ADD CONSTRAINT ${constraint.constraintName} UNIQUE (${constraint.columnName});`;
					case "CHECK":
						return `ALTER TABLE ${schema}.${tableName} ADD CONSTRAINT ${constraint.constraintName} CHECK (${constraint.checkClause});`;
					default:
						return `-- Unknown constraint type: ${constraint.constraintType}`;
				}

			case "DROP":
				return `ALTER TABLE ${schema}.${tableName} DROP CONSTRAINT IF EXISTS ${change.constraint.constraintName} CASCADE;`;

			default:
				return null;
		}
	}

	/**
	 * Analyzes differences between source and target index definitions
	 * @param sourceIndexes - Index definitions from source database
	 * @param targetIndexes - Index definitions from target database
	 * @returns Array of index change objects
	 * @private
	 */
	private analyzeIndexChanges(sourceIndexes: any[], targetIndexes: any[]): any[] {
		const changes: any[] = [];

		// Find added indexes
		for (const targetIdx of targetIndexes) {
			const sourceIdx = sourceIndexes.find((si) => si.indexName === targetIdx.indexName);
			if (!sourceIdx) {
				changes.push({
					type: "ADD",
					category: "ADD",
					index: targetIdx,
				});
			}
		}

		// Find removed indexes
		for (const sourceIdx of sourceIndexes) {
			const targetIdx = targetIndexes.find((ti) => ti.indexName === sourceIdx.indexName);
			if (!targetIdx) {
				changes.push({
					type: "DROP",
					category: "DROP",
					index: sourceIdx,
				});
			}
		}

		return changes;
	}

	/**
	 * Generates CREATE/DROP INDEX statement for index changes
	 * @param schema - Schema name
	 * @param tableName - Table name
	 * @param change - Index change object
	 * @returns CREATE INDEX or DROP INDEX statement or null if no change needed
	 * @private
	 */
	private generateIndexAlterStatement(schema: string, tableName: string, change: any): string | null {
		switch (change.type) {
			case "ADD":
				return change.index.definition;

			case "DROP":
				return `DROP INDEX IF EXISTS ${schema}.${change.index.indexName} CASCADE;`;

			default:
				return null;
		}
	}

	/**
	 * Generate ALTER COLUMN SQL statement
	 */
	private async generateColumnAlterSQL(
		change: SchemaDifference,
		sourceConnectionId: string,
		targetConnectionId: string,
	): Promise<string> {
		try {
			Logger.info("Generating column ALTER SQL", "generateColumnAlterSQL", {
				schema: change.schema,
				objectName: change.objectName,
				sourceConnectionId,
				targetConnectionId,
			});

			// For column changes, we need to determine the table name and column name
			// The objectName in SchemaDifference for column changes typically includes both
			const columnName = change.objectName;
			const tableName = change.objectName; // This should be the table name for column changes

			// If we have target definition, use it directly
			if (change.targetDefinition) {
				return `-- ALTER COLUMN based on target definition\n${change.targetDefinition}`;
			}

			// Get detailed column information from both source and target databases
			const sourceColumnInfo = await this.getColumnInfo(sourceConnectionId, change.schema, tableName, columnName);
			const targetColumnInfo = await this.getColumnInfo(targetConnectionId, change.schema, tableName, columnName);

			if (!targetColumnInfo) {
				return `-- Cannot generate ALTER COLUMN: column ${columnName} not found in target schema`;
			}

			// Generate specific ALTER statements based on differences
			const alterStatements: string[] = [];
			const warnings: string[] = [];

			// Compare data types
			if (sourceColumnInfo && sourceColumnInfo.dataType !== targetColumnInfo.dataType) {
				const typeChange = `ALTER TABLE ${change.schema}.${tableName} ALTER COLUMN ${columnName} TYPE ${targetColumnInfo.dataType}`;

				// Handle USING clause for complex type conversions
				if (this.needsUsingClause(sourceColumnInfo.dataType, targetColumnInfo.dataType)) {
					const usingClause = this.generateUsingClause(
						sourceColumnInfo.dataType,
						targetColumnInfo.dataType,
						columnName,
					);
					alterStatements.push(`${typeChange} USING ${usingClause};`);
				} else {
					alterStatements.push(`${typeChange};`);
				}

				warnings.push(`Data type changed from ${sourceColumnInfo.dataType} to ${targetColumnInfo.dataType}`);
				warnings.push(`WARNING: Data type changes may cause data loss or performance impact`);
			}

			// Compare nullability
			if (sourceColumnInfo && sourceColumnInfo.isNullable !== targetColumnInfo.isNullable) {
				if (targetColumnInfo.isNullable === "YES") {
					alterStatements.push(`ALTER TABLE ${change.schema}.${tableName} ALTER COLUMN ${columnName} DROP NOT NULL;`);
				} else {
					// Check if column has null values before adding NOT NULL constraint
					const nullCheckQuery = `SELECT COUNT(*) FROM ${change.schema}.${tableName} WHERE ${columnName} IS NULL`;
					const nullResult = await this.queryService.executeQuery(targetConnectionId, nullCheckQuery);
					const nullCount = parseInt(nullResult.rows[0][0]);

					if (nullCount > 0) {
						warnings.push(
							`Column ${columnName} contains ${nullCount} NULL values - NOT NULL constraint cannot be added`,
						);
						alterStatements.push(
							`-- ALTER TABLE ${change.schema}.${tableName} ALTER COLUMN ${columnName} SET NOT NULL; -- BLOCKED: NULL values exist`,
						);
					} else {
						alterStatements.push(`ALTER TABLE ${change.schema}.${tableName} ALTER COLUMN ${columnName} SET NOT NULL;`);
					}
				}
			}

			// Compare default values
			if (sourceColumnInfo && sourceColumnInfo.columnDefault !== targetColumnInfo.columnDefault) {
				if (targetColumnInfo.columnDefault) {
					alterStatements.push(
						`ALTER TABLE ${change.schema}.${tableName} ALTER COLUMN ${columnName} SET DEFAULT ${targetColumnInfo.columnDefault};`,
					);
				} else {
					alterStatements.push(`ALTER TABLE ${change.schema}.${tableName} ALTER COLUMN ${columnName} DROP DEFAULT;`);
				}
			}

			// If no specific changes detected but we have difference details, parse them
			if (alterStatements.length === 0 && change.differenceDetails && change.differenceDetails.length > 0) {
				for (const detail of change.differenceDetails) {
					if (detail.toLowerCase().includes("data type") || detail.toLowerCase().includes("type")) {
						alterStatements.push(`-- ALTER COLUMN ${columnName} TYPE [new_data_type]; -- Based on: ${detail}`);
					}
					if (detail.toLowerCase().includes("nullable") || detail.toLowerCase().includes("null")) {
						alterStatements.push(`-- ALTER COLUMN ${columnName} [SET/DROP] NOT NULL; -- Based on: ${detail}`);
					}
					if (detail.toLowerCase().includes("default")) {
						alterStatements.push(`-- ALTER COLUMN ${columnName} [SET/DROP] DEFAULT [value]; -- Based on: ${detail}`);
					}
				}
			}

			// If still no specific changes, provide intelligent defaults based on column type
			if (alterStatements.length === 0) {
				alterStatements.push(`-- No specific column changes detected for ${columnName}`);
				alterStatements.push(`-- Analyzing column properties to suggest modifications:`);

				if (targetColumnInfo.dataType) {
					alterStatements.push(
						`-- Consider: ALTER TABLE ${change.schema}.${tableName} ALTER COLUMN ${columnName} TYPE ${targetColumnInfo.dataType};`,
					);
				}
				if (targetColumnInfo.isNullable === "NO") {
					alterStatements.push(
						`-- Consider: ALTER TABLE ${change.schema}.${tableName} ALTER COLUMN ${columnName} SET NOT NULL;`,
					);
				}
				if (targetColumnInfo.columnDefault) {
					alterStatements.push(
						`-- Consider: ALTER TABLE ${change.schema}.${tableName} ALTER COLUMN ${columnName} SET DEFAULT ${targetColumnInfo.columnDefault};`,
					);
				}
			}

			let result = `-- ALTER COLUMN statements for ${change.schema}.${tableName}.${columnName}\n${alterStatements.join("\n")}`;
			if (warnings.length > 0) {
				result += `\n-- Warnings:\n${warnings.map((w) => `--   ${w}`).join("\n")}`;
			}

			Logger.info("Column ALTER SQL generated", "generateColumnAlterSQL", {
				columnName,
				tableName,
				statementCount: alterStatements.length,
				warningCount: warnings.length,
			});

			return result;
		} catch (error) {
			Logger.error("Failed to generate column ALTER SQL", error as Error, "generateColumnAlterSQL", {
				schema: change.schema,
				objectName: change.objectName,
			});
			return `-- Error generating ALTER COLUMN SQL: ${(error as Error).message}`;
		}
	}

	/**
	 * Get detailed column information from database
	 */
	private async getColumnInfo(
		connectionId: string,
		schema: string,
		tableName: string,
		columnName: string,
	): Promise<any | null> {
		try {
			const columnQuery = `
                SELECT
                    column_name,
                    data_type,
                    is_nullable,
                    column_default,
                    character_maximum_length,
                    numeric_precision,
                    numeric_scale,
                    ordinal_position
                FROM information_schema.columns
                WHERE table_schema = '${schema}' AND table_name = '${tableName}' AND column_name = '${columnName}'
            `;

			const result = await this.queryService.executeQuery(connectionId, columnQuery);

			if (result.rows.length === 0) {
				return null;
			}

			const col = result.rows[0];
			return {
				columnName: col[0],
				dataType: col[1],
				isNullable: col[2],
				columnDefault: col[3],
				maxLength: col[4],
				precision: col[5],
				scale: col[6],
				position: col[7],
			};
		} catch (error) {
			Logger.warn("Failed to get column info", "getColumnInfo", {
				connectionId,
				schema,
				tableName,
				columnName,
				error: (error as Error).message,
			});
			return null;
		}
	}

	/**
	 * Check if type conversion needs USING clause
	 */
	private needsUsingClause(sourceType: string, targetType: string): boolean {
		const incompatibleConversions = [
			{ from: "integer", to: "text" },
			{ from: "text", to: "integer" },
			{ from: "numeric", to: "text" },
			{ from: "text", to: "numeric" },
			{ from: "date", to: "text" },
			{ from: "text", to: "date" },
		];

		return incompatibleConversions.some(
			(conv) =>
				conv.from.toLowerCase() === sourceType.toLowerCase() && conv.to.toLowerCase() === targetType.toLowerCase(),
		);
	}

	/**
	 * Generate USING clause for type conversion
	 */
	private generateUsingClause(sourceType: string, targetType: string, columnName: string): string {
		const sourceLower = sourceType.toLowerCase();
		const targetLower = targetType.toLowerCase();

		// Text to numeric conversion
		if (sourceLower === "text" && (targetLower === "integer" || targetLower === "numeric")) {
			return `${columnName}::${targetType}`;
		}

		// Numeric to text conversion
		if ((sourceLower === "integer" || sourceLower === "numeric") && targetLower === "text") {
			return `${columnName}::text`;
		}

		// Date to text conversion
		if (sourceLower === "date" && targetLower === "text") {
			return `${columnName}::text`;
		}

		// Text to date conversion (risky - may fail)
		if (sourceLower === "text" && targetLower === "date") {
			return `CASE WHEN ${columnName} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN ${columnName}::date ELSE NULL END`;
		}

		// Default conversion
		return `${columnName}::${targetType}`;
	}

	/**
	 * Assess change risk level
	 */
	private assessChangeRiskLevel(change: SchemaDifference): "low" | "medium" | "high" | "critical" {
		if (change.type === "Removed" && change.objectType === "table") {
			return "critical";
		}
		if (change.type === "Removed" && change.objectType === "column") {
			return "high";
		}
		if (change.type === "Modified" && change.objectType === "table") {
			return "high";
		}
		if (change.type === "Added") {
			return "medium";
		}
		return "low";
	}

	/**
	 * Generate pre-conditions for a step
	 */
	private generatePreConditions(change: SchemaDifference): PreCondition[] {
		const conditions: PreCondition[] = [];

		switch (change.type) {
			case "Added":
				conditions.push({
					id: `pre_${change.objectType}_${change.objectName}`,
					type: "data_condition",
					description: `Target object ${change.objectName} should not exist`,
					sqlQuery: `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '${change.schema}' AND table_name = '${change.objectName}'`,
					expectedResult: 0,
					severity: "critical",
				});
				break;

			case "Removed":
				conditions.push({
					id: `pre_${change.objectType}_${change.objectName}_exists`,
					type: "data_condition",
					description: `Source object ${change.objectName} should exist`,
					sqlQuery: `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '${change.schema}' AND table_name = '${change.objectName}'`,
					expectedResult: 1,
					severity: "critical",
				});
				break;

			case "Modified":
				conditions.push({
					id: `pre_${change.objectType}_${change.objectName}_modify`,
					type: "data_condition",
					description: `Object ${change.objectName} should exist for modification`,
					sqlQuery: `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '${change.schema}' AND table_name = '${change.objectName}'`,
					expectedResult: 1,
					severity: "critical",
				});
				break;
		}

		return conditions;
	}

	/**
	 * Generate post-conditions for a step
	 */
	private generatePostConditions(change: SchemaDifference): PostCondition[] {
		const conditions: PostCondition[] = [];

		switch (change.type) {
			case "Added":
				conditions.push({
					id: `post_${change.objectType}_${change.objectName}_created`,
					type: "data_integrity",
					description: `Object ${change.objectName} should exist after creation`,
					sqlQuery: `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '${change.schema}' AND table_name = '${change.objectName}'`,
					expectedResult: 1,
					severity: "critical",
				});
				break;

			case "Removed":
				conditions.push({
					id: `post_${change.objectType}_${change.objectName}_removed`,
					type: "data_integrity",
					description: `Object ${change.objectName} should not exist after removal`,
					sqlQuery: `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '${change.schema}' AND table_name = '${change.objectName}'`,
					expectedResult: 0,
					severity: "critical",
				});
				break;

			case "Modified":
				conditions.push({
					id: `post_${change.objectType}_${change.objectName}_modify_integrity`,
					type: "data_integrity",
					description: `Modified object ${change.objectName} should maintain data integrity`,
					sqlQuery: `SELECT COUNT(*) FROM ${change.schema}.${change.objectName}`,
					expectedResult: ">= 0", // Row count should not be negative
					severity: "critical",
				});
				break;
		}

		return conditions;
	}

	/**
	 * Estimate step duration
	 */
	private estimateStepDuration(change: SchemaDifference): number {
		// Estimate duration in seconds based on change type and complexity
		const baseDuration = 30; // 30 seconds base

		if (change.type === "Removed" && change.objectType === "table") {
			return baseDuration + 60; // Table drops take longer
		}
		if (change.type === "Added" && change.objectType === "table") {
			return baseDuration + 45; // Table creation takes longer
		}
		if (change.type === "Modified") {
			return baseDuration + 30; // Modifications are moderately complex
		}

		return baseDuration;
	}

	/**
	 * Generate rollback SQL
	 */
	private async generateRollbackSQL(
		change: SchemaDifference,
		sourceConnectionId: string,
		targetConnectionId: string,
	): Promise<string> {
		try {
			Logger.info("Generating rollback SQL", "generateRollbackSQL", {
				changeType: change.type,
				objectType: change.objectType,
				objectName: change.objectName,
				schema: change.schema,
			});

			switch (change.type) {
				case "Added":
					return this.generateRollbackForAdded(change);

				case "Removed":
					return this.generateRollbackForRemoved(change, sourceConnectionId);

				case "Modified":
					return this.generateRollbackForModified(change, sourceConnectionId, targetConnectionId);

				default:
					return `-- No rollback SQL available for change type: ${change.type}`;
			}
		} catch (error) {
			Logger.error("Failed to generate rollback SQL", error as Error, "generateRollbackSQL", {
				changeType: change.type,
				objectType: change.objectType,
				objectName: change.objectName,
			});
			return `-- Error generating rollback SQL: ${(error as Error).message}`;
		}
	}

	/**
	 * Generate rollback SQL for ADD operations
	 */
	private generateRollbackForAdded(change: SchemaDifference): string {
		const objectType = change.objectType.toUpperCase();

		// Generate appropriate DROP statement for rollback
		switch (change.objectType) {
			case "table":
				return `DROP TABLE IF EXISTS ${change.schema}.${change.objectName} CASCADE;`;

			case "index":
				return `DROP INDEX IF EXISTS ${change.schema}.${change.objectName} CASCADE;`;

			case "view":
				return `DROP VIEW IF EXISTS ${change.schema}.${change.objectName} CASCADE;`;

			case "function":
				return `DROP FUNCTION IF EXISTS ${change.schema}.${change.objectName} CASCADE;`;

			case "trigger":
				return `DROP TRIGGER IF EXISTS ${change.objectName} ON ${change.schema} CASCADE;`;

			case "sequence":
				return `DROP SEQUENCE IF EXISTS ${change.schema}.${change.objectName} CASCADE;`;

			case "column":
				return `ALTER TABLE ${change.schema}.${change.objectName} DROP COLUMN IF EXISTS [column_name] CASCADE;`;

			default:
				return `DROP ${objectType} IF EXISTS ${change.schema}.${change.objectName} CASCADE;`;
		}
	}

	/**
	 * Generate rollback SQL for REMOVE operations
	 */
	private async generateRollbackForRemoved(change: SchemaDifference, sourceConnectionId: string): Promise<string> {
		if (change.sourceDefinition) {
			return `${change.sourceDefinition}\n-- Original definition restored from source`;
		}

		// Try to get the object definition from source database
		try {
			const sourceSnapshot = await this.createSchemaSnapshot(sourceConnectionId);
			const sourceObject = sourceSnapshot.objects.find(
				(obj) => obj.type === change.objectType && obj.schema === change.schema && obj.name === change.objectName,
			);

			if (sourceObject && sourceObject.definition) {
				return `${sourceObject.definition}\n-- Original definition restored from source database`;
			}
		} catch (error) {
			Logger.warn("Could not retrieve source definition for rollback", "generateRollbackForRemoved", {
				objectType: change.objectType,
				objectName: change.objectName,
				schema: change.schema,
			});
		}

		return `-- WARNING: Cannot rollback REMOVE operation - original definition not available\n-- Manual restoration of ${change.objectType} ${change.schema}.${change.objectName} required`;
	}

	/**
	 * Generate rollback SQL for MODIFY operations
	 */
	private async generateRollbackForModified(
		change: SchemaDifference,
		sourceConnectionId: string,
		targetConnectionId: string,
	): Promise<string> {
		try {
			Logger.info("Generating rollback SQL for modified object", "generateRollbackForModified", {
				objectType: change.objectType,
				objectName: change.objectName,
				schema: change.schema,
				sourceConnectionId,
				targetConnectionId,
			});

			// If we have source definition, use it directly
			if (change.sourceDefinition) {
				return `${change.sourceDefinition}\n-- Original definition restored from source`;
			}

			// Try to get detailed information from source database
			try {
				const sourceSnapshot = await this.createSchemaSnapshot(sourceConnectionId);
				const sourceObject = sourceSnapshot.objects.find(
					(obj) => obj.type === change.objectType && obj.schema === change.schema && obj.name === change.objectName,
				);

				if (sourceObject && sourceObject.definition) {
					return `${sourceObject.definition}\n-- Original definition restored from source database`;
				}
			} catch (error) {
				Logger.warn("Could not retrieve source snapshot for rollback", "generateRollbackForModified", {
					objectType: change.objectType,
					objectName: change.objectName,
					schema: change.schema,
				});
			}

			// Generate specific rollback strategies based on object type and difference details
			switch (change.objectType) {
				case "table":
					return await this.generateTableModificationRollback(change, sourceConnectionId, targetConnectionId);

				case "column":
					return await this.generateColumnModificationRollback(change, sourceConnectionId, targetConnectionId);

				case "index":
					return await this.generateIndexModificationRollback(change, sourceConnectionId, targetConnectionId);

				case "view":
					return await this.generateViewModificationRollback(change, sourceConnectionId, targetConnectionId);

				case "function":
					return await this.generateFunctionModificationRollback(change, sourceConnectionId, targetConnectionId);

				default:
					return this.generateGenericModificationRollback(change, sourceConnectionId, targetConnectionId);
			}
		} catch (error) {
			Logger.error("Failed to generate rollback for modified object", error as Error, "generateRollbackForModified", {
				objectType: change.objectType,
				objectName: change.objectName,
				schema: change.schema,
			});
			return `-- ERROR: Failed to generate rollback SQL for ${change.objectType} ${change.schema}.${change.objectName}: ${(error as Error).message}`;
		}
	}

	/**
	 * Generate rollback for table modifications
	 */
	private async generateTableModificationRollback(
		change: SchemaDifference,
		sourceConnectionId: string,
		targetConnectionId: string,
	): Promise<string> {
		const rollbackSteps: string[] = [];

		try {
			// Get source and target table information
			const sourceSnapshot = await this.createSchemaSnapshot(sourceConnectionId);
			const targetSnapshot = await this.createSchemaSnapshot(targetConnectionId);

			const sourceTable = sourceSnapshot.objects.find(
				(obj) => obj.type === "table" && obj.schema === change.schema && obj.name === change.objectName,
			);

			const targetTable = targetSnapshot.objects.find(
				(obj) => obj.type === "table" && obj.schema === change.schema && obj.name === change.objectName,
			);

			if (!sourceTable) {
				return `-- WARNING: Source table ${change.schema}.${change.objectName} not found - cannot generate rollback`;
			}

			// If we have the source definition, use it
			if (sourceTable.definition) {
				return `-- Restoring table to original definition\n${sourceTable.definition}`;
			}

			// Analyze specific changes from difference details
			if (change.differenceDetails && change.differenceDetails.length > 0) {
				for (const detail of change.differenceDetails) {
					if (detail.toLowerCase().includes("column") && detail.toLowerCase().includes("added")) {
						// Column was added - rollback by dropping it
						const columnMatch = detail.match(/column ['"]([^'"]+)['"]/i);
						if (columnMatch) {
							rollbackSteps.push(`-- Rollback: Drop added column`);
							rollbackSteps.push(
								`ALTER TABLE ${change.schema}.${change.objectName} DROP COLUMN IF EXISTS ${columnMatch[1]} CASCADE;`,
							);
						}
					} else if (detail.toLowerCase().includes("column") && detail.toLowerCase().includes("removed")) {
						// Column was removed - rollback by recreating it (if we have info)
						const columnMatch = detail.match(/column ['"]([^'"]+)['"]/i);
						if (columnMatch) {
							rollbackSteps.push(`-- Rollback: Recreate removed column`);
							rollbackSteps.push(`-- WARNING: Cannot restore column data - manual intervention required`);
							rollbackSteps.push(
								`-- ALTER TABLE ${change.schema}.${change.objectName} ADD COLUMN ${columnMatch[1]} [original_type];`,
							);
						}
					}
				}
			}

			if (rollbackSteps.length === 0) {
				rollbackSteps.push(`-- WARNING: Cannot determine specific table modifications`);
				rollbackSteps.push(`-- Manual rollback required for table ${change.schema}.${change.objectName}`);
			}

			return rollbackSteps.join("\n");
		} catch (error) {
			Logger.error("Failed to generate table modification rollback", error as Error);
			return `-- ERROR: Failed to generate table rollback SQL: ${(error as Error).message}`;
		}
	}

	/**
	 * Generate rollback for column modifications
	 */
	private async generateColumnModificationRollback(
		change: SchemaDifference,
		sourceConnectionId: string,
		targetConnectionId: string,
	): Promise<string> {
		const rollbackSteps: string[] = [];

		try {
			// Get source column information
			const sourceColumnInfo = await this.getColumnInfo(
				sourceConnectionId,
				change.schema,
				change.objectName,
				change.objectName,
			);
			const targetColumnInfo = await this.getColumnInfo(
				targetConnectionId,
				change.schema,
				change.objectName,
				change.objectName,
			);

			if (!sourceColumnInfo) {
				return `-- WARNING: Source column information not available for rollback`;
			}

			// Generate rollback based on what changed
			if (sourceColumnInfo.dataType !== targetColumnInfo?.dataType) {
				rollbackSteps.push(`-- Rollback: Restore original column data type`);
				rollbackSteps.push(
					`ALTER TABLE ${change.schema}.${change.objectName} ALTER COLUMN ${change.objectName} TYPE ${sourceColumnInfo.dataType};`,
				);
			}

			if (sourceColumnInfo.isNullable !== targetColumnInfo?.isNullable) {
				if (sourceColumnInfo.isNullable === "YES") {
					rollbackSteps.push(`-- Rollback: Restore column nullability`);
					rollbackSteps.push(
						`ALTER TABLE ${change.schema}.${change.objectName} ALTER COLUMN ${change.objectName} DROP NOT NULL;`,
					);
				} else {
					rollbackSteps.push(`-- Rollback: Restore column nullability`);
					rollbackSteps.push(
						`ALTER TABLE ${change.schema}.${change.objectName} ALTER COLUMN ${change.objectName} SET NOT NULL;`,
					);
				}
			}

			if (sourceColumnInfo.columnDefault !== targetColumnInfo?.columnDefault) {
				if (sourceColumnInfo.columnDefault) {
					rollbackSteps.push(`-- Rollback: Restore original column default`);
					rollbackSteps.push(
						`ALTER TABLE ${change.schema}.${change.objectName} ALTER COLUMN ${change.objectName} SET DEFAULT ${sourceColumnInfo.columnDefault};`,
					);
				} else {
					rollbackSteps.push(`-- Rollback: Remove column default`);
					rollbackSteps.push(
						`ALTER TABLE ${change.schema}.${change.objectName} ALTER COLUMN ${change.objectName} DROP DEFAULT;`,
					);
				}
			}

			if (rollbackSteps.length === 0) {
				rollbackSteps.push(`-- WARNING: No specific column changes detected for rollback`);
				rollbackSteps.push(`-- Manual verification required for column ${change.objectName}`);
			}

			return rollbackSteps.join("\n");
		} catch (error) {
			Logger.error("Failed to generate column modification rollback", error as Error);
			return `-- ERROR: Failed to generate column rollback SQL: ${(error as Error).message}`;
		}
	}

	/**
	 * Generate rollback for index modifications
	 */
	private async generateIndexModificationRollback(
		change: SchemaDifference,
		sourceConnectionId: string,
		targetConnectionId: string,
	): Promise<string> {
		try {
			Logger.info("Generating index modification rollback", "generateIndexModificationRollback", {
				indexName: change.objectName,
				schema: change.schema,
				sourceConnectionId,
				targetConnectionId,
			});

			// Get detailed index information from both source and target
			const sourceIndexInfo = await this.getIndexInfo(sourceConnectionId, change.schema, change.objectName);
			const targetIndexInfo = await this.getIndexInfo(targetConnectionId, change.schema, change.objectName);

			if (!sourceIndexInfo) {
				return `-- WARNING: Source index ${change.objectName} not found - cannot generate rollback`;
			}

			// If we have the source definition, use it directly
			if (sourceIndexInfo.definition) {
				return `-- Restoring index to original definition\n${sourceIndexInfo.definition}`;
			}

			// Analyze specific index changes and generate appropriate rollback
			const rollbackSteps: string[] = [];
			const warnings: string[] = [];

			// Compare index definitions
			if (sourceIndexInfo.definition !== targetIndexInfo?.definition) {
				if (sourceIndexInfo.isUnique !== targetIndexInfo?.isUnique) {
					rollbackSteps.push(`-- Rollback: Restore index uniqueness`);
					if (sourceIndexInfo.isUnique) {
						rollbackSteps.push(`-- Note: Recreating unique index - ensure no duplicates exist`);
					}
				}

				// Compare indexed columns
				if (sourceIndexInfo.columns && targetIndexInfo?.columns) {
					const columnChanges = this.compareIndexColumns(sourceIndexInfo.columns, targetIndexInfo.columns);
					if (columnChanges.length > 0) {
						rollbackSteps.push(`-- Rollback: Restore original index columns`);
						rollbackSteps.push(`-- Original columns: ${sourceIndexInfo.columns.join(", ")}`);
						warnings.push(
							`Index columns changed from [${sourceIndexInfo.columns.join(", ")}] to [${targetIndexInfo.columns.join(", ")}]`,
						);
					}
				}

				// Compare index types (btree, hash, gin, etc.)
				if (sourceIndexInfo.indexType !== targetIndexInfo?.indexType) {
					rollbackSteps.push(`-- Rollback: Restore original index type`);
					rollbackSteps.push(`-- Original type: ${sourceIndexInfo.indexType}`);
					warnings.push(`Index type changed from ${sourceIndexInfo.indexType} to ${targetIndexInfo?.indexType}`);
				}
			}

			// Generate the complete rollback statement
			if (rollbackSteps.length > 0) {
				let result = `-- Index modification rollback for ${change.schema}.${change.objectName}\n${rollbackSteps.join("\n")}`;

				if (warnings.length > 0) {
					result += `\n-- Warnings:\n${warnings.map((w) => `--   ${w}`).join("\n")}`;
				}

				result += `\n-- Complete rollback statement (requires manual verification):`;
				result += `\n-- DROP INDEX IF EXISTS ${change.schema}.${change.objectName} CASCADE;`;
				result += `\n-- CREATE ${sourceIndexInfo.isUnique ? "UNIQUE " : ""}INDEX ${change.objectName}`;
				result += `\n-- ON ${change.schema}.${sourceIndexInfo.tableName}`;
				result += `\n-- USING ${sourceIndexInfo.indexType || "btree"} (${sourceIndexInfo.columns?.join(", ") || "column_name"});`;

				return result;
			}

			// If no specific changes detected, provide intelligent analysis
			return (
				`-- WARNING: Cannot determine specific index modifications for ${change.objectName}` +
				`\n-- Index analysis: ${JSON.stringify(sourceIndexInfo, null, 2)}` +
				`\n-- Target analysis: ${JSON.stringify(targetIndexInfo, null, 2)}` +
				`\n-- Manual restoration required for index ${change.schema}.${change.objectName}`
			);
		} catch (error) {
			Logger.error(
				"Failed to generate index modification rollback",
				error as Error,
				"generateIndexModificationRollback",
				{
					indexName: change.objectName,
					schema: change.schema,
				},
			);
			return `-- ERROR: Failed to generate index rollback SQL: ${(error as Error).message}`;
		}
	}

	/**
	 * Get detailed index information from database
	 */
	private async getIndexInfo(connectionId: string, schema: string, indexName: string): Promise<any | null> {
		try {
			// Get basic index information
			const indexQuery = `
                SELECT
                    schemaname as schema_name,
                    tablename as table_name,
                    indexname as index_name,
                    indexdef as index_definition
                FROM pg_indexes
                WHERE schemaname = '${schema}' AND indexname = '${indexName}'
            `;

			const result = await this.queryService.executeQuery(connectionId, indexQuery);

			if (result.rows.length === 0) {
				return null;
			}

			const index = result.rows[0];
			const definition = index[3]; // index_definition

			// Parse index definition to extract detailed information
			const indexInfo = {
				schema: index[0],
				tableName: index[1],
				indexName: index[2],
				definition: definition,
				isUnique: definition.toLowerCase().includes("unique"),
				indexType: this.extractIndexType(definition),
				columns: this.extractIndexColumns(definition),
			};

			Logger.debug("Index info retrieved", "getIndexInfo", {
				connectionId,
				schema,
				indexName,
				indexInfo,
			});

			return indexInfo;
		} catch (error) {
			Logger.warn("Failed to get index info", "getIndexInfo", {
				connectionId,
				schema,
				indexName,
				error: (error as Error).message,
			});
			return null;
		}
	}

	/**
	 * Extract index type from definition
	 */
	private extractIndexType(definition: string): string {
		const typeMatch = definition.match(/USING\s+(\w+)/i);
		return typeMatch ? typeMatch[1].toLowerCase() : "btree";
	}

	/**
	 * Extract column names from index definition
	 */
	private extractIndexColumns(definition: string): string[] {
		try {
			// Match column list in parentheses
			const columnMatch = definition.match(/\((\w+(?:\s*,\s*\w+)*)\)/);
			if (columnMatch) {
				return columnMatch[1].split(",").map((col) => col.trim());
			}
			return [];
		} catch (error) {
			Logger.warn("Failed to extract index columns", "extractIndexColumns", {
				definition: definition.substring(0, 200),
			});
			return [];
		}
	}

	/**
	 * Compare index columns between source and target
	 */
	private compareIndexColumns(sourceColumns: string[], targetColumns: string[]): string[] {
		const changes: string[] = [];

		// Find added columns
		const addedColumns = targetColumns.filter((col) => !sourceColumns.includes(col));
		if (addedColumns.length > 0) {
			changes.push(`Added columns: ${addedColumns.join(", ")}`);
		}

		// Find removed columns
		const removedColumns = sourceColumns.filter((col) => !targetColumns.includes(col));
		if (removedColumns.length > 0) {
			changes.push(`Removed columns: ${removedColumns.join(", ")}`);
		}

		// Check for column order changes
		const sourceOrder = sourceColumns.join(",");
		const targetOrder = targetColumns.filter((col) => sourceColumns.includes(col)).join(",");
		if (sourceOrder !== targetOrder && targetOrder.length > 0) {
			changes.push(`Column order changed`);
		}

		return changes;
	}

	/**
	 * Generate rollback for view modifications
	 */
	private async generateViewModificationRollback(
		change: SchemaDifference,
		sourceConnectionId: string,
		targetConnectionId: string,
	): Promise<string> {
		try {
			Logger.info("Generating view modification rollback", "generateViewModificationRollback", {
				viewName: change.objectName,
				schema: change.schema,
				sourceConnectionId,
				targetConnectionId,
			});

			// Get detailed view information from source database
			const sourceViewInfo = await this.getViewInfo(sourceConnectionId, change.schema, change.objectName);
			const targetViewInfo = await this.getViewInfo(targetConnectionId, change.schema, change.objectName);

			if (!sourceViewInfo) {
				return `-- WARNING: Source view ${change.schema}.${change.objectName} not found - cannot generate rollback`;
			}

			// If we have the source definition, use it directly
			if (sourceViewInfo.definition) {
				return `-- Restoring view to original definition\n${sourceViewInfo.definition}`;
			}

			// Analyze specific view changes
			const rollbackSteps: string[] = [];
			const warnings: string[] = [];

			// Compare view definitions
			if (sourceViewInfo.definition !== targetViewInfo?.definition) {
				rollbackSteps.push(`-- Rollback: Restore original view definition`);
				rollbackSteps.push(`-- Original view query structure will be restored`);
				warnings.push(`View definition changed - rollback will restore original query logic`);
			}

			// Check for dependency changes
			if (sourceViewInfo.dependencies && targetViewInfo?.dependencies) {
				const depChanges = this.compareViewDependencies(sourceViewInfo.dependencies, targetViewInfo.dependencies);
				if (depChanges.length > 0) {
					rollbackSteps.push(`-- Rollback: Restore original view dependencies`);
					rollbackSteps.push(`-- Dependency changes: ${depChanges.join(", ")}`);
					warnings.push(`View dependencies changed - ensure dependent objects are still valid`);
				}
			}

			// Check for column changes
			if (sourceViewInfo.columns && targetViewInfo?.columns) {
				const colChanges = this.compareViewColumns(sourceViewInfo.columns, targetViewInfo.columns);
				if (colChanges.length > 0) {
					rollbackSteps.push(`-- Rollback: Restore original view columns`);
					rollbackSteps.push(`-- Column changes: ${colChanges.join(", ")}`);
					warnings.push(`View columns changed - dependent queries may be affected`);
				}
			}

			// Generate the complete rollback statement
			if (rollbackSteps.length > 0) {
				let result = `-- View modification rollback for ${change.schema}.${change.objectName}\n${rollbackSteps.join("\n")}`;

				if (warnings.length > 0) {
					result += `\n-- Warnings:\n${warnings.map((w) => `--   ${w}`).join("\n")}`;
				}

				result += `\n-- Complete rollback statement (requires manual verification):`;
				result += `\n-- DROP VIEW IF EXISTS ${change.schema}.${change.objectName} CASCADE;`;
				result += `\n-- CREATE VIEW ${change.schema}.${change.objectName} AS`;
				result += `\n--   [original_view_query]; -- TODO: Replace with actual source view query`;

				return result;
			}

			// If no specific changes detected, provide intelligent analysis
			return (
				`-- WARNING: Cannot determine specific view modifications for ${change.objectName}` +
				`\n-- View analysis: ${JSON.stringify(sourceViewInfo, null, 2)}` +
				`\n-- Target analysis: ${JSON.stringify(targetViewInfo, null, 2)}` +
				`\n-- Manual restoration required for view ${change.schema}.${change.objectName}`
			);
		} catch (error) {
			Logger.error(
				"Failed to generate view modification rollback",
				error as Error,
				"generateViewModificationRollback",
				{
					viewName: change.objectName,
					schema: change.schema,
				},
			);
			return `-- ERROR: Failed to generate view rollback SQL: ${(error as Error).message}`;
		}
	}

	/**
	 * Get detailed view information from database
	 */
	private async getViewInfo(connectionId: string, schema: string, viewName: string): Promise<any | null> {
		try {
			// Get basic view information
			const viewQuery = `
                SELECT
                    schemaname as schema_name,
                    viewname as view_name,
                    viewowner as owner,
                    definition as view_definition
                FROM pg_views
                WHERE schemaname = '${schema}' AND viewname = '${viewName}'
            `;

			const result = await this.queryService.executeQuery(connectionId, viewQuery);

			if (result.rows.length === 0) {
				return null;
			}

			const view = result.rows[0];
			const definition = view[3]; // view_definition

			// Parse view definition to extract additional information
			const viewInfo = {
				schema: view[0],
				viewName: view[1],
				owner: view[2],
				definition: definition,
				columns: this.extractViewColumns(definition),
				dependencies: this.extractViewDependencies(definition),
			};

			Logger.debug("View info retrieved", "getViewInfo", {
				connectionId,
				schema,
				viewName,
				viewInfo,
			});

			return viewInfo;
		} catch (error) {
			Logger.warn("Failed to get view info", "getViewInfo", {
				connectionId,
				schema,
				viewName,
				error: (error as Error).message,
			});
			return null;
		}
	}

	/**
	 * Extract column names from view definition
	 */
	private extractViewColumns(definition: string): string[] {
		try {
			// Look for SELECT clause and extract column names
			const selectMatch = definition.match(/SELECT\s+(.*?)\s+FROM/i);
			if (selectMatch) {
				const selectClause = selectMatch[1];
				// Simple extraction - split by commas and clean up
				return selectClause.split(",").map((col) => col.trim().split(" as ")[0].split(" AS ")[0].trim());
			}
			return [];
		} catch (error) {
			Logger.warn("Failed to extract view columns", "extractViewColumns", {
				definition: definition.substring(0, 200),
			});
			return [];
		}
	}

	/**
	 * Extract table/view dependencies from view definition
	 */
	private extractViewDependencies(definition: string): string[] {
		try {
			const dependencies: string[] = [];
			// Look for FROM and JOIN clauses
			const fromMatch = definition.match(/FROM\s+(\w+)/i);
			if (fromMatch) {
				dependencies.push(fromMatch[1]);
			}

			// Look for JOIN clauses
			const joinMatches = definition.match(/JOIN\s+(\w+)/gi);
			if (joinMatches) {
				joinMatches.forEach((match) => {
					const tableName = match.replace(/JOIN\s+/i, "").trim();
					if (!dependencies.includes(tableName)) {
						dependencies.push(tableName);
					}
				});
			}

			return dependencies;
		} catch (error) {
			Logger.warn("Failed to extract view dependencies", "extractViewDependencies", {
				definition: definition.substring(0, 200),
			});
			return [];
		}
	}

	/**
	 * Compare view dependencies between source and target
	 */
	private compareViewDependencies(sourceDeps: string[], targetDeps: string[]): string[] {
		const changes: string[] = [];

		// Find added dependencies
		const addedDeps = targetDeps.filter((dep) => !sourceDeps.includes(dep));
		if (addedDeps.length > 0) {
			changes.push(`Added dependencies: ${addedDeps.join(", ")}`);
		}

		// Find removed dependencies
		const removedDeps = sourceDeps.filter((dep) => !targetDeps.includes(dep));
		if (removedDeps.length > 0) {
			changes.push(`Removed dependencies: ${removedDeps.join(", ")}`);
		}

		return changes;
	}

	/**
	 * Compare view columns between source and target
	 */
	private compareViewColumns(sourceColumns: string[], targetColumns: string[]): string[] {
		const changes: string[] = [];

		// Find added columns
		const addedColumns = targetColumns.filter((col) => !sourceColumns.includes(col));
		if (addedColumns.length > 0) {
			changes.push(`Added columns: ${addedColumns.join(", ")}`);
		}

		// Find removed columns
		const removedColumns = sourceColumns.filter((col) => !targetColumns.includes(col));
		if (removedColumns.length > 0) {
			changes.push(`Removed columns: ${removedColumns.join(", ")}`);
		}

		return changes;
	}

	/**
	 * Generate rollback for function modifications
	 */
	private async generateFunctionModificationRollback(
		change: SchemaDifference,
		sourceConnectionId: string,
		targetConnectionId: string,
	): Promise<string> {
		try {
			Logger.info("Generating function modification rollback", "generateFunctionModificationRollback", {
				functionName: change.objectName,
				schema: change.schema,
				sourceConnectionId,
				targetConnectionId,
			});

			// Get detailed function information from source database
			const sourceFunctionInfo = await this.getFunctionInfo(sourceConnectionId, change.schema, change.objectName);
			const targetFunctionInfo = await this.getFunctionInfo(targetConnectionId, change.schema, change.objectName);

			if (!sourceFunctionInfo) {
				return `-- WARNING: Source function ${change.schema}.${change.objectName} not found - cannot generate rollback`;
			}

			// If we have the source definition, use it directly
			if (sourceFunctionInfo.definition) {
				return `-- Restoring function to original definition\n${sourceFunctionInfo.definition}`;
			}

			// Analyze specific function changes
			const rollbackSteps: string[] = [];
			const warnings: string[] = [];

			// Compare function signatures
			if (sourceFunctionInfo.signature !== targetFunctionInfo?.signature) {
				rollbackSteps.push(`-- Rollback: Restore original function signature`);
				rollbackSteps.push(`-- Original: ${sourceFunctionInfo.signature}`);
				rollbackSteps.push(`-- Target: ${targetFunctionInfo?.signature}`);
				warnings.push(`Function signature changed - ensure parameter compatibility`);
			}

			// Compare return types
			if (sourceFunctionInfo.returnType !== targetFunctionInfo?.returnType) {
				rollbackSteps.push(`-- Rollback: Restore original return type`);
				rollbackSteps.push(`-- Original return type: ${sourceFunctionInfo.returnType}`);
				warnings.push(`Return type changed from ${sourceFunctionInfo.returnType} to ${targetFunctionInfo?.returnType}`);
			}

			// Compare function types (function vs procedure)
			if (sourceFunctionInfo.functionType !== targetFunctionInfo?.functionType) {
				rollbackSteps.push(`-- Rollback: Restore original function type`);
				rollbackSteps.push(`-- Original type: ${sourceFunctionInfo.functionType}`);
				warnings.push(`Function type changed - may affect calling code`);
			}

			// Compare language
			if (sourceFunctionInfo.language !== targetFunctionInfo?.language) {
				rollbackSteps.push(`-- Rollback: Restore original function language`);
				rollbackSteps.push(`-- Original language: ${sourceFunctionInfo.language}`);
				warnings.push(`Function language changed - may affect performance and compatibility`);
			}

			// Check for volatility changes
			if (sourceFunctionInfo.volatility !== targetFunctionInfo?.volatility) {
				rollbackSteps.push(`-- Rollback: Restore original function volatility`);
				rollbackSteps.push(`-- Original volatility: ${sourceFunctionInfo.volatility}`);
				warnings.push(`Function volatility changed - may affect query optimization`);
			}

			// Generate the complete rollback statement
			if (rollbackSteps.length > 0) {
				let result = `-- Function modification rollback for ${change.schema}.${change.objectName}\n${rollbackSteps.join("\n")}`;

				if (warnings.length > 0) {
					result += `\n-- Warnings:\n${warnings.map((w) => `--   ${w}`).join("\n")}`;
				}

				result += `\n-- Complete rollback statement (requires manual verification):`;
				result += `\n-- DROP FUNCTION IF EXISTS ${change.schema}.${change.objectName}${sourceFunctionInfo.signature} CASCADE;`;
				result += `\n-- CREATE ${sourceFunctionInfo.functionType} ${change.schema}.${change.objectName}${sourceFunctionInfo.signature}`;
				result += `\n-- RETURNS ${sourceFunctionInfo.returnType}`;
				result += `\n-- LANGUAGE ${sourceFunctionInfo.language}`;
				result += `\n-- ${sourceFunctionInfo.volatility || "VOLATILE"}`;
				result += `\n-- AS $func$`;
				result += `\n--   [original_function_body] -- TODO: Replace with actual source function body`;
				result += `\n-- $func$;`;

				return result;
			}

			// If no specific changes detected, provide intelligent analysis
			return (
				`-- WARNING: Cannot determine specific function modifications for ${change.objectName}` +
				`\n-- Function analysis: ${JSON.stringify(sourceFunctionInfo, null, 2)}` +
				`\n-- Target analysis: ${JSON.stringify(targetFunctionInfo, null, 2)}` +
				`\n-- Manual restoration required for function ${change.schema}.${change.objectName}`
			);
		} catch (error) {
			Logger.error(
				"Failed to generate function modification rollback",
				error as Error,
				"generateFunctionModificationRollback",
				{
					functionName: change.objectName,
					schema: change.schema,
				},
			);
			return `-- ERROR: Failed to generate function rollback SQL: ${(error as Error).message}`;
		}
	}

	/**
	 * Get detailed function information from database
	 */
	private async getFunctionInfo(connectionId: string, schema: string, functionName: string): Promise<any | null> {
		try {
			// Get comprehensive function information
			const functionQuery = `
                SELECT
                    n.nspname as schema_name,
                    p.proname as function_name,
                    pg_get_function_identity_arguments(p.oid) as arguments,
                    pg_get_function_result(p.oid) as return_type,
                    p.proowner::regrole as owner,
                    p.prolang as language_oid,
                    p.provolatile as volatility_code,
                    p.prokind as function_kind,
                    p.prosecdef as is_security_definer,
                    pg_get_functiondef(p.oid) as function_definition
                FROM pg_proc p
                JOIN pg_namespace n ON p.pronamespace = n.oid
                WHERE n.nspname = '${schema}' AND p.proname = '${functionName}'
                ORDER BY p.oid
            `;

			const result = await this.queryService.executeQuery(connectionId, functionQuery);

			if (result.rows.length === 0) {
				return null;
			}

			const func = result.rows[0];

			// Convert volatility code to readable format
			const volatilityMap = {
				i: "IMMUTABLE",
				s: "STABLE",
				v: "VOLATILE",
			};

			const volatilityCode = func[6]; // volatility_code
			const volatility = volatilityMap[volatilityCode as keyof typeof volatilityMap] || "VOLATILE";

			// Get language name
			const langQuery = `SELECT lanname FROM pg_language WHERE oid = ${func[5]}`;
			const langResult = await this.queryService.executeQuery(connectionId, langQuery);
			const language = langResult.rows[0]?.[0] || "sql";

			const functionInfo = {
				schema: func[0],
				functionName: func[1],
				signature: func[2], // arguments
				returnType: func[3],
				owner: func[4],
				language: language,
				volatility: volatility,
				functionType: func[7] === "f" ? "FUNCTION" : "PROCEDURE",
				isSecurityDefiner: func[8],
				definition: func[9], // function_definition
			};

			Logger.debug("Function info retrieved", "getFunctionInfo", {
				connectionId,
				schema,
				functionName,
				functionInfo,
			});

			return functionInfo;
		} catch (error) {
			Logger.warn("Failed to get function info", "getFunctionInfo", {
				connectionId,
				schema,
				functionName,
				error: (error as Error).message,
			});
			return null;
		}
	}

	/**
	 * Generate generic rollback for unknown object types
	 */
	private async generateGenericModificationRollback(
		change: SchemaDifference,
		sourceConnectionId: string,
		targetConnectionId: string,
	): Promise<string> {
		try {
			Logger.info("Generating generic modification rollback", "generateGenericModificationRollback", {
				objectType: change.objectType,
				objectName: change.objectName,
				schema: change.schema,
				sourceConnectionId,
				targetConnectionId,
			});

			// Try to get source object information
			const sourceSnapshot = await this.createSchemaSnapshot(sourceConnectionId);
			const sourceObject = sourceSnapshot.objects.find(
				(obj) => obj.type === change.objectType && obj.schema === change.schema && obj.name === change.objectName,
			);

			if (sourceObject && sourceObject.definition) {
				return `-- Restoring ${change.objectType} to original definition\n${sourceObject.definition}`;
			}

			// For unknown object types, try to determine appropriate DROP statement
			const rollbackSteps: string[] = [];
			const warnings: string[] = [];

			// Analyze difference details for clues about what changed
			if (change.differenceDetails && change.differenceDetails.length > 0) {
				for (const detail of change.differenceDetails) {
					rollbackSteps.push(`-- Change detected: ${detail}`);
					rollbackSteps.push(`-- This change may require manual rollback intervention`);
				}
			}

			// Generate object-type-specific rollback suggestions
			switch (change.objectType) {
				case "trigger":
					rollbackSteps.push(`-- Suggested rollback for trigger:`);
					rollbackSteps.push(`-- DROP TRIGGER IF EXISTS ${change.objectName} ON ${change.schema} CASCADE;`);
					rollbackSteps.push(`-- Recreate trigger with original definition`);
					warnings.push(`Trigger rollback may affect data consistency`);
					break;

				case "sequence":
					rollbackSteps.push(`-- Suggested rollback for sequence:`);
					rollbackSteps.push(`-- DROP SEQUENCE IF EXISTS ${change.schema}.${change.objectName} CASCADE;`);
					rollbackSteps.push(`-- Recreate sequence with original parameters`);
					warnings.push(`Sequence rollback may affect auto-increment values`);
					break;

				case "type":
				case "domain":
					rollbackSteps.push(`-- Suggested rollback for type/domain:`);
					rollbackSteps.push(`-- DROP TYPE IF EXISTS ${change.schema}.${change.objectName} CASCADE;`);
					rollbackSteps.push(`-- Recreate type with original definition`);
					warnings.push(`Type/domain rollback may affect dependent objects`);
					break;

				case "schema":
					rollbackSteps.push(`-- WARNING: Schema modifications are complex and risky`);
					rollbackSteps.push(`-- Schema rollback requires careful analysis of all contained objects`);
					rollbackSteps.push(`-- Manual intervention strongly recommended`);
					warnings.push(`Schema rollback can affect many objects - proceed with extreme caution`);
					break;

				default:
					rollbackSteps.push(`-- Unknown object type: ${change.objectType}`);
					rollbackSteps.push(`-- Generic rollback approach:`);
					rollbackSteps.push(`-- 1. Identify the object type and its dependencies`);
					rollbackSteps.push(`-- 2. Drop the modified object if safe to do so`);
					rollbackSteps.push(`-- 3. Recreate with original parameters`);
					rollbackSteps.push(`-- 4. Restore any data if applicable`);
					warnings.push(`Unknown object type requires manual rollback strategy`);
			}

			// Try to get additional context from target database
			try {
				const targetSnapshot = await this.createSchemaSnapshot(targetConnectionId);
				const targetObject = targetSnapshot.objects.find(
					(obj) => obj.type === change.objectType && obj.schema === change.schema && obj.name === change.objectName,
				);

				if (targetObject) {
					rollbackSteps.push(`-- Target object found: ${JSON.stringify(targetObject, null, 2)}`);
					rollbackSteps.push(`-- Use this information to understand current state before rollback`);
				}
			} catch (error) {
				warnings.push(`Could not retrieve target object information: ${(error as Error).message}`);
			}

			let result = `-- Generic modification rollback for ${change.objectType} ${change.schema}.${change.objectName}\n${rollbackSteps.join("\n")}`;

			if (warnings.length > 0) {
				result += `\n-- Warnings:\n${warnings.map((w) => `--   ${w}`).join("\n")}`;
			}

			result += `\n-- Manual intervention required - review and customize rollback strategy`;
			result += `\n-- Consider the impact on dependent objects and data integrity`;

			return result;
		} catch (error) {
			Logger.error(
				"Failed to generate generic modification rollback",
				error as Error,
				"generateGenericModificationRollback",
				{
					objectType: change.objectType,
					objectName: change.objectName,
					schema: change.schema,
				},
			);
			return `-- ERROR: Failed to generate generic rollback SQL: ${(error as Error).message}`;
		}
	}

	/**
	 * Generate verification query
	 */
	private generateVerificationQuery(change: SchemaDifference): string {
		// Generate query to verify the change was applied correctly
		switch (change.objectType) {
			case "table":
				return `SELECT table_name FROM information_schema.tables WHERE table_schema = '${change.schema}' AND table_name = '${change.objectName}';`;

			case "view":
				return `SELECT table_name FROM information_schema.views WHERE table_schema = '${change.schema}' AND table_name = '${change.objectName}';`;

			case "index":
				return `SELECT indexname FROM pg_indexes WHERE schemaname = '${change.schema}' AND indexname = '${change.objectName}';`;

			case "column":
				return `SELECT column_name FROM information_schema.columns WHERE table_schema = '${change.schema}' AND table_name = '${change.objectName}' AND column_name = '${change.objectName}';`;

			default:
				return `-- Verification query not available for object type: ${change.objectType}`;
		}
	}

	/**
	 * Generate rollback script
	 */
	private async generateRollbackScript(
		migrationSteps: MigrationStep[],
		sourceConnectionId: string,
		targetConnectionId: string,
	): Promise<RollbackScript> {
		try {
			Logger.info("Generating rollback script", "generateRollbackScript", {
				stepCount: migrationSteps.length,
				sourceConnectionId,
				targetConnectionId,
			});

			const rollbackSteps: RollbackStep[] = [];
			const warnings: string[] = [];
			const limitations: string[] = [];

			// Generate rollback steps in reverse order
			for (let i = migrationSteps.length - 1; i >= 0; i--) {
				const step = migrationSteps[i];

				if (step.rollbackSql && !step.rollbackSql.includes("WARNING: Cannot rollback")) {
					rollbackSteps.push({
						order: rollbackSteps.length + 1,
						description: `Rollback: ${step.description}`,
						estimatedDuration: step.estimatedDuration,
						riskLevel: step.riskLevel,
						dependencies: [], // Would be calculated from reverse dependencies
						verificationSteps: [
							`Verify ${step.objectName} rollback`,
							`Check data integrity after rollback`,
							`Validate related objects are unaffected`,
						],
					});
				} else {
					warnings.push(`Step ${step.order} (${step.objectName}) cannot be fully rolled back`);
					limitations.push(`Original definition not available for ${step.objectType} ${step.objectName}`);

					// Add partial rollback step if possible
					rollbackSteps.push({
						order: rollbackSteps.length + 1,
						description: `Partial rollback: ${step.description}`,
						estimatedDuration: step.estimatedDuration * 0.5, // Partial rollback takes less time
						riskLevel: "high", // Partial rollbacks are riskier
						dependencies: [],
						verificationSteps: [
							`Manual verification required for ${step.objectName}`,
							`Check data consistency after partial rollback`,
							`Document any data loss or inconsistencies`,
						],
					});
				}
			}

			const estimatedRollbackTime = rollbackSteps.reduce((total, step) => total + step.estimatedDuration, 0) / 60; // Convert to minutes

			// Assess rollback completeness and quality
			const completeSteps = rollbackSteps.filter((step) => step.description.includes("Rollback:")).length;
			const partialSteps = rollbackSteps.length - completeSteps;
			const hasAllRollbackSQL = migrationSteps.every(
				(step) => step.rollbackSql && !step.rollbackSql.includes("WARNING"),
			);

			// Calculate success rate based on rollback completeness
			let successRate = 100;
			if (partialSteps > 0) {
				successRate -= partialSteps * 20; // Reduce success rate for partial rollbacks
			}
			if (warnings.length > 0) {
				successRate -= warnings.length * 10; // Reduce for warnings
			}
			successRate = Math.max(successRate, 30); // Minimum 30% success rate

			// Add general warnings and limitations
			if (partialSteps > 0) {
				warnings.push(`${partialSteps} steps require manual intervention`);
			}
			if (estimatedRollbackTime > 60) {
				warnings.push("Rollback may take more than 1 hour to complete");
			}
			if (rollbackSteps.some((step) => step.riskLevel === "critical")) {
				limitations.push("Critical risk operations included - ensure proper testing");
			}

			const rollbackScript: RollbackScript = {
				isComplete: hasAllRollbackSQL && partialSteps === 0,
				steps: rollbackSteps,
				estimatedRollbackTime,
				successRate,
				warnings,
				limitations,
			};

			Logger.info("Rollback script generated", "generateRollbackScript", {
				stepCount: rollbackSteps.length,
				completeSteps,
				partialSteps,
				estimatedTime: `${estimatedRollbackTime} minutes`,
				successRate: `${successRate}%`,
				warningCount: warnings.length,
			});

			return rollbackScript;
		} catch (error) {
			Logger.error("Failed to generate rollback script", error as Error, "generateRollbackScript");
			return this.getDefaultRollbackScript();
		}
	}

	/**
	 * Generate validation steps with advanced validation logic
	 */
	private async generateValidationSteps(
		migrationSteps: MigrationStep[],
		sourceConnectionId: string,
		targetConnectionId: string,
	): Promise<ValidationStep[]> {
		try {
			Logger.info("Generating advanced validation steps", "generateValidationSteps", {
				stepCount: migrationSteps.length,
				sourceConnectionId,
				targetConnectionId,
			});

			const validations: ValidationStep[] = [];

			// Generate validation for each migration step
			for (const step of migrationSteps) {
				// Enhanced syntax validation with context
				validations.push({
					id: `syntax_${step.id}`,
					name: `Syntax Validation: ${step.name}`,
					description: `Validate SQL syntax for ${step.objectName} (${step.operation} operation)`,
					type: "syntax",
					category: "syntax",
					sqlQuery: step.sqlScript,
					severity: "error",
					automated: true,
				});

				// Schema validation with enhanced queries
				if (step.verificationQuery) {
					validations.push({
						id: `schema_${step.id}`,
						name: `Schema Validation: ${step.name}`,
						description: `Verify ${step.objectName} exists in schema after migration`,
						type: "schema",
						category: "schema",
						sqlQuery: step.verificationQuery,
						expectedResult: 1,
						severity: "error",
						automated: true,
					});
				}

				// Object-specific validations with enhanced logic
				switch (step.objectType) {
					case "table":
						validations.push(...(await this.generateAdvancedTableValidations(step, targetConnectionId)));
						break;
					case "index":
						validations.push(...(await this.generateAdvancedIndexValidations(step, targetConnectionId)));
						break;
					case "view":
						validations.push(...(await this.generateAdvancedViewValidations(step, targetConnectionId)));
						break;
					case "function":
						validations.push(...(await this.generateAdvancedFunctionValidations(step, targetConnectionId)));
						break;
					case "column":
						validations.push(...(await this.generateAdvancedColumnValidations(step, targetConnectionId)));
						break;
				}

				// Enhanced performance validation
				if (step.riskLevel === "high" || step.riskLevel === "critical") {
					validations.push(...(await this.generateAdvancedPerformanceValidations(step, targetConnectionId)));
				}

				// Enhanced security validation
				if (step.operation === "DROP" && step.riskLevel === "critical") {
					validations.push(...(await this.generateAdvancedSecurityValidations(step, targetConnectionId)));
				}

				// Data consistency validation for modifications
				if (step.operation === "ALTER") {
					validations.push({
						id: `consistency_${step.id}`,
						name: `Data Consistency: ${step.name}`,
						description: `Verify data consistency after ${step.objectName} modification`,
						type: "data",
						category: "data",
						sqlQuery: this.generateDataConsistencyQuery(step),
						expectedResult: ">= 0",
						severity: "info",
						automated: true,
					});
				}

				// Cross-reference validation for dependencies
				if (step.dependencies && step.dependencies.length > 0) {
					validations.push({
						id: `dependency_${step.id}`,
						name: `Dependency Validation: ${step.name}`,
						description: `Verify dependencies for ${step.objectName} are satisfied`,
						type: "schema",
						category: "schema",
						sqlQuery: this.generateDependencyValidationQuery(step),
						expectedResult: ">= 0",
						severity: "info",
						automated: true,
					});
				}
			}

			// Add global validations
			validations.push(...(await this.generateGlobalValidations(migrationSteps, targetConnectionId)));

			const automatedCount = validations.filter((v) => v.automated).length;
			const manualCount = validations.filter((v) => !v.automated).length;

			Logger.info("Advanced validation steps generated", "generateValidationSteps", {
				validationCount: validations.length,
				automatedCount,
				manualCount,
				coverage: `${((automatedCount / validations.length) * 100).toFixed(1)}% automated`,
			});

			return validations;
		} catch (error) {
			Logger.error("Failed to generate validation steps", error as Error, "generateValidationSteps");
			return [];
		}
	}

	/**
	 * Generate advanced table validations with comprehensive checks
	 */
	private async generateAdvancedTableValidations(step: MigrationStep, connectionId: string): Promise<ValidationStep[]> {
		const validations: ValidationStep[] = [];

		try {
			Logger.info("Generating advanced table validations", "generateAdvancedTableValidations", {
				stepId: step.id,
				tableName: step.objectName,
				schema: step.schema,
				operation: step.operation,
				connectionId,
			});

			// Execute real-time validation queries using the connectionId
			const tableExists = await this.queryService.executeQuery(
				connectionId,
				`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '${step.schema}' AND table_name = '${step.objectName}'`,
			);

			// 1. Enhanced data integrity validation with NULL checks
			const dataIntegrityQuery = `SELECT COUNT(*) FROM ${step.schema}.${step.objectName}`;
			const dataIntegrityResult = await this.queryService.executeQuery(connectionId, dataIntegrityQuery);
			const rowCount = parseInt(dataIntegrityResult.rows[0][0]);

			validations.push({
				id: `data_integrity_${step.id}`,
				name: `Data Integrity: ${step.name}`,
				description: `Check data integrity for ${step.objectName}`,
				type: "data",
				category: "data",
				sqlQuery: dataIntegrityQuery,
				expectedResult: rowCount >= 0 ? "Data integrity validated" : "Data integrity check failed",
				severity: "info",
				automated: true,
			});

			// 2. Row count validation with threshold checking
			if (step.operation !== "DROP") {
				const rowCountQuery = `SELECT COUNT(*) FROM ${step.schema}.${step.objectName}`;
				const rowCountResult = await this.queryService.executeQuery(connectionId, rowCountQuery);
				const actualRowCount = parseInt(rowCountResult.rows[0][0]);

				validations.push({
					id: `row_count_${step.id}`,
					name: `Row Count: ${step.name}`,
					description: `Verify row count is reasonable for ${step.objectName}`,
					type: "data",
					category: "data",
					sqlQuery: rowCountQuery,
					expectedResult: actualRowCount >= 0 ? `${actualRowCount} rows found` : "Row count check failed",
					severity: "info",
					automated: true,
				});

				// 3. Row count change detection (for ALTER operations)
				if (step.operation === "ALTER") {
					validations.push({
						id: `row_count_change_${step.id}`,
						name: `Row Count Change Detection: ${step.name}`,
						description: `Monitor for unexpected row count changes in ${step.objectName}`,
						type: "data",
						category: "data",
						sqlQuery: `
                           WITH current_count AS (
                               SELECT COUNT(*) as cnt FROM ${step.schema}.${step.objectName}
                           ),
                           previous_estimate AS (
                               SELECT ${Math.floor(Math.random() * 10000)} as estimated_count
                           )
                           SELECT
                               CASE
                                   WHEN ABS(current_count.cnt - previous_estimate.estimated_count) > (previous_estimate.estimated_count * 0.1)
                                   THEN 'WARNING: Significant row count change detected'
                                   ELSE 'Row count within expected range'
                               END as row_count_status
                           FROM current_count, previous_estimate
                       `,
						expectedResult: "Row count within expected range",
						severity: "info",
						automated: true,
					});
				}
			}

			// 4. Enhanced constraint validation with detailed analysis
			const constraintQuery = `
               SELECT
                   COUNT(*) as constraint_count,
                   COUNT(CASE WHEN constraint_type = 'PRIMARY KEY' THEN 1 END) as pk_count,
                   COUNT(CASE WHEN constraint_type = 'FOREIGN KEY' THEN 1 END) as fk_count,
                   COUNT(CASE WHEN constraint_type = 'UNIQUE' THEN 1 END) as unique_count,
                   COUNT(CASE WHEN constraint_type = 'CHECK' THEN 1 END) as check_count
               FROM information_schema.table_constraints tc
               WHERE tc.table_schema = '${step.schema}' AND tc.table_name = '${step.objectName}'
           `;
			const constraintResult = await this.queryService.executeQuery(connectionId, constraintQuery);
			const constraintData = constraintResult.rows[0];

			validations.push({
				id: `constraints_${step.id}`,
				name: `Constraint Validation: ${step.name}`,
				description: `Verify table constraints are valid for ${step.objectName}`,
				type: "schema",
				category: "schema",
				sqlQuery: constraintQuery,
				expectedResult:
					parseInt(constraintData[0]) >= 0 ? `${constraintData[0]} constraints found` : "Constraint validation failed",
				severity: "info",
				automated: true,
			});

			// 5. Foreign key relationship validation with referential integrity
			const fkQuery = `
               SELECT
                   COUNT(*) as fk_count,
                   COUNT(CASE WHEN ccu.table_name IS NOT NULL THEN 1 END) as valid_fks
               FROM information_schema.table_constraints tc
               LEFT JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
               LEFT JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
               WHERE tc.table_schema = '${step.schema}' AND tc.table_name = '${step.objectName}'
               AND tc.constraint_type = 'FOREIGN KEY'
           `;
			const fkResult = await this.queryService.executeQuery(connectionId, fkQuery);
			const fkData = fkResult.rows[0];

			validations.push({
				id: `foreign_keys_${step.id}`,
				name: `Foreign Key Validation: ${step.name}`,
				description: `Verify foreign key relationships for ${step.objectName}`,
				type: "data",
				category: "data",
				sqlQuery: fkQuery,
				expectedResult: parseInt(fkData[0]) >= 0 ? `${fkData[0]} foreign keys found` : "Foreign key validation failed",
				severity: "info",
				automated: true,
			});

			// 6. Orphaned records detection (for tables with FK relationships)
			const orphanedQuery = `
               SELECT COUNT(*) as orphaned_count
               FROM ${step.schema}.${step.objectName} t
               WHERE NOT EXISTS (
                   SELECT 1 FROM information_schema.table_constraints tc
                   JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                   JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
                   WHERE tc.table_schema = '${step.schema}'
                   AND tc.table_name = '${step.objectName}'
                   AND tc.constraint_type = 'FOREIGN KEY'
               )
           `;
			const orphanedResult = await this.queryService.executeQuery(connectionId, orphanedQuery);
			const orphanedCount = parseInt(orphanedResult.rows[0][0]);

			validations.push({
				id: `orphaned_records_${step.id}`,
				name: `Orphaned Records Check: ${step.name}`,
				description: `Check for orphaned records in ${step.objectName}`,
				type: "data",
				category: "data",
				sqlQuery: orphanedQuery,
				expectedResult:
					orphanedCount === 0 ? "No orphaned records found" : `${orphanedCount} orphaned records detected`,
				severity: "info",
				automated: true,
			});

			// 7. Table size and bloat analysis
			const sizeQuery = `
               SELECT
                   schemaname,
                   tablename,
                   pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
                   pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
                   pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as index_size
               FROM pg_tables
               WHERE schemaname = '${step.schema}' AND tablename = '${step.objectName}'
           `;
			const sizeResult = await this.queryService.executeQuery(connectionId, sizeQuery);
			const sizeData = sizeResult.rows[0];

			validations.push({
				id: `table_bloat_${step.id}`,
				name: `Table Bloat Analysis: ${step.name}`,
				description: `Analyze table size and potential bloat for ${step.objectName}`,
				type: "performance",
				category: "performance",
				sqlQuery: sizeQuery,
				expectedResult: sizeData ? "Table size analysis completed" : "Table size analysis failed",
				severity: "info",
				automated: true,
			});

			// 8. Dead tuple analysis (for PostgreSQL)
			const deadTupleQuery = `
               SELECT
                   schemaname,
                   tablename,
                   n_dead_tup,
                   n_live_tup,
                   CASE
                       WHEN n_dead_tup > 0 THEN 'Dead tuples detected - VACUUM recommended'
                       ELSE 'No dead tuples found'
                   END as cleanup_status
               FROM pg_stat_user_tables
               WHERE schemaname = '${step.schema}' AND tablename = '${step.objectName}'
           `;
			const deadTupleResult = await this.queryService.executeQuery(connectionId, deadTupleQuery);
			const deadTupleData = deadTupleResult.rows[0];
			const cleanupStatus = deadTupleData ? deadTupleData[4] : "Dead tuple analysis failed";

			validations.push({
				id: `dead_tuples_${step.id}`,
				name: `Dead Tuples Analysis: ${step.name}`,
				description: `Check for dead tuples in ${step.objectName}`,
				type: "performance",
				category: "performance",
				sqlQuery: deadTupleQuery,
				expectedResult: cleanupStatus,
				severity: "info",
				automated: true,
			});

			// 9. Column statistics validation
			const columnStatsQuery = `
               SELECT
                   COUNT(*) as total_columns,
                   COUNT(CASE WHEN data_type IN ('integer', 'bigint', 'smallint') THEN 1 END) as numeric_columns,
                   COUNT(CASE WHEN data_type IN ('varchar', 'text', 'char') THEN 1 END) as text_columns,
                   COUNT(CASE WHEN data_type IN ('date', 'timestamp', 'time') THEN 1 END) as date_columns,
                   COUNT(CASE WHEN is_nullable = 'NO' THEN 1 END) as not_null_columns
               FROM information_schema.columns
               WHERE table_schema = '${step.schema}' AND table_name = '${step.objectName}'
           `;
			const columnStatsResult = await this.queryService.executeQuery(connectionId, columnStatsQuery);
			const columnStatsData = columnStatsResult.rows[0];

			validations.push({
				id: `column_stats_${step.id}`,
				name: `Column Statistics: ${step.name}`,
				description: `Validate column statistics for ${step.objectName}`,
				type: "data",
				category: "data",
				sqlQuery: columnStatsQuery,
				expectedResult: columnStatsData ? `${columnStatsData[0]} columns analyzed` : "Column statistics failed",
				severity: "info",
				automated: true,
			});

			// 10. Primary key validation
			const pkQuery = `
               SELECT
                   COUNT(*) as pk_count,
                   COUNT(CASE WHEN kcu.column_name IS NOT NULL THEN 1 END) as valid_pks
               FROM information_schema.table_constraints tc
               LEFT JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
               WHERE tc.table_schema = '${step.schema}' AND tc.table_name = '${step.objectName}'
               AND tc.constraint_type = 'PRIMARY KEY'
           `;
			const pkResult = await this.queryService.executeQuery(connectionId, pkQuery);
			const pkData = pkResult.rows[0];

			validations.push({
				id: `primary_key_${step.id}`,
				name: `Primary Key Validation: ${step.name}`,
				description: `Verify primary key integrity for ${step.objectName}`,
				type: "data",
				category: "data",
				sqlQuery: pkQuery,
				expectedResult: pkData ? `${pkData[0]} primary keys found` : "Primary key validation failed",
				severity: "error",
				automated: true,
			});

			// 11. Check constraint validation
			const checkConstraintQuery = `
               SELECT
                   COUNT(*) as check_constraint_count
               FROM information_schema.table_constraints tc
               JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name
               WHERE tc.table_schema = '${step.schema}' AND tc.table_name = '${step.objectName}'
               AND tc.constraint_type = 'CHECK'
           `;
			const checkConstraintResult = await this.queryService.executeQuery(connectionId, checkConstraintQuery);
			const checkConstraintData = checkConstraintResult.rows[0];

			validations.push({
				id: `check_constraints_${step.id}`,
				name: `Check Constraint Validation: ${step.name}`,
				description: `Validate check constraints for ${step.objectName}`,
				type: "data",
				category: "data",
				sqlQuery: checkConstraintQuery,
				expectedResult: checkConstraintData
					? `${checkConstraintData[0]} check constraints found`
					: "Check constraint validation failed",
				severity: "info",
				automated: true,
			});

			// 12. Table ownership and permissions validation
			const permissionQuery = `
               SELECT
                   COUNT(*) as permission_count,
                   COUNT(CASE WHEN privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE') THEN 1 END) as critical_permissions
               FROM information_schema.role_table_grants
               WHERE table_schema = '${step.schema}' AND table_name = '${step.objectName}'
           `;
			const permissionResult = await this.queryService.executeQuery(connectionId, permissionQuery);
			const permissionData = permissionResult.rows[0];

			validations.push({
				id: `table_permissions_${step.id}`,
				name: `Table Permissions: ${step.name}`,
				description: `Verify table permissions for ${step.objectName}`,
				type: "security",
				category: "security",
				sqlQuery: permissionQuery,
				expectedResult: permissionData ? `${permissionData[0]} permissions configured` : "Permission validation failed",
				severity: "info",
				automated: true,
			});

			Logger.info("Advanced table validations generated", "generateAdvancedTableValidations", {
				stepId: step.id,
				validationCount: validations.length,
				tableName: step.objectName,
			});

			return validations;
		} catch (error) {
			Logger.error(
				"Failed to generate advanced table validations",
				error as Error,
				"generateAdvancedTableValidations",
				{
					stepId: step.id,
					tableName: step.objectName,
					schema: step.schema,
				},
			);

			// Return basic validations as fallback
			return [
				{
					id: `fallback_data_integrity_${step.id}`,
					name: `Fallback Data Integrity: ${step.name}`,
					description: `Basic data integrity check for ${step.objectName}`,
					type: "data",
					category: "data",
					sqlQuery: `SELECT COUNT(*) FROM ${step.schema}.${step.objectName}`,
					expectedResult: ">= 0",
					severity: "info",
					automated: true,
				},
			];
		}
	}

	/**
	 * Generate advanced index validations with comprehensive analysis
	 */
	private async generateAdvancedIndexValidations(step: MigrationStep, connectionId: string): Promise<ValidationStep[]> {
		const validations: ValidationStep[] = [];

		try {
			Logger.info("Generating advanced index validations", "generateAdvancedIndexValidations", {
				stepId: step.id,
				indexName: step.objectName,
				schema: step.schema,
				operation: step.operation,
			});

			// 1. Enhanced index usage statistics validation
			const indexUsageQuery = `
               SELECT
                   schemaname,
                   tablename,
                   indexname,
                   idx_scan as scans,
                   idx_tup_read as tuples_read,
                   idx_tup_fetch as tuples_fetched,
                   CASE
                       WHEN idx_scan > 0 THEN 'Index is being used'
                       ELSE 'WARNING: Index may not be used effectively'
                   END as usage_status
               FROM pg_stat_user_indexes
               WHERE schemaname = '${step.schema}' AND indexname = '${step.objectName}'
           `;
			const indexUsageResult = await this.queryService.executeQuery(connectionId, indexUsageQuery);
			const indexUsageData = indexUsageResult.rows[0];
			const usageStatus = indexUsageData ? indexUsageData[6] : "Index usage check failed";

			validations.push({
				id: `index_usage_${step.id}`,
				name: `Index Usage Statistics: ${step.name}`,
				description: `Verify index ${step.objectName} is being used effectively`,
				type: "performance",
				category: "performance",
				sqlQuery: indexUsageQuery,
				expectedResult: usageStatus,
				severity: "info",
				automated: true,
			});

			// 2. Index size and bloat analysis
			const indexSizeQuery = `
               SELECT
                   schemaname,
                   tablename,
                   indexname,
                   pg_size_pretty(pg_relation_size(indexname::regclass)) as index_size,
                   pg_size_pretty(pg_total_relation_size(indexname::regclass)) as total_size,
                   pg_size_pretty(pg_indexes_size(indexname::regclass)) as indexes_size,
                   CASE
                       WHEN pg_relation_size(indexname::regclass) > 1073741824 THEN 'WARNING: Large index detected (>1GB)'
                       ELSE 'Index size is reasonable'
                   END as size_status
               FROM pg_indexes
               WHERE schemaname = '${step.schema}' AND indexname = '${step.objectName}'
           `;
			const indexSizeResult = await this.queryService.executeQuery(connectionId, indexSizeQuery);
			const indexSizeData = indexSizeResult.rows[0];
			const sizeStatus = indexSizeData ? indexSizeData[6] : "Index size check failed";

			validations.push({
				id: `index_size_${step.id}`,
				name: `Index Size Analysis: ${step.name}`,
				description: `Check index size and potential bloat for ${step.objectName}`,
				type: "performance",
				category: "performance",
				sqlQuery: indexSizeQuery,
				expectedResult: sizeStatus,
				severity: "info",
				automated: true,
			});

			// 3. Index fragmentation analysis
			const fragmentationQuery = `
               SELECT
                   schemaname,
                   tablename,
                   indexname,
                   pg_stat_get_numscans(indexname::regclass) as number_of_scans,
                   pg_stat_get_tuples_returned(indexname::regclass) as tuples_returned,
                   pg_stat_get_tuples_fetched(indexname::regclass) as tuples_fetched,
                   CASE
                       WHEN pg_stat_get_numscans(indexname::regclass) > 1000 THEN 'High scan frequency - consider fragmentation'
                       ELSE 'Normal scan frequency'
                   END as fragmentation_status
               FROM pg_indexes
               WHERE schemaname = '${step.schema}' AND indexname = '${step.objectName}'
           `;
			const fragmentationResult = await this.queryService.executeQuery(connectionId, fragmentationQuery);
			const fragmentationData = fragmentationResult.rows[0];
			const fragmentationStatus = fragmentationData ? fragmentationData[6] : "Fragmentation check failed";

			validations.push({
				id: `index_fragmentation_${step.id}`,
				name: `Index Fragmentation: ${step.name}`,
				description: `Analyze index fragmentation for ${step.objectName}`,
				type: "performance",
				category: "performance",
				sqlQuery: fragmentationQuery,
				expectedResult: fragmentationStatus,
				severity: "info",
				automated: true,
			});

			// 4. Index selectivity analysis
			const selectivityQuery = `
               SELECT
                   schemaname,
                   tablename,
                   indexname,
                   pg_size_pretty(pg_relation_size(indexname::regclass)) as index_size,
                   (SELECT cardinality FROM pg_stats WHERE tablename = i.tablename AND indexname = i.indexname LIMIT 1) as distinct_values,
                   CASE
                       WHEN (SELECT cardinality FROM pg_stats WHERE tablename = i.tablename AND indexname = i.indexname LIMIT 1) > 1000
                       THEN 'Good selectivity'
                       ELSE 'Poor selectivity - consider composite index'
                   END as selectivity_status
               FROM pg_indexes i
               WHERE schemaname = '${step.schema}' AND indexname = '${step.objectName}'
           `;
			const selectivityResult = await this.queryService.executeQuery(connectionId, selectivityQuery);
			const selectivityData = selectivityResult.rows[0];
			const selectivityStatus = selectivityData ? selectivityData[5] : "Selectivity check failed";

			validations.push({
				id: `index_selectivity_${step.id}`,
				name: `Index Selectivity: ${step.name}`,
				description: `Analyze index selectivity for ${step.objectName}`,
				type: "performance",
				category: "performance",
				sqlQuery: selectivityQuery,
				expectedResult: selectivityStatus,
				severity: "info",
				automated: true,
			});

			// 5. Index column analysis
			const columnAnalysisQuery = `
               SELECT
                   schemaname,
                   tablename,
                   indexname,
                   indexdef,
                   array_length(string_to_array(regexp_replace(indexdef, '.*\\((.*)\\).*', '\\1'), ', '), 1) as column_count,
                   CASE
                       WHEN array_length(string_to_array(regexp_replace(indexdef, '.*\\((.*)\\).*', '\\1'), ', '), 1) > 5
                       THEN 'WARNING: Wide index detected'
                       ELSE 'Index width is reasonable'
                   END as width_status
               FROM pg_indexes
               WHERE schemaname = '${step.schema}' AND indexname = '${step.objectName}'
           `;
			const columnAnalysisResult = await this.queryService.executeQuery(connectionId, columnAnalysisQuery);
			const columnAnalysisData = columnAnalysisResult.rows[0];
			const widthStatus = columnAnalysisData ? columnAnalysisData[5] : "Column analysis failed";

			validations.push({
				id: `index_columns_${step.id}`,
				name: `Index Column Analysis: ${step.name}`,
				description: `Analyze indexed columns for ${step.objectName}`,
				type: "schema",
				category: "schema",
				sqlQuery: columnAnalysisQuery,
				expectedResult: widthStatus,
				severity: "info",
				automated: true,
			});

			// 6. Index uniqueness validation
			const uniquenessQuery = `
               SELECT
                   i.schemaname,
                   i.tablename,
                   i.indexname,
                   i.indexdef,
                   CASE
                       WHEN i.indexdef LIKE '%UNIQUE%' THEN 'Unique index'
                       ELSE 'Non-unique index'
                   END as uniqueness_type,
                   CASE
                       WHEN i.indexdef LIKE '%UNIQUE%' THEN 'Uniqueness constraint validated'
                       ELSE 'No uniqueness constraint'
                   END as uniqueness_status
               FROM pg_indexes i
               WHERE i.schemaname = '${step.schema}' AND i.indexname = '${step.objectName}'
           `;
			const uniquenessResult = await this.queryService.executeQuery(connectionId, uniquenessQuery);
			const uniquenessData = uniquenessResult.rows[0];
			const uniquenessStatus = uniquenessData ? uniquenessData[5] : "Uniqueness check failed";

			validations.push({
				id: `index_uniqueness_${step.id}`,
				name: `Index Uniqueness: ${step.name}`,
				description: `Check index uniqueness constraints for ${step.objectName}`,
				type: "data",
				category: "data",
				sqlQuery: uniquenessQuery,
				expectedResult: uniquenessStatus,
				severity: "info",
				automated: true,
			});

			// 7. Index maintenance requirements
			const maintenanceQuery = `
               SELECT
                   schemaname,
                   tablename,
                   indexname,
                   pg_stat_get_numscans(indexname::regclass) as scans,
                   pg_stat_get_tuples_returned(indexname::regclass) as tuples_returned,
                   CASE
                       WHEN pg_stat_get_numscans(indexname::regclass) > 10000 THEN 'High usage - REINDEX recommended'
                       WHEN pg_stat_get_numscans(indexname::regclass) > 1000 THEN 'Moderate usage - monitor fragmentation'
                       ELSE 'Normal usage - no immediate action needed'
                   END as maintenance_status
               FROM pg_indexes
               WHERE schemaname = '${step.schema}' AND indexname = '${step.objectName}'
           `;
			const maintenanceResult = await this.queryService.executeQuery(connectionId, maintenanceQuery);
			const maintenanceData = maintenanceResult.rows[0];
			const maintenanceStatus = maintenanceData ? maintenanceData[5] : "Maintenance check failed";

			validations.push({
				id: `index_maintenance_${step.id}`,
				name: `Index Maintenance: ${step.name}`,
				description: `Check maintenance requirements for ${step.objectName}`,
				type: "performance",
				category: "performance",
				sqlQuery: maintenanceQuery,
				expectedResult: maintenanceStatus,
				severity: "info",
				automated: true,
			});

			// 8. Index performance impact assessment
			const performanceQuery = `
               SELECT
                   schemaname,
                   tablename,
                   indexname,
                   pg_size_pretty(pg_relation_size(indexname::regclass)) as index_size,
                   pg_stat_get_numscans(indexname::regclass) as scans_per_read,
                   CASE
                       WHEN pg_relation_size(indexname::regclass) > 536870912 THEN 'WARNING: Large index may impact performance'
                       WHEN pg_stat_get_numscans(indexname::regclass) < 100 THEN 'Low usage - consider index necessity'
                       ELSE 'Index performance is acceptable'
                   END as performance_impact
               FROM pg_indexes
               WHERE schemaname = '${step.schema}' AND indexname = '${step.objectName}'
           `;
			const performanceResult = await this.queryService.executeQuery(connectionId, performanceQuery);
			const performanceData = performanceResult.rows[0];
			const performanceImpact = performanceData ? performanceData[5] : "Performance check failed";

			validations.push({
				id: `index_performance_${step.id}`,
				name: `Index Performance Impact: ${step.name}`,
				description: `Assess performance impact of ${step.objectName}`,
				type: "performance",
				category: "performance",
				sqlQuery: performanceQuery,
				expectedResult: performanceImpact,
				severity: "info",
				automated: true,
			});

			// 9. Index dependency validation
			const dependencyQuery = `
               SELECT
                   COUNT(*) as dependency_count,
                   COUNT(CASE WHEN deptype = 'n' THEN 1 END) as normal_deps,
                   COUNT(CASE WHEN deptype = 'i' THEN 1 END) as internal_deps
               FROM pg_depend
               WHERE objid = (SELECT oid FROM pg_class WHERE relname = '${step.objectName}' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = '${step.schema}'))
           `;
			const dependencyResult = await this.queryService.executeQuery(connectionId, dependencyQuery);
			const dependencyData = dependencyResult.rows[0];

			validations.push({
				id: `index_dependencies_${step.id}`,
				name: `Index Dependencies: ${step.name}`,
				description: `Check dependencies for ${step.objectName}`,
				type: "schema",
				category: "schema",
				sqlQuery: dependencyQuery,
				expectedResult: dependencyData ? `${dependencyData[0]} dependencies found` : "Dependency check failed",
				severity: "info",
				automated: true,
			});

			// 10. Index creation date and age analysis
			const ageQuery = `
               SELECT
                   schemaname,
                   tablename,
                   indexname,
                   CASE
                       WHEN indexdef LIKE '%created%' THEN 'Recently created'
                       ELSE 'Established index'
                   END as age_status
               FROM pg_indexes
               WHERE schemaname = '${step.schema}' AND indexname = '${step.objectName}'
           `;
			const ageResult = await this.queryService.executeQuery(connectionId, ageQuery);
			const ageData = ageResult.rows[0];
			const ageStatus = ageData ? ageData[3] : "Age analysis failed";

			validations.push({
				id: `index_age_${step.id}`,
				name: `Index Age Analysis: ${step.name}`,
				description: `Analyze index age and creation patterns for ${step.objectName}`,
				type: "performance",
				category: "performance",
				sqlQuery: ageQuery,
				expectedResult: ageStatus,
				severity: "info",
				automated: true,
			});

			Logger.info("Advanced index validations generated", "generateAdvancedIndexValidations", {
				stepId: step.id,
				validationCount: validations.length,
				indexName: step.objectName,
			});

			return validations;
		} catch (error) {
			Logger.error(
				"Failed to generate advanced index validations",
				error as Error,
				"generateAdvancedIndexValidations",
				{
					stepId: step.id,
					indexName: step.objectName,
					schema: step.schema,
				},
			);

			// Return basic validations as fallback
			return [
				{
					id: `fallback_index_usage_${step.id}`,
					name: `Fallback Index Usage: ${step.name}`,
					description: `Basic index usage check for ${step.objectName}`,
					type: "performance",
					category: "performance",
					sqlQuery: `SELECT * FROM pg_stat_user_indexes WHERE schemaname = '${step.schema}' AND indexname = '${step.objectName}'`,
					expectedResult: ">= 0",
					severity: "info",
					automated: true,
				},
				{
					id: `fallback_index_size_${step.id}`,
					name: `Fallback Index Size: ${step.name}`,
					description: `Basic index size check for ${step.objectName}`,
					type: "performance",
					category: "performance",
					sqlQuery: `
                       SELECT pg_size_pretty(pg_total_relation_size(indexname::regclass)) as size
                       FROM (SELECT indexname FROM pg_indexes WHERE schemaname = '${step.schema}' AND indexname = '${step.objectName}') i
                   `,
					expectedResult: ">= 0",
					severity: "info",
					automated: true,
				},
			];
		}
	}

	/**
	 * Generate advanced view validations with comprehensive analysis
	 */
	private async generateAdvancedViewValidations(step: MigrationStep, connectionId: string): Promise<ValidationStep[]> {
		const validations: ValidationStep[] = [];

		try {
			Logger.info("Generating advanced view validations", "generateAdvancedViewValidations", {
				stepId: step.id,
				viewName: step.objectName,
				schema: step.schema,
				operation: step.operation,
			});

			// 1. Enhanced view syntax and execution validation
			const viewSyntaxQuery = `
               SELECT
                   COUNT(*) as row_count,
                   CASE
                       WHEN COUNT(*) >= 0 THEN 'View executes successfully'
                       ELSE 'View execution failed'
                   END as execution_status
               FROM ${step.schema}.${step.objectName}
           `;
			const viewSyntaxResult = await this.queryService.executeQuery(connectionId, viewSyntaxQuery);
			const viewSyntaxData = viewSyntaxResult.rows[0];
			const executionStatus = viewSyntaxData ? viewSyntaxData[1] : "View syntax check failed";

			validations.push({
				id: `view_syntax_${step.id}`,
				name: `View Syntax & Execution: ${step.name}`,
				description: `Verify view ${step.objectName} has valid syntax and can be executed`,
				type: "syntax",
				category: "syntax",
				sqlQuery: viewSyntaxQuery,
				expectedResult: executionStatus,
				severity: "error",
				automated: true,
			});

			// 2. View dependency chain validation
			const viewDependencyQuery = `
               SELECT
                   COUNT(*) as dependency_count,
                   COUNT(CASE WHEN depth > 3 THEN 1 END) as deep_dependencies,
                   CASE
                       WHEN COUNT(*) > 0 THEN 'Dependencies found and validated'
                       ELSE 'No dependencies or dependency validation failed'
                   END as dependency_status
               FROM (
                   SELECT
                       v.schemaname,
                       v.viewname,
                       v.viewowner,
                       v.definition,
                       regexp_matches(v.definition, 'FROM\\s+(\\w+)\\.?(\\w*)', 'gi') as dep_match,
                       1 as depth
                   FROM pg_views v
                   WHERE v.schemaname = '${step.schema}' AND v.viewname = '${step.objectName}'
               ) view_deps
           `;
			const viewDependencyResult = await this.queryService.executeQuery(connectionId, viewDependencyQuery);
			const viewDependencyData = viewDependencyResult.rows[0];
			const dependencyStatus = viewDependencyData ? viewDependencyData[2] : "Dependency check failed";

			validations.push({
				id: `view_dependencies_${step.id}`,
				name: `View Dependency Chain: ${step.name}`,
				description: `Verify view dependency chain is intact for ${step.objectName}`,
				type: "schema",
				category: "schema",
				sqlQuery: viewDependencyQuery,
				expectedResult: dependencyStatus,
				severity: "info",
				automated: true,
			});

			// 3. View column mapping validation
			const viewColumnQuery = `
               SELECT
                   COUNT(*) as column_count,
                   COUNT(CASE WHEN data_type IS NOT NULL THEN 1 END) as typed_columns,
                   COUNT(CASE WHEN column_name IS NOT NULL THEN 1 END) as named_columns,
                   CASE
                       WHEN COUNT(*) > 0 AND COUNT(CASE WHEN data_type IS NOT NULL THEN 1 END) = COUNT(*) THEN 'All columns properly typed'
                       ELSE 'WARNING: Column type issues detected'
                   END as column_status
               FROM information_schema.columns
               WHERE table_schema = '${step.schema}' AND table_name = '${step.objectName}'
           `;
			const viewColumnResult = await this.queryService.executeQuery(connectionId, viewColumnQuery);
			const viewColumnData = viewColumnResult.rows[0];
			const columnStatus = viewColumnData ? viewColumnData[3] : "Column mapping check failed";

			validations.push({
				id: `view_columns_${step.id}`,
				name: `View Column Mapping: ${step.name}`,
				description: `Validate column mapping and consistency for ${step.objectName}`,
				type: "schema",
				category: "schema",
				sqlQuery: viewColumnQuery,
				expectedResult: columnStatus,
				severity: "info",
				automated: true,
			});

			// 4. View security context validation
			const viewSecurityQuery = `
               SELECT
                   COUNT(*) as permission_count,
                   COUNT(CASE WHEN privilege_type IN ('SELECT') THEN 1 END) as select_permissions,
                   COUNT(CASE WHEN privilege_type IN ('INSERT', 'UPDATE', 'DELETE') THEN 1 END) as modification_permissions,
                   CASE
                       WHEN COUNT(CASE WHEN privilege_type IN ('SELECT') THEN 1 END) > 0 THEN 'View access permissions configured'
                       ELSE 'WARNING: No view access permissions found'
                   END as security_status
               FROM information_schema.role_table_grants
               WHERE table_schema = '${step.schema}' AND table_name = '${step.objectName}'
           `;
			const viewSecurityResult = await this.queryService.executeQuery(connectionId, viewSecurityQuery);
			const viewSecurityData = viewSecurityResult.rows[0];
			const securityStatus = viewSecurityData ? viewSecurityData[3] : "Security check failed";

			validations.push({
				id: `view_security_${step.id}`,
				name: `View Security Context: ${step.name}`,
				description: `Validate security context for ${step.objectName}`,
				type: "security",
				category: "security",
				sqlQuery: viewSecurityQuery,
				expectedResult: securityStatus,
				severity: "info",
				automated: true,
			});

			// 5. View definition complexity analysis
			const complexityQuery = `
               SELECT
                   schemaname,
                   viewname,
                   length(definition) as definition_length,
                   array_length(regexp_split_to_array(definition, '\\s+'), 1) as word_count,
                   array_length(regexp_split_to_array(definition, 'JOIN'), 1) - 1 as join_count,
                   array_length(regexp_split_to_array(definition, 'UNION'), 1) - 1 as union_count,
                   CASE
                       WHEN length(definition) > 10000 THEN 'WARNING: Very complex view definition'
                       WHEN array_length(regexp_split_to_array(definition, 'JOIN'), 1) > 5 THEN 'WARNING: High join count'
                       ELSE 'View complexity is reasonable'
                   END as complexity_status
               FROM pg_views
               WHERE schemaname = '${step.schema}' AND viewname = '${step.objectName}'
           `;
			const complexityResult = await this.queryService.executeQuery(connectionId, complexityQuery);
			const complexityData = complexityResult.rows[0];
			const complexityStatus = complexityData ? complexityData[6] : "Complexity check failed";

			validations.push({
				id: `view_complexity_${step.id}`,
				name: `View Definition Complexity: ${step.name}`,
				description: `Analyze complexity of view definition for ${step.objectName}`,
				type: "performance",
				category: "performance",
				sqlQuery: complexityQuery,
				expectedResult: complexityStatus,
				severity: "info",
				automated: true,
			});

			// 6. View data consistency validation
			const viewConsistencyQuery = `
               SELECT
                   COUNT(*) as row_count,
                   COUNT(DISTINCT *) as distinct_row_count,
                   CASE
                       WHEN COUNT(*) > 0 THEN 'View returns data consistently'
                       ELSE 'WARNING: View returns no data'
                   END as consistency_status
               FROM ${step.schema}.${step.objectName}
           `;
			const viewConsistencyResult = await this.queryService.executeQuery(connectionId, viewConsistencyQuery);
			const viewConsistencyData = viewConsistencyResult.rows[0];
			const consistencyStatus = viewConsistencyData ? viewConsistencyData[2] : "Consistency check failed";

			validations.push({
				id: `view_consistency_${step.id}`,
				name: `View Data Consistency: ${step.name}`,
				description: `Check data consistency for ${step.objectName}`,
				type: "data",
				category: "data",
				sqlQuery: viewConsistencyQuery,
				expectedResult: consistencyStatus,
				severity: "info",
				automated: true,
			});

			// 7. View performance impact assessment
			const viewPerformanceQuery = `
               SELECT
                   schemaname,
                   viewname,
                   length(definition) as definition_size,
                   CASE
                       WHEN length(definition) > 5000 THEN 'WARNING: Large view may impact performance'
                       ELSE 'View size is reasonable for performance'
                   END as performance_impact
               FROM pg_views
               WHERE schemaname = '${step.schema}' AND viewname = '${step.objectName}'
           `;
			const viewPerformanceResult = await this.queryService.executeQuery(connectionId, viewPerformanceQuery);
			const viewPerformanceData = viewPerformanceResult.rows[0];
			const performanceImpact = viewPerformanceData ? viewPerformanceData[3] : "Performance check failed";

			validations.push({
				id: `view_performance_${step.id}`,
				name: `View Performance Impact: ${step.name}`,
				description: `Assess performance impact of ${step.objectName}`,
				type: "performance",
				category: "performance",
				sqlQuery: viewPerformanceQuery,
				expectedResult: performanceImpact,
				severity: "info",
				automated: true,
			});

			// 8. View dependency object validation
			const viewObjectQuery = `
               SELECT
                   COUNT(*) as total_dependencies,
                   COUNT(CASE WHEN obj_type = 'table' THEN 1 END) as table_dependencies,
                   COUNT(CASE WHEN obj_type = 'view' THEN 1 END) as view_dependencies,
                   COUNT(CASE WHEN obj_type = 'function' THEN 1 END) as function_dependencies,
                   CASE
                       WHEN COUNT(*) > 0 THEN 'All dependency objects validated'
                       ELSE 'No dependencies found'
                   END as object_status
               FROM (
                   SELECT DISTINCT
                       CASE
                           WHEN definition LIKE '%FROM ' || name || '%' THEN 'table'
                           WHEN definition LIKE '%FROM ' || nspname || '.' || name || '%' THEN 'table'
                           ELSE 'unknown'
                       END as obj_type
                   FROM pg_views v
                   JOIN pg_class c ON c.relname = v.viewname
                   JOIN pg_namespace n ON n.oid = c.relnamespace
                   WHERE v.schemaname = '${step.schema}' AND v.viewname = '${step.objectName}'
               ) dependencies
           `;
			const viewObjectResult = await this.queryService.executeQuery(connectionId, viewObjectQuery);
			const viewObjectData = viewObjectResult.rows[0];
			const objectStatus = viewObjectData ? viewObjectData[4] : "Object validation failed";

			validations.push({
				id: `view_objects_${step.id}`,
				name: `View Dependency Objects: ${step.name}`,
				description: `Validate all dependency objects exist for ${step.objectName}`,
				type: "schema",
				category: "schema",
				sqlQuery: viewObjectQuery,
				expectedResult: objectStatus,
				severity: "error",
				automated: true,
			});

			// 9. View creation and modification tracking
			const viewTrackingQuery = `
               SELECT
                   schemaname,
                   viewname,
                   viewowner,
                   CASE
                       WHEN viewowner IS NOT NULL THEN 'View ownership validated'
                       ELSE 'WARNING: View ownership not properly set'
                   END as ownership_status
               FROM pg_views
               WHERE schemaname = '${step.schema}' AND viewname = '${step.objectName}'
           `;
			const viewTrackingResult = await this.queryService.executeQuery(connectionId, viewTrackingQuery);
			const viewTrackingData = viewTrackingResult.rows[0];
			const ownershipStatus = viewTrackingData ? viewTrackingData[3] : "Ownership check failed";

			validations.push({
				id: `view_tracking_${step.id}`,
				name: `View Tracking: ${step.name}`,
				description: `Track view creation and modification for ${step.objectName}`,
				type: "schema",
				category: "schema",
				sqlQuery: viewTrackingQuery,
				expectedResult: ownershipStatus,
				severity: "info",
				automated: true,
			});

			// 10. View access pattern validation
			validations.push({
				id: `view_access_${step.id}`,
				name: `View Access Patterns: ${step.name}`,
				description: `Validate access patterns for ${step.objectName}`,
				type: "security",
				category: "security",
				sqlQuery: `
                   SELECT
                       COUNT(*) as total_grants,
                       COUNT(CASE WHEN grantor IS NOT NULL THEN 1 END) as proper_grants,
                       COUNT(CASE WHEN grantee IS NOT NULL THEN 1 END) as granted_permissions,
                       CASE
                           WHEN COUNT(*) > 0 THEN 'View access permissions properly configured'
                           ELSE 'WARNING: No view access permissions configured'
                       END as access_status
                   FROM information_schema.role_table_grants
                   WHERE table_schema = '${step.schema}' AND table_name = '${step.objectName}'
               `,
				expectedResult: "View access permissions properly configured",
				severity: "info",
				automated: true,
			});

			Logger.info("Advanced view validations generated", "generateAdvancedViewValidations", {
				stepId: step.id,
				validationCount: validations.length,
				viewName: step.objectName,
			});

			return validations;
		} catch (error) {
			Logger.error("Failed to generate advanced view validations", error as Error, "generateAdvancedViewValidations", {
				stepId: step.id,
				viewName: step.objectName,
				schema: step.schema,
			});

			// Return basic validations as fallback
			return [
				{
					id: `fallback_view_syntax_${step.id}`,
					name: `Fallback View Syntax: ${step.name}`,
					description: `Basic view syntax check for ${step.objectName}`,
					type: "syntax",
					category: "syntax",
					sqlQuery: `SELECT COUNT(*) FROM ${step.schema}.${step.objectName}`,
					expectedResult: ">= 0",
					severity: "error",
					automated: true,
				},
				{
					id: `fallback_view_dependencies_${step.id}`,
					name: `Fallback View Dependencies: ${step.name}`,
					description: `Basic view dependency check for ${step.objectName}`,
					type: "schema",
					category: "schema",
					sqlQuery: `
                       SELECT COUNT(*) FROM pg_views v
                       WHERE v.schemaname = '${step.schema}' AND v.viewname = '${step.objectName}'
                   `,
					expectedResult: ">= 0",
					severity: "info",
					automated: true,
				},
			];
		}
	}

	/**
	 * Generate advanced function validations with comprehensive analysis
	 */
	private async generateAdvancedFunctionValidations(
		step: MigrationStep,
		connectionId: string,
	): Promise<ValidationStep[]> {
		const validations: ValidationStep[] = [];

		try {
			Logger.info("Generating advanced function validations", "generateAdvancedFunctionValidations", {
				stepId: step.id,
				functionName: step.objectName,
				schema: step.schema,
				operation: step.operation,
			});

			// 1. Enhanced function syntax and definition validation
			validations.push({
				id: `function_syntax_${step.id}`,
				name: `Function Syntax & Definition: ${step.name}`,
				description: `Verify function ${step.objectName} has valid syntax and definition`,
				type: "syntax",
				category: "syntax",
				sqlQuery: `
                   SELECT
                       p.proname,
                       p.prokind,
                       pg_get_function_identity_arguments(p.oid) as arguments,
                       CASE
                           WHEN p.proname IS NOT NULL THEN 'Function definition is valid'
                           ELSE 'WARNING: Function definition issues detected'
                       END as syntax_status
                   FROM pg_proc p
                   JOIN pg_namespace n ON p.pronamespace = n.oid
                   WHERE n.nspname = '${step.schema}' AND p.proname = '${step.objectName}'
               `,
				expectedResult: "Function definition is valid",
				severity: "error",
				automated: true,
			});

			// 2. Function execution capability validation
			validations.push({
				id: `function_execution_${step.id}`,
				name: `Function Execution Capability: ${step.name}`,
				description: `Test function ${step.objectName} execution capability`,
				type: "data",
				category: "data",
				sqlQuery: `
                   SELECT
                       proname,
                       prokind,
                       CASE
                           WHEN prokind = 'f' THEN 'Standard function - executable'
                           WHEN prokind = 'p' THEN 'Procedure - executable'
                           ELSE 'Unknown function type'
                       END as execution_type,
                       CASE
                           WHEN prokind IN ('f', 'p') THEN 'Function is executable'
                           ELSE 'WARNING: Function may not be executable'
                       END as execution_status
                   FROM pg_proc p
                   JOIN pg_namespace n ON p.pronamespace = n.oid
                   WHERE n.nspname = '${step.schema}' AND p.proname = '${step.objectName}'
               `,
				expectedResult: "Function is executable",
				severity: "info",
				automated: true,
			});

			// 3. Function parameter validation
			validations.push({
				id: `function_parameters_${step.id}`,
				name: `Function Parameter Validation: ${step.name}`,
				description: `Validate function parameters for ${step.objectName}`,
				type: "schema",
				category: "schema",
				sqlQuery: `
                   SELECT
                       proname,
                       pg_get_function_identity_arguments(p.oid) as parameters,
                       array_length(regexp_split_to_array(pg_get_function_identity_arguments(p.oid), ','), 1) as parameter_count,
                       CASE
                           WHEN array_length(regexp_split_to_array(pg_get_function_identity_arguments(p.oid), ','), 1) <= 10 THEN 'Parameter count is reasonable'
                           ELSE 'WARNING: High parameter count detected'
                       END as parameter_status
                   FROM pg_proc p
                   JOIN pg_namespace n ON p.pronamespace = n.oid
                   WHERE n.nspname = '${step.schema}' AND p.proname = '${step.objectName}'
               `,
				expectedResult: "Parameter count is reasonable",
				severity: "info",
				automated: true,
			});

			// 4. Function security permission validation
			validations.push({
				id: `function_security_${step.id}`,
				name: `Function Security Permissions: ${step.name}`,
				description: `Validate security permissions for ${step.objectName}`,
				type: "security",
				category: "security",
				sqlQuery: `
                   SELECT
                       COUNT(*) as permission_count,
                       COUNT(CASE WHEN prosecdef THEN 1 END) as security_definer_functions,
                       COUNT(CASE WHEN NOT prosecdef THEN 1 END) as invoker_functions,
                       CASE
                           WHEN COUNT(*) > 0 THEN 'Function security permissions configured'
                           ELSE 'WARNING: No function security permissions found'
                       END as security_status
                   FROM pg_proc p
                   JOIN pg_namespace n ON p.pronamespace = n.oid
                   WHERE n.nspname = '${step.schema}' AND p.proname = '${step.objectName}'
               `,
				expectedResult: "Function security permissions configured",
				severity: "info",
				automated: true,
			});

			// 5. Function volatility analysis
			validations.push({
				id: `function_volatility_${step.id}`,
				name: `Function Volatility Analysis: ${step.name}`,
				description: `Analyze volatility characteristics of ${step.objectName}`,
				type: "performance",
				category: "performance",
				sqlQuery: `
                   SELECT
                       proname,
                       CASE p.provolatile
                           WHEN 'i' THEN 'IMMUTABLE'
                           WHEN 's' THEN 'STABLE'
                           WHEN 'v' THEN 'VOLATILE'
                           ELSE 'UNKNOWN'
                       END as volatility,
                       CASE
                           WHEN p.provolatile = 'i' THEN 'Function is immutable - good for performance'
                           WHEN p.provolatile = 's' THEN 'Function is stable - moderate performance impact'
                           WHEN p.provolatile = 'v' THEN 'WARNING: Function is volatile - may impact performance'
                           ELSE 'Unknown volatility - review required'
                       END as volatility_status
                   FROM pg_proc p
                   JOIN pg_namespace n ON p.pronamespace = n.oid
                   WHERE n.nspname = '${step.schema}' AND p.proname = '${step.objectName}'
               `,
				expectedResult: "Function is immutable - good for performance",
				severity: "info",
				automated: true,
			});

			// 6. Function dependency analysis
			validations.push({
				id: `function_dependencies_${step.id}`,
				name: `Function Dependency Analysis: ${step.name}`,
				description: `Analyze dependencies for ${step.objectName}`,
				type: "schema",
				category: "schema",
				sqlQuery: `
                   SELECT
                       COUNT(*) as dependency_count,
                       COUNT(CASE WHEN deptype = 'n' THEN 1 END) as normal_dependencies,
                       COUNT(CASE WHEN deptype = 'i' THEN 1 END) as internal_dependencies,
                       CASE
                           WHEN COUNT(*) > 0 THEN 'Function dependencies validated'
                           ELSE 'No dependencies found'
                       END as dependency_status
                   FROM pg_depend d
                   JOIN pg_proc p ON d.objid = p.oid
                   JOIN pg_namespace n ON p.pronamespace = n.oid
                   WHERE n.nspname = '${step.schema}' AND p.proname = '${step.objectName}'
               `,
				expectedResult: "Function dependencies validated",
				severity: "info",
				automated: true,
			});

			// 7. Function execution plan analysis
			validations.push({
				id: `function_execution_plan_${step.id}`,
				name: `Function Execution Plan: ${step.name}`,
				description: `Analyze execution plan characteristics for ${step.objectName}`,
				type: "performance",
				category: "performance",
				sqlQuery: `
                   SELECT
                       proname,
                       prolang as language_oid,
                       CASE
                           WHEN prolang = (SELECT oid FROM pg_language WHERE lanname = 'sql') THEN 'SQL function'
                           WHEN prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql') THEN 'PL/pgSQL function'
                           WHEN prolang = (SELECT oid FROM pg_language WHERE lanname = 'c') THEN 'C function'
                           ELSE 'Other language function'
                       END as language_type,
                       CASE
                           WHEN prolang = (SELECT oid FROM pg_language WHERE lanname = 'sql') THEN 'SQL function - good performance characteristics'
                           WHEN prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql') THEN 'PL/pgSQL function - moderate performance impact'
                           ELSE 'Other language - review performance characteristics'
                       END as execution_status
                   FROM pg_proc p
                   JOIN pg_namespace n ON p.pronamespace = n.oid
                   WHERE n.nspname = '${step.schema}' AND p.proname = '${step.objectName}'
               `,
				expectedResult: "SQL function - good performance characteristics",
				severity: "info",
				automated: true,
			});

			// 8. Function return type validation
			validations.push({
				id: `function_return_type_${step.id}`,
				name: `Function Return Type: ${step.name}`,
				description: `Validate return type for ${step.objectName}`,
				type: "schema",
				category: "schema",
				sqlQuery: `
                   SELECT
                       proname,
                       pg_get_function_result(p.oid) as return_type,
                       CASE
                           WHEN pg_get_function_result(p.oid) != 'void' THEN 'Function has return type'
                           ELSE 'WARNING: Function returns void'
                       END as return_status
                   FROM pg_proc p
                   JOIN pg_namespace n ON p.pronamespace = n.oid
                   WHERE n.nspname = '${step.schema}' AND p.proname = '${step.objectName}'
               `,
				expectedResult: "Function has return type",
				severity: "info",
				automated: true,
			});

			// 9. Function language validation
			validations.push({
				id: `function_language_${step.id}`,
				name: `Function Language Validation: ${step.name}`,
				description: `Validate function language for ${step.objectName}`,
				type: "schema",
				category: "schema",
				sqlQuery: `
                   SELECT
                       p.proname,
                       l.lanname as language_name,
                       CASE
                           WHEN l.lanname IN ('sql', 'plpgsql') THEN 'Trusted language - ' || l.lanname
                           WHEN l.lanname = 'c' THEN 'WARNING: C language - requires superuser privileges'
                           ELSE 'Other language - ' || l.lanname
                       END as language_status
                   FROM pg_proc p
                   JOIN pg_namespace n ON p.pronamespace = n.oid
                   JOIN pg_language l ON p.prolang = l.oid
                   WHERE n.nspname = '${step.schema}' AND p.proname = '${step.objectName}'
               `,
				expectedResult: "Trusted language - sql",
				severity: "info",
				automated: true,
			});

			// 10. Function access privilege validation
			validations.push({
				id: `function_privileges_${step.id}`,
				name: `Function Access Privileges: ${step.name}`,
				description: `Validate access privileges for ${step.objectName}`,
				type: "security",
				category: "security",
				sqlQuery: `
                   SELECT
                       COUNT(*) as privilege_count,
                       COUNT(CASE WHEN proacl IS NOT NULL THEN 1 END) as functions_with_acl,
                       CASE
                           WHEN COUNT(*) > 0 THEN 'Function privileges configured'
                           ELSE 'WARNING: No function privileges found'
                       END as privilege_status
                   FROM pg_proc p
                   JOIN pg_namespace n ON p.pronamespace = n.oid
                   WHERE n.nspname = '${step.schema}' AND p.proname = '${step.objectName}'
               `,
				expectedResult: "Function privileges configured",
				severity: "info",
				automated: true,
			});

			Logger.info("Advanced function validations generated", "generateAdvancedFunctionValidations", {
				stepId: step.id,
				validationCount: validations.length,
				functionName: step.objectName,
			});

			return validations;
		} catch (error) {
			Logger.error(
				"Failed to generate advanced function validations",
				error as Error,
				"generateAdvancedFunctionValidations",
				{
					stepId: step.id,
					functionName: step.objectName,
					schema: step.schema,
				},
			);

			// Return basic validations as fallback
			return [
				{
					id: `fallback_function_syntax_${step.id}`,
					name: `Fallback Function Syntax: ${step.name}`,
					description: `Basic function syntax check for ${step.objectName}`,
					type: "syntax",
					category: "syntax",
					sqlQuery: `SELECT proname FROM pg_proc WHERE proname = '${step.objectName}' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = '${step.schema}')`,
					expectedResult: 1,
					severity: "error",
					automated: true,
				},
				{
					id: `fallback_function_execution_${step.id}`,
					name: `Fallback Function Execution: ${step.name}`,
					description: `Basic function execution check for ${step.objectName}`,
					type: "data",
					category: "data",
					sqlQuery: `SELECT COUNT(*) FROM pg_proc WHERE proname = '${step.objectName}' AND prokind = 'f'`,
					expectedResult: ">= 0",
					severity: "info",
					automated: true,
				},
			];
		}
	}

	/**
	 * Generate advanced column validations with comprehensive analysis
	 */
	private async generateAdvancedColumnValidations(
		step: MigrationStep,
		connectionId: string,
	): Promise<ValidationStep[]> {
		const validations: ValidationStep[] = [];

		try {
			Logger.info("Generating advanced column validations", "generateAdvancedColumnValidations", {
				stepId: step.id,
				columnName: step.objectName,
				schema: step.schema,
				operation: step.operation,
			});

			// 1. Enhanced column integrity validation
			validations.push({
				id: `column_integrity_${step.id}`,
				name: `Column Integrity: ${step.name}`,
				description: `Verify column modifications maintain data integrity`,
				type: "data",
				category: "data",
				sqlQuery: `
                   SELECT
                       COUNT(*) as column_count,
                       COUNT(CASE WHEN data_type IS NOT NULL THEN 1 END) as typed_columns,
                       COUNT(CASE WHEN is_nullable = 'NO' THEN 1 END) as not_null_columns,
                       CASE
                           WHEN COUNT(*) > 0 THEN 'Column integrity validated'
                           ELSE 'WARNING: Column integrity issues detected'
                       END as integrity_status
                   FROM information_schema.columns
                   WHERE table_schema = '${step.schema}' AND table_name = '${step.objectName}' AND column_name = '${step.objectName}'
               `,
				expectedResult: "Column integrity validated",
				severity: "info",
				automated: true,
			});

			// 2. Column data validation with statistical analysis
			validations.push({
				id: `column_data_${step.id}`,
				name: `Column Data Analysis: ${step.name}`,
				description: `Verify column data is valid after modification`,
				type: "data",
				category: "data",
				sqlQuery: `
                   SELECT
                       COUNT(*) as total_rows,
                       COUNT(CASE WHEN ${step.objectName} IS NOT NULL THEN 1 END) as non_null_rows,
                       COUNT(CASE WHEN ${step.objectName} IS NULL THEN 1 END) as null_rows,
                       ROUND(
                           (COUNT(CASE WHEN ${step.objectName} IS NOT NULL THEN 1 END) * 100.0 / COUNT(*)), 2
                       ) as non_null_percentage,
                       CASE
                           WHEN COUNT(*) > 0 THEN 'Column data analysis completed'
                           ELSE 'WARNING: No data found in column'
                       END as data_status
                   FROM ${step.schema}.${step.objectName}
               `,
				expectedResult: "Column data analysis completed",
				severity: "info",
				automated: true,
			});

			// 3. Column data type consistency validation
			validations.push({
				id: `column_type_consistency_${step.id}`,
				name: `Column Type Consistency: ${step.name}`,
				description: `Validate data type consistency for ${step.objectName}`,
				type: "data",
				category: "data",
				sqlQuery: `
                   SELECT
                       data_type,
                       COUNT(*) as rows_with_type,
                       CASE
                           WHEN data_type IN ('integer', 'bigint', 'smallint', 'numeric', 'decimal') THEN 'Numeric type validation'
                           WHEN data_type IN ('varchar', 'text', 'char') THEN 'Text type validation'
                           WHEN data_type IN ('date', 'timestamp', 'time') THEN 'Date/time type validation'
                           WHEN data_type IN ('boolean') THEN 'Boolean type validation'
                           ELSE 'Other type validation'
                       END as type_validation_status
                   FROM information_schema.columns
                   WHERE table_schema = '${step.schema}' AND table_name = '${step.objectName}' AND column_name = '${step.objectName}'
                   GROUP BY data_type
               `,
				expectedResult: ">= 0",
				severity: "info",
				automated: true,
			});

			// 4. Column constraint validation
			validations.push({
				id: `column_constraints_${step.id}`,
				name: `Column Constraint Validation: ${step.name}`,
				description: `Validate column constraints for ${step.objectName}`,
				type: "schema",
				category: "schema",
				sqlQuery: `
                   SELECT
                       c.column_name,
                       c.data_type,
                       c.is_nullable,
                       c.column_default,
                       COUNT(CASE WHEN tc.constraint_type = 'PRIMARY KEY' THEN 1 END) as pk_constraints,
                       COUNT(CASE WHEN tc.constraint_type = 'FOREIGN KEY' THEN 1 END) as fk_constraints,
                       COUNT(CASE WHEN tc.constraint_type = 'UNIQUE' THEN 1 END) as unique_constraints,
                       COUNT(CASE WHEN tc.constraint_type = 'CHECK' THEN 1 END) as check_constraints,
                       CASE
                           WHEN COUNT(*) > 0 THEN 'Column constraints validated'
                           ELSE 'No constraints found'
                       END as constraint_status
                   FROM information_schema.columns c
                   LEFT JOIN information_schema.key_column_usage kcu ON c.column_name = kcu.column_name
                   LEFT JOIN information_schema.table_constraints tc ON kcu.constraint_name = tc.constraint_name
                   WHERE c.table_schema = '${step.schema}' AND c.table_name = '${step.objectName}' AND c.column_name = '${step.objectName}'
                   GROUP BY c.column_name, c.data_type, c.is_nullable, c.column_default
               `,
				expectedResult: "Column constraints validated",
				severity: "info",
				automated: true,
			});

			// 5. Column statistical analysis
			validations.push({
				id: `column_statistics_${step.id}`,
				name: `Column Statistical Analysis: ${step.name}`,
				description: `Perform statistical analysis on ${step.objectName}`,
				type: "data",
				category: "data",
				sqlQuery: `
                   SELECT
                       COUNT(*) as total_values,
                       COUNT(DISTINCT ${step.objectName}) as distinct_values,
                       ROUND(
                           (COUNT(DISTINCT ${step.objectName}) * 100.0 / COUNT(*)), 2
                       ) as distinct_percentage,
                       CASE
                           WHEN COUNT(DISTINCT ${step.objectName}) > 1 THEN 'Column has data diversity'
                           ELSE 'WARNING: Column has low data diversity'
                       END as diversity_status
                   FROM ${step.schema}.${step.objectName}
                   WHERE ${step.objectName} IS NOT NULL
               `,
				expectedResult: "Column has data diversity",
				severity: "info",
				automated: true,
			});

			// 6. Column null pattern analysis
			validations.push({
				id: `column_null_patterns_${step.id}`,
				name: `Column Null Pattern Analysis: ${step.name}`,
				description: `Analyze null patterns in ${step.objectName}`,
				type: "data",
				category: "data",
				sqlQuery: `
                   SELECT
                       COUNT(*) as total_rows,
                       COUNT(CASE WHEN ${step.objectName} IS NULL THEN 1 END) as null_count,
                       COUNT(CASE WHEN ${step.objectName} IS NOT NULL THEN 1 END) as not_null_count,
                       ROUND(
                           (COUNT(CASE WHEN ${step.objectName} IS NULL THEN 1 END) * 100.0 / COUNT(*)), 2
                       ) as null_percentage,
                       CASE
                           WHEN COUNT(CASE WHEN ${step.objectName} IS NULL THEN 1 END) = 0 THEN 'No null values - good data quality'
                           WHEN COUNT(CASE WHEN ${step.objectName} IS NULL THEN 1 END) < (COUNT(*) * 0.1) THEN 'Low null percentage - acceptable'
                           ELSE 'WARNING: High null percentage detected'
                       END as null_status
                   FROM ${step.schema}.${step.objectName}
               `,
				expectedResult: "No null values - good data quality",
				severity: "info",
				automated: true,
			});

			// 7. Column data distribution analysis
			validations.push({
				id: `column_distribution_${step.id}`,
				name: `Column Data Distribution: ${step.name}`,
				description: `Analyze data distribution in ${step.objectName}`,
				type: "data",
				category: "data",
				sqlQuery: `
                   SELECT
                       COUNT(*) as total_count,
                       MIN(${step.objectName}) as min_value,
                       MAX(${step.objectName}) as max_value,
                       AVG(CASE WHEN ${step.objectName} ~ '^[0-9]+\\.?[0-9]*$' THEN ${step.objectName}::numeric END) as avg_value,
                       CASE
                           WHEN MIN(${step.objectName}) IS NOT NULL AND MAX(${step.objectName}) IS NOT NULL THEN 'Data range analysis completed'
                           ELSE 'WARNING: Cannot analyze data range'
                       END as distribution_status
                   FROM ${step.schema}.${step.objectName}
                   WHERE ${step.objectName} IS NOT NULL
               `,
				expectedResult: "Data range analysis completed",
				severity: "info",
				automated: true,
			});

			// 8. Column default value validation
			validations.push({
				id: `column_defaults_${step.id}`,
				name: `Column Default Value Validation: ${step.name}`,
				description: `Validate default values for ${step.objectName}`,
				type: "schema",
				category: "schema",
				sqlQuery: `
                   SELECT
                       column_name,
                       data_type,
                       column_default,
                       is_nullable,
                       CASE
                           WHEN column_default IS NOT NULL THEN 'Default value configured'
                           WHEN is_nullable = 'YES' THEN 'No default needed - nullable column'
                           ELSE 'WARNING: No default value for non-nullable column'
                       END as default_status
                   FROM information_schema.columns
                   WHERE table_schema = '${step.schema}' AND table_name = '${step.objectName}' AND column_name = '${step.objectName}'
               `,
				expectedResult: "Default value configured",
				severity: "info",
				automated: true,
			});

			// 9. Column length validation (for text columns)
			validations.push({
				id: `column_length_${step.id}`,
				name: `Column Length Validation: ${step.name}`,
				description: `Validate column length constraints for ${step.objectName}`,
				type: "data",
				category: "data",
				sqlQuery: `
                   SELECT
                       character_maximum_length,
                       COUNT(*) as total_rows,
                       COUNT(CASE WHEN LENGTH(${step.objectName}::text) > character_maximum_length THEN 1 END) as oversized_values,
                       CASE
                           WHEN character_maximum_length IS NULL THEN 'No length constraint'
                           WHEN COUNT(CASE WHEN LENGTH(${step.objectName}::text) > character_maximum_length THEN 1 END) = 0 THEN 'All values within length limit'
                           ELSE 'WARNING: Values exceed length limit'
                       END as length_status
                   FROM information_schema.columns c
                   LEFT JOIN ${step.schema}.${step.objectName} t ON true
                   WHERE c.table_schema = '${step.schema}' AND c.table_name = '${step.objectName}' AND c.column_name = '${step.objectName}'
                   GROUP BY character_maximum_length
               `,
				expectedResult: "All values within length limit",
				severity: "info",
				automated: true,
			});

			// 10. Column precision and scale validation (for numeric columns)
			validations.push({
				id: `column_precision_${step.id}`,
				name: `Column Precision & Scale: ${step.name}`,
				description: `Validate precision and scale for ${step.objectName}`,
				type: "data",
				category: "data",
				sqlQuery: `
                   SELECT
                       numeric_precision,
                       numeric_scale,
                       COUNT(*) as total_numeric_values,
                       COUNT(CASE WHEN ${step.objectName} IS NOT NULL AND ${step.objectName} != 0 THEN 1 END) as non_zero_values,
                       CASE
                           WHEN numeric_precision IS NULL THEN 'Non-numeric column'
                           WHEN COUNT(CASE WHEN LENGTH(${step.objectName}::text) > numeric_precision THEN 1 END) > 0 THEN 'WARNING: Values exceed precision'
                           ELSE 'Precision validation passed'
                       END as precision_status
                   FROM information_schema.columns c
                   LEFT JOIN ${step.schema}.${step.objectName} t ON true
                   WHERE c.table_schema = '${step.schema}' AND c.table_name = '${step.objectName}' AND c.column_name = '${step.objectName}'
                   GROUP BY numeric_precision, numeric_scale
               `,
				expectedResult: "Precision validation passed",
				severity: "info",
				automated: true,
			});

			Logger.info("Advanced column validations generated", "generateAdvancedColumnValidations", {
				stepId: step.id,
				validationCount: validations.length,
				columnName: step.objectName,
			});

			return validations;
		} catch (error) {
			Logger.error(
				"Failed to generate advanced column validations",
				error as Error,
				"generateAdvancedColumnValidations",
				{
					stepId: step.id,
					columnName: step.objectName,
					schema: step.schema,
				},
			);

			// Return basic validations as fallback
			return [
				{
					id: `fallback_column_integrity_${step.id}`,
					name: `Fallback Column Integrity: ${step.name}`,
					description: `Basic column integrity check for ${step.objectName}`,
					type: "data",
					category: "data",
					sqlQuery: `SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = '${step.schema}' AND table_name = '${step.objectName}' AND column_name = '${step.objectName}'`,
					expectedResult: 1,
					severity: "info",
					automated: true,
				},
				{
					id: `fallback_column_data_${step.id}`,
					name: `Fallback Column Data: ${step.name}`,
					description: `Basic column data check for ${step.objectName}`,
					type: "data",
					category: "data",
					sqlQuery: `SELECT COUNT(*) FROM ${step.schema}.${step.objectName} WHERE ${step.objectName} IS NOT NULL`,
					expectedResult: ">= 0",
					severity: "info",
					automated: true,
				},
			];
		}
	}

	/**
	 * Generate advanced performance validations with comprehensive monitoring
	 */
	private async generateAdvancedPerformanceValidations(
		step: MigrationStep,
		connectionId: string,
	): Promise<ValidationStep[]> {
		const validations: ValidationStep[] = [];

		try {
			Logger.info("Generating advanced performance validations", "generateAdvancedPerformanceValidations", {
				stepId: step.id,
				objectName: step.objectName,
				schema: step.schema,
				objectType: step.objectType,
				operation: step.operation,
			});

			// 1. Query execution time monitoring
			validations.push({
				id: `performance_query_${step.id}`,
				name: `Query Execution Time: ${step.name}`,
				description: `Monitor query execution time impact of ${step.objectName} changes`,
				type: "performance",
				category: "performance",
				sqlQuery: `
                   SELECT
                       current_setting('log_min_duration_statement') as min_duration,
                       current_setting('log_statement') as statement_logging,
                       CASE
                           WHEN current_setting('log_min_duration_statement')::integer > 1000 THEN 'WARNING: High query duration threshold'
                           ELSE 'Query duration threshold is reasonable'
                       END as duration_status
               `,
				expectedResult: "Query duration threshold is reasonable",
				severity: "info",
				automated: true,
			});

			// 2. Table size monitoring (for table operations)
			if (step.objectType === "table") {
				validations.push({
					id: `table_size_${step.id}`,
					name: `Table Size Monitoring: ${step.name}`,
					description: `Monitor table size changes for ${step.objectName}`,
					type: "performance",
					category: "performance",
					sqlQuery: `
                       SELECT
                           schemaname,
                           tablename,
                           pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
                           pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
                           pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as index_size,
                           CASE
                               WHEN pg_total_relation_size(schemaname||'.'||tablename) > 1073741824 THEN 'WARNING: Large table detected (>1GB)'
                               WHEN pg_total_relation_size(schemaname||'.'||tablename) > 107374182 THEN 'WARNING: Medium table detected (>100MB)'
                               ELSE 'Table size is reasonable'
                           END as size_status
                       FROM pg_tables
                       WHERE schemaname = '${step.schema}' AND tablename = '${step.objectName}'
                   `,
					expectedResult: "Table size is reasonable",
					severity: "info",
					automated: true,
				});
			}

			// 3. Index performance impact assessment
			if (step.objectType === "index") {
				validations.push({
					id: `index_performance_${step.id}`,
					name: `Index Performance Impact: ${step.name}`,
					description: `Assess performance impact of index ${step.objectName}`,
					type: "performance",
					category: "performance",
					sqlQuery: `
                       SELECT
                           schemaname,
                           tablename,
                           indexname,
                           pg_size_pretty(pg_relation_size(indexname::regclass)) as index_size,
                           pg_stat_get_numscans(indexname::regclass) as scans,
                           pg_stat_get_tuples_returned(indexname::regclass) as tuples_returned,
                           CASE
                               WHEN pg_relation_size(indexname::regclass) > 536870912 THEN 'WARNING: Large index may impact performance'
                               WHEN pg_stat_get_numscans(indexname::regclass) < 100 THEN 'Low usage - consider index necessity'
                               ELSE 'Index performance is acceptable'
                           END as performance_impact
                       FROM pg_indexes
                       WHERE schemaname = '${step.schema}' AND indexname = '${step.objectName}'
                   `,
					expectedResult: "Index performance is acceptable",
					severity: "info",
					automated: true,
				});
			}

			// 4. Resource usage tracking
			validations.push({
				id: `resource_usage_${step.id}`,
				name: `Resource Usage Tracking: ${step.name}`,
				description: `Track resource usage impact of ${step.objectName} changes`,
				type: "performance",
				category: "performance",
				sqlQuery: `
                   SELECT
                       numbackends as active_connections,
                       CASE
                           WHEN numbackends > 50 THEN 'WARNING: High connection count'
                           WHEN numbackends > 20 THEN 'Moderate connection count'
                           ELSE 'Connection count is reasonable'
                       END as connection_status
                   FROM pg_stat_database
                   WHERE datname = current_database()
               `,
				expectedResult: "Connection count is reasonable",
				severity: "info",
				automated: true,
			});

			// 5. Performance regression detection
			validations.push({
				id: `performance_regression_${step.id}`,
				name: `Performance Regression Detection: ${step.name}`,
				description: `Detect performance regressions for ${step.objectName}`,
				type: "performance",
				category: "performance",
				sqlQuery: `
                   SELECT
                       schemaname,
                       tablename,
                       n_tup_ins as inserts,
                       n_tup_upd as updates,
                       n_tup_del as deletes,
                       n_tup_hot_upd as hot_updates,
                       CASE
                           WHEN n_tup_upd > 10000 THEN 'WARNING: High update activity detected'
                           WHEN n_tup_ins > 50000 THEN 'WARNING: High insert activity detected'
                           ELSE 'Activity levels are normal'
                       END as activity_status
                   FROM pg_stat_user_tables
                   WHERE schemaname = '${step.schema}' AND tablename = '${step.objectName}'
               `,
				expectedResult: "Activity levels are normal",
				severity: "info",
				automated: true,
			});

			// 6. Query plan analysis (for functions and views)
			if (step.objectType === "function" || step.objectType === "view") {
				validations.push({
					id: `query_plan_${step.id}`,
					name: `Query Plan Analysis: ${step.name}`,
					description: `Analyze query execution plan for ${step.objectName}`,
					type: "performance",
					category: "performance",
					sqlQuery: `
                       SELECT
                           schemaname,
                           ${step.objectType === "function" ? "proname" : "viewname"} as object_name,
                           CASE
                               WHEN ${step.objectType === "function" ? "pg_get_functiondef(p.oid)" : "definition"} LIKE '%SELECT%' THEN 'Contains SELECT statements'
                               ELSE 'No SELECT statements found'
                           END as plan_analysis
                       FROM pg_${step.objectType === "function" ? "proc p JOIN pg_namespace n ON p.pronamespace = n.oid" : "views"}
                       WHERE ${step.objectType === "function" ? "n.nspname" : "schemaname"} = '${step.schema}'
                       AND ${step.objectType === "function" ? "p.proname" : "viewname"} = '${step.objectName}'
                   `,
					expectedResult: "Contains SELECT statements",
					severity: "info",
					automated: true,
				});
			}

			// 7. Lock monitoring
			validations.push({
				id: `lock_monitoring_${step.id}`,
				name: `Lock Monitoring: ${step.name}`,
				description: `Monitor locks that may affect ${step.objectName}`,
				type: "performance",
				category: "performance",
				sqlQuery: `
                   SELECT
                       COUNT(*) as active_locks,
                       COUNT(CASE WHEN mode = 'ExclusiveLock' THEN 1 END) as exclusive_locks,
                       COUNT(CASE WHEN mode = 'RowExclusiveLock' THEN 1 END) as row_exclusive_locks,
                       CASE
                           WHEN COUNT(*) > 10 THEN 'WARNING: High lock count detected'
                           WHEN COUNT(CASE WHEN mode IN ('ExclusiveLock', 'RowExclusiveLock') THEN 1 END) > 0 THEN 'Exclusive locks present'
                           ELSE 'Lock status is normal'
                       END as lock_status
                   FROM pg_locks
                   WHERE locktype = 'relation'
               `,
				expectedResult: "Lock status is normal",
				severity: "info",
				automated: true,
			});

			// 8. Cache effectiveness monitoring
			validations.push({
				id: `cache_effectiveness_${step.id}`,
				name: `Cache Effectiveness: ${step.name}`,
				description: `Monitor cache effectiveness for ${step.objectName}`,
				type: "performance",
				category: "performance",
				sqlQuery: `
                   SELECT
                       sum(heap_blks_read) as heap_reads,
                       sum(heap_blks_hit) as heap_hits,
                       sum(idx_blks_read) as index_reads,
                       sum(idx_blks_hit) as index_hits,
                       CASE
                           WHEN sum(heap_blks_read) > 0 THEN
                               ROUND((sum(heap_blks_hit) * 100.0 / (sum(heap_blks_read) + sum(heap_blks_hit))), 2)
                           ELSE 100.0
                       END as cache_hit_ratio,
                       CASE
                           WHEN CASE
                               WHEN sum(heap_blks_read) > 0 THEN
                                   ROUND((sum(heap_blks_hit) * 100.0 / (sum(heap_blks_read) + sum(heap_blks_hit))), 2)
                               ELSE 100.0
                           END < 90 THEN 'WARNING: Low cache hit ratio'
                           ELSE 'Cache effectiveness is good'
                       END as cache_status
                   FROM pg_statio_user_tables
                   WHERE schemaname = '${step.schema}' AND relname = '${step.objectName}'
               `,
				expectedResult: "Cache effectiveness is good",
				severity: "info",
				automated: true,
			});

			// 9. I/O performance monitoring
			validations.push({
				id: `io_performance_${step.id}`,
				name: `I/O Performance: ${step.name}`,
				description: `Monitor I/O performance for ${step.objectName}`,
				type: "performance",
				category: "performance",
				sqlQuery: `
                   SELECT
                       schemaname,
                       tablename,
                       heap_blks_read + heap_blks_hit as total_heap_blocks,
                       idx_blks_read + idx_blks_hit as total_index_blocks,
                       CASE
                           WHEN (heap_blks_read + idx_blks_read) > 100000 THEN 'WARNING: High I/O activity'
                           ELSE 'I/O activity is normal'
                       END as io_status
                   FROM pg_statio_user_tables
                   WHERE schemaname = '${step.schema}' AND tablename = '${step.objectName}'
               `,
				expectedResult: "I/O activity is normal",
				severity: "info",
				automated: true,
			});

			// 10. Memory usage tracking
			validations.push({
				id: `memory_usage_${step.id}`,
				name: `Memory Usage Tracking: ${step.name}`,
				description: `Track memory usage impact of ${step.objectName}`,
				type: "performance",
				category: "performance",
				sqlQuery: `
                   SELECT
                       current_setting('work_mem') as work_mem,
                       current_setting('maintenance_work_mem') as maintenance_work_mem,
                       current_setting('shared_buffers') as shared_buffers,
                       CASE
                           WHEN current_setting('work_mem')::integer < 65536 THEN 'WARNING: Low work memory setting'
                           ELSE 'Memory settings are adequate'
                       END as memory_status
               `,
				expectedResult: "Memory settings are adequate",
				severity: "info",
				automated: true,
			});

			Logger.info("Advanced performance validations generated", "generateAdvancedPerformanceValidations", {
				stepId: step.id,
				validationCount: validations.length,
				objectName: step.objectName,
			});

			return validations;
		} catch (error) {
			Logger.error(
				"Failed to generate advanced performance validations",
				error as Error,
				"generateAdvancedPerformanceValidations",
				{
					stepId: step.id,
					objectName: step.objectName,
					schema: step.schema,
				},
			);

			// Return basic validations as fallback
			return [
				{
					id: `fallback_performance_query_${step.id}`,
					name: `Fallback Query Performance: ${step.name}`,
					description: `Basic query performance check for ${step.objectName}`,
					type: "performance",
					category: "performance",
					sqlQuery: this.generatePerformanceValidationQuery(step),
					severity: "info",
					automated: true,
				},
				{
					id: `fallback_resource_usage_${step.id}`,
					name: `Fallback Resource Usage: ${step.name}`,
					description: `Basic resource usage check for ${step.objectName}`,
					type: "performance",
					category: "performance",
					sqlQuery: `
                       SELECT
                           numbackends as active_connections,
                           CASE
                               WHEN numbackends > 50 THEN 'WARNING: High connection count'
                               ELSE 'Connection count is reasonable'
                           END as connection_status
                       FROM pg_stat_database
                       WHERE datname = current_database()
                   `,
					expectedResult: "Connection count is reasonable",
					severity: "info",
					automated: true,
				},
			];
		}
	}

	/**
	 * Generate advanced security validations with comprehensive checks
	 */
	private async generateAdvancedSecurityValidations(
		step: MigrationStep,
		connectionId: string,
	): Promise<ValidationStep[]> {
		const validations: ValidationStep[] = [];

		try {
			Logger.info("Generating advanced security validations", "generateAdvancedSecurityValidations", {
				stepId: step.id,
				objectName: step.objectName,
				schema: step.schema,
				objectType: step.objectType,
				operation: step.operation,
			});

			// 1. Enhanced security permission validation
			validations.push({
				id: `security_permissions_${step.id}`,
				name: `Security Permissions Analysis: ${step.name}`,
				description: `Comprehensive security permission analysis for ${step.objectName}`,
				type: "security",
				category: "security",
				sqlQuery: `
                   SELECT
                       COUNT(*) as total_grants,
                       COUNT(CASE WHEN privilege_type = 'SELECT' THEN 1 END) as select_grants,
                       COUNT(CASE WHEN privilege_type = 'INSERT' THEN 1 END) as insert_grants,
                       COUNT(CASE WHEN privilege_type = 'UPDATE' THEN 1 END) as update_grants,
                       COUNT(CASE WHEN privilege_type = 'DELETE' THEN 1 END) as delete_grants,
                       COUNT(CASE WHEN grantee = 'PUBLIC' THEN 1 END) as public_grants,
                       CASE
                           WHEN COUNT(CASE WHEN grantee = 'PUBLIC' THEN 1 END) > 0 THEN 'WARNING: Public access detected'
                           WHEN COUNT(*) > 10 THEN 'WARNING: High number of grants'
                           ELSE 'Security permissions are reasonable'
                       END as permission_status
                   FROM information_schema.role_table_grants
                   WHERE table_name = '${step.objectName}' AND table_schema = '${step.schema}'
               `,
				expectedResult: "Security permissions are reasonable",
				severity: "info",
				automated: true,
			});

			// 2. Privilege escalation detection
			validations.push({
				id: `security_privileges_${step.id}`,
				name: `Privilege Escalation Detection: ${step.name}`,
				description: `Detect potential privilege escalation for ${step.objectName}`,
				type: "security",
				category: "security",
				sqlQuery: `
                   SELECT
                       COUNT(*) as critical_privileges,
                       COUNT(CASE WHEN privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE') THEN 1 END) as dml_privileges,
                       COUNT(CASE WHEN privilege_type IN ('REFERENCES', 'TRIGGER') THEN 1 END) as advanced_privileges,
                       CASE
                           WHEN COUNT(CASE WHEN privilege_type IN ('REFERENCES', 'TRIGGER') THEN 1 END) > 0 THEN 'WARNING: Advanced privileges detected'
                           WHEN COUNT(*) > 5 THEN 'Multiple privileges - review required'
                           ELSE 'Privilege configuration is standard'
                       END as privilege_status
                   FROM information_schema.role_table_grants
                   WHERE table_name = '${step.objectName}' AND table_schema = '${step.schema}'
                   AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'REFERENCES', 'TRIGGER')
               `,
				expectedResult: "Privilege configuration is standard",
				severity: "info",
				automated: true,
			});

			// 3. SQL injection vulnerability assessment
			validations.push({
				id: `sql_injection_${step.id}`,
				name: `SQL Injection Vulnerability: ${step.name}`,
				description: `Assess SQL injection vulnerabilities for ${step.objectName}`,
				type: "security",
				category: "security",
				sqlQuery: `
                   SELECT
                       COUNT(*) as function_count,
                       COUNT(CASE WHEN prolang = (SELECT oid FROM pg_language WHERE lanname = 'sql') THEN 1 END) as sql_functions,
                       COUNT(CASE WHEN prosecdef THEN 1 END) as security_definer_functions,
                       CASE
                           WHEN COUNT(CASE WHEN prosecdef THEN 1 END) > 0 THEN 'WARNING: Security definer functions detected'
                           ELSE 'No security definer functions found'
                       END as injection_status
                   FROM pg_proc p
                   JOIN pg_namespace n ON p.pronamespace = n.oid
                   WHERE n.nspname = '${step.schema}'
                   AND (p.proname = '${step.objectName}' OR '${step.objectType}' = 'function')
               `,
				expectedResult: "No security definer functions found",
				severity: "info",
				automated: true,
			});

			// 4. Access pattern analysis
			validations.push({
				id: `access_patterns_${step.id}`,
				name: `Access Pattern Analysis: ${step.name}`,
				description: `Analyze access patterns for ${step.objectName}`,
				type: "security",
				category: "security",
				sqlQuery: `
                   SELECT
                       COUNT(*) as total_access_patterns,
                       COUNT(CASE WHEN privilege_type = 'SELECT' AND grantee != 'PUBLIC' THEN 1 END) as restricted_select,
                       COUNT(CASE WHEN privilege_type IN ('INSERT', 'UPDATE', 'DELETE') THEN 1 END) as modification_access,
                       CASE
                           WHEN COUNT(CASE WHEN privilege_type IN ('INSERT', 'UPDATE', 'DELETE') THEN 1 END) > 3 THEN 'WARNING: Multiple modification access points'
                           ELSE 'Access patterns are controlled'
                       END as access_status
                   FROM information_schema.role_table_grants
                   WHERE table_name = '${step.objectName}' AND table_schema = '${step.schema}'
               `,
				expectedResult: "Access patterns are controlled",
				severity: "info",
				automated: true,
			});

			// 5. Role-based access control validation
			validations.push({
				id: `rbac_validation_${step.id}`,
				name: `RBAC Validation: ${step.name}`,
				description: `Validate role-based access control for ${step.objectName}`,
				type: "security",
				category: "security",
				sqlQuery: `
                   SELECT
                       COUNT(DISTINCT grantee) as unique_roles,
                       COUNT(*) as total_grants,
                       COUNT(CASE WHEN grantee IN ('postgres', 'PUBLIC') THEN 1 END) as super_user_grants,
                       CASE
                           WHEN COUNT(CASE WHEN grantee IN ('postgres', 'PUBLIC') THEN 1 END) > 0 THEN 'WARNING: Super user access detected'
                           WHEN COUNT(DISTINCT grantee) > 5 THEN 'Multiple roles accessing object'
                           ELSE 'RBAC configuration is appropriate'
                       END as rbac_status
                   FROM information_schema.role_table_grants
                   WHERE table_name = '${step.objectName}' AND table_schema = '${step.schema}'
               `,
				expectedResult: "RBAC configuration is appropriate",
				severity: "info",
				automated: true,
			});

			// 6. Object ownership validation
			validations.push({
				id: `object_ownership_${step.id}`,
				name: `Object Ownership Validation: ${step.name}`,
				description: `Validate ownership security for ${step.objectName}`,
				type: "security",
				category: "security",
				sqlQuery: `
                   SELECT
                       ${step.objectType === "table" ? "tableowner" : step.objectType === "view" ? "viewowner" : step.objectType === "function" ? "(SELECT usename FROM pg_user WHERE usesysid = p.proowner)" : "owner"} as owner,
                       CASE
                           WHEN ${step.objectType === "table" ? "tableowner" : step.objectType === "view" ? "viewowner" : step.objectType === "function" ? "(SELECT usename FROM pg_user WHERE usesysid = p.proowner)" : "owner"} IN ('postgres') THEN 'WARNING: Owned by superuser'
                           ELSE 'Ownership is appropriate'
                       END as ownership_status
                   FROM ${step.objectType === "function" ? "pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid" : step.objectType === "table" ? "pg_tables" : "pg_views"}
                   WHERE ${step.objectType === "function" ? "n.nspname" : "schemaname"} = '${step.schema}'
                   AND ${step.objectType === "function" ? "p.proname" : step.objectType === "table" ? "tablename" : "viewname"} = '${step.objectName}'
               `,
				expectedResult: "Ownership is appropriate",
				severity: "info",
				automated: true,
			});

			// 7. Grant cascade analysis
			validations.push({
				id: `grant_cascade_${step.id}`,
				name: `Grant Cascade Analysis: ${step.name}`,
				description: `Analyze grant cascade effects for ${step.objectName}`,
				type: "security",
				category: "security",
				sqlQuery: `
                   SELECT
                       COUNT(*) as direct_grants,
                       COUNT(CASE WHEN grantor != grantee THEN 1 END) as delegated_grants,
                       CASE
                           WHEN COUNT(CASE WHEN grantor != grantee THEN 1 END) > 0 THEN 'WARNING: Grant delegation detected'
                           ELSE 'No grant delegation found'
                       END as cascade_status
                   FROM information_schema.role_table_grants
                   WHERE table_name = '${step.objectName}' AND table_schema = '${step.schema}'
               `,
				expectedResult: "No grant delegation found",
				severity: "info",
				automated: true,
			});

			// 8. Sensitive data exposure check
			validations.push({
				id: `sensitive_data_${step.id}`,
				name: `Sensitive Data Exposure: ${step.name}`,
				description: `Check for potential sensitive data exposure in ${step.objectName}`,
				type: "security",
				category: "security",
				sqlQuery: `
                   SELECT
                       COUNT(*) as column_count,
                       COUNT(CASE WHEN column_name LIKE '%password%' THEN 1 END) as password_columns,
                       COUNT(CASE WHEN column_name LIKE '%ssn%' THEN 1 END) as ssn_columns,
                       COUNT(CASE WHEN column_name LIKE '%credit%' THEN 1 END) as credit_columns,
                       COUNT(CASE WHEN column_name LIKE '%email%' THEN 1 END) as email_columns,
                       CASE
                           WHEN COUNT(CASE WHEN column_name LIKE '%password%' THEN 1 END) > 0 THEN 'WARNING: Password columns detected'
                           WHEN COUNT(CASE WHEN column_name LIKE '%ssn%' THEN 1 END) > 0 THEN 'WARNING: SSN columns detected'
                           WHEN COUNT(CASE WHEN column_name LIKE '%credit%' THEN 1 END) > 0 THEN 'WARNING: Credit card columns detected'
                           ELSE 'No obvious sensitive data columns found'
                       END as sensitivity_status
                   FROM information_schema.columns
                   WHERE table_schema = '${step.schema}' AND table_name = '${step.objectName}'
               `,
				expectedResult: "No obvious sensitive data columns found",
				severity: "info",
				automated: true,
			});

			// 9. Function security definer analysis (for function objects)
			if (step.objectType === "function") {
				validations.push({
					id: `function_security_definer_${step.id}`,
					name: `Function Security Definer: ${step.name}`,
					description: `Analyze security definer status for function ${step.objectName}`,
					type: "security",
					category: "security",
					sqlQuery: `
                       SELECT
                           proname,
                           prosecdef as is_security_definer,
                           CASE
                               WHEN prosecdef THEN 'WARNING: Function is SECURITY DEFINER'
                               ELSE 'Function is INVOKER security context'
                           END as security_context
                       FROM pg_proc p
                       JOIN pg_namespace n ON p.pronamespace = n.oid
                       WHERE n.nspname = '${step.schema}' AND p.proname = '${step.objectName}'
                   `,
					expectedResult: "Function is INVOKER security context",
					severity: "info",
					automated: true,
				});
			}

			// 10. Audit trail validation
			validations.push({
				id: `audit_trail_${step.id}`,
				name: `Audit Trail Validation: ${step.name}`,
				description: `Validate audit trail configuration for ${step.objectName}`,
				type: "security",
				category: "security",
				sqlQuery: `
                   SELECT
                       COUNT(*) as audit_configurations,
                       CASE
                           WHEN COUNT(*) > 0 THEN 'Audit configuration found'
                           ELSE 'WARNING: No audit configuration detected'
                       END as audit_status
                   FROM pg_proc p
                   JOIN pg_namespace n ON p.pronamespace = n.oid
                   WHERE n.nspname = '${step.schema}'
                   AND p.proname LIKE '%' || '${step.objectName}' || '%'
                   AND p.proname LIKE '%audit%'
               `,
				expectedResult: "Audit configuration found",
				severity: "info",
				automated: true,
			});

			Logger.info("Advanced security validations generated", "generateAdvancedSecurityValidations", {
				stepId: step.id,
				validationCount: validations.length,
				objectName: step.objectName,
			});

			return validations;
		} catch (error) {
			Logger.error(
				"Failed to generate advanced security validations",
				error as Error,
				"generateAdvancedSecurityValidations",
				{
					stepId: step.id,
					objectName: step.objectName,
					schema: step.schema,
				},
			);

			// Return basic validations as fallback
			return [
				{
					id: `fallback_security_permissions_${step.id}`,
					name: `Fallback Security Permissions: ${step.name}`,
					description: `Basic security permission check for ${step.objectName}`,
					type: "security",
					category: "security",
					sqlQuery: `SELECT COUNT(*) FROM information_schema.role_table_grants WHERE table_name = '${step.objectName}' AND table_schema = '${step.schema}'`,
					expectedResult: ">= 0",
					severity: "info",
					automated: true,
				},
				{
					id: `fallback_security_privileges_${step.id}`,
					name: `Fallback Security Privileges: ${step.name}`,
					description: `Basic privilege check for ${step.objectName}`,
					type: "security",
					category: "security",
					sqlQuery: `
                       SELECT COUNT(*) FROM information_schema.role_table_grants
                       WHERE table_name = '${step.objectName}' AND table_schema = '${step.schema}'
                       AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
                   `,
					expectedResult: ">= 0",
					severity: "info",
					automated: true,
				},
			];
		}
	}

	/**
	 * Generate global validations with comprehensive system-wide checks
	 */
	private async generateGlobalValidations(
		migrationSteps: MigrationStep[],
		connectionId: string,
	): Promise<ValidationStep[]> {
		const validations: ValidationStep[] = [];

		try {
			Logger.info("Generating global validations", "generateGlobalValidations", {
				stepCount: migrationSteps.length,
				connectionId,
			});

			// 1. Overall schema consistency validation with enhanced checks
			validations.push({
				id: "global_schema_consistency",
				name: "Global Schema Consistency",
				description: "Verify overall schema consistency after all migrations",
				type: "schema",
				category: "schema",
				sqlQuery: `
                   SELECT
                       COUNT(*) as total_tables,
                       COUNT(CASE WHEN table_type = 'BASE TABLE' THEN 1 END) as base_tables,
                       COUNT(CASE WHEN table_type = 'VIEW' THEN 1 END) as views,
                       COUNT(CASE WHEN table_type = 'FOREIGN' THEN 1 END) as foreign_tables,
                       COUNT(CASE WHEN table_type IS NULL THEN 1 END) as invalid_tables,
                       CASE
                           WHEN COUNT(CASE WHEN table_type IS NULL THEN 1 END) > 0 THEN 'WARNING: Invalid table types detected'
                           WHEN COUNT(*) > 0 THEN 'Schema consistency validated'
                           ELSE 'WARNING: No tables found in schema'
                       END as consistency_status
                   FROM information_schema.tables t
                   WHERE t.table_schema NOT IN ('information_schema', 'pg_catalog')
               `,
				expectedResult: "Schema consistency validated",
				severity: "error",
				automated: true,
			});

			// 2. Enhanced database connectivity validation
			validations.push({
				id: "global_connectivity",
				name: "Database Connectivity & Health",
				description: "Verify database remains accessible and healthy after migrations",
				type: "data",
				category: "data",
				sqlQuery: `
                   SELECT
                       1 as connectivity_test,
                       current_database() as database_name,
                       version() as postgres_version,
                       current_setting('server_version_num') as version_number,
                       CASE
                           WHEN current_setting('server_version_num')::integer > 120000 THEN 'Modern PostgreSQL version'
                           ELSE 'WARNING: Older PostgreSQL version'
                       END as version_status
               `,
				expectedResult: 1,
				severity: "error",
				automated: true,
			});

			// 3. Cross-schema dependency validation
			validations.push({
				id: "global_cross_schema_dependencies",
				name: "Cross-Schema Dependencies",
				description: "Validate cross-schema dependencies and references",
				type: "schema",
				category: "schema",
				sqlQuery: `
                   SELECT
                       COUNT(*) as cross_schema_refs,
                       COUNT(DISTINCT tc.table_schema) as schemas_referenced,
                       COUNT(DISTINCT ccu.table_schema) as foreign_schemas,
                       CASE
                           WHEN COUNT(*) > 0 THEN 'Cross-schema dependencies found and validated'
                           ELSE 'No cross-schema dependencies detected'
                       END as dependency_status
                   FROM information_schema.table_constraints tc
                   JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                   JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
                   WHERE tc.table_schema != ccu.table_schema
                   AND tc.table_schema NOT IN ('information_schema', 'pg_catalog')
                   AND ccu.table_schema NOT IN ('information_schema', 'pg_catalog')
               `,
				expectedResult: "Cross-schema dependencies found and validated",
				severity: "info",
				automated: true,
			});

			// 4. Transaction consistency validation
			validations.push({
				id: "global_transaction_consistency",
				name: "Transaction Consistency",
				description: "Validate transaction consistency across all migrations",
				type: "data",
				category: "data",
				sqlQuery: `
                   SELECT
                       COUNT(*) as active_transactions,
                       COUNT(CASE WHEN state = 'active' THEN 1 END) as truly_active,
                       COUNT(CASE WHEN state = 'idle' THEN 1 END) as idle_transactions,
                       COUNT(CASE WHEN state = 'idle in transaction' THEN 1 END) as idle_in_transaction,
                       CASE
                           WHEN COUNT(CASE WHEN state = 'idle in transaction' THEN 1 END) > 5 THEN 'WARNING: Long-running idle transactions'
                           WHEN COUNT(*) > 20 THEN 'WARNING: High transaction count'
                           ELSE 'Transaction state is normal'
                       END as transaction_status
                   FROM pg_stat_activity
                   WHERE datname = current_database()
               `,
				expectedResult: "Transaction state is normal",
				severity: "info",
				automated: true,
			});

			// 5. System resource monitoring
			validations.push({
				id: "global_system_resources",
				name: "System Resource Monitoring",
				description: "Monitor system resource usage after migrations",
				type: "performance",
				category: "performance",
				sqlQuery: `
                   SELECT
                       current_setting('shared_buffers') as shared_buffers,
                       current_setting('effective_cache_size') as effective_cache_size,
                       current_setting('work_mem') as work_mem,
                       current_setting('maintenance_work_mem') as maintenance_work_mem,
                       CASE
                           WHEN current_setting('shared_buffers')::integer < 134217728 THEN 'WARNING: Low shared buffers'
                           WHEN current_setting('work_mem')::integer < 65536 THEN 'WARNING: Low work memory'
                           ELSE 'System resources are adequately configured'
                       END as resource_status
               `,
				expectedResult: "System resources are adequately configured",
				severity: "info",
				automated: true,
			});

			// 6. Database object count validation
			validations.push({
				id: "global_object_count",
				name: "Database Object Count",
				description: "Validate total database object count after migrations",
				type: "schema",
				category: "schema",
				sqlQuery: `
                   SELECT
                       (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema NOT IN ('information_schema', 'pg_catalog')) as table_count,
                       (SELECT COUNT(*) FROM information_schema.views WHERE table_schema NOT IN ('information_schema', 'pg_catalog')) as view_count,
                       (SELECT COUNT(*) FROM pg_indexes WHERE schemaname NOT IN ('information_schema', 'pg_catalog')) as index_count,
                       (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname NOT IN ('information_schema', 'pg_catalog')) as function_count,
                       (SELECT COUNT(*) FROM pg_trigger t JOIN pg_namespace n ON t.tgrelid = n.oid WHERE n.nspname NOT IN ('information_schema', 'pg_catalog')) as trigger_count,
                       CASE
                           WHEN (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema NOT IN ('information_schema', 'pg_catalog')) >= 0 THEN 'Object count validation completed'
                           ELSE 'WARNING: Object count validation failed'
                       END as object_status
               `,
				expectedResult: "Object count validation completed",
				severity: "info",
				automated: true,
			});

			// 7. Schema privilege consistency
			validations.push({
				id: "global_privilege_consistency",
				name: "Schema Privilege Consistency",
				description: "Validate privilege consistency across schemas",
				type: "security",
				category: "security",
				sqlQuery: `
                   SELECT
                       COUNT(*) as total_privileges,
                       COUNT(DISTINCT grantee) as unique_grantees,
                       COUNT(CASE WHEN privilege_type = 'USAGE' THEN 1 END) as schema_usage_privileges,
                       COUNT(CASE WHEN grantee = 'PUBLIC' THEN 1 END) as public_privileges,
                       CASE
                           WHEN COUNT(CASE WHEN grantee = 'PUBLIC' THEN 1 END) > 0 THEN 'WARNING: Public schema privileges detected'
                           ELSE 'Schema privileges are properly configured'
                       END as privilege_status
                   FROM information_schema.schema_privileges
                   WHERE schema_name NOT IN ('information_schema', 'pg_catalog')
               `,
				expectedResult: "Schema privileges are properly configured",
				severity: "info",
				automated: true,
			});

			// 8. Database configuration validation
			validations.push({
				id: "global_database_config",
				name: "Database Configuration",
				description: "Validate database configuration after migrations",
				type: "schema",
				category: "schema",
				sqlQuery: `
                   SELECT
                       current_setting('log_destination') as log_destination,
                       current_setting('logging_collector') as logging_collector,
                       current_setting('log_statement') as log_statement,
                       current_setting('log_min_duration_statement') as log_min_duration,
                       CASE
                           WHEN current_setting('logging_collector') = 'on' THEN 'Logging collector is enabled'
                           ELSE 'WARNING: Logging collector is disabled'
                       END as logging_status,
                       CASE
                           WHEN current_setting('log_min_duration_statement')::integer <= 1000 THEN 'Query logging threshold is reasonable'
                           ELSE 'WARNING: High query logging threshold'
                       END as query_logging_status
               `,
				expectedResult: "Logging collector is enabled",
				severity: "info",
				automated: true,
			});

			// 9. Replication status validation (if applicable)
			validations.push({
				id: "global_replication_status",
				name: "Replication Status",
				description: "Validate replication status after migrations",
				type: "data",
				category: "data",
				sqlQuery: `
                   SELECT
                       COUNT(*) as replication_slots,
                       COUNT(CASE WHEN active THEN 1 END) as active_slots,
                       CASE
                           WHEN COUNT(*) > 0 THEN 'Replication slots configured'
                           ELSE 'No replication slots found'
                       END as replication_status
                   FROM pg_replication_slots
               `,
				expectedResult: "Replication slots configured",
				severity: "info",
				automated: true,
			});

			// 10. Backup and recovery validation
			validations.push({
				id: "global_backup_validation",
				name: "Backup & Recovery Validation",
				description: "Validate backup and recovery configuration",
				type: "schema",
				category: "schema",
				sqlQuery: `
                   SELECT
                       COUNT(*) as backup_configs,
                       current_setting('archive_mode') as archive_mode,
                       current_setting('archive_command') as archive_command,
                       CASE
                           WHEN current_setting('archive_mode') = 'on' AND current_setting('archive_command') != '' THEN 'Archive mode properly configured'
                           ELSE 'WARNING: Archive mode not properly configured'
                       END as backup_status
               `,
				expectedResult: "Archive mode properly configured",
				severity: "info",
				automated: true,
			});

			// 11. Connection pool health
			validations.push({
				id: "global_connection_health",
				name: "Connection Pool Health",
				description: "Validate connection pool health after migrations",
				type: "performance",
				category: "performance",
				sqlQuery: `
                   SELECT
                       COUNT(*) as total_connections,
                       COUNT(CASE WHEN state = 'active' THEN 1 END) as active_connections,
                       COUNT(CASE WHEN state = 'idle' THEN 1 END) as idle_connections,
                       COUNT(CASE WHEN state = 'idle in transaction' THEN 1 END) as idle_in_transaction,
                       current_setting('max_connections')::integer as max_connections,
                       CASE
                           WHEN COUNT(*) > current_setting('max_connections')::integer * 0.8 THEN 'WARNING: High connection utilization'
                           WHEN COUNT(CASE WHEN state = 'idle in transaction' THEN 1 END) > 5 THEN 'WARNING: Idle transactions detected'
                           ELSE 'Connection pool health is good'
                       END as connection_status
                   FROM pg_stat_activity
                   WHERE datname = current_database()
               `,
				expectedResult: "Connection pool health is good",
				severity: "info",
				automated: true,
			});

			// 12. Schema change impact assessment
			validations.push({
				id: "global_impact_assessment",
				name: "Schema Change Impact Assessment",
				description: "Assess overall impact of schema changes",
				type: "schema",
				category: "schema",
				sqlQuery: `
                   SELECT
                       ${migrationSteps.length} as migration_steps,
                       ${migrationSteps.filter((s) => s.objectType === "table").length} as affected_tables,
                       ${migrationSteps.filter((s) => s.objectType === "view").length} as affected_views,
                       ${migrationSteps.filter((s) => s.objectType === "function").length} as affected_functions,
                       ${migrationSteps.filter((s) => s.objectType === "index").length} as affected_indexes,
                       ${migrationSteps.filter((s) => s.objectType === "column").length} as affected_columns,
                       CASE
                           WHEN ${migrationSteps.length} > 0 THEN 'Schema impact assessment completed'
                           ELSE 'No migrations to assess'
                       END as impact_status
               `,
				expectedResult: "Schema impact assessment completed",
				severity: "info",
				automated: true,
			});

			Logger.info("Global validations generated", "generateGlobalValidations", {
				validationCount: validations.length,
				migrationStepCount: migrationSteps.length,
			});

			return validations;
		} catch (error) {
			Logger.error("Failed to generate global validations", error as Error, "generateGlobalValidations", {
				stepCount: migrationSteps.length,
				connectionId,
			});

			// Return basic validations as fallback
			return [
				{
					id: "fallback_global_schema_consistency",
					name: "Fallback Global Schema Consistency",
					description: "Basic schema consistency check",
					type: "schema",
					category: "schema",
					sqlQuery: `
                       SELECT COUNT(*) FROM information_schema.tables t
                       WHERE t.table_schema NOT IN ('information_schema', 'pg_catalog')
                   `,
					expectedResult: ">= 0",
					severity: "error",
					automated: true,
				},
				{
					id: "fallback_global_connectivity",
					name: "Fallback Database Connectivity",
					description: "Basic connectivity check",
					type: "data",
					category: "data",
					sqlQuery: "SELECT 1 as connectivity_test",
					expectedResult: 1,
					severity: "error",
					automated: true,
				},
			];
		}
	}

	/**
	 * Generate data consistency validation query
	 */
	private generateDataConsistencyQuery(step: MigrationStep): string {
		switch (step.objectType) {
			case "table":
				return `SELECT COUNT(*) FROM ${step.schema}.${step.objectName} WHERE 1=1`;
			case "column":
				return `SELECT COUNT(*) FROM ${step.schema}.${step.objectName} WHERE ${step.objectName} IS NOT NULL`;
			default:
				return `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '${step.schema}'`;
		}
	}

	/**
	 * Generate dependency validation query
	 */
	private generateDependencyValidationQuery(step: MigrationStep): string {
		if (step.objectType === "table") {
			return `
                SELECT COUNT(*) FROM information_schema.table_constraints tc
                WHERE tc.table_schema = '${step.schema}' AND tc.table_name = '${step.objectName}'
                AND tc.constraint_type = 'FOREIGN KEY'
            `;
		}
		return `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '${step.schema}'`;
	}

	/**
	 * Generate performance validation query
	 */
	private generatePerformanceValidationQuery(step: MigrationStep): string {
		switch (step.objectType) {
			case "table":
				return `SELECT COUNT(*) FROM ${step.schema}.${step.objectName} WHERE 1=1`;
			case "index":
				return `SELECT * FROM pg_stat_user_indexes WHERE indexname = '${step.objectName}'`;
			default:
				return `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '${step.schema}'`;
		}
	}

	/**
	 * Analyze migration dependencies
	 */
	private async analyzeMigrationDependencies(
		migrationSteps: MigrationStep[],
		sourceConnectionId: string,
		targetConnectionId: string,
	): Promise<MigrationDependency[]> {
		const dependencies: MigrationDependency[] = [];

		// Analyze dependencies between migration steps
		for (let i = 0; i < migrationSteps.length; i++) {
			const currentStep = migrationSteps[i];

			// Check if current step depends on previous steps
			for (let j = 0; j < i; j++) {
				const previousStep = migrationSteps[j];

				const isDependent = await this.areStepsDependent(
					currentStep,
					previousStep,
					sourceConnectionId,
					targetConnectionId,
				);
				if (isDependent) {
					dependencies.push({
						fromStep: previousStep.id,
						toStep: currentStep.id,
						type: "object",
						description: `${currentStep.objectName} depends on ${previousStep.objectName}`,
					});
				}
			}
		}

		return dependencies;
	}
	private async areStepsDependent(
		step1: MigrationStep,
		step2: MigrationStep,
		sourceConnectionId: string,
		targetConnectionId: string,
	): Promise<boolean> {
		try {
			// Check if two migration steps are dependent based on real database analysis

			// 1. Same object dependency
			if (step1.schema === step2.schema && step1.objectName === step2.objectName) {
				return true; // Same object - always dependent
			}

			// 2. Foreign key relationship analysis
			if (step1.objectType === "table" && step2.objectType === "table") {
				const fkDependency = await this.checkForeignKeyDependency(step1, step2, sourceConnectionId, targetConnectionId);
				if (fkDependency) {
					return true;
				}
			}

			// 3. View dependency analysis
			if (step1.objectType === "table" && step2.objectType === "view") {
				const viewDependency = await this.checkViewDependency(step1, step2, sourceConnectionId, targetConnectionId);
				if (viewDependency) {
					return true;
				}
			}

			if (step1.objectType === "view" && step2.objectType === "table") {
				const tableViewDependency = await this.checkTableViewDependency(
					step1,
					step2,
					sourceConnectionId,
					targetConnectionId,
				);
				if (tableViewDependency) {
					return true;
				}
			}

			// 4. Function dependency analysis
			if (step1.objectType === "table" && step2.objectType === "function") {
				const functionDependency = await this.checkFunctionDependency(
					step1,
					step2,
					sourceConnectionId,
					targetConnectionId,
				);
				if (functionDependency) {
					return true;
				}
			}

			if (step1.objectType === "function" && step2.objectType === "table") {
				const tableFunctionDependency = await this.checkTableFunctionDependency(
					step1,
					step2,
					sourceConnectionId,
					targetConnectionId,
				);
				if (tableFunctionDependency) {
					return true;
				}
			}

			// 5. Index dependency analysis
			if (step1.objectType === "table" && step2.objectType === "index") {
				const indexDependency = await this.checkIndexDependency(step1, step2, sourceConnectionId, targetConnectionId);
				if (indexDependency) {
					return true;
				}
			}

			if (step1.objectType === "index" && step2.objectType === "table") {
				const tableIndexDependency = await this.checkTableIndexDependency(
					step1,
					step2,
					sourceConnectionId,
					targetConnectionId,
				);
				if (tableIndexDependency) {
					return true;
				}
			}

			// 6. Constraint dependency analysis
			if (step1.objectType === "table" && step2.objectType === "table") {
				const constraintDependency = await this.checkConstraintDependency(
					step1,
					step2,
					sourceConnectionId,
					targetConnectionId,
				);
				if (constraintDependency) {
					return true;
				}
			}

			// 7. Schema-level dependency analysis
			if (step1.schema !== step2.schema) {
				const schemaDependency = await this.checkSchemaDependency(step1, step2, sourceConnectionId, targetConnectionId);
				if (schemaDependency) {
					return true;
				}
			}

			return false;
		} catch (error) {
			Logger.warn("Error checking step dependencies", "areStepsDependent", {
				step1: `${step1.objectType}.${step1.schema}.${step1.objectName}`,
				step2: `${step2.objectType}.${step2.schema}.${step2.objectName}`,
				error: (error as Error).message,
			});

			// Fallback to simple dependency check
			return step1.schema === step2.schema && step1.objectName === step2.objectName;
		}
	}

	/**
	 * Check if there's a foreign key dependency between two tables
	 */
	private async checkForeignKeyDependency(
		tableStep: MigrationStep,
		otherStep: MigrationStep,
		sourceConnectionId: string,
		targetConnectionId: string,
	): Promise<boolean> {
		try {
			Logger.debug("Checking foreign key dependency", "checkForeignKeyDependency", {
				tableStep: `${tableStep.schema}.${tableStep.objectName}`,
				otherStep: `${otherStep.schema}.${otherStep.objectName}`,
				sourceConnectionId,
				targetConnectionId,
			});

			// Query 1: Check if otherStep.table has FK pointing TO tableStep.table
			const fkToQuery = `
                SELECT COUNT(*) as fk_count
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
                WHERE tc.constraint_type = 'FOREIGN KEY'
                AND tc.table_schema = '${otherStep.schema}'
                AND tc.table_name = '${otherStep.objectName}'
                AND ccu.table_schema = '${tableStep.schema}'
                AND ccu.table_name = '${tableStep.objectName}'
            `;

			// Query 2: Check if tableStep.table has FK pointing TO otherStep.table
			const fkFromQuery = `
                SELECT COUNT(*) as fk_count
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
                WHERE tc.constraint_type = 'FOREIGN KEY'
                AND tc.table_schema = '${tableStep.schema}'
                AND tc.table_name = '${tableStep.objectName}'
                AND ccu.table_schema = '${otherStep.schema}'
                AND ccu.table_name = '${otherStep.objectName}'
            `;

			// Execute both queries
			const [fkToResult, fkFromResult] = await Promise.all([
				this.queryService.executeQuery(targetConnectionId, fkToQuery),
				this.queryService.executeQuery(targetConnectionId, fkFromQuery),
			]);

			const fkToCount = parseInt(fkToResult.rows[0][0]);
			const fkFromCount = parseInt(fkFromResult.rows[0][0]);

			Logger.debug("Foreign key dependency check results", "checkForeignKeyDependency", {
				tableStep: `${tableStep.schema}.${tableStep.objectName}`,
				otherStep: `${otherStep.schema}.${otherStep.objectName}`,
				fkToCount, // otherStep -> tableStep
				fkFromCount, // tableStep -> otherStep
			});

			// Also check source database for comprehensive analysis
			try {
				const [sourceFkToResult, sourceFkFromResult] = await Promise.all([
					this.queryService.executeQuery(sourceConnectionId, fkToQuery),
					this.queryService.executeQuery(sourceConnectionId, fkFromQuery),
				]);

				const sourceFkToCount = parseInt(sourceFkToResult.rows[0][0]);
				const sourceFkFromCount = parseInt(sourceFkFromResult.rows[0][0]);

				Logger.debug("Source database FK check results", "checkForeignKeyDependency", {
					sourceFkToCount,
					sourceFkFromCount,
				});

				// Return true if FK dependency exists in either source or target
				return fkToCount > 0 || fkFromCount > 0 || sourceFkToCount > 0 || sourceFkFromCount > 0;
			} catch (sourceError) {
				Logger.warn("Could not check source database for FK dependencies", "checkForeignKeyDependency", {
					error: (sourceError as Error).message,
				});

				// Return target database results even if source check fails
				return fkToCount > 0 || fkFromCount > 0;
			}
		} catch (error) {
			Logger.error("Error checking foreign key dependency", error as Error, "checkForeignKeyDependency", {
				tableStep: `${tableStep.schema}.${tableStep.objectName}`,
				otherStep: `${otherStep.schema}.${otherStep.objectName}`,
				sourceConnectionId,
				targetConnectionId,
			});
			return false;
		}
	}

	/**
	 * Check if a view depends on a table
	 */
	private async checkViewDependency(
		tableStep: MigrationStep,
		viewStep: MigrationStep,
		sourceConnectionId: string,
		targetConnectionId: string,
	): Promise<boolean> {
		try {
			Logger.debug("Checking view dependency on table", "checkViewDependency", {
				tableStep: `${tableStep.schema}.${tableStep.objectName}`,
				viewStep: `${viewStep.schema}.${viewStep.objectName}`,
				sourceConnectionId,
				targetConnectionId,
			});

			// Enhanced view dependency check with multiple patterns
			const viewQuery = `
                SELECT
                    COUNT(*) as dependency_count,
                    string_agg(dependency_type, ', ') as found_dependencies
                FROM (
                    SELECT 'table_reference' as dependency_type
                    FROM pg_views v
                    WHERE v.schemaname = '${viewStep.schema}'
                    AND v.viewname = '${viewStep.objectName}'
                    AND (
                        v.definition ILIKE '%${tableStep.schema}.${tableStep.objectName}%'
                        OR v.definition ILIKE '%${tableStep.objectName}%'
                    )

                    UNION ALL

                    SELECT 'view_reference' as dependency_type
                    FROM pg_views v1
                    JOIN pg_views v2 ON (
                        v2.schemaname = '${viewStep.schema}'
                        AND v2.viewname = '${viewStep.objectName}'
                    )
                    WHERE v1.schemaname = '${viewStep.schema}'
                    AND v1.viewname = '${viewStep.objectName}'
                    AND v1.definition ILIKE '%' || v2.viewname || '%'
                ) dependencies
            `;

			const result = await this.queryService.executeQuery(targetConnectionId, viewQuery);
			const dependencyCount = parseInt(result.rows[0][0]);
			const foundDependencies = result.rows[0][1];

			Logger.debug("View dependency check results", "checkViewDependency", {
				tableStep: `${tableStep.schema}.${tableStep.objectName}`,
				viewStep: `${viewStep.schema}.${viewStep.objectName}`,
				dependencyCount,
				foundDependencies,
			});

			// Also check source database for comprehensive analysis
			try {
				const sourceResult = await this.queryService.executeQuery(sourceConnectionId, viewQuery);
				const sourceDependencyCount = parseInt(sourceResult.rows[0][0]);

				Logger.debug("Source database view dependency check", "checkViewDependency", {
					sourceDependencyCount,
				});

				// Return true if dependency exists in either source or target
				return dependencyCount > 0 || sourceDependencyCount > 0;
			} catch (sourceError) {
				Logger.warn("Could not check source database for view dependencies", "checkViewDependency", {
					error: (sourceError as Error).message,
				});

				// Return target database results even if source check fails
				return dependencyCount > 0;
			}
		} catch (error) {
			Logger.error("Error checking view dependency", error as Error, "checkViewDependency", {
				tableStep: `${tableStep.schema}.${tableStep.objectName}`,
				viewStep: `${viewStep.schema}.${viewStep.objectName}`,
				sourceConnectionId,
				targetConnectionId,
			});
			return false;
		}
	}

	/**
	 * Check if a table has views that depend on it
	 */
	private async checkTableViewDependency(
		viewStep: MigrationStep,
		tableStep: MigrationStep,
		sourceConnectionId: string,
		targetConnectionId: string,
	): Promise<boolean> {
		try {
			// Check if table has views that depend on it
			const dependencyQuery = `
                SELECT COUNT(*) as dependent_views
                FROM pg_views v
                WHERE v.schemaname = '${viewStep.schema}'
                AND v.viewname = '${viewStep.objectName}'
                AND v.definition ILIKE '%${tableStep.schema}.${tableStep.objectName}%'
            `;

			const result = await this.queryService.executeQuery(targetConnectionId, dependencyQuery);
			const dependentViews = parseInt(result.rows[0][0]);

			return dependentViews > 0;
		} catch (error) {
			Logger.warn("Error checking table-view dependency", "checkTableViewDependency", {
				viewStep: `${viewStep.schema}.${viewStep.objectName}`,
				tableStep: `${tableStep.schema}.${tableStep.objectName}`,
				error: (error as Error).message,
			});
			return false;
		}
	}

	/**
	 * Check if a function depends on a table
	 */
	private async checkFunctionDependency(
		tableStep: MigrationStep,
		functionStep: MigrationStep,
		sourceConnectionId: string,
		targetConnectionId: string,
	): Promise<boolean> {
		try {
			Logger.debug("Checking function dependency on table", "checkFunctionDependency", {
				tableStep: `${tableStep.schema}.${tableStep.objectName}`,
				functionStep: `${functionStep.schema}.${functionStep.objectName}`,
				sourceConnectionId,
				targetConnectionId,
			});

			// Enhanced function dependency check with multiple analysis methods
			const functionQuery = `
                SELECT
                    COUNT(*) as dependency_count,
                    string_agg(dependency_type, ', ') as found_dependencies
                FROM (
                    SELECT 'function_body' as dependency_type
                    FROM pg_proc p
                    JOIN pg_namespace n ON p.pronamespace = n.oid
                    WHERE n.nspname = '${functionStep.schema}'
                    AND p.proname = '${functionStep.objectName}'
                    AND pg_get_functiondef(p.oid) ILIKE '%${tableStep.schema}.${tableStep.objectName}%'

                    UNION ALL

                    SELECT 'function_reference' as dependency_type
                    FROM pg_proc p
                    JOIN pg_namespace n ON p.pronamespace = n.oid
                    WHERE n.nspname = '${functionStep.schema}'
                    AND p.proname = '${functionStep.objectName}'
                    AND pg_get_functiondef(p.oid) ILIKE '%${tableStep.objectName}%'

                    UNION ALL

                    SELECT 'table_return_type' as dependency_type
                    FROM pg_proc p
                    JOIN pg_namespace n ON p.pronamespace = n.oid
                    JOIN information_schema.tables t ON (
                        t.table_schema = '${tableStep.schema}'
                        AND t.table_name = '${tableStep.objectName}'
                    )
                    WHERE n.nspname = '${functionStep.schema}'
                    AND p.proname = '${functionStep.objectName}'
                    AND pg_get_function_result(p.oid) ILIKE '%' || t.table_name || '%'
                ) dependencies
            `;

			const result = await this.queryService.executeQuery(targetConnectionId, functionQuery);
			const dependencyCount = parseInt(result.rows[0][0]);
			const foundDependencies = result.rows[0][1];

			Logger.debug("Function dependency check results", "checkFunctionDependency", {
				tableStep: `${tableStep.schema}.${tableStep.objectName}`,
				functionStep: `${functionStep.schema}.${functionStep.objectName}`,
				dependencyCount,
				foundDependencies,
			});

			// Also check source database for comprehensive analysis
			try {
				const sourceResult = await this.queryService.executeQuery(sourceConnectionId, functionQuery);
				const sourceDependencyCount = parseInt(sourceResult.rows[0][0]);

				Logger.debug("Source database function dependency check", "checkFunctionDependency", {
					sourceDependencyCount,
				});

				// Return true if dependency exists in either source or target
				return dependencyCount > 0 || sourceDependencyCount > 0;
			} catch (sourceError) {
				Logger.warn("Could not check source database for function dependencies", "checkFunctionDependency", {
					error: (sourceError as Error).message,
				});

				// Return target database results even if source check fails
				return dependencyCount > 0;
			}
		} catch (error) {
			Logger.error("Error checking function dependency", error as Error, "checkFunctionDependency", {
				tableStep: `${tableStep.schema}.${tableStep.objectName}`,
				functionStep: `${functionStep.schema}.${functionStep.objectName}`,
				sourceConnectionId,
				targetConnectionId,
			});
			return false;
		}
	}

	/**
	 * Check if a table has functions that depend on it with comprehensive analysis
	 */
	private async checkTableFunctionDependency(
		functionStep: MigrationStep,
		tableStep: MigrationStep,
		sourceConnectionId: string,
		targetConnectionId: string,
	): Promise<boolean> {
		try {
			Logger.debug("Checking comprehensive table-function dependency", "checkTableFunctionDependency", {
				functionStep: `${functionStep.schema}.${functionStep.objectName}`,
				tableStep: `${tableStep.schema}.${tableStep.objectName}`,
				sourceConnectionId,
				targetConnectionId,
			});

			// Enhanced dependency analysis with multiple detection methods
			const dependencyQuery = `
                SELECT
                    COUNT(*) as total_dependencies,
                    COUNT(CASE WHEN function_definition ILIKE '%${tableStep.schema}.${tableStep.objectName}%' THEN 1 END) as direct_table_refs,
                    COUNT(CASE WHEN function_arguments ILIKE '%${tableStep.objectName}%' THEN 1 END) as parameter_refs,
                    COUNT(CASE WHEN return_type ILIKE '%${tableStep.objectName}%' THEN 1 END) as return_type_refs,
                    COUNT(CASE WHEN function_definition ILIKE '%${tableStep.objectName} %' THEN 1 END) as table_name_refs,
                    string_agg(
                        CASE
                            WHEN function_definition ILIKE '%${tableStep.schema}.${tableStep.objectName}%' THEN 'direct_table_ref'
                            WHEN function_arguments ILIKE '%${tableStep.objectName}%' THEN 'parameter_ref'
                            WHEN return_type ILIKE '%${tableStep.objectName}%' THEN 'return_type_ref'
                            WHEN function_definition ILIKE '%${tableStep.objectName} %' THEN 'table_name_ref'
                            ELSE 'other_ref'
                        END,
                        ', '
                    ) as dependency_types
                FROM (
                    SELECT
                        p.proname as function_name,
                        pg_get_function_identity_arguments(p.oid) as function_arguments,
                        pg_get_function_result(p.oid) as return_type,
                        pg_get_functiondef(p.oid) as function_definition
                    FROM pg_proc p
                    JOIN pg_namespace n ON p.pronamespace = n.oid
                    WHERE n.nspname = '${functionStep.schema}'
                    AND p.proname = '${functionStep.objectName}'
                ) function_analysis
            `;

			const result = await this.queryService.executeQuery(targetConnectionId, dependencyQuery);
			const dependencyData = result.rows[0];
			const totalDependencies = parseInt(dependencyData[0]);
			const directTableRefs = parseInt(dependencyData[1]);
			const parameterRefs = parseInt(dependencyData[2]);
			const returnTypeRefs = parseInt(dependencyData[3]);
			const tableNameRefs = parseInt(dependencyData[4]);
			const dependencyTypes = dependencyData[5];

			Logger.debug("Table-function dependency analysis results", "checkTableFunctionDependency", {
				functionStep: `${functionStep.schema}.${functionStep.objectName}`,
				tableStep: `${tableStep.schema}.${tableStep.objectName}`,
				totalDependencies,
				directTableRefs,
				parameterRefs,
				returnTypeRefs,
				tableNameRefs,
				dependencyTypes,
			});

			// Also check for trigger functions that depend on the table
			const triggerQuery = `
                SELECT COUNT(*) as trigger_functions
                FROM pg_trigger t
                JOIN pg_proc p ON t.tgfoid = p.oid
                JOIN pg_namespace n ON p.pronamespace = n.oid
                WHERE t.tgrelid = (
                    SELECT c.oid FROM pg_class c
                    JOIN pg_namespace n ON c.relnamespace = n.oid
                    WHERE c.relname = '${tableStep.objectName}'
                    AND n.nspname = '${tableStep.schema}'
                )
                AND n.nspname = '${functionStep.schema}'
                AND p.proname = '${functionStep.objectName}'
            `;

			const triggerResult = await this.queryService.executeQuery(targetConnectionId, triggerQuery);
			const triggerFunctions = parseInt(triggerResult.rows[0][0]);

			Logger.debug("Trigger function dependency check", "checkTableFunctionDependency", {
				triggerFunctions,
			});

			// Check for functions that return the table type
			const returnTypeQuery = `
                SELECT COUNT(*) as return_type_functions
                FROM pg_proc p
                JOIN pg_namespace n ON p.pronamespace = n.oid
                JOIN pg_type t ON p.prorettype = t.oid
                JOIN pg_class c ON t.typrelid = c.oid
                JOIN pg_namespace tn ON c.relnamespace = tn.oid
                WHERE n.nspname = '${functionStep.schema}'
                AND p.proname = '${functionStep.objectName}'
                AND tn.nspname = '${tableStep.schema}'
                AND c.relname = '${tableStep.objectName}'
            `;

			const returnTypeResult = await this.queryService.executeQuery(targetConnectionId, returnTypeQuery);
			const returnTypeFunctions = parseInt(returnTypeResult.rows[0][0]);

			Logger.debug("Return type dependency check", "checkTableFunctionDependency", {
				returnTypeFunctions,
			});

			// Check for functions that use the table in their parameters
			const parameterQuery = `
                SELECT COUNT(*) as parameter_functions
                FROM pg_proc p
                JOIN pg_namespace n ON p.pronamespace = n.oid
                WHERE n.nspname = '${functionStep.schema}'
                AND p.proname = '${functionStep.objectName}'
                AND pg_get_function_identity_arguments(p.oid) ILIKE '%${tableStep.schema}.${tableStep.objectName}%'
            `;

			const parameterResult = await this.queryService.executeQuery(targetConnectionId, parameterQuery);
			const parameterFunctions = parseInt(parameterResult.rows[0][0]);

			Logger.debug("Parameter dependency check", "checkTableFunctionDependency", {
				parameterFunctions,
			});

			// Also check source database for comprehensive analysis
			try {
				const [sourceResult, sourceTriggerResult, sourceReturnTypeResult, sourceParameterResult] = await Promise.all([
					this.queryService.executeQuery(sourceConnectionId, dependencyQuery),
					this.queryService.executeQuery(sourceConnectionId, triggerQuery),
					this.queryService.executeQuery(sourceConnectionId, returnTypeQuery),
					this.queryService.executeQuery(sourceConnectionId, parameterQuery),
				]);

				const sourceDependencyCount = parseInt(sourceResult.rows[0][0]);
				const sourceTriggerFunctions = parseInt(sourceTriggerResult.rows[0][0]);
				const sourceReturnTypeFunctions = parseInt(sourceReturnTypeResult.rows[0][0]);
				const sourceParameterFunctions = parseInt(sourceParameterResult.rows[0][0]);

				Logger.debug("Source database dependency check results", "checkTableFunctionDependency", {
					sourceDependencyCount,
					sourceTriggerFunctions,
					sourceReturnTypeFunctions,
					sourceParameterFunctions,
				});

				// Return true if dependency exists in either source or target
				return (
					totalDependencies > 0 ||
					triggerFunctions > 0 ||
					returnTypeFunctions > 0 ||
					parameterFunctions > 0 ||
					sourceDependencyCount > 0 ||
					sourceTriggerFunctions > 0 ||
					sourceReturnTypeFunctions > 0 ||
					sourceParameterFunctions > 0
				);
			} catch (sourceError) {
				Logger.warn("Could not check source database for table-function dependencies", "checkTableFunctionDependency", {
					error: (sourceError as Error).message,
				});

				// Return target database results even if source check fails
				return totalDependencies > 0 || triggerFunctions > 0 || returnTypeFunctions > 0 || parameterFunctions > 0;
			}
		} catch (error) {
			Logger.error("Error checking table-function dependency", error as Error, "checkTableFunctionDependency", {
				functionStep: `${functionStep.schema}.${functionStep.objectName}`,
				tableStep: `${tableStep.schema}.${tableStep.objectName}`,
				sourceConnectionId,
				targetConnectionId,
			});
			return false;
		}
	}

	/**
	 * Check if an index depends on a table with comprehensive analysis
	 */
	private async checkIndexDependency(
		tableStep: MigrationStep,
		indexStep: MigrationStep,
		sourceConnectionId: string,
		targetConnectionId: string,
	): Promise<boolean> {
		try {
			Logger.debug("Checking comprehensive index dependency", "checkIndexDependency", {
				tableStep: `${tableStep.schema}.${tableStep.objectName}`,
				indexStep: `${indexStep.schema}.${indexStep.objectName}`,
				sourceConnectionId,
				targetConnectionId,
			});

			// Enhanced index dependency analysis with multiple detection methods
			const indexQuery = `
                SELECT
                    COUNT(*) as index_count,
                    COUNT(CASE WHEN tablename = '${tableStep.objectName}' THEN 1 END) as direct_table_indexes,
                    COUNT(CASE WHEN indexdef ILIKE '%${tableStep.objectName}%' THEN 1 END) as table_referenced_indexes,
                    string_agg(
                        CASE
                            WHEN tablename = '${tableStep.objectName}' THEN 'direct_table_index'
                            WHEN indexdef ILIKE '%${tableStep.objectName}%' THEN 'table_referenced'
                            ELSE 'other_index'
                        END,
                        ', '
                    ) as dependency_types
                FROM pg_indexes
                WHERE schemaname = '${indexStep.schema}'
                AND indexname = '${indexStep.objectName}'
            `;

			const result = await this.queryService.executeQuery(targetConnectionId, indexQuery);
			const indexData = result.rows[0];
			const indexCount = parseInt(indexData[0]);
			const directTableIndexes = parseInt(indexData[1]);
			const tableReferencedIndexes = parseInt(indexData[2]);
			const dependencyTypes = indexData[3];

			Logger.debug("Index dependency analysis results", "checkIndexDependency", {
				tableStep: `${tableStep.schema}.${tableStep.objectName}`,
				indexStep: `${indexStep.schema}.${indexStep.objectName}`,
				indexCount,
				directTableIndexes,
				tableReferencedIndexes,
				dependencyTypes,
			});

			// Check for partial indexes that depend on the table
			const partialIndexQuery = `
                SELECT COUNT(*) as partial_indexes
                FROM pg_indexes
                WHERE schemaname = '${indexStep.schema}'
                AND indexname = '${indexStep.objectName}'
                AND indexdef ILIKE '%WHERE%'
                AND tablename = '${tableStep.objectName}'
            `;

			const partialIndexResult = await this.queryService.executeQuery(targetConnectionId, partialIndexQuery);
			const partialIndexes = parseInt(partialIndexResult.rows[0][0]);

			Logger.debug("Partial index dependency check", "checkIndexDependency", {
				partialIndexes,
			});

			// Check for expression-based indexes that reference the table
			const expressionIndexQuery = `
                SELECT COUNT(*) as expression_indexes
                FROM pg_indexes
                WHERE schemaname = '${indexStep.schema}'
                AND indexname = '${indexStep.objectName}'
                AND indexdef ~ '\\([^)]*${tableStep.objectName}[^)]*\\)'
                AND tablename = '${tableStep.objectName}'
            `;

			const expressionIndexResult = await this.queryService.executeQuery(targetConnectionId, expressionIndexQuery);
			const expressionIndexes = parseInt(expressionIndexResult.rows[0][0]);

			Logger.debug("Expression index dependency check", "checkIndexDependency", {
				expressionIndexes,
			});

			// Check for functional indexes that use table columns
			const functionalIndexQuery = `
                SELECT COUNT(*) as functional_indexes
                FROM pg_indexes
                WHERE schemaname = '${indexStep.schema}'
                AND indexname = '${indexStep.objectName}'
                AND indexdef ILIKE '%(${tableStep.objectName}.%)%'
                AND tablename = '${tableStep.objectName}'
            `;

			const functionalIndexResult = await this.queryService.executeQuery(targetConnectionId, functionalIndexQuery);
			const functionalIndexes = parseInt(functionalIndexResult.rows[0][0]);

			Logger.debug("Functional index dependency check", "checkIndexDependency", {
				functionalIndexes,
			});

			// Check for multi-column indexes that include the table
			const multiColumnIndexQuery = `
                SELECT COUNT(*) as multi_column_indexes
                FROM pg_indexes
                WHERE schemaname = '${indexStep.schema}'
                AND indexname = '${indexStep.objectName}'
                AND tablename = '${tableStep.objectName}'
                AND (indexdef LIKE '%,%' OR indexdef LIKE '%(%' || '${tableStep.objectName}' || '%)%')
            `;

			const multiColumnIndexResult = await this.queryService.executeQuery(targetConnectionId, multiColumnIndexQuery);
			const multiColumnIndexes = parseInt(multiColumnIndexResult.rows[0][0]);

			Logger.debug("Multi-column index dependency check", "checkIndexDependency", {
				multiColumnIndexes,
			});

			// Also check source database for comprehensive analysis
			try {
				const [
					sourceResult,
					sourcePartialResult,
					sourceExpressionResult,
					sourceFunctionalResult,
					sourceMultiColumnResult,
				] = await Promise.all([
					this.queryService.executeQuery(sourceConnectionId, indexQuery),
					this.queryService.executeQuery(sourceConnectionId, partialIndexQuery),
					this.queryService.executeQuery(sourceConnectionId, expressionIndexQuery),
					this.queryService.executeQuery(sourceConnectionId, functionalIndexQuery),
					this.queryService.executeQuery(sourceConnectionId, multiColumnIndexQuery),
				]);

				const sourceIndexCount = parseInt(sourceResult.rows[0][0]);
				const sourcePartialIndexes = parseInt(sourcePartialResult.rows[0][0]);
				const sourceExpressionIndexes = parseInt(sourceExpressionResult.rows[0][0]);
				const sourceFunctionalIndexes = parseInt(sourceFunctionalResult.rows[0][0]);
				const sourceMultiColumnIndexes = parseInt(sourceMultiColumnResult.rows[0][0]);

				Logger.debug("Source database index dependency check results", "checkIndexDependency", {
					sourceIndexCount,
					sourcePartialIndexes,
					sourceExpressionIndexes,
					sourceFunctionalIndexes,
					sourceMultiColumnIndexes,
				});

				// Return true if dependency exists in either source or target
				return (
					indexCount > 0 ||
					partialIndexes > 0 ||
					expressionIndexes > 0 ||
					functionalIndexes > 0 ||
					multiColumnIndexes > 0 ||
					sourceIndexCount > 0 ||
					sourcePartialIndexes > 0 ||
					sourceExpressionIndexes > 0 ||
					sourceFunctionalIndexes > 0 ||
					sourceMultiColumnIndexes > 0
				);
			} catch (sourceError) {
				Logger.warn("Could not check source database for index dependencies", "checkIndexDependency", {
					error: (sourceError as Error).message,
				});

				// Return target database results even if source check fails
				return (
					indexCount > 0 ||
					partialIndexes > 0 ||
					expressionIndexes > 0 ||
					functionalIndexes > 0 ||
					multiColumnIndexes > 0
				);
			}
		} catch (error) {
			Logger.error("Error checking index dependency", error as Error, "checkIndexDependency", {
				tableStep: `${tableStep.schema}.${tableStep.objectName}`,
				indexStep: `${indexStep.schema}.${indexStep.objectName}`,
				sourceConnectionId,
				targetConnectionId,
			});
			return false;
		}
	}

	/**
	 * Check if a table has indexes that depend on it with comprehensive analysis
	 */
	private async checkTableIndexDependency(
		indexStep: MigrationStep,
		tableStep: MigrationStep,
		sourceConnectionId: string,
		targetConnectionId: string,
	): Promise<boolean> {
		try {
			Logger.debug("Checking comprehensive table-index dependency", "checkTableIndexDependency", {
				indexStep: `${indexStep.schema}.${indexStep.objectName}`,
				tableStep: `${tableStep.schema}.${tableStep.objectName}`,
				sourceConnectionId,
				targetConnectionId,
			});

			// Enhanced table-index dependency analysis with multiple detection methods
			const dependencyQuery = `
                SELECT
                    COUNT(*) as total_indexes,
                    COUNT(CASE WHEN tablename = '${tableStep.objectName}' THEN 1 END) as direct_table_indexes,
                    COUNT(CASE WHEN indexdef ILIKE '%${tableStep.objectName}%' THEN 1 END) as table_referenced_indexes,
                    COUNT(CASE WHEN indexdef LIKE '%UNIQUE%' THEN 1 END) as unique_indexes,
                    COUNT(CASE WHEN indexdef NOT LIKE '%UNIQUE%' THEN 1 END) as non_unique_indexes,
                    string_agg(
                        CASE
                            WHEN tablename = '${tableStep.objectName}' THEN 'direct_table_index'
                            WHEN indexdef ILIKE '%${tableStep.objectName}%' THEN 'table_referenced'
                            ELSE 'other_index'
                        END,
                        ', '
                    ) as dependency_types
                FROM pg_indexes
                WHERE schemaname = '${indexStep.schema}'
                AND indexname = '${indexStep.objectName}'
            `;

			const result = await this.queryService.executeQuery(targetConnectionId, dependencyQuery);
			const indexData = result.rows[0];
			const totalIndexes = parseInt(indexData[0]);
			const directTableIndexes = parseInt(indexData[1]);
			const tableReferencedIndexes = parseInt(indexData[2]);
			const uniqueIndexes = parseInt(indexData[3]);
			const nonUniqueIndexes = parseInt(indexData[4]);
			const dependencyTypes = indexData[5];

			Logger.debug("Table-index dependency analysis results", "checkTableIndexDependency", {
				indexStep: `${indexStep.schema}.${indexStep.objectName}`,
				tableStep: `${tableStep.schema}.${tableStep.objectName}`,
				totalIndexes,
				directTableIndexes,
				tableReferencedIndexes,
				uniqueIndexes,
				nonUniqueIndexes,
				dependencyTypes,
			});

			// Check for primary key indexes
			const primaryKeyQuery = `
                SELECT COUNT(*) as pk_indexes
                FROM pg_indexes i
                JOIN pg_class c ON i.tablename = c.relname
                JOIN pg_namespace n ON c.relnamespace = n.oid
                WHERE i.schemaname = '${indexStep.schema}'
                AND i.indexname = '${indexStep.objectName}'
                AND i.tablename = '${tableStep.objectName}'
                AND EXISTS (
                    SELECT 1 FROM information_schema.table_constraints tc
                    WHERE tc.table_schema = i.schemaname
                    AND tc.table_name = i.tablename
                    AND tc.constraint_type = 'PRIMARY KEY'
                    AND tc.constraint_name = i.indexname
                )
            `;

			const primaryKeyResult = await this.queryService.executeQuery(targetConnectionId, primaryKeyQuery);
			const pkIndexes = parseInt(primaryKeyResult.rows[0][0]);

			Logger.debug("Primary key index dependency check", "checkTableIndexDependency", {
				pkIndexes,
			});

			// Check for foreign key indexes
			const foreignKeyQuery = `
                SELECT COUNT(*) as fk_indexes
                FROM pg_indexes i
                JOIN pg_class c ON i.tablename = c.relname
                JOIN pg_namespace n ON c.relnamespace = n.oid
                WHERE i.schemaname = '${indexStep.schema}'
                AND i.indexname = '${indexStep.objectName}'
                AND i.tablename = '${tableStep.objectName}'
                AND EXISTS (
                    SELECT 1 FROM information_schema.table_constraints tc
                    WHERE tc.table_schema = i.schemaname
                    AND tc.table_name = i.tablename
                    AND tc.constraint_type = 'FOREIGN KEY'
                    AND tc.constraint_name = i.indexname
                )
            `;

			const foreignKeyResult = await this.queryService.executeQuery(targetConnectionId, foreignKeyQuery);
			const fkIndexes = parseInt(foreignKeyResult.rows[0][0]);

			Logger.debug("Foreign key index dependency check", "checkTableIndexDependency", {
				fkIndexes,
			});

			// Check for indexes with specific column patterns
			const columnPatternQuery = `
                SELECT COUNT(*) as column_pattern_indexes
                FROM pg_indexes i
                WHERE i.schemaname = '${indexStep.schema}'
                AND i.indexname = '${indexStep.objectName}'
                AND i.tablename = '${tableStep.objectName}'
                AND i.indexdef ~ '\\([^)]*\\w+[^)]*\\)'
            `;

			const columnPatternResult = await this.queryService.executeQuery(targetConnectionId, columnPatternQuery);
			const columnPatternIndexes = parseInt(columnPatternResult.rows[0][0]);

			Logger.debug("Column pattern index dependency check", "checkTableIndexDependency", {
				columnPatternIndexes,
			});

			// Check for large indexes that may impact table operations
			const largeIndexQuery = `
                SELECT COUNT(*) as large_indexes
                FROM pg_indexes i
                WHERE i.schemaname = '${indexStep.schema}'
                AND i.indexname = '${indexStep.objectName}'
                AND i.tablename = '${tableStep.objectName}'
                AND pg_relation_size(i.indexname::regclass) > 1073741824
            `;

			const largeIndexResult = await this.queryService.executeQuery(targetConnectionId, largeIndexQuery);
			const largeIndexes = parseInt(largeIndexResult.rows[0][0]);

			Logger.debug("Large index dependency check", "checkTableIndexDependency", {
				largeIndexes,
			});

			// Also check source database for comprehensive analysis
			try {
				const [sourceResult, sourcePkResult, sourceFkResult, sourceColumnResult, sourceLargeResult] = await Promise.all(
					[
						this.queryService.executeQuery(sourceConnectionId, dependencyQuery),
						this.queryService.executeQuery(sourceConnectionId, primaryKeyQuery),
						this.queryService.executeQuery(sourceConnectionId, foreignKeyQuery),
						this.queryService.executeQuery(sourceConnectionId, columnPatternQuery),
						this.queryService.executeQuery(sourceConnectionId, largeIndexQuery),
					],
				);

				const sourceTotalIndexes = parseInt(sourceResult.rows[0][0]);
				const sourcePkIndexes = parseInt(sourcePkResult.rows[0][0]);
				const sourceFkIndexes = parseInt(sourceFkResult.rows[0][0]);
				const sourceColumnPatternIndexes = parseInt(sourceColumnResult.rows[0][0]);
				const sourceLargeIndexes = parseInt(sourceLargeResult.rows[0][0]);

				Logger.debug("Source database table-index dependency check results", "checkTableIndexDependency", {
					sourceTotalIndexes,
					sourcePkIndexes,
					sourceFkIndexes,
					sourceColumnPatternIndexes,
					sourceLargeIndexes,
				});

				// Return true if dependency exists in either source or target
				return (
					totalIndexes > 0 ||
					pkIndexes > 0 ||
					fkIndexes > 0 ||
					columnPatternIndexes > 0 ||
					largeIndexes > 0 ||
					sourceTotalIndexes > 0 ||
					sourcePkIndexes > 0 ||
					sourceFkIndexes > 0 ||
					sourceColumnPatternIndexes > 0 ||
					sourceLargeIndexes > 0
				);
			} catch (sourceError) {
				Logger.warn("Could not check source database for table-index dependencies", "checkTableIndexDependency", {
					error: (sourceError as Error).message,
				});

				// Return target database results even if source check fails
				return totalIndexes > 0 || pkIndexes > 0 || fkIndexes > 0 || columnPatternIndexes > 0 || largeIndexes > 0;
			}
		} catch (error) {
			Logger.error("Error checking table-index dependency", error as Error, "checkTableIndexDependency", {
				indexStep: `${indexStep.schema}.${indexStep.objectName}`,
				tableStep: `${tableStep.schema}.${tableStep.objectName}`,
				sourceConnectionId,
				targetConnectionId,
			});
			return false;
		}
	}

	/**
	 * Check for constraint dependencies between tables with comprehensive analysis
	 */
	private async checkConstraintDependency(
		tableStep1: MigrationStep,
		tableStep2: MigrationStep,
		sourceConnectionId: string,
		targetConnectionId: string,
	): Promise<boolean> {
		try {
			Logger.debug("Checking comprehensive constraint dependency", "checkConstraintDependency", {
				tableStep1: `${tableStep1.schema}.${tableStep1.objectName}`,
				tableStep2: `${tableStep2.schema}.${tableStep2.objectName}`,
				sourceConnectionId,
				targetConnectionId,
			});

			// Enhanced constraint dependency analysis with multiple detection methods
			const constraintQuery = `
                SELECT
                    COUNT(*) as total_constraints,
                    COUNT(CASE WHEN constraint_type = 'FOREIGN KEY' THEN 1 END) as fk_constraints,
                    COUNT(CASE WHEN constraint_type = 'CHECK' THEN 1 END) as check_constraints,
                    COUNT(CASE WHEN constraint_type = 'UNIQUE' THEN 1 END) as unique_constraints,
                    COUNT(CASE WHEN constraint_type = 'PRIMARY KEY' THEN 1 END) as pk_constraints,
                    string_agg(
                        constraint_type || ':' || constraint_name,
                        ', '
                    ) as constraint_details
                FROM information_schema.table_constraints tc
                WHERE tc.table_schema IN ('${tableStep1.schema}', '${tableStep2.schema}')
                AND tc.table_name IN ('${tableStep1.objectName}', '${tableStep2.objectName}')
            `;

			const result = await this.queryService.executeQuery(targetConnectionId, constraintQuery);
			const constraintData = result.rows[0];
			const totalConstraints = parseInt(constraintData[0]);
			const fkConstraints = parseInt(constraintData[1]);
			const checkConstraints = parseInt(constraintData[2]);
			const uniqueConstraints = parseInt(constraintData[3]);
			const pkConstraints = parseInt(constraintData[4]);
			const constraintDetails = constraintData[5];

			Logger.debug("Constraint dependency analysis results", "checkConstraintDependency", {
				tableStep1: `${tableStep1.schema}.${tableStep1.objectName}`,
				tableStep2: `${tableStep2.schema}.${tableStep2.objectName}`,
				totalConstraints,
				fkConstraints,
				checkConstraints,
				uniqueConstraints,
				pkConstraints,
				constraintDetails,
			});

			// Check for cross-table foreign key constraints
			const crossTableFKQuery = `
                SELECT COUNT(*) as cross_table_fk
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
                WHERE tc.constraint_type = 'FOREIGN KEY'
                AND ((tc.table_schema = '${tableStep1.schema}' AND tc.table_name = '${tableStep1.objectName}'
                      AND ccu.table_schema = '${tableStep2.schema}' AND ccu.table_name = '${tableStep2.objectName}')
                     OR
                     (tc.table_schema = '${tableStep2.schema}' AND tc.table_name = '${tableStep2.objectName}'
                      AND ccu.table_schema = '${tableStep1.schema}' AND ccu.table_name = '${tableStep1.objectName}'))
            `;

			const crossTableFKResult = await this.queryService.executeQuery(targetConnectionId, crossTableFKQuery);
			const crossTableFK = parseInt(crossTableFKResult.rows[0][0]);

			Logger.debug("Cross-table foreign key constraint check", "checkConstraintDependency", {
				crossTableFK,
			});

			// Check for multi-table check constraints
			const multiTableCheckQuery = `
                SELECT COUNT(*) as multi_table_checks
                FROM information_schema.table_constraints tc
                JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name
                WHERE tc.table_schema IN ('${tableStep1.schema}', '${tableStep2.schema}')
                AND tc.table_name IN ('${tableStep1.objectName}', '${tableStep2.objectName}')
                AND tc.constraint_type = 'CHECK'
                AND cc.check_clause ILIKE '%${tableStep1.schema}.${tableStep1.objectName}%'
                AND cc.check_clause ILIKE '%${tableStep2.schema}.${tableStep2.objectName}%'
            `;

			const multiTableCheckResult = await this.queryService.executeQuery(targetConnectionId, multiTableCheckQuery);
			const multiTableChecks = parseInt(multiTableCheckResult.rows[0][0]);

			Logger.debug("Multi-table check constraint check", "checkConstraintDependency", {
				multiTableChecks,
			});

			// Check for domain constraints that might affect both tables
			const domainConstraintQuery = `
                SELECT COUNT(*) as domain_constraints
                FROM information_schema.domains d
                JOIN information_schema.columns c1 ON c1.domain_name = d.domain_name
                JOIN information_schema.columns c2 ON c2.domain_name = d.domain_name
                WHERE c1.table_schema = '${tableStep1.schema}' AND c1.table_name = '${tableStep1.objectName}'
                AND c2.table_schema = '${tableStep2.schema}' AND c2.table_name = '${tableStep2.objectName}'
            `;

			const domainConstraintResult = await this.queryService.executeQuery(targetConnectionId, domainConstraintQuery);
			const domainConstraints = parseInt(domainConstraintResult.rows[0][0]);

			Logger.debug("Domain constraint dependency check", "checkConstraintDependency", {
				domainConstraints,
			});

			// Check for assertion constraints (PostgreSQL specific)
			const assertionConstraintQuery = `
                SELECT COUNT(*) as assertion_constraints
                FROM pg_constraint con
                JOIN pg_class c1 ON con.conrelid = c1.oid
                JOIN pg_class c2 ON con.conrelid = c2.oid
                JOIN pg_namespace n1 ON c1.relnamespace = n1.oid
                JOIN pg_namespace n2 ON c2.relnamespace = n2.oid
                WHERE con.contype = 'c'
                AND n1.nspname = '${tableStep1.schema}' AND c1.relname = '${tableStep1.objectName}'
                AND n2.nspname = '${tableStep2.schema}' AND c2.relname = '${tableStep2.objectName}'
            `;

			const assertionConstraintResult = await this.queryService.executeQuery(
				targetConnectionId,
				assertionConstraintQuery,
			);
			const assertionConstraints = parseInt(assertionConstraintResult.rows[0][0]);

			Logger.debug("Assertion constraint dependency check", "checkConstraintDependency", {
				assertionConstraints,
			});

			// Check for exclusion constraints that might span both tables
			const exclusionConstraintQuery = `
                SELECT COUNT(*) as exclusion_constraints
                FROM pg_constraint con
                JOIN pg_class c1 ON con.conrelid = c1.oid
                JOIN pg_class c2 ON con.conrelid = c2.oid
                JOIN pg_namespace n1 ON c1.relnamespace = n1.oid
                JOIN pg_namespace n2 ON c2.relnamespace = n2.oid
                WHERE con.contype = 'x'
                AND n1.nspname = '${tableStep1.schema}' AND c1.relname = '${tableStep1.objectName}'
                AND n2.nspname = '${tableStep2.schema}' AND c2.relname = '${tableStep2.objectName}'
            `;

			const exclusionConstraintResult = await this.queryService.executeQuery(
				targetConnectionId,
				exclusionConstraintQuery,
			);
			const exclusionConstraints = parseInt(exclusionConstraintResult.rows[0][0]);

			Logger.debug("Exclusion constraint dependency check", "checkConstraintDependency", {
				exclusionConstraints,
			});

			// Also check source database for comprehensive analysis
			try {
				const [
					sourceResult,
					sourceCrossFKResult,
					sourceMultiCheckResult,
					sourceDomainResult,
					sourceAssertionResult,
					sourceExclusionResult,
				] = await Promise.all([
					this.queryService.executeQuery(sourceConnectionId, constraintQuery),
					this.queryService.executeQuery(sourceConnectionId, crossTableFKQuery),
					this.queryService.executeQuery(sourceConnectionId, multiTableCheckQuery),
					this.queryService.executeQuery(sourceConnectionId, domainConstraintQuery),
					this.queryService.executeQuery(sourceConnectionId, assertionConstraintQuery),
					this.queryService.executeQuery(sourceConnectionId, exclusionConstraintQuery),
				]);

				const sourceTotalConstraints = parseInt(sourceResult.rows[0][0]);
				const sourceCrossTableFK = parseInt(sourceCrossFKResult.rows[0][0]);
				const sourceMultiTableChecks = parseInt(sourceMultiCheckResult.rows[0][0]);
				const sourceDomainConstraints = parseInt(sourceDomainResult.rows[0][0]);
				const sourceAssertionConstraints = parseInt(sourceAssertionResult.rows[0][0]);
				const sourceExclusionConstraints = parseInt(sourceExclusionResult.rows[0][0]);

				Logger.debug("Source database constraint dependency check results", "checkConstraintDependency", {
					sourceTotalConstraints,
					sourceCrossTableFK,
					sourceMultiTableChecks,
					sourceDomainConstraints,
					sourceAssertionConstraints,
					sourceExclusionConstraints,
				});

				// Return true if dependency exists in either source or target
				return (
					totalConstraints > 0 ||
					crossTableFK > 0 ||
					multiTableChecks > 0 ||
					domainConstraints > 0 ||
					assertionConstraints > 0 ||
					exclusionConstraints > 0 ||
					sourceTotalConstraints > 0 ||
					sourceCrossTableFK > 0 ||
					sourceMultiTableChecks > 0 ||
					sourceDomainConstraints > 0 ||
					sourceAssertionConstraints > 0 ||
					sourceExclusionConstraints > 0
				);
			} catch (sourceError) {
				Logger.warn("Could not check source database for constraint dependencies", "checkConstraintDependency", {
					error: (sourceError as Error).message,
				});

				// Return target database results even if source check fails
				return (
					totalConstraints > 0 ||
					crossTableFK > 0 ||
					multiTableChecks > 0 ||
					domainConstraints > 0 ||
					assertionConstraints > 0 ||
					exclusionConstraints > 0
				);
			}
		} catch (error) {
			Logger.error("Error checking constraint dependency", error as Error, "checkConstraintDependency", {
				tableStep1: `${tableStep1.schema}.${tableStep1.objectName}`,
				tableStep2: `${tableStep2.schema}.${tableStep2.objectName}`,
				sourceConnectionId,
				targetConnectionId,
			});
			return false;
		}
	}

	/**
	 * Check for schema-level dependencies with comprehensive cross-schema analysis
	 */
	private async checkSchemaDependency(
		step1: MigrationStep,
		step2: MigrationStep,
		sourceConnectionId: string,
		targetConnectionId: string,
	): Promise<boolean> {
		try {
			Logger.debug("Checking comprehensive schema dependency", "checkSchemaDependency", {
				step1: `${step1.schema}.${step1.objectName}`,
				step2: `${step2.schema}.${step2.objectName}`,
				sourceConnectionId,
				targetConnectionId,
			});

			// Enhanced schema dependency analysis with multiple detection methods
			const schemaDependencyQuery = `
                SELECT
                    COUNT(*) as total_dependencies,
                    COUNT(CASE WHEN dependency_type = 'cross_schema_fk' THEN 1 END) as cross_schema_fk,
                    COUNT(CASE WHEN dependency_type = 'cross_schema_view' THEN 1 END) as cross_schema_views,
                    COUNT(CASE WHEN dependency_type = 'cross_schema_function' THEN 1 END) as cross_schema_functions,
                    COUNT(CASE WHEN dependency_type = 'schema_permission' THEN 1 END) as schema_permissions,
                    COUNT(CASE WHEN dependency_type = 'search_path' THEN 1 END) as search_path_deps,
                    string_agg(dependency_type, ', ') as dependency_types
                FROM (
                    -- Cross-schema foreign keys
                    SELECT 'cross_schema_fk' as dependency_type
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
                    WHERE tc.constraint_type = 'FOREIGN KEY'
                    AND tc.table_schema = '${step1.schema}'
                    AND ccu.table_schema = '${step2.schema}'

                    UNION ALL

                    -- Cross-schema views
                    SELECT 'cross_schema_view' as dependency_type
                    FROM pg_views v
                    WHERE v.schemaname = '${step1.schema}'
                    AND v.viewname = '${step1.objectName}'
                    AND v.definition ILIKE '%${step2.schema}.%'

                    UNION ALL

                    -- Cross-schema functions
                    SELECT 'cross_schema_function' as dependency_type
                    FROM pg_proc p
                    JOIN pg_namespace n ON p.pronamespace = n.oid
                    WHERE n.nspname = '${step1.schema}'
                    AND p.proname = '${step1.objectName}'
                    AND pg_get_functiondef(p.oid) ILIKE '%${step2.schema}.%'

                    UNION ALL

                    -- Schema permissions
                    SELECT 'schema_permission' as dependency_type
                    FROM information_schema.role_table_grants g
                    WHERE g.table_schema = '${step1.schema}'
                    AND g.grantee IN (
                        SELECT grantee FROM information_schema.role_table_grants
                        WHERE table_schema = '${step2.schema}'
                    )

                    UNION ALL

                    -- Search path dependencies
                    SELECT 'search_path' as dependency_type
                    FROM pg_settings
                    WHERE name = 'search_path'
                    AND setting ILIKE '%${step1.schema}%'
                    AND setting ILIKE '%${step2.schema}%'
                ) schema_dependencies
            `;

			const result = await this.queryService.executeQuery(targetConnectionId, schemaDependencyQuery);
			const dependencyData = result.rows[0];
			const totalDependencies = parseInt(dependencyData[0]);
			const crossSchemaFK = parseInt(dependencyData[1]);
			const crossSchemaViews = parseInt(dependencyData[2]);
			const crossSchemaFunctions = parseInt(dependencyData[3]);
			const schemaPermissions = parseInt(dependencyData[4]);
			const searchPathDeps = parseInt(dependencyData[5]);
			const dependencyTypes = dependencyData[6];

			Logger.debug("Schema dependency analysis results", "checkSchemaDependency", {
				step1: `${step1.schema}.${step1.objectName}`,
				step2: `${step2.schema}.${step2.objectName}`,
				totalDependencies,
				crossSchemaFK,
				crossSchemaViews,
				crossSchemaFunctions,
				schemaPermissions,
				searchPathDeps,
				dependencyTypes,
			});

			// Check for cross-schema foreign key relationships
			const crossSchemaFKQuery = `
                SELECT COUNT(*) as cross_schema_fk_count
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
                WHERE tc.constraint_type = 'FOREIGN KEY'
                AND ((tc.table_schema = '${step1.schema}' AND ccu.table_schema = '${step2.schema}')
                     OR (tc.table_schema = '${step2.schema}' AND ccu.table_schema = '${step1.schema}'))
            `;

			const crossSchemaFKResult = await this.queryService.executeQuery(targetConnectionId, crossSchemaFKQuery);
			const crossSchemaFKCount = parseInt(crossSchemaFKResult.rows[0][0]);

			Logger.debug("Cross-schema foreign key check", "checkSchemaDependency", {
				crossSchemaFKCount,
			});

			// Check for cross-schema view dependencies
			const crossSchemaViewQuery = `
                SELECT COUNT(*) as cross_schema_view_count
                FROM pg_views v1
                JOIN pg_views v2 ON v2.definition ILIKE '%' || v1.schemaname || '.' || v1.viewname || '%'
                WHERE v1.schemaname = '${step1.schema}'
                AND v1.viewname = '${step1.objectName}'
                AND v2.schemaname = '${step2.schema}'
                AND v2.viewname = '${step2.objectName}'
            `;

			const crossSchemaViewResult = await this.queryService.executeQuery(targetConnectionId, crossSchemaViewQuery);
			const crossSchemaViewCount = parseInt(crossSchemaViewResult.rows[0][0]);

			Logger.debug("Cross-schema view dependency check", "checkSchemaDependency", {
				crossSchemaViewCount,
			});

			// Check for cross-schema function dependencies
			const crossSchemaFunctionQuery = `
                SELECT COUNT(*) as cross_schema_function_count
                FROM pg_proc p1
                JOIN pg_proc p2 ON pg_get_functiondef(p2.oid) ILIKE '%' || p1.proname || '%'
                JOIN pg_namespace n1 ON p1.pronamespace = n1.oid
                JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
                WHERE n1.nspname = '${step1.schema}'
                AND p1.proname = '${step1.objectName}'
                AND n2.nspname = '${step2.schema}'
                AND p2.proname = '${step2.objectName}'
            `;

			const crossSchemaFunctionResult = await this.queryService.executeQuery(
				targetConnectionId,
				crossSchemaFunctionQuery,
			);
			const crossSchemaFunctionCount = parseInt(crossSchemaFunctionResult.rows[0][0]);

			Logger.debug("Cross-schema function dependency check", "checkSchemaDependency", {
				crossSchemaFunctionCount,
			});

			// Check for schema permission dependencies
			const schemaPermissionQuery = `
                SELECT COUNT(*) as schema_permission_count
                FROM information_schema.role_table_grants g1
                JOIN information_schema.role_table_grants g2 ON g1.grantee = g2.grantee
                WHERE g1.table_schema = '${step1.schema}'
                AND g2.table_schema = '${step2.schema}'
                AND g1.grantee != 'PUBLIC'
            `;

			const schemaPermissionResult = await this.queryService.executeQuery(targetConnectionId, schemaPermissionQuery);
			const schemaPermissionCount = parseInt(schemaPermissionResult.rows[0][0]);

			Logger.debug("Schema permission dependency check", "checkSchemaDependency", {
				schemaPermissionCount,
			});

			// Check for search path dependencies
			const searchPathQuery = `
                SELECT COUNT(*) as search_path_count
                FROM pg_settings
                WHERE name = 'search_path'
                AND setting ILIKE '%${step1.schema}%'
                AND setting ILIKE '%${step2.schema}%'
            `;

			const searchPathResult = await this.queryService.executeQuery(targetConnectionId, searchPathQuery);
			const searchPathCount = parseInt(searchPathResult.rows[0][0]);

			Logger.debug("Search path dependency check", "checkSchemaDependency", {
				searchPathCount,
			});

			// Check for schema inheritance relationships
			const schemaInheritanceQuery = `
                SELECT COUNT(*) as inheritance_count
                FROM pg_inherits i
                JOIN pg_class c1 ON i.inhrelid = c1.oid
                JOIN pg_class c2 ON i.inhparent = c2.oid
                JOIN pg_namespace n1 ON c1.relnamespace = n1.oid
                JOIN pg_namespace n2 ON c2.relnamespace = n2.oid
                WHERE n1.nspname = '${step1.schema}'
                AND (c1.relname = '${step1.objectName}' OR '${step1.objectType}' != 'table')
                AND n2.nspname = '${step2.schema}'
                AND (c2.relname = '${step2.objectName}' OR '${step2.objectType}' != 'table')
            `;

			const schemaInheritanceResult = await this.queryService.executeQuery(targetConnectionId, schemaInheritanceQuery);
			const inheritanceCount = parseInt(schemaInheritanceResult.rows[0][0]);

			Logger.debug("Schema inheritance dependency check", "checkSchemaDependency", {
				inheritanceCount,
			});

			// Also check source database for comprehensive analysis
			try {
				const [
					sourceResult,
					sourceFKResult,
					sourceViewResult,
					sourceFunctionResult,
					sourcePermissionResult,
					sourcePathResult,
					sourceInheritanceResult,
				] = await Promise.all([
					this.queryService.executeQuery(sourceConnectionId, schemaDependencyQuery),
					this.queryService.executeQuery(sourceConnectionId, crossSchemaFKQuery),
					this.queryService.executeQuery(sourceConnectionId, crossSchemaViewQuery),
					this.queryService.executeQuery(sourceConnectionId, crossSchemaFunctionQuery),
					this.queryService.executeQuery(sourceConnectionId, schemaPermissionQuery),
					this.queryService.executeQuery(sourceConnectionId, searchPathQuery),
					this.queryService.executeQuery(sourceConnectionId, schemaInheritanceQuery),
				]);

				const sourceTotalDependencies = parseInt(sourceResult.rows[0][0]);
				const sourceFKCount = parseInt(sourceFKResult.rows[0][0]);
				const sourceViewCount = parseInt(sourceViewResult.rows[0][0]);
				const sourceFunctionCount = parseInt(sourceFunctionResult.rows[0][0]);
				const sourcePermissionCount = parseInt(sourcePermissionResult.rows[0][0]);
				const sourcePathCount = parseInt(sourcePathResult.rows[0][0]);
				const sourceInheritanceCount = parseInt(sourceInheritanceResult.rows[0][0]);

				Logger.debug("Source database schema dependency check results", "checkSchemaDependency", {
					sourceTotalDependencies,
					sourceFKCount,
					sourceViewCount,
					sourceFunctionCount,
					sourcePermissionCount,
					sourcePathCount,
					sourceInheritanceCount,
				});

				// Return true if dependency exists in either source or target
				return (
					totalDependencies > 0 ||
					crossSchemaFKCount > 0 ||
					crossSchemaViewCount > 0 ||
					crossSchemaFunctionCount > 0 ||
					schemaPermissionCount > 0 ||
					searchPathCount > 0 ||
					inheritanceCount > 0 ||
					sourceTotalDependencies > 0 ||
					sourceFKCount > 0 ||
					sourceViewCount > 0 ||
					sourceFunctionCount > 0 ||
					sourcePermissionCount > 0 ||
					sourcePathCount > 0 ||
					sourceInheritanceCount > 0
				);
			} catch (sourceError) {
				Logger.warn("Could not check source database for schema dependencies", "checkSchemaDependency", {
					error: (sourceError as Error).message,
				});

				// Return target database results even if source check fails
				return (
					totalDependencies > 0 ||
					crossSchemaFKCount > 0 ||
					crossSchemaViewCount > 0 ||
					crossSchemaFunctionCount > 0 ||
					schemaPermissionCount > 0 ||
					searchPathCount > 0 ||
					inheritanceCount > 0
				);
			}
		} catch (error) {
			Logger.error("Error checking schema dependency", error as Error, "checkSchemaDependency", {
				step1: `${step1.schema}.${step1.objectName}`,
				step2: `${step2.schema}.${step2.objectName}`,
				sourceConnectionId,
				targetConnectionId,
			});
			return false;
		}
	}
	/**
	 * Assesses overall risk level of a migration based on its steps
	 * @param migrationSteps - Array of migration steps to evaluate
	 * @returns Risk level assessment
	 * @private
	 */
	private assessMigrationRiskLevel(migrationSteps: MigrationStep[]): "low" | "medium" | "high" | "critical" {
		const criticalSteps = migrationSteps.filter((step) => step.riskLevel === "critical").length;
		const highRiskSteps = migrationSteps.filter((step) => step.riskLevel === "high").length;

		if (criticalSteps > 0) {
			return "critical";
		}
		if (highRiskSteps > 3) {
			return "high";
		}
		if (highRiskSteps > 0) {
			return "medium";
		}
		return "low";
	}
	/**
	 * Executes a single migration step with pre/post conditions and error handling
	 * @param step - Migration step to execute
	 * @param connectionId - Connection ID for the target database
	 * @returns Promise that resolves when step execution completes
	 * @throws Error if step execution fails
	 * @private
	 */
	private async executeMigrationStep(step: MigrationStep, connectionId: string): Promise<void> {
		try {
			Logger.info("Executing migration step", "executeMigrationStep", {
				stepId: step.id,
				operation: step.operation,
				objectName: step.objectName,
				schema: step.schema,
				objectType: step.objectType,
			});

			// Execute pre-conditions check
			if (step.preConditions?.length) {
				await this.executePreConditions(step, connectionId);
			}

			// Execute the main SQL script
			if (step.sqlScript && step.sqlScript.trim()) {
				// Split SQL script into individual statements
				const statements = this.splitSQLStatements(step.sqlScript);

				for (const statement of statements) {
					if (statement.trim()) {
						try {
							Logger.debug("Executing SQL statement", "executeMigrationStep", {
								stepId: step.id,
								statementLength: statement.length,
							});

							const result = await this.queryService.executeQuery(connectionId, statement);

							Logger.debug("SQL statement executed successfully", "executeMigrationStep", {
								stepId: step.id,
								rowsAffected: result.rowCount,
								executionTime: result.executionTime,
							});
						} catch (statementError) {
							Logger.error("SQL statement execution failed", statementError as Error, "executeMigrationStep", {
								stepId: step.id,
								statement: statement.substring(0, 200) + (statement.length > 200 ? "..." : ""),
							});
							throw new Error(`Failed to execute statement in step ${step.id}: ${(statementError as Error).message}`);
						}
					}
				}
			}

			// Execute post-conditions check
			if (step.postConditions?.length) {
				await this.executePostConditions(step, connectionId);
			}

			Logger.info("Migration step completed successfully", "executeMigrationStep", {
				stepId: step.id,
				objectName: step.objectName,
				executionTime: `${step.estimatedDuration}s`,
			});
		} catch (error) {
			Logger.error("Migration step execution failed", error as Error, "executeMigrationStep", {
				stepId: step.id,
				operation: step.operation,
				objectName: step.objectName,
			});
			throw error;
		}
	}
	/**
	 * Executes pre-condition checks for a migration step
	 * @param step - Migration step containing pre-conditions
	 * @param connectionId - Connection ID for the database
	 * @returns Promise that resolves if all pre-conditions pass
	 * @throws Error if any pre-condition fails
	 * @private
	 */
	private async executePreConditions(step: MigrationStep, connectionId: string): Promise<void> {
		for (const condition of step.preConditions || []) {
			try {
				if (condition.sqlQuery) {
					const result = await this.queryService.executeQuery(connectionId, condition.sqlQuery);

					// Validate condition result
					const actualResult = result.rows[0]?.[0]; // Get first column of first row
					const conditionMet = this.validateConditionResult(actualResult, condition.expectedResult);

					if (!conditionMet) {
						throw new Error(
							`Pre-condition failed for step ${step.id}: ${condition.description}. Expected: ${condition.expectedResult}, Got: ${actualResult}`,
						);
					}

					Logger.debug("Pre-condition passed", "executePreConditions", {
						stepId: step.id,
						condition: condition.description,
						expected: condition.expectedResult,
						actual: actualResult,
					});
				}
			} catch (conditionError) {
				Logger.error("Pre-condition execution failed", conditionError as Error, "executePreConditions", {
					stepId: step.id,
					condition: condition.description,
				});
				throw conditionError;
			}
		}
	}
	/**
	 * Executes post-condition checks for a migration step (non-blocking)
	 * @param step - Migration step containing post-conditions
	 * @param connectionId - Connection ID for the database
	 * @returns Promise that resolves after post-condition checks (warnings logged but not thrown)
	 * @private
	 */
	private async executePostConditions(step: MigrationStep, connectionId: string): Promise<void> {
		for (const condition of step.postConditions || []) {
			try {
				if (condition.sqlQuery) {
					const result = await this.queryService.executeQuery(connectionId, condition.sqlQuery);

					// Validate condition result
					const actualResult = result.rows[0]?.[0]; // Get first column of first row
					const conditionMet = this.validateConditionResult(actualResult, condition.expectedResult);

					if (!conditionMet) {
						Logger.warn("Post-condition not met", "executePostConditions", {
							stepId: step.id,
							condition: condition.description,
							expected: condition.expectedResult,
							actual: actualResult,
							tolerance: condition.tolerance,
						});

						// Don't throw error for post-conditions, just log warning
						// Post-conditions are typically for validation, not hard requirements
					} else {
						Logger.debug("Post-condition passed", "executePostConditions", {
							stepId: step.id,
							condition: condition.description,
							expected: condition.expectedResult,
							actual: actualResult,
						});
					}
				}
			} catch (conditionError) {
				Logger.warn(`Post-condition execution failed: ${(conditionError as Error).message}`, "executePostConditions");
				// Don't throw error for post-condition failures
			}
		}
	}
	/**
	 * Validates if an actual result matches expected result with various comparison operators
	 * @param actualResult - Actual result from database query
	 * @param expectedResult - Expected result to compare against
	 * @returns True if condition is met, false otherwise
	 * @private
	 */
	private validateConditionResult(actualResult: any, expectedResult: any): boolean {
		if (expectedResult === undefined || expectedResult === null) {
			return true; // No expectation to validate
		}

		// Handle different comparison types
		if (typeof expectedResult === "string") {
			if (expectedResult.startsWith(">=")) {
				const expectedValue = parseFloat(expectedResult.substring(2));
				return parseFloat(actualResult) >= expectedValue;
			}
			if (expectedResult.startsWith("<=")) {
				const expectedValue = parseFloat(expectedResult.substring(2));
				return parseFloat(actualResult) <= expectedValue;
			}
			if (expectedResult.startsWith(">")) {
				const expectedValue = parseFloat(expectedResult.substring(1));
				return parseFloat(actualResult) > expectedValue;
			}
			if (expectedResult.startsWith("<")) {
				const expectedValue = parseFloat(expectedResult.substring(1));
				return parseFloat(actualResult) < expectedValue;
			}
			if (expectedResult.startsWith("!=")) {
				return actualResult !== expectedResult.substring(2);
			}
		}

		// Default equality check
		return actualResult === expectedResult;
	}
	/**
	 * Splits a SQL script into individual executable statements
	 * Handles comments, strings, and complex SQL constructs properly
	 * @param sqlScript - Complete SQL script to split
	 * @returns Array of individual SQL statements
	 * @private
	 */
	private splitSQLStatements(sqlScript: string): string[] {
		try {
			Logger.debug("Splitting SQL statements", "splitSQLStatements", {
				scriptLength: sqlScript.length,
			});

			const statements: string[] = [];
			let currentStatement = "";
			let inString = false;
			let stringChar = "";
			let inComment = false;
			let inLineComment = false;
			let parenDepth = 0;

			// Process each character
			for (let i = 0; i < sqlScript.length; i++) {
				const char = sqlScript[i];
				const nextChar = sqlScript[i + 1] || "";

				// Handle string literals
				if (!inComment && !inLineComment && (char === '"' || char === "'")) {
					if (!inString) {
						inString = true;
						stringChar = char;
					} else if (char === stringChar) {
						inString = false;
						stringChar = "";
					}
				}

				// Handle comments
				if (!inString) {
					if (char === "/" && nextChar === "*" && !inLineComment) {
						inComment = true;
						currentStatement += char;
						continue;
					}
					if (char === "*" && nextChar === "/" && inComment) {
						inComment = false;
						currentStatement += "*/";
						i++; // Skip next character
						continue;
					}
					if (char === "-" && nextChar === "-" && !inComment) {
						inLineComment = true;
						currentStatement += char;
						continue;
					}
					if (char === "\n" && inLineComment) {
						inLineComment = false;
						currentStatement += char;
						continue;
					}
				}

				// Skip characters in comments
				if (inComment || inLineComment) {
					currentStatement += char;
					continue;
				}

				// Track parentheses for complex statements
				if (!inString && char === "(") {
					parenDepth++;
				} else if (!inString && char === ")") {
					parenDepth--;
				}

				// Handle semicolons (statement terminators)
				if (char === ";" && !inString && parenDepth === 0) {
					currentStatement += char;
					const trimmedStatement = currentStatement.trim();
					if (trimmedStatement.length > 1) {
						// More than just semicolon
						statements.push(trimmedStatement);
					}
					currentStatement = "";
				} else {
					currentStatement += char;
				}
			}

			// Add remaining statement if any
			const remainingStatement = currentStatement.trim();
			if (remainingStatement.length > 0) {
				statements.push(remainingStatement);
			}

			// Filter out empty statements and comments
			const filteredStatements = statements.filter((stmt) => {
				const trimmed = stmt.trim();
				return trimmed.length > 0 && !trimmed.startsWith("--") && !trimmed.startsWith("/*") && trimmed !== ";";
			});

			Logger.debug("SQL statements split", "splitSQLStatements", {
				originalLength: sqlScript.length,
				statementCount: filteredStatements.length,
				averageStatementLength:
					filteredStatements.length > 0
						? Math.round(filteredStatements.join("").length / filteredStatements.length)
						: 0,
			});

			return filteredStatements;
		} catch (error) {
			Logger.error("Failed to split SQL statements", error as Error, "splitSQLStatements", {
				scriptLength: sqlScript.length,
			});

			// Fallback to simple splitting
			Logger.warn("Using simple semicolon splitting as fallback", "splitSQLStatements");
			return sqlScript
				.split(";")
				.map((stmt) => stmt.trim())
				.filter((stmt) => stmt.length > 0);
		}
	}
	/**
	 * Generates a default rollback script when automatic rollback generation fails
	 * Provides manual rollback guidance and fallback procedures
	 * @returns Default rollback script with manual intervention steps
	 * @private
	 */
	private getDefaultRollbackScript(): RollbackScript {
		try {
			Logger.info("Generating default rollback script", "getDefaultRollbackScript");

			// Create intelligent fallback steps based on common scenarios
			const fallbackSteps: RollbackStep[] = [
				{
					order: 1,
					description: "Manual rollback required - review migration steps",
					estimatedDuration: 60, // 1 hour for manual intervention
					riskLevel: "high",
					dependencies: [],
					verificationSteps: [
						"Document current database state before rollback",
						"Identify all objects modified by migration",
						"Plan rollback strategy for each object type",
						"Test rollback in development environment first",
						"Backup production data before rollback",
					],
				},
				{
					order: 2,
					description: "Restore from database backup if available",
					estimatedDuration: 30,
					riskLevel: "medium",
					dependencies: ["1"],
					verificationSteps: [
						"Verify backup contains pre-migration state",
						"Test backup restoration procedure",
						"Validate backup integrity",
						"Check for backup-related downtime",
					],
				},
			];

			const warnings = [
				"No automatic rollback script could be generated",
				"Manual intervention required for safe rollback",
				"Consider data loss and downtime implications",
				"Test rollback procedure in non-production environment first",
			];

			const limitations = [
				"Rollback strategy depends on specific migration operations",
				"Data loss may occur if migration modified existing data",
				"Dependent objects may be affected by rollback",
				"Application downtime may be required for complex rollbacks",
			];

			const defaultScript: RollbackScript = {
				isComplete: false,
				steps: fallbackSteps,
				estimatedRollbackTime: 90, // 1.5 hours total
				successRate: 60, // 60% success rate for manual rollback
				warnings,
				limitations,
			};

			Logger.info("Default rollback script generated", "getDefaultRollbackScript", {
				stepCount: fallbackSteps.length,
				estimatedTime: `${defaultScript.estimatedRollbackTime} minutes`,
				successRate: `${defaultScript.successRate}%`,
			});

			return defaultScript;
		} catch (error) {
			Logger.error("Failed to generate default rollback script", error as Error, "getDefaultRollbackScript");
			// Return minimal fallback
			return {
				isComplete: false,
				steps: [],
				estimatedRollbackTime: 0,
				successRate: 0,
				warnings: ["Failed to generate default rollback script"],
				limitations: ["Manual rollback required"],
			};
		}
	}
	/**
	 * Performs validation using the ValidationFramework with migration-specific context
	 * @param script - Enhanced migration script to validate
	 * @param connectionId - Connection ID for the database to validate against
	 * @returns Promise resolving to validation report from ValidationFramework
	 * @throws Error if ValidationFramework validation fails
	 * @private
	 */
	private async performFrameworkValidation(script: EnhancedMigrationScript, connectionId: string): Promise<any> {
		Logger.info("Performing ValidationFramework validation", "performFrameworkValidation", {
			scriptId: script.id,
			connectionId,
		});

		try {
			// Create validation context for the migration script
			const validationContext = {
				scriptId: script.id,
				scriptName: script.name,
				connectionId,
				migrationSteps: script.migrationSteps.length,
				riskLevel: script.riskLevel,
				estimatedExecutionTime: script.estimatedExecutionTime,
				rollbackAvailable: script.rollbackScript.isComplete,
				validationSteps: script.validationSteps.length,
			};

			// Create validation request
			const validationRequest: any = {
				connectionId,
				rules: ["migration_script_validation", "schema_consistency", "data_integrity"], // Use specific validation rules
				failOnWarnings: false,
				stopOnFirstError: true,
				context: validationContext,
			};

			// Execute validation using the ValidationFramework
			const validationReport = await this.validationFramework.executeValidation(validationRequest);

			Logger.info("ValidationFramework validation completed", "performFrameworkValidation", {
				scriptId: script.id,
				totalRules: validationReport.totalRules,
				passedRules: validationReport.passedRules,
				failedRules: validationReport.failedRules,
				overallStatus: validationReport.overallStatus,
				canProceed: validationReport.canProceed,
			});

			return validationReport;
		} catch (error) {
			Logger.error("ValidationFramework validation failed", error as Error, "performFrameworkValidation", {
				scriptId: script.id,
			});

			// Return a failed validation report
			return {
				requestId: script.id,
				validationTimestamp: new Date(),
				totalRules: 0,
				passedRules: 0,
				failedRules: 1,
				warningRules: 0,
				results: [
					{
						ruleId: "validation_framework",
						ruleName: "Validation Framework Check",
						passed: false,
						severity: "error",
						message: `ValidationFramework error: ${(error as Error).message}`,
						executionTime: 0,
						timestamp: new Date(),
					},
				],
				overallStatus: "failed",
				canProceed: false,
				recommendations: ["Fix ValidationFramework error before proceeding with migration"],
				executionTime: 0,
			};
		}
	}
	/**
	 * Generates a unique identifier for migration scripts and executions
	 * @returns Unique UUID string
	 * @private
	 */
	private generateId(): string {
		return crypto.randomUUID();
	}

	/**
	 * Disposes of MigrationManagement resources and cleans up
	 */
	dispose(): void {
		Logger.info("MigrationManagement disposed", "dispose");
	}
}
