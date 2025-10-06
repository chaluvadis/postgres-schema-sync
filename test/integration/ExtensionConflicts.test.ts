/**
 * Extension Conflict Testing
 *
 * Tests for compatibility with other popular VSCode extensions
 * to ensure no conflicts in functionality or resources.
 */

import { ExtensionTestHelper } from './ExtensionTestHelper';

// Test framework types
declare const describe: any;
declare const it: any;
declare const expect: any;
declare const beforeAll: any;
declare const afterAll: any;

// Popular VSCode extensions that might conflict
const POTENTIAL_CONFLICTING_EXTENSIONS = [
    {
        id: 'ms-vscode.vscode-typescript-next',
        name: 'TypeScript Importer',
        potentialConflicts: [
            'Command palette shortcuts',
            'Language server integration',
            'File type associations'
        ]
    },
    {
        id: 'esbenp.prettier-vscode',
        name: 'Prettier',
        potentialConflicts: [
            'Code formatting',
            'Document save actions',
            'Language server conflicts'
        ]
    },
    {
        id: 'ms-vscode.powershell',
        name: 'PowerShell',
        potentialConflicts: [
            'Terminal integration',
            'Command execution',
            'Script file associations'
        ]
    },
    {
        id: 'redhat.vscode-yaml',
        name: 'YAML Language Support',
        potentialConflicts: [
            'YAML file handling',
            'Schema validation',
            'Language server conflicts'
        ]
    },
    {
        id: 'ms-python.python',
        name: 'Python',
        potentialConflicts: [
            'Language server integration',
            'Code execution',
            'File type detection'
        ]
    },
    {
        id: 'ms-vscode.vscode-json',
        name: 'JSON Language Features',
        potentialConflicts: [
            'JSON file handling',
            'Schema validation',
            'Language features'
        ]
    }
];

describe('Extension Conflict Testing', () => {
    beforeAll(async () => {
        await ExtensionTestHelper.initialize();
    });

    describe('Command Palette Conflicts', () => {
        POTENTIAL_CONFLICTING_EXTENSIONS.forEach(extension => {
            it(`should not conflict with ${extension.name} commands`, async () => {
                console.log(`🔍 Testing command conflicts with ${extension.name}...`);

                // Get PostgreSQL extension commands
                const pgCommands = await ExtensionTestHelper.getPostgreSQLExtensionCommands();

                // Get conflicting extension commands
                const conflictingCommands = await ExtensionTestHelper.getExtensionCommands(extension.id);

                // Check for command ID conflicts
                const commandConflicts = ExtensionTestHelper.findCommandConflicts(pgCommands, conflictingCommands);

                if (commandConflicts.length > 0) {
                    console.warn(`⚠️  Command conflicts found with ${extension.name}:`, commandConflicts);
                }

                // Commands can have same names if they're in different categories
                // But should not have identical command IDs
                const idConflicts = commandConflicts.filter(conflict => conflict.type === 'id');
                expect(idConflicts.length).toBe(0);

                console.log(`✅ No critical command conflicts with ${extension.name}`);

            });
        });
    });

    describe('Language Server Conflicts', () => {
        it('should handle multiple language servers gracefully', async () => {
            console.log('🔧 Testing language server compatibility...');

            // Test with multiple language servers active
            const languageServers = [
                'postgresql-schema-sync-language-server',
                'typescript-language-server',
                'json-language-server',
                'yaml-language-server'
            ];

            for (const server of languageServers) {
                const serverStatus = await ExtensionTestHelper.testLanguageServerCompatibility(server);
                expect(serverStatus.healthy).toBe(true);
            }

            console.log('✅ Language server compatibility verified');

        });

        it('should not interfere with other language features', async () => {
            console.log('🌐 Testing language feature integration...');

            // Test file type associations
            const fileAssociations = await ExtensionTestHelper.getFileTypeAssociations();

            // Should not override other extensions' file associations
            const sqlAssociations = fileAssociations.filter((assoc: any) => assoc.type === 'sql');
            expect(sqlAssociations.length).toBeGreaterThan(0);

            // Test syntax highlighting conflicts
            const syntaxConflicts = await ExtensionTestHelper.testSyntaxHighlightingConflicts();
            expect(syntaxConflicts.critical).toBe(0);

            console.log('✅ Language feature integration works correctly');

        });
    });

    describe('Resource Conflicts', () => {
        it('should not conflict on file system resources', async () => {
            console.log('📁 Testing file system resource conflicts...`);

      // Test temporary file creation
      const tempFiles = await ExtensionTestHelper.testTemporaryFileHandling();

            expect(tempFiles.creationSuccess).toBe(true);
            expect(tempFiles.cleanupSuccess).toBe(true);

            // Test configuration file access
            const configAccess = await ExtensionTestHelper.testConfigurationAccess();
            expect(configAccess.readSuccess).toBe(true);
            expect(configAccess.writeSuccess).toBe(true);

            console.log('✅ File system resources handled correctly');

        });

        it('should handle VSCode API conflicts gracefully', async () => {
            console.log('🔌 Testing VSCode API conflicts...`);;;

      // Test tree view API usage
      const treeViewTests = [
                await ExtensionTestHelper.testTreeViewAPI(),
                await ExtensionTestHelper.testWebviewAPI(),
                await ExtensionTestHelper.testCommandAPI(),
                await ExtensionTestHelper.testConfigurationAPI()
            ];

            const allPassed = treeViewTests.every(test => test.success);
            expect(allPassed).toBe(true);

            console.log('✅ VSCode APIs work correctly');

        });
    });

    describe('UI Component Conflicts', () => {
        it('should not interfere with status bar', async () => {
            console.log('📊 Testing status bar conflicts...`);;;

      // Test status bar item creation
      const statusBarTest = await ExtensionTestHelper.testStatusBarIntegration();
            expect(statusBarTest.itemCreated).toBe(true);
            expect(statusBarTest.itemVisible).toBe(true);

            // Test with multiple status bar items
            const multipleItemsTest = await ExtensionTestHelper.testMultipleStatusBarItems();
            expect(multipleItemsTest.noConflicts).toBe(true);

            console.log('✅ Status bar integration works correctly');

        });

        it('should handle tree view conflicts', async () => {
            console.log('🌳 Testing tree view conflicts...');

            // Test tree view creation and management
            const treeViewTest = await ExtensionTestHelper.testTreeViewIntegration();
            expect(treeViewTest.viewCreated).toBe(true);
            expect(treeViewTest.dataPopulated).toBe(true);

            // Test with multiple tree views
            const multipleViewsTest = await ExtensionTestHelper.testMultipleTreeViews();
            expect(multipleViewsTest.noConflicts).toBe(true);

            console.log('✅ Tree view integration works correctly');

        });

        it('should handle webview conflicts', async () => {
            console.log('🖥️  Testing webview conflicts...`);;;

      // Test webview panel creation
      const webviewTest = await ExtensionTestHelper.testWebviewIntegration();
            expect(webviewTest.panelCreated).toBe(true);
            expect(webviewTest.contentLoaded).toBe(true);

            // Test multiple webview panels
            const multipleWebviewsTest = await ExtensionTestHelper.testMultipleWebviews();
            expect(multipleWebviewsTest.noConflicts).toBe(true);

            console.log('✅ Webview integration works correctly');

        });
    });

    describe('Performance Impact Testing', () => {
        it('should not significantly impact VSCode performance', async () => {
            console.log('⚡ Testing performance impact...`);;;

      // Measure baseline performance
      const baselineMetrics = await ExtensionTestHelper.measureBaselinePerformance();

            // Activate PostgreSQL extension
            await ExtensionTestHelper.activatePostgreSQLExtension();

            // Measure performance with extension active
            const withExtensionMetrics = await ExtensionTestHelper.measureExtensionPerformance();

            // Calculate performance impact
            const performanceImpact = ExtensionTestHelper.calculatePerformanceImpact(
                baselineMetrics,
                withExtensionMetrics
            );

            console.log(`📊 Performance Impact:`);
            console.log(`   Startup time: ${performanceImpact.startupTimeImpact.toFixed(2)}%`);
            console.log(`   Memory usage: ${performanceImpact.memoryUsageImpact.toFixed(2)}%`);
            console.log(`   CPU usage: ${performanceImpact.cpuUsageImpact.toFixed(2)}%`);

            // Performance impact should be reasonable
            expect(performanceImpact.startupTimeImpact).toBeLessThan(50); // < 50% slower startup
            expect(performanceImpact.memoryUsageImpact).toBeLessThan(100); // < 100% more memory
            expect(performanceImpact.cpuUsageImpact).toBeLessThan(30); // < 30% more CPU

            console.log('✅ Performance impact is within acceptable limits');

        });

        it('should handle resource cleanup properly', async () => {
            console.log('🧹 Testing resource cleanup...`);

      // Create multiple resources
      await ExtensionTestHelper.createTestResources();

            // Deactivate extension
            await ExtensionTestHelper.deactivatePostgreSQLExtension();

            // Check for resource leaks
            const resourceLeaks = await ExtensionTestHelper.detectResourceLeaks();

            expect(resourceLeaks.memoryLeaks).toBe(0);
            expect(resourceLeaks.fileHandleLeaks).toBe(0);
            expect(resourceLeaks.eventListenerLeaks).toBe(0);

            console.log('✅ Resource cleanup works correctly');

        });
    });

    describe('Integration Scenario Testing', () => {
        it('should work with popular extension combinations', async () => {
            console.log('🔗 Testing popular extension combinations...`);

      const extensionCombinations = [
                ['ms-vscode.vscode-typescript-next', 'esbenp.prettier-vscode'],
                ['ms-python.python', 'redhat.vscode-yaml'],
                ['ms-vscode.powershell', 'ms-vscode.vscode-json'],
                ['esbenp.prettier-vscode', 'ms-vscode.vscode-typescript-next', 'redhat.vscode-yaml']
            ];

            for (const combination of extensionCombinations) {
                console.log(`   Testing combination: ${combination.join(', ')}`);

                // Install/test extension combination
                const compatibilityTest = await ExtensionTestHelper.testExtensionCombination(combination);
                expect(compatibilityTest.overallScore).toBeGreaterThan(0.7); // 70% compatibility

                if (compatibilityTest.conflicts.length > 0) {
                    console.warn(`   ⚠️  Conflicts found:`, compatibilityTest.conflicts);
                }
            }

            console.log('✅ Extension combinations work correctly');

        });

        it('should handle extension dependency conflicts', async () => {
            console.log('📦 Testing dependency conflicts...`);;;

      // Test Node.js module conflicts
      const moduleConflicts = await ExtensionTestHelper.testModuleConflicts();
            expect(moduleConflicts.critical).toBe(0);

            // Test native module compatibility
            const nativeModuleTest = await ExtensionTestHelper.testNativeModuleCompatibility();
            expect(nativeModuleTest.compatible).toBe(true);

            console.log('✅ Dependency conflicts handled correctly');

        });
    });
});

// Export for use in other test files
export {
    POTENTIAL_CONFLICTING_EXTENSIONS,
    ExtensionTestHelper
};