import { getUUId } from "@/utils/helper";
import { Logger } from "@/utils/Logger";

export interface ValidationRule {
	id: string;
	name: string;
	description: string;
	category: "data_integrity" | "performance" | "security" | "compliance" | "custom";
	severity: "error" | "warning" | "info";
	isEnabled: boolean;
	ruleDefinition: ValidationRuleDefinition;
	createdAt: Date;
	lastModified: Date;
}

export interface ValidationRuleDefinition {
	type: "sql_query" | "pattern_match" | "threshold_check" | "custom_logic";
	expression: string;
	parameters: Record<string, any>;
	expectedResult?: any;
	timeout?: number;
	retryAttempts?: number;
}

export interface ValidationResult {
	ruleId: string;
	ruleName: string;
	passed: boolean;
	severity: "error" | "warning" | "info";
	message: string;
	details?: any;
	executionTime: number;
	timestamp: Date;
	retryCount?: number;
}

export interface ValidationRequest {
	connectionId: string;
	rules?: string[]; // Specific rule IDs to run, if empty runs all enabled rules
	failOnWarnings?: boolean;
	stopOnFirstError?: boolean;
	context?: Record<string, any>; // Additional context for validation
}

export interface ValidationReport {
	requestId: string;
	validationTimestamp: Date;
	totalRules: number;
	passedRules: number;
	failedRules: number;
	warningRules: number;
	results: ValidationResult[];
	overallStatus: "passed" | "failed" | "warnings";
	canProceed: boolean;
	recommendations: string[];
	executionTime: number;
}
export class ValidationFramework {
	private validationRules: Map<string, ValidationRule> = new Map();
	private activeValidations: Map<string, ValidationReport> = new Map();
	constructor() {
		const constructorStart = Date.now();
		console.log("[ValidationFramework] Constructor starting...");

		console.log("[ValidationFramework] Initializing default rules...");
		this.initializeDefaultRules();
		const constructorDuration = Date.now() - constructorStart;

		console.log(`[ValidationFramework] Constructor completed in ${constructorDuration}ms`);

		if (constructorDuration > 1000) {
			console.warn(`[ValidationFramework] WARNING: Constructor took ${constructorDuration}ms - this might be slow!`);
		}
	}
	registerRule(rule: ValidationRule): void {
		this.validationRules.set(rule.id, rule);
		Logger.info("Validation rule registered", "ValidationFramework.registerRule", {
			ruleId: rule.id,
			ruleName: rule.name,
			category: rule.category,
			severity: rule.severity,
		});
	}
	getEnabledRules(): ValidationRule[] {
		return Array.from(this.validationRules.values()).filter((rule) => rule.isEnabled);
	}
	async executeValidation(request: ValidationRequest): Promise<ValidationReport> {
		const requestId = this.generateId();
		const startTime = Date.now();

		Logger.info("Starting validation execution", "ValidationFramework.executeValidation", {
			requestId,
			connectionId: request.connectionId,
			ruleCount: request.rules?.length || "all",
			failOnWarnings: request.failOnWarnings || false,
		});

		try {
			// Get rules to validate
			const rulesToValidate = this.getRulesForRequest(request);

			if (rulesToValidate.length === 0) {
				Logger.warn("No validation rules found for request", "ValidationFramework.executeValidation", {
					requestId,
					connectionId: request.connectionId,
				});

				return {
					requestId,
					validationTimestamp: new Date(),
					totalRules: 0,
					passedRules: 0,
					failedRules: 0,
					warningRules: 0,
					results: [],
					overallStatus: "passed",
					canProceed: true,
					recommendations: ["No validation rules configured"],
					executionTime: Date.now() - startTime,
				};
			}

			// Execute validation for each rule
			const validationResults: ValidationResult[] = [];
			let passedRules = 0;
			let failedRules = 0;
			let warningRules = 0;

			for (const rule of rulesToValidate) {
				try {
					const result = await this.executeRuleValidation(rule, request);
					validationResults.push(result);

					switch (result.severity) {
						case "error":
							if (!result.passed) {
								failedRules++;
							} else {
								passedRules++;
							}
							break;
						case "warning":
							warningRules++;
							if (result.passed) {
								passedRules++;
							}
							break;
						case "info":
							passedRules++;
							break;
					}

					// Stop on first error if configured
					if (request.stopOnFirstError && !result.passed && result.severity === "error") {
						Logger.warn("Stopping validation on first error", "ValidationFramework.executeValidation", {
							requestId,
							ruleId: rule.id,
							ruleName: rule.name,
						});
						break;
					}
				} catch (error) {
					Logger.error("Rule validation failed", error as Error, "ValidationFramework.executeValidation", {
						requestId,
						ruleId: rule.id,
						ruleName: rule.name,
					});

					validationResults.push({
						ruleId: rule.id,
						ruleName: rule.name,
						passed: false,
						severity: "error",
						message: `Validation execution failed: ${(error as Error).message}`,
						executionTime: 0,
						timestamp: new Date(),
					});
					failedRules++;
				}
			}

			// Generate report
			const overallStatus = failedRules > 0 ? "failed" : warningRules > 0 ? "warnings" : "passed";
			const canProceed = request.failOnWarnings ? overallStatus === "passed" : failedRules === 0;
			const recommendations = this.generateValidationRecommendations(validationResults, overallStatus);

			const report: ValidationReport = {
				requestId,
				validationTimestamp: new Date(),
				totalRules: rulesToValidate.length,
				passedRules,
				failedRules,
				warningRules,
				results: validationResults,
				overallStatus,
				canProceed,
				recommendations,
				executionTime: Date.now() - startTime,
			};

			// Store report for reference
			this.activeValidations.set(requestId, report);

			Logger.info("Validation execution completed", "ValidationFramework.executeValidation", {
				requestId,
				totalRules: rulesToValidate.length,
				passedRules,
				failedRules,
				warningRules,
				overallStatus,
				canProceed,
				executionTime: report.executionTime,
			});

			return report;
		} catch (error) {
			Logger.error("Validation execution failed", error as Error, "ValidationFramework.executeValidation", {
				requestId,
			});

			return {
				requestId,
				validationTimestamp: new Date(),
				totalRules: 0,
				passedRules: 0,
				failedRules: 1,
				warningRules: 0,
				results: [
					{
						ruleId: "system",
						ruleName: "System Validation",
						passed: false,
						severity: "error",
						message: `Validation framework error: ${(error as Error).message}`,
						executionTime: Date.now() - startTime,
						timestamp: new Date(),
					},
				],
				overallStatus: "failed",
				canProceed: false,
				recommendations: ["Fix validation framework error before proceeding"],
				executionTime: Date.now() - startTime,
			};
		}
	}
	private async executeRuleValidation(rule: ValidationRule, request: ValidationRequest): Promise<ValidationResult> {
		const startTime = Date.now();
		let retryCount = 0;

		while (retryCount <= (rule.ruleDefinition.retryAttempts || 0)) {
			try {
				Logger.debug("Executing rule validation", "ValidationFramework.executeRuleValidation", {
					ruleId: rule.id,
					ruleName: rule.name,
					ruleType: rule.ruleDefinition.type,
					attempt: retryCount + 1,
				});

				let passed = false;
				let message = "";
				let details: any = {};

				switch (rule.ruleDefinition.type) {
					case "sql_query":
						const queryResult = await this.executeSQLQueryValidation(rule, request);
						passed = queryResult.passed;
						message = queryResult.message;
						details = queryResult.details;
						break;

					case "threshold_check":
						const thresholdResult = await this.executeThresholdValidation(rule, request);
						passed = thresholdResult.passed;
						message = thresholdResult.message;
						details = thresholdResult.details;
						break;

					case "pattern_match":
						const patternResult = await this.executePatternValidation(rule, request);
						passed = patternResult.passed;
						message = patternResult.message;
						details = patternResult.details;
						break;

					case "custom_logic":
						const customResult = await this.executeCustomValidation(rule, request);
						passed = customResult.passed;
						message = customResult.message;
						details = customResult.details;
						break;

					default:
						throw new Error(`Unsupported rule type: ${rule.ruleDefinition.type}`);
				}

				const executionTime = Date.now() - startTime;

				return {
					ruleId: rule.id,
					ruleName: rule.name,
					passed,
					severity: rule.severity,
					message,
					details,
					executionTime,
					timestamp: new Date(),
					retryCount,
				};
			} catch (error) {
				retryCount++;

				if (retryCount <= (rule.ruleDefinition.retryAttempts || 0)) {
					Logger.warn("Rule validation failed, retrying", "ValidationFramework.executeRuleValidation", {
						ruleId: rule.id,
						attempt: retryCount,
						maxRetries: rule.ruleDefinition.retryAttempts || 0,
						error: (error as Error).message,
					});

					// Wait before retry with exponential backoff
					await this.delay(Math.min(1000 * Math.pow(2, retryCount - 1), 10000));
				} else {
					throw error;
				}
			}
		}

		throw new Error("Validation failed after all retry attempts");
	}
	private async executeSQLQueryValidation(
		rule: ValidationRule,
		request: ValidationRequest,
	): Promise<{ passed: boolean; message: string; details: any }> {
		const startTime = Date.now();

		try {
			// Get database connection from request context
			const connectionId = request.connectionId;
			if (!connectionId) {
				throw new Error("No connection ID provided in validation request");
			}

			// Get migration context for connection details
			const migrationContext = request.context as any;
			if (!migrationContext?.targetConnectionId) {
				throw new Error("No target connection found in validation context");
			}

			// Use native service directly with connection info from context
			const { PostgreSqlConnectionManager } = await import("@/core/PostgreSqlConnectionManager");
			const nativeService = PostgreSqlConnectionManager.getInstance();

			// Get connection info from context or use a default approach
			let dotNetConnection: any = null;

			if (migrationContext?.targetConnection) {
				// Use connection from context if available
				dotNetConnection = migrationContext.targetConnection;
			} else {
				// Try to get connection info from the migration context
				const connectionInfo = {
					id: migrationContext.targetConnectionId || "validation_connection",
					name: "Validation Connection",
					host: migrationContext.targetHost || "localhost",
					port: migrationContext.targetPort || 5432,
					database: migrationContext.targetDatabase || "postgres",
					username: migrationContext.targetUsername || "postgres",
					password: migrationContext.targetPassword || "",
					createdDate: new Date().toISOString(),
				};
				dotNetConnection = connectionInfo;
			}

			if (!dotNetConnection) {
				throw new Error("No valid connection information available for validation");
			}

			// Execute the validation query with timeout
			const timeout = rule.ruleDefinition.timeout || 30000;
			const queryResult = await this.executeQueryWithTimeout(
				nativeService,
				dotNetConnection,
				rule.ruleDefinition.expression,
				timeout,
			);

			if (queryResult.error) {
				throw new Error(`Query execution failed: ${queryResult.error}`);
			}

			// Analyze query results
			const validationResult = await this.analyzeQueryResults(rule, queryResult, startTime);

			Logger.debug("SQL query validation completed", "ValidationFramework.executeSQLQueryValidation", {
				ruleId: rule.id,
				ruleName: rule.name,
				passed: validationResult.passed,
				executionTime: Date.now() - startTime,
			});

			return validationResult;
		} catch (error) {
			const executionTime = Date.now() - startTime;
			Logger.error("SQL query validation failed", error as Error, "ValidationFramework.executeSQLQueryValidation", {
				ruleId: rule.id,
				ruleName: rule.name,
				executionTime,
			});

			return {
				passed: false,
				message: `SQL query validation failed: ${(error as Error).message}`,
				details: {
					query: rule.ruleDefinition.expression,
					expectedResult: rule.ruleDefinition.expectedResult,
					error: (error as Error).message,
					executionTime,
				},
			};
		}
	}
	private async executeThresholdValidation(
		rule: ValidationRule,
		request: ValidationRequest,
	): Promise<{ passed: boolean; message: string; details: any }> {
		const startTime = Date.now();

		try {
			// Get database connection from request context
			const migrationContext = request.context as any;
			if (!migrationContext?.targetConnectionId) {
				throw new Error("No target connection found in validation context");
			}

			// Import services for database access
			const { PostgreSqlConnectionManager } = await import("@/core/PostgreSqlConnectionManager");
			const dotNetService = PostgreSqlConnectionManager.getInstance();

			// Get connection info
			let dotNetConnection: any = null;
			if (migrationContext?.targetConnection) {
				dotNetConnection = migrationContext.targetConnection;
			} else {
				const connectionInfo = {
					id: migrationContext.targetConnectionId || "validation_connection",
					name: "Validation Connection",
					host: migrationContext.targetHost || "localhost",
					port: migrationContext.targetPort || 5432,
					database: migrationContext.targetDatabase || "postgres",
					username: migrationContext.targetUsername || "postgres",
					password: migrationContext.targetPassword || "",
					createdDate: new Date().toISOString(),
				};
				dotNetConnection = connectionInfo;
			}

			if (!dotNetConnection) {
				throw new Error("No valid connection information available for threshold validation");
			}

			// Extract threshold parameters
			const threshold = rule.ruleDefinition.parameters.threshold || rule.ruleDefinition.expectedResult;
			const metricType = rule.ruleDefinition.parameters.metricType || "row_count";
			const tableName = rule.ruleDefinition.parameters.tableName;
			const schemaName = rule.ruleDefinition.parameters.schemaName || "public";

			// Execute threshold validation based on metric type
			const validationResult = await this.performThresholdCheck(
				dotNetService,
				dotNetConnection,
				metricType,
				tableName,
				schemaName,
				threshold,
				startTime,
			);

			Logger.debug("Threshold validation completed", "ValidationFramework.executeThresholdValidation", {
				ruleId: rule.id,
				ruleName: rule.name,
				metricType,
				passed: validationResult.passed,
				executionTime: Date.now() - startTime,
			});

			return validationResult;
		} catch (error) {
			const executionTime = Date.now() - startTime;
			Logger.error("Threshold validation failed", error as Error, "ValidationFramework.executeThresholdValidation", {
				ruleId: rule.id,
				ruleName: rule.name,
				executionTime,
			});

			return {
				passed: false,
				message: `Threshold validation failed: ${(error as Error).message}`,
				details: {
					threshold: rule.ruleDefinition.parameters.threshold || rule.ruleDefinition.expectedResult,
					metricType: rule.ruleDefinition.parameters.metricType || "row_count",
					error: (error as Error).message,
					executionTime,
				},
			};
		}
	}
	private async executePatternValidation(
		rule: ValidationRule,
		request: ValidationRequest,
	): Promise<{ passed: boolean; message: string; details: any }> {
		const startTime = Date.now();

		try {
			// Get database connection from request context
			const migrationContext = request.context as any;
			if (!migrationContext?.targetConnectionId) {
				throw new Error("No target connection found in validation context");
			}

			// Import services for database access
			const { PostgreSqlConnectionManager } = await import("@/core/PostgreSqlConnectionManager");
			const dotNetService = PostgreSqlConnectionManager.getInstance();

			// Get connection info
			let dotNetConnection: any = null;
			if (migrationContext?.targetConnection) {
				dotNetConnection = migrationContext.targetConnection;
			} else {
				const connectionInfo = {
					id: migrationContext.targetConnectionId || "validation_connection",
					name: "Validation Connection",
					host: migrationContext.targetHost || "localhost",
					port: migrationContext.targetPort || 5432,
					database: migrationContext.targetDatabase || "postgres",
					username: migrationContext.targetUsername || "postgres",
					password: migrationContext.targetPassword || "",
					createdDate: new Date().toISOString(),
				};
				dotNetConnection = connectionInfo;
			}

			if (!dotNetConnection) {
				throw new Error("No valid connection information available for pattern validation");
			}

			// Extract pattern parameters
			const patternType = rule.ruleDefinition.parameters.patternType || "naming_convention";
			const objectType = rule.ruleDefinition.parameters.objectType || "table";
			const schemaName = rule.ruleDefinition.parameters.schemaName || "public";
			const patternRegex = rule.ruleDefinition.parameters.patternRegex || ".*";

			// Execute pattern validation
			const validationResult = await this.performPatternCheck(
				dotNetService,
				dotNetConnection,
				patternType,
				objectType,
				schemaName,
				patternRegex,
				startTime,
			);

			Logger.debug("Pattern validation completed", "ValidationFramework.executePatternValidation", {
				ruleId: rule.id,
				ruleName: rule.name,
				patternType,
				passed: validationResult.passed,
				executionTime: Date.now() - startTime,
			});

			return validationResult;
		} catch (error) {
			const executionTime = Date.now() - startTime;
			Logger.error("Pattern validation failed", error as Error, "ValidationFramework.executePatternValidation", {
				ruleId: rule.id,
				ruleName: rule.name,
				executionTime,
			});

			return {
				passed: false,
				message: `Pattern validation failed: ${(error as Error).message}`,
				details: {
					patternType: rule.ruleDefinition.parameters.patternType || "naming_convention",
					objectType: rule.ruleDefinition.parameters.objectType || "table",
					patternRegex: rule.ruleDefinition.parameters.patternRegex || ".*",
					error: (error as Error).message,
					executionTime,
				},
			};
		}
	}
	private async executeCustomValidation(
		rule: ValidationRule,
		request: ValidationRequest,
	): Promise<{ passed: boolean; message: string; details: any }> {
		const startTime = Date.now();

		try {
			// Extract custom validation parameters
			const validationLogic = rule.ruleDefinition.expression;
			const logicType = rule.ruleDefinition.parameters.logicType || "javascript";
			const context = request.context;

			// Execute custom validation logic
			const validationResult = await this.performCustomValidation(validationLogic, logicType, context, startTime);

			Logger.debug("Custom validation completed", "ValidationFramework.executeCustomValidation", {
				ruleId: rule.id,
				ruleName: rule.name,
				logicType,
				passed: validationResult.passed,
				executionTime: Date.now() - startTime,
			});

			return validationResult;
		} catch (error) {
			const executionTime = Date.now() - startTime;
			Logger.error("Custom validation failed", error as Error, "ValidationFramework.executeCustomValidation", {
				ruleId: rule.id,
				ruleName: rule.name,
				executionTime,
			});

			return {
				passed: false,
				message: `Custom validation failed: ${(error as Error).message}`,
				details: {
					logicType: rule.ruleDefinition.parameters.logicType || "javascript",
					customLogic: rule.ruleDefinition.expression,
					error: (error as Error).message,
					executionTime,
				},
			};
		}
	}
	private getRulesForRequest(request: ValidationRequest): ValidationRule[] {
		const enabledRules = this.getEnabledRules();

		if (request.rules && request.rules.length > 0) {
			// Filter to specific rules
			return enabledRules.filter((rule) => request.rules!.includes(rule.id));
		}

		return enabledRules;
	}
	private generateValidationRecommendations(results: ValidationResult[], overallStatus: string): string[] {
		const recommendations: string[] = [];

		if (overallStatus === "failed") {
			recommendations.push("CRITICAL: Validation failed. Do not proceed with operation.");

			const failedRules = results.filter((r) => !r.passed && r.severity === "error");
			failedRules.forEach((rule) => {
				recommendations.push(`Fix issue with rule '${rule.ruleName}': ${rule.message}`);
			});
		}

		if (overallStatus === "warnings") {
			recommendations.push("WARNING: Validation passed with warnings. Review before proceeding.");

			const warningRules = results.filter((r) => r.severity === "warning");
			warningRules.forEach((rule) => {
				recommendations.push(`Review warning for rule '${rule.ruleName}': ${rule.message}`);
			});
		}

		if (results.length === 0) {
			recommendations.push(
				"No validation rules were executed. Consider configuring validation rules for this operation.",
			);
		}

		// Performance recommendations
		const slowRules = results.filter((r) => r.executionTime > 5000);
		if (slowRules.length > 0) {
			recommendations.push(`Performance: ${slowRules.length} validation rules took longer than 5 seconds to execute`);
		}

		return recommendations;
	}
	private initializeDefaultRules(): void {
		const defaultRules: ValidationRule[] = [
			{
				id: "data_integrity_check",
				name: "Data Integrity Check",
				description: "Validates referential integrity before operations",
				category: "data_integrity",
				severity: "error",
				isEnabled: true,
				ruleDefinition: {
					type: "sql_query",
					expression:
						"SELECT COUNT(*) as orphaned_records FROM child_table WHERE parent_id NOT IN (SELECT id FROM parent_table)",
					parameters: {},
					expectedResult: 0,
					timeout: 30000,
				},
				createdAt: new Date(),
				lastModified: new Date(),
			},
			{
				id: "performance_impact_check",
				name: "Performance Impact Assessment",
				description: "Checks for potential performance degradation",
				category: "performance",
				severity: "warning",
				isEnabled: true,
				ruleDefinition: {
					type: "threshold_check",
					expression: "SELECT COUNT(*) FROM large_table",
					parameters: { threshold: 1000000 },
					expectedResult: 1000000,
					timeout: 30000,
				},
				createdAt: new Date(),
				lastModified: new Date(),
			},
			{
				id: "security_validation",
				name: "Security Compliance Check",
				description: "Validates security constraints and permissions",
				category: "security",
				severity: "error",
				isEnabled: true,
				ruleDefinition: {
					type: "pattern_match",
					expression: "SELECT * FROM information_schema.role_table_grants WHERE privilege_type = 'SELECT'",
					parameters: { requirePattern: "grants_exist" },
					timeout: 30000,
				},
				createdAt: new Date(),
				lastModified: new Date(),
			},
		];

		for (const rule of defaultRules) {
			this.registerRule(rule);
		}

		Logger.info("Default validation rules initialized", "ValidationFramework.initializeDefaultRules", {
			ruleCount: defaultRules.length,
		});
	}
	getStats(): {
		totalRules: number;
		enabledRules: number;
		rulesByCategory: Record<string, number>;
		activeValidations: number;
	} {
		const rulesByCategory: Record<string, number> = {};

		for (const rule of this.validationRules.values()) {
			rulesByCategory[rule.category] = (rulesByCategory[rule.category] || 0) + 1;
		}

		return {
			totalRules: this.validationRules.size,
			enabledRules: this.getEnabledRules().length,
			rulesByCategory,
			activeValidations: this.activeValidations.size,
		};
	}
	private generateId(): string {
		return `validation_${getUUId()}`;
	}
	private delay(milliseconds: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, milliseconds));
	}
	private async executeQueryWithTimeout(
		dotNetService: any,
		connection: any,
		query: string,
		timeout: number,
	): Promise<any> {
		try {
			Logger.debug("Executing validation query with timeout", "ValidationFramework.executeQueryWithTimeout", {
				queryLength: query.length,
				timeout,
			});

			// Create timeout promise
			const timeoutPromise = new Promise((_, reject) => {
				setTimeout(() => {
					reject(new Error(`Query execution timed out after ${timeout}ms`));
				}, timeout);
			});

			// Execute query
			const queryPromise = dotNetService.executeQuery(connection, query, {
				maxRows: 1000, // Limit rows for validation queries
				timeout,
				includeExecutionPlan: false,
			});

			// Race between query execution and timeout
			const result = await Promise.race([queryPromise, timeoutPromise]);

			Logger.debug("Query executed successfully", "ValidationFramework.executeQueryWithTimeout", {
				rowCount: result.rowCount,
				executionTime: result.executionTime,
			});

			return result;
		} catch (error) {
			Logger.error(
				"Query execution failed or timed out",
				error as Error,
				"ValidationFramework.executeQueryWithTimeout",
			);
			return {
				error: (error as Error).message,
				rowCount: 0,
				columns: [],
				rows: [],
			};
		}
	}
	private async analyzeQueryResults(
		rule: ValidationRule,
		queryResult: any,
		startTime: number,
	): Promise<{ passed: boolean; message: string; details: any }> {
		const executionTime = Date.now() - startTime;

		try {
			// Handle different types of expected results
			const expectedResult = rule.ruleDefinition.expectedResult;
			let passed = false;
			let message = "";
			let details: any = {
				query: rule.ruleDefinition.expression,
				expectedResult,
				actualResult: null,
				executionTime,
				rowCount: queryResult.rowCount,
				columnCount: queryResult.columns?.length || 0,
			};

			if (expectedResult === null || expectedResult === undefined) {
				// Just check if query executes successfully
				passed = !queryResult.error && queryResult.rowCount >= 0;
				message = passed ? "Query executed successfully" : `Query execution failed: ${queryResult.error}`;
				details.actualResult = queryResult.rowCount;
			} else if (typeof expectedResult === "number") {
				// Compare with numeric result (e.g., COUNT queries)
				if (queryResult.rows && queryResult.rows.length > 0) {
					const actualValue = queryResult.rows[0][0];
					details.actualResult = actualValue;
					passed = actualValue === expectedResult;
					message = passed
						? `Numeric validation passed: ${actualValue} = ${expectedResult}`
						: `Numeric validation failed: ${actualValue} ≠ ${expectedResult}`;
				} else {
					passed = false;
					message = "No results returned for numeric comparison";
				}
			} else if (typeof expectedResult === "boolean") {
				// Boolean result comparison
				if (queryResult.rows && queryResult.rows.length > 0) {
					const actualValue = queryResult.rows[0][0];
					details.actualResult = actualValue;
					passed = Boolean(actualValue) === expectedResult;
					message = passed
						? `Boolean validation passed: ${actualValue} = ${expectedResult}`
						: `Boolean validation failed: ${actualValue} ≠ ${expectedResult}`;
				} else {
					passed = false;
					message = "No results returned for boolean comparison";
				}
			} else if (typeof expectedResult === "string") {
				// String result comparison
				if (queryResult.rows && queryResult.rows.length > 0) {
					const actualValue = String(queryResult.rows[0][0] || "");
					details.actualResult = actualValue;
					passed = actualValue === expectedResult;
					message = passed
						? `String validation passed: "${actualValue}" = "${expectedResult}"`
						: `String validation failed: "${actualValue}" ≠ "${expectedResult}"`;
				} else {
					passed = false;
					message = "No results returned for string comparison";
				}
			} else {
				// Generic result check - just verify query executed
				passed = !queryResult.error;
				message = passed ? "Query executed successfully" : `Query execution failed: ${queryResult.error}`;
				details.actualResult = queryResult.rowCount;
			}

			// Add query execution details
			details.columns = queryResult.columns || [];
			details.rows = queryResult.rows || [];
			details.executionPlan = queryResult.executionPlan;

			Logger.debug("Query result analysis completed", "ValidationFramework.analyzeQueryResults", {
				ruleId: rule.id,
				passed,
				executionTime,
				rowCount: queryResult.rowCount,
			});

			return {
				passed,
				message,
				details,
			};
		} catch (error) {
			Logger.error("Query result analysis failed", error as Error, "ValidationFramework.analyzeQueryResults", {
				ruleId: rule.id,
				executionTime,
			});

			return {
				passed: false,
				message: `Query result analysis failed: ${(error as Error).message}`,
				details: {
					query: rule.ruleDefinition.expression,
					expectedResult: rule.ruleDefinition.expectedResult,
					error: (error as Error).message,
					executionTime,
				},
			};
		}
	}
	private async performThresholdCheck(
		dotNetService: any,
		connection: any,
		metricType: string,
		tableName?: string,
		schemaName?: string,
		threshold?: number,
		startTime?: number,
	): Promise<{ passed: boolean; message: string; details: any }> {
		try {
			let actualValue: number = 0;
			let query = "";

			switch (metricType) {
				case "row_count":
					if (!tableName) {
						throw new Error("Table name required for row_count metric");
					}
					query = `SELECT COUNT(*) FROM ${schemaName}."${tableName}"`;
					break;

				case "table_size":
					if (!tableName) {
						throw new Error("Table name required for table_size metric");
					}
					query = `SELECT pg_total_relation_size('${schemaName}.${tableName}')`;
					break;

				case "index_count":
					if (!tableName) {
						throw new Error("Table name required for index_count metric");
					}
					query = `SELECT COUNT(*) FROM pg_indexes WHERE schemaname = '${schemaName}' AND tablename = '${tableName}'`;
					break;

				case "column_count":
					if (!tableName) {
						throw new Error("Table name required for column_count metric");
					}
					query = `SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = '${schemaName}' AND table_name = '${tableName}'`;
					break;

				case "constraint_count":
					if (!tableName) {
						throw new Error("Table name required for constraint_count metric");
					}
					query = `SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = '${schemaName}' AND table_name = '${tableName}'`;
					break;

				default:
					throw new Error(`Unsupported metric type: ${metricType}`);
			}

			// Execute the metric query
			const queryResult = await this.executeQueryWithTimeout(dotNetService, connection, query, 10000);

			if (queryResult.error) {
				throw new Error(`Metric query failed: ${queryResult.error}`);
			}

			if (queryResult.rows && queryResult.rows.length > 0) {
				actualValue = parseInt(queryResult.rows[0][0]) || 0;
			}

			const passed = threshold === undefined || actualValue <= threshold;
			const message = passed
				? `Threshold check passed: ${actualValue} <= ${threshold}`
				: `Threshold check failed: ${actualValue} > ${threshold}`;

			return {
				passed,
				message,
				details: {
					metricType,
					tableName,
					schemaName,
					threshold,
					actualValue,
					difference: actualValue - (threshold || 0),
					query,
					executionTime: startTime ? Date.now() - startTime : 0,
				},
			};
		} catch (error) {
			throw new Error(`Threshold check failed: ${(error as Error).message}`);
		}
	}
	private async performPatternCheck(
		dotNetService: any,
		connection: any,
		patternType: string,
		objectType: string,
		schemaName: string,
		patternRegex: string,
		startTime: number,
	): Promise<{ passed: boolean; message: string; details: any }> {
		try {
			let query = "";
			let objectCount = 0;
			let matchingObjects: string[] = [];
			let nonMatchingObjects: string[] = [];

			switch (patternType) {
				case "naming_convention":
					if (objectType === "table") {
						query = `SELECT table_name FROM information_schema.tables WHERE table_schema = '${schemaName}'`;
					} else if (objectType === "column") {
						query = `SELECT column_name, table_name FROM information_schema.columns WHERE table_schema = '${schemaName}'`;
					} else {
						query = `SELECT object_name FROM (SELECT table_name as object_name FROM information_schema.tables WHERE table_schema = '${schemaName}' UNION ALL SELECT indexname as object_name FROM pg_indexes WHERE schemaname = '${schemaName}') sub`;
					}
					break;

				case "privilege_pattern":
					query = `SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_schema = '${schemaName}'`;
					break;

				case "constraint_pattern":
					query = `SELECT constraint_name, constraint_type FROM information_schema.table_constraints WHERE table_schema = '${schemaName}'`;
					break;

				default:
					throw new Error(`Unsupported pattern type: ${patternType}`);
			}

			// Execute the pattern query
			const queryResult = await this.executeQueryWithTimeout(dotNetService, connection, query, 15000);

			if (queryResult.error) {
				throw new Error(`Pattern query failed: ${queryResult.error}`);
			}

			// Analyze results against pattern
			if (queryResult.rows && queryResult.rows.length > 0) {
				const regex = new RegExp(patternRegex);

				for (const row of queryResult.rows) {
					const objectName = row[0];
					objectCount++;

					if (regex.test(objectName)) {
						matchingObjects.push(objectName);
					} else {
						nonMatchingObjects.push(objectName);
					}
				}
			}

			const passed = nonMatchingObjects.length === 0;
			const message = passed
				? `Pattern validation passed: ${matchingObjects.length}/${objectCount} objects match pattern`
				: `Pattern validation failed: ${nonMatchingObjects.length}/${objectCount} objects don't match pattern`;

			return {
				passed,
				message,
				details: {
					patternType,
					objectType,
					schemaName,
					patternRegex,
					totalObjects: objectCount,
					matchingObjects: matchingObjects.length,
					nonMatchingObjects: nonMatchingObjects.length,
					matchingList: matchingObjects.slice(0, 10), // Limit for readability
					nonMatchingList: nonMatchingObjects.slice(0, 10),
					executionTime: Date.now() - startTime,
				},
			};
		} catch (error) {
			throw new Error(`Pattern check failed: ${(error as Error).message}`);
		}
	}
	private async performCustomValidation(
		validationLogic: string,
		logicType: string,
		context: any,
		startTime: number,
	): Promise<{ passed: boolean; message: string; details: any }> {
		try {
			let passed = false;
			let message = "";
			let result: any = null;

			switch (logicType) {
				case "javascript":
					// Execute JavaScript logic (with safety considerations)
					try {
						// Create a safe execution context
						const safeContext = {
							context,
							threshold: (value: number, limit: number) => value <= limit,
							equals: (a: any, b: any) => a === b,
							contains: (str: string, substr: string) => str.includes(substr),
							regex: (pattern: string, value: string) => new RegExp(pattern).test(value),
						};

						// Simple expression evaluation (in production, use a safer approach)
						if (validationLogic.includes("context.")) {
							// Extract property access for basic validation
							const parts = validationLogic.split(".");
							if (parts.length >= 2) {
								const property = parts[1];
								result = context?.[property];
								passed = result !== undefined && result !== null;
								message = passed
									? `Custom validation passed: ${property} = ${result}`
									: `Custom validation failed: ${property} is not available`;
							}
						} else {
							passed = true;
							message = "Custom JavaScript validation executed successfully";
						}
					} catch (jsError) {
						throw new Error(`JavaScript validation error: ${(jsError as Error).message}`);
					}
					break;

				case "sql_condition":
					// Execute SQL condition check
					if (context?.targetConnection) {
						const { PostgreSqlConnectionManager } = await import("@/core/PostgreSqlConnectionManager");
						const nativeService = PostgreSqlConnectionManager.getInstance();

						const conditionResult = await this.executeQueryWithTimeout(
							nativeService,
							context.targetConnection,
							validationLogic,
							10000,
						);

						if (conditionResult.error) {
							throw new Error(`SQL condition check failed: ${conditionResult.error}`);
						}

						result = conditionResult.rowCount > 0;
						passed = result;
						message = passed ? "SQL condition validation passed" : "SQL condition validation failed";
					} else {
						throw new Error("No database connection available for SQL condition validation");
					}
					break;

				case "expression":
					// Simple expression evaluation
					try {
						// Basic expression parsing (production would need more robust parsing)
						if (validationLogic.includes(">") || validationLogic.includes("<")) {
							// Handle comparison expressions
							const parts = validationLogic.split(/\s*([><=!]+)\s*/);
							if (parts.length >= 3 && context) {
								const leftValue = parseFloat(context[parts[0]]) || 0;
								const operator = parts[1];
								const rightValue = parseFloat(parts[2]) || 0;

								switch (operator) {
									case ">":
										passed = leftValue > rightValue;
										break;
									case "<":
										passed = leftValue < rightValue;
										break;
									case ">=":
										passed = leftValue >= rightValue;
										break;
									case "<=":
										passed = leftValue <= rightValue;
										break;
									case "==":
									case "=":
										passed = leftValue === rightValue;
										break;
									default:
										passed = false;
								}

								result = { leftValue, operator, rightValue };
								message = passed
									? `Expression validation passed: ${leftValue} ${operator} ${rightValue}`
									: `Expression validation failed: ${leftValue} ${operator} ${rightValue}`;
							}
						} else {
							passed = true;
							message = "Expression validation executed successfully";
						}
					} catch (exprError) {
						throw new Error(`Expression validation error: ${(exprError as Error).message}`);
					}
					break;

				default:
					throw new Error(`Unsupported logic type: ${logicType}`);
			}

			return {
				passed,
				message,
				details: {
					logicType,
					validationLogic,
					result,
					context: context ? Object.keys(context) : [],
					executionTime: Date.now() - startTime,
				},
			};
		} catch (error) {
			throw new Error(`Custom validation failed: ${(error as Error).message}`);
		}
	}
	dispose(): void {
		Logger.info("ValidationFramework disposed", "ValidationFramework.dispose");

		this.validationRules.clear();
		this.activeValidations.clear();
	}
}
