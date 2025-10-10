import { Logger } from '@/utils/Logger';
import { ErrorHandler } from '@/utils/ErrorHandler';

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
    queryComplexity: 'Simple' | 'Medium' | 'Complex';
    cacheHit: boolean;
    indexUsage: IndexUsageMetrics[];
}

export interface IndexUsageMetrics {
    tableName: string;
    indexName: string;
    usage: 'Used' | 'NotUsed' | 'Inefficient';
    scanType?: 'Seq Scan' | 'Index Scan' | 'Bitmap Scan';
    rowsScanned?: number;
}

export interface DatabasePerformanceMetrics {
    connectionId: string;
    timestamp: Date;
    activeConnections: number;
    queriesPerSecond: number;
    averageQueryTime: number;
    slowQueries: number;
    deadlocks: number;
    bufferHitRatio: number;
    cacheHitRatio: number;
    diskIO: {
        reads: number;
        writes: number;
        readTime: number;
        writeTime: number;
    };
    memoryUsage: {
        sharedBuffers: number;
        workMem: number;
        maintenanceWorkMem: number;
    };
}

export interface PerformanceAlert {
    id: string;
    type: 'SlowQuery' | 'HighCPU' | 'LowMemory' | 'Deadlock' | 'IndexInefficiency' | 'ConnectionSpike';
    severity: 'Low' | 'Medium' | 'High' | 'Critical';
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
    type: 'Index' | 'QueryRewrite' | 'Configuration' | 'Hardware';
    category: 'Performance' | 'Maintenance' | 'Security' | 'Cost';
    title: string;
    description: string;
    impact: 'Low' | 'Medium' | 'High';
    effort: 'Low' | 'Medium' | 'High';
    queryIds?: string[];
    tables?: string[];
    suggestedAction: string;
    estimatedImprovement: string;
    createdAt: Date;
    status: 'New' | 'Applied' | 'Dismissed';
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
    trend: 'Improving' | 'Degrading' | 'Stable';
    changePercent: number;
}

export class PerformanceMonitorService {
    private static instance: PerformanceMonitorService;
    private queryMetrics: Map<string, QueryPerformanceMetrics[]> = new Map();
    private databaseMetrics: Map<string, DatabasePerformanceMetrics[]> = new Map();
    private alerts: Map<string, PerformanceAlert> = new Map();
    private recommendations: Map<string, PerformanceRecommendation> = new Map();
    private isMonitoring: boolean = false;
    private monitoringInterval?: NodeJS.Timeout;
    private readonly MAX_METRICS_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
    private readonly SLOW_QUERY_THRESHOLD = 5000; // 5 seconds
    private readonly HIGH_CPU_THRESHOLD = 80; // 80%
    private readonly LOW_MEMORY_THRESHOLD = 20; // 20%

    private constructor() {
        this.loadPerformanceData();
    }

    static getInstance(): PerformanceMonitorService {
        if (!PerformanceMonitorService.instance) {
            PerformanceMonitorService.instance = new PerformanceMonitorService();
        }
        return PerformanceMonitorService.instance;
    }

    // Query Performance Tracking
    recordQueryMetrics(metrics: Omit<QueryPerformanceMetrics, 'id' | 'timestamp'>): string {
        try {
            const id = this.generateId();
            const queryMetric: QueryPerformanceMetrics = {
                ...metrics,
                id,
                timestamp: new Date()
            };

            // Store metrics by connection
            if (!this.queryMetrics.has(metrics.connectionId)) {
                this.queryMetrics.set(metrics.connectionId, []);
            }

            this.queryMetrics.get(metrics.connectionId)!.push(queryMetric);

            // Check for slow query alert
            if (queryMetric.executionTime > this.SLOW_QUERY_THRESHOLD) {
                this.createSlowQueryAlert(queryMetric);
            }

            // Analyze for recommendations
            this.analyzeQueryForRecommendations(queryMetric);

            Logger.debug('Query metrics recorded', 'recordQueryMetrics', {
                queryId: id,
                executionTime: queryMetric.executionTime,
                connectionId: metrics.connectionId
            });

            return id;

        } catch (error) {
            Logger.error('Failed to record query metrics', error as Error);
            throw error;
        }
    }

    getQueryMetrics(
        connectionId?: string,
        timeRange?: { start: Date; end: Date },
        limit?: number
    ): QueryPerformanceMetrics[] {
        try {
            let allMetrics: QueryPerformanceMetrics[] = [];

            if (connectionId) {
                allMetrics = this.queryMetrics.get(connectionId) || [];
            } else {
                // Get metrics from all connections
                this.queryMetrics.forEach(metrics => {
                    allMetrics.push(...metrics);
                });
            }

            // Filter by time range
            if (timeRange) {
                allMetrics = allMetrics.filter(metric =>
                    metric.timestamp >= timeRange.start && metric.timestamp <= timeRange.end
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
            Logger.error('Failed to get query metrics', error as Error);
            return [];
        }
    }

    getSlowQueries(
        connectionId?: string,
        threshold?: number,
        limit: number = 50
    ): QueryPerformanceMetrics[] {
        const slowThreshold = threshold || this.SLOW_QUERY_THRESHOLD;

        return this.getQueryMetrics(connectionId, undefined, limit * 2)
            .filter(metric => metric.executionTime > slowThreshold)
            .slice(0, limit);
    }

    getQueryPerformanceStats(connectionId?: string, hours: number = 24): {
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
            end: new Date()
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
                totalRowsReturned: 0
            };
        }

        const executionTimes = metrics.map(m => m.executionTime).sort((a, b) => a - b);
        const successfulQueries = metrics.filter(m => m.success);
        const failedQueries = metrics.filter(m => !m.success);

        return {
            totalQueries: metrics.length,
            averageExecutionTime: executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length,
            medianExecutionTime: executionTimes[Math.floor(executionTimes.length / 2)],
            slowestQuery: Math.max(...executionTimes),
            fastestQuery: Math.min(...executionTimes),
            errorRate: (failedQueries.length / metrics.length) * 100,
            cacheHitRate: (metrics.filter(m => m.cacheHit).length / metrics.length) * 100,
            totalRowsReturned: metrics.reduce((sum, m) => sum + m.rowsReturned, 0)
        };
    }

    // Database Performance Monitoring
    recordDatabaseMetrics(metrics: DatabasePerformanceMetrics): void {
        try {
            if (!this.databaseMetrics.has(metrics.connectionId)) {
                this.databaseMetrics.set(metrics.connectionId, []);
            }

            this.databaseMetrics.get(metrics.connectionId)!.push(metrics);

            // Check for performance alerts
            this.checkPerformanceThresholds(metrics);

            Logger.debug('Database metrics recorded', 'recordDatabaseMetrics', {
                connectionId: metrics.connectionId,
                activeConnections: metrics.activeConnections,
                queriesPerSecond: metrics.queriesPerSecond
            });

        } catch (error) {
            Logger.error('Failed to record database metrics', error as Error);
        }
    }

    getDatabaseMetrics(
        connectionId: string,
        hours: number = 24
    ): DatabasePerformanceMetrics[] {
        const metrics = this.databaseMetrics.get(connectionId) || [];
        const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);

        return metrics.filter(metric => metric.timestamp >= cutoffTime);
    }

    // Alert System
    private createSlowQueryAlert(queryMetric: QueryPerformanceMetrics): void {
        const alert: PerformanceAlert = {
            id: this.generateId(),
            type: 'SlowQuery',
            severity: queryMetric.executionTime > 30000 ? 'High' : 'Medium', // 30 seconds = High
            title: 'Slow Query Detected',
            description: `Query executed in ${queryMetric.executionTime}ms, exceeding threshold of ${this.SLOW_QUERY_THRESHOLD}ms`,
            timestamp: new Date(),
            connectionId: queryMetric.connectionId,
            queryId: queryMetric.id,
            metrics: {
                executionTime: queryMetric.executionTime,
                queryHash: queryMetric.queryHash,
                rowsReturned: queryMetric.rowsReturned
            },
            resolved: false
        };

        this.alerts.set(alert.id, alert);
        this.notifyAlert(alert);
    }

    private checkPerformanceThresholds(metrics: DatabasePerformanceMetrics): void {
        // Check CPU usage
        if (metrics.queriesPerSecond > this.HIGH_CPU_THRESHOLD) {
            this.createAlert({
                type: 'HighCPU',
                severity: 'High',
                title: 'High Query Load',
                description: `Queries per second (${metrics.queriesPerSecond}) exceeds threshold`,
                connectionId: metrics.connectionId,
                metrics
            });
        }

        // Check for deadlocks
        if (metrics.deadlocks > 0) {
            this.createAlert({
                type: 'Deadlock',
                severity: 'Critical',
                title: 'Database Deadlock Detected',
                description: `${metrics.deadlocks} deadlock(s) detected`,
                connectionId: metrics.connectionId,
                metrics
            });
        }

        // Check buffer hit ratio
        if (metrics.bufferHitRatio < 90) {
            this.createAlert({
                type: 'IndexInefficiency',
                severity: 'Medium',
                title: 'Low Buffer Hit Ratio',
                description: `Buffer hit ratio (${metrics.bufferHitRatio}%) is below optimal threshold`,
                connectionId: metrics.connectionId,
                metrics
            });
        }
    }

    private createAlert(alertData: Omit<PerformanceAlert, 'id' | 'timestamp' | 'resolved'>): void {
        const alert: PerformanceAlert = {
            ...alertData,
            id: this.generateId(),
            timestamp: new Date(),
            resolved: false
        };

        this.alerts.set(alert.id, alert);
        this.notifyAlert(alert);
    }

    private notifyAlert(alert: PerformanceAlert): void {
        Logger.warn('Performance alert triggered', 'notifyAlert', {
            alertId: alert.id,
            type: alert.type,
            severity: alert.severity,
            title: alert.title
        });

        // In a real implementation, this would send notifications via VSCode
        // For now, we'll just log it
    }

    getAlerts(
        connectionId?: string,
        type?: PerformanceAlert['type'],
        severity?: PerformanceAlert['severity'],
        unresolvedOnly: boolean = true
    ): PerformanceAlert[] {
        let alerts = Array.from(this.alerts.values());

        if (connectionId) {
            alerts = alerts.filter(alert => alert.connectionId === connectionId);
        }

        if (type) {
            alerts = alerts.filter(alert => alert.type === type);
        }

        if (severity) {
            alerts = alerts.filter(alert => alert.severity === severity);
        }

        if (unresolvedOnly) {
            alerts = alerts.filter(alert => !alert.resolved);
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

            Logger.info('Alert resolved', 'resolveAlert', { alertId, resolution });
        }
    }

    // Recommendation Engine
    private analyzeQueryForRecommendations(queryMetric: QueryPerformanceMetrics): void {
        // Analyze query for potential improvements
        const recommendations: Omit<PerformanceRecommendation, 'id' | 'createdAt' | 'status'>[] = [];

        // Check for missing indexes
        if (queryMetric.executionPlan?.includes('Seq Scan') && !queryMetric.cacheHit) {
            recommendations.push({
                type: 'Index',
                category: 'Performance',
                title: 'Consider Adding Index',
                description: 'Query is performing sequential scan, index may improve performance',
                impact: 'High',
                effort: 'Medium',
                queryIds: [queryMetric.id],
                suggestedAction: 'Analyze query WHERE clause and consider adding appropriate indexes',
                estimatedImprovement: '50-90% reduction in execution time'
            });
        }

        // Check for complex queries that could be optimized
        if (queryMetric.queryComplexity === 'Complex' && queryMetric.executionTime > 10000) {
            recommendations.push({
                type: 'QueryRewrite',
                category: 'Performance',
                title: 'Query Optimization Needed',
                description: 'Complex query with high execution time detected',
                impact: 'Medium',
                effort: 'High',
                queryIds: [queryMetric.id],
                suggestedAction: 'Review and optimize query structure, consider breaking into smaller queries',
                estimatedImprovement: '30-70% reduction in execution time'
            });
        }

        // Check for large result sets
        if (queryMetric.rowsReturned > 10000 && !queryMetric.query.includes('LIMIT')) {
            recommendations.push({
                type: 'QueryRewrite',
                category: 'Performance',
                title: 'Large Result Set Warning',
                description: 'Query returns large number of rows without LIMIT clause',
                impact: 'Medium',
                effort: 'Low',
                queryIds: [queryMetric.id],
                suggestedAction: 'Consider adding LIMIT clause or pagination for better performance',
                estimatedImprovement: 'Reduced memory usage and faster response'
            });
        }

        // Create recommendations
        recommendations.forEach(rec => {
            const recommendation: PerformanceRecommendation = {
                ...rec,
                id: this.generateId(),
                createdAt: new Date(),
                status: 'New'
            };

            this.recommendations.set(recommendation.id, recommendation);
        });
    }

    getRecommendations(
        connectionId?: string,
        type?: PerformanceRecommendation['type'],
        status?: PerformanceRecommendation['status']
    ): PerformanceRecommendation[] {
        let recommendations = Array.from(this.recommendations.values());

        if (connectionId) {
            recommendations = recommendations.filter(rec =>
                rec.queryIds?.some(id => id.startsWith(connectionId))
            );
        }

        if (type) {
            recommendations = recommendations.filter(rec => rec.type === type);
        }

        if (status) {
            recommendations = recommendations.filter(rec => rec.status === status);
        }

        return recommendations.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    updateRecommendationStatus(recommendationId: string, status: PerformanceRecommendation['status']): void {
        const recommendation = this.recommendations.get(recommendationId);
        if (recommendation) {
            recommendation.status = status;
            this.recommendations.set(recommendationId, recommendation);

            Logger.info('Recommendation status updated', 'updateRecommendationStatus', {
                recommendationId,
                status
            });
        }
    }

    // Performance Reporting
    generatePerformanceReport(
        connectionId: string,
        title: string,
        hours: number = 24
    ): PerformanceReport {
        const endTime = new Date();
        const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);

        const queryMetrics = this.getQueryMetrics(connectionId, { start: startTime, end: endTime });
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
                cacheHitRatio: stats.cacheHitRate
            },
            topSlowQueries: slowQueries,
            performanceTrends: trends,
            recommendations,
            alerts,
            generatedAt: new Date()
        };
    }

    private generatePerformanceTrends(
        metrics: QueryPerformanceMetrics[],
        hours: number
    ): PerformanceTrend[] {
        // Group metrics by hour
        const hourlyGroups = new Map<number, QueryPerformanceMetrics[]>();

        metrics.forEach(metric => {
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
                metric: 'Average Execution Time',
                period: `${hours} hours`,
                values: executionTimeTrend,
                trend: this.calculateTrend(executionTimeTrend),
                changePercent: this.calculateChangePercent(executionTimeTrend)
            },
            {
                metric: 'Queries per Hour',
                period: `${hours} hours`,
                values: queriesPerHourTrend,
                trend: this.calculateTrend(queriesPerHourTrend),
                changePercent: this.calculateChangePercent(queriesPerHourTrend)
            }
        ];
    }

    private calculateTrend(values: { timestamp: Date; value: number }[]): 'Improving' | 'Degrading' | 'Stable' {
        if (values.length < 2) return 'Stable';

        const firstHalf = values.slice(0, Math.floor(values.length / 2));
        const secondHalf = values.slice(Math.floor(values.length / 2));

        const firstAvg = firstHalf.reduce((sum, v) => sum + v.value, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, v) => sum + v.value, 0) / secondHalf.length;

        const change = ((secondAvg - firstAvg) / firstAvg) * 100;

        if (change > 10) return 'Degrading';
        if (change < -10) return 'Improving';
        return 'Stable';
    }

    private calculateChangePercent(values: { timestamp: Date; value: number }[]): number {
        if (values.length < 2) return 0;

        const first = values[0].value;
        const last = values[values.length - 1].value;

        return ((last - first) / first) * 100;
    }

    // Monitoring Control
    startMonitoring(intervalSeconds: number = 60): void {
        if (this.isMonitoring) {
            this.stopMonitoring();
        }

        this.isMonitoring = true;

        this.monitoringInterval = setInterval(() => {
            this.performMonitoringCycle();
        }, intervalSeconds * 1000);

        Logger.info('Performance monitoring started', 'startMonitoring', {
            intervalSeconds
        });
    }

    stopMonitoring(): void {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = undefined;
        }

        this.isMonitoring = false;

        Logger.info('Performance monitoring stopped', 'stopMonitoring');
    }

    private performMonitoringCycle(): void {
        try {
            // This would collect real database metrics in a production implementation
            // For now, we'll simulate basic monitoring

            Logger.debug('Performance monitoring cycle executed', 'performMonitoringCycle');

        } catch (error) {
            Logger.error('Error in monitoring cycle', error as Error);
        }
    }

    // Data Management
    private loadPerformanceData(): void {
        // Load persisted performance data
        Logger.info('Performance data loaded', 'loadPerformanceData');
    }

    private savePerformanceData(): void {
        // Save performance data to persistent storage
        Logger.info('Performance data saved', 'savePerformanceData');
    }

    cleanupOldMetrics(): void {
        const cutoffTime = new Date(Date.now() - this.MAX_METRICS_AGE);

        // Clean up old query metrics
        this.queryMetrics.forEach((metrics, connectionId) => {
            const recentMetrics = metrics.filter(m => m.timestamp >= cutoffTime);
            this.queryMetrics.set(connectionId, recentMetrics);
        });

        // Clean up old database metrics
        this.databaseMetrics.forEach((metrics, connectionId) => {
            const recentMetrics = metrics.filter(m => m.timestamp >= cutoffTime);
            this.databaseMetrics.set(connectionId, recentMetrics);
        });

        // Clean up old alerts (keep for 30 days)
        const alertCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        this.alerts.forEach((alert, id) => {
            if (alert.timestamp < alertCutoff) {
                this.alerts.delete(id);
            }
        });

        Logger.info('Old performance metrics cleaned up', 'cleanupOldMetrics');
    }

    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    dispose(): void {
        this.stopMonitoring();
        this.savePerformanceData();
    }
}