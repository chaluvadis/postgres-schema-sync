import { Logger } from '@/utils/Logger';
import { Parser } from 'node-sql-parser';

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
    private sqlParser: Parser;

    constructor(sourceObjects: SchemaObject[], targetObjects: SchemaObject[]) {
        this.sourceObjects = new Map(sourceObjects.map(obj => [`${obj.schema}.${obj.name}`, obj]));
        this.targetObjects = new Map(targetObjects.map(obj => [`${obj.schema}.${obj.name}`, obj]));
        this.sqlParser = new Parser();
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
                if (!targetObj) {throw new Error('Target object required for alter');}
                return {
                    ...baseDiff,
                    sql: this.generateAlterSql(sourceObj, targetObj),
                    rollbackSql: this.generateAlterSql(targetObj, sourceObj),
                    riskLevel: this.assessAlterRisk(sourceObj, targetObj)
                };
        }
    }

    private objectsDiffer(obj1: SchemaObject, obj2: SchemaObject): boolean {
        // Parse and compare schema objects based on type using AST when possible
        switch (obj1.type) {
            case 'table':
                return this.compareTables(obj1, obj2);
            case 'view':
                return this.compareViews(obj1, obj2);
            case 'function':
            case 'procedure':
                return this.compareFunctions(obj1, obj2);
            case 'sequence':
                return this.compareSequences(obj1, obj2);
            case 'type':
            case 'domain':
                return this.compareTypes(obj1, obj2);
            default:
                // Fallback to AST-based comparison if possible
                return this.compareDefinitionsWithAST(obj1.definition, obj2.definition);
        }
    }

    private compareDefinitionsWithAST(def1: string, def2: string): boolean {
        try {
            const ast1 = this.sqlParser.parse(def1, { database: 'postgresql' });
            const ast2 = this.sqlParser.parse(def2, { database: 'postgresql' });

            // Compare AST structures
            return JSON.stringify(ast1) !== JSON.stringify(ast2);
        } catch (error) {
            // Fallback to string comparison
            return def1.trim() !== def2.trim();
        }
    }

    private compareTables(obj1: SchemaObject, obj2: SchemaObject): boolean {
        // Parse CREATE TABLE statements and compare structure
        const columns1 = this.parseTableColumns(obj1.definition);
        const columns2 = this.parseTableColumns(obj2.definition);
        const constraints1 = this.parseTableConstraints(obj1.definition);
        const constraints2 = this.parseTableConstraints(obj2.definition);

        return !this.arraysEqual(columns1, columns2) || !this.arraysEqual(constraints1, constraints2);
    }

    private compareViews(obj1: SchemaObject, obj2: SchemaObject): boolean {
        // Compare view definitions (simplified)
        const def1 = this.normalizeSql(obj1.definition);
        const def2 = this.normalizeSql(obj2.definition);
        return def1 !== def2;
    }

    private compareFunctions(obj1: SchemaObject, obj2: SchemaObject): boolean {
        // Compare function signatures and bodies
        const sig1 = this.extractFunctionSignature(obj1.definition);
        const sig2 = this.extractFunctionSignature(obj2.definition);
        return sig1 !== sig2 || obj1.definition !== obj2.definition;
    }

    private compareSequences(obj1: SchemaObject, obj2: SchemaObject): boolean {
        // Compare sequence parameters
        const params1 = this.parseSequenceParams(obj1.definition);
        const params2 = this.parseSequenceParams(obj2.definition);
        return !this.objectsEqual(params1, params2);
    }

    private compareTypes(obj1: SchemaObject, obj2: SchemaObject): boolean {
        // Compare type definitions
        return this.normalizeSql(obj1.definition) !== this.normalizeSql(obj2.definition);
    }

    private parseTableColumns(definition: string): any[] {
        try {
            // Try AST-based parsing first
            const ast = this.sqlParser.parse(definition, { database: 'postgresql' });

            if (ast && Array.isArray(ast) && ast.length > 0) {
                const createTableAst = ast[0];
                if (createTableAst.type === 'create' && createTableAst.keyword === 'table') {
                    return this.extractColumnsFromAST(createTableAst);
                }
            }
        } catch (error) {
            Logger.warn('AST parsing failed, falling back to regex parsing', 'SchemaDiffer.parseTableColumns', { error: String(error) });
        }

        // Fallback to enhanced regex-based parsing
        return this.parseTableColumnsRegex(definition);
    }

    private extractColumnsFromAST(ast: any): any[] {
        const columns: any[] = [];

        if (ast.create_definitions) {
            for (const def of ast.create_definitions) {
                if (def.resource === 'column') {
                    columns.push({
                        name: def.column.column,
                        type: this.formatColumnType(def.definition),
                        definition: def.definition?.dataType || def.definition?.type,
                        nullable: !def.nullable,
                        default: def.default_val?.value
                    });
                }
            }
        }

        return columns;
    }

    private extractConstraintsFromAST(ast: any): any[] {
        const constraints: any[] = [];

        if (ast.create_definitions) {
            for (const def of ast.create_definitions) {
                if (def.resource === 'constraint') {
                    if (def.constraint_type === 'primary key') {
                        constraints.push({
                            type: 'PRIMARY KEY',
                            columns: def.definition?.columns || []
                        });
                    } else if (def.constraint_type === 'foreign key') {
                        constraints.push({
                            type: 'FOREIGN KEY',
                            columns: def.definition?.columns || [],
                            refTable: def.definition?.reference?.table,
                            refColumns: def.definition?.reference?.columns || []
                        });
                    } else if (def.constraint_type === 'unique') {
                        constraints.push({
                            type: 'UNIQUE',
                            columns: def.definition?.columns || []
                        });
                    }
                }
            }
        }

        return constraints;
    }

    private formatColumnType(definition: any): string {
        if (!definition) {return 'unknown';}

        if (definition.dataType) {
            let type = definition.dataType;
            if (definition.length) {
                type += `(${definition.length})`;
            }
            return type;
        }

        return definition.type || 'unknown';
    }

    private parseTableColumnsRegex(definition: string): any[] {
        // Enhanced regex-based parsing with better handling of complex types
        const columns: any[] = [];

        try {
            // Try AST parsing first for better accuracy
            const ast = this.sqlParser.parse(definition, { database: 'postgresql' });
            if (ast && Array.isArray(ast) && ast.length > 0) {
                const createTableAst = ast[0];
                if (createTableAst.type === 'create' && createTableAst.keyword === 'table') {
                    return this.extractColumnsFromAST(createTableAst);
                }
            }
        } catch (astError) {
            Logger.debug('AST parsing failed for table columns, using regex fallback', 'SchemaDiffer.parseTableColumnsRegex', {
                error: String(astError)
            });
        }

        // Split by commas but be careful about commas inside parentheses
        const columnDefinitions = this.splitByCommasOutsideParentheses(definition);

        for (const colDef of columnDefinitions) {
            const trimmed = colDef.trim();
            if (!trimmed || trimmed.toUpperCase().startsWith('PRIMARY KEY') ||
                trimmed.toUpperCase().startsWith('FOREIGN KEY') ||
                trimmed.toUpperCase().startsWith('UNIQUE') ||
                trimmed.toUpperCase().startsWith('CHECK')) {
                continue; // Skip constraints
            }

            // Parse column name and type
            const columnMatch = trimmed.match(/^(\w+)\s+(.+?)(?:\s+DEFAULT\s+.+?)?(?:\s+NOT\s+NULL)?(?:\s+NULL)?$/i);
            if (columnMatch) {
                const [, name, typeDef] = columnMatch;
                columns.push({
                    name,
                    type: typeDef.trim(),
                    definition: trimmed
                });
            }
        }

        return columns;
    }

    private splitByCommasOutsideParentheses(sql: string): string[] {
        const parts: string[] = [];
        let current = '';
        let parenDepth = 0;

        for (let i = 0; i < sql.length; i++) {
            const char = sql[i];
            if (char === '(') {
                parenDepth++;
                current += char;
            } else if (char === ')') {
                parenDepth--;
                current += char;
            } else if (char === ',' && parenDepth === 0) {
                parts.push(current);
                current = '';
            } else {
                current += char;
            }
        }

        if (current.trim()) {
            parts.push(current);
        }

        return parts;
    }

    private parseTableConstraints(definition: string): any[] {
        const constraints: any[] = [];

        try {
            // Try AST parsing first for better accuracy
            const ast = this.sqlParser.parse(definition, { database: 'postgresql' });
            if (ast && Array.isArray(ast) && ast.length > 0) {
                const createTableAst = ast[0];
                if (createTableAst.type === 'create' && createTableAst.keyword === 'table') {
                    return this.extractConstraintsFromAST(createTableAst);
                }
            }
        } catch (astError) {
            Logger.debug('AST parsing failed for table constraints, using regex fallback', 'SchemaDiffer.parseTableConstraints', {
                error: String(astError)
            });
        }

        // Parse constraints (simplified)
        const pkMatch = definition.match(/PRIMARY KEY\s*\(([^)]+)\)/i);
        if (pkMatch) {
            constraints.push({ type: 'PRIMARY KEY', columns: pkMatch[1].split(',').map(s => s.trim()) });
        }

        const fkMatches = definition.matchAll(/FOREIGN KEY\s*\(([^)]+)\)\s*REFERENCES\s*(\w+)\s*\(([^)]+)\)/gi);
        for (const match of fkMatches) {
            constraints.push({
                type: 'FOREIGN KEY',
                columns: match[1].split(',').map(s => s.trim()),
                refTable: match[2],
                refColumns: match[3].split(',').map(s => s.trim())
            });
        }

        return constraints;
    }

    private extractFunctionSignature(definition: string): string {
        try {
            // Try AST parsing first for better accuracy
            const ast = this.sqlParser.parse(definition, { database: 'postgresql' });
            if (ast && Array.isArray(ast) && ast.length > 0) {
                const createFunctionAst = ast[0];
                if (createFunctionAst.type === 'create' && createFunctionAst.keyword === 'function') {
                    const params = createFunctionAst.params || [];
                    return params.map((p: any) => `${p.name} ${p.dataType}`).join(', ');
                }
            }
        } catch (astError) {
            Logger.debug('AST parsing failed for function signature, using regex fallback', 'SchemaDiffer.extractFunctionSignature', {
                error: String(astError)
            });
        }

        // Extract function signature (simplified)
        const match = definition.match(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+\w+\s*\(([^)]*)\)/i);
        return match ? match[1] : '';
    }

    private parseSequenceParams(definition: string): any {
        try {
            // Try AST parsing first for better accuracy
            const ast = this.sqlParser.parse(definition, { database: 'postgresql' });
            if (ast && Array.isArray(ast) && ast.length > 0) {
                const createSequenceAst = ast[0];
                if (createSequenceAst.type === 'create' && createSequenceAst.keyword === 'sequence') {
                    const params: any = {};
                    if (createSequenceAst.start) {params.start = parseInt(createSequenceAst.start);}
                    if (createSequenceAst.increment) {params.increment = parseInt(createSequenceAst.increment);}
                    if (createSequenceAst.minvalue) {params.minvalue = parseInt(createSequenceAst.minvalue);}
                    if (createSequenceAst.maxvalue) {params.maxvalue = parseInt(createSequenceAst.maxvalue);}
                    return params;
                }
            }
        } catch (astError) {
            Logger.debug('AST parsing failed for sequence params, using regex fallback', 'SchemaDiffer.parseSequenceParams', {
                error: String(astError)
            });
        }

        // Parse sequence parameters (simplified)
        const params: any = {};
        const startMatch = definition.match(/START\s+(?:WITH\s+)?(\d+)/i);
        if (startMatch) {params.start = parseInt(startMatch[1]);}

        const incrementMatch = definition.match(/INCREMENT\s+(?:BY\s+)?(\d+)/i);
        if (incrementMatch) {params.increment = parseInt(incrementMatch[1]);}

        return params;
    }

    private normalizeSql(sql: string): string {
        return sql.replace(/\s+/g, ' ').trim().toUpperCase();
    }

    private arraysEqual(a: any[], b: any[]): boolean {
        if (a.length !== b.length) {return false;}
        return a.every((val, index) => this.deepEqual(val, b[index]));
    }

    private objectsEqual(a: any, b: any): boolean {
        return this.deepEqual(a, b);
    }

    private deepEqual(a: any, b: any): boolean {
        if (a === b) {return true;}
        if (a == null || b == null) {return a === b;}
        if (typeof a !== typeof b) {return false;}

        if (Array.isArray(a)) {
            return this.arraysEqual(a, b);
        }

        if (typeof a === 'object') {
            const keysA = Object.keys(a);
            const keysB = Object.keys(b);
            if (keysA.length !== keysB.length) {return false;}
            return keysA.every(key => this.deepEqual(a[key], b[key]));
        }

        return false;
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
        // Generate specific ALTER statements based on differences
        switch (from.type) {
            case 'table':
                return this.generateAlterTableSql(from, to);
            case 'view':
                return this.generateAlterViewSql(from, to);
            case 'function':
            case 'procedure':
                return this.generateAlterFunctionSql(from, to);
            case 'sequence':
                return this.generateAlterSequenceSql(from, to);
            case 'type':
            case 'domain':
                return this.generateAlterTypeSql(from, to);
            default:
                return `-- ALTER ${from.type.toUpperCase()} ${from.schema}.${from.name} ...`;
        }
    }

    private generateAlterTableSql(from: SchemaObject, to: SchemaObject): string {
        const statements: string[] = [];
        const fromColumns = this.parseTableColumns(from.definition);
        const toColumns = this.parseTableColumns(to.definition);
        const fromConstraints = this.parseTableConstraints(from.definition);
        const toConstraints = this.parseTableConstraints(to.definition);

        // Find added columns with proper NULL/NOT NULL handling
        for (const toCol of toColumns) {
            const fromCol = fromColumns.find(c => c.name === toCol.name);
            if (!fromCol) {
                // New column - handle defaults and nullability
                let addStmt = `ALTER TABLE ${from.schema}.${from.name} ADD COLUMN ${toCol.name} ${toCol.type}`;
                if (toCol.default !== undefined) {
                    addStmt += ` DEFAULT ${toCol.default}`;
                }
                if (toCol.nullable === false) {
                    addStmt += ' NOT NULL';
                }
                statements.push(`${addStmt};`);
            } else if (fromCol.type !== toCol.type) {
                // Type change - requires careful handling
                statements.push(`ALTER TABLE ${from.schema}.${from.name} ALTER COLUMN ${toCol.name} TYPE ${toCol.type};`);
            } else if (fromCol.nullable !== toCol.nullable) {
                // Nullability change
                if (toCol.nullable === false && fromCol.nullable !== false) {
                    statements.push(`ALTER TABLE ${from.schema}.${from.name} ALTER COLUMN ${toCol.name} SET NOT NULL;`);
                } else if (toCol.nullable === true && fromCol.nullable === false) {
                    statements.push(`ALTER TABLE ${from.schema}.${from.name} ALTER COLUMN ${toCol.name} DROP NOT NULL;`);
                }
            }
        }

        // Find dropped columns with CASCADE consideration
        for (const fromCol of fromColumns) {
            const toCol = toColumns.find(c => c.name === fromCol.name);
            if (!toCol) {
                // Check if column is referenced by constraints before dropping
                const isReferenced = fromConstraints.some(con =>
                    con.type === 'FOREIGN KEY' && con.columns.includes(fromCol.name)
                );
                const cascade = isReferenced ? ' CASCADE' : '';
                statements.push(`ALTER TABLE ${from.schema}.${from.name} DROP COLUMN ${fromCol.name}${cascade};`);
            }
        }

        // Handle constraint changes with specific statements
        this.generateConstraintChanges(from, to, fromConstraints, toConstraints, statements);

        // Handle index changes
        this.generateIndexChanges(from, to, statements);

        return statements.length > 0 ? statements.join('\n') : `-- No changes detected for table ${from.schema}.${from.name}`;
    }

    private generateConstraintChanges(from: SchemaObject, to: SchemaObject, fromConstraints: any[], toConstraints: any[], statements: string[]): void {
        const tableName = `${from.schema}.${from.name}`;

        // Find added constraints
        for (const toConstraint of toConstraints) {
            const exists = fromConstraints.some(fc =>
                fc.type === toConstraint.type &&
                JSON.stringify(fc.columns) === JSON.stringify(toConstraint.columns)
            );
            if (!exists) {
                switch (toConstraint.type) {
                    case 'PRIMARY KEY':
                        statements.push(`ALTER TABLE ${tableName} ADD PRIMARY KEY (${toConstraint.columns.join(', ')});`);
                        break;
                    case 'FOREIGN KEY':
                        statements.push(`ALTER TABLE ${tableName} ADD FOREIGN KEY (${toConstraint.columns.join(', ')}) REFERENCES ${toConstraint.refTable} (${toConstraint.refColumns.join(', ')});`);
                        break;
                    case 'UNIQUE':
                        statements.push(`ALTER TABLE ${tableName} ADD UNIQUE (${toConstraint.columns.join(', ')});`);
                        break;
                }
            }
        }

        // Find dropped constraints (more complex - would need constraint names)
        // For now, add comments about constraint changes
        if (fromConstraints.length !== toConstraints.length) {
            statements.push(`-- Note: Constraint changes detected. Manual review may be required for ${tableName}`);
        }
    }

    private generateIndexChanges(from: SchemaObject, to: SchemaObject, statements: string[]): void {
        // This would require parsing index definitions from schema
        // For now, add a note about potential index changes
        statements.push(`-- Note: Check for required index changes on ${from.schema}.${from.name}`);
    }

    private generateAlterViewSql(from: SchemaObject, to: SchemaObject): string {
        // Views are typically dropped and recreated
        return `DROP VIEW ${from.schema}.${from.name};\n${to.definition};`;
    }

    private generateAlterFunctionSql(from: SchemaObject, to: SchemaObject): string {
        // Functions can be replaced
        return `CREATE OR REPLACE ${to.definition};`;
    }

    private generateAlterSequenceSql(from: SchemaObject, to: SchemaObject): string {
        const statements: string[] = [];
        const fromParams = this.parseSequenceParams(from.definition);
        const toParams = this.parseSequenceParams(to.definition);

        if (fromParams.start !== toParams.start) {
            statements.push(`ALTER SEQUENCE ${from.schema}.${from.name} START WITH ${toParams.start};`);
        }
        if (fromParams.increment !== toParams.increment) {
            statements.push(`ALTER SEQUENCE ${from.schema}.${from.name} INCREMENT BY ${toParams.increment};`);
        }

        return statements.join('\n');
    }

    private generateAlterTypeSql(from: SchemaObject, to: SchemaObject): string {
        // Types are typically dropped and recreated
        return `DROP TYPE ${from.schema}.${from.name};\n${to.definition};`;
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
        // Build proper dependency graph
        const graph: Map<string, SchemaDifference> = new Map();
        const dependencies: Map<string, Set<string>> = new Map();
        const reverseDeps: Map<string, Set<string>> = new Map();

        // Initialize graphs
        for (const diff of differences) {
            const key = `${diff.schema}.${diff.name}`;
            graph.set(key, diff);
            dependencies.set(key, new Set());
            reverseDeps.set(key, new Set());
        }

        // Build dependency relationships
        for (const diff of differences) {
            const key = `${diff.schema}.${diff.name}`;

            // Add explicit dependencies
            for (const dep of diff.dependencies) {
                if (graph.has(dep)) {
                    dependencies.get(key)!.add(dep);
                    reverseDeps.get(dep)!.add(key);
                }
            }

            // Add implicit dependencies based on object types and references
            this.addImplicitDependencies(diff, differences, dependencies, reverseDeps);
        }

        // Topological sort
        const sorted: SchemaDifference[] = [];
        const visited = new Set<string>();
        const visiting = new Set<string>();

        const visit = (key: string) => {
            if (visited.has(key)) {return;}
            if (visiting.has(key)) {
                Logger.warn('Circular dependency detected', 'SchemaDiffer.sortByDependencies', { key });
                return;
            }

            visiting.add(key);

            // Visit all dependencies first
            for (const dep of dependencies.get(key) || []) {
                visit(dep);
            }

            visiting.delete(key);
            visited.add(key);
            sorted.push(graph.get(key)!);
        };

        // Process in dependency order: drops (reverse), then alters, then creates
        const drops = differences.filter(d => d.type === 'drop').map(d => `${d.schema}.${d.name}`);
        const alters = differences.filter(d => d.type === 'alter').map(d => `${d.schema}.${d.name}`);
        const creates = differences.filter(d => d.type === 'create').map(d => `${d.schema}.${d.name}`);

        // For drops, we want reverse dependency order (drop dependents first)
        const dropOrder = this.getTopologicalOrder(drops, reverseDeps);

        // For creates and alters, normal dependency order
        const createAlterOrder = this.getTopologicalOrder([...alters, ...creates], dependencies);

        [...dropOrder, ...createAlterOrder].forEach(key => {
            if (!visited.has(key)) {
                visit(key);
            }
        });

        return sorted;
    }

    private addImplicitDependencies(diff: SchemaDifference, allDiffs: SchemaDifference[], dependencies: Map<string, Set<string>>, reverseDeps: Map<string, Set<string>>): void {
        const key = `${diff.schema}.${diff.name}`;

        if (diff.type === 'create' && diff.objectType === 'table') {
            // Tables depend on their referenced tables
            const referencedTables = this.extractReferencedTables(diff.sql);
            for (const refTable of referencedTables) {
                const refKey = `public.${refTable}`; // Assume public schema
                if (dependencies.has(refKey)) {
                    dependencies.get(key)!.add(refKey);
                    reverseDeps.get(refKey)!.add(key);
                }
            }
        } else if (diff.type === 'drop' && diff.objectType === 'table') {
            // When dropping tables, dependents must be dropped first
            for (const otherDiff of allDiffs) {
                if (otherDiff.type === 'drop' && otherDiff.objectType === 'table' && otherDiff.name !== diff.name) {
                    const otherKey = `${otherDiff.schema}.${otherDiff.name}`;
                    const referencedTables = this.extractReferencedTables(otherDiff.sql);
                    if (referencedTables.includes(diff.name)) {
                        dependencies.get(otherKey)!.add(key);
                        reverseDeps.get(key)!.add(otherKey);
                    }
                }
            }
        }
    }

    private extractReferencedTables(sql: string): string[] {
        const tables: string[] = [];

        try {
            // Try AST parsing first for better accuracy
            const ast = this.sqlParser.parse(sql, { database: 'postgresql' });
            if (ast && Array.isArray(ast)) {
                for (const stmt of ast) {
                    if (stmt.type === 'create' && stmt.keyword === 'table') {
                        // Extract foreign key references from CREATE TABLE
                        if (stmt.create_definitions) {
                            for (const def of stmt.create_definitions) {
                                if (def.resource === 'constraint' && def.constraint_type === 'foreign key') {
                                    if (def.definition?.reference?.table) {
                                        tables.push(def.definition.reference.table);
                                    }
                                }
                            }
                        }
                    } else if (stmt.type === 'alter' && stmt.keyword === 'table') {
                        // Extract references from ALTER TABLE
                        if (stmt.expr && stmt.expr.type === 'alter') {
                            for (const action of stmt.expr.actions || []) {
                                if (action.keyword === 'add' && action.resource === 'constraint' && action.constraint_type === 'foreign key') {
                                    if (action.definition?.reference?.table) {
                                        tables.push(action.definition.reference.table);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } catch (astError) {
            Logger.debug('AST parsing failed for referenced tables, using regex fallback', 'SchemaDiffer.extractReferencedTables', {
                error: String(astError)
            });
        }

        // Fallback to regex if AST parsing fails or finds nothing
        if (tables.length === 0) {
            const fkRegex = /REFERENCES\s+(\w+)/gi;
            let match;
            while ((match = fkRegex.exec(sql)) !== null) {
                tables.push(match[1]);
            }
        }

        return [...new Set(tables)]; // Remove duplicates
    }

    private getTopologicalOrder(nodes: string[], deps: Map<string, Set<string>>): string[] {
        const result: string[] = [];
        const visited = new Set<string>();
        const visiting = new Set<string>();

        const visit = (node: string) => {
            if (visited.has(node)) {return;}
            if (visiting.has(node)) {return;} // Skip cycles

            visiting.add(node);

            for (const dep of deps.get(node) || []) {
                visit(dep);
            }

            visiting.delete(node);
            visited.add(node);
            result.push(node);
        };

        for (const node of nodes) {
            if (!visited.has(node)) {
                visit(node);
            }
        }

        return result;
    }
}
