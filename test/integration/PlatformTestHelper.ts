/**
 * Platform Test Helper
 *
 * Provides utilities for testing platform-specific behaviors
 */

export class PlatformTestHelper {
  static normalizePath(path: string): string {
    // Normalize path separators based on current platform
    if (process.platform === 'win32') {
      return path.replace(/\//g, '\\');
    } else {
      return path.replace(/\\/g, '/');
    }
  }

  static validatePath(path: string): boolean {
    // Basic path validation
    return path.length > 0 && !path.includes('..');
  }

  static normalizeLineEndings(content: string, lineEnding: string): string {
    return content.replace(/\r\n|\r|\n/g, lineEnding);
  }

  static getPlatformInfo(): {
    platform: string;
    arch: string;
    version: string;
    isWindows: boolean;
    isMacOS: boolean;
    isLinux: boolean;
  } {
    return {
      platform: process.platform,
      arch: process.arch,
      version: process.version,
      isWindows: process.platform === 'win32',
      isMacOS: process.platform === 'darwin',
      isLinux: process.platform === 'linux'
    };
  }

  static simulatePlatform(platform: string): void {
    Object.defineProperty(process, 'platform', { value: platform });
  }

  static getExpectedLineEnding(): string {
    return process.platform === 'win32' ? '\r\n' : '\n';
  }

  static getExpectedPathSeparator(): string {
    return process.platform === 'win32' ? '\\' : '/';
  }
}