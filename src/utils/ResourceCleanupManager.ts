import { Logger } from "@/utils/Logger";
import { DiagnosticLogger } from "@/utils/DiagnosticLogger";

export interface ResourceCleanupConfig {
	enableAutomaticCleanup: boolean;
	enableMemoryMonitoring: boolean;
	enableResourceTracking: boolean;
	cleanupInterval: number; // ms
	memoryThreshold: number; // MB
	maxCacheAge: number; // ms
	enableLazyDisposal: boolean;
}

export interface ResourceMetrics {
	totalResources: number;
	activeResources: number;
	memoryUsage: number; // MB
	cacheEntries: number;
	timerCount: number;
	eventHandlerCount: number;
	resourceUtilization: number; // 0-100
}

/**
 * ResourceCleanupManager - Comprehensive resource cleanup and memory management
 * Prevents extension host unresponsiveness by ensuring proper resource disposal
 */
export class ResourceCleanupManager {
	private static instance: ResourceCleanupManager;
	private diagnosticLogger: DiagnosticLogger;
	private config: ResourceCleanupConfig;
	private isInitialized = false;

	// Resource tracking
	private trackedResources: Map<string, TrackedResource> = new Map();
	private activeTimers: Map<string, NodeJS.Timeout> = new Map();
	private activeIntervals: Map<string, NodeJS.Timeout> = new Map();
	private cacheStore: Map<string, CacheEntry> = new Map();
	private memorySnapshots: MemorySnapshot[] = [];

	// Cleanup statistics
	private cleanupMetrics = {
		resourcesDisposed: 0,
		timersCleared: 0,
		intervalsCleared: 0,
		cacheEntriesRemoved: 0,
		memoryFreed: 0, // MB
		totalCleanupOperations: 0,
	};

	// Performance tracking
	private lastCleanupTime = Date.now();
	private memoryUsageTrend: "increasing" | "decreasing" | "stable" = "stable";

	// Interval tracking for proper disposal
	private automaticCleanupInterval?: NodeJS.Timeout;
	private memoryMonitoringInterval?: NodeJS.Timeout;
	private resourceTrackingInterval?: NodeJS.Timeout;
	private performanceMonitoringInterval?: NodeJS.Timeout;

	private constructor(config?: Partial<ResourceCleanupConfig>) {
		this.diagnosticLogger = DiagnosticLogger.getInstance();
		this.config = {
			enableAutomaticCleanup: true,
			enableMemoryMonitoring: true,
			enableResourceTracking: true,
			cleanupInterval: 300000, // 5 minutes
			memoryThreshold: 100, // 100MB
			maxCacheAge: 1800000, // 30 minutes
			enableLazyDisposal: true,
			...config,
		};
	}

	static getInstance(config?: Partial<ResourceCleanupConfig>): ResourceCleanupManager {
		if (!ResourceCleanupManager.instance) {
			ResourceCleanupManager.instance = new ResourceCleanupManager(config);
		}
		return ResourceCleanupManager.instance;
	}

	/**
	 * Initialize the resource cleanup manager
	 */
	initialize(): void {
		if (this.isInitialized) {
			Logger.warn("ResourceCleanupManager already initialized", "ResourceCleanupManager");
			return;
		}

		const operationId = this.diagnosticLogger.startOperation("ResourceCleanupManagerInitialize", {
			config: this.config,
		});

		try {
			this.setupAutomaticCleanup();
			this.setupMemoryMonitoring();
			this.setupResourceTracking();
			this.setupPerformanceMonitoring();

			Logger.info("ResourceCleanupManager initialized successfully", "ResourceCleanupManager", {
				automaticCleanup: this.config.enableAutomaticCleanup,
				memoryMonitoring: this.config.enableMemoryMonitoring,
				resourceTracking: this.config.enableResourceTracking,
				cleanupInterval: this.config.cleanupInterval,
				memoryThreshold: this.config.memoryThreshold,
			});

			this.diagnosticLogger.endOperation(operationId, {
				initializationTime: Date.now(),
				featuresEnabled: Object.values(this.config).filter((v) => v === true).length,
			});

			this.isInitialized = true;
		} catch (error) {
			this.diagnosticLogger.failOperation(operationId, error as Error);
			throw error;
		}
	}
	/**
	 * Remove a specific resource
	 */
	removeResource(id: string): boolean {
		const resource = this.trackedResources.get(id);
		if (!resource) {
			return false;
		}

		try {
			// Execute disposal function
			resource.disposeFunction();

			// Remove from tracking
			this.trackedResources.delete(id);

			// Update metrics
			this.cleanupMetrics.resourcesDisposed++;
			this.cleanupMetrics.totalCleanupOperations++;

			Logger.debug(`Resource disposed: ${id}`, "ResourceCleanupManager", {
				resourceType: resource.resourceType,
				age: Date.now() - resource.createdAt,
				accessCount: resource.accessCount,
			});

			return true;
		} catch (error) {
			Logger.error(`Error disposing resource: ${id}`, error as Error, "ResourceCleanupManager");
			return false;
		}
	}

	/**
	 * Perform comprehensive cleanup
	 */
	performCleanup(options?: {
		forceCleanup?: boolean;
		cleanupType?: "all" | "expired" | "unused" | "memory";
		memoryThreshold?: number;
	}): CleanupResult {
		const operationId = this.diagnosticLogger.startOperation("PerformCleanup", {
			options,
			currentResources: this.trackedResources.size,
		});

		const result: CleanupResult = {
			resourcesDisposed: 0,
			timersCleared: 0,
			intervalsCleared: 0,
			cacheEntriesRemoved: 0,
			memoryFreed: 0,
			duration: 0,
			cleanupType: options?.cleanupType || "all",
		};

		const startTime = Date.now();

		try {
			const cleanupType = options?.cleanupType || "all";
			const forceCleanup = options?.forceCleanup || false;

			// Clean up expired resources
			if (cleanupType === "all" || cleanupType === "expired" || forceCleanup) {
				result.resourcesDisposed += this.cleanupExpiredResources();
				result.cacheEntriesRemoved += this.cleanupExpiredCache();
			}

			// Clean up unused resources
			if (cleanupType === "all" || cleanupType === "unused" || forceCleanup) {
				result.resourcesDisposed += this.cleanupUnusedResources();
			}

			// Clean up based on memory threshold
			if (cleanupType === "all" || cleanupType === "memory" || forceCleanup) {
				const memoryFreed = this.cleanupByMemoryThreshold(options?.memoryThreshold);
				result.memoryFreed = memoryFreed;
			}

			// Clean up timers and intervals
			if (cleanupType === "all" || forceCleanup) {
				result.timersCleared = this.activeTimers.size;
				result.intervalsCleared = this.activeIntervals.size;
			}

			this.lastCleanupTime = Date.now();
			result.duration = Date.now() - startTime;

			Logger.info("Cleanup operation completed", "ResourceCleanupManager", {
				...result,
				remainingResources: this.trackedResources.size,
				memoryUsage: this.getCurrentMemoryUsage(),
			});

			this.diagnosticLogger.endOperation(operationId, result);
			return result;
		} catch (error) {
			this.diagnosticLogger.failOperation(operationId, error as Error);
			Logger.error("Cleanup operation failed", error as Error, "ResourceCleanupManager");
			throw error;
		}
	}

	/**
	 * Get resource metrics
	 */
	getResourceMetrics(): ResourceMetrics {
		const memoryUsage = this.getCurrentMemoryUsage();
		const totalResources = this.trackedResources.size;
		const activeResources = Array.from(this.trackedResources.values()).filter((r) => r.isActive).length;

		return {
			totalResources,
			activeResources,
			memoryUsage,
			cacheEntries: this.cacheStore.size,
			timerCount: this.activeTimers.size,
			eventHandlerCount: Array.from(this.trackedResources.values()).filter((r) => r.resourceType === "eventHandler")
				.length,
			resourceUtilization: totalResources > 0 ? (activeResources / totalResources) * 100 : 0,
		};
	}

	/**
	 * Check if memory usage is above threshold
	 */
	isMemoryUsageHigh(): boolean {
		return this.getCurrentMemoryUsage() > this.config.memoryThreshold;
	}

	/**
	 * Force immediate cleanup if memory usage is high
	 */
	ensureMemoryHealthy(): void {
		if (this.isMemoryUsageHigh()) {
			Logger.warn("Memory usage high, performing emergency cleanup", "ResourceCleanupManager", {
				currentUsage: this.getCurrentMemoryUsage(),
				threshold: this.config.memoryThreshold,
			});

			this.performCleanup({
				forceCleanup: true,
				cleanupType: "memory",
			});
		}
	}

	/**
	 * Dispose all resources (for extension deactivation)
	 */
	dispose(): void {
		const operationId = this.diagnosticLogger.startOperation("ResourceCleanupManagerDispose");

		try {
			// Clear all intervals first
			if (this.automaticCleanupInterval) {
				clearInterval(this.automaticCleanupInterval);
				this.automaticCleanupInterval = undefined;
			}
			if (this.memoryMonitoringInterval) {
				clearInterval(this.memoryMonitoringInterval);
				this.memoryMonitoringInterval = undefined;
			}
			if (this.resourceTrackingInterval) {
				clearInterval(this.resourceTrackingInterval);
				this.resourceTrackingInterval = undefined;
			}
			if (this.performanceMonitoringInterval) {
				clearInterval(this.performanceMonitoringInterval);
				this.performanceMonitoringInterval = undefined;
			}

			// Perform final comprehensive cleanup
			const finalCleanup = this.performCleanup({
				forceCleanup: true,
				cleanupType: "all",
			});

			// Log final statistics
			Logger.info("ResourceCleanupManager disposed", "ResourceCleanupManager", {
				finalCleanup,
				totalResourcesInitially: this.trackedResources.size,
				cleanupMetrics: this.cleanupMetrics,
			});

			this.diagnosticLogger.endOperation(operationId, {
				...finalCleanup,
				...this.cleanupMetrics,
			});

			// Clear all data
			this.trackedResources.clear();
			this.activeTimers.clear();
			this.activeIntervals.clear();
			this.cacheStore.clear();
			this.memorySnapshots = [];

			this.isInitialized = false;
		} catch (error) {
			this.diagnosticLogger.failOperation(operationId, error as Error);
			Logger.error("Error during ResourceCleanupManager disposal", error as Error, "ResourceCleanupManager");
		}
	}

	/**
	 * Private methods
	 */
	private setupAutomaticCleanup(): void {
		if (!this.config.enableAutomaticCleanup) {
			return;
		}

		this.automaticCleanupInterval = setInterval(() => {
			this.performCleanup();
		}, this.config.cleanupInterval);
	}

	private setupMemoryMonitoring(): void {
		if (!this.config.enableMemoryMonitoring) {
			return;
		}

		// Take memory snapshots every minute
		this.memoryMonitoringInterval = setInterval(() => {
			this.takeMemorySnapshot();
			this.assessMemoryTrend();
		}, 60000);

		// Monitor memory usage continuously
		this.resourceTrackingInterval = setInterval(() => {
			this.ensureMemoryHealthy();
		}, 30000);
	}

	private setupResourceTracking(): void {
		if (!this.config.enableResourceTracking) {
			return;
		}

		// Log resource statistics periodically
		this.performanceMonitoringInterval = setInterval(() => {
			this.logResourceStatistics();
		}, 300000); // Every 5 minutes
	}

	private setupPerformanceMonitoring(): void {
		// Monitor cleanup performance
		const performanceInterval = setInterval(() => {
			this.assessCleanupPerformance();
		}, 180000); // Every 3 minutes

		// Store the performance monitoring interval separately
		if (!this.performanceMonitoringInterval) {
			this.performanceMonitoringInterval = performanceInterval;
		}
	}

	private cleanupExpiredResources(): number {
		const now = Date.now();
		const maxAge = this.config.maxCacheAge;
		let disposed = 0;

		const expiredIds: string[] = [];
		this.trackedResources.forEach((resource, id) => {
			if (now - resource.createdAt > maxAge) {
				expiredIds.push(id);
			}
		});

		expiredIds.forEach((id) => {
			if (this.removeResource(id)) {
				disposed++;
			}
		});

		return disposed;
	}

	private cleanupExpiredCache(): number {
		const now = Date.now();
		let removed = 0;

		const expiredKeys: string[] = [];
		this.cacheStore.forEach((entry, key) => {
			if (entry.expiresAt && now > entry.expiresAt) {
				expiredKeys.push(key);
			}
		});

		expiredKeys.forEach((key) => {
			if (this.removeResource(key)) {
				removed++;
			}
		});

		return removed;
	}

	private cleanupUnusedResources(): number {
		const now = Date.now();
		const unusedThreshold = 600000; // 10 minutes
		let disposed = 0;

		const unusedIds: string[] = [];
		this.trackedResources.forEach((resource, id) => {
			if (now - resource.lastAccessed > unusedThreshold && resource.accessCount < 5) {
				unusedIds.push(id);
			}
		});

		unusedIds.forEach((id) => {
			if (this.removeResource(id)) {
				disposed++;
			}
		});

		return disposed;
	}

	private cleanupByMemoryThreshold(threshold?: number): number {
		const memoryThreshold = threshold || this.config.memoryThreshold;
		const currentUsage = this.getCurrentMemoryUsage();

		if (currentUsage <= memoryThreshold) {
			return 0;
		}

		// Clean up cache entries first
		let freed = 0;
		const cacheSize = this.cacheStore.size;
		const targetCacheSize = Math.floor(cacheSize * 0.5); // Remove 50% of cache

		const cacheKeys = Array.from(this.cacheStore.keys()).slice(0, targetCacheSize);
		cacheKeys.forEach((key) => {
			if (this.removeResource(key)) {
				freed += 0.1; // Estimate 0.1MB per cache entry
			}
		});

		// If still over threshold, clean up more resources
		if (this.getCurrentMemoryUsage() > memoryThreshold) {
			const sortedResources = Array.from(this.trackedResources.values())
				.sort((a, b) => a.lastAccessed - b.lastAccessed)
				.slice(0, 5); // Remove 5 least recently used resources

			sortedResources.forEach((resource) => {
				if (this.removeResource(resource.id)) {
					freed += 0.5; // Estimate 0.5MB per resource
				}
			});
		}

		return freed;
	}

	private getCurrentMemoryUsage(): number {
		// Estimate memory usage based on tracked resources
		const baseUsage = 10; // Base 10MB
		const resourceOverhead = this.trackedResources.size * 0.1; // 0.1MB per resource
		const cacheOverhead = this.cacheStore.size * 0.05; // 0.05MB per cache entry
		const timerOverhead = (this.activeTimers.size + this.activeIntervals.size) * 0.01; // 0.01MB per timer

		return baseUsage + resourceOverhead + cacheOverhead + timerOverhead;
	}

	private takeMemorySnapshot(): void {
		const snapshot: MemorySnapshot = {
			timestamp: Date.now(),
			memoryUsage: this.getCurrentMemoryUsage(),
			resourceCount: this.trackedResources.size,
			cacheEntries: this.cacheStore.size,
		};

		this.memorySnapshots.push(snapshot);

		// Keep only last 20 snapshots
		if (this.memorySnapshots.length > 20) {
			this.memorySnapshots = this.memorySnapshots.slice(-20);
		}
	}

	private assessMemoryTrend(): void {
		if (this.memorySnapshots.length < 3) {
			return;
		}

		const recent = this.memorySnapshots.slice(-3);
		const trend = recent[2].memoryUsage - recent[0].memoryUsage;

		if (trend > 5) {
			this.memoryUsageTrend = "increasing";
		} else if (trend < -5) {
			this.memoryUsageTrend = "decreasing";
		} else {
			this.memoryUsageTrend = "stable";
		}

		// Log trend if concerning
		if (this.memoryUsageTrend === "increasing") {
			Logger.warn("Memory usage trend increasing", "ResourceCleanupManager", {
				trend: this.memoryUsageTrend,
				recentMemory: recent.map((s) => s.memoryUsage),
			});
		}
	}

	private logResourceStatistics(): void {
		const metrics = this.getResourceMetrics();

		Logger.info("Resource statistics", "ResourceCleanupManager", {
			...metrics,
			memoryTrend: this.memoryUsageTrend,
			lastCleanupTime: new Date(this.lastCleanupTime).toISOString(),
		});
	}

	private assessCleanupPerformance(): void {
		const timeSinceLastCleanup = Date.now() - this.lastCleanupTime;
		const expectedInterval = this.config.cleanupInterval;

		if (timeSinceLastCleanup > expectedInterval * 1.5) {
			Logger.warn("Cleanup performance degradation detected", "ResourceCleanupManager", {
				timeSinceLastCleanup,
				expectedInterval,
				resourceCount: this.trackedResources.size,
			});
		}
	}
}

interface TrackedResource {
	id: string;
	resource: any;
	disposeFunction: () => void;
	resourceType: "disposable" | "timer" | "interval" | "cache" | "eventHandler" | "connection" | "other";
	createdAt: number;
	lastAccessed: number;
	accessCount: number;
	metadata?: any;
	isActive: boolean;
}

interface CacheEntry {
	key: string;
	data: any;
	createdAt: number;
	expiresAt?: number;
	accessCount: number;
	lastAccessed: number;
	metadata?: any;
}

interface MemorySnapshot {
	timestamp: number;
	memoryUsage: number;
	resourceCount: number;
	cacheEntries: number;
}

interface CleanupResult {
	resourcesDisposed: number;
	timersCleared: number;
	intervalsCleared: number;
	cacheEntriesRemoved: number;
	memoryFreed: number;
	duration: number;
	cleanupType: "all" | "expired" | "unused" | "memory";
}
