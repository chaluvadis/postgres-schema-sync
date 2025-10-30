import { SchemaDifference } from './SchemaComparison';
import { Logger } from '@/utils/Logger';
import { QueryExecutionService } from '@/services/QueryExecutionService';
import { ValidationFramework, ValidationRequest, ValidationReport } from '../../core/ValidationFramework';
import {
    EnhancedMigrationScript,
    SchemaSnapshot,
    MigrationStep,
    RollbackScript,
    ValidationStep,
    MigrationDependency,
    MigrationMetadata,
    PreCondition,
    PostCondition
} from './MigrationTypes';

/**
 * MigrationScriptGenerator - Handles the generation of enhanced migration scripts
 * Responsible for creating comprehensive migration scripts with rollback and validation capabilities
 */
export class MigrationScriptGenerator {
    private queryService: QueryExecutionService;
    private validationFramework: ValidationFramework;

    /**
     * Creates a new MigrationScriptGenerator instance
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
        } = {}
    ): Promise<EnhancedMigrationScript> {
        // Input validation
        if (!sourceConnectionId || typeof sourceConnectionId !== 'string') {
            throw new Error('sourceConnectionId must be a non-empty string');
        }
        if (!targetConnectionId || typeof targetConnectionId !== 'string') {
            throw new Error('targetConnectionId must be a non-empty string');
        }
        if (!Array.isArray(schemaChanges)) {
            throw new Error('schemaChanges must be an array');
        }
        if (schemaChanges.length === 0) {
            throw new Error('schemaChanges array cannot be empty');
        }
        if (options.businessJustification && typeof options.businessJustification !== 'string') {
            throw new Error('businessJustification must be a string if provided');
        }

        try {
            Logger.info('Generating enhanced migration script', 'generateEnhancedMigrationScript', {
                sourceConnectionId,
                targetConnectionId,
                changeCount: schemaChanges.length,
                options
            });

            // Create schema snapshots
            const sourceSnapshot = await this.createSchemaSnapshot(sourceConnectionId);
            const targetSnapshot = await this.createSchemaSnapshot(targetConnectionId);

            // Generate migration steps with proper ordering
            const migrationSteps = await this.generateMigrationSteps(schemaChanges, sourceConnectionId, targetConnectionId);

            // Generate rollback script if requested
            const rollbackScript = options.includeRollback !== false ?
                await this.generateRollbackScript(migrationSteps, sourceConnectionId, targetConnectionId) :
                this.getDefaultRollbackScript();

            // Generate validation steps if requested
            const validationSteps = options.includeValidation !== false ?
                await this.generateValidationSteps(migrationSteps, sourceConnectionId, targetConnectionId) :
                [];

            // Analyze dependencies between migration steps
            const dependencies = await this.analyzeMigrationDependencies(migrationSteps, sourceConnectionId, targetConnectionId);

            // Calculate estimated execution time
            const estimatedExecutionTime = migrationSteps.reduce((total, step) => total + step.estimatedDuration, 0) / 60; // Convert to minutes

            // Assess overall risk level
            const riskLevel = this.assessMigrationRiskLevel(migrationSteps);

            const script: EnhancedMigrationScript = {
                id: this.generateId(),
                name: `Migration Script ${new Date().toISOString().split('T')[0]}`,
                description: `Automated migration script for ${schemaChanges.length} schema changes`,
                version: '1.0.0',
                sourceSchema: sourceSnapshot,
                targetSchema: targetSnapshot,
                migrationSteps,
                rollbackScript,
                validationSteps,
                dependencies,
                metadata: {
                    author: 'SchemaComparisonView',
                    tags: ['automated', 'schema-comparison'],
                    businessJustification: options.businessJustification || 'Schema synchronization between environments',
                    changeType: 'feature',
                    environment: 'production',
                    testingRequired: true,
                    documentationUpdated: false
                },
                generatedAt: new Date(),
                estimatedExecutionTime,
                riskLevel
            };

            Logger.info('Enhanced migration script generated', 'generateEnhancedMigrationScript', {
                scriptId: script.id,
                stepCount: migrationSteps.length,
                estimatedTime: `${estimatedExecutionTime} minutes`,
                riskLevel,
                rollbackIncluded: options.includeRollback !== false
            });

            return script;

        } catch (error) {
            Logger.error('Failed to generate enhanced migration script', error as Error);
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
        if (!connectionId || typeof connectionId !== 'string') {
            throw new Error('connectionId must be a non-empty string');
        }

        try {
            Logger.info('Creating schema snapshot', 'createSchemaSnapshot', { connectionId });

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
            const objects: Array<{
                type: string;
                schema: string;
                name: string;
                table?: string;
                owner?: string;
                definition: string;
            }> = [];

            // Add tables
            tablesResult.rows.forEach((table: any) => {
                objects.push({
                    type: 'table',
                    schema: table[0], // schema_name
                    name: table[1],   // table_name
                    owner: table[2],  // owner
                    definition: `CREATE TABLE ${table[0]}.${table[1]} (\n  -- Columns will be added below\n);`
                });
            });

            // Add columns to table definitions
            objects.forEach(table => {
                if (table.type === 'table') {
                    const tableColumns = columnsResult.rows.filter((col: any) =>
                        col[0] === table.schema && col[1] === table.name
                    );

                    const columnDefs = tableColumns.map((col: any) => {
                        const nullable = col[3] === 'YES' ? 'NULL' : 'NOT NULL';
                        const defaultValue = col[5] ? ` DEFAULT ${col[5]}` : '';
                        return `  ${col[2]} ${col[3]}${defaultValue}${nullable}`;
                    });

                    table.definition = `CREATE TABLE ${table.schema}.${table.name} (\n${columnDefs.join(',\n')}\n);`;
                }
            });

            // Add indexes
            indexesResult.rows.forEach((index: any) => {
                objects.push({
                    type: 'index',
                    schema: index[0], // schema_name
                    name: index[2],   // index_name
                    table: index[1],  // table_name
                    definition: index[3] // index_definition
                });
            });

            // Build relationships array
            const relationships: Array<{
                type: string;
                table_schema: string;
                table_name: string;
                constraint_name: string;
                column_name: string;
                foreign_table_schema: string;
                foreign_table_name: string;
                foreign_column_name: string;
            }> = [];
            constraintsResult.rows.forEach((constraint: any) => {
                if (constraint[3] === 'FOREIGN KEY') { // constraint_type
                    relationships.push({
                        type: 'foreign_key',
                        table_schema: constraint[0],
                        table_name: constraint[1],
                        constraint_name: constraint[2],
                        column_name: constraint[4],
                        foreign_table_schema: constraint[5],
                        foreign_table_name: constraint[6],
                        foreign_column_name: constraint[7]
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
                relationships
            };

            Logger.info('Schema snapshot created', 'createSchemaSnapshot', {
                connectionId,
                objectCount: objects.length,
                relationshipCount: relationships.length
            });

            return snapshot;

        } catch (error) {
            Logger.error('Failed to create schema snapshot', error as Error, 'createSchemaSnapshot', { connectionId });
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
    private async generateSchemaHash(objects: Array<{
        type: string;
        schema: string;
        name: string;
        definition: string;
    }>): Promise<string> {
        try {
            // Sort objects consistently for deterministic hashing
            const sortedObjects = objects.sort((a, b) => {
                const keyA = `${a.type}:${a.schema || ''}:${a.name || ''}`;
                const keyB = `${b.type}:${b.schema || ''}:${b.name || ''}`;
                return keyA.localeCompare(keyB);
            });

            // Create a normalized string representation
            const schemaString = sortedObjects.map(obj => {
                const definition = obj.definition || '';
                return `${obj.type}:${obj.schema || ''}:${obj.name || ''}:${definition}`;
            }).join('|');

            // Use crypto.subtle for secure hashing (Web Crypto API)
            try {
                const encoder = new TextEncoder();
                const data = encoder.encode(schemaString);
                const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                return hashHex;
            } catch (cryptoError) {
                // Fallback to simple hash if crypto.subtle is not available
                let hash = 0;
                for (let i = 0; i < schemaString.length; i++) {
                    const char = schemaString.charCodeAt(i);
                    hash = ((hash << 5) - hash) + char;
                    hash = hash & hash; // Convert to 32-bit integer
                }
                return Math.abs(hash).toString(16);
            }

        } catch (error) {
            Logger.error('Failed to generate schema hash', error as Error, 'generateSchemaHash');
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
        targetConnectionId: string
    ): Promise<MigrationStep[]> {
        // Input validation
        if (!Array.isArray(schemaChanges)) {
            throw new Error('schemaChanges must be an array');
        }
        if (!sourceConnectionId || typeof sourceConnectionId !== 'string') {
            throw new Error('sourceConnectionId must be a non-empty string');
        }
        if (!targetConnectionId || typeof targetConnectionId !== 'string') {
            throw new Error('targetConnectionId must be a non-empty string');
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
            throw new Error('changes must be an array');
        }
        // Order: DROP operations first, then CREATE, then ALTER
        const dropOperations = changes.filter(c => c.type === 'Removed');
        const createOperations = changes.filter(c => c.type === 'Added');
        const modifyOperations = changes.filter(c => c.type === 'Modified');

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
        targetConnectionId: string
    ): Promise<MigrationStep> {
        // Input validation
        if (!change || typeof change !== 'object') {
            throw new Error('change must be a valid SchemaDifference object');
        }
        if (!change.objectType || !change.objectName || !change.schema) {
            throw new Error('change must have valid objectType, objectName, and schema properties');
        }
        if (typeof order !== 'number' || order < 1) {
            throw new Error('order must be a positive number');
        }
        if (!sourceConnectionId || typeof sourceConnectionId !== 'string') {
            throw new Error('sourceConnectionId must be a non-empty string');
        }
        if (!targetConnectionId || typeof targetConnectionId !== 'string') {
            throw new Error('targetConnectionId must be a non-empty string');
        }
        const stepId = `step_${order}`;

        // Generate SQL based on change type
        const sqlScript = await this.generateChangeSQL(change, sourceConnectionId, targetConnectionId);

        // Determine operation type
        const operation = change.type === 'Added' ? 'CREATE' :
            change.type === 'Removed' ? 'DROP' : 'ALTER';

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
            postConditions
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
        targetConnectionId: string
    ): Promise<string> {
        // Input validation
        if (!change || typeof change !== 'object') {
            throw new Error('change must be a valid SchemaDifference object');
        }
        if (!sourceConnectionId || typeof sourceConnectionId !== 'string') {
            throw new Error('sourceConnectionId must be a non-empty string');
        }
        if (!targetConnectionId || typeof targetConnectionId !== 'string') {
            throw new Error('targetConnectionId must be a non-empty string');
        }
        try {
            switch (change.type) {
                case 'Added':
                    return await this.generateCreateSQL(change, targetConnectionId);

                case 'Removed':
                    return this.generateDropSQL(change);

                case 'Modified':
                    return await this.generateAlterSQL(change, sourceConnectionId, targetConnectionId);

                default:
                    return `-- Unknown change type: ${change.type}`;
            }
        } catch (error) {
            Logger.error('Failed to generate change SQL', error as Error, 'generateChangeSQL', {
                changeType: change.type,
                objectType: change.objectType,
                objectName: change.objectName
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
        if (!change || typeof change !== 'object') {
            throw new Error('change must be a valid SchemaDifference object');
        }
        if (!targetConnectionId || typeof targetConnectionId !== 'string') {
            throw new Error('targetConnectionId must be a non-empty string');
        }
        if (change.targetDefinition) {
            return change.targetDefinition;
        }

        // Generate CREATE statement by querying target database for actual definitions
        try {
            switch (change.objectType) {
                case 'table':
                    return await this.generateTableCreateSQL(change, targetConnectionId);

                case 'index':
                    return await this.generateIndexCreateSQL(change, targetConnectionId);

                case 'view':
                    return await this.generateViewCreateSQL(change, targetConnectionId);

                case 'function':
                    return await this.generateFunctionCreateSQL(change, targetConnectionId);

                default:
                    return `-- CREATE statement for ${change.objectType} ${change.objectName} needs manual definition`;
            }
        } catch (error) {
            Logger.error('Failed to generate CREATE SQL from target database', error as Error, 'generateCreateSQL', {
                objectType: change.objectType,
                objectName: change.objectName,
                schema: change.schema
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
                const isNullable = col[2] === 'YES';
                const defaultValue = col[3];
                const maxLength = col[4];
                const precision = col[5];
                const scale = col[6];

                let typeDef = dataType;
                if (maxLength && (dataType === 'varchar' || dataType === 'character')) {
                    typeDef = `${dataType}(${maxLength})`;
                } else if (precision && scale && (dataType === 'numeric' || dataType === 'decimal')) {
                    typeDef = `${dataType}(${precision},${scale})`;
                }

                const nullableDef = isNullable ? '' : ' NOT NULL';
                const defaultDef = defaultValue ? ` DEFAULT ${defaultValue}` : '';

                return `  ${columnName} ${typeDef}${nullableDef}${defaultDef}`;
            });

            return `CREATE TABLE ${change.schema}.${change.objectName} (\n${columnDefs.join(',\n')}\n);`;

        } catch (error) {
            Logger.error('Failed to generate table CREATE SQL', error as Error, 'generateTableCreateSQL', {
                schema: change.schema,
                tableName: change.objectName
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
            Logger.error('Failed to generate index CREATE SQL', error as Error, 'generateIndexCreateSQL', {
                schema: change.schema,
                indexName: change.objectName
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
            Logger.error('Failed to generate view CREATE SQL', error as Error, 'generateViewCreateSQL', {
                schema: change.schema,
                viewName: change.objectName
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
            Logger.error('Failed to generate function CREATE SQL', error as Error, 'generateFunctionCreateSQL', {
                schema: change.schema,
                functionName: change.objectName
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
            case 'table':
                return `DROP TABLE IF EXISTS ${change.schema}.${change.objectName} CASCADE;`;

            case 'index':
                return `DROP INDEX IF EXISTS ${change.schema}.${change.objectName} CASCADE;`;

            case 'view':
                return `DROP VIEW IF EXISTS ${change.schema}.${change.objectName} CASCADE;`;

            case 'function':
                return `DROP FUNCTION IF EXISTS ${change.schema}.${change.objectName} CASCADE;`;

            case 'trigger':
                return `DROP TRIGGER IF EXISTS ${change.objectName} ON ${change.schema} CASCADE;`;

            case 'sequence':
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
        targetConnectionId: string
    ): Promise<string> {
        if (change.targetDefinition) {
            return change.targetDefinition;
        }

        // For table modifications, we need to analyze the specific changes
        if (change.objectType === 'table') {
            return this.generateTableAlterSQL(change, sourceConnectionId, targetConnectionId);
        }

        if (change.objectType === 'column') {
            return this.generateColumnAlterSQL(change, sourceConnectionId, targetConnectionId);
        }

        return `-- ALTER statement for ${change.objectType} ${change.objectName} needs manual definition`;
    }

    // Placeholder methods that will be implemented in separate modules
    private generateTableAlterSQL(change: SchemaDifference, sourceConnectionId: string, targetConnectionId: string): Promise<string> {
        // This will be implemented in SQLGeneration module
        return Promise.resolve(`-- ALTER TABLE ${change.schema}.${change.objectName} -- Implementation in SQLGeneration module`);
    }

    private generateColumnAlterSQL(change: SchemaDifference, sourceConnectionId: string, targetConnectionId: string): Promise<string> {
        // This will be implemented in SQLGeneration module
        return Promise.resolve(`-- ALTER COLUMN ${change.schema}.${change.objectName} -- Implementation in SQLGeneration module`);
    }

    private generateRollbackSQL(change: SchemaDifference, sourceConnectionId: string, targetConnectionId: string): Promise<string | undefined> {
        // This will be implemented in RollbackManagement module
        return Promise.resolve(`-- ROLLBACK for ${change.type} ${change.objectType} ${change.objectName} -- Implementation in RollbackManagement module`);
    }

    private generateVerificationQuery(change: SchemaDifference): string | undefined {
        // This will be implemented in Validation module
        return `-- VERIFICATION for ${change.type} ${change.objectType} ${change.objectName} -- Implementation in Validation module`;
    }

    private generatePreConditions(change: SchemaDifference): PreCondition[] {
        // This will be implemented in Validation module
        return [];
    }

    private generatePostConditions(change: SchemaDifference): PostCondition[] {
        // This will be implemented in Validation module
        return [];
    }

    private generateValidationSteps(migrationSteps: MigrationStep[], sourceConnectionId: string, targetConnectionId: string): Promise<ValidationStep[]> {
        // This will be implemented in Validation module
        return Promise.resolve([]);
    }

    private analyzeMigrationDependencies(migrationSteps: MigrationStep[], sourceConnectionId: string, targetConnectionId: string): Promise<MigrationDependency[]> {
        // This will be implemented in DependencyAnalysis module
        return Promise.resolve([]);
    }

    private generateRollbackScript(migrationSteps: MigrationStep[], sourceConnectionId: string, targetConnectionId: string): Promise<RollbackScript> {
        // This will be implemented in RollbackManagement module
        return Promise.resolve(this.getDefaultRollbackScript());
    }

    /**
     * Generates a default rollback script when automatic rollback generation fails
     * Provides manual rollback guidance and fallback procedures
     * @returns Default rollback script with manual intervention steps
     * @private
     */
    private getDefaultRollbackScript(): RollbackScript {
        try {
            Logger.info('Generating default rollback script', 'getDefaultRollbackScript');

            // Create intelligent fallback steps based on common scenarios
            const fallbackSteps: Array<{
                order: number;
                description: string;
                estimatedDuration: number;
                riskLevel: 'low' | 'medium' | 'high' | 'critical';
                dependencies: string[];
                verificationSteps: string[];
            }> = [
                {
                    order: 1,
                    description: 'Manual rollback required - review migration steps',
                    estimatedDuration: 60, // 1 hour for manual intervention
                    riskLevel: 'high',
                    dependencies: [],
                    verificationSteps: [
                        'Document current database state before rollback',
                        'Identify all objects modified by migration',
                        'Plan rollback strategy for each object type',
                        'Test rollback in development environment first',
                        'Backup production data before rollback'
                    ]
                },
                {
                    order: 2,
                    description: 'Restore from database backup if available',
                    estimatedDuration: 30,
                    riskLevel: 'medium',
                    dependencies: ['1'],
                    verificationSteps: [
                        'Verify backup contains pre-migration state',
                        'Test backup restoration procedure',
                        'Validate backup integrity',
                        'Check for backup-related downtime'
                    ]
                }
            ];

            const warnings = [
                'No automatic rollback script could be generated',
                'Manual intervention required for safe rollback',
                'Consider data loss and downtime implications',
                'Test rollback procedure in non-production environment first'
            ];

            const limitations = [
                'Rollback strategy depends on specific migration operations',
                'Data loss may occur if migration modified existing data',
                'Dependent objects may be affected by rollback',
                'Application downtime may be required for complex rollbacks'
            ];

            const defaultScript: RollbackScript = {
                isComplete: false,
                steps: fallbackSteps,
                estimatedRollbackTime: 90, // 1.5 hours total
                successRate: 60, // 60% success rate for manual rollback
                warnings,
                limitations
            };

            Logger.info('Default rollback script generated', 'getDefaultRollbackScript', {
                stepCount: fallbackSteps.length,
                estimatedTime: `${defaultScript.estimatedRollbackTime} minutes`,
                successRate: `${defaultScript.successRate}%`
            });

            return defaultScript;

        } catch (error) {
            Logger.error('Failed to generate default rollback script', error as Error, 'getDefaultRollbackScript');
            // Return minimal fallback
            return {
                isComplete: false,
                steps: [],
                estimatedRollbackTime: 0,
                successRate: 0,
                warnings: ['Failed to generate default rollback script'],
                limitations: ['Manual rollback required']
            };
        }
    }

    /**
     * Assess change risk level
     */
    private assessChangeRiskLevel(change: SchemaDifference): 'low' | 'medium' | 'high' | 'critical' {
        if (change.type === 'Removed' && change.objectType === 'table') return 'critical';
        if (change.type === 'Removed' && change.objectType === 'column') return 'high';
        if (change.type === 'Modified' && change.objectType === 'table') return 'high';
        if (change.type === 'Added') return 'medium';
        return 'low';
    }

    /**
     * Assesses overall risk level of a migration based on its steps
     * @param migrationSteps - Array of migration steps to evaluate
     * @returns Risk level assessment
     * @private
     */
    private assessMigrationRiskLevel(migrationSteps: MigrationStep[]): 'low' | 'medium' | 'high' | 'critical' {
        const criticalSteps = migrationSteps.filter(step => step.riskLevel === 'critical').length;
        const highRiskSteps = migrationSteps.filter(step => step.riskLevel === 'high').length;

        if (criticalSteps > 0) return 'critical';
        if (highRiskSteps > 3) return 'high';
        if (highRiskSteps > 0) return 'medium';
        return 'low';
    }

    /**
     * Estimates the duration of a migration step
     * @param change - Schema difference to estimate duration for
     * @returns Estimated duration in seconds
     * @private
     */
    private estimateStepDuration(change: SchemaDifference): number {
        // Base duration estimates based on object type and operation
        const baseDurations: Record<string, Record<string, number>> = {
            table: { CREATE: 30, ALTER: 60, DROP: 15 },
            index: { CREATE: 45, ALTER: 30, DROP: 10 },
            view: { CREATE: 20, ALTER: 25, DROP: 5 },
            function: { CREATE: 15, ALTER: 20, DROP: 5 },
            column: { CREATE: 10, ALTER: 25, DROP: 8 }
        };

        const objectType = change.objectType.toLowerCase();
        const operation = change.type === 'Added' ? 'CREATE' :
                         change.type === 'Removed' ? 'DROP' : 'ALTER';

        return baseDurations[objectType]?.[operation] || 30; // Default 30 seconds
    }

    /**
     * Generates a unique identifier for migration scripts and executions
     * @returns Unique UUID string
     * @private
     */
    private generateId(): string {
        return crypto.randomUUID();
    }
}