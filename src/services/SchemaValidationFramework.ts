import { Logger } from '../utils/Logger';

/**
 * Validation rule severity
 */
export enum ValidationSeverity {
    ERROR = 'ERROR',
    WARNING = 'WARNING',
    INFO = 'INFO'
}

/**
 * Validation rule type
 */
export enum ValidationRuleType {
    NAMING_CONVENTION = 'NAMING_CONVENTION',
    DATA_TYPE_COMPATIBILITY = 'DATA_TYPE_COMPATIBILITY',
    CONSTRAINT_VALIDATION = 'CONSTRAINT_VALIDATION',
    INDEX_VALIDATION = 'INDEX_VALIDATION',
    RELATIONSHIP_VALIDATION = 'RELATIONSHIP_VALIDATION',
    PERFORMANCE_CHECK = 'PERFORMANCE_CHECK',
    SECURITY_CHECK = 'SECURITY_CHECK'
}

/**
 * Validation rule definition
 */
export interface ValidationRule {
    id: string;
    name: string;
    type: ValidationRuleType;
    severity: ValidationSeverity;
    description: string;
    validate: (context: ValidationContext) => ValidationResult;
    enabled: boolean;
}

/**
 * Validation context
 */
export interface ValidationContext {
    schemaName?: string;
    tableName?: string;
    columnName?: string;
    dataType?: string;
    constraints?: Record<string, any>;
    indexes?: Array<{
        name: string;
        columns: string[];
        unique: boolean;
    }>;
    foreignKeys?: Array<{
        column: string;
        referencedTable: string;
        referencedColumn: string;
    }>;
    estimatedRowCount?: number;
    existingSchema?: any;
    migrationType?: 'CREATE' | 'ALTER' | 'DROP';
}

/**
 * Validation result
 */
export interface ValidationResult {
    isValid: boolean;
    severity: ValidationSeverity;
    message: string;
    ruleId: string;
    suggestions?: string[];
    metadata?: Record<string, any>;
}

/**
 * Schema validation report
 */
export interface ValidationReport {
    isValid: boolean;
    totalRules: number;
    passedRules: number;
    failedRules: number;
    results: ValidationResult[];
    summary: {
        errors: number;
        warnings: number;
        info: number;
    };
    executionTime: number;
    timestamp: number;
}

/**
 * Schema validation configuration
 */
export interface ValidationConfig {
    enabledRules: string[];
    failOnError: boolean;
    failOnWarning: boolean;
    customRules?: ValidationRule[];
    skipRules?: string[];
}

/**
 * Default validation configuration
 */
const DEFAULT_CONFIG: ValidationConfig = {
    enabledRules: [],
    failOnError: true,
    failOnWarning: false,
    skipRules: []
};

/**
 * Schema validation framework for ensuring data integrity
 */
export class SchemaValidationFramework {
    private static instance: SchemaValidationFramework;
    private config: ValidationConfig;
    private validationRules: Map<string, ValidationRule> = new Map();
    private validationHistory: ValidationReport[] = [];

    private constructor(config: Partial<ValidationConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.initializeDefaultRules();
    }

    static getInstance(config?: Partial<ValidationConfig>): SchemaValidationFramework {
        if (!SchemaValidationFramework.instance) {
            SchemaValidationFramework.instance = new SchemaValidationFramework(config);
        }
        return SchemaValidationFramework.instance;
    }

    /**
     * Validate schema object
     */
    async validateSchema(context: ValidationContext): Promise<ValidationReport> {
        const startTime = Date.now();
        const results: ValidationResult[] = [];

        Logger.debug('Starting schema validation', { context: context.tableName || context.schemaName });

        try {
            // Get applicable rules
            const applicableRules = this.getApplicableRules(context);

            // Execute validation rules
            for (const rule of applicableRules) {
                if (!rule.enabled || this.config.skipRules?.includes(rule.id)) {
                    continue;
                }

                try {
                    const result = rule.validate(context);
                    results.push(result);

                    if (!result.isValid) {
                        Logger.debug(`Validation failed: ${rule.name} - ${result.message}`);
                    }
                } catch (error) {
                    Logger.error(`Validation rule error: ${rule.name}`, error as Error);
                    results.push({
                        isValid: false,
                        severity: ValidationSeverity.ERROR,
                        message: `Rule execution failed: ${(error as Error).message}`,
                        ruleId: rule.id
                    });
                }
            }

            const executionTime = Date.now() - startTime;
            const report = this.generateReport(results, executionTime);

            this.validationHistory.push(report);

            Logger.info('Schema validation completed', {
                isValid: report.isValid,
                totalRules: report.totalRules,
                failedRules: report.failedRules,
                executionTime
            });

            return report;

        } catch (error) {
            Logger.error('Schema validation failed', error as Error);
            throw error;
        }
    }

    /**
     * Register custom validation rule
     */
    registerRule(rule: ValidationRule): void {
        this.validationRules.set(rule.id, rule);

        if (this.config.enabledRules.length === 0) {
            this.config.enabledRules.push(rule.id);
        }

        Logger.info(`Validation rule registered: ${rule.name}`);
    }

    /**
     * Remove validation rule
     */
    removeRule(ruleId: string): void {
        this.validationRules.delete(ruleId);
        this.config.enabledRules = this.config.enabledRules.filter(id => id !== ruleId);
        Logger.info(`Validation rule removed: ${ruleId}`);
    }

    /**
     * Get validation history
     */
    getValidationHistory(limit: number = 10): ValidationReport[] {
        return this.validationHistory.slice(-limit).reverse();
    }

    /**
     * Get validation statistics
     */
    getValidationStats(): Record<string, any> {
        const total = this.validationHistory.length;
        const valid = this.validationHistory.filter(r => r.isValid).length;
        const avgExecutionTime = total > 0 ?
            this.validationHistory.reduce((sum, r) => sum + r.executionTime, 0) / total : 0;

        return {
            totalValidations: total,
            successfulValidations: valid,
            failedValidations: total - valid,
            successRate: total > 0 ? (valid / total) * 100 : 0,
            averageExecutionTime: avgExecutionTime,
            rulesExecuted: this.validationHistory.reduce((sum, r) => sum + r.totalRules, 0)
        };
    }

    /**
     * Get applicable rules for context
     */
    private getApplicableRules(context: ValidationContext): ValidationRule[] {
        const applicableRules: ValidationRule[] = [];

        for (const rule of this.validationRules.values()) {
            if (!this.config.enabledRules.includes(rule.id)) {
                continue;
            }

            // Filter rules based on context
            const isApplicable = this.isRuleApplicableToContext(rule, context);
            if (isApplicable) {
                applicableRules.push(rule);
            }
        }

        return applicableRules;
    }

    /**
     * Check if rule is applicable to validation context
     */
    private isRuleApplicableToContext(rule: ValidationRule, context: ValidationContext): boolean {
        switch (rule.type) {
            case ValidationRuleType.NAMING_CONVENTION:
                return context.tableName !== undefined || context.columnName !== undefined;

            case ValidationRuleType.DATA_TYPE_COMPATIBILITY:
                return context.dataType !== undefined;

            case ValidationRuleType.CONSTRAINT_VALIDATION:
                return context.constraints !== undefined;

            case ValidationRuleType.INDEX_VALIDATION:
                return context.indexes !== undefined;

            case ValidationRuleType.RELATIONSHIP_VALIDATION:
                return context.foreignKeys !== undefined;

            case ValidationRuleType.PERFORMANCE_CHECK:
                return context.estimatedRowCount !== undefined;

            default:
                return true;
        }
    }

    /**
     * Generate validation report
     */
    private generateReport(results: ValidationResult[], executionTime: number): ValidationReport {
        const errors = results.filter(r => r.severity === ValidationSeverity.ERROR).length;
        const warnings = results.filter(r => r.severity === ValidationSeverity.WARNING).length;
        const info = results.filter(r => r.severity === ValidationSeverity.INFO).length;

        const isValid = this.config.failOnError ? errors === 0 : true;
        const shouldFailOnWarning = this.config.failOnWarning && warnings > 0;
        const finalIsValid = isValid && !shouldFailOnWarning;

        return {
            isValid: finalIsValid,
            totalRules: results.length,
            passedRules: results.filter(r => r.isValid).length,
            failedRules: results.filter(r => !r.isValid).length,
            results,
            summary: { errors, warnings, info },
            executionTime,
            timestamp: Date.now()
        };
    }

    /**
     * Initialize default validation rules
     */
    private initializeDefaultRules(): void {
        // Naming convention rules
        this.registerRule({
            id: 'table_naming',
            name: 'Table Naming Convention',
            type: ValidationRuleType.NAMING_CONVENTION,
            severity: ValidationSeverity.WARNING,
            description: 'Table names should follow snake_case convention',
            enabled: true,
            validate: (context) => {
                if (!context.tableName) {
                    return { isValid: true, severity: ValidationSeverity.INFO, message: 'No table to validate', ruleId: 'table_naming' };
                }

                const name = context.tableName;
                const isSnakeCase = /^[a-z][a-z0-9_]*[a-z0-9]$/.test(name) && !name.includes('__') && !/^\d/.test(name);

                return {
                    isValid: isSnakeCase,
                    severity: ValidationSeverity.WARNING,
                    message: isSnakeCase ? 'Table name follows naming conventions' : `Table name '${name}' should use snake_case`,
                    ruleId: 'table_naming',
                    suggestions: ['Use lowercase letters', 'Separate words with underscores', 'Avoid starting with numbers']
                };
            }
        });

        // Data type compatibility rule
        this.registerRule({
            id: 'data_type_size',
            name: 'Data Type Size Validation',
            type: ValidationRuleType.DATA_TYPE_COMPATIBILITY,
            severity: ValidationSeverity.WARNING,
            description: 'Validate data type sizes for optimal storage',
            enabled: true,
            validate: (context) => {
                if (!context.dataType) {
                    return { isValid: true, severity: ValidationSeverity.INFO, message: 'No data type to validate', ruleId: 'data_type_size' };
                }

                const dataType = context.dataType.toLowerCase();
                let isValid = true;
                let message = 'Data type size is appropriate';
                const suggestions: string[] = [];

                // Check for oversized types
                if (dataType.includes('varchar') && !dataType.includes('max')) {
                    const sizeMatch = dataType.match(/varchar\((\d+)\)/);
                    if (sizeMatch) {
                        const size = parseInt(sizeMatch[1]);
                        if (size > 1000) {
                            isValid = false;
                            message = `VARCHAR(${size}) is very large, consider using TEXT for sizes > 1000`;
                            suggestions.push('Use TEXT for large text fields', 'Consider if all that space is needed');
                        }
                    }
                }

                return {
                    isValid,
                    severity: ValidationSeverity.WARNING,
                    message,
                    ruleId: 'data_type_size',
                    suggestions
                };
            }
        });

        // Index validation rule
        this.registerRule({
            id: 'index_performance',
            name: 'Index Performance Check',
            type: ValidationRuleType.PERFORMANCE_CHECK,
            severity: ValidationSeverity.INFO,
            description: 'Check index effectiveness based on row count',
            enabled: true,
            validate: (context) => {
                if (!context.indexes || !context.estimatedRowCount) {
                    return { isValid: true, severity: ValidationSeverity.INFO, message: 'No indexes or row count to validate', ruleId: 'index_performance' };
                }

                const rowCount = context.estimatedRowCount;
                const suggestions: string[] = [];

                if (rowCount < 1000 && context.indexes.length > 0) {
                    suggestions.push('Consider if indexes are necessary for small tables');
                } else if (rowCount > 100000 && context.indexes.length === 0) {
                    suggestions.push('Large tables without indexes may have performance issues');
                }

                return {
                    isValid: true,
                    severity: ValidationSeverity.INFO,
                    message: `Table has ${context.indexes.length} indexes for ${rowCount} estimated rows`,
                    ruleId: 'index_performance',
                    suggestions
                };
            }
        });

        Logger.info('Default validation rules initialized');
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<ValidationConfig>): void {
        this.config = { ...this.config, ...config };
        Logger.info('Schema validation framework configuration updated');
    }

    /**
     * Dispose of the framework
     */
    dispose(): void {
        this.validationRules.clear();
        this.validationHistory = [];
        Logger.info('Schema validation framework disposed');
    }
}