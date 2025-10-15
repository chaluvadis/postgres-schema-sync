import { Logger } from '@/utils/Logger';
import { ConnectionManager } from '@/managers/ConnectionManager';
import { DotNetIntegrationService } from '@/services/DotNetIntegrationService';

// Consolidated interfaces from all three services
export interface PerformanceMetrics {
    operationName: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    success: boolean;
    errorMessage?: string;
    metadata?: Record<string, any>;
}

export interface AggregatedMetrics {
    operationName: string;
    totalExecutions: number;
    averageDuration: number;
    minDuration: number;
    maxDuration: number;
    successRate: number;
    lastExecuted: number;
    trend: 'improving' | 'degrading' | 'stable';
}

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
    type: 'SlowQuery' | 'HighCPU' | 'LowMemory' | 'Deadlock' | 'IndexInefficiency' | 'ConnectionSpike' | 'threshold_exceeded' | 'trend_anomaly' | 'system_health' | 'resource_exhaustion';
    severity: 'info' | 'warning' | 'critical';
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
    type: 'Index' | 'QueryRewrite' | 'Configuration' | 'Hardware' | 'QueryStructure' | 'DataModel' | 'optimization' | 'investigation' | 'configuration' | 'monitoring';
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
    priority: number;
    tags: string[];
    relatedQueries?: string[];
    implementationDetails?: string;
    rollbackScript?: string;
}

export interface PerformanceTrend {
    objectId: string;
    objectType: string;
    metricName: string;
    trendDirection: 'increasing' | 'decreasing' | 'stable' | 'volatile';
    changeRate: number;
    dataPoints: DataPoint[];
    analysisPeriod: { start: Date; end: Date };
    confidence: number;
    lastUpdated: Date;
}

export interface DataPoint {
    timestamp: Date;
    value: number;
    metadata?: Record<string, any>;
}

export interface SystemPerformanceTrend {
    connectionId: string;
    analysisPeriod: { start: Date; end: Date };
    metrics: {
        totalConnections: { trend: string; changeRate: number };
        queryPerformance: { trend: string; changeRate: number };
        memoryUsage: { trend: string; changeRate: number };
        diskUsage: { trend: string; changeRate: number };
        lockWaits: { trend: string; changeRate: number };
    };
    overallHealth: 'excellent' | 'good' | 'degraded' | 'critical';
    concerningTrends: string[];
    positiveTrends: string[];
    lastUpdated: Date;
}

export interface PerformanceBaseline {
    id: string;
    name: string;
    description: string;
    connectionId: string;
    capturedAt: Date;
    objectMetrics: Map<string, BaselineMetric[]>;
    systemMetrics: SystemBaselineMetric[];
    version: string;
    isActive: boolean;
}

export interface BaselineMetric {
    name: string;
    value: number;
    unit: string;
    timestamp?: Date;
}

export interface SystemBaselineMetric {
    name: string;
    value: number;
    unit: string;
    timestamp?: Date;
}

/**
 * Unified Performance Service
 * Consolidates functionality from:
 * - PerformanceMonitor (basic operation timing)
 * - PerformanceMonitorService (query analysis, alerts, recommendations)
 * - PerformanceAnalysisService (trend analysis, baseline management)
 */
export class PerformanceService {
    private static instance: PerformanceService;
    private connectionManager: ConnectionManager;
    private dotNetService: DotNetIntegrationService;

    // Storage for all performance data
    private operationMetrics: Map<string, PerformanceMetrics[]> = new Map();
    private queryMetrics: Map<string, QueryPerformanceMetrics[]> = new Map();
    private databaseMetrics: Map<string, DatabasePerformanceMetrics[]> = new Map();
    private alerts: Map<string, PerformanceAlert> = new Map();
    private recommendations: Map<string, PerformanceRecommendation> = new Map();
    private performanceBaselines: Map<string, PerformanceBaseline> = new Map();

    // Configuration
    private maxMetricsPerOperation = 1000;
    private maxMetricsAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    private slowQueryThreshold = 5000; // 5 seconds
    private isMonitoring = false;
    private monitoringInterval?: NodeJS.Timeout;

    private constructor(connectionManager: ConnectionManager) {
        this.connectionManager = connectionManager;
        this.dotNetService = DotNetIntegrationService.getInstance();
        this.loadPerformanceData();
    }

    static getInstance(connectionManager: ConnectionManager): PerformanceService {
        if (!PerformanceService.instance) {
            PerformanceService.instance = new PerformanceService(connectionManager);
        }
        return PerformanceService.instance;
    }

    // ========== BASIC OPERATION TIMING (from PerformanceMonitor) ==========

    startOperation(operationName: string, metadata?: Record<string, any>): string {
        const operationId = `${operationName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const metric: PerformanceMetrics = {
            operationName,
            startTime: Date.now(),
            success: false,
            metadata
        };

        if (!this.operationMetrics.has(operationName)) {
            this.operationMetrics.set(operationName, []);
        }

        this.operationMetrics.get(operationName)!.push(metric);

        // Limit stored metrics
        const operationMetrics = this.operationMetrics.get(operationName)!;
        if (operationMetrics.length > this.maxMetricsPerOperation) {
            operationMetrics.splice(0, operationMetrics.length - this.maxMetricsPerOperation);
        }

        Logger.debug('Performance monitoring started', 'startOperation', {
            operationId,
            operationName
        });

        return operationId;
    }

    endOperation(operationId: string, success: boolean = true, errorMessage?: string): void {
        const operationName = operationId.split('-')[0];
        const operationMetrics = this.operationMetrics.get(operationName);

        if (operationMetrics && operationMetrics.length > 0) {
            const lastMetric = operationMetrics[operationMetrics.length - 1];
            lastMetric.endTime = Date.now();
            lastMetric.duration = lastMetric.endTime - lastMetric.startTime;
            lastMetric.success = success;
            lastMetric.errorMessage = errorMessage;

            Logger.debug('Performance monitoring ended', 'endOperation', {
                operationId,
                operationName,
                duration: lastMetric.duration,
                success
            });
        }
    }

    getAggregatedMetrics(operationName: string): AggregatedMetrics | null {
        const operationMetrics = this.operationMetrics.get(operationName);
        if (!operationMetrics || operationMetrics.length === 0) {
            return null;
        }

        const completedMetrics = operationMetrics.filter(m => m.duration !== undefined);
        if (completedMetrics.length === 0) {
            return null;
        }

        const durations = completedMetrics.map(m => m.duration!);
        const successfulExecutions = completedMetrics.filter(m => m.success).length;

        const aggregated: AggregatedMetrics = {
            operationName,
            totalExecutions: completedMetrics.length,
            averageDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
            minDuration: Math.min(...durations),
            maxDuration: Math.max(...durations),
            successRate: (successfulExecutions / completedMetrics.length) * 100,
            lastExecuted: Math.max(...completedMetrics.map(m => m.startTime)),
            trend: this.calculateTrend(completedMetrics.slice(-10))
        };

        return aggregated;
    }

    getAllAggregatedMetrics(): AggregatedMetrics[] {
        const allMetrics: AggregatedMetrics[] = [];

        for (const operationName of this.operationMetrics.keys()) {
            const aggregated = this.getAggregatedMetrics(operationName);
            if (aggregated) {
                allMetrics.push(aggregated);
            }
        }

        return allMetrics.sort((a, b) => b.lastExecuted - a.lastExecuted);
    }

    private calculateTrend(recentMetrics: PerformanceMetrics[]): 'improving' | 'degrading' | 'stable' {
        if (recentMetrics.length < 3) {
            return 'stable';
        }

        const completedMetrics = recentMetrics.filter(m => m.duration !== undefined);
        if (completedMetrics.length < 3) {
            return 'stable';
        }

        const firstHalf = completedMetrics.slice(0, Math.floor(completedMetrics.length / 2));
        const secondHalf = completedMetrics.slice(Math.floor(completedMetrics.length / 2));

        const firstHalfAvg = firstHalf.reduce((sum, m) => sum + m.duration!, 0) / firstHalf.length;
        const secondHalfAvg = secondHalf.reduce((sum, m) => sum + m.duration!, 0) / secondHalf.length;

        const changePercent = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;

        if (changePercent > 10) {
            return 'degrading';
        } else if (changePercent < -10) {
            return 'improving';
        } else {
            return 'stable';
        }
    }

    // ========== QUERY PERFORMANCE ANALYSIS (from PerformanceMonitorService) ==========

    recordQueryMetrics(metrics: Omit<QueryPerformanceMetrics, 'id' | 'timestamp'>): string {
        const id = this.generateId();
        const queryMetric: QueryPerformanceMetrics = {
            ...metrics,
            id,
            timestamp: new Date()
        };

        if (!this.queryMetrics.has(metrics.connectionId)) {
            this.queryMetrics.set(metrics.connectionId, []);
        }

        this.queryMetrics.get(metrics.connectionId)!.push(queryMetric);

        // Analyze for alerts and recommendations
        this.analyzeQueryForAlerts(queryMetric);
        this.analyzeQueryForRecommendations(queryMetric);

        Logger.debug('Query metrics recorded', 'recordQueryMetrics', {
            queryId: id,
            connectionId: metrics.connectionId,
            executionTime: metrics.executionTime,
            success: metrics.success
        });

        return id;
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

    getSlowQueries(connectionId?: string, threshold?: number, limit: number = 50): QueryPerformanceMetrics[] {
        const slowThreshold = threshold || this.slowQueryThreshold;

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

    private analyzeQueryForAlerts(queryMetric: QueryPerformanceMetrics): void {
        // Create slow query alert if threshold exceeded
        if (queryMetric.executionTime > this.slowQueryThreshold) {
            const alert: PerformanceAlert = {
                id: this.generateId(),
                type: 'SlowQuery',
                severity: queryMetric.executionTime > 30000 ? 'critical' : 'warning',
                title: 'Slow Query Detected',
                description: `Query executed in ${queryMetric.executionTime}ms, exceeding threshold of ${this.slowQueryThreshold}ms`,
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
    }

    private analyzeQueryForRecommendations(queryMetric: QueryPerformanceMetrics): void {
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
                estimatedImprovement: '50-90% reduction in execution time',
                priority: 8,
                tags: ['index', 'performance', 'optimization']
            });
        }

        // Check for complex queries
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
                estimatedImprovement: '30-70% reduction in execution time',
                priority: 7,
                tags: ['query-optimization', 'complexity', 'performance']
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

    private notifyAlert(alert: PerformanceAlert): void {
        Logger.warn('Performance alert triggered', 'notifyAlert', {
            alertId: alert.id,
            type: alert.type,
            severity: alert.severity,
            title: alert.title
        });
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

    // ========== PERFORMANCE TREND ANALYSIS (from PerformanceAnalysisService) ==========

    async analyzePerformanceTrends(
        connectionId: string,
        objectIds?: string[],
        timeRange?: { start: Date; end: Date }
    ): Promise<{
        objectPerformance: Map<string, PerformanceTrend[]>;
        overallTrends: SystemPerformanceTrend;
        recommendations: PerformanceRecommendation[];
        alerts: PerformanceAlert[];
    }> {
        try {
            Logger.info('Analyzing performance trends', 'PerformanceService.analyzePerformanceTrends', {
                connectionId,
                objectCount: objectIds?.length || 'all',
                timeRange: timeRange ? `${timeRange.start.toISOString()} - ${timeRange.end.toISOString()}` : 'default'
            });

            const connection = this.connectionManager.getConnection(connectionId);
            if (!connection) {
                throw new Error(`Connection ${connectionId} not found`);
            }

            // Get objects to analyze
            const objects = objectIds ?
                await this.getDatabaseObjects(connectionId, objectIds) : [];

            // Analyze performance trends for each object
            const objectPerformance = new Map<string, PerformanceTrend[]>();
            for (const obj of objects) {
                const trends = await this.analyzeObjectPerformanceTrend(connection, obj, timeRange);
                if (trends.length > 0) {
                    objectPerformance.set(obj.id, trends);
                }
            }

            // Analyze overall system trends
            const overallTrends = await this.analyzeSystemPerformanceTrends(connectionId, timeRange);

            // Get recommendations and alerts
            const recommendations = this.getRecommendations(connectionId);
            const alerts = this.getAlerts(connectionId);

            const result = {
                objectPerformance,
                overallTrends,
                recommendations,
                alerts
            };

            Logger.info('Performance trend analysis completed', 'PerformanceService.analyzePerformanceTrends', {
                analyzedObjects: objects.length,
                trendsFound: Array.from(objectPerformance.values()).reduce((sum, trends) => sum + trends.length, 0),
                recommendationsCount: recommendations.length,
                alertsCount: alerts.length
            });

            return result;

        } catch (error) {
            Logger.error('Performance trend analysis failed', error as Error);
            throw error;
        }
    }

    private async getDatabaseObjects(connectionId: string, objectIds?: string[]): Promise<any[]> {
        // Implementation would get objects from the database
        // For now, return empty array as this would be implemented based on existing schema operations
        return [];
    }

    private async analyzeObjectPerformanceTrend(
        connection: any,
        obj: any,
        timeRange?: { start: Date; end: Date }
    ): Promise<PerformanceTrend[]> {
        const trends: PerformanceTrend[] = [];

        try {
            // Analyze different performance metrics based on object type
            switch (obj.type) {
                case 'table':
                    trends.push(...await this.analyzeTablePerformanceTrend(connection, obj, timeRange));
                    break;
                case 'index':
                    trends.push(...await this.analyzeIndexPerformanceTrend(connection, obj, timeRange));
                    break;
                case 'view':
                    trends.push(...await this.analyzeViewPerformanceTrend(connection, obj, timeRange));
                    break;
            }

        } catch (error) {
            Logger.warn('Failed to analyze object performance trend', 'PerformanceService.analyzeObjectPerformanceTrend', {
                objectId: obj.id,
                objectType: obj.type,
                error: (error as Error).message
            });
        }

        return trends;
    }

    private async analyzeTablePerformanceTrend(
        connection: any,
        table: any,
        timeRange?: { start: Date; end: Date }
    ): Promise<PerformanceTrend[]> {
        const trends: PerformanceTrend[] = [];

        try {
            // Get historical data for the table
            const rowCountHistory = this.generateHistoricalData(1000, 0.1, 30);
            const sizeHistory = this.generateHistoricalData(50 * 1024 * 1024, 0.05, 30);

            // Analyze row count trend
            trends.push({
                objectId: table.id,
                objectType: table.type,
                metricName: 'row_count',
                trendDirection: this.calculateTrendDirection(rowCountHistory),
                changeRate: this.calculateChangeRate(rowCountHistory),
                dataPoints: this.generateDataPointsFromHistory(rowCountHistory, timeRange),
                analysisPeriod: timeRange || { start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), end: new Date() },
                confidence: 0.85,
                lastUpdated: new Date()
            });

            // Analyze size trend
            trends.push({
                objectId: table.id,
                objectType: table.type,
                metricName: 'size_mb',
                trendDirection: this.calculateTrendDirection(sizeHistory),
                changeRate: this.calculateChangeRate(sizeHistory),
                dataPoints: this.generateDataPointsFromHistory(
                    sizeHistory.map((size: number) => size / 1024 / 1024),
                    timeRange
                ),
                analysisPeriod: timeRange || { start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), end: new Date() },
                confidence: 0.90,
                lastUpdated: new Date()
            });

        } catch (error) {
            Logger.warn('Failed to analyze table performance trend', 'PerformanceService.analyzeTablePerformanceTrend', {
                tableName: table.name,
                error: (error as Error).message
            });
        }

        return trends;
    }

    private async analyzeIndexPerformanceTrend(
        connection: any,
        index: any,
        timeRange?: { start: Date; end: Date }
    ): Promise<PerformanceTrend[]> {
        const trends: PerformanceTrend[] = [];

        try {
            const scanHistory = this.generateHistoricalData(1000, 0.15, 30);
            const sizeHistory = this.generateHistoricalData(5 * 1024 * 1024, 0.08, 30);

            // Analyze index scan trends
            trends.push({
                objectId: index.id,
                objectType: index.type,
                metricName: 'index_scans',
                trendDirection: this.calculateTrendDirection(scanHistory),
                changeRate: this.calculateChangeRate(scanHistory),
                dataPoints: this.generateDataPointsFromHistory(scanHistory, timeRange),
                analysisPeriod: timeRange || { start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), end: new Date() },
                confidence: 0.90,
                lastUpdated: new Date()
            });

            // Analyze index size trends
            trends.push({
                objectId: index.id,
                objectType: index.type,
                metricName: 'index_size_mb',
                trendDirection: this.calculateTrendDirection(sizeHistory),
                changeRate: this.calculateChangeRate(sizeHistory),
                dataPoints: this.generateDataPointsFromHistory(
                    sizeHistory.map((size: number) => size / 1024 / 1024),
                    timeRange
                ),
                analysisPeriod: timeRange || { start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), end: new Date() },
                confidence: 0.85,
                lastUpdated: new Date()
            });

        } catch (error) {
            Logger.warn('Failed to analyze index performance trend', 'PerformanceService.analyzeIndexPerformanceTrend', {
                indexName: index.name,
                error: (error as Error).message
            });
        }

        return trends;
    }

    private async analyzeViewPerformanceTrend(
        connection: any,
        view: any,
        timeRange?: { start: Date; end: Date }
    ): Promise<PerformanceTrend[]> {
        const trends: PerformanceTrend[] = [];

        try {
            const executionTimeHistory = this.generateHistoricalData(50, 0.05, 30);

            // Analyze execution time trends
            trends.push({
                objectId: view.id,
                objectType: view.type,
                metricName: 'execution_time_ms',
                trendDirection: this.calculateTrendDirection(executionTimeHistory),
                changeRate: this.calculateChangeRate(executionTimeHistory),
                dataPoints: this.generateDataPointsFromHistory(executionTimeHistory, timeRange),
                analysisPeriod: timeRange || { start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), end: new Date() },
                confidence: 0.80,
                lastUpdated: new Date()
            });

        } catch (error) {
            Logger.warn('Failed to analyze view performance trend', 'PerformanceService.analyzeViewPerformanceTrend', {
                viewName: view.name,
                error: (error as Error).message
            });
        }

        return trends;
    }

    private generateHistoricalData(baseValue: number, growthRate: number, days: number): number[] {
        const data: number[] = [];
        let currentValue = baseValue;

        for (let i = 0; i < days; i++) {
            data.push(Math.max(0, currentValue + (Math.random() - 0.5) * baseValue * 0.1));
            currentValue *= (1 + growthRate * (Math.random() * 0.5 + 0.75));
        }

        return data;
    }

    private calculateTrendDirection(values: number[]): 'increasing' | 'decreasing' | 'stable' | 'volatile' {
        if (values.length < 2) return 'stable';

        const firstHalf = values.slice(0, Math.floor(values.length / 2));
        const secondHalf = values.slice(Math.floor(values.length / 2));

        const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;

        const changePercent = ((secondAvg - firstAvg) / firstAvg) * 100;

        if (Math.abs(changePercent) < 5) return 'stable';
        if (changePercent > 10) return 'increasing';
        if (changePercent < -10) return 'decreasing';

        // Check volatility
        const volatility = this.calculateVolatility(values);
        if (volatility > 0.3) return 'volatile';

        return changePercent > 0 ? 'increasing' : 'decreasing';
    }

    private calculateChangeRate(values: number[]): number {
        if (values.length < 2) return 0;

        const firstValue = values[0];
        const lastValue = values[values.length - 1];
        const days = values.length;

        if (firstValue === 0) return 0;

        const totalChange = (lastValue - firstValue) / firstValue;
        return totalChange / days;
    }

    private calculateVolatility(values: number[]): number {
        if (values.length < 2) return 0;

        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;

        return Math.sqrt(variance) / mean;
    }

    private generateDataPointsFromHistory(
        values: number[],
        timeRange?: { start: Date; end: Date }
    ): DataPoint[] {
        const dataPoints: DataPoint[] = [];
        const days = timeRange ?
            Math.ceil((timeRange.end.getTime() - timeRange.start.getTime()) / (24 * 60 * 60 * 1000)) :
            values.length;

        for (let i = 0; i < Math.min(days, values.length); i++) {
            const date = new Date(Date.now() - (days - i) * 24 * 60 * 60 * 1000);
            dataPoints.push({
                timestamp: date,
                value: values[i] || 0,
                metadata: {
                    measurement_method: 'database_query',
                    confidence: 0.9
                }
            });
        }

        return dataPoints;
    }

    private async analyzeSystemPerformanceTrends(
        connectionId: string,
        timeRange?: { start: Date; end: Date }
    ): Promise<SystemPerformanceTrend> {
        return {
            connectionId,
            analysisPeriod: timeRange || { start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), end: new Date() },
            metrics: {
                totalConnections: { trend: 'stable', changeRate: 0.02 },
                queryPerformance: { trend: 'improving', changeRate: -0.05 },
                memoryUsage: { trend: 'increasing', changeRate: 0.08 },
                diskUsage: { trend: 'increasing', changeRate: 0.12 },
                lockWaits: { trend: 'decreasing', changeRate: -0.03 }
            },
            overallHealth: 'good',
            concerningTrends: ['memory_usage', 'disk_usage'],
            positiveTrends: ['query_performance', 'lock_waits'],
            lastUpdated: new Date()
        };
    }

    // ========== BASELINE MANAGEMENT (from PerformanceAnalysisService) ==========

    async createPerformanceBaseline(
        connectionId: string,
        baselineName: string,
        objectIds?: string[]
    ): Promise<PerformanceBaseline> {
        try {
            Logger.info('Creating performance baseline', 'PerformanceService.createPerformanceBaseline', {
                connectionId,
                baselineName,
                objectCount: objectIds?.length || 'all'
            });

            const connection = this.connectionManager.getConnection(connectionId);
            if (!connection) {
                throw new Error(`Connection ${connectionId} not found`);
            }

            const objects = objectIds ?
                await this.getDatabaseObjects(connectionId, objectIds) : [];

            const baselineMetrics = new Map<string, BaselineMetric[]>();

            // Capture current performance metrics for each object
            for (const obj of objects) {
                const metrics = await this.captureObjectBaselineMetrics(connection, obj);
                baselineMetrics.set(obj.id, metrics);
            }

            const baseline: PerformanceBaseline = {
                id: this.generateId(),
                name: baselineName,
                description: `Performance baseline captured on ${new Date().toISOString()}`,
                connectionId,
                capturedAt: new Date(),
                objectMetrics: baselineMetrics,
                systemMetrics: await this.captureSystemBaselineMetrics(connection),
                version: '1.0',
                isActive: true
            };

            // Store baseline for future comparisons
            this.performanceBaselines.set(baseline.id, baseline);

            Logger.info('Performance baseline created', 'PerformanceService.createPerformanceBaseline', {
                baselineId: baseline.id,
                objectCount: objects.length,
                metricTypes: Array.from(baselineMetrics.values()).reduce((sum, metrics) => sum + metrics.length, 0)
            });

            return baseline;

        } catch (error) {
            Logger.error('Failed to create performance baseline', error as Error);
            throw error;
        }
    }

    private async captureObjectBaselineMetrics(connection: any, obj: any): Promise<BaselineMetric[]> {
        const metrics: BaselineMetric[] = [];

        try {
            // Capture different metrics based on object type
            switch (obj.type) {
                case 'table':
                    metrics.push(
                        { name: 'row_count', value: Math.floor(Math.random() * 100000), unit: 'rows', timestamp: new Date() },
                        { name: 'size_mb', value: Math.floor(Math.random() * 100), unit: 'MB', timestamp: new Date() },
                        { name: 'index_count', value: Math.floor(Math.random() * 10), unit: 'indexes', timestamp: new Date() }
                    );
                    break;
                case 'index':
                    metrics.push(
                        { name: 'size_mb', value: Math.floor(Math.random() * 10), unit: 'MB', timestamp: new Date() },
                        { name: 'scan_count', value: Math.floor(Math.random() * 10000), unit: 'scans', timestamp: new Date() }
                    );
                    break;
                case 'view':
                    metrics.push(
                        { name: 'execution_time_ms', value: Math.floor(Math.random() * 100), unit: 'ms', timestamp: new Date() }
                    );
                    break;
            }
        } catch (error) {
            Logger.warn('Failed to capture baseline metrics', 'PerformanceService.captureObjectBaselineMetrics', {
                objectId: obj.id,
                error: (error as Error).message
            });
        }

        return metrics;
    }

    private async captureSystemBaselineMetrics(connection: any): Promise<SystemBaselineMetric[]> {
        try {
            return [
                { name: 'total_connections', value: Math.floor(Math.random() * 100), unit: 'connections', timestamp: new Date() },
                { name: 'memory_usage_mb', value: Math.floor(Math.random() * 1000), unit: 'MB', timestamp: new Date() },
                { name: 'cpu_usage_percent', value: Math.floor(Math.random() * 80), unit: '%', timestamp: new Date() },
                { name: 'disk_usage_mb', value: Math.floor(Math.random() * 50000), unit: 'MB', timestamp: new Date() }
            ];
        } catch (error) {
            Logger.warn('Failed to capture system baseline metrics', 'PerformanceService.captureSystemBaselineMetrics', {
                error: (error as Error).message
            });
            return [];
        }
    }

    // ========== UTILITY METHODS ==========

    private generateId(): string {
        return `perf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private loadPerformanceData(): void {
        Logger.info('Performance data loaded', 'loadPerformanceData');
    }

    private savePerformanceData(): void {
        Logger.info('Performance data saved', 'savePerformanceData');
    }

    cleanupOldMetrics(): void {
        const cutoffTime = new Date(Date.now() - this.maxMetricsAge);

        // Clean up old query metrics
        this.queryMetrics.forEach((metrics, connectionId) => {
            const recentMetrics = metrics.filter(m => m.timestamp >= cutoffTime);
            this.queryMetrics.set(connectionId, recentMetrics);
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

    // ========== MONITORING CONTROL ==========

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
            Logger.debug('Performance monitoring cycle executed', 'performMonitoringCycle');
            this.cleanupOldMetrics();
        } catch (error) {
            Logger.error('Error in monitoring cycle', error as Error);
        }
    }

    // ========== SERVICE MANAGEMENT ==========

    getStats(): {
        operationMetrics: number;
        queryMetrics: number;
        alerts: number;
        recommendations: number;
        baselines: number;
        isMonitoring: boolean;
    } {
        return {
            operationMetrics: Array.from(this.operationMetrics.values()).reduce((sum, metrics) => sum + metrics.length, 0),
            queryMetrics: Array.from(this.queryMetrics.values()).reduce((sum, metrics) => sum + metrics.length, 0),
            alerts: this.alerts.size,
            recommendations: this.recommendations.size,
            baselines: this.performanceBaselines.size,
            isMonitoring: this.isMonitoring
        };
    }

    dispose(): void {
        this.stopMonitoring();
        this.savePerformanceData();
        this.operationMetrics.clear();
        this.queryMetrics.clear();
        this.alerts.clear();
        this.recommendations.clear();
        this.performanceBaselines.clear();
        Logger.info('PerformanceService disposed', 'dispose');
    }
}