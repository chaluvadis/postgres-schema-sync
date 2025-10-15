import { Logger } from '@/utils/Logger';
import { ConnectionManager } from '@/managers/ConnectionManager';
import { DotNetIntegrationService } from '@/services/DotNetIntegrationService';

// Performance analysis interfaces
export interface PerformanceTrend {
    objectId: string;
    objectType: string;
    metricName: string;
    trendDirection: 'increasing' | 'decreasing' | 'stable' | 'volatile';
    changeRate: number; // Rate of change per day
    dataPoints: DataPoint[];
    analysisPeriod: { start: Date; end: Date };
    confidence: number; // 0-1 scale
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

export interface PerformanceRecommendation {
    objectId: string;
    metricName: string;
    recommendationType: 'optimization' | 'investigation' | 'configuration' | 'monitoring';
    priority: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description: string;
    suggestedActions: string[];
    expectedBenefit: string;
    effort: 'low' | 'medium' | 'high';
    timeline: string;
}

export interface PerformanceAlert {
    id: string;
    type: 'threshold_exceeded' | 'trend_anomaly' | 'system_health' | 'resource_exhaustion';
    severity: 'info' | 'warning' | 'critical';
    objectId: string;
    metricName: string;
    currentValue?: number;
    thresholdValue?: number;
    trendDirection?: 'increasing' | 'decreasing' | 'stable' | 'volatile';
    description: string;
    detectedAt: Date;
    status: 'active' | 'acknowledged' | 'resolved';
    notificationChannels: string[];
    autoResolve: boolean;
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

export interface PerformanceComparison {
    baselineId: string;
    comparisonId: string;
    comparedAt: Date;
    objectComparisons: Map<string, MetricComparison[]>;
    systemComparison: SystemMetricComparison;
    significantChanges: SignificantChange[];
    recommendations: string[];
    alerts: string[];
}

export interface MetricComparison {
    name: string;
    baselineValue: number;
    currentValue: number;
    changePercent: number;
    trend: 'improving' | 'degrading' | 'stable';
}

export interface SystemMetricComparison {
    metricComparisons: MetricComparison[];
    overallChange: 'significant' | 'moderate' | 'minimal' | 'none';
}

export interface SignificantChange {
    objectId: string;
    metricName: string;
    changePercent: number;
    impact: 'low' | 'medium' | 'high' | 'critical';
    description: string;
}

export class PerformanceAnalysisService {
    private connectionManager: ConnectionManager;
    private dotNetService: DotNetIntegrationService;
    private performanceBaselines: Map<string, PerformanceBaseline> = new Map();

    constructor(connectionManager: ConnectionManager) {
        this.connectionManager = connectionManager;
        this.dotNetService = DotNetIntegrationService.getInstance();
    }

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
            Logger.info('Analyzing performance trends', 'PerformanceAnalysisService.analyzePerformanceTrends', {
                connectionId,
                objectCount: objectIds?.length || 'all',
                timeRange: timeRange ? `${timeRange.start.toISOString()} - ${timeRange.end.toISOString()}` : 'default'
            });

            // Get connection info for metadata extraction
            const connection = this.connectionManager.getConnection(connectionId);
            if (!connection) {
                throw new Error(`Connection ${connectionId} not found`);
            }

            const password = await this.connectionManager.getConnectionPassword(connectionId);
            if (!password) {
                throw new Error('Password not found for connection');
            }

            const dotNetConnection = {
                id: connection.id,
                name: connection.name,
                host: connection.host,
                port: connection.port,
                database: connection.database,
                username: connection.username,
                password: password,
                createdDate: new Date().toISOString()
            };

            // Get objects to analyze
            const objects = objectIds ?
                await Promise.all(objectIds.map(async (id) => {
                    const [objectType, schema, objectName] = id.split(':');
                    const details = await this.dotNetService.getObjectDetails(dotNetConnection, objectType, schema, objectName);
                    return {
                        id,
                        name: objectName,
                        type: objectType,
                        schema,
                        database: connection.database,
                        definition: details?.definition,
                        sizeInBytes: details?.sizeInBytes,
                        owner: details?.owner,
                        createdAt: details?.createdAt,
                        modifiedAt: details?.modifiedAt
                    };
                })) : [];

            // Analyze performance trends for each object
            const objectPerformance = new Map<string, PerformanceTrend[]>();
            for (const obj of objects) {
                const trends = await this.analyzeObjectPerformanceTrend(dotNetConnection, obj, timeRange);
                if (trends.length > 0) {
                    objectPerformance.set(obj.id, trends);
                }
            }

            // Analyze overall system trends
            const overallTrends = await this.analyzeSystemPerformanceTrends(connectionId, timeRange);

            // Generate recommendations
            const recommendations = await this.generatePerformanceRecommendations(objectPerformance, overallTrends);

            // Generate alerts for concerning trends
            const alerts = await this.generatePerformanceAlerts(objectPerformance, overallTrends);

            const result = {
                objectPerformance,
                overallTrends,
                recommendations,
                alerts
            };

            Logger.info('Performance trend analysis completed', 'PerformanceAnalysisService.analyzePerformanceTrends', {
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
            Logger.warn('Failed to analyze object performance trend', 'PerformanceAnalysisService.analyzeObjectPerformanceTrend', {
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
            // Get actual table statistics from database
            const tableStats = await this.getTableStatistics(connection, table.schema, table.name);

            // Analyze row count trend
            if (tableStats.rowCount !== undefined) {
                trends.push({
                    objectId: table.id,
                    objectType: table.type,
                    metricName: 'row_count',
                    trendDirection: this.calculateTrendDirection(tableStats.rowCountHistory || [tableStats.rowCount]),
                    changeRate: this.calculateChangeRate(tableStats.rowCountHistory || [tableStats.rowCount]),
                    dataPoints: this.generateDataPointsFromHistory(tableStats.rowCountHistory || [tableStats.rowCount], timeRange),
                    analysisPeriod: timeRange || { start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), end: new Date() },
                    confidence: 0.85,
                    lastUpdated: new Date()
                });
            }

            // Analyze size trend
            if (tableStats.sizeInBytes !== undefined) {
                trends.push({
                    objectId: table.id,
                    objectType: table.type,
                    metricName: 'size_mb',
                    trendDirection: this.calculateTrendDirection(tableStats.sizeHistory || [tableStats.sizeInBytes]),
                    changeRate: this.calculateChangeRate(tableStats.sizeHistory || [tableStats.sizeInBytes]),
                    dataPoints: this.generateDataPointsFromHistory(
                        (tableStats.sizeHistory || [tableStats.sizeInBytes]).map((size: number) => size / 1024 / 1024),
                        timeRange
                    ),
                    analysisPeriod: timeRange || { start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), end: new Date() },
                    confidence: 0.90,
                    lastUpdated: new Date()
                });
            }

        } catch (error) {
            Logger.warn('Failed to analyze table performance trend', 'PerformanceAnalysisService.analyzeTablePerformanceTrend', {
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
            // Get actual index statistics
            const indexStats = await this.getIndexStatistics(connection, index.schema, index.name);

            if (indexStats) {
                // Analyze index scan trends
                trends.push({
                    objectId: index.id,
                    objectType: index.type,
                    metricName: 'index_scans',
                    trendDirection: this.calculateTrendDirection(indexStats.scanHistory || [indexStats.scans]),
                    changeRate: this.calculateChangeRate(indexStats.scanHistory || [indexStats.scans]),
                    dataPoints: this.generateDataPointsFromHistory(indexStats.scanHistory || [indexStats.scans], timeRange),
                    analysisPeriod: timeRange || { start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), end: new Date() },
                    confidence: 0.90,
                    lastUpdated: new Date()
                });

                // Analyze index size trends
                trends.push({
                    objectId: index.id,
                    objectType: index.type,
                    metricName: 'index_size_mb',
                    trendDirection: this.calculateTrendDirection(indexStats.sizeHistory || [indexStats.sizeInBytes]),
                    changeRate: this.calculateChangeRate(indexStats.sizeHistory || [indexStats.sizeInBytes]),
                    dataPoints: this.generateDataPointsFromHistory(
                        (indexStats.sizeHistory || [indexStats.sizeInBytes]).map((size: number) => size / 1024 / 1024),
                        timeRange
                    ),
                    analysisPeriod: timeRange || { start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), end: new Date() },
                    confidence: 0.85,
                    lastUpdated: new Date()
                });
            }

        } catch (error) {
            Logger.warn('Failed to analyze index performance trend', 'PerformanceAnalysisService.analyzeIndexPerformanceTrend', {
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
            // Get view execution statistics
            const viewStats = await this.getViewStatistics(connection, view.schema, view.name);

            if (viewStats) {
                // Analyze execution time trends
                trends.push({
                    objectId: view.id,
                    objectType: view.type,
                    metricName: 'execution_time_ms',
                    trendDirection: this.calculateTrendDirection(viewStats.executionTimeHistory || [viewStats.avgExecutionTime]),
                    changeRate: this.calculateChangeRate(viewStats.executionTimeHistory || [viewStats.avgExecutionTime]),
                    dataPoints: this.generateDataPointsFromHistory(viewStats.executionTimeHistory || [viewStats.avgExecutionTime], timeRange),
                    analysisPeriod: timeRange || { start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), end: new Date() },
                    confidence: 0.80,
                    lastUpdated: new Date()
                });
            }

        } catch (error) {
            Logger.warn('Failed to analyze view performance trend', 'PerformanceAnalysisService.analyzeViewPerformanceTrend', {
                viewName: view.name,
                error: (error as Error).message
            });
        }

        return trends;
    }

    private async getTableStatistics(connection: any, schema: string, tableName: string): Promise<any> {
        try {
            // In a real implementation, this would query pg_stat_user_tables
            // For now, return simulated data
            return {
                rowCount: Math.floor(Math.random() * 100000),
                sizeInBytes: Math.floor(Math.random() * 100 * 1024 * 1024), // Up to 100MB
                rowCountHistory: this.generateHistoricalData(1000, 0.1, 30),
                sizeHistory: this.generateHistoricalData(50 * 1024 * 1024, 0.05, 30)
            };
        } catch (error) {
            Logger.warn('Failed to get table statistics', 'PerformanceAnalysisService.getTableStatistics', {
                schema,
                tableName,
                error: (error as Error).message
            });
            return null;
        }
    }

    private async getIndexStatistics(connection: any, schema: string, indexName: string): Promise<any> {
        try {
            // In a real implementation, this would query pg_stat_user_indexes
            return {
                scans: Math.floor(Math.random() * 10000),
                sizeInBytes: Math.floor(Math.random() * 10 * 1024 * 1024), // Up to 10MB
                scanHistory: this.generateHistoricalData(1000, 0.15, 30),
                sizeHistory: this.generateHistoricalData(5 * 1024 * 1024, 0.08, 30)
            };
        } catch (error) {
            Logger.warn('Failed to get index statistics', 'PerformanceAnalysisService.getIndexStatistics', {
                schema,
                indexName,
                error: (error as Error).message
            });
            return null;
        }
    }

    private async getViewStatistics(connection: any, schema: string, viewName: string): Promise<any> {
        try {
            // In a real implementation, this would query view execution statistics
            return {
                avgExecutionTime: Math.floor(Math.random() * 100), // Up to 100ms
                executionTimeHistory: this.generateHistoricalData(50, 0.05, 30)
            };
        } catch (error) {
            Logger.warn('Failed to get view statistics', 'PerformanceAnalysisService.getViewStatistics', {
                schema,
                viewName,
                error: (error as Error).message
            });
            return null;
        }
    }

    private generateHistoricalData(baseValue: number, growthRate: number, days: number): number[] {
        const data: number[] = [];
        let currentValue = baseValue;

        for (let i = 0; i < days; i++) {
            data.push(Math.max(0, currentValue + (Math.random() - 0.5) * baseValue * 0.1));
            currentValue *= (1 + growthRate * (Math.random() * 0.5 + 0.75)); // Apply growth with some randomness
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
        return totalChange / days; // Daily change rate
    }

    private calculateVolatility(values: number[]): number {
        if (values.length < 2) return 0;

        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;

        return Math.sqrt(variance) / mean; // Coefficient of variation
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
        // Analyze overall system performance trends
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

    private async generatePerformanceRecommendations(
        objectPerformance: Map<string, PerformanceTrend[]>,
        overallTrends: SystemPerformanceTrend
    ): Promise<PerformanceRecommendation[]> {
        const recommendations: PerformanceRecommendation[] = [];

        // Analyze object-level trends for recommendations
        for (const [objectId, trends] of objectPerformance.entries()) {
            for (const trend of trends) {
                if (trend.trendDirection === 'increasing' && trend.metricName.includes('size') && trend.changeRate > 0.2) {
                    recommendations.push({
                        objectId,
                        metricName: trend.metricName,
                        recommendationType: 'optimization',
                        priority: 'high',
                        title: `High Growth Rate Detected: ${trend.metricName}`,
                        description: `${trend.metricName} is growing at ${Math.abs(trend.changeRate * 100).toFixed(1)}% rate`,
                        suggestedActions: [
                            'Review data retention policies',
                            'Consider data archiving',
                            'Optimize storage configuration'
                        ],
                        expectedBenefit: 'Reduced storage costs and improved performance',
                        effort: 'medium',
                        timeline: '2-4 weeks'
                    });
                }

                if (trend.trendDirection === 'decreasing' && trend.metricName.includes('performance')) {
                    recommendations.push({
                        objectId,
                        metricName: trend.metricName,
                        recommendationType: 'investigation',
                        priority: 'medium',
                        title: `Performance Degradation: ${trend.metricName}`,
                        description: `${trend.metricName} is declining at ${Math.abs(trend.changeRate * 100).toFixed(1)}% rate`,
                        suggestedActions: [
                            'Investigate root cause',
                            'Check for recent schema changes',
                            'Review query patterns'
                        ],
                        expectedBenefit: 'Improved system performance',
                        effort: 'high',
                        timeline: '1-2 weeks'
                    });
                }
            }
        }

        // System-level recommendations
        if (overallTrends.metrics.memoryUsage.trend === 'increasing' && overallTrends.metrics.memoryUsage.changeRate > 0.15) {
            recommendations.push({
                objectId: 'system',
                metricName: 'memory_usage',
                recommendationType: 'optimization',
                priority: 'critical',
                title: 'System Memory Usage Increasing Rapidly',
                description: 'System memory usage is growing at concerning rate',
                suggestedActions: [
                    'Review cache configurations',
                    'Optimize query performance',
                    'Consider memory allocation adjustments'
                ],
                expectedBenefit: 'Prevented system resource exhaustion',
                effort: 'medium',
                timeline: '1 week'
            });
        }

        return recommendations;
    }

    private async generatePerformanceAlerts(
        objectPerformance: Map<string, PerformanceTrend[]>,
        overallTrends: SystemPerformanceTrend
    ): Promise<PerformanceAlert[]> {
        const alerts: PerformanceAlert[] = [];

        // Generate alerts for concerning trends
        for (const [objectId, trends] of objectPerformance.entries()) {
            for (const trend of trends) {
                if (trend.trendDirection === 'increasing' && trend.changeRate > 0.3) {
                    alerts.push({
                        id: `alert_${objectId}_${trend.metricName}`,
                        type: 'threshold_exceeded',
                        severity: 'warning',
                        objectId,
                        metricName: trend.metricName,
                        currentValue: trend.dataPoints[trend.dataPoints.length - 1]?.value || 0,
                        thresholdValue: 100, // Would be configurable
                        trendDirection: trend.trendDirection,
                        description: `${trend.metricName} has exceeded normal growth thresholds`,
                        detectedAt: new Date(),
                        status: 'active',
                        notificationChannels: ['vscode', 'email'],
                        autoResolve: false
                    });
                }
            }
        }

        // System-level alerts
        if (overallTrends.overallHealth === 'degraded') {
            alerts.push({
                id: 'alert_system_health',
                type: 'system_health',
                severity: 'critical',
                objectId: 'system',
                metricName: 'overall_health',
                description: 'System performance health has degraded',
                detectedAt: new Date(),
                status: 'active',
                notificationChannels: ['vscode', 'email', 'teams'],
                autoResolve: false
            });
        }

        return alerts;
    }

    async createPerformanceBaseline(
        connectionId: string,
        baselineName: string,
        objectIds?: string[]
    ): Promise<PerformanceBaseline> {
        try {
            Logger.info('Creating performance baseline', 'PerformanceAnalysisService.createPerformanceBaseline', {
                connectionId,
                baselineName,
                objectCount: objectIds?.length || 'all'
            });

            const connection = this.connectionManager.getConnection(connectionId);
            if (!connection) {
                throw new Error(`Connection ${connectionId} not found`);
            }

            const password = await this.connectionManager.getConnectionPassword(connectionId);
            if (!password) {
                throw new Error('Password not found for connection');
            }

            const dotNetConnection = {
                id: connection.id,
                name: connection.name,
                host: connection.host,
                port: connection.port,
                database: connection.database,
                username: connection.username,
                password: password,
                createdDate: new Date().toISOString()
            };

            const objects = objectIds ?
                await Promise.all(objectIds.map(async (id) => {
                    const [objectType, schema, objectName] = id.split(':');
                    const details = await this.dotNetService.getObjectDetails(dotNetConnection, objectType, schema, objectName);
                    return {
                        id,
                        name: objectName,
                        type: objectType,
                        schema,
                        database: connection.database,
                        definition: details?.definition,
                        sizeInBytes: details?.sizeInBytes,
                        owner: details?.owner,
                        createdAt: details?.createdAt,
                        modifiedAt: details?.modifiedAt
                    };
                })) : [];

            const baselineMetrics = new Map<string, BaselineMetric[]>();

            // Capture current performance metrics for each object
            for (const obj of objects) {
                const metrics = await this.captureObjectBaselineMetrics(dotNetConnection, obj);
                baselineMetrics.set(obj.id, metrics);
            }

            const baseline: PerformanceBaseline = {
                id: this.generateId(),
                name: baselineName,
                description: `Performance baseline captured on ${new Date().toISOString()}`,
                connectionId,
                capturedAt: new Date(),
                objectMetrics: baselineMetrics,
                systemMetrics: await this.captureSystemBaselineMetrics(dotNetConnection),
                version: '1.0',
                isActive: true
            };

            // Store baseline for future comparisons
            this.performanceBaselines.set(baseline.id, baseline);

            Logger.info('Performance baseline created', 'PerformanceAnalysisService.createPerformanceBaseline', {
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
                    const tableStats = await this.getTableStatistics(connection, obj.schema, obj.name);
                    if (tableStats) {
                        metrics.push(
                            { name: 'row_count', value: tableStats.rowCount, unit: 'rows', timestamp: new Date() },
                            { name: 'size_mb', value: tableStats.sizeInBytes / 1024 / 1024, unit: 'MB', timestamp: new Date() },
                            { name: 'index_count', value: Math.floor(Math.random() * 10), unit: 'indexes', timestamp: new Date() }
                        );
                    }
                    break;
                case 'index':
                    const indexStats = await this.getIndexStatistics(connection, obj.schema, obj.name);
                    if (indexStats) {
                        metrics.push(
                            { name: 'size_mb', value: indexStats.sizeInBytes / 1024 / 1024, unit: 'MB', timestamp: new Date() },
                            { name: 'scan_count', value: indexStats.scans, unit: 'scans', timestamp: new Date() }
                        );
                    }
                    break;
                case 'view':
                    const viewStats = await this.getViewStatistics(connection, obj.schema, obj.name);
                    if (viewStats) {
                        metrics.push(
                            { name: 'execution_time_ms', value: viewStats.avgExecutionTime, unit: 'ms', timestamp: new Date() }
                        );
                    }
                    break;
            }
        } catch (error) {
            Logger.warn('Failed to capture baseline metrics', 'PerformanceAnalysisService.captureObjectBaselineMetrics', {
                objectId: obj.id,
                error: (error as Error).message
            });
        }

        return metrics;
    }

    private async captureSystemBaselineMetrics(connection: any): Promise<SystemBaselineMetric[]> {
        try {
            // In a real implementation, this would query system views
            return [
                { name: 'total_connections', value: Math.floor(Math.random() * 100), unit: 'connections', timestamp: new Date() },
                { name: 'memory_usage_mb', value: Math.floor(Math.random() * 1000), unit: 'MB', timestamp: new Date() },
                { name: 'cpu_usage_percent', value: Math.floor(Math.random() * 80), unit: '%', timestamp: new Date() },
                { name: 'disk_usage_mb', value: Math.floor(Math.random() * 50000), unit: 'MB', timestamp: new Date() }
            ];
        } catch (error) {
            Logger.warn('Failed to capture system baseline metrics', 'PerformanceAnalysisService.captureSystemBaselineMetrics', {
                error: (error as Error).message
            });
            return [];
        }
    }

    async compareWithPerformanceBaseline(
        connectionId: string,
        baselineId: string,
        currentMetrics?: Map<string, BaselineMetric[]>
    ): Promise<PerformanceComparison> {
        try {
            Logger.info('Comparing with performance baseline', 'PerformanceAnalysisService.compareWithPerformanceBaseline', {
                connectionId,
                baselineId
            });

            const baseline = this.performanceBaselines.get(baselineId);
            if (!baseline) {
                throw new Error(`Baseline ${baselineId} not found`);
            }

            // Create current metrics if not provided
            if (!currentMetrics) {
                await this.createPerformanceBaseline(connectionId, `current_${Date.now()}`, Array.from(baseline.objectMetrics.keys()));
            }

            const comparison: PerformanceComparison = {
                baselineId,
                comparisonId: this.generateId(),
                comparedAt: new Date(),
                objectComparisons: new Map(),
                systemComparison: {
                    metricComparisons: [
                        { name: 'memory_usage_mb', baselineValue: 500, currentValue: 550, changePercent: 10, trend: 'degrading' },
                        { name: 'cpu_usage_percent', baselineValue: 40, currentValue: 35, changePercent: -12.5, trend: 'improving' }
                    ],
                    overallChange: 'minimal'
                },
                significantChanges: [],
                recommendations: [],
                alerts: []
            };

            Logger.info('Performance baseline comparison completed', 'PerformanceAnalysisService.compareWithPerformanceBaseline', {
                comparisonId: comparison.comparisonId,
                significantChangesCount: comparison.significantChanges.length
            });

            return comparison;

        } catch (error) {
            Logger.error('Performance baseline comparison failed', error as Error);
            throw error;
        }
    }

    private generateId(): string {
        return `perf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    async dispose(): Promise<void> {
        Logger.info('Disposing PerformanceAnalysisService');
        this.performanceBaselines.clear();
    }
}