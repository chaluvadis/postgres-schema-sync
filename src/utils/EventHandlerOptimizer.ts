import * as vscode from "vscode";
import { Logger } from "@/utils/Logger";
import { DiagnosticLogger } from "@/utils/DiagnosticLogger";

export interface EventHandlerConfig {
	enableDebouncing: boolean;
	enableThrottling: boolean;
	enableConditionalRegistration: boolean;
	maxEventHandlers: number;
	debounceDelay: number;
	throttleDelay: number;
	enablePerformanceMonitoring: boolean;
}

export interface EventHandlerMetrics {
	totalHandlers: number;
	activeHandlers: number;
	slowHandlers: number;
	averageExecutionTime: number;
	lastExecutionTime: number;
}

/**
 * EventHandlerOptimizer - Optimizes event handler registration and execution
 * to prevent extension host unresponsiveness during runtime
 */
export class EventHandlerOptimizer {
	private static instance: EventHandlerOptimizer;
	private diagnosticLogger: DiagnosticLogger;
	private config: EventHandlerConfig;
	private eventHandlers: Map<string, EventHandlerRegistration> = new Map();
	private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
	private throttleTimers: Map<string, NodeJS.Timeout> = new Map();
	private performanceMetrics: Map<string, EventHandlerMetrics> = new Map();
	private isInitialized = false;

	// Event handler registration tracking
	private pendingRegistrations: Array<{
		id: string;
		type: string;
		callback: (...args: any[]) => void;
		args?: any[];
		priority: number;
	}> = [];

	// Predefined event patterns for conditional registration
	private readonly EVENT_PATTERNS = {
		// Text editor events - only register when needed
		textEditor: {
			patterns: ["window.onDidChangeActiveTextEditor", "workspace.onDidChangeTextDocument"],
			conditional: true, // Register only when SQL files are active
			lazyLoad: true,
		},

		// Configuration events - always needed but can be debounced
		configuration: {
			patterns: ["workspace.onDidChangeConfiguration"],
			conditional: false,
			lazyLoad: false,
		},

		// Tree view events - only when tree view is visible
		treeView: {
			patterns: ["treeView.onDidChangeVisibility", "treeView.onDidExpandElement", "treeView.onDidCollapseElement"],
			conditional: true, // Only register when tree view is active
			lazyLoad: true,
		},

		// File system events - lightweight, always needed
		fileSystem: {
			patterns: ["workspace.createFileSystemWatcher", "window.onDidChangeWindowState"],
			conditional: false,
			lazyLoad: false,
		},
	};

	private constructor(config?: Partial<EventHandlerConfig>) {
		this.diagnosticLogger = DiagnosticLogger.getInstance();
		this.config = {
			enableDebouncing: true,
			enableThrottling: true,
			enableConditionalRegistration: true,
			maxEventHandlers: 100,
			debounceDelay: 100,
			throttleDelay: 250,
			enablePerformanceMonitoring: true,
			...config,
		};
	}

	static getInstance(config?: Partial<EventHandlerConfig>): EventHandlerOptimizer {
		if (!EventHandlerOptimizer.instance) {
			EventHandlerOptimizer.instance = new EventHandlerOptimizer(config);
		}
		return EventHandlerOptimizer.instance;
	}

	/**
	 * Initialize the event handler optimizer
	 */
	initialize(): void {
		if (this.isInitialized) {
			Logger.warn("EventHandlerOptimizer already initialized", "EventHandlerOptimizer");
			return;
		}

		const operationId = this.diagnosticLogger.startOperation("EventHandlerOptimizerInitialize", {
			config: this.config,
			eventPatterns: Object.keys(this.EVENT_PATTERNS),
		});

		try {
			this.setupEventHandlerBatching();
			this.setupPerformanceMonitoring();

			Logger.info("EventHandlerOptimizer initialized successfully", "EventHandlerOptimizer", {
				enableDebouncing: this.config.enableDebouncing,
				enableConditionalRegistration: this.config.enableConditionalRegistration,
				eventPatterns: Object.keys(this.EVENT_PATTERNS),
			});

			this.diagnosticLogger.endOperation(operationId, {
				initializationTime: Date.now(),
				optimizationEnabled: this.config.enableDebouncing && this.config.enableThrottling,
			});

			this.isInitialized = true;
		} catch (error) {
			this.diagnosticLogger.failOperation(operationId, error as Error);
			throw error;
		}
	}

	/**
	 * Register an event handler with optimizations
	 */
	registerEventHandler(
		id: string,
		type: string,
		callback: (...args: any[]) => void,
		args?: any[],
		priority: number = 5,
	): vscode.Disposable {
		if (!this.isInitialized) {
			throw new Error("EventHandlerOptimizer not initialized");
		}

		const operationId = this.diagnosticLogger.startOperation(`RegisterEventHandler_${id}`, {
			type,
			priority,
			totalHandlers: this.eventHandlers.size + 1,
		});

		try {
			// Check handler limit
			if (this.eventHandlers.size >= this.config.maxEventHandlers) {
				Logger.warn(
					`Event handler limit reached (${this.config.maxEventHandlers}), skipping registration`,
					"EventHandlerOptimizer",
					{
						handlerId: id,
						currentCount: this.eventHandlers.size,
					},
				);
				this.diagnosticLogger.endOperation(operationId, { status: "limit_reached" });
				return { dispose: () => {} };
			}

			// Check if conditional registration is needed
			if (this.config.enableConditionalRegistration && this.shouldDeferRegistration(type)) {
				// Queue for later registration
				this.pendingRegistrations.push({ id, type, callback, args, priority });
				Logger.debug(`Event handler queued for later registration: ${id}`, "EventHandlerOptimizer");
				this.diagnosticLogger.endOperation(operationId, { status: "queued" });
				return this.createQueueableHandler(id, type, callback, args);
			}

			// Register immediately
			const disposable = this.createOptimizedHandler(id, type, callback, args);
			this.eventHandlers.set(id, {
				id,
				type,
				callback,
				args,
				priority,
				registeredAt: Date.now(),
				executionCount: 0,
				totalExecutionTime: 0,
			});

			this.diagnosticLogger.endOperation(operationId, {
				status: "registered",
				currentHandlerCount: this.eventHandlers.size,
				executionCount: 0,
			});

			return disposable;
		} catch (error) {
			this.diagnosticLogger.failOperation(operationId, error as Error);
			Logger.error(`Failed to register event handler: ${id}`, error as Error, "EventHandlerOptimizer");
			throw error;
		}
	}

	/**
	 * Process queued event handlers
	 */
	processQueuedHandlers(): void {
		if (this.pendingRegistrations.length === 0) {
			return;
		}

		const operationId = this.diagnosticLogger.startOperation("ProcessQueuedHandlers", {
			queuedCount: this.pendingRegistrations.length,
		});

		try {
			const toProcess = [...this.pendingRegistrations].sort((a, b) => a.priority - b.priority);
			let processed = 0;
			let registered = 0;

			for (const registration of toProcess) {
				if (this.shouldRegisterNow(registration.type)) {
					this.createOptimizedHandler(registration.id, registration.type, registration.callback, registration.args);
					registered++;
				}
				processed++;
			}

			// Remove processed registrations
			this.pendingRegistrations = this.pendingRegistrations.filter((r) => !toProcess.includes(r));

			this.diagnosticLogger.endOperation(operationId, {
				processed,
				registered,
				remainingQueued: this.pendingRegistrations.length,
			});

			Logger.info(`Processed ${processed} queued event handlers, registered ${registered}`, "EventHandlerOptimizer");
		} catch (error) {
			this.diagnosticLogger.failOperation(operationId, error as Error);
		}
	}

	/**
	 * Get event handler performance metrics
	 */
	getMetrics(): {
		totalHandlers: number;
		activeHandlers: number;
		queuedHandlers: number;
		performanceMetrics: Map<string, EventHandlerMetrics>;
	} {
		return {
			totalHandlers: this.eventHandlers.size,
			activeHandlers: this.eventHandlers.size - this.pendingRegistrations.length,
			queuedHandlers: this.pendingRegistrations.length,
			performanceMetrics: this.performanceMetrics,
		};
	}

	/**
	 * Clear all event handlers (for cleanup)
	 */
	dispose(): void {
		const operationId = this.diagnosticLogger.startOperation("EventHandlerOptimizerDispose");

		try {
			// Clear all debounce timers
			this.debounceTimers.forEach((timer) => clearTimeout(timer));
			this.debounceTimers.clear();

			// Clear all throttle timers
			this.throttleTimers.forEach((timer) => clearTimeout(timer));
			this.throttleTimers.clear();

			// Clear pending registrations
			this.pendingRegistrations = [];

			Logger.info("EventHandlerOptimizer disposed successfully", "EventHandlerOptimizer", {
				totalHandlers: this.eventHandlers.size,
				metricsCount: this.performanceMetrics.size,
			});

			this.diagnosticLogger.endOperation(operationId, {
				handlersCleared: this.eventHandlers.size,
				metricsCleared: this.performanceMetrics.size,
			});

			this.eventHandlers.clear();
			this.performanceMetrics.clear();
			this.isInitialized = false;
		} catch (error) {
			this.diagnosticLogger.failOperation(operationId, error as Error);
		}
	}

	/**
	 * Private methods
	 */
	private setupEventHandlerBatching(): void {
		// Process pending registrations periodically
		setInterval(() => {
			this.processQueuedHandlers();
		}, 2000); // Check every 2 seconds
	}

	private setupPerformanceMonitoring(): void {
		if (!this.config.enablePerformanceMonitoring) {
			return;
		}

		// Log performance metrics periodically
		setInterval(() => {
			this.logPerformanceMetrics();
		}, 30000); // Every 30 seconds
	}

	private shouldDeferRegistration(type: string): boolean {
		const pattern = this.EVENT_PATTERNS[type as keyof typeof this.EVENT_PATTERNS];
		if (!pattern) {
			return false;
		}
		return pattern.conditional && pattern.lazyLoad;
	}

	private shouldRegisterNow(type: string): boolean {
		const pattern = this.EVENT_PATTERNS[type as keyof typeof this.EVENT_PATTERNS];
		if (!pattern || !pattern.conditional) {
			return true;
		}

		// Add specific conditions here for when to register
		switch (type) {
			case "textEditor":
				return this.hasActiveTextEditor();
			case "treeView":
				return this.hasActiveTreeView();
			default:
				return false;
		}
	}

	private hasActiveTextEditor(): boolean {
		// Check if any SQL file is currently open
		const activeEditor = vscode.window.activeTextEditor;
		if (!activeEditor) {
			return false;
		}
		const document = activeEditor.document;
		return (
			document.languageId === "sql" ||
			document.languageId === "postgresql" ||
			document.fileName.endsWith(".sql") ||
			document.fileName.endsWith(".psql")
		);
	}

	private hasActiveTreeView(): boolean {
		// Check if PostgreSQL tree view is visible
		// This would need to be implemented based on tree view state
		return true; // Simplified for now
	}

	private createOptimizedHandler(
		id: string,
		type: string,
		callback: (...args: any[]) => void,
		args?: any[],
	): vscode.Disposable {
		const wrappedCallback = this.wrapCallback(id, callback);

		// Create the actual VSCode event handler registration
		// This would return the appropriate disposable based on the event type
		const disposable = this.createEventRegistration(type, wrappedCallback);

		Logger.debug(`Created optimized event handler: ${id}`, "EventHandlerOptimizer", {
			type,
			handlersCount: this.eventHandlers.size + 1,
			performanceMonitoring: this.config.enablePerformanceMonitoring,
		});

		return disposable;
	}

	private createQueueableHandler(
		id: string,
		type: string,
		callback: (...args: any[]) => void,
		args?: any[],
	): vscode.Disposable {
		// Create a minimal disposable that will be upgraded later
		let actualDisposable: vscode.Disposable | null = null;
		let isRegistered = false;

		const wrappedCallback = (...eventArgs: any[]) => {
			// If not registered yet, register now and mark as registered
			if (!isRegistered) {
				actualDisposable = this.createOptimizedHandler(id, type, callback, args);
				isRegistered = true;
				Logger.debug(`Upgraded queued event handler to active: ${id}`, "EventHandlerOptimizer");
			}

			// Execute the callback
			callback(...eventArgs);
		};

		return {
			dispose: () => {
				if (actualDisposable) {
					actualDisposable.dispose();
				} else {
					// Remove from pending queue
					this.pendingRegistrations = this.pendingRegistrations.filter((r) => r.id !== id);
				}
			},
		};
	}

	private createEventRegistration(type: string, callback: (...args: any[]) => void): vscode.Disposable {
		// This would create the actual VSCode event registration
		// For now, return a simple disposable as placeholder
		// In a real implementation, this would handle different event types
		return {
			dispose: () => {
				const handler = this.eventHandlers.get(type);
				if (handler) {
					this.eventHandlers.delete(type);
				}
			},
		};
	}

	private wrapCallback(id: string, callback: (...args: any[]) => void): (...args: any[]) => void {
		return (...args: any[]) => {
			const startTime = Date.now();

			try {
				callback(...args);
			} finally {
				// Record performance metrics
				if (this.config.enablePerformanceMonitoring) {
					const executionTime = Date.now() - startTime;
					this.updateMetrics(id, executionTime);
				}
			}
		};
	}

	private updateMetrics(id: string, executionTime: number): void {
		const existing = this.performanceMetrics.get(id) || {
			totalHandlers: 0,
			activeHandlers: 0,
			slowHandlers: 0,
			averageExecutionTime: 0,
			lastExecutionTime: 0,
		};

		const handlerMetrics = this.eventHandlers.get(id);
		if (handlerMetrics) {
			handlerMetrics.executionCount++;
			handlerMetrics.totalExecutionTime += executionTime;
		}

		this.performanceMetrics.set(id, {
			...existing,
			lastExecutionTime: executionTime,
			averageExecutionTime: handlerMetrics
				? handlerMetrics.totalExecutionTime / handlerMetrics.executionCount
				: executionTime,
			slowHandlers: executionTime > 500 ? existing.slowHandlers + 1 : existing.slowHandlers,
		});
	}

	private logPerformanceMetrics(): void {
		if (this.performanceMetrics.size === 0) {
			return;
		}

		const metrics = this.getMetrics();
		const slowHandlers = Array.from(this.performanceMetrics.entries())
			.filter(([, metric]) => metric.slowHandlers > 0)
			.map(([id, metric]) => ({ id, ...metric }));

		if (slowHandlers.length > 0) {
			Logger.warn("Event handlers with slow execution times detected", "EventHandlerOptimizer", {
				slowHandlers: slowHandlers.length,
				metrics: slowHandlers,
			});
		}

		Logger.info("Event handler performance metrics", "EventHandlerOptimizer", {
			totalHandlers: metrics.totalHandlers,
			activeHandlers: metrics.activeHandlers,
			queuedHandlers: metrics.queuedHandlers,
			slowHandlersCount: slowHandlers.length,
		});
	}
}

interface EventHandlerRegistration {
	id: string;
	type: string;
	callback: (...args: any[]) => void;
	args?: any[];
	priority: number;
	registeredAt: number;
	executionCount: number;
	totalExecutionTime: number;
}
