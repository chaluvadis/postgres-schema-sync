import * as vscode from "vscode";
import { Logger } from "@/utils/Logger";
import { DiagnosticLogger } from "@/utils/DiagnosticLogger";

export interface MonitoringConfig {
	enableAdaptivePolling: boolean;
	enableSmartCaching: boolean;
	connectionCheckInterval: number; // ms
	schemaCheckInterval: number; // ms
	fileWatcherDebounce: number; // ms
	enablePerformanceThrottling: boolean;
	maxConcurrentChecks: number;
	enableLazyMonitoring: boolean;
	monitoringPriorities: "low" | "medium" | "high";
}

export interface MonitoringMetrics {
	activeMonitors: number;
	totalChecksPerformed: number;
	averageCheckTime: number;
	cachedOperations: number;
	throttledOperations: number;
	performanceScore: number; // 0-100
}

/**
 * RealtimeMonitoringOptimizer - Optimizes real-time monitoring operations
 * to prevent extension host unresponsiveness during continuous monitoring
 */
export class RealtimeMonitoringOptimizer {
	private static instance: RealtimeMonitoringOptimizer;
	private diagnosticLogger: DiagnosticLogger;
	private config: MonitoringConfig;
	private isInitialized = false;

	// Monitoring state
	private activeMonitors: Map<string, MonitoringOperation> = new Map();
	private monitorTimers: Map<string, NodeJS.Timeout> = new Map();
	private monitoringCache: Map<string, any> = new Map();
	private operationMetrics: Map<string, MonitoringMetrics> = new Map();

	// Adaptive monitoring
	private isActiveUser = false;
	private lastUserActivity = Date.now();
	private performanceScore = 100;
	private highLoadDetected = false;

	// Smart polling intervals
	private readonly BASE_INTERVALS = {
		connectionCheck: 60000, // 60 seconds
		schemaCheck: 300000, // 5 minutes
		fileWatcher: 5000, // 5 seconds
		treeViewUpdate: 10000, // 10 seconds
	};

	// Performance thresholds
	private readonly PERFORMANCE_THRESHOLDS = {
		high: 80,
		medium: 60,
		low: 40,
	};

	private constructor(config?: Partial<MonitoringConfig>) {
		this.diagnosticLogger = DiagnosticLogger.getInstance();
		this.config = {
			enableAdaptivePolling: true,
			enableSmartCaching: true,
			connectionCheckInterval: this.BASE_INTERVALS.connectionCheck,
			schemaCheckInterval: this.BASE_INTERVALS.schemaCheck,
			fileWatcherDebounce: this.BASE_INTERVALS.fileWatcher,
			enablePerformanceThrottling: true,
			maxConcurrentChecks: 3,
			enableLazyMonitoring: true,
			monitoringPriorities: "medium",
			...config,
		};
	}

	static getInstance(config?: Partial<MonitoringConfig>): RealtimeMonitoringOptimizer {
		if (!RealtimeMonitoringOptimizer.instance) {
			RealtimeMonitoringOptimizer.instance = new RealtimeMonitoringOptimizer(config);
		}
		return RealtimeMonitoringOptimizer.instance;
	}

	/**
	 * Initialize the realtime monitoring optimizer
	 */
	initialize(): void {
		if (this.isInitialized) {
			Logger.warn("RealtimeMonitoringOptimizer already initialized", "RealtimeMonitoringOptimizer");
			return;
		}

		const operationId = this.diagnosticLogger.startOperation("RealtimeMonitoringOptimizerInitialize", {
			config: this.config,
		});

		try {
			this.setupAdaptiveMonitoring();
			this.setupUserActivityTracking();
			this.setupPerformanceMonitoring();
			this.setupSmartCleanup();

			Logger.info("RealtimeMonitoringOptimizer initialized successfully", "RealtimeMonitoringOptimizer", {
				adaptivePolling: this.config.enableAdaptivePolling,
				smartCaching: this.config.enableSmartCaching,
				lazyMonitoring: this.config.enableLazyMonitoring,
				performanceThrottling: this.config.enablePerformanceThrottling,
			});

			this.diagnosticLogger.endOperation(operationId, {
				initializationTime: Date.now(),
				optimizationEnabled: this.config.enableAdaptivePolling && this.config.enablePerformanceThrottling,
			});

			this.isInitialized = true;
		} catch (error) {
			this.diagnosticLogger.failOperation(operationId, error as Error);
			throw error;
		}
	}

	/**
	 * Start optimized connection monitoring
	 */
	startConnectionMonitoring(
		connectionId: string,
		connectionCheckFunction: () => Promise<boolean>,
		onConnectionStatusChange?: (isConnected: boolean) => void,
	): vscode.Disposable {
		if (!this.isInitialized) {
			throw new Error("RealtimeMonitoringOptimizer not initialized");
		}

		const operationId = this.diagnosticLogger.startOperation("StartConnectionMonitoring", {
			connectionId,
			activeMonitors: this.activeMonitors.size + 1,
		});

		try {
			// Create optimized monitoring operation
			const monitoringOperation: MonitoringOperation = {
				id: `connection_${connectionId}`,
				type: "connection",
				connectionId,
				checkFunction: connectionCheckFunction,
				onStatusChange: onConnectionStatusChange,
				interval: this.getOptimizedInterval("connection"),
				priority: this.getMonitoringPriority("connection"),
				lastExecution: 0,
				executionCount: 0,
				totalExecutionTime: 0,
				isActive: true,
				cacheEnabled: this.config.enableSmartCaching,
			};

			this.activeMonitors.set(monitoringOperation.id, monitoringOperation);

			// Start monitoring with adaptive interval
			this.startMonitoringTimer(monitoringOperation);

			Logger.info(`Started optimized connection monitoring for: ${connectionId}`, "RealtimeMonitoringOptimizer", {
				operationId: monitoringOperation.id,
				interval: monitoringOperation.interval,
				priority: monitoringOperation.priority,
			});

			this.diagnosticLogger.endOperation(operationId, {
				monitorStarted: true,
				operationId: monitoringOperation.id,
				optimizedInterval: monitoringOperation.interval,
			});

			return {
				dispose: () => {
					this.stopMonitoring(monitoringOperation.id);
				},
			};
		} catch (error) {
			this.diagnosticLogger.failOperation(operationId, error as Error);
			Logger.error(
				`Failed to start connection monitoring for: ${connectionId}`,
				error as Error,
				"RealtimeMonitoringOptimizer",
			);
			throw error;
		}
	}

	/**
	 * Start optimized schema monitoring
	 */
	startSchemaMonitoring(
		connectionId: string,
		schemaCheckFunction: () => Promise<any>,
		onSchemaChange?: (schemaData: any) => void,
	): vscode.Disposable {
		if (!this.isInitialized) {
			throw new Error("RealtimeMonitoringOptimizer not initialized");
		}

		const operationId = this.diagnosticLogger.startOperation("StartSchemaMonitoring", {
			connectionId,
			activeMonitors: this.activeMonitors.size + 1,
		});

		try {
			const monitoringOperation: MonitoringOperation = {
				id: `schema_${connectionId}`,
				type: "schema",
				connectionId,
				checkFunction: schemaCheckFunction,
				onStatusChange: onSchemaChange,
				interval: this.getOptimizedInterval("schema"),
				priority: this.getMonitoringPriority("schema"),
				lastExecution: 0,
				executionCount: 0,
				totalExecutionTime: 0,
				isActive: true,
				cacheEnabled: this.config.enableSmartCaching,
			};

			this.activeMonitors.set(monitoringOperation.id, monitoringOperation);
			this.startMonitoringTimer(monitoringOperation);

			this.diagnosticLogger.endOperation(operationId, {
				monitorStarted: true,
				operationId: monitoringOperation.id,
				optimizedInterval: monitoringOperation.interval,
			});

			return {
				dispose: () => {
					this.stopMonitoring(monitoringOperation.id);
				},
			};
		} catch (error) {
			this.diagnosticLogger.failOperation(operationId, error as Error);
			throw error;
		}
	}

	/**
	 * Start optimized file watching
	 */
	startFileWatching(patterns: string[], fileChangeFunction: (filePath: string) => void): vscode.Disposable {
		if (!this.isInitialized) {
			throw new Error("RealtimeMonitoringOptimizer not initialized");
		}

		const operationId = this.diagnosticLogger.startOperation("StartFileWatching", {
			patterns,
			activeMonitors: this.activeMonitors.size + 1,
		});

		try {
			const debounceTimers = new Map<string, NodeJS.Timeout>();

			const optimizedFileChangeFunction = (uri: vscode.Uri) => {
				const filePath = uri.fsPath;
				// Debounce file changes to prevent rapid firing
				const existingTimer = debounceTimers.get(filePath);
				if (existingTimer) {
					clearTimeout(existingTimer);
				}

				const timer = setTimeout(() => {
					fileChangeFunction(filePath);
					debounceTimers.delete(filePath);
				}, this.config.fileWatcherDebounce);

				debounceTimers.set(filePath, timer);
			};

			const monitoringOperation: MonitoringOperation = {
				id: `fileWatcher_${Date.now()}`,
				type: "fileWatcher",
				checkFunction: async () => null, // Not used for file watchers
				interval: 0, // File watchers use debouncing instead of intervals
				priority: this.getMonitoringPriority("fileWatcher"),
				lastExecution: 0,
				executionCount: 0,
				totalExecutionTime: 0,
				isActive: true,
				cacheEnabled: false,
			};

			this.activeMonitors.set(monitoringOperation.id, monitoringOperation);

			// Create the actual file system watcher
			const fileSystemWatcher = vscode.workspace.createFileSystemWatcher(
				patterns.length === 1 ? patterns[0] : `**/{${patterns.join(",")}}`,
			);

			// Attach optimized change handler
			fileSystemWatcher.onDidChange(optimizedFileChangeFunction);
			fileSystemWatcher.onDidCreate(optimizedFileChangeFunction);
			fileSystemWatcher.onDidDelete(optimizedFileChangeFunction);

			this.diagnosticLogger.endOperation(operationId, {
				monitorStarted: true,
				operationId: monitoringOperation.id,
				patterns: patterns,
				debounceDelay: this.config.fileWatcherDebounce,
			});

			return {
				dispose: () => {
					this.stopMonitoring(monitoringOperation.id);
					fileSystemWatcher.dispose();
				},
			};
		} catch (error) {
			this.diagnosticLogger.failOperation(operationId, error as Error);
			throw error;
		}
	}

	/**
	 * Get monitoring metrics
	 */
	getMonitoringMetrics(): MonitoringMetrics {
		const totalChecks = Array.from(this.activeMonitors.values()).reduce((sum, op) => sum + op.executionCount, 0);

		const totalTime = Array.from(this.activeMonitors.values()).reduce((sum, op) => sum + op.totalExecutionTime, 0);

		const avgCheckTime = totalChecks > 0 ? Math.round(totalTime / totalChecks) : 0;

		return {
			activeMonitors: this.activeMonitors.size,
			totalChecksPerformed: totalChecks,
			averageCheckTime: avgCheckTime,
			cachedOperations: this.monitoringCache.size,
			throttledOperations: this.getThrottledOperationsCount(),
			performanceScore: this.performanceScore,
		};
	}

	/**
	 * Stop all monitoring operations
	 */
	dispose(): void {
		const operationId = this.diagnosticLogger.startOperation("RealtimeMonitoringOptimizerDispose");

		try {
			// Stop all monitoring timers
			this.monitorTimers.forEach((timer) => clearTimeout(timer));
			this.monitorTimers.clear();

			// Clear all active monitors
			this.activeMonitors.clear();

			// Clear monitoring cache
			this.monitoringCache.clear();

			Logger.info("RealtimeMonitoringOptimizer disposed successfully", "RealtimeMonitoringOptimizer", {
				disposedMonitors: this.activeMonitors.size,
				clearedCacheEntries: this.monitoringCache.size,
			});

			this.diagnosticLogger.endOperation(operationId, {
				monitorsDisposed: this.activeMonitors.size,
				cacheCleared: this.monitoringCache.size,
			});

			this.isInitialized = false;
		} catch (error) {
			this.diagnosticLogger.failOperation(operationId, error as Error);
		}
	}

	/**
	 * Private methods
	 */
	private setupAdaptiveMonitoring(): void {
		if (!this.config.enableAdaptivePolling) {
			return;
		}

		// Update monitoring intervals based on system performance
		setInterval(() => {
			this.updateMonitoringIntervals();
		}, 30000); // Every 30 seconds
	}

	private setupUserActivityTracking(): void {
		if (!this.config.enableLazyMonitoring) {
			return;
		}

		// Track user activity to adjust monitoring intensity
		vscode.window.onDidChangeActiveTextEditor(() => {
			this.isActiveUser = true;
			this.lastUserActivity = Date.now();
		});

		vscode.window.onDidChangeTextEditorSelection(() => {
			this.isActiveUser = true;
			this.lastUserActivity = Date.now();
		});
	}

	private setupPerformanceMonitoring(): void {
		if (!this.config.enablePerformanceThrottling) {
			return;
		}

		// Monitor system performance and adjust monitoring
		setInterval(() => {
			this.assessSystemPerformance();
		}, 10000); // Every 10 seconds
	}

	private setupSmartCleanup(): void {
		// Cleanup old cache entries and stopped monitors
		setInterval(() => {
			this.performSmartCleanup();
		}, 60000); // Every minute
	}

	private startMonitoringTimer(operation: MonitoringOperation): void {
		if (operation.interval === 0) {
			return; // No interval-based monitoring
		}

		const timer = setInterval(async () => {
			await this.executeMonitoringOperation(operation);
		}, operation.interval);

		this.monitorTimers.set(operation.id, timer);
	}

	private stopMonitoring(operationId: string): void {
		// Clear timer
		const timer = this.monitorTimers.get(operationId);
		if (timer) {
			clearTimeout(timer);
			this.monitorTimers.delete(operationId);
		}

		// Remove from active monitors
		this.activeMonitors.delete(operationId);

		Logger.debug(`Stopped monitoring operation: ${operationId}`, "RealtimeMonitoringOptimizer");
	}

	private async executeMonitoringOperation(operation: MonitoringOperation): Promise<void> {
		const startTime = Date.now();

		try {
			// Check if operation should be throttled
			if (this.shouldThrottleOperation(operation)) {
				Logger.debug(`Monitoring operation throttled: ${operation.id}`, "RealtimeMonitoringOptimizer");
				return;
			}

			// Check cache first if enabled
			if (operation.cacheEnabled && this.hasValidCache(operation.id)) {
				Logger.debug(`Using cached result for: ${operation.id}`, "RealtimeMonitoringOptimizer");
				return;
			}

			// Execute the monitoring operation
			const result = await operation.checkFunction();

			// Update metrics
			operation.executionCount++;
			operation.lastExecution = Date.now();
			operation.totalExecutionTime += Date.now() - startTime;

			// Cache result if enabled
			if (operation.cacheEnabled) {
				this.cacheOperationResult(operation.id, result);
			}

			// Notify status change if callback provided
			if (operation.onStatusChange) {
				operation.onStatusChange(result);
			}
		} catch (error) {
			Logger.error(`Monitoring operation failed: ${operation.id}`, error as Error, "RealtimeMonitoringOptimizer");
			operation.totalExecutionTime += Date.now() - startTime;
		}
	}

	private getOptimizedInterval(operationType: string): number {
		if (!this.config.enableAdaptivePolling) {
			return this.BASE_INTERVALS[operationType as keyof typeof this.BASE_INTERVALS] || 60000;
		}

		const baseInterval = this.BASE_INTERVALS[operationType as keyof typeof this.BASE_INTERVALS] || 60000;

		// Adjust interval based on performance score
		if (this.performanceScore > this.PERFORMANCE_THRESHOLDS.high) {
			return Math.floor(baseInterval * 1.2); // Increase interval (less frequent)
		} else if (this.performanceScore < this.PERFORMANCE_THRESHOLDS.low) {
			return Math.floor(baseInterval * 0.5); // Decrease interval (more frequent)
		}

		return baseInterval;
	}

	private getMonitoringPriority(operationType: string): "high" | "medium" | "low" {
		switch (operationType) {
			case "connection":
				return "high";
			case "schema":
				return "medium";
			case "fileWatcher":
				return "low";
			default:
				return this.config.monitoringPriorities;
		}
	}

	private shouldThrottleOperation(operation: MonitoringOperation): boolean {
		if (!this.config.enablePerformanceThrottling) {
			return false;
		}

		// Throttle if system is under high load
		if (this.highLoadDetected) {
			return operation.priority === "low";
		}

		// Throttle inactive operations
		if (this.config.enableLazyMonitoring && !this.isActiveUser && operation.priority === "low") {
			return true;
		}

		return false;
	}

	private hasValidCache(operationId: string): boolean {
		if (!this.monitoringCache.has(operationId)) {
			return false;
		}

		const cached = this.monitoringCache.get(operationId);
		const cacheAge = Date.now() - cached.timestamp;
		const maxCacheAge = 5 * 60 * 1000; // 5 minutes

		return cacheAge < maxCacheAge;
	}

	private cacheOperationResult(operationId: string, result: any): void {
		this.monitoringCache.set(operationId, {
			result,
			timestamp: Date.now(),
			operationId,
		});
	}

	private getThrottledOperationsCount(): number {
		return Array.from(this.activeMonitors.values()).filter((op) => this.shouldThrottleOperation(op)).length;
	}

	private updateMonitoringIntervals(): void {
		// Update intervals for all active monitors
		this.activeMonitors.forEach((operation, id) => {
			const oldInterval = operation.interval;
			operation.interval = this.getOptimizedInterval(operation.type);

			if (oldInterval !== operation.interval) {
				Logger.debug(
					`Updated interval for ${id}: ${oldInterval}ms -> ${operation.interval}ms`,
					"RealtimeMonitoringOptimizer",
				);

				// Restart timer with new interval
				const timer = this.monitorTimers.get(id);
				if (timer) {
					clearTimeout(timer);
					this.startMonitoringTimer(operation);
				}
			}
		});
	}

	private assessSystemPerformance(): void {
		// Simple performance assessment based on recent operations
		const recentOperations = Array.from(this.activeMonitors.values()).filter(
			(op) => op.lastExecution > Date.now() - 60000,
		); // Last minute

		if (recentOperations.length === 0) {
			return;
		}

		const avgExecutionTime =
			recentOperations.reduce((sum, op) => sum + op.totalExecutionTime / op.executionCount, 0) /
			recentOperations.length;

		// Update performance score
		if (avgExecutionTime > 1000) {
			this.performanceScore = Math.max(0, this.performanceScore - 10);
		} else if (avgExecutionTime < 100) {
			this.performanceScore = Math.min(100, this.performanceScore + 5);
		}

		// Detect high load
		this.highLoadDetected = this.performanceScore < this.PERFORMANCE_THRESHOLDS.low;
	}

	private performSmartCleanup(): void {
		// Clean up old cache entries
		const maxCacheAge = 10 * 60 * 1000; // 10 minutes
		const now = Date.now();

		const expiredCacheKeys: string[] = [];
		this.monitoringCache.forEach((cache, key) => {
			if (now - cache.timestamp > maxCacheAge) {
				expiredCacheKeys.push(key);
			}
		});

		expiredCacheKeys.forEach((key) => this.monitoringCache.delete(key));

		// Clean up metrics for stopped operations
		const activeOperationIds = new Set(this.activeMonitors.keys());
		this.operationMetrics.forEach((_, key) => {
			if (!activeOperationIds.has(key)) {
				this.operationMetrics.delete(key);
			}
		});

		Logger.debug("Smart cleanup completed", "RealtimeMonitoringOptimizer", {
			cacheEntriesRemoved: expiredCacheKeys.length,
			metricsCleaned: this.operationMetrics.size,
		});
	}
}

interface MonitoringOperation {
	id: string;
	type: "connection" | "schema" | "fileWatcher";
	connectionId?: string;
	checkFunction: () => Promise<any>;
	onStatusChange?: (result: any) => void;
	interval: number;
	priority: "high" | "medium" | "low";
	lastExecution: number;
	executionCount: number;
	totalExecutionTime: number;
	isActive: boolean;
	cacheEnabled: boolean;
}
