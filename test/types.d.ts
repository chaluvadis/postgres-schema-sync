/**
 * Type declarations for test environment
 */

declare global {
  var testUtils: {
    createMockContext: () => any;
    createMockSecretStorage: () => any;
    waitForAsync: (ms?: number) => Promise<void>;
    generateTestId: () => string;
  };
}

export {};

// Jest type extensions
declare module 'jest' {
  interface Matchers<R> {
    toBeValidAuditEvent(): R;
    toBeEncrypted(): R;
    toHavePermission(permission: string): R;
  }
}