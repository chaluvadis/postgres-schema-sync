import { getUUId } from '@/utils/helper';
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
        const operationId = `${operationName}-${getUUId()}`;

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
    dispose(): void {
        this.metrics.clear();
        Logger.info('PerformanceMonitor disposed', 'dispose');
    }
}