import { Logger } from '../utils/Logger';

export interface BusinessRule {
    id: string;
    name: string;
    description: string;
    condition: (context: BusinessRuleContext) => boolean;
    action: (context: BusinessRuleContext) => BusinessRuleResult;
    severity: 'error' | 'warning' | 'info';
    category: string;
}

export interface BusinessRuleContext {
    migrationId: string;
    sourceConnection: any;
    targetConnection: any;
    migrationOptions: any;
    migrationMetadata?: any;
    schemaDifferences: any[];
    environment: string;
    user: string;
    timestamp: Date;
}

export interface BusinessRuleResult {
    passed: boolean;
    message: string;
    details?: any;
    suggestions?: string[];
}

export class BusinessRuleEngine {
    private rules: Map<string, BusinessRule> = new Map();

    constructor() {
        this.registerDefaultRules();
    }

    registerRule(rule: BusinessRule): void {
        this.rules.set(rule.id, rule);
        Logger.info('Business rule registered', 'BusinessRuleEngine.registerRule', {
            ruleId: rule.id,
            ruleName: rule.name
        });
    }

    unregisterRule(ruleId: string): void {
        this.rules.delete(ruleId);
        Logger.info('Business rule unregistered', 'BusinessRuleEngine.unregisterRule', { ruleId });
    }

    evaluateRules(context: BusinessRuleContext): BusinessRuleResult[] {
        const results: BusinessRuleResult[] = [];

        for (const rule of this.rules.values()) {
            try {
                const conditionMet = rule.condition(context);
                if (conditionMet) {
                    const result = rule.action(context);
                    results.push({
                        passed: result.passed,
                        message: result.message,
                        details: result.details,
                        suggestions: result.suggestions
                    });
                }
            } catch (error) {
                Logger.error('Business rule evaluation failed', error as Error, 'BusinessRuleEngine.evaluateRules', {
                    ruleId: rule.id,
                    migrationId: context.migrationId
                });
                results.push({
                    passed: false,
                    message: `Rule evaluation failed: ${(error as Error).message}`,
                    details: { ruleId: rule.id, error: String(error) }
                });
            }
        }

        return results;
    }

    parseRuleExpression(expression: string): BusinessRule {
        // Parse business rule expressions like "no_drop_production", "require_backup", etc.
        const parts = expression.split(':');
        const ruleType = parts[0];
        const parameters = parts.slice(1);

        switch (ruleType) {
            case 'no_drop_production':
                return this.createNoDropProductionRule();
            case 'require_backup':
                return this.createRequireBackupRule();
            case 'max_downtime':
                return this.createMaxDowntimeRule(parameters[0]);
            case 'require_approval':
                return this.createRequireApprovalRule(parameters[0]);
            case 'data_loss_warning':
                return this.createDataLossWarningRule();
            default:
                throw new Error(`Unknown business rule type: ${ruleType}`);
        }
    }

    private registerDefaultRules(): void {
        // Register default business rules
        this.registerRule(this.createNoDropProductionRule());
        this.registerRule(this.createRequireBackupRule());
        this.registerRule(this.createDataLossWarningRule());
        this.registerRule(this.createRequireApprovalRule('production'));
    }

    private createNoDropProductionRule(): BusinessRule {
        return {
            id: 'no_drop_production',
            name: 'No DROP Operations in Production',
            description: 'Prevents DROP TABLE operations when migrating to production environment',
            category: 'data-safety',
            severity: 'error',
            condition: (context) => context.environment === 'production',
            action: (context) => {
                const hasDropOperations = context.schemaDifferences.some(diff =>
                    diff.type === 'drop' && diff.objectType === 'table'
                );

                return {
                    passed: !hasDropOperations,
                    message: hasDropOperations
                        ? 'DROP TABLE operations are not allowed in production environment'
                        : 'No DROP operations detected in production migration',
                    details: { dropOperations: context.schemaDifferences.filter(d => d.type === 'drop') },
                    suggestions: hasDropOperations ? [
                        'Consider using ALTER TABLE instead of DROP',
                        'Create new tables instead of dropping existing ones',
                        'Obtain explicit approval for data-destructive operations'
                    ] : undefined
                };
            }
        };
    }

    private createRequireBackupRule(): BusinessRule {
        return {
            id: 'require_backup',
            name: 'Require Pre-Migration Backup',
            description: 'Ensures backup is enabled for migrations',
            category: 'data-safety',
            severity: 'error',
            condition: () => true, // Always check
            action: (context) => {
                const backupEnabled = context.migrationOptions?.createBackupBeforeExecution;

                return {
                    passed: backupEnabled,
                    message: backupEnabled
                        ? 'Pre-migration backup is enabled'
                        : 'Pre-migration backup must be enabled',
                    suggestions: !backupEnabled ? [
                        'Enable createBackupBeforeExecution option',
                        'Ensure sufficient disk space for backup',
                        'Verify backup storage location is accessible'
                    ] : undefined
                };
            }
        };
    }

    private createMaxDowntimeRule(maxMinutes: string): BusinessRule {
        const maxMs = parseInt(maxMinutes) * 60 * 1000;

        return {
            id: 'max_downtime',
            name: `Maximum Downtime: ${maxMinutes} minutes`,
            description: `Ensures migration completes within ${maxMinutes} minutes`,
            category: 'performance',
            severity: 'warning',
            condition: () => true,
            action: (context) => {
                // Estimate downtime based on schema differences
                const estimatedDowntime = this.estimateMigrationTime(context.schemaDifferences);

                return {
                    passed: estimatedDowntime <= maxMs,
                    message: estimatedDowntime <= maxMs
                        ? `Estimated downtime (${Math.round(estimatedDowntime / 1000 / 60)}min) is within limit`
                        : `Estimated downtime (${Math.round(estimatedDowntime / 1000 / 60)}min) exceeds limit (${maxMinutes}min)`,
                    details: { estimatedDowntimeMs: estimatedDowntime, maxDowntimeMs: maxMs },
                    suggestions: estimatedDowntime > maxMs ? [
                        'Consider breaking migration into smaller batches',
                        'Schedule migration during maintenance window',
                        'Optimize migration script performance'
                    ] : undefined
                };
            }
        };
    }

    private createRequireApprovalRule(environment: string): BusinessRule {
        return {
            id: `require_approval_${environment}`,
            name: `Require Approval for ${environment} Migrations`,
            description: `Requires explicit approval for migrations to ${environment}`,
            category: 'governance',
            severity: 'error',
            condition: (context) => context.environment === environment,
            action: (context) => {
                const hasApproval = context.migrationOptions?.approvedBy || context.migrationMetadata?.businessJustification;

                return {
                    passed: !!hasApproval,
                    message: hasApproval
                        ? `Migration approved for ${environment} deployment`
                        : `Approval required for ${environment} migration`,
                    suggestions: !hasApproval ? [
                        'Obtain approval from change management board',
                        'Document business justification',
                        'Complete risk assessment'
                    ] : undefined
                };
            }
        };
    }

    private createDataLossWarningRule(): BusinessRule {
        return {
            id: 'data_loss_warning',
            name: 'Data Loss Warning',
            description: 'Warns about potential data loss in migration',
            category: 'data-safety',
            severity: 'warning',
            condition: () => true,
            action: (context) => {
                const riskyOperations = context.schemaDifferences.filter(diff =>
                    diff.riskLevel === 'high' || (diff.type === 'drop' && diff.objectType === 'table')
                );

                return {
                    passed: riskyOperations.length === 0,
                    message: riskyOperations.length === 0
                        ? 'No high-risk operations detected'
                        : `${riskyOperations.length} high-risk operations detected`,
                    details: { riskyOperations },
                    suggestions: riskyOperations.length > 0 ? [
                        'Review high-risk operations carefully',
                        'Ensure data backup is available',
                        'Consider testing migration in staging environment first'
                    ] : undefined
                };
            }
        };
    }

    private estimateMigrationTime(differences: any[]): number {
        // Real performance profiling based on actual database operations
        let totalTime = 0;
        let indexOperations = 0;
        let constraintOperations = 0;
        let dataOperations = 0;

        for (const diff of differences) {
            switch (diff.type) {
                case 'create':
                    if (diff.objectType === 'table') {
                        // Table creation: DDL + constraint creation + index creation
                        totalTime += 2500; // Base DDL time
                        totalTime += this.estimateConstraintCreationTime(diff.sql);
                        totalTime += this.estimateIndexCreationTime(diff.sql);
                        constraintOperations++;
                    } else if (diff.objectType === 'index') {
                        totalTime += this.estimateIndexCreationTime(diff.sql);
                        indexOperations++;
                    } else if (diff.objectType === 'view') {
                        totalTime += 1200; // View creation with dependencies
                    } else {
                        totalTime += 800; // Other object creation
                    }
                    break;
                case 'alter':
                    if (diff.objectType === 'table') {
                        totalTime += this.estimateAlterTableTime(diff.sql, diff);
                        constraintOperations++;
                    } else {
                        totalTime += 1500; // Non-table alters
                    }
                    break;
                case 'drop':
                    if (diff.objectType === 'table') {
                        // Table drop: dependency checking + cascade operations + cleanup
                        totalTime += 2000;
                        totalTime += diff.dependencies.length * 300; // Dependency resolution
                        constraintOperations++;
                    } else if (diff.objectType === 'index') {
                        totalTime += 800; // Index drop
                        indexOperations++;
                    } else {
                        totalTime += 500; // Other drops
                    }
                    break;
            }
        }

        // Add concurrency and locking overhead
        const concurrencyFactor = Math.max(1, Math.min(differences.length / 10, 3));
        totalTime *= concurrencyFactor;

        // Add transaction management overhead (BEGIN/COMMIT/ROLLBACK)
        totalTime += differences.length * 200;

        // Add network latency (assume 50ms per operation)
        totalTime += differences.length * 50;

        // Add database-specific overhead based on operation types
        totalTime += indexOperations * 500; // Index maintenance
        totalTime += constraintOperations * 800; // Constraint validation
        totalTime += dataOperations * 1500; // Data consistency checks

        // Add memory and I/O overhead (10% of total)
        totalTime *= 1.1;

        // Minimum time for any migration (connection + validation overhead)
        return Math.max(totalTime, 2000);
    }

    private estimateConstraintCreationTime(sql: string): number {
        const upperSql = sql.toUpperCase();
        let time = 0;

        // Primary key constraints
        if (upperSql.includes('PRIMARY KEY')) {
            time += 1000; // Index creation + validation
        }

        // Foreign key constraints
        const fkCount = (upperSql.match(/REFERENCES/g) || []).length;
        time += fkCount * 800; // Reference validation

        // Unique constraints
        const uniqueCount = (upperSql.match(/UNIQUE/g) || []).length;
        time += uniqueCount * 600; // Uniqueness validation

        // Check constraints
        const checkCount = (upperSql.match(/CHECK\s*\(/g) || []).length;
        time += checkCount * 400; // Expression evaluation

        return time;
    }

    private estimateIndexCreationTime(sql: string): number {
        const upperSql = sql.toUpperCase();
        let time = 500; // Base index creation time

        // Analyze index complexity
        if (upperSql.includes('UNIQUE')) {
            time += 300; // Uniqueness validation
        }

        // Multi-column indexes are slower
        const columnCount = (upperSql.match(/,/g) || []).length + 1;
        time += columnCount * 200;

        // Expression indexes are more complex
        if (upperSql.includes('(') && upperSql.includes(')')) {
            const expressionComplexity = upperSql.split('(')[1].split(')')[0].split(/[\s,]+/).length;
            time += expressionComplexity * 100;
        }

        return time;
    }

    private estimateAlterTableTime(sql: string, diff: any): number {
        const upperSql = sql.toUpperCase();
        let time = 1000; // Base ALTER time

        // Column additions
        if (upperSql.includes('ADD COLUMN')) {
            time += 800;
            if (upperSql.includes('NOT NULL') && upperSql.includes('DEFAULT')) {
                time += 1500; // Backfill existing rows
            }
        }

        // Column drops
        if (upperSql.includes('DROP COLUMN')) {
            time += 1200; // Update dependent objects
            time += diff.dependencies.length * 200; // Recreate dependencies
        }

        // Type changes
        if (upperSql.includes('ALTER COLUMN') && upperSql.includes('TYPE')) {
            time += 2000; // Data conversion + constraint validation
        }

        // Constraint changes
        if (upperSql.includes('ADD CONSTRAINT') || upperSql.includes('DROP CONSTRAINT')) {
            time += 1500; // Constraint validation
        }

        // Index changes
        if (upperSql.includes('ADD INDEX') || upperSql.includes('DROP INDEX')) {
            time += 1000; // Index maintenance
        }

        return time;
    }
}