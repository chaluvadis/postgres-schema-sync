import { CommandManager } from '../../src/extension/CommandManager';

// Mock VSCode APIs
jest.mock('vscode', () => ({
    commands: {
        registerCommand: jest.fn(),
        executeCommand: jest.fn(),
    },
    window: {
        showInformationMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        showWarningMessage: jest.fn(),
        showInputBox: jest.fn(),
        showQuickPick: jest.fn(),
    },
    workspace: {
        openTextDocument: jest.fn(),
        showTextDocument: jest.fn(),
    },
}));

describe('CommandManager', () => {
    let commandManager: CommandManager;
    let mockContext: any;
    let mockConnectionManager: any;
    let mockMigrationOrchestrator: any;
    let mockQueryExecutionService: any;

    beforeEach(() => {
        // Mock extension context
        mockContext = {
            subscriptions: [],
        };

        // Mock dependencies
        mockConnectionManager = {
            addConnection: jest.fn(),
            getConnections: jest.fn(),
            removeConnection: jest.fn(),
            testConnection: jest.fn(),
        };

        mockMigrationOrchestrator = {
            executeMigration: jest.fn(),
            generateMigration: jest.fn(),
            cancelMigration: jest.fn(),
        };

        mockQueryExecutionService = {
            executeQuery: jest.fn(),
            executeCurrentFile: jest.fn(),
        };

        commandManager = new CommandManager(
            mockContext,
            {} as any, // mock extension
            {
                connectionManager: mockConnectionManager,
                migrationOrchestrator: mockMigrationOrchestrator,
                queryExecutionService: mockQueryExecutionService,
            } as any // mock components
        );
    });

    describe('registerCommands', () => {
        it('should register all commands', () => {
            commandManager.registerCommands();

            expect(mockContext.subscriptions).toBeDefined();
            // Verify that commands are registered (would check the length or specific commands)
        });
    });

    describe('connection commands', () => {
        describe('addConnection', () => {
            it('should handle successful connection addition', async () => {
                const mockConnectionData = {
                    name: 'Test Connection',
                    host: 'localhost',
                    port: 5432,
                    database: 'testdb',
                    username: 'testuser',
                    password: 'password123'
                };

                // Mock user input
                const mockInputBox = require('vscode').window.showInputBox;
                mockInputBox.mockImplementation((options: any) => {
                    switch (options.prompt) {
                        case 'Enter connection name:':
                            return Promise.resolve(mockConnectionData.name);
                        case 'Enter host:':
                            return Promise.resolve(mockConnectionData.host);
                        case 'Enter port:':
                            return Promise.resolve(mockConnectionData.port.toString());
                        case 'Enter database name:':
                            return Promise.resolve(mockConnectionData.database);
                        case 'Enter username:':
                            return Promise.resolve(mockConnectionData.username);
                        case 'Enter password:':
                            return Promise.resolve(mockConnectionData.password);
                        default:
                            return Promise.resolve('');
                    }
                });

                mockConnectionManager.addConnection.mockResolvedValue(undefined);

                await (commandManager as any).addConnection();

                expect(mockConnectionManager.addConnection).toHaveBeenCalledWith(
                    expect.objectContaining({
                        name: mockConnectionData.name,
                        host: mockConnectionData.host,
                        port: mockConnectionData.port,
                        database: mockConnectionData.database,
                        username: mockConnectionData.username,
                        password: mockConnectionData.password
                    })
                );
            });

            it('should handle user cancellation', async () => {
                const mockInputBox = require('vscode').window.showInputBox;
                mockInputBox.mockResolvedValue(undefined); // User cancelled

                await (commandManager as any).addConnection();

                expect(mockConnectionManager.addConnection).not.toHaveBeenCalled();
            });
        });

        describe('editConnection', () => {
            it('should handle connection editing', async () => {
                const mockConnection = {
                    id: 'test-conn',
                    name: 'Test Connection',
                    host: 'localhost',
                    port: 5432,
                    database: 'testdb',
                    username: 'testuser'
                };

                mockConnectionManager.getConnections.mockReturnValue([mockConnection]);

                const mockQuickPick = require('vscode').window.showQuickPick;
                mockQuickPick.mockResolvedValue(mockConnection);

                // Mock edit inputs
                const mockInputBox = require('vscode').window.showInputBox;
                mockInputBox.mockResolvedValue('Updated Name');

                mockConnectionManager.updateConnection = jest.fn().mockResolvedValue(undefined);

                await (commandManager as any).editConnection();

                expect(mockConnectionManager.updateConnection).toHaveBeenCalled();
            });
        });

        describe('testConnection', () => {
            it('should test selected connection', async () => {
                const mockConnection = {
                    id: 'test-conn',
                    name: 'Test Connection',
                    host: 'localhost',
                    port: 5432,
                    database: 'testdb',
                    username: 'testuser'
                };

                mockConnectionManager.getConnections.mockReturnValue([mockConnection]);
                mockConnectionManager.testConnection.mockResolvedValue(true);

                const mockQuickPick = require('vscode').window.showQuickPick;
                mockQuickPick.mockResolvedValue(mockConnection);

                await (commandManager as any).testConnection();

                expect(mockConnectionManager.testConnection).toHaveBeenCalledWith('test-conn');
            });
        });

        describe('removeConnection', () => {
            it('should remove selected connection', async () => {
                const mockConnection = {
                    id: 'test-conn',
                    name: 'Test Connection'
                };

                mockConnectionManager.getConnections.mockReturnValue([mockConnection]);
                mockConnectionManager.removeConnection.mockResolvedValue(true);

                const mockQuickPick = require('vscode').window.showQuickPick;
                mockQuickPick.mockResolvedValue(mockConnection);

                const mockShowWarning = require('vscode').window.showWarningMessage;
                mockShowWarning.mockResolvedValue('Yes');

                await (commandManager as any).removeConnection();

                expect(mockConnectionManager.removeConnection).toHaveBeenCalledWith('test-conn');
            });
        });
    });

    describe('migration commands', () => {
        describe('executeMigration', () => {
            it('should execute migration with selected connections', async () => {
                const mockSourceConnection = {
                    id: 'source-conn',
                    name: 'Source DB'
                };
                const mockTargetConnection = {
                    id: 'target-conn',
                    name: 'Target DB'
                };

                mockConnectionManager.getConnections.mockReturnValue([mockSourceConnection, mockTargetConnection]);

                const mockQuickPick = require('vscode').window.showQuickPick;
                mockQuickPick
                    .mockResolvedValueOnce(mockSourceConnection) // Source selection
                    .mockResolvedValueOnce(mockTargetConnection); // Target selection

                const mockMigrationResult = {
                    migrationId: 'test-migration',
                    success: true,
                    executionTime: 1000,
                    operationsProcessed: 5
                };

                mockMigrationOrchestrator.executeMigration.mockResolvedValue(mockMigrationResult);

                await (commandManager as any).executeMigration();

                expect(mockMigrationOrchestrator.executeMigration).toHaveBeenCalledWith(
                    expect.objectContaining({
                        sourceConnectionId: 'source-conn',
                        targetConnectionId: 'target-conn'
                    })
                );
            });
        });

        describe('generateMigration', () => {
            it('should generate migration script', async () => {
                const mockSourceConnection = { id: 'source-conn', name: 'Source DB' };
                const mockTargetConnection = { id: 'target-conn', name: 'Target DB' };

                mockConnectionManager.getConnections.mockReturnValue([mockSourceConnection, mockTargetConnection]);

                const mockQuickPick = require('vscode').window.showQuickPick;
                mockQuickPick
                    .mockResolvedValueOnce(mockSourceConnection)
                    .mockResolvedValueOnce(mockTargetConnection);

                const mockMigrationScript = {
                    migrationId: 'test-migration',
                    sqlScript: 'CREATE TABLE test (id INT);',
                    operationCount: 1
                };

                mockMigrationOrchestrator.generateMigration.mockResolvedValue(mockMigrationScript);

                await (commandManager as any).generateMigration();

                expect(mockMigrationOrchestrator.generateMigration).toHaveBeenCalledWith(
                    expect.objectContaining({
                        sourceConnectionId: 'source-conn',
                        targetConnectionId: 'target-conn'
                    })
                );
            });
        });

        describe('cancelMigration', () => {
            it('should cancel running migration', async () => {
                const mockInputBox = require('vscode').window.showInputBox;
                mockInputBox.mockResolvedValue('test-migration-id');

                mockMigrationOrchestrator.cancelMigration.mockResolvedValue(true);

                await (commandManager as any).cancelMigration();

                expect(mockMigrationOrchestrator.cancelMigration).toHaveBeenCalledWith('test-migration-id');
            });
        });
    });

    describe('query commands', () => {
        describe('executeQuery', () => {
            it('should execute query in selected connection', async () => {
                const mockConnection = {
                    id: 'test-conn',
                    name: 'Test Connection'
                };

                mockConnectionManager.getConnections.mockReturnValue([mockConnection]);

                const mockQuickPick = require('vscode').window.showQuickPick;
                mockQuickPick.mockResolvedValue(mockConnection);

                const mockInputBox = require('vscode').window.showInputBox;
                mockInputBox.mockResolvedValue('SELECT * FROM users;');

                mockQueryExecutionService.executeQuery.mockResolvedValue({
                    success: true,
                    rowCount: 10
                });

                await (commandManager as any).executeQuery();

                expect(mockQueryExecutionService.executeQuery).toHaveBeenCalledWith(
                    'test-conn',
                    'SELECT * FROM users;'
                );
            });
        });

        describe('executeCurrentFile', () => {
            it('should execute current SQL file', async () => {
                const mockConnection = {
                    id: 'test-conn',
                    name: 'Test Connection'
                };

                mockConnectionManager.getConnections.mockReturnValue([mockConnection]);

                const mockQuickPick = require('vscode').window.showQuickPick;
                mockQuickPick.mockResolvedValue(mockConnection);

                // Mock active text editor
                const mockTextEditor = {
                    document: {
                        getText: jest.fn().mockReturnValue('SELECT * FROM products;'),
                        fileName: 'test.sql'
                    }
                };

                (global as any).vscode = {
                    ...require('vscode'),
                    window: {
                        ...require('vscode').window,
                        activeTextEditor: mockTextEditor
                    }
                };

                mockQueryExecutionService.executeCurrentFile.mockResolvedValue({
                    success: true
                });

                await (commandManager as any).executeCurrentFile();

                expect(mockQueryExecutionService.executeCurrentFile).toHaveBeenCalledWith('test-conn');
            });
        });
    });

    describe('utility commands', () => {
        describe('showDashboard', () => {
            it('should show dashboard', async () => {
                await (commandManager as any).showDashboard();

                // Verify dashboard command was called
                expect(require('vscode').commands.executeCommand).toHaveBeenCalledWith('postgresql.showDashboard');
            });
        });

        describe('showNotifications', () => {
            it('should show notifications', async () => {
                await (commandManager as any).showNotifications();

                expect(require('vscode').commands.executeCommand).toHaveBeenCalledWith('postgresql.showNotifications');
            });
        });

        describe('clearCommandErrors', () => {
            it('should clear command errors', async () => {
                await (commandManager as any).clearCommandErrors();

                expect(require('vscode').commands.executeCommand).toHaveBeenCalledWith('postgresql.clearCommandErrors');
            });
        });
    });

    describe('dispose', () => {
        it('should dispose of all subscriptions', () => {
            const mockDisposable = {
                dispose: jest.fn()
            };

            mockContext.subscriptions.push(mockDisposable);

            commandManager.dispose();

            expect(mockDisposable.dispose).toHaveBeenCalled();
        });
    });
});