import { ValidationFramework } from '../../src/core/ValidationFramework';

describe('ValidationFramework', () => {
    let validationFramework: ValidationFramework;

    beforeEach(() => {
        validationFramework = new ValidationFramework();
    });

    describe('executeValidation', () => {
        it('should execute validation with no rules', async () => {
            const request = {
                connectionId: 'test-connection',
                rules: [],
                failOnWarnings: false
            };

            const report = await validationFramework.executeValidation(request);

            // When no specific rules are requested, it should run all enabled rules
            expect(report.totalRules).toBeGreaterThan(0);
            expect(typeof report.canProceed).toBe('boolean');
            expect(['passed', 'failed', 'warnings']).toContain(report.overallStatus);
        });

        it('should execute validation with default rules', async () => {
            const request = {
                connectionId: 'test-connection'
            };

            const report = await validationFramework.executeValidation(request);

            expect(report.totalRules).toBeGreaterThan(0);
            expect(report.results).toBeDefined();
            expect(typeof report.canProceed).toBe('boolean');
        });

        it('should handle validation failure', async () => {
            const request = {
                connectionId: 'invalid-connection',
                failOnWarnings: true
            };

            const report = await validationFramework.executeValidation(request);

            // The validation will fail due to connection issues, but the framework should handle it gracefully
            expect(report).toBeDefined();
            expect(typeof report.canProceed).toBe('boolean');
        });
    });

    describe('getEnabledRules', () => {
        it('should return enabled validation rules', () => {
            const enabledRules = validationFramework.getEnabledRules();

            expect(Array.isArray(enabledRules)).toBe(true);
            expect(enabledRules.length).toBeGreaterThan(0);

            // Check that all returned rules are enabled
            enabledRules.forEach(rule => {
                expect(rule.isEnabled).toBe(true);
            });
        });
    });

    describe('registerRule', () => {
        it('should register a new validation rule', () => {
            const newRule = {
                id: 'test-rule',
                name: 'Test Rule',
                description: 'A test validation rule',
                category: 'custom' as const,
                severity: 'info' as const,
                isEnabled: true,
                ruleDefinition: {
                    type: 'custom_logic' as const,
                    expression: 'test expression',
                    parameters: {}
                },
                createdAt: new Date(),
                lastModified: new Date()
            };

            validationFramework.registerRule(newRule);

            const enabledRules = validationFramework.getEnabledRules();
            const registeredRule = enabledRules.find(rule => rule.id === 'test-rule');

            expect(registeredRule).toBeDefined();
            expect(registeredRule?.name).toBe('Test Rule');
        });
    });

    describe('getStats', () => {
        it('should return validation framework statistics', () => {
            const stats = validationFramework.getStats();

            expect(stats).toHaveProperty('totalRules');
            expect(stats).toHaveProperty('enabledRules');
            expect(stats).toHaveProperty('rulesByCategory');
            expect(stats).toHaveProperty('activeValidations');

            expect(typeof stats.totalRules).toBe('number');
            expect(typeof stats.enabledRules).toBe('number');
            expect(typeof stats.activeValidations).toBe('number');
        });
    });

    describe('dispose', () => {
        it('should dispose of validation framework resources', () => {
            validationFramework.dispose();

            // After dispose, stats should show cleared state
            const stats = validationFramework.getStats();
            expect(stats.totalRules).toBe(0);
            expect(stats.activeValidations).toBe(0);
        });
    });
});