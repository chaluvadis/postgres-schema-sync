import { Logger } from '../utils/Logger';

export interface SchemaObject {
    type: 'table' | 'view' | 'function' | 'procedure' | 'sequence' | 'type' | 'domain' | 'collation' | 'extension' | 'role' | 'tablespace';
    schema: string;
    name: string;
    definition: string;
    dependencies?: string[];
}

export interface SchemaDifference {
    type: 'create' | 'alter' | 'drop';
    objectType: SchemaObject['type'];
    schema: string;
    name: string;
    sql: string;
    rollbackSql?: string;
    riskLevel: 'low' | 'medium' | 'high';
    dependencies: string[];
}

export class SchemaDiffer {
    private sourceObjects: Map<string, SchemaObject>;
    private targetObjects: Map<string, SchemaObject>;

    constructor(sourceObjects: SchemaObject[], targetObjects: SchemaObject[]) {
        this.sourceObjects = new Map(sourceObjects.map(obj => [`${obj.schema}.${obj.name}`, obj]));
        this.targetObjects = new Map(targetObjects.map(obj => [`${obj.schema}.${obj.name}`, obj]));
    }

    compareSchemas(): SchemaDifference[] {
        const differences: SchemaDifference[] = [];

        // Find objects to create (exist in source but not in target)
        for (const [key, sourceObj] of this.sourceObjects) {
            if (!this.targetObjects.has(key)) {
                differences.push(this.createDifference('create', sourceObj));
            }
        }

        // Find objects to drop (exist in target but not in source)
        for (const [key, targetObj] of this.targetObjects) {
            if (!this.sourceObjects.has(key)) {
                differences.push(this.createDifference('drop', targetObj));
            }
        }

        // Find objects to alter (exist in both but different)
        for (const [key, sourceObj] of this.sourceObjects) {
            const targetObj = this.targetObjects.get(key);
            if (targetObj && this.objectsDiffer(sourceObj, targetObj)) {
                differences.push(this.createDifference('alter', sourceObj, targetObj));
            }
        }

        // Sort by dependencies
        return this.sortByDependencies(differences);
    }

    private createDifference(type: SchemaDifference['type'], sourceObj: SchemaObject, targetObj?: SchemaObject): SchemaDifference {
        const baseDiff: Omit<SchemaDifference, 'sql' | 'rollbackSql' | 'riskLevel'> = {
            type,
            objectType: sourceObj.type,
            schema: sourceObj.schema,
            name: sourceObj.name,
            dependencies: sourceObj.dependencies || []
        };

        switch (type) {
            case 'create':
                return {
                    ...baseDiff,
                    sql: this.generateCreateSql(sourceObj),
                    rollbackSql: this.generateDropSql(sourceObj),
                    riskLevel: 'low'
                };
            case 'drop':
                return {
                    ...baseDiff,
                    sql: this.generateDropSql(sourceObj),
                    rollbackSql: this.generateCreateSql(sourceObj),
                    riskLevel: 'high'
                };
            case 'alter':
                if (!targetObj) throw new Error('Target object required for alter');
                return {
                    ...baseDiff,
                    sql: this.generateAlterSql(sourceObj, targetObj),
                    rollbackSql: this.generateAlterSql(targetObj, sourceObj),
                    riskLevel: this.assessAlterRisk(sourceObj, targetObj)
                };
        }
    }

    private objectsDiffer(obj1: SchemaObject, obj2: SchemaObject): boolean {
        // Compare definitions (simplified - in real implementation would be more sophisticated)
        return obj1.definition !== obj2.definition;
    }

    private generateCreateSql(obj: SchemaObject): string {
        // This is a simplified implementation
        // Real implementation would parse the definition and generate proper SQL
        switch (obj.type) {
            case 'table':
                return obj.definition;
            case 'view':
                return `CREATE VIEW ${obj.schema}.${obj.name} AS ${obj.definition}`;
            case 'function':
                return obj.definition;
            case 'procedure':
                return obj.definition;
            case 'sequence':
                return `CREATE SEQUENCE ${obj.schema}.${obj.name}`;
            case 'type':
                return obj.definition;
            case 'domain':
                return obj.definition;
            case 'collation':
                return `CREATE COLLATION ${obj.schema}.${obj.name} ${obj.definition}`;
            case 'extension':
                return `CREATE EXTENSION ${obj.name}`;
            case 'role':
                return `CREATE ROLE ${obj.name}`;
            case 'tablespace':
                return `CREATE TABLESPACE ${obj.name} LOCATION '${obj.definition}'`;
            default:
                return `-- Create ${obj.type} ${obj.schema}.${obj.name}`;
        }
    }

    private generateDropSql(obj: SchemaObject): string {
        const cascade = obj.dependencies && obj.dependencies.length > 0 ? ' CASCADE' : '';
        return `DROP ${obj.type.toUpperCase()} ${obj.schema}.${obj.name}${cascade};`;
    }

    private generateAlterSql(from: SchemaObject, to: SchemaObject): string {
        // Simplified alter generation
        // Real implementation would compare specific attributes
        if (from.type === 'table') {
            return `-- ALTER TABLE ${from.schema}.${from.name} ... (definition comparison needed)`;
        }
        return `-- ALTER ${from.type.toUpperCase()} ${from.schema}.${from.name} ...`;
    }

    private assessAlterRisk(from: SchemaObject, to: SchemaObject): 'low' | 'medium' | 'high' {
        // Assess risk based on object type and changes
        switch (from.type) {
            case 'table':
                // Check if it's adding columns (low), dropping columns (high), changing types (medium)
                return 'medium';
            case 'view':
            case 'function':
            case 'procedure':
                return 'medium';
            default:
                return 'low';
        }
    }

    private sortByDependencies(differences: SchemaDifference[]): SchemaDifference[] {
        // Topological sort based on dependencies
        const sorted: SchemaDifference[] = [];
        const visited = new Set<string>();
        const visiting = new Set<string>();

        const visit = (diff: SchemaDifference) => {
            const key = `${diff.schema}.${diff.name}`;
            if (visited.has(key)) return;
            if (visiting.has(key)) {
                Logger.warn('Circular dependency detected', 'SchemaDiffer.sortByDependencies', { key });
                return;
            }

            visiting.add(key);

            // Visit dependencies first
            for (const dep of diff.dependencies) {
                const depDiff = differences.find(d => `${d.schema}.${d.name}` === dep);
                if (depDiff) {
                    visit(depDiff);
                }
            }

            visiting.delete(key);
            visited.add(key);
            sorted.push(diff);
        };

        // Process drops first (reverse dependency order), then creates, then alters
        const drops = differences.filter(d => d.type === 'drop');
        const creates = differences.filter(d => d.type === 'create');
        const alters = differences.filter(d => d.type === 'alter');

        [...drops, ...creates, ...alters].forEach(visit);

        return sorted;
    }
}