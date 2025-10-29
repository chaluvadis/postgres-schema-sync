// Jest setup file for global test configuration

// Mock VSCode APIs globally before any imports
const mockVscode = {
  workspace: {
    getConfiguration: jest.fn(() => ({
      get: jest.fn(),
      update: jest.fn(),
    })),
  },
  window: {
    showErrorMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showInformationMessage: jest.fn(),
  },
  SecretStorage: jest.fn(),
  ExtensionContext: jest.fn(),
};

jest.mock('vscode', () => mockVscode);

// Mock other external dependencies
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
  unlinkSync: jest.fn(),
  statSync: jest.fn(() => ({
    size: 1000,
    birthtime: new Date(),
  })),
  readdirSync: jest.fn(() => []),
}));

jest.mock('path', () => ({
  join: jest.fn((...args: string[]) => args.join('/')),
  dirname: jest.fn((path: string) => path.split('/').slice(0, -1).join('/')),
}));

jest.mock('os', () => ({
  homedir: jest.fn(() => '/home/testuser'),
}));

jest.mock('child_process', () => ({
  exec: jest.fn(),
  execSync: jest.fn(),
}));

jest.mock('tls', () => ({
  connect: jest.fn(),
}));

// Set up global test environment
process.env.NODE_ENV = 'test';