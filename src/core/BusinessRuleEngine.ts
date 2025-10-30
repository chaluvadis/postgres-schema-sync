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
        // More sophisticated estimation based on operation complexity
        let totalTime = 0;
        let indexOperations = 0;
        let constraintOperations = 0;
        let dataOperations = 0;

        for (const diff of differences) {
            switch (diff.type) {
                case 'create':
                    if (diff.objectType === 'table') {
                        totalTime += 2000; // Table creation with constraints
                        constraintOperations++;
                    } else if (diff.objectType === 'index') {
                        totalTime += 3000; // Index creation
                        indexOperations++;
                    } else {
                        totalTime += 1000; // Other creates
                    }
                    break;
                case 'alter':
                    if (diff.objectType === 'table') {
                        // Analyze the ALTER statement for complexity
                        const alterSql = diff.sql.toUpperCase();
                        if (alterSql.includes('ADD COLUMN')) {
                            totalTime += 1500; // Adding column
                        } else if (alterSql.includes('DROP COLUMN')) {
                            totalTime += 3000; // Dropping column (more complex)
                        } else if (alterSql.includes('ALTER COLUMN')) {
                            totalTime += 2500; // Changing column type/constraints
                        } else {
                            totalTime += 2000; // Other alters
                        }
                        constraintOperations++;
                    } else {
                        totalTime += 2000; // Non-table alters
                    }
                    break;
                case 'drop':
                    if (diff.objectType === 'table') {
                        totalTime += 1500; // Table drop
                        constraintOperations++;
                    } else if (diff.objectType === 'index') {
                        totalTime += 1000; // Index drop
                        indexOperations++;
                    } else {
                        totalTime += 500; // Other drops
                    }
                    break;
            }
        }

        // Add overhead based on operation types
        totalTime += indexOperations * 1000; // Index maintenance overhead
        totalTime += constraintOperations * 1500; // Constraint validation overhead
        totalTime += dataOperations * 2000; // Data operation overhead

        // Add transaction management overhead
        totalTime += differences.length * 500;

        // Add network and processing overhead (20% of total)
        totalTime *= 1.2;

        // Minimum time for any migration
        return Math.max(totalTime, 1000);
    }
}