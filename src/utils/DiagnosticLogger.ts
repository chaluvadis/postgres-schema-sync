import * as vscode from "vscode";
import { Logger } from "./Logger";

export interface PerformanceMetric {
	name: string;
	startTime: number;
	endTime?: number;
	duration?: number;
	memoryBefore?: NodeJS.MemoryUsage;
	memoryAfter?: NodeJS.MemoryUsage;
	memoryDelta?: NodeJS.MemoryUsage;
	metadata?: Record<string, any>;
	status: "started" | "completed" | "failed";
	error?: string;
}

export interface DiagnosticReport {
	timestamp: Date;
	totalMetrics: number;
	activeMetrics: number;
	failedMetrics: number;
	slowOperations: PerformanceMetric[];
	memorySpikes: PerformanceMetric[];
	topSlowOperations: Array<{ name: string; avgDuration: number; count: number }>;
}

export class DiagnosticLogger {
	private static instance: DiagnosticLogger;
	private metrics: Map<string, PerformanceMetric> = new Map();
	private operationHistory: Map<string, number[]> = new Map(); // For calculating averages
	private eventEmitter: vscode.EventEmitter<PerformanceMetric>;
	private memoryThreshold: number = 50 * 1024 * 1024; // 50MB
	private durationThreshold: number = 1000; // 1 second

	private constructor() {
		this.eventEmitter = new vscode.EventEmitter<PerformanceMetric>();
		this.startPeriodicReporting();
	}

	static getInstance(): DiagnosticLogger {
		if (!DiagnosticLogger.instance) {
			DiagnosticLogger.instance = new DiagnosticLogger();
		}
		return DiagnosticLogger.instance;
	}

	/**
	 * Start performance monitoring for an operation
	 */
	startOperation(name: string, metadata?: Record<string, any>): string {
		const operationId = `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

		const metric: PerformanceMetric = {
			name,
			startTime: Date.now(),
			metadata: metadata || {},
			status: "started",
		};

		// Add memory snapshot before operation
		try {
			metric.memoryBefore = process.memoryUsage();
		} catch (error) {
			Logger.warn("Failed to capture memory usage before operation", "DiagnosticLogger", error as Error);
		}

		this.metrics.set(operationId, metric);

		console.log(`[DiagnosticLogger] Started operation: ${name} (${operationId})`);
		return operationId;
	}

	/**
	 * Complete performance monitoring for an operation
	 */
	endOperation(operationId: string, metadata?: Record<string, any>): boolean {
		const metric = this.metrics.get(operationId);
		if (!metric) {
			Logger.warn(`Operation not found for ending: ${operationId}`, "DiagnosticLogger");
			return false;
		}

		metric.endTime = Date.now();
		metric.duration = metric.endTime - metric.startTime;
		metric.status = "completed";

		// Add memory snapshot after operation
		try {
			metric.memoryAfter = process.memoryUsage();
			if (metric.memoryBefore) {
				metric.memoryDelta = {
					rss: metric.memoryAfter.rss - metric.memoryBefore.rss,
					heapUsed: metric.memoryAfter.heapUsed - metric.memoryBefore.heapUsed,
					heapTotal: metric.memoryAfter.heapTotal - metric.memoryBefore.heapTotal,
					external: metric.memoryAfter.external - metric.memoryBefore.external,
					arrayBuffers: metric.memoryAfter.arrayBuffers - metric.memoryBefore.arrayBuffers,
				};
			}
		} catch (error) {
			Logger.warn("Failed to capture memory usage after operation", "DiagnosticLogger", error as Error);
		}

		// Update metadata
		if (metadata) {
			metric.metadata = { ...metric.metadata, ...metadata };
		}

		// Record for averaging
		if (!this.operationHistory.has(metric.name)) {
			this.operationHistory.set(metric.name, []);
		}
		this.operationHistory.get(metric.name)!.push(metric.duration);

		// Check for performance issues
		this.checkPerformanceIssues(metric);

		console.log(`[DiagnosticLogger] Completed operation: ${metric.name} (${operationId}) - ${metric.duration}ms`);
		return true;
	}

	/**
	 * Mark operation as failed
	 */
	failOperation(operationId: string, error: Error, metadata?: Record<string, any>): boolean {
		const metric = this.metrics.get(operationId);
		if (!metric) {
			Logger.warn(`Operation not found for failure marking: ${operationId}`, "DiagnosticLogger");
			return false;
		}

		metric.endTime = Date.now();
		metric.duration = metric.endTime - metric.startTime;
		metric.status = "failed";
		metric.error = error.message;

		if (metadata) {
			metric.metadata = { ...metric.metadata, ...metadata };
		}

		console.error(
			`[DiagnosticLogger] Failed operation: ${metric.name} (${operationId}) - ${metric.duration}ms:`,
			error,
		);
		return true;
	}

	/**
	 * Check for performance issues and trigger alerts
	 */
	private checkPerformanceIssues(metric: PerformanceMetric): void {
		const issues: string[] = [];

		// Check duration
		if (metric.duration && metric.duration > this.durationThreshold) {
			issues.push(`Slow operation: ${metric.duration}ms`);
		}

		// Check memory usage
		if (metric.memoryDelta) {
			const heapIncrease = metric.memoryDelta.heapUsed;
			if (heapIncrease > this.memoryThreshold) {
				issues.push(`High memory usage: ${Math.round(heapIncrease / 1024 / 1024)}MB`);
			}
		}

		// Log warnings for significant performance issues
		if (issues.length > 0) {
			Logger.warn(`Performance issues detected in ${metric.name}`, "DiagnosticLogger", {
				issues,
				duration: metric.duration,
				memoryDelta: metric.memoryDelta,
				metadata: metric.metadata,
			});
		}

		// Emit event for real-time monitoring
		if (issues.length > 0) {
			this.eventEmitter.fire(metric);
		}
	}

	/**
	 * Get current diagnostic report
	 */
	getDiagnosticReport(): DiagnosticReport {
		const now = Date.now();
		const activeMetrics: PerformanceMetric[] = [];
		const failedMetrics: PerformanceMetric[] = [];
		const slowOperations: PerformanceMetric[] = [];
		const memorySpikes: PerformanceMetric[] = [];

		this.metrics.forEach((metric) => {
			if (metric.status === "started") {
				activeMetrics.push(metric);
			} else if (metric.status === "failed") {
				failedMetrics.push(metric);
			}

			// Check for slow operations
			if (metric.duration && metric.duration > this.durationThreshold) {
				slowOperations.push(metric);
			}

			// Check for memory spikes
			if (metric.memoryDelta && metric.memoryDelta.heapUsed > this.memoryThreshold) {
				memorySpikes.push(metric);
			}
		});

		// Calculate top slow operations by average duration
		const topSlowOperations: Array<{ name: string; avgDuration: number; count: number }> = [];
		this.operationHistory.forEach((durations, name) => {
			if (durations.length > 0) {
				const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
				topSlowOperations.push({
					name,
					avgDuration: Math.round(avgDuration),
					count: durations.length,
				});
			}
		});

		topSlowOperations.sort((a, b) => b.avgDuration - a.avgDuration);
		topSlowOperations.splice(10); // Keep only top 10

		return {
			timestamp: new Date(),
			totalMetrics: this.metrics.size,
			activeMetrics: activeMetrics.length,
			failedMetrics: failedMetrics.length,
			slowOperations,
			memorySpikes,
			topSlowOperations,
		};
	}

	/**
	 * Get real-time performance summary
	 */
	getPerformanceSummary(): string {
		const report = this.getDiagnosticReport();

		return `
PostgreSQL Extension - Performance Diagnostics
==============================================

Summary:
- Total Operations: ${report.totalMetrics}
- Active Operations: ${report.activeMetrics}
- Failed Operations: ${report.failedMetrics}
- Slow Operations: ${report.slowOperations.length}
- Memory Spikes: ${report.memorySpikes.length}

Top Slow Operations (Average Duration):
${
	report.topSlowOperations
		.slice(0, 5)
		.map((op) => `- ${op.name}: ${op.avgDuration}ms (${op.count} times)`)
		.join("\n") || "- None"
}

Recent Slow Operations (>1s):
${
	report.slowOperations
		.slice(-5)
		.map((op) => `- ${op.name}: ${op.duration}ms`)
		.join("\n") || "- None"
}

Recent Memory Spikes (>50MB):
${
	report.memorySpikes
		.slice(-3)
		.map((op) => `- ${op.name}: ${Math.round((op.memoryDelta?.heapUsed || 0) / 1024 / 1024)}MB`)
		.join("\n") || "- None"
}

Generated at: ${report.timestamp.toISOString()}
		`.trim();
	}

	/**
	 * Clear all metrics and history
	 */
	clearMetrics(): void {
		const count = this.metrics.size;
		this.metrics.clear();
		this.operationHistory.clear();
		console.log(`[DiagnosticLogger] Cleared ${count} metrics`);
	}

	/**
	 * Start periodic performance reporting
	 */
	private startPeriodicReporting(): void {
		// Report every 30 seconds if there are metrics
		setInterval(() => {
			if (this.metrics.size > 0) {
				const report = this.getDiagnosticReport();

				// Only report if there are performance issues
				if (report.slowOperations.length > 0 || report.memorySpikes.length > 0 || report.failedMetrics > 0) {
					const channel = vscode.window.createOutputChannel("PostgreSQL Performance Diagnostics");
					channel.clear();
					channel.appendLine(this.getPerformanceSummary());
					channel.show();

					// Also log to console
					console.warn("[DiagnosticLogger] Performance issues detected:", report);
				}
			}
		}, 30000);
	}
}
