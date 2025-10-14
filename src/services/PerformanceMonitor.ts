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


export class PerformanceMonitor {
    private static instance: PerformanceMonitor;
    private metrics: Map<string, PerformanceMetrics[]> = new Map();
    private maxMetricsPerOperation = 1000;

    private constructor() { }

    static getInstance(): PerformanceMonitor {
        if (!PerformanceMonitor.instance) {
            PerformanceMonitor.instance = new PerformanceMonitor();
        }
        return PerformanceMonitor.instance;
    }

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
    // System metrics removed - not used by any components

    // Performance recommendations removed - not used by any components

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

    dispose(): void {
        this.metrics.clear();
        Logger.info('PerformanceMonitor disposed', 'dispose');
    }
}