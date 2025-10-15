import { SchemaComparison, SchemaDifference } from './SchemaComparison';
import { DependencyAnalysis } from './DependencyAnalysis';
import { Logger } from '@/utils/Logger';

// Impact Analysis Interfaces
export interface BasicImpactAnalysis {
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    affectedObjects: string[];
    dataLossPotential: boolean;
    breakingChanges: boolean;
    dependencies: string[];
    warnings: string[];
    recommendations: string[];
}

export interface AdvancedImpactAnalysis extends BasicImpactAnalysis {
    businessImpact: BusinessImpactAssessment;
    technicalImpact: TechnicalImpactAssessment;
    rollbackPlan: RollbackPlan;
    migrationPath: MigrationPath;
    riskMitigation: RiskMitigation[];
    stakeholderImpact: StakeholderImpact[];
}

export interface BusinessImpactAssessment {
    operationalImpact: 'none' | 'minimal' | 'moderate' | 'significant' | 'severe';
    financialImpact: 'none' | 'low' | 'medium' | 'high' | 'critical';
    complianceImpact: 'none' | 'low' | 'medium' | 'high' | 'critical';
    userExperienceImpact: 'none' | 'minimal' | 'moderate' | 'significant' | 'severe';
    affectedBusinessProcesses: string[];
    downtimeRequired: boolean;
    downtimeEstimate?: number; // in minutes
    businessContinuityRisk: 'low' | 'medium' | 'high' | 'critical';
}

export interface TechnicalImpactAssessment {
    performanceImpact: 'none' | 'minimal' | 'moderate' | 'significant' | 'severe';
    securityImpact: 'none' | 'improved' | 'degraded' | 'critical';
    scalabilityImpact: 'none' | 'positive' | 'negative' | 'critical';
    maintainabilityImpact: 'none' | 'improved' | 'degraded' | 'critical';
    compatibilityImpact: 'none' | 'low' | 'medium' | 'high' | 'breaking';
    affectedSystems: string[];
    technicalDebt: 'none' | 'low' | 'medium' | 'high' | 'critical';
}

export interface RollbackPlan {
    isRollbackPossible: boolean;
    rollbackComplexity: 'simple' | 'moderate' | 'complex' | 'impossible';
    rollbackSteps: RollbackStep[];
    estimatedRollbackTime: number; // in minutes
    rollbackRisks: string[];
    prerequisites: string[];
    successRate: number; // percentage
}

export interface RollbackStep {
    order: number;
    description: string;
    estimatedDuration: number; // in minutes
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    dependencies: string[];
    verificationSteps: string[];
}

export interface MigrationPath {
    phases: MigrationPhase[];
    totalEstimatedTime: number; // in minutes
    complexity: 'simple' | 'moderate' | 'complex' | 'critical';
    parallelExecution: boolean;
    rollbackPoints: number[];
}

export interface MigrationPhase {
    name: string;
    order: number;
    description: string;
    estimatedDuration: number; // in minutes
    canRollback: boolean;
    rollbackPoint: boolean;
    tasks: MigrationTask[];
}

export interface MigrationTask {
    id: string;
    name: string;
    description: string;
    estimatedDuration: number; // in minutes
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    dependencies: string[];
    prerequisites: string[];
    verificationCriteria: string[];
}

export interface RiskMitigation {
    risk: string;
    probability: 'low' | 'medium' | 'high' | 'critical';
    impact: 'low' | 'medium' | 'high' | 'critical';
    mitigationStrategy: string;
    mitigationCost: 'low' | 'medium' | 'high';
    responsibleParty: string;
    dueDate?: Date;
}

export interface StakeholderImpact {
    stakeholderGroup: string;
    impactLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
    communicationRequired: boolean;
    approvalRequired: boolean;
    notificationTimeline: string;
    concerns: string[];
    mitigationActions: string[];
}

/**
 * ImpactAnalysis - Handles change impact assessment and risk analysis
 * Responsible for assessing business and technical impact of schema changes
 */
export class ImpactAnalysis {
    private schemaComparison: SchemaComparison;
    private dependencyAnalysis: DependencyAnalysis;

    constructor(schemaComparison: SchemaComparison, dependencyAnalysis: DependencyAnalysis) {
        this.schemaComparison = schemaComparison;
        this.dependencyAnalysis = dependencyAnalysis;
    }

    /**
     * Perform advanced impact analysis on schema changes
     */
    async performAdvancedImpactAnalysis(
        sourceConnectionId: string,
        targetConnectionId: string,
        schemaChanges: SchemaDifference[],
        options: { includeBusinessImpact?: boolean; includeRollbackPlan?: boolean; } = {}
    ): Promise<AdvancedImpactAnalysis> {
        try {
            Logger.info('Starting advanced impact analysis', 'performAdvancedImpactAnalysis', {
                sourceConnectionId,
                targetConnectionId,
                changeCount: schemaChanges.length,
                options
            });

            // Get basic impact analysis
            const basicImpact = await this.performBasicImpactAnalysis(schemaChanges);

            // Perform advanced analysis components
            const businessImpact = options.includeBusinessImpact !== false ?
                await this.assessBusinessImpact(schemaChanges, sourceConnectionId, targetConnectionId) :
                this.getDefaultBusinessImpact();

            const technicalImpact = await this.assessTechnicalImpact(schemaChanges, sourceConnectionId, targetConnectionId);

            const rollbackPlan = options.includeRollbackPlan !== false ?
                await this.generateRollbackPlan(schemaChanges, sourceConnectionId, targetConnectionId) :
                this.getDefaultRollbackPlan();

            const migrationPath = await this.generateMigrationPath(schemaChanges, sourceConnectionId, targetConnectionId);

            const riskMitigation = await this.identifyRiskMitigationStrategies(schemaChanges);

            const stakeholderImpact = await this.assessStakeholderImpact(schemaChanges);

            const advancedAnalysis: AdvancedImpactAnalysis = {
                riskLevel: basicImpact.riskLevel,
                affectedObjects: basicImpact.affectedObjects,
                dataLossPotential: basicImpact.dataLossPotential,
                breakingChanges: basicImpact.breakingChanges,
                dependencies: basicImpact.dependencies,
                warnings: basicImpact.warnings,
                recommendations: basicImpact.recommendations,
                businessImpact,
                technicalImpact,
                rollbackPlan,
                migrationPath,
                riskMitigation,
                stakeholderImpact
            };

            Logger.info('Advanced impact analysis completed', 'performAdvancedImpactAnalysis', {
                riskLevel: advancedAnalysis.riskLevel,
                rollbackPossible: advancedAnalysis.rollbackPlan.isRollbackPossible,
                migrationComplexity: advancedAnalysis.migrationPath.complexity,
                stakeholderGroups: advancedAnalysis.stakeholderImpact.length
            });

            return advancedAnalysis;

        } catch (error) {
            Logger.error('Advanced impact analysis failed', error as Error);
            throw error;
        }
    }

    /**
     * Perform basic impact analysis
     */
    private async performBasicImpactAnalysis(schemaChanges: SchemaDifference[]): Promise<BasicImpactAnalysis> {
        const affectedObjects = schemaChanges.map(change => `${change.schema}.${change.objectName}`);
        const dataLossPotential = schemaChanges.some(change =>
            change.type === 'Removed' && change.objectType === 'table'
        );
        const breakingChanges = schemaChanges.some(change =>
            change.type === 'Modified' && this.isBreakingChange(change)
        );

        // Calculate risk level based on change types and counts
        let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
        const highRiskChanges = schemaChanges.filter(change => change.type === 'Removed').length;
        const mediumRiskChanges = schemaChanges.filter(change => change.type === 'Modified').length;

        if (highRiskChanges > 5 || dataLossPotential) {
            riskLevel = 'critical';
        } else if (highRiskChanges > 2 || mediumRiskChanges > 10) {
            riskLevel = 'high';
        } else if (mediumRiskChanges > 5) {
            riskLevel = 'medium';
        }

        return {
            riskLevel,
            affectedObjects,
            dataLossPotential,
            breakingChanges,
            dependencies: [], // Would be populated from dependency analysis
            warnings: this.generateImpactWarnings(schemaChanges),
            recommendations: this.generateImpactRecommendations(schemaChanges, riskLevel)
        };
    }

    /**
     * Check if a change is breaking
     */
    private isBreakingChange(change: SchemaDifference): boolean {
        // Determine if a schema change is breaking
        if (change.objectType === 'table' && change.type === 'Removed') {
            return true;
        }
        if (change.objectType === 'column' && change.type === 'Removed') {
            return true;
        }
        if (change.objectType === 'column' && change.type === 'Modified') {
            // Check if column data type change is breaking
            return change.differenceDetails.some(detail =>
                detail.toLowerCase().includes('data type') ||
                detail.toLowerCase().includes('primary key')
            );
        }
        return false;
    }

    /**
     * Generate impact warnings
     */
    private generateImpactWarnings(schemaChanges: SchemaDifference[]): string[] {
        const warnings: string[] = [];

        const removedTables = schemaChanges.filter(c => c.type === 'Removed' && c.objectType === 'table');
        if (removedTables.length > 0) {
            warnings.push(`${removedTables.length} tables will be removed - ensure no data loss`);
        }

        const modifiedColumns = schemaChanges.filter(c => c.type === 'Modified' && c.objectType === 'column');
        if (modifiedColumns.length > 0) {
            warnings.push(`${modifiedColumns.length} column modifications detected - verify application compatibility`);
        }

        return warnings;
    }

    /**
     * Generate impact recommendations
     */
    private generateImpactRecommendations(schemaChanges: SchemaDifference[], riskLevel: string): string[] {
        const recommendations: string[] = [];

        if (riskLevel === 'critical' || riskLevel === 'high') {
            recommendations.push('Perform thorough testing in staging environment before production deployment');
            recommendations.push('Prepare detailed rollback plan and ensure backups are available');
            recommendations.push('Schedule change during maintenance window to minimize business impact');
        }

        if (schemaChanges.some(c => c.type === 'Removed')) {
            recommendations.push('Archive removed objects before deletion to preserve data history');
        }

        recommendations.push('Communicate changes to all affected stakeholders');
        recommendations.push('Monitor system performance after deployment');

        return recommendations;
    }

    /**
     * Assess business impact of schema changes
     */
    private async assessBusinessImpact(
        schemaChanges: SchemaDifference[],
        sourceConnectionId: string,
        targetConnectionId: string
    ): Promise<BusinessImpactAssessment> {
        // Assess business impact of schema changes
        const operationalImpact = this.calculateOperationalImpact(schemaChanges);
        const financialImpact = this.calculateFinancialImpact(schemaChanges);
        const complianceImpact = this.calculateComplianceImpact(schemaChanges);
        const userExperienceImpact = this.calculateUserExperienceImpact(schemaChanges);

        const affectedBusinessProcesses = this.identifyAffectedBusinessProcesses(schemaChanges);
        const downtimeRequired = schemaChanges.some(change =>
            change.type === 'Removed' && change.objectType === 'table'
        );
        const downtimeEstimate = downtimeRequired ? 30 : 0; // 30 minutes default

        const businessContinuityRisk = this.assessBusinessContinuityRisk(schemaChanges);

        return {
            operationalImpact,
            financialImpact,
            complianceImpact,
            userExperienceImpact,
            affectedBusinessProcesses,
            downtimeRequired,
            downtimeEstimate,
            businessContinuityRisk
        };
    }

    /**
     * Calculate operational impact
     */
    private calculateOperationalImpact(schemaChanges: SchemaDifference[]): 'none' | 'minimal' | 'moderate' | 'significant' | 'severe' {
        const criticalChanges = schemaChanges.filter(change =>
            change.type === 'Removed' && ['table', 'view'].includes(change.objectType)
        ).length;

        if (criticalChanges > 3) return 'severe';
        if (criticalChanges > 1) return 'significant';
        if (criticalChanges > 0) return 'moderate';
        if (schemaChanges.length > 10) return 'minimal';
        return 'none';
    }

    /**
     * Calculate financial impact
     */
    private calculateFinancialImpact(schemaChanges: SchemaDifference[]): 'none' | 'low' | 'medium' | 'high' | 'critical' {
        const removedObjects = schemaChanges.filter(change => change.type === 'Removed').length;
        const modifiedObjects = schemaChanges.filter(change => change.type === 'Modified').length;

        if (removedObjects > 5 || (removedObjects + modifiedObjects) > 20) return 'critical';
        if (removedObjects > 2 || (removedObjects + modifiedObjects) > 10) return 'high';
        if (removedObjects > 0 || modifiedObjects > 5) return 'medium';
        if (modifiedObjects > 0) return 'low';
        return 'none';
    }

    /**
     * Calculate compliance impact
     */
    private calculateComplianceImpact(schemaChanges: SchemaDifference[]): 'none' | 'low' | 'medium' | 'high' | 'critical' {
        // Check for compliance-related changes
        const auditTableChanges = schemaChanges.filter(change =>
            change.objectType === 'table' &&
            (change.objectName.toLowerCase().includes('audit') ||
                change.objectName.toLowerCase().includes('log'))
        );

        if (auditTableChanges.length > 0) return 'high';
        if (schemaChanges.some(change => change.objectType === 'table' && change.type === 'Removed')) return 'medium';
        return 'low';
    }

    /**
     * Calculate user experience impact
     */
    private calculateUserExperienceImpact(schemaChanges: SchemaDifference[]): 'none' | 'minimal' | 'moderate' | 'significant' | 'severe' {
        const uiRelatedChanges = schemaChanges.filter(change =>
            change.objectType === 'view' ||
            (change.objectType === 'table' && change.objectName.toLowerCase().includes('user'))
        );

        if (uiRelatedChanges.length > 3) return 'severe';
        if (uiRelatedChanges.length > 1) return 'significant';
        if (uiRelatedChanges.length > 0) return 'moderate';
        return 'minimal';
    }

    /**
     * Identify affected business processes
     */
    private identifyAffectedBusinessProcesses(schemaChanges: SchemaDifference[]): string[] {
        const processes: string[] = [];

        // Identify business processes based on object names and types
        for (const change of schemaChanges) {
            if (change.objectName.toLowerCase().includes('order')) processes.push('Order Management');
            if (change.objectName.toLowerCase().includes('customer')) processes.push('Customer Management');
            if (change.objectName.toLowerCase().includes('product')) processes.push('Product Management');
            if (change.objectName.toLowerCase().includes('invoice')) processes.push('Billing');
            if (change.objectName.toLowerCase().includes('payment')) processes.push('Payment Processing');
        }

        return [...new Set(processes)]; // Remove duplicates
    }

    /**
     * Assess business continuity risk
     */
    private assessBusinessContinuityRisk(schemaChanges: SchemaDifference[]): 'low' | 'medium' | 'high' | 'critical' {
        const criticalObjectChanges = schemaChanges.filter(change =>
            change.type === 'Removed' && ['table', 'view'].includes(change.objectType)
        ).length;

        if (criticalObjectChanges > 5) return 'critical';
        if (criticalObjectChanges > 2) return 'high';
        if (criticalObjectChanges > 0) return 'medium';
        return 'low';
    }

    /**
     * Assess technical impact of schema changes
     */
    private async assessTechnicalImpact(
        schemaChanges: SchemaDifference[],
        sourceConnectionId: string,
        targetConnectionId: string
    ): Promise<TechnicalImpactAssessment> {
        return {
            performanceImpact: this.assessPerformanceImpact(schemaChanges),
            securityImpact: this.assessSecurityImpact(schemaChanges),
            scalabilityImpact: this.assessScalabilityImpact(schemaChanges),
            maintainabilityImpact: this.assessMaintainabilityImpact(schemaChanges),
            compatibilityImpact: this.assessCompatibilityImpact(schemaChanges),
            affectedSystems: this.identifyAffectedSystems(schemaChanges),
            technicalDebt: this.assessTechnicalDebt(schemaChanges)
        };
    }

    /**
     * Assess performance impact
     */
    private assessPerformanceImpact(schemaChanges: SchemaDifference[]): 'none' | 'minimal' | 'moderate' | 'significant' | 'severe' {
        const indexChanges = schemaChanges.filter(change => change.objectType === 'index').length;
        const tableChanges = schemaChanges.filter(change => change.objectType === 'table').length;

        if (indexChanges > 5 || tableChanges > 3) return 'significant';
        if (indexChanges > 2 || tableChanges > 1) return 'moderate';
        if (indexChanges > 0 || tableChanges > 0) return 'minimal';
        return 'none';
    }

    /**
     * Assess security impact
     */
    private assessSecurityImpact(schemaChanges: SchemaDifference[]): 'none' | 'improved' | 'degraded' | 'critical' {
        // Assess security implications
        const permissionChanges = schemaChanges.filter(change =>
            change.objectName.toLowerCase().includes('permission') ||
            change.objectName.toLowerCase().includes('role')
        );

        if (permissionChanges.length > 0) return 'critical';
        return 'none';
    }

    /**
     * Assess scalability impact
     */
    private assessScalabilityImpact(schemaChanges: SchemaDifference[]): 'none' | 'positive' | 'negative' | 'critical' {
        const largeTableChanges = schemaChanges.filter(change =>
            change.objectType === 'table' && change.differenceDetails.some(detail =>
                detail.toLowerCase().includes('partition') ||
                detail.toLowerCase().includes('size')
            )
        );

        if (largeTableChanges.length > 0) return 'positive';
        return 'none';
    }

    /**
     * Assess maintainability impact
     */
    private assessMaintainabilityImpact(schemaChanges: SchemaDifference[]): 'none' | 'improved' | 'degraded' | 'critical' {
        const complexChanges = schemaChanges.filter(change =>
            change.objectType === 'view' && change.differenceDetails.some(detail =>
                detail.toLowerCase().includes('complex') ||
                detail.toLowerCase().includes('subquery')
            )
        );

        if (complexChanges.length > 3) return 'degraded';
        if (complexChanges.length > 0) return 'critical';
        return 'none';
    }

    /**
     * Assess compatibility impact
     */
    private assessCompatibilityImpact(schemaChanges: SchemaDifference[]): 'none' | 'low' | 'medium' | 'high' | 'breaking' {
        const breakingChanges = schemaChanges.filter(change => this.isBreakingChange(change));

        if (breakingChanges.length > 5) return 'breaking';
        if (breakingChanges.length > 2) return 'high';
        if (breakingChanges.length > 0) return 'medium';
        return 'low';
    }

    /**
     * Identify affected systems
     */
    private identifyAffectedSystems(schemaChanges: SchemaDifference[]): string[] {
        const systems: string[] = [];

        // Identify affected systems based on schema names and object types
        for (const change of schemaChanges) {
            if (change.schema.includes('billing')) systems.push('Billing System');
            if (change.schema.includes('inventory')) systems.push('Inventory System');
            if (change.schema.includes('customer')) systems.push('CRM System');
            if (change.schema.includes('order')) systems.push('Order Management System');
        }

        return [...new Set(systems)];
    }

    /**
     * Assess technical debt
     */
    private assessTechnicalDebt(schemaChanges: SchemaDifference[]): 'none' | 'low' | 'medium' | 'high' | 'critical' {
        const deprecatedObjects = schemaChanges.filter(change =>
            change.differenceDetails.some(detail =>
                detail.toLowerCase().includes('deprecated') ||
                detail.toLowerCase().includes('legacy')
            )
        );

        if (deprecatedObjects.length > 0) return 'high';
        return 'low';
    }

    /**
     * Generate rollback plan
     */
    private async generateRollbackPlan(
        schemaChanges: SchemaDifference[],
        sourceConnectionId: string,
        targetConnectionId: string
    ): Promise<RollbackPlan> {
        const rollbackSteps: RollbackStep[] = [];
        let totalTime = 0;

        // Generate rollback steps for each change
        for (let i = 0; i < schemaChanges.length; i++) {
            const change = schemaChanges[i];
            const step: RollbackStep = {
                order: i + 1,
                description: `Rollback ${change.type} operation for ${change.objectType} ${change.objectName}`,
                estimatedDuration: change.type === 'Removed' ? 15 : 10, // minutes
                riskLevel: change.type === 'Removed' ? 'high' : 'medium',
                dependencies: [],
                verificationSteps: [
                    `Verify ${change.objectType} ${change.objectName} is restored`,
                    'Check data integrity',
                    'Validate dependent objects'
                ]
            };

            rollbackSteps.push(step);
            totalTime += step.estimatedDuration;
        }

        const isRollbackPossible = schemaChanges.every(change => change.type !== 'Removed' || change.sourceDefinition);
        const rollbackComplexity = rollbackSteps.length > 10 ? 'complex' :
            rollbackSteps.length > 5 ? 'moderate' : 'simple';

        return {
            isRollbackPossible,
            rollbackComplexity,
            rollbackSteps,
            estimatedRollbackTime: totalTime,
            rollbackRisks: this.identifyRollbackRisks(schemaChanges),
            prerequisites: ['Database backup available', 'Rollback script tested'],
            successRate: isRollbackPossible ? 95 : 70
        };
    }

    /**
     * Identify rollback risks
     */
    private identifyRollbackRisks(schemaChanges: SchemaDifference[]): string[] {
        const risks: string[] = [];

        const dataLossChanges = schemaChanges.filter(change => change.type === 'Removed');
        if (dataLossChanges.length > 0) {
            risks.push('Potential data loss if rollback is not performed correctly');
        }

        const dependencyChanges = schemaChanges.filter(change =>
            change.differenceDetails.some(detail => detail.toLowerCase().includes('foreign key'))
        );
        if (dependencyChanges.length > 0) {
            risks.push('Foreign key constraint violations may occur during rollback');
        }

        return risks;
    }

    /**
     * Generate migration path
     */
    private async generateMigrationPath(
        schemaChanges: SchemaDifference[],
        sourceConnectionId: string,
        targetConnectionId: string
    ): Promise<MigrationPath> {
        const phases: MigrationPhase[] = [];
        let totalTime = 0;

        // Group changes by risk level for phased migration
        const criticalChanges = schemaChanges.filter(change => this.getChangeRiskLevel(change) === 'critical');
        const highRiskChanges = schemaChanges.filter(change => this.getChangeRiskLevel(change) === 'high');
        const mediumRiskChanges = schemaChanges.filter(change => this.getChangeRiskLevel(change) === 'medium');
        const lowRiskChanges = schemaChanges.filter(change => this.getChangeRiskLevel(change) === 'low');

        // Phase 1: Low risk changes
        if (lowRiskChanges.length > 0) {
            phases.push({
                name: 'Low Risk Changes',
                order: 1,
                description: 'Apply low risk schema changes first',
                estimatedDuration: lowRiskChanges.length * 5,
                canRollback: true,
                rollbackPoint: true,
                tasks: lowRiskChanges.map((change, index) => ({
                    id: `low_${index}`,
                    name: `${change.type} ${change.objectType}`,
                    description: `${change.type} ${change.objectType} ${change.objectName}`,
                    estimatedDuration: 5,
                    riskLevel: 'low',
                    dependencies: [],
                    prerequisites: [],
                    verificationCriteria: [`${change.objectType} ${change.objectName} successfully ${change.type.toLowerCase()}`]
                }))
            });
            totalTime += lowRiskChanges.length * 5;
        }

        // Phase 2: Medium risk changes
        if (mediumRiskChanges.length > 0) {
            phases.push({
                name: 'Medium Risk Changes',
                order: 2,
                description: 'Apply medium risk schema changes',
                estimatedDuration: mediumRiskChanges.length * 10,
                canRollback: true,
                rollbackPoint: true,
                tasks: mediumRiskChanges.map((change, index) => ({
                    id: `medium_${index}`,
                    name: `${change.type} ${change.objectType}`,
                    description: `${change.type} ${change.objectType} ${change.objectName}`,
                    estimatedDuration: 10,
                    riskLevel: 'medium',
                    dependencies: [],
                    prerequisites: [],
                    verificationCriteria: [`${change.objectType} ${change.objectName} successfully ${change.type.toLowerCase()}`]
                }))
            });
            totalTime += mediumRiskChanges.length * 10;
        }

        // Phase 3: High risk changes
        if (highRiskChanges.length > 0) {
            phases.push({
                name: 'High Risk Changes',
                order: 3,
                description: 'Apply high risk schema changes during maintenance window',
                estimatedDuration: highRiskChanges.length * 15,
                canRollback: true,
                rollbackPoint: false,
                tasks: highRiskChanges.map((change, index) => ({
                    id: `high_${index}`,
                    name: `${change.type} ${change.objectType}`,
                    description: `${change.type} ${change.objectType} ${change.objectName}`,
                    estimatedDuration: 15,
                    riskLevel: 'high',
                    dependencies: [],
                    prerequisites: ['Maintenance window scheduled'],
                    verificationCriteria: [`${change.objectType} ${change.objectName} successfully ${change.type.toLowerCase()}`]
                }))
            });
            totalTime += highRiskChanges.length * 15;
        }

        // Phase 4: Critical changes
        if (criticalChanges.length > 0) {
            phases.push({
                name: 'Critical Changes',
                order: 4,
                description: 'Apply critical schema changes with full system downtime',
                estimatedDuration: criticalChanges.length * 20,
                canRollback: true,
                rollbackPoint: false,
                tasks: criticalChanges.map((change, index) => ({
                    id: `critical_${index}`,
                    name: `${change.type} ${change.objectType}`,
                    description: `${change.type} ${change.objectType} ${change.objectName}`,
                    estimatedDuration: 20,
                    riskLevel: 'critical',
                    dependencies: [],
                    prerequisites: ['Full system backup', 'Stakeholder approval'],
                    verificationCriteria: [`${change.objectType} ${change.objectName} successfully ${change.type.toLowerCase()}`]
                }))
            });
            totalTime += criticalChanges.length * 20;
        }

        const complexity = phases.length > 3 ? 'complex' :
            phases.length > 2 ? 'moderate' : 'simple';

        return {
            phases,
            totalEstimatedTime: totalTime,
            complexity,
            parallelExecution: false, // Sequential for safety
            rollbackPoints: phases.filter(p => p.rollbackPoint).map(p => p.order)
        };
    }

    /**
     * Get change risk level
     */
    private getChangeRiskLevel(change: SchemaDifference): 'low' | 'medium' | 'high' | 'critical' {
        if (change.type === 'Removed' && change.objectType === 'table') return 'critical';
        if (change.type === 'Removed' && change.objectType === 'column') return 'high';
        if (change.type === 'Modified' && change.objectType === 'column') return 'medium';
        if (change.type === 'Added') return 'low';
        return 'medium';
    }

    /**
     * Identify risk mitigation strategies
     */
    private async identifyRiskMitigationStrategies(schemaChanges: SchemaDifference[]): Promise<RiskMitigation[]> {
        const strategies: RiskMitigation[] = [];

        const criticalChanges = schemaChanges.filter(change => this.getChangeRiskLevel(change) === 'critical');
        if (criticalChanges.length > 0) {
            strategies.push({
                risk: 'Data loss from table removal',
                probability: 'medium',
                impact: 'critical',
                mitigationStrategy: 'Create full database backup before migration',
                mitigationCost: 'low',
                responsibleParty: 'Database Administrator',
                dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
            });
        }

        const highRiskChanges = schemaChanges.filter(change => this.getChangeRiskLevel(change) === 'high');
        if (highRiskChanges.length > 0) {
            strategies.push({
                risk: 'Application compatibility issues',
                probability: 'high',
                impact: 'high',
                mitigationStrategy: 'Perform thorough application testing',
                mitigationCost: 'medium',
                responsibleParty: 'Development Team',
                dueDate: new Date(Date.now() + 48 * 60 * 60 * 1000) // 48 hours from now
            });
        }

        return strategies;
    }

    /**
     * Assess stakeholder impact
     */
    private async assessStakeholderImpact(schemaChanges: SchemaDifference[]): Promise<StakeholderImpact[]> {
        const stakeholders: StakeholderImpact[] = [];

        // Identify different stakeholder groups based on changes
        const businessUsers = schemaChanges.some(change =>
            ['table', 'view'].includes(change.objectType) &&
            (change.objectName.toLowerCase().includes('customer') ||
                change.objectName.toLowerCase().includes('order'))
        );

        if (businessUsers) {
            stakeholders.push({
                stakeholderGroup: 'Business Users',
                impactLevel: 'medium',
                communicationRequired: true,
                approvalRequired: false,
                notificationTimeline: '1 week before deployment',
                concerns: ['Potential downtime', 'Data access changes'],
                mitigationActions: ['Provide alternative access methods', 'Schedule during off-hours']
            });
        }

        const developers = schemaChanges.some(change => change.objectType === 'table' || change.objectType === 'column');
        if (developers) {
            stakeholders.push({
                stakeholderGroup: 'Development Team',
                impactLevel: 'high',
                communicationRequired: true,
                approvalRequired: true,
                notificationTimeline: '2 weeks before deployment',
                concerns: ['Code changes required', 'Testing effort'],
                mitigationActions: ['Provide migration scripts', 'Schedule code review sessions']
            });
        }

        return stakeholders;
    }

    /**
     * Get default business impact assessment
     */
    private getDefaultBusinessImpact(): BusinessImpactAssessment {
        return {
            operationalImpact: 'none',
            financialImpact: 'none',
            complianceImpact: 'none',
            userExperienceImpact: 'none',
            affectedBusinessProcesses: [],
            downtimeRequired: false,
            businessContinuityRisk: 'low'
        };
    }

    /**
     * Get default rollback plan
     */
    private getDefaultRollbackPlan(): RollbackPlan {
        return {
            isRollbackPossible: true,
            rollbackComplexity: 'simple',
            rollbackSteps: [],
            estimatedRollbackTime: 0,
            rollbackRisks: [],
            prerequisites: [],
            successRate: 100
        };
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        Logger.info('ImpactAnalysis disposed', 'dispose');
    }
}