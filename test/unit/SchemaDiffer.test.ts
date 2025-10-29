import { SchemaDiffer, SchemaObject, SchemaDifference } from '../../src/core/SchemaDiffer';

describe('SchemaDiffer', () => {
    let schemaDiffer: SchemaDiffer;

    const createMockSchemaObject = (
        type: SchemaObject['type'],
        schema: string,
        name: string,
        definition: string = '',
        dependencies: string[] = []
    ): SchemaObject => ({
        type,
        schema,
        name,
        definition,
        dependencies
    });

    describe('compareSchemas', () => {
        it('should detect objects to create', () => {
            const sourceObjects: SchemaObject[] = [
                createMockSchemaObject('table', 'public', 'users', 'CREATE TABLE users (...)'),
                createMockSchemaObject('table', 'public', 'posts', 'CREATE TABLE posts (...)')
            ];

            const targetObjects: SchemaObject[] = [
                createMockSchemaObject('table', 'public', 'users', 'CREATE TABLE users (...)')
            ];

            schemaDiffer = new SchemaDiffer(sourceObjects, targetObjects);
            const differences = schemaDiffer.compareSchemas();

            const createDiffs = differences.filter(d => d.type === 'create');
            expect(createDiffs).toHaveLength(1);
            expect(createDiffs[0].name).toBe('posts');
            expect(createDiffs[0].type).toBe('create');
        });

        it('should detect objects to drop', () => {
            const sourceObjects: SchemaObject[] = [
                createMockSchemaObject('table', 'public', 'users', 'CREATE TABLE users (...)')
            ];

            const targetObjects: SchemaObject[] = [
                createMockSchemaObject('table', 'public', 'users', 'CREATE TABLE users (...)'),
                createMockSchemaObject('table', 'public', 'old_table', 'CREATE TABLE old_table (...)')
            ];

            schemaDiffer = new SchemaDiffer(sourceObjects, targetObjects);
            const differences = schemaDiffer.compareSchemas();

            const dropDiffs = differences.filter(d => d.type === 'drop');
            expect(dropDiffs).toHaveLength(1);
            expect(dropDiffs[0].name).toBe('old_table');
            expect(dropDiffs[0].type).toBe('drop');
        });

        it('should detect objects to alter', () => {
            const sourceObjects: SchemaObject[] = [
                createMockSchemaObject('table', 'public', 'users', 'CREATE TABLE users (id INT, name VARCHAR(100))')
            ];

            const targetObjects: SchemaObject[] = [
                createMockSchemaObject('table', 'public', 'users', 'CREATE TABLE users (id INT, name VARCHAR(50))')
            ];

            schemaDiffer = new SchemaDiffer(sourceObjects, targetObjects);
            const differences = schemaDiffer.compareSchemas();

            const alterDiffs = differences.filter(d => d.type === 'alter');
            expect(alterDiffs).toHaveLength(1);
            expect(alterDiffs[0].name).toBe('users');
            expect(alterDiffs[0].type).toBe('alter');
        });

        it('should sort differences by dependencies', () => {
            const sourceObjects: SchemaObject[] = [
                createMockSchemaObject('table', 'public', 'posts', 'CREATE TABLE posts (...)', ['public.users']),
                createMockSchemaObject('table', 'public', 'users', 'CREATE TABLE users (...)')
            ];

            const targetObjects: SchemaObject[] = [];

            schemaDiffer = new SchemaDiffer(sourceObjects, targetObjects);
            const differences = schemaDiffer.compareSchemas();

            // Users table should come before posts table due to dependency
            expect(differences).toHaveLength(2);
            expect(differences[0].name).toBe('users');
            expect(differences[1].name).toBe('posts');
        });
    });

    describe('generateCreateSql', () => {
        beforeEach(() => {
            schemaDiffer = new SchemaDiffer([], []);
        });

        it('should generate CREATE TABLE SQL', () => {
            const tableObj = createMockSchemaObject('table', 'public', 'users', 'CREATE TABLE users (id INT PRIMARY KEY)');

            // Access private method through type assertion
            const differ = schemaDiffer as any;
            const sql = differ.generateCreateSql(tableObj);

            expect(sql).toBe('CREATE TABLE users (id INT PRIMARY KEY)');
        });

        it('should generate CREATE VIEW SQL', () => {
            const viewObj = createMockSchemaObject('view', 'public', 'user_view', 'SELECT * FROM users');

            const differ = schemaDiffer as any;
            const sql = differ.generateCreateSql(viewObj);

            expect(sql).toBe('CREATE VIEW public.user_view AS SELECT * FROM users');
        });

        it('should generate CREATE SEQUENCE SQL', () => {
            const seqObj = createMockSchemaObject('sequence', 'public', 'user_id_seq', '');

            const differ = schemaDiffer as any;
            const sql = differ.generateCreateSql(seqObj);

            expect(sql).toBe('CREATE SEQUENCE public.user_id_seq');
        });
    });

    describe('generateDropSql', () => {
        beforeEach(() => {
            schemaDiffer = new SchemaDiffer([], []);
        });

        it('should generate DROP TABLE SQL', () => {
            const tableObj = createMockSchemaObject('table', 'public', 'users', '', ['public.posts']);

            const differ = schemaDiffer as any;
            const sql = differ.generateDropSql(tableObj);

            expect(sql).toBe('DROP TABLE public.users CASCADE;');
        });

        it('should generate DROP TABLE SQL without CASCADE when no dependencies', () => {
            const tableObj = createMockSchemaObject('table', 'public', 'users', '', []);

            const differ = schemaDiffer as any;
            const sql = differ.generateDropSql(tableObj);

            expect(sql).toBe('DROP TABLE public.users;');
        });
    });

    describe('assessAlterRisk', () => {
        beforeEach(() => {
            schemaDiffer = new SchemaDiffer([], []);
        });

        it('should assess table alterations as medium risk', () => {
            const tableObj = createMockSchemaObject('table', 'public', 'users', '');

            const differ = schemaDiffer as any;
            const risk = differ.assessAlterRisk(tableObj, tableObj);

            expect(risk).toBe('medium');
        });

        it('should assess view alterations as medium risk', () => {
            const viewObj = createMockSchemaObject('view', 'public', 'user_view', '');

            const differ = schemaDiffer as any;
            const risk = differ.assessAlterRisk(viewObj, viewObj);

            expect(risk).toBe('medium');
        });

        it('should assess other object alterations as low risk', () => {
            const seqObj = createMockSchemaObject('sequence', 'public', 'user_seq', '');

            const differ = schemaDiffer as any;
            const risk = differ.assessAlterRisk(seqObj, seqObj);

            expect(risk).toBe('low');
        });
    });

    describe('objectsDiffer', () => {
        beforeEach(() => {
            schemaDiffer = new SchemaDiffer([], []);
        });

        it('should detect different definitions', () => {
            const obj1 = createMockSchemaObject('table', 'public', 'users', 'CREATE TABLE users (id INT)');
            const obj2 = createMockSchemaObject('table', 'public', 'users', 'CREATE TABLE users (id INT, name VARCHAR(100))');

            const differ = schemaDiffer as any;
            const differs = differ.objectsDiffer(obj1, obj2);

            expect(differs).toBe(true);
        });

        it('should not detect difference for identical definitions', () => {
            const obj1 = createMockSchemaObject('table', 'public', 'users', 'CREATE TABLE users (id INT)');
            const obj2 = createMockSchemaObject('table', 'public', 'users', 'CREATE TABLE users (id INT)');

            const differ = schemaDiffer as any;
            const differs = differ.objectsDiffer(obj1, obj2);

            expect(differs).toBe(false);
        });
    });
});