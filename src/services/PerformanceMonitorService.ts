import { Logger } from "@/utils/Logger";

export interface QueryPerformanceMetrics {
	id: string;
	queryHash: string;
	query: string;
	executionTime: number;
	planningTime?: number;
	rowsReturned: number;
	bytesTransferred: number;
	timestamp: Date;
	connectionId: string;
	database: string;
	user: string;
	success: boolean;
	errorMessage?: string;
	executionPlan?: string;
	queryComplexity: "Simple" | "Medium" | "Complex";
	cacheHit: boolean;
	indexUsage: IndexUsageMetrics[];
}
export interface IndexUsageMetrics {
	tableName: string;
	indexName: string;
	usage: "Used" | "NotUsed" | "Inefficient";
	scanType?: "Seq Scan" | "Index Scan" | "Bitmap Scan";
	rowsScanned?: number;
}
export interface PerformanceAlert {
	id: string;
	type: "SlowQuery" | "HighCPU" | "LowMemory" | "Deadlock" | "IndexInefficiency" | "ConnectionSpike";
	severity: "Low" | "Medium" | "High" | "Critical";
	title: string;
	description: string;
	timestamp: Date;
	connectionId?: string;
	queryId?: string;
	metrics: Record<string, any>;
	resolved: boolean;
	resolvedAt?: Date;
	resolution?: string;
}
export interface PerformanceRecommendation {
	id: string;
	type: "Index" | "QueryRewrite" | "Configuration" | "Hardware" | "QueryStructure" | "DataModel";
	category: "Performance" | "Maintenance" | "Security" | "Cost";
	title: string;
	description: string;
	impact: "Low" | "Medium" | "High";
	effort: "Low" | "Medium" | "High";
	queryIds?: string[];
	tables?: string[];
	suggestedAction: string;
	estimatedImprovement: string;
	createdAt: Date;
	status: "New" | "Applied" | "Dismissed";
	priority: number;
	tags: string[];
	relatedQueries?: string[];
	implementationDetails?: string;
	rollbackScript?: string;
}
export interface PerformanceReport {
	id: string;
	title: string;
	period: {
		start: Date;
		end: Date;
	};
	summary: {
		totalQueries: number;
		averageExecutionTime: number;
		totalExecutionTime: number;
		slowQueries: number;
		errorRate: number;
		cacheHitRatio: number;
	};
	topSlowQueries: QueryPerformanceMetrics[];
	performanceTrends: PerformanceTrend[];
	recommendations: PerformanceRecommendation[];
	alerts: PerformanceAlert[];
	generatedAt: Date;
}
export interface PerformanceTrend {
	metric: string;
	period: string;
	values: { timestamp: Date; value: number }[];
	trend: "Improving" | "Degrading" | "Stable";
	changePercent: number;
}
export class PerformanceMonitorService {
	private static instance: PerformanceMonitorService;
	private queryMetrics: Map<string, QueryPerformanceMetrics[]> = new Map();
	private alerts: Map<string, PerformanceAlert> = new Map();
	private recommendations: Map<string, PerformanceRecommendation> = new Map();
	private isMonitoring: boolean = false;
	private monitoringInterval?: NodeJS.Timeout;
	private readonly SLOW_QUERY_THRESHOLD = 5000; // 5 seconds
	private constructor() {
		this.loadPerformanceData();
	}
	static getInstance(): PerformanceMonitorService {
		if (!PerformanceMonitorService.instance) {
			PerformanceMonitorService.instance = new PerformanceMonitorService();
		}
		return PerformanceMonitorService.instance;
	}
	getQueryMetrics(
		connectionId?: string,
		timeRange?: { start: Date; end: Date },
		limit?: number,
	): QueryPerformanceMetrics[] {
		try {
			let allMetrics: QueryPerformanceMetrics[] = [];

			if (connectionId) {
				allMetrics = this.queryMetrics.get(connectionId) || [];
			} else {
				// Get metrics from all connections
				this.queryMetrics.forEach((metrics) => {
					allMetrics.push(...metrics);
				});
			}

			// Filter by time range
			if (timeRange) {
				allMetrics = allMetrics.filter(
					(metric) => metric.timestamp >= timeRange.start && metric.timestamp <= timeRange.end,
				);
			}

			// Sort by timestamp (newest first)
			allMetrics.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

			// Apply limit
			if (limit) {
				allMetrics = allMetrics.slice(0, limit);
			}

			return allMetrics;
		} catch (error) {
			Logger.error("Failed to get query metrics", error as Error);
			return [];
		}
	}
	getSlowQueries(connectionId?: string, threshold?: number, limit: number = 50): QueryPerformanceMetrics[] {
		const slowThreshold = threshold || this.SLOW_QUERY_THRESHOLD;

		return this.getQueryMetrics(connectionId, undefined, limit * 2)
			.filter((metric) => metric.executionTime > slowThreshold)
			.slice(0, limit);
	}
	getQueryPerformanceStats(
		connectionId?: string,
		hours: number = 24,
	): {
		totalQueries: number;
		averageExecutionTime: number;
		medianExecutionTime: number;
		slowestQuery: number;
		fastestQuery: number;
		errorRate: number;
		cacheHitRate: number;
		totalRowsReturned: number;
	} {
		const timeRange = {
			start: new Date(Date.now() - hours * 60 * 60 * 1000),
			end: new Date(),
		};

		const metrics = this.getQueryMetrics(connectionId, timeRange);

		if (metrics.length === 0) {
			return {
				totalQueries: 0,
				averageExecutionTime: 0,
				medianExecutionTime: 0,
				slowestQuery: 0,
				fastestQuery: 0,
				errorRate: 0,
				cacheHitRate: 0,
				totalRowsReturned: 0,
			};
		}

		const executionTimes = metrics.map((m) => m.executionTime).sort((a, b) => a - b);
		const failedQueries = metrics.filter((m) => !m.success);

		return {
			totalQueries: metrics.length,
			averageExecutionTime: executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length,
			medianExecutionTime: executionTimes[Math.floor(executionTimes.length / 2)],
			slowestQuery: Math.max(...executionTimes),
			fastestQuery: Math.min(...executionTimes),
			errorRate: (failedQueries.length / metrics.length) * 100,
			cacheHitRate: (metrics.filter((m) => m.cacheHit).length / metrics.length) * 100,
			totalRowsReturned: metrics.reduce((sum, m) => sum + m.rowsReturned, 0),
		};
	}
	getAlerts(
		connectionId?: string,
		type?: PerformanceAlert["type"],
		severity?: PerformanceAlert["severity"],
		unresolvedOnly: boolean = true,
	): PerformanceAlert[] {
		let alerts = Array.from(this.alerts.values());

		if (connectionId) {
			alerts = alerts.filter((alert) => alert.connectionId === connectionId);
		}

		if (type) {
			alerts = alerts.filter((alert) => alert.type === type);
		}

		if (severity) {
			alerts = alerts.filter((alert) => alert.severity === severity);
		}

		if (unresolvedOnly) {
			alerts = alerts.filter((alert) => !alert.resolved);
		}

		return alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
	}
	resolveAlert(alertId: string, resolution?: string): void {
		const alert = this.alerts.get(alertId);
		if (alert) {
			alert.resolved = true;
			alert.resolvedAt = new Date();
			if (resolution) {
				alert.resolution = resolution;
			}
			this.alerts.set(alertId, alert);

			Logger.info("Alert resolved", "resolveAlert", { alertId, resolution });
		}
	}
	getRecommendations(
		connectionId?: string,
		type?: PerformanceRecommendation["type"],
		status?: PerformanceRecommendation["status"],
	): PerformanceRecommendation[] {
		let recommendations = Array.from(this.recommendations.values());

		if (connectionId) {
			recommendations = recommendations.filter((rec) => rec.queryIds?.some((id) => id.startsWith(connectionId)));
		}

		if (type) {
			recommendations = recommendations.filter((rec) => rec.type === type);
		}

		if (status) {
			recommendations = recommendations.filter((rec) => rec.status === status);
		}

		return recommendations.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
	}
	updateRecommendationStatus(recommendationId: string, status: PerformanceRecommendation["status"]): void {
		const recommendation = this.recommendations.get(recommendationId);
		if (recommendation) {
			recommendation.status = status;
			this.recommendations.set(recommendationId, recommendation);

			Logger.info("Recommendation status updated", "updateRecommendationStatus", {
				recommendationId,
				status,
			});
		}
	}
	generatePerformanceReport(connectionId: string, title: string, hours: number = 24): PerformanceReport {
		const endTime = new Date();
		const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);

		const queryMetrics = this.getQueryMetrics(connectionId, {
			start: startTime,
			end: endTime,
		});
		const stats = this.getQueryPerformanceStats(connectionId, hours);
		const slowQueries = this.getSlowQueries(connectionId, this.SLOW_QUERY_THRESHOLD, 10);
		const alerts = this.getAlerts(connectionId, undefined, undefined, false);
		const recommendations = this.getRecommendations(connectionId);

		// Generate trends (simplified)
		const trends = this.generatePerformanceTrends(queryMetrics, hours);

		return {
			id: this.generateId(),
			title,
			period: { start: startTime, end: endTime },
			summary: {
				totalQueries: stats.totalQueries,
				averageExecutionTime: stats.averageExecutionTime,
				totalExecutionTime: queryMetrics.reduce((sum, m) => sum + m.executionTime, 0),
				slowQueries: slowQueries.length,
				errorRate: stats.errorRate,
				cacheHitRatio: stats.cacheHitRate,
			},
			topSlowQueries: slowQueries,
			performanceTrends: trends,
			recommendations,
			alerts,
			generatedAt: new Date(),
		};
	}
	private generatePerformanceTrends(metrics: QueryPerformanceMetrics[], hours: number): PerformanceTrend[] {
		// Group metrics by hour
		const hourlyGroups = new Map<number, QueryPerformanceMetrics[]>();

		metrics.forEach((metric) => {
			const hour = metric.timestamp.getHours();
			if (!hourlyGroups.has(hour)) {
				hourlyGroups.set(hour, []);
			}
			hourlyGroups.get(hour)!.push(metric);
		});

		// Calculate average execution time per hour
		const executionTimeTrend: { timestamp: Date; value: number }[] = [];
		const queriesPerHourTrend: { timestamp: Date; value: number }[] = [];

		for (let hour = 0; hour < 24; hour++) {
			const hourMetrics = hourlyGroups.get(hour) || [];
			const timestamp = new Date();
			timestamp.setHours(hour, 0, 0, 0);

			if (hourMetrics.length > 0) {
				const avgExecutionTime = hourMetrics.reduce((sum, m) => sum + m.executionTime, 0) / hourMetrics.length;
				executionTimeTrend.push({ timestamp, value: avgExecutionTime });
				queriesPerHourTrend.push({ timestamp, value: hourMetrics.length });
			}
		}

		return [
			{
				metric: "Average Execution Time",
				period: `${hours} hours`,
				values: executionTimeTrend,
				trend: this.calculateTrend(executionTimeTrend),
				changePercent: this.calculateChangePercent(executionTimeTrend),
			},
			{
				metric: "Queries per Hour",
				period: `${hours} hours`,
				values: queriesPerHourTrend,
				trend: this.calculateTrend(queriesPerHourTrend),
				changePercent: this.calculateChangePercent(queriesPerHourTrend),
			},
		];
	}
	private calculateTrend(values: { timestamp: Date; value: number }[]): "Improving" | "Degrading" | "Stable" {
		if (values.length < 2) {
			return "Stable";
		}

		const firstHalf = values.slice(0, Math.floor(values.length / 2));
		const secondHalf = values.slice(Math.floor(values.length / 2));

		const firstAvg = firstHalf.reduce((sum, v) => sum + v.value, 0) / firstHalf.length;
		const secondAvg = secondHalf.reduce((sum, v) => sum + v.value, 0) / secondHalf.length;

		const change = ((secondAvg - firstAvg) / firstAvg) * 100;

		if (change > 10) {
			return "Degrading";
		}
		if (change < -10) {
			return "Improving";
		}
		return "Stable";
	}
	private calculateChangePercent(values: { timestamp: Date; value: number }[]): number {
		if (values.length < 2) {
			return 0;
		}

		const first = values[0].value;
		const last = values[values.length - 1].value;

		return ((last - first) / first) * 100;
	}
	stopMonitoring(): void {
		if (this.monitoringInterval) {
			clearInterval(this.monitoringInterval);
			this.monitoringInterval = undefined;
		}

		this.isMonitoring = false;

		Logger.info("Performance monitoring stopped", "stopMonitoring");
	}
	private loadPerformanceData(): void {
		// Load persisted performance data
		Logger.info("Performance data loaded", "loadPerformanceData");
	}
	private savePerformanceData(): void {
		// Save performance data to persistent storage
		Logger.info("Performance data saved", "savePerformanceData");
	}
	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).substr(2);
	}
	dispose(): void {
		this.stopMonitoring();
		this.savePerformanceData();
	}
}
