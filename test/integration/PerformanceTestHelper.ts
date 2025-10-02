/**
 * Performance testing utilities for integration tests
 * Provides tools for measuring execution time, memory usage, and database performance
 */

export interface PerformanceMetrics {
  executionTime: number;
  memoryUsage: {
    before: NodeJS.MemoryUsage;
    after: NodeJS.MemoryUsage;
    peak: number;
  };
  cpuUsage?: {
    user: number;
    system: number;
  };
  databaseMetrics?: {
    queryCount: number;
    connectionCount: number;
    averageQueryTime: number;
  };
}

export interface PerformanceThresholds {
  maxExecutionTime?: number;
  maxMemoryUsage?: number;
  maxAverageQueryTime?: number;
}

export interface PerformanceTestResult {
  passed: boolean;
  metrics: PerformanceMetrics;
  thresholds?: PerformanceThresholds;
  message?: string;
}

export class PerformanceTestHelper {
  private static performanceMarks: Map<string, number> = new Map();
  private static queryMetrics: Array<{ query: string; duration: number; timestamp: number }> = [];

  /**
   * Start performance measurement
   */
  static startMeasurement(name: string): void {
    this.performanceMarks.set(`${name}_start`, performance.now());
  }

  /**
   * End performance measurement
   */
  static endMeasurement(name: string): number {
    const startKey = `${name}_start`;
    const endKey = `${name}_end`;

    const startTime = this.performanceMarks.get(startKey);
    if (!startTime) {
      throw new Error(`No start measurement found for ${name}`);
    }

    const endTime = performance.now();
    this.performanceMarks.set(endKey, endTime);

    return endTime - startTime;
  }

  /**
   * Get execution time for a measurement
   */
  static getExecutionTime(name: string): number {
    const startKey = `${name}_start`;
    const endKey = `${name}_end`;

    const startTime = this.performanceMarks.get(startKey);
    const endTime = this.performanceMarks.get(endKey);

    if (!startTime || !endTime) {
      throw new Error(`Incomplete measurement for ${name}`);
    }

    return endTime - startTime;
  }

  /**
   * Measure execution time of an async function
   */
  static async measureAsync<T>(
    name: string,
    fn: () => Promise<T>,
    options: {
      memoryTracking?: boolean;
      queryTracking?: boolean;
    } = {}
  ): Promise<{ result: T; metrics: PerformanceMetrics }> {
    const { memoryTracking = true, queryTracking = false } = options;

    // Clear previous query metrics if tracking
    if (queryTracking) {
      this.queryMetrics = [];
    }

    // Memory measurement before
    const memoryBefore = memoryTracking ? process.memoryUsage() : {} as NodeJS.MemoryUsage;

    // Start time measurement
    this.startMeasurement(name);

    try {
      // Execute the function
      const result = await fn();

      // End time measurement
      const executionTime = this.endMeasurement(name);

      // Memory measurement after
      const memoryAfter = memoryTracking ? process.memoryUsage() : {} as NodeJS.MemoryUsage;

      // Calculate peak memory usage during execution
      const peakMemory = Math.max(memoryBefore.heapUsed || 0, memoryAfter.heapUsed || 0);

      const metrics: PerformanceMetrics = {
        executionTime,
        memoryUsage: {
          before: memoryBefore,
          after: memoryAfter,
          peak: peakMemory
        }
      };

      // Add query metrics if tracking
      if (queryTracking && this.queryMetrics.length > 0) {
        const totalQueryTime = this.queryMetrics.reduce((sum, q) => sum + q.duration, 0);
        metrics.databaseMetrics = {
          queryCount: this.queryMetrics.length,
          connectionCount: 1, // Simplified for now
          averageQueryTime: totalQueryTime / this.queryMetrics.length
        };
      }

      return { result, metrics };

    } catch (error) {
      // End measurement even if there's an error
      this.endMeasurement(name);
      throw error;
    }
  }

  /**
   * Measure execution time of a sync function
   */
  static measureSync<T>(
    name: string,
    fn: () => T,
    options: {
      memoryTracking?: boolean;
    } = {}
  ): { result: T; metrics: PerformanceMetrics } {
    const { memoryTracking = true } = options;

    // Memory measurement before
    const memoryBefore = memoryTracking ? process.memoryUsage() : {} as NodeJS.MemoryUsage;

    // Start time measurement
    this.startMeasurement(name);

    try {
      // Execute the function
      const result = fn();

      // End time measurement
      const executionTime = this.endMeasurement(name);

      // Memory measurement after
      const memoryAfter = memoryTracking ? process.memoryUsage() : {} as NodeJS.MemoryUsage;

      // Calculate peak memory usage during execution
      const peakMemory = Math.max(memoryBefore.heapUsed || 0, memoryAfter.heapUsed || 0);

      const metrics: PerformanceMetrics = {
        executionTime,
        memoryUsage: {
          before: memoryBefore,
          after: memoryAfter,
          peak: peakMemory
        }
      };

      return { result, metrics };

    } catch (error) {
      // End measurement even if there's an error
      this.endMeasurement(name);
      throw error;
    }
  }

  /**
   * Track database query performance
   */
  static trackQuery(query: string, duration: number): void {
    this.queryMetrics.push({
      query: query.length > 100 ? query.substring(0, 100) + '...' : query,
      duration,
      timestamp: Date.now()
    });
  }

  /**
   * Get query performance statistics
   */
  static getQueryStatistics(): {
    totalQueries: number;
    totalTime: number;
    averageTime: number;
    slowestQuery: { query: string; duration: number } | null;
    fastestQuery: { query: string; duration: number } | null;
  } {
    if (this.queryMetrics.length === 0) {
      return {
        totalQueries: 0,
        totalTime: 0,
        averageTime: 0,
        slowestQuery: null,
        fastestQuery: null
      };
    }

    const totalTime = this.queryMetrics.reduce((sum, q) => sum + q.duration, 0);
    const sortedByTime = [...this.queryMetrics].sort((a, b) => b.duration - a.duration);

    return {
      totalQueries: this.queryMetrics.length,
      totalTime,
      averageTime: totalTime / this.queryMetrics.length,
      slowestQuery: sortedByTime[0] ? { query: sortedByTime[0].query, duration: sortedByTime[0].duration } : null,
      fastestQuery: sortedByTime[sortedByTime.length - 1] ? { query: sortedByTime[sortedByTime.length - 1].query, duration: sortedByTime[sortedByTime.length - 1].duration } : null
    };
  }

  /**
   * Validate performance against thresholds
   */
  static validatePerformance(
    metrics: PerformanceMetrics,
    thresholds: PerformanceThresholds
  ): PerformanceTestResult {
    const issues: string[] = [];

    // Check execution time
    if (thresholds.maxExecutionTime && metrics.executionTime > thresholds.maxExecutionTime) {
      issues.push(`Execution time ${metrics.executionTime}ms exceeded threshold ${thresholds.maxExecutionTime}ms`);
    }

    // Check memory usage
    if (thresholds.maxMemoryUsage && metrics.memoryUsage.peak > thresholds.maxMemoryUsage) {
      issues.push(`Memory usage ${metrics.memoryUsage.peak} bytes exceeded threshold ${thresholds.maxMemoryUsage} bytes`);
    }

    // Check average query time
    if (thresholds.maxAverageQueryTime && metrics.databaseMetrics) {
      if (metrics.databaseMetrics.averageQueryTime > thresholds.maxAverageQueryTime) {
        issues.push(`Average query time ${metrics.databaseMetrics.averageQueryTime}ms exceeded threshold ${thresholds.maxAverageQueryTime}ms`);
      }
    }

    return {
      passed: issues.length === 0,
      metrics,
      thresholds,
      message: issues.length > 0 ? issues.join('; ') : 'Performance thresholds met'
    };
  }

  /**
   * Generate performance report
   */
  static generateReport(
    testName: string,
    metrics: PerformanceMetrics,
    thresholds?: PerformanceThresholds
  ): string {
    const lines: string[] = [];
    lines.push(`=== Performance Report: ${testName} ===`);
    lines.push(`Execution Time: ${metrics.executionTime.toFixed(2)}ms`);

    if (thresholds?.maxExecutionTime) {
      const status = metrics.executionTime <= thresholds.maxExecutionTime ? '✅' : '❌';
      lines.push(`  Threshold: ${thresholds.maxExecutionTime}ms ${status}`);
    }

    lines.push(`Memory Usage:`);
    lines.push(`  Before: ${(metrics.memoryUsage.before.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    lines.push(`  After: ${(metrics.memoryUsage.after.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    lines.push(`  Peak: ${(metrics.memoryUsage.peak / 1024 / 1024).toFixed(2)} MB`);

    if (thresholds?.maxMemoryUsage) {
      const status = metrics.memoryUsage.peak <= thresholds.maxMemoryUsage ? '✅' : '❌';
      lines.push(`  Threshold: ${(thresholds.maxMemoryUsage / 1024 / 1024).toFixed(2)} MB ${status}`);
    }

    if (metrics.databaseMetrics) {
      lines.push(`Database Metrics:`);
      lines.push(`  Query Count: ${metrics.databaseMetrics.queryCount}`);
      lines.push(`  Average Query Time: ${metrics.databaseMetrics.averageQueryTime.toFixed(2)}ms`);

      if (thresholds?.maxAverageQueryTime) {
        const status = metrics.databaseMetrics.averageQueryTime <= thresholds.maxAverageQueryTime ? '✅' : '❌';
        lines.push(`  Threshold: ${thresholds.maxAverageQueryTime}ms ${status}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Performance test decorator for async functions
   */
  static async withPerformanceTest<T>(
    testName: string,
    fn: () => Promise<T>,
    thresholds?: PerformanceThresholds
  ): Promise<T> {
    const { result, metrics } = await this.measureAsync(testName, fn);

    if (thresholds) {
      const validation = this.validatePerformance(metrics, thresholds);

      if (!validation.passed) {
        console.warn(`Performance test failed for ${testName}:`);
        console.warn(this.generateReport(testName, metrics, thresholds));
      } else {
        console.log(`Performance test passed for ${testName}:`);
        console.log(this.generateReport(testName, metrics, thresholds));
      }
    }

    return result;
  }

  /**
   * Performance test decorator for sync functions
   */
  static withSyncPerformanceTest<T>(
    testName: string,
    fn: () => T,
    thresholds?: PerformanceThresholds
  ): T {
    const { result, metrics } = this.measureSync(testName, fn);

    if (thresholds) {
      const validation = this.validatePerformance(metrics, thresholds);

      if (!validation.passed) {
        console.warn(`Performance test failed for ${testName}:`);
        console.warn(this.generateReport(testName, metrics, thresholds));
      } else {
        console.log(`Performance test passed for ${testName}:`);
        console.log(this.generateReport(testName, metrics, thresholds));
      }
    }

    return result;
  }

  /**
   * Clear all performance measurements
   */
  static clearMeasurements(): void {
    this.performanceMarks.clear();
    this.queryMetrics = [];
  }

  /**
   * Get all performance marks
   */
  static getAllMeasurements(): Map<string, number> {
    return new Map(this.performanceMarks);
  }

  /**
   * Common performance thresholds for different test types
   */
  static getDefaultThresholds(testType: 'unit' | 'integration' | 'e2e' | 'load'): PerformanceThresholds {
    switch (testType) {
      case 'unit':
        return {
          maxExecutionTime: 100, // 100ms for unit tests
          maxMemoryUsage: 50 * 1024 * 1024, // 50MB
        };

      case 'integration':
        return {
          maxExecutionTime: 5000, // 5 seconds for integration tests
          maxMemoryUsage: 100 * 1024 * 1024, // 100MB
          maxAverageQueryTime: 100, // 100ms average query time
        };

      case 'e2e':
        return {
          maxExecutionTime: 30000, // 30 seconds for e2e tests
          maxMemoryUsage: 200 * 1024 * 1024, // 200MB
          maxAverageQueryTime: 200, // 200ms average query time
        };

      case 'load':
        return {
          maxExecutionTime: 60000, // 1 minute for load tests
          maxMemoryUsage: 500 * 1024 * 1024, // 500MB
          maxAverageQueryTime: 50, // 50ms average query time under load
        };

      default:
        return {};
    }
  }
}