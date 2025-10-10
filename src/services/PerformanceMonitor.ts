import { Logger } from '@/utils/Logger';

export interface PerformanceMetrics {
    operationName: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    success: boolean;
    errorMessage?: string | undefined;
    metadata?: Record<string, any> | undefined;
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

export interface SystemMetrics {
    memoryUsage: NodeJS.MemoryUsage;
    uptime: number;
    timestamp: number;
}

export class PerformanceMonitor {
    private static instance: PerformanceMonitor;
    private metrics: Map<string, PerformanceMetrics[]> = new Map();
    private systemMetricsHistory: SystemMetrics[] = [];
    private maxMetricsPerOperation = 1000;
    private maxSystemMetricsHistory = 100;

    private constructor() {
        this.startSystemMonitoring();
    }

    static getInstance(): PerformanceMonitor {
        if (!PerformanceMonitor.instance) {
            PerformanceMonitor.instance = new PerformanceMonitor();
        }
        return PerformanceMonitor.instance;
    }

    /**
     * Starts monitoring a performance operation
     */
    startOperation(
        operationName: string,
        metadata?: Record<string, any>
    ): string {
        const operationId = `${operationName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const metric: PerformanceMetrics = {
            operationName,
            startTime: Date.now(),
            success: false,
            metadata
        };

        if (!this.metrics.has(operationName)) {
            this.metrics.set(operationName, []);
        }

        this.metrics.get(operationName)!.push(metric);

        // Limit stored metrics
        const operationMetrics = this.metrics.get(operationName)!;
        if (operationMetrics.length > this.maxMetricsPerOperation) {
            operationMetrics.splice(0, operationMetrics.length - this.maxMetricsPerOperation);
        }

        Logger.debug('Performance monitoring started', 'startOperation', {
            operationId,
            operationName
        });

        return operationId;
    }

    /**
     * Ends monitoring a performance operation
     */
    endOperation(
        operationId: string,
        success: boolean = true,
        errorMessage?: string
    ): void {
        // Find the operation by ID (simplified - in real implementation would parse ID)
        const operationName = operationId.split('-')[0];
        const operationMetrics = this.metrics.get(operationName);

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

    /**
     * Gets aggregated metrics for an operation
     */
    getAggregatedMetrics(operationName: string): AggregatedMetrics | null {
        const operationMetrics = this.metrics.get(operationName);
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
            trend: this.calculateTrend(operationMetrics.slice(-10)) // Last 10 executions
        };

        return aggregated;
    }

    /**
     * Gets all aggregated metrics
     */
    getAllAggregatedMetrics(): AggregatedMetrics[] {
        const allMetrics: AggregatedMetrics[] = [];

        for (const operationName of this.metrics.keys()) {
            const aggregated = this.getAggregatedMetrics(operationName);
            if (aggregated) {
                allMetrics.push(aggregated);
            }
        }

        return allMetrics.sort((a, b) => b.lastExecuted - a.lastExecuted);
    }

    /**
     * Gets current system metrics
     */
    getCurrentSystemMetrics(): SystemMetrics {
        return {
            memoryUsage: process.memoryUsage(),
            uptime: process.uptime(),
            timestamp: Date.now()
        };
    }

    /**
     * Gets system metrics history
     */
    getSystemMetricsHistory(): SystemMetrics[] {
        return [...this.systemMetricsHistory];
    }

    /**
     * Gets performance recommendations
     */
    getPerformanceRecommendations(): Array<{
        operation: string;
        issue: string;
        recommendation: string;
        priority: 'low' | 'medium' | 'high';
    }> {
        const recommendations: Array<{
            operation: string;
            issue: string;
            recommendation: string;
            priority: 'low' | 'medium' | 'high';
        }> = [];

        const allMetrics = this.getAllAggregatedMetrics();

        for (const metric of allMetrics) {
            // Check for slow operations
            if (metric.averageDuration > 1000) { // Slower than 1 second
                recommendations.push({
                    operation: metric.operationName,
                    issue: `Average execution time is ${metric.averageDuration.toFixed(2)}ms`,
                    recommendation: 'Consider optimizing database queries or implementing caching',
                    priority: metric.averageDuration > 5000 ? 'high' : 'medium'
                });
            }

            // Check for low success rate
            if (metric.successRate < 90) {
                recommendations.push({
                    operation: metric.operationName,
                    issue: `Success rate is only ${metric.successRate.toFixed(1)}%`,
                    recommendation: 'Review error handling and implement retry mechanisms',
                    priority: metric.successRate < 70 ? 'high' : 'medium'
                });
            }

            // Check for degrading performance
            if (metric.trend === 'degrading') {
                recommendations.push({
                    operation: metric.operationName,
                    issue: 'Performance trend is degrading',
                    recommendation: 'Investigate root cause and optimize operation',
                    priority: 'high'
                });
            }
        }

        return recommendations;
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

    private startSystemMonitoring(): void {
        // Record system metrics every 30 seconds
        setInterval(() => {
            const systemMetrics: SystemMetrics = {
                memoryUsage: process.memoryUsage(),
                uptime: process.uptime(),
                timestamp: Date.now()
            };

            this.systemMetricsHistory.push(systemMetrics);

            // Limit history size
            if (this.systemMetricsHistory.length > this.maxSystemMetricsHistory) {
                this.systemMetricsHistory.splice(0, this.systemMetricsHistory.length - this.maxSystemMetricsHistory);
            }
        }, 30000);

        Logger.info('Performance monitoring started', 'startSystemMonitoring');
    }

    /**
     * Exports performance data for analysis
     */
    exportPerformanceData(): {
        metrics: Record<string, AggregatedMetrics>;
        systemHistory: SystemMetrics[];
        recommendations: Array<{
            operation: string;
            issue: string;
            recommendation: string;
            priority: string;
        }>;
        exportTimestamp: string;
    } {
        const aggregatedMetrics: Record<string, AggregatedMetrics> = {};
        this.getAllAggregatedMetrics().forEach(metric => {
            aggregatedMetrics[metric.operationName] = metric;
        });

        return {
            metrics: aggregatedMetrics,
            systemHistory: this.systemMetricsHistory,
            recommendations: this.getPerformanceRecommendations(),
            exportTimestamp: new Date().toISOString()
        };
    }

    /**
     * Clears all performance metrics
     */
    clearMetrics(): void {
        this.metrics.clear();
        this.systemMetricsHistory.length = 0;
        Logger.info('Performance metrics cleared', 'clearMetrics');
    }

    dispose(): void {
        this.metrics.clear();
        this.systemMetricsHistory.length = 0;
        Logger.info('PerformanceMonitor disposed', 'dispose');
    }
}