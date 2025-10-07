import { Logger } from '../src/utils/Logger';

/**
 * Global test setup for Jest
 */

// Mock VSCode API for testing
jest.mock('vscode', () => ({
  ExtensionContext: jest.fn(),
  SecretStorage: jest.fn(),
  window: {
    showInformationMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    withProgress: jest.fn(),
    createWebviewPanel: jest.fn(),
    createTreeView: jest.fn(),
  },
  workspace: {
    getConfiguration: jest.fn(),
    onDidChangeConfiguration: jest.fn(),
    onDidChangeWorkspaceFolders: jest.fn(),
  },
  commands: {
    registerCommand: jest.fn(),
  },
  ViewColumn: {
    One: 1,
  },
  ProgressLocation: {
    Notification: 1,
  },
  ConfigurationTarget: {
    Workspace: 1,
  },
}));

// Mock file system operations
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  readdirSync: jest.fn(),
  statSync: jest.fn(),
  unlinkSync: jest.fn(),
  renameSync: jest.fn(),
}));

// Mock path operations
jest.mock('path', () => ({
  join: jest.fn((...args: string[]) => args.join('/')),
}));

// Global test utilities
global.testUtils = {
  createMockContext: () => ({
    subscriptions: [],
    globalState: {
      get: jest.fn(),
      update: jest.fn(),
    },
    secrets: {
      get: jest.fn(),
      store: jest.fn(),
      delete: jest.fn(),
    },
  }),

  createMockSecretStorage: () => ({
    get: jest.fn(),
    store: jest.fn(),
    delete: jest.fn(),
  }),

  waitForAsync: (ms: number = 100) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms)),

  generateTestId: () =>
    `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
};

// Suppress console output during tests unless explicitly needed
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  // Setup test environment
  process.env.NODE_ENV = 'test';
  process.env.JEST_WORKER_ID = '1';
});

beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();

  // Reset Logger state
  (Logger as any)['isInitialized'] = false;
  (Logger as any)['outputChannel'] = undefined;

  // Setup default mock implementations
  const mockContext = global.testUtils.createMockContext();
  const mockSecrets = global.testUtils.createMockSecretStorage();

  jest.mocked(require('vscode').ExtensionContext).mockReturnValue(mockContext);
  jest.mocked(require('vscode').SecretStorage).mockReturnValue(mockSecrets);
});

afterEach(() => {
  // Clean up after each test
  jest.restoreAllMocks();
});

afterAll(() => {
  // Restore console methods
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Export test utilities for use in test files
export const testUtils = global.testUtils;